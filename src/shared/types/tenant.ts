export interface Tenant {
  id: string;
  name: string;
  entraDirectoryId: string;
  domain: string;
  status: TenantStatus;
  agentStatus: AgentConnectionStatus;
  config: TenantConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type TenantStatus = 'active' | 'suspended' | 'onboarding' | 'offboarding';

export type AgentConnectionStatus = 'connected' | 'disconnected' | 'degraded' | 'provisioning';

export interface TenantConfig {
  syncIntervalMinutes: number;
  enabledModules: TenantModule[];
  alertThresholds: AlertThresholds;
  retentionDays: number;
}

export type TenantModule =
  | 'users'
  | 'groups'
  | 'conditional-access'
  | 'mfa'
  | 'licenses'
  | 'audit-logs'
  | 'security-alerts';

export interface AlertThresholds {
  maxFailedSignIns: number;
  mfaDisabledWarning: boolean;
  staleAccountDays: number;
  licenseUtilizationPercent: number;
}

export interface TenantOnboardingRequest {
  name: string;
  domain: string;
  entraDirectoryId: string;
  clientId: string;
  clientSecret: string;
  adminConsent: boolean;
  enabledModules: TenantModule[];
}

export interface TenantSummary {
  id: string;
  name: string;
  domain: string;
  status: TenantStatus;
  agentStatus: AgentConnectionStatus;
  userCount: number;
  groupCount: number;
  alertCount: number;
  lastSyncAt: Date | null;
}
