import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { logger } from '../utils/logger.js';

const DB_DIR = process.env.DB_DIR || join(process.cwd(), 'data');
const DB_PATH = join(DB_DIR, 'entra-portal.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): void {
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH, { verbose: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg as string) : undefined });

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  createTables();
  seedDefaultAdmin();
  logger.info('Database initialized', { path: DB_PATH });
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      tenant_access TEXT NOT NULL DEFAULT '[]',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      entra_directory_id TEXT UNIQUE NOT NULL,
      client_id TEXT NOT NULL,
      client_secret_encrypted TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'onboarding',
      config TEXT NOT NULL DEFAULT '{}',
      agent_status TEXT NOT NULL DEFAULT 'provisioning',
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entra_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entra_object_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      user_principal_name TEXT NOT NULL,
      mail TEXT,
      job_title TEXT,
      department TEXT,
      account_enabled INTEGER NOT NULL DEFAULT 1,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_methods TEXT NOT NULL DEFAULT '[]',
      assigned_licenses TEXT NOT NULL DEFAULT '[]',
      last_sign_in TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      created_date_time TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, entra_object_id)
    );

    CREATE TABLE IF NOT EXISTS entra_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entra_object_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      group_type TEXT NOT NULL DEFAULT 'security',
      membership_type TEXT NOT NULL DEFAULT 'assigned',
      member_count INTEGER NOT NULL DEFAULT 0,
      owner_count INTEGER NOT NULL DEFAULT 0,
      dynamic_rule TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, entra_object_id)
    );

    CREATE TABLE IF NOT EXISTS conditional_access_policies (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entra_object_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'disabled',
      conditions TEXT NOT NULL DEFAULT '{}',
      grant_controls TEXT NOT NULL DEFAULT '{}',
      session_controls TEXT,
      created_date_time TEXT,
      modified_date_time TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, entra_object_id)
    );

    CREATE TABLE IF NOT EXISTS security_alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      affected_resources TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      acknowledged_by TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      activity_date_time TEXT NOT NULL,
      activity_display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      initiated_by TEXT NOT NULL,
      target_resources TEXT NOT NULL DEFAULT '[]',
      result TEXT NOT NULL DEFAULT 'success',
      source TEXT NOT NULL DEFAULT 'entra'
    );

    CREATE TABLE IF NOT EXISTS license_info (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      sku_id TEXT NOT NULL,
      sku_part_number TEXT NOT NULL,
      display_name TEXT NOT NULL,
      total_units INTEGER NOT NULL DEFAULT 0,
      consumed_units INTEGER NOT NULL DEFAULT 0,
      available_units INTEGER NOT NULL DEFAULT 0,
      warning_units INTEGER NOT NULL DEFAULT 0,
      suspended_units INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, sku_id)
    );

    CREATE TABLE IF NOT EXISTS agent_connections (
      agent_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      hostname TEXT NOT NULL,
      version TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'connected',
      last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      metrics TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_entra_users_tenant ON entra_users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_entra_users_upn ON entra_users(user_principal_name);
    CREATE INDEX IF NOT EXISTS idx_entra_groups_tenant ON entra_groups(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_security_alerts_tenant ON security_alerts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_datetime ON audit_logs(activity_date_time);
    CREATE INDEX IF NOT EXISTS idx_agent_connections_tenant ON agent_connections(tenant_id);
  `);
}

function seedDefaultAdmin(): void {
  const existing = db.prepare('SELECT id FROM dashboard_users WHERE role = ?').get('superadmin');
  if (existing) return;

  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'EntraPortal!2024';
  const hash = bcrypt.hashSync(defaultPassword, 12);

  db.prepare(
    'INSERT INTO dashboard_users (id, email, display_name, password_hash, role, tenant_access) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), 'admin@entra-portal.local', 'System Administrator', hash, 'superadmin', '["*"]');

  logger.info('Default admin user created');
}
