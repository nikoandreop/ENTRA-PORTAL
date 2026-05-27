import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, queryCount } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const groupRouter = Router({ mergeParams: true });

groupRouter.use(authenticate, requireTenantAccess);

groupRouter.get('/', authorize('groups:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { search, groupType, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM entra_groups WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (search) {
      sql += ` AND (display_name LIKE $${++paramIdx} OR description LIKE $${++paramIdx})`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (groupType) { sql += ` AND group_type = $${++paramIdx}`; params.push(groupType); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY display_name LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const groups = await queryAll(sql, params);

    res.json({
      success: true,
      data: groups.map((g: any) => ({
        id: g.id,
        tenantId: g.tenant_id,
        entraObjectId: g.entra_object_id,
        displayName: g.display_name,
        description: g.description,
        groupType: g.group_type,
        membershipType: g.membership_type,
        memberCount: g.member_count,
        ownerCount: g.owner_count,
        dynamicRule: g.dynamic_rule,
        syncedAt: g.synced_at,
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

groupRouter.get('/stats', authorize('groups:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;

    const total = await queryCount('SELECT COUNT(*) as total FROM entra_groups WHERE tenant_id = $1', [tenantId]);
    const byType = await queryAll(
      'SELECT group_type, COUNT(*) as count FROM entra_groups WHERE tenant_id = $1 GROUP BY group_type',
      [tenantId],
    );

    const byMembership = await queryAll(
      'SELECT membership_type, COUNT(*) as count FROM entra_groups WHERE tenant_id = $1 GROUP BY membership_type',
      [tenantId],
    );

    res.json({ success: true, data: { total, byType, byMembership } });
  } catch (err) {
    next(err);
  }
});

groupRouter.get('/:groupId', authorize('groups:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = await queryOne('SELECT * FROM entra_groups WHERE id = $1 AND tenant_id = $2', [req.params.groupId, req.params.tenantId]);
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');

    res.json({
      success: true,
      data: {
        id: group.id,
        tenantId: group.tenant_id,
        entraObjectId: group.entra_object_id,
        displayName: group.display_name,
        description: group.description,
        groupType: group.group_type,
        membershipType: group.membership_type,
        memberCount: group.member_count,
        ownerCount: group.owner_count,
        dynamicRule: group.dynamic_rule,
        syncedAt: group.synced_at,
      },
    });
  } catch (err) {
    next(err);
  }
});
