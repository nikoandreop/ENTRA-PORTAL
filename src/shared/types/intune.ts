export interface ManagedDevice {
  id: string;
  tenantId: string;
  entraDeviceId: string;
  deviceName: string;
  managedDeviceOwnerType: 'company' | 'personal' | 'unknown';
  operatingSystem: string;
  osVersion: string;
  complianceState: ComplianceState;
  isEncrypted: boolean;
  model: string;
  manufacturer: string;
  serialNumber: string;
  userPrincipalName: string;
  userDisplayName: string;
  lastSyncDateTime: Date | null;
  enrolledDateTime: Date;
  managementAgent: string;
  deviceRegistrationState: string;
  isSupervised: boolean;
  syncedAt: Date;
}

export type ComplianceState =
  | 'compliant'
  | 'noncompliant'
  | 'conflict'
  | 'error'
  | 'inGracePeriod'
  | 'configManager'
  | 'unknown';

export interface DeviceCompliancePolicy {
  id: string;
  tenantId: string;
  entraPolicyId: string;
  displayName: string;
  description: string | null;
  platform: DevicePlatform;
  assignments: number;
  lastModifiedDateTime: Date;
  createdDateTime: Date;
  syncedAt: Date;
}

export type DevicePlatform =
  | 'windows10'
  | 'iOS'
  | 'macOS'
  | 'android'
  | 'androidWorkProfile'
  | 'all';

export interface DeviceConfiguration {
  id: string;
  tenantId: string;
  entraConfigId: string;
  displayName: string;
  description: string | null;
  platform: DevicePlatform;
  lastModifiedDateTime: Date;
  createdDateTime: Date;
  assignments: number;
  syncedAt: Date;
}

export interface IntuneOverview {
  totalDevices: number;
  compliantDevices: number;
  nonCompliantDevices: number;
  compliancePolicies: number;
  configurationProfiles: number;
  platformBreakdown: Record<string, number>;
  complianceBreakdown: Record<string, number>;
  ownershipBreakdown: Record<string, number>;
}
