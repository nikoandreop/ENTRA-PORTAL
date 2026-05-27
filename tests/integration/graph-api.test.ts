/**
 * Integration tests for real Microsoft Graph API connectivity.
 *
 * These tests run against a REAL Entra ID tenant. They are NOT run in CI
 * by default — only via `npm run test:integration` with env vars set.
 *
 * Required env vars:
 *   INTEGRATION_GRAPH_TENANT_ID  - Azure AD tenant ID
 *   INTEGRATION_GRAPH_CLIENT_ID  - App registration client ID
 *   INTEGRATION_GRAPH_CLIENT_SECRET - Client secret
 *
 * The app registration needs these Graph API permissions (Application type):
 *   User.Read.All, Group.Read.All, Policy.Read.All, AuditLog.Read.All
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

const TENANT_ID = process.env.INTEGRATION_GRAPH_TENANT_ID;
const CLIENT_ID = process.env.INTEGRATION_GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.INTEGRATION_GRAPH_CLIENT_SECRET;

const skip = !TENANT_ID || !CLIENT_ID || !CLIENT_SECRET;

describe.skipIf(skip)('Microsoft Graph API Integration', () => {
  let graphClient: Client;

  beforeAll(() => {
    const credential = new ClientSecretCredential(TENANT_ID!, CLIENT_ID!, CLIENT_SECRET!);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    graphClient = Client.initWithMiddleware({ authProvider });
  });

  it('should authenticate and read organization info', async () => {
    const org = await graphClient.api('/organization').select('id,displayName,verifiedDomains').get();
    expect(org.value).toBeDefined();
    expect(org.value.length).toBeGreaterThan(0);
    expect(org.value[0].displayName).toBeTruthy();
    console.log(`Connected to: ${org.value[0].displayName}`);
  });

  it('should list users with pagination', async () => {
    const response = await graphClient.api('/users')
      .select('id,displayName,userPrincipalName,accountEnabled')
      .top(5)
      .get();

    expect(response.value).toBeDefined();
    expect(Array.isArray(response.value)).toBe(true);
    console.log(`Found ${response.value.length} users (first page)`);

    for (const user of response.value) {
      expect(user.id).toBeTruthy();
      expect(user.displayName).toBeTruthy();
      expect(user.userPrincipalName).toBeTruthy();
    }
  });

  it('should list groups', async () => {
    const response = await graphClient.api('/groups')
      .select('id,displayName,groupTypes,securityEnabled')
      .top(5)
      .get();

    expect(response.value).toBeDefined();
    expect(Array.isArray(response.value)).toBe(true);
    console.log(`Found ${response.value.length} groups (first page)`);
  });

  it('should read conditional access policies', async () => {
    try {
      const response = await graphClient.api('/identity/conditionalAccess/policies').get();
      expect(response.value).toBeDefined();
      console.log(`Found ${response.value.length} conditional access policies`);
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log('Skipped: insufficient permissions for conditional access policies');
      } else {
        throw err;
      }
    }
  });

  it('should read user authentication methods (MFA)', async () => {
    const users = await graphClient.api('/users').select('id,displayName').top(1).get();
    if (users.value.length === 0) return;

    try {
      const methods = await graphClient.api(`/users/${users.value[0].id}/authentication/methods`).get();
      expect(methods.value).toBeDefined();
      console.log(`User ${users.value[0].displayName} has ${methods.value.length} auth methods`);
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log('Skipped: insufficient permissions for auth methods');
      } else {
        throw err;
      }
    }
  });

  it('should read directory audit logs', async () => {
    try {
      const response = await graphClient.api('/auditLogs/directoryAudits').top(5).get();
      expect(response.value).toBeDefined();
      console.log(`Found ${response.value.length} audit log entries (first page)`);
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.log('Skipped: insufficient permissions for audit logs');
      } else {
        throw err;
      }
    }
  });

  it('should read subscribed SKUs (licenses)', async () => {
    const response = await graphClient.api('/subscribedSkus').get();
    expect(response.value).toBeDefined();
    console.log(`Found ${response.value.length} license SKUs`);
    for (const sku of response.value) {
      console.log(`  ${sku.skuPartNumber}: ${sku.consumedUnits}/${sku.prepaidUnits?.enabled || 0} used`);
    }
  });
});
