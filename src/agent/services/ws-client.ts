import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import type { CommandDispatcher } from '../handlers/dispatcher.js';
import { HEARTBEAT_INTERVAL_MS, MAX_RECONNECT_ATTEMPTS, AGENT_RECONNECT_DELAY_MS } from '../../shared/constants/index.js';

interface WsClientConfig {
  url: string;
  token: string;
  agentId: string;
  tenantId: string;
  hostname: string;
  dispatcher: CommandDispatcher;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private config: WsClientConfig) {}

  connect(): void {
    const url = `${this.config.url}?token=${encodeURIComponent(this.config.token)}`;

    this.ws = new WebSocket(url, {
      handshakeTimeout: 10_000,
      headers: { 'X-Agent-ID': this.config.agentId },
    });

    this.ws.on('open', () => {
      logger.info('Connected to central panel');
      this.reconnectAttempts = 0;
      this.register();
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => this.handleMessage(data.toString()));

    this.ws.on('close', (code, reason) => {
      logger.warn('Disconnected from central panel', { code, reason: reason.toString() });
      this.stopHeartbeat();
      if (!this.isShuttingDown) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error('WebSocket error', { error: err.message });
    });
  }

  disconnect(): void {
    this.isShuttingDown = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close(1000, 'Agent shutting down');
  }

  sendData(type: string, payload: unknown): void {
    this.send({ type: 'agent:data' as any, tenantId: this.config.tenantId, payload: { dataType: type, ...payload as any }, timestamp: new Date() });
  }

  private register(): void {
    this.send({
      type: 'agent:register',
      tenantId: this.config.tenantId,
      payload: {
        agentId: this.config.agentId,
        tenantId: this.config.tenantId,
        hostname: this.config.hostname,
        version: '1.0.0',
        capabilities: ['users', 'groups', 'policies', 'mfa', 'licenses', 'audit-logs'],
      },
      timestamp: new Date(),
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const mem = process.memoryUsage();
      this.send({
        type: 'agent:heartbeat',
        tenantId: this.config.tenantId,
        payload: {
          agentId: this.config.agentId,
          tenantId: this.config.tenantId,
          timestamp: new Date(),
          status: {
            healthy: true,
            graphApiConnected: true,
            lastSyncSuccess: true,
            lastSyncAt: new Date(),
            uptime: process.uptime(),
            errors: [],
          },
          metrics: {
            cpuUsage: 0,
            memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
            syncDurationMs: 0,
            apiCallsLastHour: 0,
            throttledCallsLastHour: 0,
          },
        },
        timestamp: new Date(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw);

      switch (message.type) {
        case 'server:ack':
          logger.info('Registration acknowledged by panel');
          break;

        case 'server:command': {
          const { commandId, type, ...payload } = message.payload;
          logger.info('Received command', { commandId, type });

          try {
            const result = await this.config.dispatcher.dispatch(type, payload);
            this.send({
              type: 'agent:commandResult',
              tenantId: this.config.tenantId,
              payload: {
                commandId,
                agentId: this.config.agentId,
                success: true,
                data: result,
                executedAt: new Date(),
              },
              timestamp: new Date(),
            });
          } catch (err) {
            this.send({
              type: 'agent:commandResult',
              tenantId: this.config.tenantId,
              payload: {
                commandId,
                agentId: this.config.agentId,
                success: false,
                error: (err as Error).message,
                executedAt: new Date(),
              },
              timestamp: new Date(),
            });
          }
          break;
        }

        case 'server:configUpdate':
          logger.info('Received config update', { payload: message.payload });
          break;

        default:
          logger.warn('Unknown server message type', { type: message.type });
      }
    } catch (err) {
      logger.error('Failed to handle message', { error: (err as Error).message });
    }
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnect attempts reached, giving up');
      process.exit(1);
    }

    const delay = AGENT_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000;
    this.reconnectAttempts++;

    logger.info(`Reconnecting in ${Math.round((delay + jitter) / 1000)}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimeout = setTimeout(() => this.connect(), delay + jitter);
  }
}
