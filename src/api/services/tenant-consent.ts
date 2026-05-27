import { Issuer, Client, generators } from 'openid-client';
import { logger } from '../utils/logger.js';

let consentClient: Client | null = null;

const GRAPH_PERMISSIONS = [
  'User.Read.All',
  'User.ReadWrite.All',
  'Group.Read.All',
  'Group.ReadWrite.All',
  'Policy.Read.All',
  'AuditLog.Read.All',
  'Reports.Read.All',
  'Directory.Read.All',
  'UserAuthenticationMethod.Read.All',
  'DeviceManagementManagedDevices.Read.All',
  'DeviceManagementManagedDevices.ReadWrite.All',
  'DeviceManagementConfiguration.Read.All',
];

function getConsentConfig() {
  return {
    clientId: process.env.MSP_CLIENT_ID || process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.MSP_CLIENT_SECRET || process.env.SSO_CLIENT_SECRET || '',
    redirectUri: process.env.CONSENT_REDIRECT_URI || process.env.CORS_ORIGIN + '/tenants/onboard/callback' || 'http://localhost:5173/tenants/onboard/callback',
  };
}

export function isConsentConfigured(): boolean {
  const config = getConsentConfig();
  return !!(config.clientId && config.clientSecret);
}

async function getClient(): Promise<Client> {
  if (consentClient) return consentClient;
  const config = getConsentConfig();
  const issuer = await Issuer.discover('https://login.microsoftonline.com/common/v2.0');
  consentClient = new issuer.Client({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uris: [config.redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });
  return consentClient;
}

export async function getAdminConsentUrl(state: string): Promise<{ url: string; codeVerifier: string; nonce: string }> {
  const config = getConsentConfig();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const nonce = generators.nonce();

  const scope = [
    'openid', 'profile', 'email',
    ...GRAPH_PERMISSIONS.map(p => `https://graph.microsoft.com/${p}`),
  ].join(' ');

  const url = `https://login.microsoftonline.com/common/adminconsent?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}`;

  return { url, codeVerifier, nonce };
}

export interface ConsentResult {
  tenantId: string;
  domain: string;
  displayName: string;
}

export async function handleAdminConsentCallback(tenantId: string, adminConsent: boolean): Promise<ConsentResult> {
  if (!adminConsent) throw new Error('Admin consent was not granted');

  const config = getConsentConfig();

  const { ClientSecretCredential } = await import('@azure/identity');
  const { Client: GraphClient } = await import('@microsoft/microsoft-graph-client');
  const { TokenCredentialAuthenticationProvider } = await import('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js');

  const credential = new ClientSecretCredential(tenantId, config.clientId, config.clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  const graphClient = GraphClient.initWithMiddleware({ authProvider });

  const org = await graphClient.api('/organization').select('id,displayName,verifiedDomains').get();
  const orgInfo = org.value[0];

  const primaryDomain = orgInfo.verifiedDomains?.find((d: any) => d.isDefault)?.name
    || orgInfo.verifiedDomains?.[0]?.name
    || `${tenantId}.onmicrosoft.com`;

  logger.info('Admin consent completed', { tenantId, domain: primaryDomain, displayName: orgInfo.displayName });

  return {
    tenantId,
    domain: primaryDomain,
    displayName: orgInfo.displayName || primaryDomain,
  };
}
