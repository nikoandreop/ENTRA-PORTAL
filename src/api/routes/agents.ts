import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll } from '../models/query.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const agentRouter = Router();

agentRouter.use(authenticate);

agentRouter.get('/', authorize('agents:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let sql = `
      SELECT ac.*, t.name as tenant_name, t.domain as tenant_domain
      FROM agent_connections ac
      JOIN tenants t ON t.id = ac.tenant_id
    `;
    const params: any[] = [];
    let paramIdx = 0;

    if (req.user!.role !== 'superadmin') {
      const access = req.user!.tenantAccess;
      if (!access.includes('*')) {
        const placeholders = access.map(() => `$${++paramIdx}`).join(',');
        sql += ` WHERE ac.tenant_id IN (${placeholders})`;
        params.push(...access);
      }
    }

    sql += ' ORDER BY ac.last_heartbeat DESC';
    const agents = await queryAll(sql, params);

    res.json({
      success: true,
      data: agents.map((a: any) => ({
        agentId: a.agent_id,
        tenantId: a.tenant_id,
        tenantName: a.tenant_name,
        tenantDomain: a.tenant_domain,
        hostname: a.hostname,
        version: a.version,
        capabilities: typeof a.capabilities === 'string' ? JSON.parse(a.capabilities) : a.capabilities,
        status: a.status,
        lastHeartbeat: a.last_heartbeat,
        connectedAt: a.connected_at,
        metrics: typeof a.metrics === 'string' ? JSON.parse(a.metrics) : a.metrics,
      })),
    });
  } catch (err) {
    next(err);
  }
});

agentRouter.get('/:agentId', authorize('agents:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await queryOne(`
      SELECT ac.*, t.name as tenant_name, t.domain as tenant_domain
      FROM agent_connections ac
      JOIN tenants t ON t.id = ac.tenant_id
      WHERE ac.agent_id = $1
    `, [req.params.agentId]);

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
        capabilities: typeof agent.capabilities === 'string' ? JSON.parse(agent.capabilities) : agent.capabilities,
        status: agent.status,
        lastHeartbeat: agent.last_heartbeat,
        connectedAt: agent.connected_at,
        metrics: typeof agent.metrics === 'string' ? JSON.parse(agent.metrics) : agent.metrics,
      },
    });
  } catch (err) {
    next(err);
  }
});
