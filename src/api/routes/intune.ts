import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, queryAll, queryCount } from '../models/query.js';
import { authenticate, authorize, requireTenantAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { auditFromRequest } from '../services/audit.js';

export const intuneRouter = Router({ mergeParams: true });

intuneRouter.use(authenticate, requireTenantAccess);

// Device Management
intuneRouter.get('/devices', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;
    const { search, complianceState, operatingSystem, ownerType, page = '1', pageSize = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let sql = 'SELECT * FROM managed_devices WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 1;

    if (search) {
      sql += ` AND (device_name ILIKE $${++paramIdx} OR user_principal_name ILIKE $${++paramIdx} OR serial_number ILIKE $${++paramIdx})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (complianceState) { sql += ` AND compliance_state = $${++paramIdx}`; params.push(complianceState); }
    if (operatingSystem) { sql += ` AND operating_system = $${++paramIdx}`; params.push(operatingSystem); }
    if (ownerType) { sql += ` AND managed_device_owner_type = $${++paramIdx}`; params.push(ownerType); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = await queryCount(countSql, params);

    sql += ` ORDER BY device_name LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
    params.push(Number(pageSize), offset);

    const devices = await queryAll(sql, params);

    res.json({
      success: true,
      data: devices.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        entraDeviceId: d.entra_device_id,
        deviceName: d.device_name,
        ownerType: d.managed_device_owner_type,
        operatingSystem: d.operating_system,
        osVersion: d.os_version,
        complianceState: d.compliance_state,
        isEncrypted: d.is_encrypted,
        model: d.model,
        manufacturer: d.manufacturer,
        serialNumber: d.serial_number,
        userPrincipalName: d.user_principal_name,
        userDisplayName: d.user_display_name,
        lastSyncDateTime: d.last_sync_date_time,
        enrolledDateTime: d.enrolled_date_time,
        managementAgent: d.management_agent,
        isSupervised: d.is_supervised,
        syncedAt: d.synced_at,
      })),
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalItems: total,
        totalPages: Math.ceil(total / Number(pageSize)),
      },
    });
  } catch (err) { next(err); }
});

intuneRouter.get('/devices/overview', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.params;

    const totalDevices = await queryCount('SELECT COUNT(*) as total FROM managed_devices WHERE tenant_id = $1', [tenantId]);
    const compliantDevices = await queryCount(`SELECT COUNT(*) as total FROM managed_devices WHERE tenant_id = $1 AND compliance_state = 'compliant'`, [tenantId]);
    const nonCompliantDevices = await queryCount(`SELECT COUNT(*) as total FROM managed_devices WHERE tenant_id = $1 AND compliance_state = 'noncompliant'`, [tenantId]);
    const compliancePolicies = await queryCount('SELECT COUNT(*) as total FROM device_compliance_policies WHERE tenant_id = $1', [tenantId]);
    const configProfiles = await queryCount('SELECT COUNT(*) as total FROM device_configurations WHERE tenant_id = $1', [tenantId]);

    const platformBreakdown = await queryAll(
      'SELECT operating_system, COUNT(*) as count FROM managed_devices WHERE tenant_id = $1 GROUP BY operating_system ORDER BY count DESC',
      [tenantId],
    );
    const complianceBreakdown = await queryAll(
      'SELECT compliance_state, COUNT(*) as count FROM managed_devices WHERE tenant_id = $1 GROUP BY compliance_state',
      [tenantId],
    );
    const ownershipBreakdown = await queryAll(
      'SELECT managed_device_owner_type, COUNT(*) as count FROM managed_devices WHERE tenant_id = $1 GROUP BY managed_device_owner_type',
      [tenantId],
    );

    res.json({
      success: true,
      data: {
        totalDevices,
        compliantDevices,
        nonCompliantDevices,
        compliancePolicies,
        configurationProfiles: configProfiles,
        platformBreakdown,
        complianceBreakdown,
        ownershipBreakdown,
      },
    });
  } catch (err) { next(err); }
});

intuneRouter.get('/devices/:deviceId', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await queryOne('SELECT * FROM managed_devices WHERE id = $1 AND tenant_id = $2', [req.params.deviceId, req.params.tenantId]);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', 'Device not found');

    res.json({
      success: true,
      data: {
        id: device.id,
        tenantId: device.tenant_id,
        entraDeviceId: device.entra_device_id,
        deviceName: device.device_name,
        ownerType: device.managed_device_owner_type,
        operatingSystem: device.operating_system,
        osVersion: device.os_version,
        complianceState: device.compliance_state,
        isEncrypted: device.is_encrypted,
        model: device.model,
        manufacturer: device.manufacturer,
        serialNumber: device.serial_number,
        userPrincipalName: device.user_principal_name,
        userDisplayName: device.user_display_name,
        lastSyncDateTime: device.last_sync_date_time,
        enrolledDateTime: device.enrolled_date_time,
        managementAgent: device.management_agent,
        deviceRegistrationState: device.device_registration_state,
        isSupervised: device.is_supervised,
        syncedAt: device.synced_at,
      },
    });
  } catch (err) { next(err); }
});

// Compliance Policies
intuneRouter.get('/compliance-policies', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await queryAll(
      'SELECT * FROM device_compliance_policies WHERE tenant_id = $1 ORDER BY display_name',
      [req.params.tenantId],
    );

    res.json({
      success: true,
      data: policies.map((p: any) => ({
        id: p.id,
        tenantId: p.tenant_id,
        entraPolicyId: p.entra_policy_id,
        displayName: p.display_name,
        description: p.description,
        platform: p.platform,
        assignments: p.assignments,
        lastModifiedDateTime: p.last_modified_date_time,
        createdDateTime: p.created_date_time,
        syncedAt: p.synced_at,
      })),
    });
  } catch (err) { next(err); }
});

// Configuration Profiles
intuneRouter.get('/config-profiles', authorize('tenants:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await queryAll(
      'SELECT * FROM device_configurations WHERE tenant_id = $1 ORDER BY display_name',
      [req.params.tenantId],
    );

    res.json({
      success: true,
      data: configs.map((c: any) => ({
        id: c.id,
        tenantId: c.tenant_id,
        entraConfigId: c.entra_config_id,
        displayName: c.display_name,
        description: c.description,
        platform: c.platform,
        assignments: c.assignments,
        lastModifiedDateTime: c.last_modified_date_time,
        createdDateTime: c.created_date_time,
        syncedAt: c.synced_at,
      })),
    });
  } catch (err) { next(err); }
});
