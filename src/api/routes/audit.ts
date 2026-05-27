import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';

export const auditRouter = Router({ mergeParams: true });

auditRouter.use(authenticate, requireTenantAccess);

auditRouter.get('/', authorize('audit:read'), (req: Request, res: Response, next: NextFunction) => {
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
