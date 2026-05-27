import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { queryOne, queryAll, queryCount, execute } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../../shared/crypto/encryption.js';
import { DEFAULT_SYNC_INTERVAL_MINUTES, DEFAULT_RETENTION_DAYS } from '../../shared/constants/index.js';
import { auditFromRequest } from '../services/audit.js';
import { isConsentConfigured, getAdminConsentUrl, handleAdminConsentCallback } from '../services/tenant-consent.js';
import { getDb } from '../models/database.js';

export const tenantRouter = Router();

const consentSessions = new Map<string, { name: string; enabledModules: string[]; userId: string; createdAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of consentSessions) {
    if (now - session.createdAt > 600_000) consentSessions.delete(key);
  }
}, 60_000);

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

tenantRouter.get('/', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, status, page = '1', pageSize = '25' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let query = `SELECT t.*, COUNT(DISTINCT eu.id) as user_count, COUNT(DISTINCT eg.id) as group_count, COUNT(DISTINCT sa.id) as alert_count FROM tenants t LEFT JOIN entra_users eu ON eu.tenant_id = t.id LEFT JOIN entra_groups eg ON eg.tenant_id = t.id LEFT JOIN security_alerts sa ON sa.tenant_id = t.id AND sa.status = 'new'`;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIdx = 0;

    if (req.user!.role !== 'superadmin') {
      const accessibleTenants = req.user!.tenantAccess;
      if (!accessibleTenants.includes('*')) {
        const placeholders = accessibleTenants.map(() => `$${++paramIdx}`).join(',');
        conditions.push(`t.id IN (${placeholders})`);
        params.push(...accessibleTenants);
      }
    }

    if (search) {
      conditions.push(`(t.name LIKE $${++paramIdx} OR t.domain LIKE $${++paramIdx})`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push(`t.status = $${++paramIdx}`);
      params.push(status);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY t.id ORDER BY t.name';

    const countQuery = `SELECT COUNT(*) as total FROM tenants t${conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''}`;
    const total = await queryCount(countQuery, params);

    query += ` LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const tenants = await queryAll(query, params);

    res.json({
      success: true,
      data: tenants.map((t: any) => ({
        id: t.id,
        name: t.name,
        domain: t.domain,
        entraDirectoryId: t.entra_directory_id,
        status: t.status,
        agentStatus: t.agent_status,
        config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
        userCount: Number(t.user_count),
        groupCount: Number(t.group_count),
        alertCount: Number(t.alert_count),
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

tenantRouter.get('/:tenantId', authenticate, authorize('tenants:read'), requireTenantAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await queryOne('SELECT * FROM tenants WHERE id = $1', [req.params.tenantId]);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const userCount = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1', [tenant.id]);
    const groupCount = await queryCount('SELECT COUNT(*) as total FROM entra_groups WHERE tenant_id = $1', [tenant.id]);
    const alertCount = await queryCount(`SELECT COUNT(*) as total FROM security_alerts WHERE tenant_id = $1 AND status = 'new'`, [tenant.id]);

    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        entraDirectoryId: tenant.entra_directory_id,
        status: tenant.status,
        agentStatus: tenant.agent_status,
        config: typeof tenant.config === 'string' ? JSON.parse(tenant.config) : tenant.config,
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

tenantRouter.post('/', authorize('tenants:onboard'), validate(tenantOnboardSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    const id = uuidv4();

    const existing = await queryOne('SELECT id FROM tenants WHERE domain = $1 OR entra_directory_id = $2', [data.domain, data.entraDirectoryId]);
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

    await execute(
      'INSERT INTO tenants (id, name, domain, entra_directory_id, client_id, client_secret_encrypted, status, config) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, data.name, data.domain, data.entraDirectoryId, data.clientId, encryptedSecret, 'onboarding', JSON.stringify(config)],
    );

    await auditFromRequest(req, 'tenant', 'tenant.onboarded', {
      tenantId: id,
      targetResources: [id, data.domain],
      details: { name: data.name, domain: data.domain, enabledModules: data.enabledModules },
    });
    logger.info('Tenant onboarded', { tenantId: id, domain: data.domain, by: req.user!.sub });

    res.status(201).json({
      success: true,
      data: { id, name: data.name, domain: data.domain, status: 'onboarding' },
    });
  } catch (err) {
    next(err);
  }
});

tenantRouter.put('/:tenantId', authorize('tenants:write'), requireTenantAccess, validate(tenantUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await queryOne('SELECT * FROM tenants WHERE id = $1', [req.params.tenantId]);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const updates: string[] = [];
    const params: any[] = [];
    let paramIdx = 0;

    if (req.body.name) { updates.push(`name = $${++paramIdx}`); params.push(req.body.name); }
    if (req.body.status) { updates.push(`status = $${++paramIdx}`); params.push(req.body.status); }
    if (req.body.config) {
      const existing = typeof tenant.config === 'string' ? JSON.parse(tenant.config) : tenant.config;
      const merged = { ...existing, ...req.body.config };
      updates.push(`config = $${++paramIdx}`);
      params.push(JSON.stringify(merged));
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(req.params.tenantId);
      await execute(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${++paramIdx}`, params);
    }

    await auditFromRequest(req, 'tenant', 'tenant.updated', {
      tenantId: req.params.tenantId,
      targetResources: [req.params.tenantId],
      details: { changes: req.body },
    });
    logger.info('Tenant updated', { tenantId: req.params.tenantId, by: req.user!.sub });
    res.json({ success: true, data: { message: 'Tenant updated' } });
  } catch (err) {
    next(err);
  }
});

tenantRouter.delete('/:tenantId', authorize('tenants:write'), requireTenantAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await queryOne('SELECT id, status FROM tenants WHERE id = $1', [req.params.tenantId]);
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    await execute(`UPDATE tenants SET status = 'offboarding', updated_at = NOW() WHERE id = $1`, [req.params.tenantId]);

    await auditFromRequest(req, 'tenant', 'tenant.offboarding', {
      tenantId: req.params.tenantId,
      targetResources: [req.params.tenantId],
    });
    logger.info('Tenant offboarding initiated', { tenantId: req.params.tenantId, by: req.user!.sub });
    res.json({ success: true, data: { message: 'Tenant offboarding initiated' } });
  } catch (err) {
    next(err);
  }
});

// Admin consent flow for easy onboarding

tenantRouter.get('/consent/config', authenticate, (_req, res) => {
  res.json({ success: true, data: { enabled: isConsentConfigured() } });
});

tenantRouter.post('/consent/start', authenticate, authorize('tenants:onboard'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isConsentConfigured()) throw new AppError(400, 'CONSENT_NOT_CONFIGURED', 'MSP app registration not configured. Set MSP_CLIENT_ID and MSP_CLIENT_SECRET.');

    const { name, enabledModules } = req.body;
    if (!name) throw new AppError(400, 'MISSING_NAME', 'Tenant name is required');

    const state = uuidv4();
    const { url } = await getAdminConsentUrl(state);

    consentSessions.set(state, {
      name,
      enabledModules: enabledModules || ['users', 'groups', 'security-alerts'],
      userId: req.user!.sub,
      createdAt: Date.now(),
    });

    res.json({ success: true, data: { consentUrl: url, state } });
  } catch (err) { next(err); }
});

tenantRouter.post('/consent/complete', authenticate, authorize('tenants:onboard'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state, tenant: consentTenantId, admin_consent } = req.body;

    if (!state || !consentTenantId) throw new AppError(400, 'MISSING_PARAMS', 'State and tenant ID required');

    const session = consentSessions.get(state);
    if (!session) throw new AppError(400, 'INVALID_STATE', 'Invalid or expired consent session');
    consentSessions.delete(state);

    if (admin_consent !== 'True' && admin_consent !== true) {
      throw new AppError(400, 'CONSENT_DENIED', 'Admin consent was not granted');
    }

    const consentResult = await handleAdminConsentCallback(consentTenantId, true);

    const existing = await queryOne('SELECT id FROM tenants WHERE domain = $1 OR entra_directory_id = $2', [consentResult.domain, consentTenantId]);
    if (existing) throw new AppError(409, 'TENANT_EXISTS', 'This tenant is already onboarded');

    const mspClientId = process.env.MSP_CLIENT_ID || process.env.SSO_CLIENT_ID || '';
    const mspClientSecret = process.env.MSP_CLIENT_SECRET || process.env.SSO_CLIENT_SECRET || '';
    const encryptedSecret = encrypt(mspClientSecret, ENCRYPTION_KEY);

    const id = uuidv4();
    const config = {
      syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      enabledModules: session.enabledModules,
      alertThresholds: { maxFailedSignIns: 10, mfaDisabledWarning: true, staleAccountDays: 90, licenseUtilizationPercent: 90 },
      retentionDays: DEFAULT_RETENTION_DAYS,
    };

    await getDb().query(
      `INSERT INTO tenants (id, name, domain, entra_directory_id, client_id, client_secret_encrypted, status, config)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
      [id, session.name || consentResult.displayName, consentResult.domain, consentTenantId, mspClientId, encryptedSecret, JSON.stringify(config)],
    );

    await auditFromRequest(req, 'tenant', 'tenant.onboarded_via_consent', {
      tenantId: id,
      targetResources: [id, consentResult.domain],
      details: { name: consentResult.displayName, domain: consentResult.domain, method: 'admin_consent' },
    });

    logger.info('Tenant onboarded via admin consent', { tenantId: id, domain: consentResult.domain });

    res.status(201).json({
      success: true,
      data: {
        id,
        name: session.name || consentResult.displayName,
        domain: consentResult.domain,
        entraDirectoryId: consentTenantId,
        status: 'active',
      },
    });
  } catch (err) { next(err); }
});
