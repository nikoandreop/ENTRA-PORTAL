export interface EntraGroup {
  id: string;
  tenantId: string;
  entraObjectId: string;
  displayName: string;
  description: string | null;
  groupType: 'security' | 'microsoft365' | 'distribution' | 'mailEnabled';
  membershipType: 'assigned' | 'dynamic';
  memberCount: number;
  ownerCount: number;
  dynamicRule: string | null;
  syncedAt: Date;
}

export interface ConditionalAccessPolicy {
  id: string;
  tenantId: string;
  entraObjectId: string;
  displayName: string;
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced';
  conditions: PolicyConditions;
  grantControls: GrantControls;
  sessionControls: SessionControls | null;
  createdDateTime: Date;
  modifiedDateTime: Date;
  syncedAt: Date;
}

export interface PolicyConditions {
  userInclude: string[];
  userExclude: string[];
  applicationInclude: string[];
  applicationExclude: string[];
  platforms: string[];
  locations: string[];
  signInRiskLevels: string[];
  userRiskLevels: string[];
}

export interface GrantControls {
  operator: 'AND' | 'OR';
  builtInControls: string[];
  customAuthenticationFactors: string[];
}

export interface SessionControls {
  signInFrequency: { value: number; type: 'hours' | 'days' } | null;
  persistentBrowser: { mode: 'always' | 'never' } | null;
}

export interface SecurityAlert {
  id: string;
  tenantId: string;
  type: AlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedResources: string[];
  status: 'new' | 'acknowledged' | 'resolved' | 'dismissed';
  detectedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

export type AlertType =
  | 'riskySignIn'
  | 'mfaDisabled'
  | 'staleAccount'
  | 'privilegedRoleChange'
  | 'conditionalAccessChange'
  | 'bulkDeletion'
  | 'suspiciousActivity'
  | 'licenseExpiring'
  | 'agentDisconnected';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  activityDateTime: Date;
  activityDisplayName: string;
  category: string;
  initiatedBy: string;
  targetResources: string[];
  result: 'success' | 'failure';
  source: 'entra' | 'portal';
}

export interface LicenseInfo {
  tenantId: string;
  skuId: string;
  skuPartNumber: string;
  displayName: string;
  totalUnits: number;
  consumedUnits: number;
  availableUnits: number;
  warningUnits: number;
  suspendedUnits: number;
}

export interface MfaSummary {
  tenantId: string;
  totalUsers: number;
  mfaEnabledCount: number;
  mfaDisabledCount: number;
  methodBreakdown: Record<string, number>;
  adminsMfaEnabled: number;
  adminsTotal: number;
}
