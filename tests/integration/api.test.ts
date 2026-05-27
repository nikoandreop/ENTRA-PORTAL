/**
 * API integration tests against a running server with real PostgreSQL.
 *
 * Run with: npm -w src/api run test:integration
 * Requires a running PostgreSQL instance (see docker-compose).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase, getDb } from '../../src/api/models/database.js';

const DB_AVAILABLE = !!process.env.DB_HOST;

describe.skipIf(!DB_AVAILABLE)('API Database Integration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('should connect to PostgreSQL', async () => {
    const db = getDb();
    const result = await db.query('SELECT NOW() as now');
    expect(result.rows[0].now).toBeTruthy();
  });

  it('should have all required tables', async () => {
    const db = getDb();
    const result = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = result.rows.map((r: any) => r.table_name);

    expect(tables).toContain('dashboard_users');
    expect(tables).toContain('tenants');
    expect(tables).toContain('entra_users');
    expect(tables).toContain('entra_groups');
    expect(tables).toContain('conditional_access_policies');
    expect(tables).toContain('security_alerts');
    expect(tables).toContain('audit_logs');
    expect(tables).toContain('portal_audit_log');
    expect(tables).toContain('agent_connections');
    expect(tables).toContain('license_info');
    expect(tables).toContain('_migrations');
  });

  it('should have seeded default admin', async () => {
    const db = getDb();
    const result = await db.query(
      "SELECT email, role FROM dashboard_users WHERE role = 'superadmin' LIMIT 1",
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].email).toBe('admin@entra-portal.local');
  });

  it('should have proper indexes', async () => {
    const db = getDb();
    const result = await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY indexname
    `);
    const indexes = result.rows.map((r: any) => r.indexname);

    expect(indexes).toContain('idx_entra_users_tenant');
    expect(indexes).toContain('idx_security_alerts_status');
    expect(indexes).toContain('idx_portal_audit_tenant');
    expect(indexes).toContain('idx_portal_audit_created');
  });

  it('should support JSONB columns natively', async () => {
    const db = getDb();
    const result = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'config'
    `);
    expect(result.rows[0].data_type).toBe('jsonb');
  });

  it('should enforce foreign key constraints', async () => {
    const db = getDb();
    try {
      await db.query(`
        INSERT INTO entra_users (id, tenant_id, entra_object_id, display_name, user_principal_name)
        VALUES ('test-user-id', '00000000-0000-0000-0000-000000000000', 'oid', 'Test', 'test@test.com')
      `);
      expect.fail('Should have thrown foreign key violation');
    } catch (err: any) {
      expect(err.message).toContain('violates foreign key constraint');
    }
  });
});
