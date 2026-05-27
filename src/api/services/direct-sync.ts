import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../models/database.js';
import { queryOne } from '../models/query.js';
import { decrypt } from '../../shared/crypto/encryption.js';
import { logger } from '../utils/logger.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'CHANGE-THIS-32-CHAR-ENCRYPTION-KEY!';

function getGraphClient(entraDirectoryId: string, clientId: string, clientSecret: string): Client {
  const credential = new ClientSecretCredential(entraDirectoryId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return Client.initWithMiddleware({ authProvider });
}

async function paginate(client: Client, url: string, select?: string): Promise<any[]> {
  const results: any[] = [];
  let request = client.api(url).top(999);
  if (select) request = request.select(select);
  let response = await request.get();
  results.push(...response.value);
  while (response['@odata.nextLink']) {
    response = await client.api(response['@odata.nextLink']).get();
    results.push(...response.value);
  }
  return results;
}

export async function syncTenant(tenantId: string): Promise<{ users: number; groups: number; policies: number; devices: number; licenses: number }> {
  const tenant = await queryOne('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  if (!tenant) throw new Error('Tenant not found');

  let clientSecret: string;
  try {
    clientSecret = decrypt(tenant.client_secret_encrypted, ENCRYPTION_KEY);
  } catch (decryptErr) {
    logger.warn('Could not decrypt client secret, trying raw value', { tenantId, error: (decryptErr as Error).message });
    clientSecret = tenant.client_secret_encrypted;
  }

  let graphClient: Client;
  try {
    graphClient = getGraphClient(tenant.entra_directory_id, tenant.client_id, clientSecret);
    await graphClient.api('/organization').select('id').get();
  } catch (authErr: any) {
    const msg = authErr?.message || String(authErr);
    if (msg.includes('Invalid client secret') || msg.includes('AADSTS7000215')) {
      throw new Error(`Authentication failed: Invalid client secret for tenant ${tenant.domain}. The stored credentials may be incorrect — try re-entering them.`);
    }
    if (msg.includes('AADSTS700016')) {
      throw new Error(`Authentication failed: Invalid client ID for tenant ${tenant.domain}. Check the Application (Client) ID.`);
    }
    throw new Error(`Authentication failed for ${tenant.domain}: ${msg}`);
  }
  const db = getDb();

  logger.info('Starting direct sync', { tenantId, domain: tenant.domain });
  const start = Date.now();

  // Sync users
  const users = await paginate(graphClient, '/users', 'id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,createdDateTime');
  for (const u of users) {
    await db.query(
      `INSERT INTO entra_users (id, tenant_id, entra_object_id, display_name, user_principal_name, mail, job_title, department, account_enabled, created_date_time, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (tenant_id, entra_object_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, user_principal_name = EXCLUDED.user_principal_name,
         mail = EXCLUDED.mail, job_title = EXCLUDED.job_title, department = EXCLUDED.department,
         account_enabled = EXCLUDED.account_enabled, synced_at = NOW()`,
      [uuidv4(), tenantId, u.id, u.displayName, u.userPrincipalName, u.mail, u.jobTitle, u.department, u.accountEnabled ?? true, u.createdDateTime],
    );
  }

  // Sync groups
  const groups = await paginate(graphClient, '/groups', 'id,displayName,description,groupTypes,mailEnabled,securityEnabled');
  for (const g of groups) {
    const groupType = g.groupTypes?.includes('Unified') ? 'microsoft365' : g.securityEnabled ? 'security' : g.mailEnabled ? 'mailEnabled' : 'distribution';
    await db.query(
      `INSERT INTO entra_groups (id, tenant_id, entra_object_id, display_name, description, group_type, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tenant_id, entra_object_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, description = EXCLUDED.description,
         group_type = EXCLUDED.group_type, synced_at = NOW()`,
      [uuidv4(), tenantId, g.id, g.displayName, g.description, groupType],
    );
  }

  // Sync conditional access policies
  let policies: any[] = [];
  try {
    const pResponse = await graphClient.api('/identity/conditionalAccess/policies').get();
    policies = pResponse.value || [];
    for (const p of policies) {
      await db.query(
        `INSERT INTO conditional_access_policies (id, tenant_id, entra_object_id, display_name, state, conditions, grant_controls, session_controls, created_date_time, modified_date_time, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (tenant_id, entra_object_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, state = EXCLUDED.state,
           conditions = EXCLUDED.conditions, grant_controls = EXCLUDED.grant_controls,
           session_controls = EXCLUDED.session_controls, modified_date_time = EXCLUDED.modified_date_time, synced_at = NOW()`,
        [uuidv4(), tenantId, p.id, p.displayName, p.state, JSON.stringify(p.conditions || {}), JSON.stringify(p.grantControls || {}), p.sessionControls ? JSON.stringify(p.sessionControls) : null, p.createdDateTime, p.modifiedDateTime],
      );
    }
  } catch (err) {
    logger.warn('Could not sync CA policies (permission may be missing)', { error: (err as Error).message });
  }

  // Sync devices (Intune)
  let devices: any[] = [];
  try {
    devices = await paginate(graphClient, '/deviceManagement/managedDevices', 'id,deviceName,managedDeviceOwnerType,operatingSystem,osVersion,complianceState,isEncrypted,model,manufacturer,serialNumber,userPrincipalName,userDisplayName,lastSyncDateTime,enrolledDateTime,managementAgent,deviceRegistrationState,isSupervised');
    for (const d of devices) {
      await db.query(
        `INSERT INTO managed_devices (id, tenant_id, entra_device_id, device_name, managed_device_owner_type, operating_system, os_version, compliance_state, is_encrypted, model, manufacturer, serial_number, user_principal_name, user_display_name, last_sync_date_time, enrolled_date_time, management_agent, device_registration_state, is_supervised, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
         ON CONFLICT (tenant_id, entra_device_id) DO UPDATE SET
           device_name=EXCLUDED.device_name, operating_system=EXCLUDED.operating_system, os_version=EXCLUDED.os_version,
           compliance_state=EXCLUDED.compliance_state, is_encrypted=EXCLUDED.is_encrypted, model=EXCLUDED.model,
           manufacturer=EXCLUDED.manufacturer, user_principal_name=EXCLUDED.user_principal_name, user_display_name=EXCLUDED.user_display_name,
           last_sync_date_time=EXCLUDED.last_sync_date_time, management_agent=EXCLUDED.management_agent, is_supervised=EXCLUDED.is_supervised, synced_at=NOW()`,
        [uuidv4(), tenantId, d.id, d.deviceName || '', d.managedDeviceOwnerType || 'unknown', d.operatingSystem || '', d.osVersion || '', d.complianceState || 'unknown', d.isEncrypted ?? false, d.model || '', d.manufacturer || '', d.serialNumber || '', d.userPrincipalName || '', d.userDisplayName || '', d.lastSyncDateTime, d.enrolledDateTime, d.managementAgent || '', d.deviceRegistrationState || '', d.isSupervised ?? false],
      );
    }
  } catch (err) {
    logger.warn('Could not sync Intune devices (permission may be missing)', { error: (err as Error).message });
  }

  // Sync licenses
  let licenses: any[] = [];
  try {
    const lResponse = await graphClient.api('/subscribedSkus').get();
    licenses = lResponse.value || [];
    for (const l of licenses) {
      await db.query(
        `INSERT INTO license_info (id, tenant_id, sku_id, sku_part_number, display_name, total_units, consumed_units, available_units, warning_units, suspended_units, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (tenant_id, sku_id) DO UPDATE SET
           sku_part_number=EXCLUDED.sku_part_number, display_name=EXCLUDED.display_name,
           total_units=EXCLUDED.total_units, consumed_units=EXCLUDED.consumed_units,
           available_units=EXCLUDED.available_units, synced_at=NOW()`,
        [uuidv4(), tenantId, l.skuId, l.skuPartNumber, l.skuPartNumber, l.prepaidUnits?.enabled || 0, l.consumedUnits || 0, Math.max(0, (l.prepaidUnits?.enabled || 0) - (l.consumedUnits || 0)), l.prepaidUnits?.warning || 0, l.prepaidUnits?.suspended || 0],
      );
    }
  } catch (err) {
    logger.warn('Could not sync licenses (permission may be missing)', { error: (err as Error).message });
  }

  // Update tenant
  await db.query(`UPDATE tenants SET last_sync_at = NOW(), agent_status = 'connected', status = CASE WHEN status = 'onboarding' THEN 'active' ELSE status END, updated_at = NOW() WHERE id = $1`, [tenantId]);

  const duration = Date.now() - start;
  logger.info('Direct sync completed', { tenantId, users: users.length, groups: groups.length, policies: policies.length, devices: devices.length, licenses: licenses.length, durationMs: duration });

  return { users: users.length, groups: groups.length, policies: policies.length, devices: devices.length, licenses: licenses.length };
}
