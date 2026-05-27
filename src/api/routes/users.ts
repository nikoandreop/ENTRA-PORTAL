import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, queryAll, queryCount } from '../models/query.js';
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

userRouter.get('/', authorize('users:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const query = userSearchSchema.parse(req.query);
    const offset = (Number(query.page) - 1) * Number(query.pageSize);

    let sql = 'SELECT * FROM entra_users WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (query.search) {
      sql += ` AND (display_name LIKE $${++paramIdx} OR user_principal_name LIKE $${++paramIdx} OR mail LIKE $${++paramIdx})`;
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }
    if (query.department) { sql += ` AND department = $${++paramIdx}`; params.push(query.department); }
    if (query.accountEnabled !== undefined) { sql += ` AND account_enabled = $${++paramIdx}`; params.push(query.accountEnabled === 'true'); }
    if (query.mfaEnabled !== undefined) { sql += ` AND mfa_enabled = $${++paramIdx}`; params.push(query.mfaEnabled === 'true'); }
    if (query.riskLevel) { sql += ` AND risk_level = $${++paramIdx}`; params.push(query.riskLevel); }

    const allowedSorts = ['display_name', 'user_principal_name', 'department', 'last_sign_in', 'risk_level'];
    const sortBy = allowedSorts.includes(query.sortBy) ? query.sortBy : 'display_name';
    sql += ` ORDER BY ${sortBy} ${query.sortOrder}`;

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(query.pageSize), offset);

    const users = await queryAll(sql, params);

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
        mfaMethods: typeof u.mfa_methods === 'string' ? JSON.parse(u.mfa_methods) : u.mfa_methods,
        assignedLicenses: typeof u.assigned_licenses === 'string' ? JSON.parse(u.assigned_licenses) : u.assigned_licenses,
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

userRouter.get('/stats', authorize('users:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;

    const total = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1', [tenantId]);
    const enabled = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1 AND account_enabled = true', [tenantId]);
    const mfaEnabled = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1 AND mfa_enabled = true', [tenantId]);
    const atRisk = await queryCount(`SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1 AND risk_level IN ('medium', 'high', 'critical')`, [tenantId]);

    const departments = await queryAll(
      'SELECT department, COUNT(*) as count FROM entra_users WHERE tenant_id = $1 AND department IS NOT NULL GROUP BY department ORDER BY count DESC LIMIT 10',
      [tenantId],
    );

    const riskBreakdown = await queryAll(
      'SELECT risk_level, COUNT(*) as count FROM entra_users WHERE tenant_id = $1 GROUP BY risk_level',
      [tenantId],
    );

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

userRouter.get('/:userId', authorize('users:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne('SELECT * FROM entra_users WHERE id = $1 AND tenant_id = $2', [req.params.userId, req.params.tenantId]);
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
        mfaMethods: typeof user.mfa_methods === 'string' ? JSON.parse(user.mfa_methods) : user.mfa_methods,
        assignedLicenses: typeof user.assigned_licenses === 'string' ? JSON.parse(user.assigned_licenses) : user.assigned_licenses,
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
