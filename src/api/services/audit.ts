import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../models/database.js';
import { logger } from '../utils/logger.js';
import type { Request } from 'express';

export type AuditCategory =
  | 'auth'
  | 'tenant'
  | 'user'
  | 'group'
  | 'policy'
  | 'alert'
  | 'agent'
  | 'settings';

export interface AuditEntry {
  tenantId?: string | null;
  category: AuditCategory;
  action: string;
  initiatedBy: string;
  targetResources?: string[];
  result: 'success' | 'failure';
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export function recordAudit(entry: AuditEntry): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO portal_audit_log
        (id, tenant_id, category, action, initiated_by, target_resources, result, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      entry.tenantId || null,
      entry.category,
      entry.action,
      entry.initiatedBy,
      JSON.stringify(entry.targetResources || []),
      entry.result,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress || null,
    );
  } catch (err) {
    logger.error('Failed to write audit log', { error: (err as Error).message, entry });
  }
}

export function auditFromRequest(
  req: Request,
  category: AuditCategory,
  action: string,
  opts: {
    tenantId?: string;
    targetResources?: string[];
    result?: 'success' | 'failure';
    details?: Record<string, unknown>;
  } = {},
): void {
  recordAudit({
    tenantId: opts.tenantId || req.params.tenantId || null,
    category,
    action,
    initiatedBy: req.user?.email || req.user?.sub || 'anonymous',
    targetResources: opts.targetResources,
    result: opts.result || 'success',
    details: opts.details,
    ipAddress: req.ip || req.socket.remoteAddress,
  });
}
