import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const policyRouter = Router({ mergeParams: true });

policyRouter.use(authenticate, requireTenantAccess);

policyRouter.get('/', authorize('policies:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const { state, search } = req.query;

    let sql = 'SELECT * FROM conditional_access_policies WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (state) { sql += ' AND state = ?'; params.push(state); }
    if (search) { sql += ' AND display_name LIKE ?'; params.push(`%${search}%`); }

    sql += ' ORDER BY display_name';
    const policies = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: policies.map((p: any) => ({
        id: p.id,
        tenantId: p.tenant_id,
        entraObjectId: p.entra_object_id,
        displayName: p.display_name,
        state: p.state,
        conditions: JSON.parse(p.conditions),
        grantControls: JSON.parse(p.grant_controls),
        sessionControls: p.session_controls ? JSON.parse(p.session_controls) : null,
        createdDateTime: p.created_date_time,
        modifiedDateTime: p.modified_date_time,
        syncedAt: p.synced_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

policyRouter.get('/summary', authorize('policies:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;

    const total = (db.prepare('SELECT COUNT(*) as c FROM conditional_access_policies WHERE tenant_id = ?').get(tenantId) as any).c;
    const byState = db.prepare(
      'SELECT state, COUNT(*) as count FROM conditional_access_policies WHERE tenant_id = ? GROUP BY state'
    ).all(tenantId);

    res.json({ success: true, data: { total, byState } });
  } catch (err) {
    next(err);
  }
});

policyRouter.get('/:policyId', authorize('policies:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const policy = db.prepare(
      'SELECT * FROM conditional_access_policies WHERE id = ? AND tenant_id = ?'
    ).get(req.params.policyId, req.params.tenantId) as any;
    if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'Policy not found');

    res.json({
      success: true,
      data: {
        id: policy.id,
        tenantId: policy.tenant_id,
        entraObjectId: policy.entra_object_id,
        displayName: policy.display_name,
        state: policy.state,
        conditions: JSON.parse(policy.conditions),
        grantControls: JSON.parse(policy.grant_controls),
        sessionControls: policy.session_controls ? JSON.parse(policy.session_controls) : null,
        createdDateTime: policy.created_date_time,
        modifiedDateTime: policy.modified_date_time,
        syncedAt: policy.synced_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
