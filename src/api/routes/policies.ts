import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, queryCount } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const policyRouter = Router({ mergeParams: true });

policyRouter.use(authenticate, requireTenantAccess);

policyRouter.get('/', authorize('policies:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { state, search } = req.query;

    let sql = 'SELECT * FROM conditional_access_policies WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (state) { sql += ` AND state = $${++paramIdx}`; params.push(state); }
    if (search) { sql += ` AND display_name LIKE $${++paramIdx}`; params.push(`%${search}%`); }

    sql += ' ORDER BY display_name';
    const policies = await queryAll(sql, params);

    res.json({
      success: true,
      data: policies.map((p: any) => ({
        id: p.id,
        tenantId: p.tenant_id,
        entraObjectId: p.entra_object_id,
        displayName: p.display_name,
        state: p.state,
        conditions: typeof p.conditions === 'string' ? JSON.parse(p.conditions) : p.conditions,
        grantControls: typeof p.grant_controls === 'string' ? JSON.parse(p.grant_controls) : p.grant_controls,
        sessionControls: p.session_controls ? (typeof p.session_controls === 'string' ? JSON.parse(p.session_controls) : p.session_controls) : null,
        createdDateTime: p.created_date_time,
        modifiedDateTime: p.modified_date_time,
        syncedAt: p.synced_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

policyRouter.get('/summary', authorize('policies:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;

    const total = await queryCount('SELECT COUNT(*) as total FROM conditional_access_policies WHERE tenant_id = $1', [tenantId]);
    const byState = await queryAll(
      'SELECT state, COUNT(*) as count FROM conditional_access_policies WHERE tenant_id = $1 GROUP BY state',
      [tenantId],
    );

    res.json({ success: true, data: { total, byState } });
  } catch (err) {
    next(err);
  }
});

policyRouter.get('/:policyId', authorize('policies:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policy = await queryOne(
      'SELECT * FROM conditional_access_policies WHERE id = $1 AND tenant_id = $2',
      [req.params.policyId, req.params.tenantId],
    );
    if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'Policy not found');

    res.json({
      success: true,
      data: {
        id: policy.id,
        tenantId: policy.tenant_id,
        entraObjectId: policy.entra_object_id,
        displayName: policy.display_name,
        state: policy.state,
        conditions: typeof policy.conditions === 'string' ? JSON.parse(policy.conditions) : policy.conditions,
        grantControls: typeof policy.grant_controls === 'string' ? JSON.parse(policy.grant_controls) : policy.grant_controls,
        sessionControls: policy.session_controls ? (typeof policy.session_controls === 'string' ? JSON.parse(policy.session_controls) : policy.session_controls) : null,
        createdDateTime: policy.created_date_time,
        modifiedDateTime: policy.modified_date_time,
        syncedAt: policy.synced_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
