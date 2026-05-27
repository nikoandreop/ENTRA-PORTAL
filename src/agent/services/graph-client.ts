import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { logger } from './logger.js';

export class GraphClientFactory {
  private client: Client | null = null;
  private credential: ClientSecretCredential;

  constructor(
    private tenantId: string,
    private clientId: string,
    private clientSecret: string,
  ) {
    this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  getClient(): Client {
    if (!this.client) {
      const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      this.client = Client.initWithMiddleware({
        authProvider,
        defaultVersion: 'v1.0',
      });

      logger.info('Graph API client initialized', { tenantId: this.tenantId });
    }
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.api('/organization').select('id,displayName').get();
      return true;
    } catch (err) {
      logger.error('Graph API connection test failed', { error: (err as Error).message });
      return false;
    }
  }
}
