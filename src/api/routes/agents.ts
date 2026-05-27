import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../models/database.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const agentRouter = Router();

agentRouter.use(authenticate);

agentRouter.get('/', authorize('agents:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    let sql = `
      SELECT ac.*, t.name as tenant_name, t.domain as tenant_domain
      FROM agent_connections ac
      JOIN tenants t ON t.id = ac.tenant_id
    `;
    const params: any[] = [];

    if (req.user!.role !== 'superadmin') {
      const access = req.user!.tenantAccess;
      if (!access.includes('*')) {
        sql += ` WHERE ac.tenant_id IN (${access.map(() => '?').join(',')})`;
        params.push(...access);
      }
    }

    sql += ' ORDER BY ac.last_heartbeat DESC';
    const agents = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: agents.map((a: any) => ({
        agentId: a.agent_id,
        tenantId: a.tenant_id,
        tenantName: a.tenant_name,
        tenantDomain: a.tenant_domain,
        hostname: a.hostname,
        version: a.version,
        capabilities: JSON.parse(a.capabilities),
        status: a.status,
        lastHeartbeat: a.last_heartbeat,
        connectedAt: a.connected_at,
        metrics: JSON.parse(a.metrics),
      })),
    });
  } catch (err) {
    next(err);
  }
});

agentRouter.get('/:agentId', authorize('agents:read'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const agent = db.prepare(`
      SELECT ac.*, t.name as tenant_name, t.domain as tenant_domain
      FROM agent_connections ac
      JOIN tenants t ON t.id = ac.tenant_id
      WHERE ac.agent_id = ?
    `).get(req.params.agentId) as any;

    if (!agent) {
      res.status(404).json({ success: false, error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found' } });
      return;
    }

    res.json({
      success: true,
      data: {
        agentId: agent.agent_id,
        tenantId: agent.tenant_id,
        tenantName: agent.tenant_name,
        tenantDomain: agent.tenant_domain,
        hostname: agent.hostname,
        version: agent.version,
        capabilities: JSON.parse(agent.capabilities),
        status: agent.status,
        lastHeartbeat: agent.last_heartbeat,
        connectedAt: agent.connected_at,
        metrics: JSON.parse(agent.metrics),
      },
    });
  } catch (err) {
    next(err);
  }
});
