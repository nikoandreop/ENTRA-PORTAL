import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/overview', authorize('tenants:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const tenantFilter = req.user!.role === 'superadmin' || req.user!.tenantAccess.includes('*')
      ? ''
      : ` WHERE id IN (${req.user!.tenantAccess.map(() => '?').join(',')})`;
    const filterParams = tenantFilter ? req.user!.tenantAccess.filter(a => a !== '*') : [];

    const tenantStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended,
        SUM(CASE WHEN agent_status = 'connected' THEN 1 ELSE 0 END) as agents_connected,
        SUM(CASE WHEN agent_status = 'disconnected' THEN 1 ELSE 0 END) as agents_disconnected
      FROM tenants${tenantFilter}
    `).get(...filterParams) as any;

    const userStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN account_enabled = 1 THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN mfa_enabled = 1 THEN 1 ELSE 0 END) as mfa_enabled,
        SUM(CASE WHEN risk_level IN ('medium', 'high', 'critical') THEN 1 ELSE 0 END) as at_risk
      FROM entra_users${tenantFilter ? ` WHERE tenant_id IN (SELECT id FROM tenants${tenantFilter})` : ''}
    `).get(...filterParams) as any;

    const alertStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_alerts,
        SUM(CASE WHEN severity = 'critical' AND status != 'resolved' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high' AND status != 'resolved' THEN 1 ELSE 0 END) as high
      FROM security_alerts${tenantFilter ? ` WHERE tenant_id IN (SELECT id FROM tenants${tenantFilter})` : ''}
    `).get(...filterParams) as any;

    const recentAlerts = db.prepare(`
      SELECT sa.*, t.name as tenant_name FROM security_alerts sa
      JOIN tenants t ON t.id = sa.tenant_id
      ${tenantFilter ? `WHERE sa.tenant_id IN (SELECT id FROM tenants${tenantFilter})` : ''}
      ORDER BY sa.detected_at DESC LIMIT 10
    `).all(...filterParams);

    res.json({
      success: true,
      data: {
        tenants: tenantStats,
        users: userStats,
        alerts: alertStats,
        recentAlerts: recentAlerts.map((a: any) => ({
          id: a.id,
          tenantId: a.tenant_id,
          tenantName: a.tenant_name,
          type: a.type,
          severity: a.severity,
          title: a.title,
          status: a.status,
          detectedAt: a.detected_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get('/compliance', authorize('tenants:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const tenants = db.prepare('SELECT id, name, domain FROM tenants WHERE status = \'active\'').all() as any[];

    const compliance = tenants.map((t: any) => {
      const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ?').get(t.id) as any).c;
      const mfaUsers = (db.prepare('SELECT COUNT(*) as c FROM entra_users WHERE tenant_id = ? AND mfa_enabled = 1').get(t.id) as any).c;
      const caEnabled = (db.prepare('SELECT COUNT(*) as c FROM conditional_access_policies WHERE tenant_id = ? AND state = \'enabled\'').get(t.id) as any).c;
      const openAlerts = (db.prepare('SELECT COUNT(*) as c FROM security_alerts WHERE tenant_id = ? AND status IN (\'new\', \'acknowledged\')').get(t.id) as any).c;

      const mfaRate = totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0;

      return {
        tenantId: t.id,
        tenantName: t.name,
        domain: t.domain,
        mfaCoverage: mfaRate,
        conditionalAccessPolicies: caEnabled,
        openAlerts,
        complianceScore: Math.max(0, Math.min(100, mfaRate - openAlerts * 2 + Math.min(caEnabled * 5, 20))),
      };
    });

    res.json({ success: true, data: compliance });
  } catch (err) {
    next(err);
  }
});
