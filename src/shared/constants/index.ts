export const API_PORT = 3001;
export const WS_PORT = 3002;
export const FRONTEND_PORT = 5173;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 90_000;
export const AGENT_RECONNECT_DELAY_MS = 5_000;
export const MAX_RECONNECT_ATTEMPTS = 10;

export const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
export const DEFAULT_RETENTION_DAYS = 90;

export const PASSWORD_MIN_LENGTH = 12;
export const TOKEN_EXPIRY_SECONDS = 3600;
export const REFRESH_TOKEN_EXPIRY_SECONDS = 86400 * 7;

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 100;
export const AUTH_RATE_LIMIT_MAX_REQUESTS = 10;

export const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
export const GRAPH_API_BETA = 'https://graph.microsoft.com/beta';

export const REQUIRED_GRAPH_PERMISSIONS = [
  'User.Read.All',
  'User.ReadWrite.All',
  'Group.Read.All',
  'Group.ReadWrite.All',
  'Policy.Read.All',
  'Policy.ReadWrite.ConditionalAccess',
  'AuditLog.Read.All',
  'Reports.Read.All',
  'Directory.Read.All',
  'UserAuthenticationMethod.Read.All',
  'RoleManagement.Read.All',
  'DeviceManagementManagedDevices.Read.All',
  'DeviceManagementManagedDevices.ReadWrite.All',
  'DeviceManagementConfiguration.Read.All',
  'DeviceManagementServiceConfig.Read.All',
] as const;
