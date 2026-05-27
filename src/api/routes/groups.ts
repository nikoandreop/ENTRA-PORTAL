import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';

export const groupRouter = Router({ mergeParams: true });

groupRouter.use(authenticate, requireTenantAccess);

groupRouter.get('/', authorize('groups:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;
    const { search, groupType, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM entra_groups WHERE tenant_id = ?';
    const params: any[] = [tenantId];

    if (search) {
      sql += ' AND (display_name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (groupType) { sql += ' AND group_type = ?'; params.push(groupType); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countSql).get(...params) as any).total;

    sql += ' ORDER BY display_name LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const groups = db.prepare(sql).all(...params);

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

groupRouter.get('/stats', authorize('groups:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { tenantId } = req.params;

    const total = (db.prepare('SELECT COUNT(*) as c FROM entra_groups WHERE tenant_id = ?').get(tenantId) as any).c;
    const byType = db.prepare(
      'SELECT group_type, COUNT(*) as count FROM entra_groups WHERE tenant_id = ? GROUP BY group_type'
    ).all(tenantId);

    const byMembership = db.prepare(
      'SELECT membership_type, COUNT(*) as count FROM entra_groups WHERE tenant_id = ? GROUP BY membership_type'
    ).all(tenantId);

    res.json({ success: true, data: { total, byType, byMembership } });
  } catch (err) {
    next(err);
  }
});

groupRouter.get('/:groupId', authorize('groups:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const group = db.prepare('SELECT * FROM entra_groups WHERE id = ? AND tenant_id = ?').get(req.params.groupId, req.params.tenantId) as any;
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
