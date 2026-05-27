import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../../shared/crypto/encryption.js';
import { DEFAULT_SYNC_INTERVAL_MINUTES, DEFAULT_RETENTION_DAYS } from '../../shared/constants/index.js';

export const tenantRouter = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'CHANGE-THIS-32-CHAR-ENCRYPTION-KEY!';

const tenantOnboardSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z.string().min(3).max(255),
  entraDirectoryId: z.string().uuid(),
  clientId: z.string().uuid(),
  clientSecret: z.string().min(1),
  adminConsent: z.literal(true, { errorMap: () => ({ message: 'Admin consent is required' }) }),
  enabledModules: z.array(z.enum(['users', 'groups', 'conditional-access', 'mfa', 'licenses', 'audit-logs', 'security-alerts'])).min(1),
});

const tenantUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  config: z.object({
    syncIntervalMinutes: z.number().min(5).max(1440).optional(),
    enabledModules: z.array(z.string()).optional(),
    retentionDays: z.number().min(30).max(730).optional(),
  }).optional(),
});

tenantRouter.use(authenticate);

tenantRouter.get('/', authorize('tenants:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { search, status, page = '1', pageSize = '25' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let query = 'SELECT t.*, COUNT(DISTINCT eu.id) as user_count, COUNT(DISTINCT eg.id) as group_count, COUNT(DISTINCT sa.id) as alert_count FROM tenants t LEFT JOIN entra_users eu ON eu.tenant_id = t.id LEFT JOIN entra_groups eg ON eg.tenant_id = t.id LEFT JOIN security_alerts sa ON sa.tenant_id = t.id AND sa.status = \'new\'';
    const params: any[] = [];
    const conditions: string[] = [];

    if (req.user!.role !== 'superadmin') {
      const accessibleTenants = req.user!.tenantAccess;
      if (!accessibleTenants.includes('*')) {
        conditions.push(`t.id IN (${accessibleTenants.map(() => '?').join(',')})`);
        params.push(...accessibleTenants);
      }
    }

    if (search) {
      conditions.push('(t.name LIKE ? OR t.domain LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY t.id ORDER BY t.name';

    const countQuery = `SELECT COUNT(*) as total FROM tenants t${conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''}`;
    const total = (db.prepare(countQuery).get(...params) as any).total;

    query += ' LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const tenants = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: tenants.map((t: any) => ({
        id: t.id,
        name: t.name,
        domain: t.domain,
        entraDirectoryId: t.entra_directory_id,
        status: t.status,
        agentStatus: t.agent_status,
        config: JSON.parse(t.config),
        userCount: t.user_count,
        groupCount: t.group_count,
        alertCount: t.alert_count,
        lastSyncAt: t.last_sync_at,
        createdAt: t.created_at,
      })),
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalItems: total,
        totalPages: Math.ceil(total / Number(pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.get('/:tenantId', authenticate, authorize('tenants:read'), requireTenantAccess, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.tenantId) as any;
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const userCount = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ?').get(tenant.id) as any).c;
    const groupCount = (db.prepare('SELECT COUNT(*) as c FROM entra_groups WHERE tenant_id = ?').get(tenant.id) as any).c;
    const alertCount = (db.prepare('SELECT COUNT(*) as c FROM security_alerts WHERE tenant_id = ? AND status = \'new\'').get(tenant.id) as any).c;

    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        entraDirectoryId: tenant.entra_directory_id,
        status: tenant.status,
        agentStatus: tenant.agent_status,
        config: JSON.parse(tenant.config),
        userCount,
        groupCount,
        alertCount,
        lastSyncAt: tenant.last_sync_at,
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/', authorize('tenants:onboard'), validate(tenantOnboardSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const data = req.body;
    const id = uuidv4();

    const existing = db.prepare('SELECT id FROM tenants WHERE domain = ? OR entra_directory_id = ?').get(data.domain, data.entraDirectoryId);
    if (existing) throw new AppError(409, 'TENANT_EXISTS', 'Tenant with this domain or directory ID already exists');

    const encryptedSecret = encrypt(data.clientSecret, ENCRYPTION_KEY);

    const config = {
      syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      enabledModules: data.enabledModules,
      alertThresholds: {
        maxFailedSignIns: 10,
        mfaDisabledWarning: true,
        staleAccountDays: 90,
        licenseUtilizationPercent: 90,
      },
      retentionDays: DEFAULT_RETENTION_DAYS,
    };

    db.prepare(
      'INSERT INTO tenants (id, name, domain, entra_directory_id, client_id, client_secret_encrypted, status, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.name, data.domain, data.entraDirectoryId, data.clientId, encryptedSecret, 'onboarding', JSON.stringify(config));

    logger.info('Tenant onboarded', { tenantId: id, domain: data.domain, by: req.user!.sub });

    res.status(201).json({
      success: true,
      data: { id, name: data.name, domain: data.domain, status: 'onboarding' },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.put('/:tenantId', authorize('tenants:write'), requireTenantAccess, validate(tenantUpdateSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.tenantId) as any;
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const updates: string[] = [];
    const params: any[] = [];

    if (req.body.name) { updates.push('name = ?'); params.push(req.body.name); }
    if (req.body.status) { updates.push('status = ?'); params.push(req.body.status); }
    if (req.body.config) {
      const existing = JSON.parse(tenant.config);
      const merged = { ...existing, ...req.body.config };
      updates.push('config = ?');
      params.push(JSON.stringify(merged));
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      params.push(req.params.tenantId);
      db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    logger.info('Tenant updated', { tenantId: req.params.tenantId, by: req.user!.sub });
    res.json({ success: true, data: { message: 'Tenant updated' } });
  } catch (err) {
    next(err);
  }
});

tenantRouter.delete('/:tenantId', authorize('tenants:write'), requireTenantAccess, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT id, status FROM tenants WHERE id = ?').get(req.params.tenantId) as any;
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    db.prepare('UPDATE tenants SET status = \'offboarding\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.tenantId);

    logger.info('Tenant offboarding initiated', { tenantId: req.params.tenantId, by: req.user!.sub });
    res.json({ success: true, data: { message: 'Tenant offboarding initiated' } });
  } catch (err) {
    next(err);
  }
});
