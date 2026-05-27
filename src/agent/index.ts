import { WebSocketClient } from './services/ws-client.js';
import { GraphClientFactory } from './services/graph-client.js';
import { CommandDispatcher } from './handlers/dispatcher.js';
import { UserHandler } from './handlers/user-handler.js';
import { GroupHandler } from './handlers/group-handler.js';
import { PolicyHandler } from './handlers/policy-handler.js';
import { SyncScheduler } from './services/sync-scheduler.js';
import { logger } from './services/logger.js';
import { v4 as uuidv4 } from 'uuid';

const config = {
  agentId: process.env.AGENT_ID || uuidv4(),
  tenantId: process.env.TENANT_ID || '',
  panelWsUrl: process.env.PANEL_WS_URL || 'ws://localhost:3002',
  agentToken: process.env.AGENT_TOKEN || '',
  graphTenantId: process.env.GRAPH_TENANT_ID || '',
  graphClientId: process.env.GRAPH_CLIENT_ID || '',
  graphClientSecret: process.env.GRAPH_CLIENT_SECRET || '',
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || '15'),
  hostname: process.env.HOSTNAME || 'unknown',
};

async function start() {
  if (!config.tenantId) {
    logger.error('TENANT_ID is required');
    process.exit(1);
  }

  logger.info('Starting Entra Portal Agent', {
    agentId: config.agentId,
    tenantId: config.tenantId,
    hostname: config.hostname,
  });

  const graphClient = new GraphClientFactory(
    config.graphTenantId,
    config.graphClientId,
    config.graphClientSecret,
  );

  const dispatcher = new CommandDispatcher();
  const userHandler = new UserHandler(graphClient);
  const groupHandler = new GroupHandler(graphClient);
  const policyHandler = new PolicyHandler(graphClient);

  dispatcher.register('sync', async (payload) => {
    const modules = (payload as any).modules || ['users', 'groups'];
    const results: Record<string, unknown> = {};
    for (const mod of modules) {
      switch (mod) {
        case 'users': results.users = await userHandler.listUsers(); break;
        case 'groups': results.groups = await groupHandler.listGroups(); break;
        case 'policies': results.policies = await policyHandler.listPolicies(); break;
      }
    }
    return results;
  });

  dispatcher.register('userAction', async (payload) => {
    const { action, ...params } = payload as any;
    switch (action) {
      case 'list': return userHandler.listUsers(params.filter);
      case 'get': return userHandler.getUser(params.userId);
      case 'create': return userHandler.createUser(params);
      case 'update': return userHandler.updateUser(params.userId, params.updates);
      case 'disable': return userHandler.disableUser(params.userId);
      case 'enable': return userHandler.enableUser(params.userId);
      case 'delete': return userHandler.deleteUser(params.userId);
      case 'resetPassword': return userHandler.resetPassword(params.userId, params.password);
      case 'getMfaStatus': return userHandler.getMfaStatus();
      default: throw new Error(`Unknown user action: ${action}`);
    }
  });

  dispatcher.register('groupAction', async (payload) => {
    const { action, ...params } = payload as any;
    switch (action) {
      case 'list': return groupHandler.listGroups();
      case 'get': return groupHandler.getGroup(params.groupId);
      case 'members': return groupHandler.getGroupMembers(params.groupId);
      default: throw new Error(`Unknown group action: ${action}`);
    }
  });

  dispatcher.register('policyAction', async (payload) => {
    const { action, ...params } = payload as any;
    switch (action) {
      case 'list': return policyHandler.listPolicies();
      case 'get': return policyHandler.getPolicy(params.policyId);
      default: throw new Error(`Unknown policy action: ${action}`);
    }
  });

  dispatcher.register('diagnostics', async () => ({
    agentId: config.agentId,
    tenantId: config.tenantId,
    hostname: config.hostname,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    graphApiConnected: await graphClient.testConnection(),
  }));

  const wsClient = new WebSocketClient({
    url: config.panelWsUrl,
    token: config.agentToken,
    agentId: config.agentId,
    tenantId: config.tenantId,
    hostname: config.hostname,
    dispatcher,
  });

  wsClient.connect();

  const syncScheduler = new SyncScheduler(wsClient, userHandler, groupHandler, config.syncIntervalMinutes);
  syncScheduler.start();

  const shutdown = () => {
    logger.info('Shutting down agent');
    syncScheduler.stop();
    wsClient.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.error('Fatal agent error', { error: err.message, stack: err.stack });
  process.exit(1);
});
