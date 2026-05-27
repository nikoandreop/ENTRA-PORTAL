import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { getDb } from '../models/database.js';
import { HEARTBEAT_TIMEOUT_MS } from '../../shared/constants/index.js';
import type { AgentHeartbeat, AgentRegistration, AgentCommand, AgentCommandResult } from '../../shared/types/agent.js';
import type { WebSocketMessage } from '../../shared/types/api.js';

const AGENT_JWT_SECRET = process.env.AGENT_JWT_SECRET || 'CHANGE-AGENT-SECRET';

interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  tenantId: string;
  lastHeartbeat: number;
  registered: boolean;
}

export class WebSocketServer {
  private wss: WSServer | null = null;
  private agents = new Map<string, ConnectedAgent>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private pendingCommands = new Map<string, { resolve: (result: AgentCommandResult) => void; timeout: NodeJS.Timeout }>();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WSServer({
      port: this.port,
      verifyClient: (info, callback) => this.verifyClient(info, callback),
      maxPayload: 5 * 1024 * 1024,
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (err) => logger.error('WebSocket server error', { error: err.message }));

    this.healthCheckInterval = setInterval(() => this.checkAgentHealth(), HEARTBEAT_TIMEOUT_MS);
  }

  stop(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    for (const [, agent] of this.agents) {
      agent.ws.close(1001, 'Server shutting down');
    }
    this.wss?.close();
  }

  private verifyClient(info: { req: IncomingMessage }, callback: (result: boolean, code?: number, message?: string) => void): void {
    const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      callback(false, 401, 'Missing authentication token');
      return;
    }

    try {
      jwt.verify(token, AGENT_JWT_SECRET, { algorithms: ['HS256'] });
      callback(true);
    } catch {
      callback(false, 401, 'Invalid authentication token');
    }
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = randomUUID();
    logger.info('Agent WebSocket connection established', { connectionId, ip: req.socket.remoteAddress });

    const agent: ConnectedAgent = {
      ws,
      agentId: '',
      tenantId: '',
      lastHeartbeat: Date.now(),
      registered: false,
    };

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(agent, message);
      } catch (err) {
        logger.error('Failed to parse WebSocket message', { connectionId, error: (err as Error).message });
        ws.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', (code, reason) => {
      logger.info('Agent disconnected', { agentId: agent.agentId, code, reason: reason.toString() });
      if (agent.agentId) {
        this.agents.delete(agent.agentId);
        this.updateAgentStatus(agent.tenantId, 'disconnected');
      }
    });

    ws.on('error', (err) => {
      logger.error('Agent WebSocket error', { agentId: agent.agentId, error: err.message });
    });

    setTimeout(() => {
      if (!agent.registered) {
        logger.warn('Agent did not register in time', { connectionId });
        ws.close(4000, 'Registration timeout');
      }
    }, 30_000);
  }

  private handleMessage(agent: ConnectedAgent, message: WebSocketMessage): void {
    switch (message.type) {
      case 'agent:register':
        this.handleRegistration(agent, message.payload as AgentRegistration);
        break;
      case 'agent:heartbeat':
        this.handleHeartbeat(agent, message.payload as AgentHeartbeat);
        break;
      case 'agent:data':
        this.handleDataSync(agent, message);
        break;
      case 'agent:commandResult':
        this.handleCommandResult(message.payload as AgentCommandResult);
        break;
      case 'agent:error':
        logger.error('Agent reported error', { agentId: agent.agentId, payload: message.payload });
        break;
      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }

  private async handleRegistration(agent: ConnectedAgent, registration: AgentRegistration): Promise<void> {
    agent.agentId = registration.agentId;
    agent.tenantId = registration.tenantId;
    agent.registered = true;
    this.agents.set(registration.agentId, agent);

    const db = getDb();
    await db.query(
      `INSERT INTO agent_connections (agent_id, tenant_id, hostname, version, capabilities, status, last_heartbeat, connected_at)
      VALUES ($1, $2, $3, $4, $5, 'connected', NOW(), NOW())
      ON CONFLICT (agent_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        hostname = EXCLUDED.hostname,
        version = EXCLUDED.version,
        capabilities = EXCLUDED.capabilities,
        status = EXCLUDED.status,
        last_heartbeat = EXCLUDED.last_heartbeat,
        connected_at = EXCLUDED.connected_at`,
      [registration.agentId, registration.tenantId, registration.hostname, registration.version, JSON.stringify(registration.capabilities)],
    );

    await this.updateAgentStatus(registration.tenantId, 'connected');

    agent.ws.send(JSON.stringify({
      type: 'server:ack',
      payload: { message: 'Registration successful', agentId: registration.agentId },
      timestamp: new Date(),
    }));

    logger.info('Agent registered', { agentId: registration.agentId, tenantId: registration.tenantId });
  }

  private async handleHeartbeat(agent: ConnectedAgent, heartbeat: AgentHeartbeat): Promise<void> {
    agent.lastHeartbeat = Date.now();
    const db = getDb();
    await db.query(
      `UPDATE agent_connections SET last_heartbeat = NOW(), metrics = $1, status = $2 WHERE agent_id = $3`,
      [JSON.stringify(heartbeat.metrics), heartbeat.status.healthy ? 'connected' : 'degraded', agent.agentId],
    );

    if (!heartbeat.status.healthy) {
      await this.updateAgentStatus(agent.tenantId, 'degraded');
    }
  }

  private async handleDataSync(agent: ConnectedAgent, message: WebSocketMessage): Promise<void> {
    logger.info('Received data sync from agent', { agentId: agent.agentId, tenantId: agent.tenantId });
    const db = getDb();
    await db.query(`UPDATE tenants SET last_sync_at = NOW() WHERE id = $1`, [agent.tenantId]);
  }

  private handleCommandResult(result: AgentCommandResult): void {
    const pending = this.pendingCommands.get(result.commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(result);
      this.pendingCommands.delete(result.commandId);
    }
  }

  async sendCommand(tenantId: string, command: AgentCommand): Promise<AgentCommandResult> {
    const agent = this.findAgentForTenant(tenantId);
    if (!agent) {
      throw new Error(`No connected agent for tenant ${tenantId}`);
    }

    const commandId = randomUUID();
    return new Promise<AgentCommandResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Command timed out'));
      }, 60_000);

      this.pendingCommands.set(commandId, { resolve, timeout });

      agent.ws.send(JSON.stringify({
        type: 'server:command',
        tenantId,
        payload: { commandId, ...command },
        timestamp: new Date(),
        correlationId: commandId,
      }));
    });
  }

  private findAgentForTenant(tenantId: string): ConnectedAgent | undefined {
    for (const [, agent] of this.agents) {
      if (agent.tenantId === tenantId && agent.registered) return agent;
    }
    return undefined;
  }

  private async updateAgentStatus(tenantId: string, status: string): Promise<void> {
    const db = getDb();
    await db.query('UPDATE tenants SET agent_status = $1, updated_at = NOW() WHERE id = $2', [status, tenantId]);
  }

  private checkAgentHealth(): void {
    const now = Date.now();
    for (const [agentId, agent] of this.agents) {
      if (now - agent.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        logger.warn('Agent heartbeat timeout', { agentId, tenantId: agent.tenantId });
        this.updateAgentStatus(agent.tenantId, 'disconnected');
        agent.ws.close(4001, 'Heartbeat timeout');
        this.agents.delete(agentId);
      }
    }
  }

  getConnectedAgents(): { agentId: string; tenantId: string; lastHeartbeat: number }[] {
    return Array.from(this.agents.values()).map(a => ({
      agentId: a.agentId,
      tenantId: a.tenantId,
      lastHeartbeat: a.lastHeartbeat,
    }));
  }
}
