import type { GraphClientFactory } from '../services/graph-client.js';
import { logger } from '../services/logger.js';

export class UserHandler {
  constructor(private graphFactory: GraphClientFactory) {}

  async listUsers(filter?: string): Promise<any[]> {
    const client = this.graphFactory.getClient();
    let request = client.api('/users')
      .select('id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,createdDateTime,signInActivity')
      .top(999);

    if (filter) {
      request = request.filter(filter);
    }

    const result = await this.paginate(request);
    logger.info('Fetched users from Graph API', { count: result.length });
    return result;
  }

  async getUser(userId: string): Promise<any> {
    const client = this.graphFactory.getClient();
    return client.api(`/users/${userId}`)
      .select('id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,createdDateTime,signInActivity,assignedLicenses')
      .get();
  }

  async createUser(params: any): Promise<any> {
    const client = this.graphFactory.getClient();
    const user = {
      displayName: params.displayName,
      userPrincipalName: params.userPrincipalName,
      mailNickname: params.mailNickname || params.userPrincipalName.split('@')[0],
      passwordProfile: {
        password: params.password,
        forceChangePasswordNextSignIn: params.forceChangePasswordNextSignIn ?? true,
      },
      accountEnabled: params.accountEnabled ?? true,
      ...(params.department && { department: params.department }),
      ...(params.jobTitle && { jobTitle: params.jobTitle }),
    };

    const result = await client.api('/users').post(user);
    logger.info('Created user', { userId: result.id, upn: result.userPrincipalName });
    return result;
  }

  async updateUser(userId: string, updates: any): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/users/${userId}`).patch(updates);
    logger.info('Updated user', { userId });
  }

  async disableUser(userId: string): Promise<void> {
    await this.updateUser(userId, { accountEnabled: false });
    logger.info('Disabled user', { userId });
  }

  async enableUser(userId: string): Promise<void> {
    await this.updateUser(userId, { accountEnabled: true });
    logger.info('Enabled user', { userId });
  }

  async deleteUser(userId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/users/${userId}`).delete();
    logger.info('Deleted user', { userId });
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/users/${userId}`).patch({
      passwordProfile: {
        password: newPassword,
        forceChangePasswordNextSignIn: true,
      },
    });
    logger.info('Password reset', { userId });
  }

  async getMfaStatus(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const users = await this.listUsers();
    const mfaStatuses = [];

    for (const user of users) {
      try {
        const methods = await client.api(`/users/${user.id}/authentication/methods`).get();
        mfaStatuses.push({
          userId: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          mfaEnabled: methods.value.length > 1,
          methods: methods.value.map((m: any) => m['@odata.type']?.replace('#microsoft.graph.', '')),
        });
      } catch {
        mfaStatuses.push({
          userId: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          mfaEnabled: false,
          methods: [],
        });
      }
    }

    return mfaStatuses;
  }

  async getSubscribedSkus(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api('/subscribedSkus').get();
    return response.value;
  }

  async assignLicense(userId: string, skuId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/users/${userId}/assignLicense`).post({
      addLicenses: [{ skuId, disabledPlans: [] }],
      removeLicenses: [],
    });
    logger.info('License assigned', { userId, skuId });
  }

  async removeLicense(userId: string, skuId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/users/${userId}/assignLicense`).post({
      addLicenses: [],
      removeLicenses: [skuId],
    });
    logger.info('License removed', { userId, skuId });
  }

  private async paginate(request: any): Promise<any[]> {
    const results: any[] = [];
    let response = await request.get();
    results.push(...response.value);

    while (response['@odata.nextLink']) {
      const client = this.graphFactory.getClient();
      response = await client.api(response['@odata.nextLink']).get();
      results.push(...response.value);
    }

    return results;
  }
}
