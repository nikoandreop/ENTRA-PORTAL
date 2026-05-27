export interface EntraUser {
  id: string;
  tenantId: string;
  entraObjectId: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
  mfaEnabled: boolean;
  mfaMethods: MfaMethod[];
  assignedLicenses: string[];
  lastSignIn: Date | null;
  createdDateTime: Date;
  riskLevel: RiskLevel;
  syncedAt: Date;
}

export type MfaMethod =
  | 'microsoftAuthenticator'
  | 'phoneAuthentication'
  | 'fido2'
  | 'emailAuthentication'
  | 'softwareOath'
  | 'temporaryAccessPass';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface UserCreateRequest {
  displayName: string;
  userPrincipalName: string;
  mailNickname: string;
  password: string;
  forceChangePasswordNextSignIn: boolean;
  accountEnabled: boolean;
  department?: string;
  jobTitle?: string;
}

export interface UserUpdateRequest {
  displayName?: string;
  accountEnabled?: boolean;
  department?: string;
  jobTitle?: string;
}

export interface UserBulkAction {
  userIds: string[];
  action: 'enable' | 'disable' | 'delete' | 'resetPassword' | 'revokeSessions';
}
