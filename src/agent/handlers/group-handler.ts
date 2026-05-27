import type { GraphClientFactory } from '../services/graph-client.js';
import { logger } from '../services/logger.js';

export class GroupHandler {
  constructor(private graphFactory: GraphClientFactory) {}

  async listGroups(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api('/groups')
      .select('id,displayName,description,groupTypes,membershipRule,membershipRuleProcessingState,mailEnabled,securityEnabled')
      .top(999)
      .get();

    const groups = response.value;
    for (const group of groups) {
      try {
        const members = await client.api(`/groups/${group.id}/members/$count`).header('ConsistencyLevel', 'eventual').get();
        group.memberCount = typeof members === 'number' ? members : 0;
      } catch {
        group.memberCount = 0;
      }
    }

    logger.info('Fetched groups from Graph API', { count: groups.length });
    return groups;
  }

  async getGroup(groupId: string): Promise<any> {
    const client = this.graphFactory.getClient();
    return client.api(`/groups/${groupId}`).get();
  }

  async getGroupMembers(groupId: string): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api(`/groups/${groupId}/members`)
      .select('id,displayName,userPrincipalName,mail')
      .top(999)
      .get();
    return response.value;
  }
}
