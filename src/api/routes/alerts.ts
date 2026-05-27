import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, queryCount, execute } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { auditFromRequest } from '../services/audit.js';

export const alertRouter = Router({ mergeParams: true });

alertRouter.use(authenticate, requireTenantAccess);

alertRouter.get('/', authorize('alerts:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { severity, status, type, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM security_alerts WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (severity) { sql += ` AND severity = $${++paramIdx}`; params.push(severity); }
    if (status) { sql += ` AND status = $${++paramIdx}`; params.push(status); }
    if (type) { sql += ` AND type = $${++paramIdx}`; params.push(type); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY detected_at DESC LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const alerts = await queryAll(sql, params);

    res.json({
      success: true,
      data: alerts.map((a: any) => ({
        id: a.id,
        tenantId: a.tenant_id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        affectedResources: typeof a.affected_resources === 'string' ? JSON.parse(a.affected_resources) : a.affected_resources,
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

alertRouter.patch('/:alertId/acknowledge', authorize('alerts:acknowledge'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await queryOne(
      'SELECT * FROM security_alerts WHERE id = $1 AND tenant_id = $2',
      [req.params.alertId, req.params.tenantId],
    );
    if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    await execute(
      `UPDATE security_alerts SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1 WHERE id = $2`,
      [req.user!.sub, req.params.alertId],
    );

    await auditFromRequest(req, 'alert', 'alert.acknowledged', {
      targetResources: [req.params.alertId],
      details: { alertTitle: alert.title, severity: alert.severity },
    });

    res.json({ success: true, data: { message: 'Alert acknowledged' } });
  } catch (err) {
    next(err);
  }
});

alertRouter.patch('/:alertId/resolve', authorize('alerts:acknowledge'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await queryOne(
      'SELECT * FROM security_alerts WHERE id = $1 AND tenant_id = $2',
      [req.params.alertId, req.params.tenantId],
    );
    if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    await execute(`UPDATE security_alerts SET status = 'resolved' WHERE id = $1`, [req.params.alertId]);

    await auditFromRequest(req, 'alert', 'alert.resolved', {
      targetResources: [req.params.alertId],
      details: { alertTitle: alert.title, severity: alert.severity },
    });

    res.json({ success: true, data: { message: 'Alert resolved' } });
  } catch (err) {
    next(err);
  }
});

alertRouter.get('/summary', authorize('alerts:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;

    const bySeverity = await queryAll(
      `SELECT severity, COUNT(*) as count FROM security_alerts WHERE tenant_id = $1 AND status != 'resolved' GROUP BY severity`,
      [tenantId],
    );

    const byType = await queryAll(
      `SELECT type, COUNT(*) as count FROM security_alerts WHERE tenant_id = $1 AND status != 'resolved' GROUP BY type`,
      [tenantId],
    );

    const byStatus = await queryAll(
      'SELECT status, COUNT(*) as count FROM security_alerts WHERE tenant_id = $1 GROUP BY status',
      [tenantId],
    );

    res.json({ success: true, data: { bySeverity, byType, byStatus } });
  } catch (err) {
    next(err);
  }
});
