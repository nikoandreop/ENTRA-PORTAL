import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, queryCount } from '../models/query.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/overview', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isSuperOrWildcard = req.user!.role === 'superadmin' || req.user!.tenantAccess.includes('*');
    const filterParams = isSuperOrWildcard ? [] : req.user!.tenantAccess.filter(a => a !== '*');

    let tenantFilter = '';
    if (!isSuperOrWildcard && filterParams.length > 0) {
      const placeholders = filterParams.map((_, i) => `$${i + 1}`).join(',');
      tenantFilter = ` WHERE id IN (${placeholders})`;
    }

    const tenantStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended,
        SUM(CASE WHEN agent_status = 'connected' THEN 1 ELSE 0 END) as agents_connected,
        SUM(CASE WHEN agent_status = 'disconnected' THEN 1 ELSE 0 END) as agents_disconnected
      FROM tenants${tenantFilter}
    `, filterParams);

    let userFilterClause = '';
    if (!isSuperOrWildcard && filterParams.length > 0) {
      const placeholders = filterParams.map((_, i) => `$${i + 1}`).join(',');
      userFilterClause = ` WHERE tenant_id IN (SELECT id FROM tenants WHERE id IN (${placeholders}))`;
    }

    const userStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN account_enabled = true THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN mfa_enabled = true THEN 1 ELSE 0 END) as mfa_enabled,
        SUM(CASE WHEN risk_level IN ('medium', 'high', 'critical') THEN 1 ELSE 0 END) as at_risk
      FROM entra_users${userFilterClause}
    `, filterParams);

    const alertStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_alerts,
        SUM(CASE WHEN severity = 'critical' AND status != 'resolved' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high' AND status != 'resolved' THEN 1 ELSE 0 END) as high
      FROM security_alerts${userFilterClause}
    `, filterParams);

    let recentAlertsFilterClause = '';
    if (!isSuperOrWildcard && filterParams.length > 0) {
      const placeholders = filterParams.map((_, i) => `$${i + 1}`).join(',');
      recentAlertsFilterClause = `WHERE sa.tenant_id IN (SELECT id FROM tenants WHERE id IN (${placeholders}))`;
    }

    const recentAlerts = await queryAll(`
      SELECT sa.*, t.name as tenant_name FROM security_alerts sa
      JOIN tenants t ON t.id = sa.tenant_id
      ${recentAlertsFilterClause}
      ORDER BY sa.detected_at DESC LIMIT 10
    `, filterParams);

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

dashboardRouter.get('/compliance', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await queryAll(`SELECT id, name, domain FROM tenants WHERE status = 'active'`, []);

    const compliance = await Promise.all(tenants.map(async (t: any) => {
      const totalUsers = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1', [t.id]);
      const mfaUsers = await queryCount('SELECT COUNT(*) as total FROM entra_users WHERE tenant_id = $1 AND mfa_enabled = true', [t.id]);
      const caEnabled = await queryCount(`SELECT COUNT(*) as total FROM conditional_access_policies WHERE tenant_id = $1 AND state = 'enabled'`, [t.id]);
      const openAlerts = await queryCount(`SELECT COUNT(*) as total FROM security_alerts WHERE tenant_id = $1 AND status IN ('new', 'acknowledged')`, [t.id]);

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
    }));

    res.json({ success: true, data: compliance });
  } catch (err) {
    next(err);
  }
});
