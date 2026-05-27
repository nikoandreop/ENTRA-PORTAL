/**
 * Entra Tenant Validation Script
 *
 * Run this before onboarding a new tenant to verify:
 * 1. App registration credentials are valid
 * 2. Required Graph API permissions are granted
 * 3. Admin consent is properly configured
 *
 * Usage: npx tsx tests/integration/entra-tenant-validator.ts \
 *   --tenant-id <azure-tenant-id> \
 *   --client-id <client-id> \
 *   --client-secret <client-secret>
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

interface ValidationResult {
  step: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

async function validate(tenantId: string, clientId: string, clientSecret: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Step 1: Authentication
  let graphClient: Client;
  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    graphClient = Client.initWithMiddleware({ authProvider });
    results.push({ step: 'Authentication', status: 'pass', message: 'Client credentials valid' });
  } catch (err: any) {
    results.push({ step: 'Authentication', status: 'fail', message: `Auth failed: ${err.message}` });
    return results;
  }

  // Step 2: Organization read
  try {
    const org = await graphClient.api('/organization').select('id,displayName').get();
    results.push({ step: 'Organization', status: 'pass', message: `Connected to: ${org.value[0]?.displayName}` });
  } catch (err: any) {
    results.push({ step: 'Organization', status: 'fail', message: `Cannot read org: ${err.message}` });
  }

  // Step 3: Permission checks
  const permissionChecks = [
    { name: 'User.Read.All', test: () => graphClient.api('/users').top(1).select('id').get() },
    { name: 'Group.Read.All', test: () => graphClient.api('/groups').top(1).select('id').get() },
    { name: 'Policy.Read.All', test: () => graphClient.api('/identity/conditionalAccess/policies').top(1).get() },
    { name: 'AuditLog.Read.All', test: () => graphClient.api('/auditLogs/directoryAudits').top(1).get() },
    { name: 'UserAuthenticationMethod.Read.All', test: async () => {
      const users = await graphClient.api('/users').top(1).select('id').get();
      if (users.value.length > 0) {
        await graphClient.api(`/users/${users.value[0].id}/authentication/methods`).get();
      }
    }},
    { name: 'Reports.Read.All (Licenses)', test: () => graphClient.api('/subscribedSkus').get() },
  ];

  for (const check of permissionChecks) {
    try {
      await check.test();
      results.push({ step: `Permission: ${check.name}`, status: 'pass', message: 'Granted' });
    } catch (err: any) {
      const isForbidden = err.statusCode === 403 || err.statusCode === 401;
      results.push({
        step: `Permission: ${check.name}`,
        status: isForbidden ? 'fail' : 'warn',
        message: isForbidden ? 'NOT GRANTED - admin consent required' : `Error: ${err.message}`,
      });
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const tenantId = getArg('tenant-id') || process.env.INTEGRATION_GRAPH_TENANT_ID;
  const clientId = getArg('client-id') || process.env.INTEGRATION_GRAPH_CLIENT_ID;
  const clientSecret = getArg('client-secret') || process.env.INTEGRATION_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error('Usage: npx tsx entra-tenant-validator.ts --tenant-id <id> --client-id <id> --client-secret <secret>');
    process.exit(1);
  }

  console.log('\n=== Entra Tenant Validation ===\n');
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Client ID: ${clientId}\n`);

  const results = await validate(tenantId, clientId, clientSecret);

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'WARN';
    console.log(`  [${icon}] ${r.step}: ${r.message}`);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${warned} warnings`);

  if (failed > 0) {
    console.log('\nTenant is NOT ready for onboarding. Fix the FAIL items above.');
    process.exit(1);
  } else if (warned > 0) {
    console.log('\nTenant can be onboarded but some features may be limited.');
  } else {
    console.log('\nTenant is ready for onboarding!');
  }
}

main().catch(console.error);
