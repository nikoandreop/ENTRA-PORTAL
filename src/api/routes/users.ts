import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

export const userRouter = Router({ mergeParams: true });

const userSearchSchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  accountEnabled: z.enum(['true', 'false']).optional(),
  mfaEnabled: z.enum(['true', 'false']).optional(),
  riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
  page: z.string().default('1'),
  pageSize: z.string().default('50'),
  sortBy: z.string().default('display_name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

userRouter.use(authenticate, requireTenantAccess);

userRouter.get('/', authorize('users:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const query = userSearchSchema.parse(req.query);
    const offset = (Number(query.page) - 1) * Number(query.pageSize);

    let sql = 'SELECT * FROM entra_users WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (query.search) {
      sql += ' AND (display_name LIKE ? OR user_principal_name LIKE ? OR mail LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }
    if (query.department) { sql += ' AND department = ?'; params.push(query.department); }
    if (query.accountEnabled !== undefined) { sql += ' AND account_enabled = ?'; params.push(query.accountEnabled === 'true' ? 1 : 0); }
    if (query.mfaEnabled !== undefined) { sql += ' AND mfa_enabled = ?'; params.push(query.mfaEnabled === 'true' ? 1 : 0); }
    if (query.riskLevel) { sql += ' AND risk_level = ?'; params.push(query.riskLevel); }

    const allowedSorts = ['display_name', 'user_principal_name', 'department', 'last_sign_in', 'risk_level'];
    const sortBy = allowedSorts.includes(query.sortBy) ? query.sortBy : 'display_name';
    sql += ` ORDER BY ${sortBy} ${query.sortOrder}`;

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' LIMIT ? OFFSET ?';
    params.push(Number(query.pageSize), offset);

    const users = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: users.map((u: any) => ({
        id: u.id,
        tenantId: u.tenant_id,
        entraObjectId: u.entra_object_id,
        displayName: u.display_name,
        userPrincipalName: u.user_principal_name,
        mail: u.mail,
        jobTitle: u.job_title,
        department: u.department,
        accountEnabled: !!u.account_enabled,
        mfaEnabled: !!u.mfa_enabled,
        mfaMethods: JSON.parse(u.mfa_methods),
        assignedLicenses: JSON.parse(u.assigned_licenses),
        lastSignIn: u.last_sign_in,
        riskLevel: u.risk_level,
        syncedAt: u.synced_at,
      })),
      pagination: {
        page: Number(query.page),
        pageSize: Number(query.pageSize),
        totalItems: total,
        totalPages: Math.ceil(total / Number(query.pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

userRouter.get('/stats', authorize('users:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;

    const total = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ?').get(tenantId) as any).c;
    const enabled = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ? AND account_enabled = 1').get(tenantId) as any).c;
    const mfaEnabled = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ? AND mfa_enabled = 1').get(tenantId) as any).c;
    const atRisk = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ? AND risk_level IN (\'medium\', \'high\', \'critical\')').get(tenantId) as any).c;

    const departments = db.prepare(
      'SELECT department, COUNT(*) as count FROM entra_users WHERE tenant_id = ? AND department IS NOT NULL GROUP BY department ORDER BY count DESC LIMIT 10'
    ).all(tenantId);

    const riskBreakdown = db.prepare(
      'SELECT risk_level, COUNT(*) as count FROM entra_users WHERE tenant_id = ? GROUP BY risk_level'
    ).all(tenantId);

    res.json({
      success: true,
      data: {
        total,
        enabled,
        disabled: total - enabled,
        mfaEnabled,
        mfaDisabled: total - mfaEnabled,
        atRisk,
        departments,
        riskBreakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

userRouter.get('/:userId', authorize('users:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM entra_users WHERE id = ? AND tenant_id = ?').get(req.params.userId, req.params.tenantId) as any;
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    res.json({
      success: true,
      data: {
        id: user.id,
        tenantId: user.tenant_id,
        entraObjectId: user.entra_object_id,
        displayName: user.display_name,
        userPrincipalName: user.user_principal_name,
        mail: user.mail,
        jobTitle: user.job_title,
        department: user.department,
        accountEnabled: !!user.account_enabled,
        mfaEnabled: !!user.mfa_enabled,
        mfaMethods: JSON.parse(user.mfa_methods),
        assignedLicenses: JSON.parse(user.assigned_licenses),
        lastSignIn: user.last_sign_in,
        riskLevel: user.risk_level,
        createdDateTime: user.created_date_time,
        syncedAt: user.synced_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
