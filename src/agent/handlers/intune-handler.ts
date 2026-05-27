import type { GraphClientFactory } from '../services/graph-client.js';
import { logger } from '../services/logger.js';

export class IntuneHandler {
  constructor(private graphFactory: GraphClientFactory) {}

  async listManagedDevices(filter?: string): Promise<any[]> {
    const client = this.graphFactory.getClient();
    let request = client.api('/deviceManagement/managedDevices')
      .select('id,deviceName,managedDeviceOwnerType,operatingSystem,osVersion,complianceState,isEncrypted,model,manufacturer,serialNumber,userPrincipalName,userDisplayName,lastSyncDateTime,enrolledDateTime,managementAgent,deviceRegistrationState,isSupervised')
      .top(999);

    if (filter) request = request.filter(filter);

    const results = await this.paginate(request);
    logger.info('Fetched managed devices from Graph API', { count: results.length });
    return results;
  }

  async getDevice(deviceId: string): Promise<any> {
    const client = this.graphFactory.getClient();
    return client.api(`/deviceManagement/managedDevices/${deviceId}`).get();
  }

  async syncDevice(deviceId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/deviceManagement/managedDevices/${deviceId}/syncDevice`).post({});
    logger.info('Device sync triggered', { deviceId });
  }

  async rebootDevice(deviceId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/deviceManagement/managedDevices/${deviceId}/rebootNow`).post({});
    logger.info('Device reboot triggered', { deviceId });
  }

  async wipeDevice(deviceId: string, keepEnrollmentData: boolean = false): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/deviceManagement/managedDevices/${deviceId}/wipe`).post({
      keepEnrollmentData,
      keepUserData: false,
    });
    logger.info('Device wipe triggered', { deviceId, keepEnrollmentData });
  }

  async retireDevice(deviceId: string): Promise<void> {
    const client = this.graphFactory.getClient();
    await client.api(`/deviceManagement/managedDevices/${deviceId}/retire`).post({});
    logger.info('Device retired', { deviceId });
  }

  async listCompliancePolicies(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api('/deviceManagement/deviceCompliancePolicies')
      .select('id,displayName,description,lastModifiedDateTime,createdDateTime')
      .get();

    const policies = response.value;
    for (const policy of policies) {
      try {
        const assignments = await client.api(`/deviceManagement/deviceCompliancePolicies/${policy.id}/assignments`).get();
        policy.assignmentCount = assignments.value?.length || 0;
        policy.platform = this.detectPlatform(policy['@odata.type']);
      } catch {
        policy.assignmentCount = 0;
        policy.platform = 'all';
      }
    }

    logger.info('Fetched compliance policies', { count: policies.length });
    return policies;
  }

  async listConfigurationProfiles(): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api('/deviceManagement/deviceConfigurations')
      .select('id,displayName,description,lastModifiedDateTime,createdDateTime')
      .get();

    const configs = response.value;
    for (const config of configs) {
      try {
        const assignments = await client.api(`/deviceManagement/deviceConfigurations/${config.id}/assignments`).get();
        config.assignmentCount = assignments.value?.length || 0;
        config.platform = this.detectPlatform(config['@odata.type']);
      } catch {
        config.assignmentCount = 0;
        config.platform = 'all';
      }
    }

    logger.info('Fetched configuration profiles', { count: configs.length });
    return configs;
  }

  async getDeviceComplianceStatus(deviceId: string): Promise<any[]> {
    const client = this.graphFactory.getClient();
    const response = await client.api(`/deviceManagement/managedDevices/${deviceId}/deviceCompliancePolicyStates`).get();
    return response.value;
  }

  private detectPlatform(odataType: string): string {
    if (!odataType) return 'all';
    if (odataType.includes('windows10') || odataType.includes('Windows10')) return 'windows10';
    if (odataType.includes('iosGeneralDevice') || odataType.includes('ios')) return 'iOS';
    if (odataType.includes('macOS') || odataType.includes('macos')) return 'macOS';
    if (odataType.includes('androidWorkProfile')) return 'androidWorkProfile';
    if (odataType.includes('android')) return 'android';
    return 'all';
  }

  private async paginate(request: any): Promise<any[]> {
    const results: any[] = [];
    let response = await request.get();
    results.push(...response.value);
    while (response['@odata.nextLink']) {
      const client = this.graphFactory.getClient();
      response = await client.api(response['@odata.nextLink']).get();
      results.push(...response.value);
    }
    return results;
  }
}
