export interface AgentRegistration {
  agentId: string;
  tenantId: string;
  hostname: string;
  version: string;
  capabilities: string[];
}

export interface AgentHeartbeat {
  agentId: string;
  tenantId: string;
  timestamp: Date;
  status: AgentHealthStatus;
  metrics: AgentMetrics;
}

export interface AgentHealthStatus {
  healthy: boolean;
  graphApiConnected: boolean;
  lastSyncSuccess: boolean;
  lastSyncAt: Date | null;
  uptime: number;
  errors: AgentError[];
}

export interface AgentMetrics {
  cpuUsage: number;
  memoryUsageMb: number;
  syncDurationMs: number;
  apiCallsLastHour: number;
  throttledCallsLastHour: number;
}

export interface AgentError {
  code: string;
  message: string;
  timestamp: Date;
  severity: 'warning' | 'error' | 'critical';
}

export type AgentCommand =
  | { type: 'sync'; modules: string[] }
  | { type: 'userAction'; action: string; payload: Record<string, unknown> }
  | { type: 'groupAction'; action: string; payload: Record<string, unknown> }
  | { type: 'policyAction'; action: string; payload: Record<string, unknown> }
  | { type: 'configUpdate'; config: Record<string, unknown> }
  | { type: 'restart' }
  | { type: 'diagnostics' };

export interface AgentCommandResult {
  commandId: string;
  agentId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: Date;
}
