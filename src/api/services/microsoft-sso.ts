import { Issuer, Client, generators, TokenSet } from 'openid-client';
import { logger } from '../utils/logger.js';

let oidcClient: Client | null = null;

export interface SsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getSsoConfig(): SsoConfig {
  return {
    tenantId: process.env.SSO_TENANT_ID || 'common',
    clientId: process.env.SSO_CLIENT_ID || '',
    clientSecret: process.env.SSO_CLIENT_SECRET || '',
    redirectUri: process.env.SSO_REDIRECT_URI || 'http://localhost:5173/auth/callback',
  };
}

export function isSsoConfigured(): boolean {
  const config = getSsoConfig();
  return !!(config.clientId && config.clientSecret);
}

async function getClient(): Promise<Client> {
  if (oidcClient) return oidcClient;

  const config = getSsoConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Microsoft SSO not configured. Set SSO_CLIENT_ID and SSO_CLIENT_SECRET.');
  }

  const issuerUrl = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const microsoftIssuer = await Issuer.discover(issuerUrl);

  oidcClient = new microsoftIssuer.Client({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uris: [config.redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });

  logger.info('Microsoft OIDC client initialized', { tenantId: config.tenantId });
  return oidcClient;
}

export async function getAuthorizationUrl(state: string): Promise<{ url: string; codeVerifier: string; nonce: string }> {
  const client = await getClient();
  const config = getSsoConfig();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const nonce = generators.nonce();

  const url = client.authorizationUrl({
    scope: 'openid profile email',
    redirect_uri: config.redirectUri,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  return { url, codeVerifier, nonce };
}

export interface SsoUserInfo {
  oid: string;
  email: string;
  displayName: string;
  tenantId: string;
}

export async function handleCallback(
  code: string,
  state: string,
  codeVerifier: string,
  nonce: string,
): Promise<SsoUserInfo> {
  const client = await getClient();
  const config = getSsoConfig();

  const tokenSet: TokenSet = await client.callback(
    config.redirectUri,
    { code, state },
    { code_verifier: codeVerifier, nonce, state },
  );

  const claims = tokenSet.claims();

  if (!claims.email && !claims.preferred_username) {
    throw new Error('No email or UPN in token claims');
  }

  return {
    oid: claims.oid as string || claims.sub,
    email: (claims.email || claims.preferred_username) as string,
    displayName: claims.name || (claims.email as string) || 'SSO User',
    tenantId: claims.tid as string || config.tenantId,
  };
}
