export type AuthProvider = 'local' | 'microsoft';

export interface DashboardUser {
  id: string;
  email: string;
  displayName: string;
  role: DashboardRole;
  tenantAccess: string[];
  mfaEnabled: boolean;
  authProvider: AuthProvider;
  entraOid?: string;
  entraDirectoryId?: string;
  lastLogin: Date | null;
  createdAt: Date;
}

export type DashboardRole = 'superadmin' | 'admin' | 'operator' | 'viewer';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: DashboardRole;
  tenantAccess: string[];
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Omit<DashboardUser, 'createdAt'>;
}

export interface AgentAuthPayload {
  agentId: string;
  tenantId: string;
  iat: number;
  exp: number;
}

export const ROLE_PERMISSIONS: Record<DashboardRole, string[]> = {
  superadmin: ['*'],
  admin: [
    'tenants:read', 'tenants:write', 'tenants:onboard',
    'users:read', 'users:write',
    'groups:read', 'groups:write',
    'policies:read', 'policies:write',
    'alerts:read', 'alerts:acknowledge',
    'audit:read',
    'agents:read', 'agents:restart',
    'settings:read', 'settings:write',
  ],
  operator: [
    'tenants:read',
    'users:read', 'users:write',
    'groups:read', 'groups:write',
    'policies:read',
    'alerts:read', 'alerts:acknowledge',
    'audit:read',
    'agents:read',
  ],
  viewer: [
    'tenants:read',
    'users:read',
    'groups:read',
    'policies:read',
    'alerts:read',
    'audit:read',
    'agents:read',
  ],
};
