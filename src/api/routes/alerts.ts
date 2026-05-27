import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { auditFromRequest } from '../services/audit.js';

export const alertRouter = Router({ mergeParams: true });

alertRouter.use(authenticate, requireTenantAccess);

alertRouter.get('/', authorize('alerts:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const { severity, status, type, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM security_alerts WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (severity) { sql += ' AND severity = ?'; params.push(severity); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const alerts = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: alerts.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        affectedResources: JSON.parse(a.affected_resources),
        status: a.status,
        detectedAt: a.detected_at,
        acknowledgedAt: a.acknowledged_at,
        acknowledgedBy: a.acknowledged_by,
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

alertRouter.patch('/:alertId/acknowledge', authorize('alerts:acknowledge'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alert = db.prepare(
      'SELECT * FROM security_alerts WHERE id = ? AND tenant_id = ?'
    ).get(req.params.alertId, req.params.tenantId) as any;
    if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    db.prepare(
      'UPDATE security_alerts SET status = \'acknowledged\', acknowledged_at = datetime(\'now\'), acknowledged_by = ? WHERE id = ?'
    ).run(req.user!.sub, req.params.alertId);

    auditFromRequest(req, 'alert', 'alert.acknowledged', {
      targetResources: [req.params.alertId],
      details: { alertTitle: alert.title, severity: alert.severity },
    });

    res.json({ success: true, data: { message: 'Alert acknowledged' } });
  } catch (err) {
    next(err);
  }
});

alertRouter.patch('/:alertId/resolve', authorize('alerts:acknowledge'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alert = db.prepare(
      'SELECT * FROM security_alerts WHERE id = ? AND tenant_id = ?'
    ).get(req.params.alertId, req.params.tenantId) as any;
    if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    db.prepare('UPDATE security_alerts SET status = \'resolved\' WHERE id = ?').run(req.params.alertId);

    auditFromRequest(req, 'alert', 'alert.resolved', {
      targetResources: [req.params.alertId],
      details: { alertTitle: alert.title, severity: alert.severity },
    });

    res.json({ success: true, data: { message: 'Alert resolved' } });
  } catch (err) {
    next(err);
  }
});

alertRouter.get('/summary', authorize('alerts:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;

    const bySeverity = db.prepare(
      'SELECT severity, COUNT(*) as count FROM security_alerts WHERE tenant_id = ? AND status != \'resolved\' GROUP BY severity'
    ).all(tenantId);

    const byType = db.prepare(
      'SELECT type, COUNT(*) as count FROM security_alerts WHERE tenant_id = ? AND status != \'resolved\' GROUP BY type'
    ).all(tenantId);

    const byStatus = db.prepare(
      'SELECT status, COUNT(*) as count FROM security_alerts WHERE tenant_id = ? GROUP BY status'
    ).all(tenantId);

    res.json({ success: true, data: { bySeverity, byType, byStatus } });
  } catch (err) {
    next(err);
  }
});
