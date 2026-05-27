import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/formatters';
import { Search, ArrowLeft, Monitor, Smartphone, Laptop, Tablet, ShieldCheck, ShieldX, ShieldAlert, Lock, Unlock } from 'lucide-react';

const complianceColors: Record<string, string> = {
  compliant: 'bg-green-100 text-green-800',
  noncompliant: 'bg-red-100 text-red-800',
  inGracePeriod: 'bg-yellow-100 text-yellow-800',
  unknown: 'bg-gray-100 text-gray-700',
  configManager: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-800',
  conflict: 'bg-orange-100 text-orange-800',
};

function OsIcon({ os }: { os: string }) {
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return <Laptop className="h-4 w-4 text-blue-500" />;
  if (lower.includes('ios') || lower.includes('iphone')) return <Smartphone className="h-4 w-4 text-gray-500" />;
  if (lower.includes('android')) return <Smartphone className="h-4 w-4 text-green-500" />;
  if (lower.includes('macos') || lower.includes('mac')) return <Monitor className="h-4 w-4 text-gray-700" />;
  return <Tablet className="h-4 w-4 text-gray-400" />;
}

export function DeviceListPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [search, setSearch] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');
  const [osFilter, setOsFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: overview } = useQuery({
    queryKey: ['intune-overview', tenantId],
    queryFn: async () => { const { data } = await api.get(`/tenants/${tenantId}/intune/devices/overview`); return data.data; },
    enabled: !!tenantId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['intune-devices', tenantId, search, complianceFilter, osFilter, page],
    queryFn: async () => {
      const { data } = await api.get(`/tenants/${tenantId}/intune/devices`, {
        params: {
          search: search || undefined,
          complianceState: complianceFilter || undefined,
          operatingSystem: osFilter || undefined,
          page: String(page),
          pageSize: '50',
        },
      });
      return data;
    },
    enabled: !!tenantId,
  });

  const devices = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenant
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Intune Devices</h1>
        <p className="text-sm text-gray-500">Manage endpoints across this tenant</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{overview.totalDevices}</p>
            <p className="text-xs text-gray-500">Total Devices</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-green-600">{overview.compliantDevices}</p>
            <p className="text-xs text-gray-500">Compliant</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-red-600">{overview.nonCompliantDevices}</p>
            <p className="text-xs text-gray-500">Non-Compliant</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-brand-600">{overview.compliancePolicies}</p>
            <p className="text-xs text-gray-500">Compliance Policies</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{overview.configurationProfiles}</p>
            <p className="text-xs text-gray-500">Config Profiles</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search devices, users, serial numbers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input-field pl-10" />
        </div>
        <select value={complianceFilter} onChange={(e) => { setComplianceFilter(e.target.value); setPage(1); }} className="input-field w-40">
          <option value="">All Compliance</option>
          <option value="compliant">Compliant</option>
          <option value="noncompliant">Non-Compliant</option>
          <option value="inGracePeriod">Grace Period</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={osFilter} onChange={(e) => { setOsFilter(e.target.value); setPage(1); }} className="input-field w-36">
          <option value="">All OS</option>
          <option value="Windows">Windows</option>
          <option value="iOS">iOS</option>
          <option value="Android">Android</option>
          <option value="macOS">macOS</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">OS</th>
              <th className="px-4 py-3">Compliance</th>
              <th className="px-4 py-3">Encrypted</th>
              <th className="px-4 py-3">Ownership</th>
              <th className="px-4 py-3">Last Sync</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading devices...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                <Monitor className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                No devices found
              </td></tr>
            ) : (
              devices.map((device: any) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <OsIcon os={device.operatingSystem} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{device.deviceName}</p>
                        <p className="text-xs text-gray-500">{device.manufacturer} {device.model}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{device.userDisplayName || '-'}</p>
                    <p className="text-xs text-gray-500">{device.userPrincipalName || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {device.operatingSystem} {device.osVersion}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', complianceColors[device.complianceState] || 'bg-gray-100 text-gray-700')}>
                      {device.complianceState === 'compliant' && <ShieldCheck className="inline h-3 w-3 mr-1" />}
                      {device.complianceState === 'noncompliant' && <ShieldX className="inline h-3 w-3 mr-1" />}
                      {device.complianceState === 'inGracePeriod' && <ShieldAlert className="inline h-3 w-3 mr-1" />}
                      {device.complianceState}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {device.isEncrypted ? <Lock className="h-4 w-4 text-green-500" /> : <Unlock className="h-4 w-4 text-red-400" />}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-gray-100 text-gray-600">{device.ownerType}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{timeAgo(device.lastSyncDateTime)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} devices)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary py-1 px-3 text-sm">Prev</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="btn-secondary py-1 px-3 text-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
