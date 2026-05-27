import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

let pool: pg.Pool;

export function getDb(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function initDatabase(): Promise<void> {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'entra_portal',
    user: process.env.DB_USER || 'entra',
    password: process.env.DB_PASSWORD || 'entra',
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err.message });
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('Database connection verified');
  } finally {
    client.release();
  }

  await runMigrations();
  await seedDefaultAdmin();
  logger.info('Database initialized');
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database pool closed');
  }
}

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query('SELECT id FROM _migrations WHERE name = $1', [migration.name]);
      if (existing.rows.length === 0) {
        logger.info(`Running migration: ${migration.name}`);
        await client.query(migration.sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const migrations = [
  {
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS dashboard_users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'viewer',
        tenant_access JSONB NOT NULL DEFAULT '[]',
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'local',
        entra_oid TEXT UNIQUE,
        entra_tenant_id TEXT,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT UNIQUE NOT NULL,
        entra_directory_id TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL,
        client_secret_encrypted TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'onboarding',
        config JSONB NOT NULL DEFAULT '{}',
        agent_status TEXT NOT NULL DEFAULT 'provisioning',
        last_sync_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS entra_users (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_object_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        user_principal_name TEXT NOT NULL,
        mail TEXT,
        job_title TEXT,
        department TEXT,
        account_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_methods JSONB NOT NULL DEFAULT '[]',
        assigned_licenses JSONB NOT NULL DEFAULT '[]',
        last_sign_in TIMESTAMPTZ,
        risk_level TEXT NOT NULL DEFAULT 'none',
        created_date_time TIMESTAMPTZ,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_object_id)
      );

      CREATE TABLE IF NOT EXISTS entra_groups (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_object_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        group_type TEXT NOT NULL DEFAULT 'security',
        membership_type TEXT NOT NULL DEFAULT 'assigned',
        member_count INTEGER NOT NULL DEFAULT 0,
        owner_count INTEGER NOT NULL DEFAULT 0,
        dynamic_rule TEXT,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_object_id)
      );

      CREATE TABLE IF NOT EXISTS conditional_access_policies (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_object_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'disabled',
        conditions JSONB NOT NULL DEFAULT '{}',
        grant_controls JSONB NOT NULL DEFAULT '{}',
        session_controls JSONB,
        created_date_time TIMESTAMPTZ,
        modified_date_time TIMESTAMPTZ,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_object_id)
      );

      CREATE TABLE IF NOT EXISTS security_alerts (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_resources JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'new',
        detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        activity_date_time TIMESTAMPTZ NOT NULL,
        activity_display_name TEXT NOT NULL,
        category TEXT NOT NULL,
        initiated_by TEXT NOT NULL,
        target_resources JSONB NOT NULL DEFAULT '[]',
        result TEXT NOT NULL DEFAULT 'success',
        source TEXT NOT NULL DEFAULT 'entra'
      );

      CREATE TABLE IF NOT EXISTS license_info (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sku_id TEXT NOT NULL,
        sku_part_number TEXT NOT NULL,
        display_name TEXT NOT NULL,
        total_units INTEGER NOT NULL DEFAULT 0,
        consumed_units INTEGER NOT NULL DEFAULT 0,
        available_units INTEGER NOT NULL DEFAULT 0,
        warning_units INTEGER NOT NULL DEFAULT 0,
        suspended_units INTEGER NOT NULL DEFAULT 0,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, sku_id)
      );

      CREATE TABLE IF NOT EXISTS agent_connections (
        agent_id TEXT PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        hostname TEXT NOT NULL,
        version TEXT NOT NULL,
        capabilities JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'connected',
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metrics JSONB NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS portal_audit_log (
        id UUID PRIMARY KEY,
        tenant_id UUID,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        initiated_by TEXT NOT NULL,
        target_resources JSONB NOT NULL DEFAULT '[]',
        result TEXT NOT NULL DEFAULT 'success',
        details JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_entra_users_tenant ON entra_users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_entra_users_upn ON entra_users(user_principal_name);
      CREATE INDEX IF NOT EXISTS idx_entra_groups_tenant ON entra_groups(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_tenant ON security_alerts(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_status ON security_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_datetime ON audit_logs(activity_date_time);
      CREATE INDEX IF NOT EXISTS idx_agent_connections_tenant ON agent_connections(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_portal_audit_tenant ON portal_audit_log(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_portal_audit_category ON portal_audit_log(category);
      CREATE INDEX IF NOT EXISTS idx_portal_audit_created ON portal_audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_portal_audit_initiated ON portal_audit_log(initiated_by);
      CREATE INDEX IF NOT EXISTS idx_dashboard_users_entra_oid ON dashboard_users(entra_oid);
    `,
  },
  {
    name: '002_intune_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS managed_devices (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        managed_device_owner_type TEXT NOT NULL DEFAULT 'unknown',
        operating_system TEXT NOT NULL DEFAULT '',
        os_version TEXT NOT NULL DEFAULT '',
        compliance_state TEXT NOT NULL DEFAULT 'unknown',
        is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
        model TEXT NOT NULL DEFAULT '',
        manufacturer TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        user_principal_name TEXT NOT NULL DEFAULT '',
        user_display_name TEXT NOT NULL DEFAULT '',
        last_sync_date_time TIMESTAMPTZ,
        enrolled_date_time TIMESTAMPTZ,
        management_agent TEXT NOT NULL DEFAULT '',
        device_registration_state TEXT NOT NULL DEFAULT '',
        is_supervised BOOLEAN NOT NULL DEFAULT FALSE,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_device_id)
      );

      CREATE TABLE IF NOT EXISTS device_compliance_policies (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_policy_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        platform TEXT NOT NULL DEFAULT 'all',
        assignments INTEGER NOT NULL DEFAULT 0,
        last_modified_date_time TIMESTAMPTZ,
        created_date_time TIMESTAMPTZ,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_policy_id)
      );

      CREATE TABLE IF NOT EXISTS device_configurations (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entra_config_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        platform TEXT NOT NULL DEFAULT 'all',
        assignments INTEGER NOT NULL DEFAULT 0,
        last_modified_date_time TIMESTAMPTZ,
        created_date_time TIMESTAMPTZ,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entra_config_id)
      );

      CREATE INDEX IF NOT EXISTS idx_managed_devices_tenant ON managed_devices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_managed_devices_compliance ON managed_devices(compliance_state);
      CREATE INDEX IF NOT EXISTS idx_managed_devices_os ON managed_devices(operating_system);
      CREATE INDEX IF NOT EXISTS idx_managed_devices_upn ON managed_devices(user_principal_name);
      CREATE INDEX IF NOT EXISTS idx_device_compliance_policies_tenant ON device_compliance_policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_device_configurations_tenant ON device_configurations(tenant_id);
    `,
  },
];

async function seedDefaultAdmin(): Promise<void> {
  const result = await pool.query("SELECT id FROM dashboard_users WHERE role = 'superadmin' LIMIT 1");
  if (result.rows.length > 0) return;

  const bcrypt = await import('bcryptjs');
  const { v4: uuidv4 } = await import('uuid');
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'EntraPortal!2024';
  const hash = bcrypt.hashSync(defaultPassword, 12);

  await pool.query(
    `INSERT INTO dashboard_users (id, email, display_name, password_hash, role, tenant_access)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [uuidv4(), 'admin@entra-portal.local', 'System Administrator', hash, 'superadmin', JSON.stringify(['*'])],
  );

  logger.info('Default admin user created');
}
