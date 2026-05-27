export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  pagination?: PaginationInfo;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  tenantId?: string;
  payload: unknown;
  timestamp: Date;
  correlationId?: string;
}

export type WebSocketMessageType =
  | 'agent:register'
  | 'agent:heartbeat'
  | 'agent:data'
  | 'agent:error'
  | 'agent:commandResult'
  | 'server:command'
  | 'server:ack'
  | 'server:configUpdate';
