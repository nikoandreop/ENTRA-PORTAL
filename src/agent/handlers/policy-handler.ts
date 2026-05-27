import type { GraphClientFactory } from '../services/graph-client.js';
import { logger } from '../services/logger.js';

export class PolicyHandler {
  constructor(private graphFactory: GraphClientFactory) {}

  async listPolicies(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api('/identity/conditionalAccess/policies').get();
    logger.info('Fetched conditional access policies', { count: response.value.length });
    return response.value;
  }

  async getPolicy(policyId: string): Promise<any> {
    const client = this.graphFactory.getClient();
    return client.api(`/identity/conditionalAccess/policies/${policyId}`).get();
  }
}
