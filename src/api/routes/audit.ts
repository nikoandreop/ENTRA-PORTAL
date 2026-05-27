import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, queryCount } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';

export const auditRouter = Router({ mergeParams: true });

auditRouter.use(authenticate, requireTenantAccess);

// Entra-sourced audit logs (synced from Graph API via agent)
auditRouter.get('/entra', authorize('audit:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { category, source, startDate, endDate, search, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM audit_logs WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (category) { sql += ` AND category = $${++paramIdx}`; params.push(category); }
    if (source) { sql += ` AND source = $${++paramIdx}`; params.push(source); }
    if (startDate) { sql += ` AND activity_date_time >= $${++paramIdx}`; params.push(startDate); }
    if (endDate) { sql += ` AND activity_date_time <= $${++paramIdx}`; params.push(endDate); }
    if (search) {
      sql += ` AND (activity_display_name LIKE $${++paramIdx} OR initiated_by LIKE $${++paramIdx})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY activity_date_time DESC LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const logs = await queryAll(sql, params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        activityDateTime: l.activity_date_time,
        activityDisplayName: l.activity_display_name,
        category: l.category,
        initiatedBy: l.initiated_by,
        targetResources: typeof l.target_resources === 'string' ? JSON.parse(l.target_resources) : l.target_resources,
        result: l.result,
        source: l.source,
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

// Portal audit trail - tracks all operator actions for this tenant
auditRouter.get('/', authorize('audit:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { category, startDate, endDate, initiatedBy, result, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM portal_audit_log WHERE (tenant_id = $1 OR tenant_id IS NULL)';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (category) { sql += ` AND category = $${++paramIdx}`; params.push(category); }
    if (startDate) { sql += ` AND created_at >= $${++paramIdx}`; params.push(startDate); }
    if (endDate) { sql += ` AND created_at <= $${++paramIdx}`; params.push(endDate); }
    if (initiatedBy) { sql += ` AND initiated_by = $${++paramIdx}`; params.push(initiatedBy); }
    if (result) { sql += ` AND result = $${++paramIdx}`; params.push(result); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY created_at DESC LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const logs = await queryAll(sql, params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        category: l.category,
        action: l.action,
        initiatedBy: l.initiated_by,
        targetResources: typeof l.target_resources === 'string' ? JSON.parse(l.target_resources) : l.target_resources,
        result: l.result,
        details: l.details ? (typeof l.details === 'string' ? JSON.parse(l.details) : l.details) : null,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
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

// Global portal audit trail (superadmin/admin only)
auditRouter.get('/global', authorize('audit:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, startDate, endDate, initiatedBy, tenantId: filterTenantId, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT pal.*, t.name as tenant_name FROM portal_audit_log pal LEFT JOIN tenants t ON t.id = pal.tenant_id WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 0;

    if (category) { sql += ` AND pal.category = $${++paramIdx}`; params.push(category); }
    if (startDate) { sql += ` AND pal.created_at >= $${++paramIdx}`; params.push(startDate); }
    if (endDate) { sql += ` AND pal.created_at <= $${++paramIdx}`; params.push(endDate); }
    if (initiatedBy) { sql += ` AND pal.initiated_by = $${++paramIdx}`; params.push(initiatedBy); }
    if (filterTenantId) { sql += ` AND pal.tenant_id = $${++paramIdx}`; params.push(filterTenantId); }

    const countSql = sql.replace('SELECT pal.*, t.name as tenant_name', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY pal.created_at DESC LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const logs = await queryAll(sql, params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        tenantName: l.tenant_name,
        category: l.category,
        action: l.action,
        initiatedBy: l.initiated_by,
        targetResources: typeof l.target_resources === 'string' ? JSON.parse(l.target_resources) : l.target_resources,
        result: l.result,
        details: l.details ? (typeof l.details === 'string' ? JSON.parse(l.details) : l.details) : null,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
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
