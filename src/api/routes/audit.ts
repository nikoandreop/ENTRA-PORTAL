import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';

export const auditRouter = Router({ mergeParams: true });

auditRouter.use(authenticate, requireTenantAccess);

// Entra-sourced audit logs (synced from Graph API via agent)
auditRouter.get('/entra', authorize('audit:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const { category, source, startDate, endDate, search, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM audit_logs WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (source) { sql += ' AND source = ?'; params.push(source); }
    if (startDate) { sql += ' AND activity_date_time >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND activity_date_time <= ?'; params.push(endDate); }
    if (search) {
      sql += ' AND (activity_display_name LIKE ? OR initiated_by LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' ORDER BY activity_date_time DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const logs = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        activityDateTime: l.activity_date_time,
        activityDisplayName: l.activity_display_name,
        category: l.category,
        initiatedBy: l.initiated_by,
        targetResources: JSON.parse(l.target_resources),
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
auditRouter.get('/', authorize('audit:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const { category, startDate, endDate, initiatedBy, result, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM portal_audit_log WHERE (tenant_id = ? OR tenant_id IS NULL)';
    const params: any[] = [tenantId];

    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }
    if (initiatedBy) { sql += ' AND initiated_by = ?'; params.push(initiatedBy); }
    if (result) { sql += ' AND result = ?'; params.push(result); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const logs = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        category: l.category,
        action: l.action,
        initiatedBy: l.initiated_by,
        targetResources: JSON.parse(l.target_resources),
        result: l.result,
        details: l.details ? JSON.parse(l.details) : null,
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
auditRouter.get('/global', authorize('audit:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { category, startDate, endDate, initiatedBy, tenantId: filterTenantId, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT pal.*, t.name as tenant_name FROM portal_audit_log pal LEFT JOIN tenants t ON t.id = pal.tenant_id WHERE 1=1';
    const params: any[] = [];

    if (category) { sql += ' AND pal.category = ?'; params.push(category); }
    if (startDate) { sql += ' AND pal.created_at >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND pal.created_at <= ?'; params.push(endDate); }
    if (initiatedBy) { sql += ' AND pal.initiated_by = ?'; params.push(initiatedBy); }
    if (filterTenantId) { sql += ' AND pal.tenant_id = ?'; params.push(filterTenantId); }

    const countSql = sql.replace('SELECT pal.*, t.name as tenant_name', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' ORDER BY pal.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const logs = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        tenantId: l.tenant_id,
        tenantName: l.tenant_name,
        category: l.category,
        action: l.action,
        initiatedBy: l.initiated_by,
        targetResources: JSON.parse(l.target_resources),
        result: l.result,
        details: l.details ? JSON.parse(l.details) : null,
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
