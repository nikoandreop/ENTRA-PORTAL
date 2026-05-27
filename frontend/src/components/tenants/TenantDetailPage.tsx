import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenant } from '@/services/tenants';
import { api } from '@/services/api';
import { useTenantStore } from '@/store/tenant';
import { statusColor, formatDate, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Users, Shield, Bell, ArrowLeft, ClipboardList, Monitor, RefreshCw, Loader2, Wifi, WifiOff } from 'lucide-react';

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const setSelectedTenant = useTenantStore((s) => s.setSelectedTenant);
  const queryClient = useQueryClient();
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    if (tenantId) setSelectedTenant(tenantId);
  }, [tenantId, setSelectedTenant]);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId!),
    enabled: !!tenantId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/tenants/${tenantId}/sync`);
      return data.data;
    },
    onSuccess: (result) => {
      setSyncMsg(`Synced: ${result.users} users, ${result.groups} groups, ${result.policies} policies, ${result.devices} devices, ${result.licenses} licenses`);
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
    onError: (err: any) => setSyncMsg(`Sync failed: ${err.response?.data?.error?.message || err.message}`),
  });

  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  if (!tenant) return <div className="text-gray-500">Tenant not found</div>;

  const modules = [
    { name: 'Users', path: 'users', icon: Users, count: tenant.userCount, description: 'Manage Entra ID users' },
    { name: 'Groups', path: 'groups', icon: Users, count: tenant.groupCount, description: 'Manage security and M365 groups' },
    { name: 'Conditional Access', path: 'policies', icon: Shield, count: null, description: 'View and manage CA policies' },
    { name: 'Security Alerts', path: 'alerts', icon: Bell, count: tenant.alertCount, description: 'Monitor security events' },
    { name: 'Intune Devices', path: 'devices', icon: Monitor, count: null, description: 'Manage endpoints and compliance' },
    { name: 'Audit Trail', path: 'audit', icon: ClipboardList, count: null, description: 'Track all operator actions' },
  ];

  return (
    <div className="space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenants
      </Link>

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <p className="text-sm text-gray-500">{tenant.domain}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('badge', statusColor(tenant.status))}>{tenant.status}</span>
            <span className={cn('badge flex items-center gap-1', statusColor(tenant.agentStatus))}>
              {tenant.agentStatus === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {tenant.agentStatus}
            </span>
            <button
              onClick={() => { setSyncMsg(''); syncMutation.mutate(); }}
              disabled={syncMutation.isPending}
              className="btn-primary text-sm"
            >
              {syncMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing...</> : <><RefreshCw className="h-4 w-4" /> Sync Now</>}
            </button>
          </div>
        </div>

        {syncMsg && (
          <div className={cn('mt-3 rounded-md p-3 text-sm border', syncMsg.startsWith('Sync failed') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200')}>
            {syncMsg}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Directory ID</p>
            <p className="text-sm font-mono text-gray-700 truncate">{tenant.entraDirectoryId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm text-gray-700">{formatDate(tenant.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Sync</p>
            <p className="text-sm text-gray-700">{tenant.lastSyncAt ? timeAgo(tenant.lastSyncAt) : 'Never'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sync Interval</p>
            <p className="text-sm text-gray-700">{tenant.config?.syncIntervalMinutes || 15} minutes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modules.map((mod) => (
          <Link
            key={mod.path}
            to={`/tenants/${tenantId}/${mod.path}`}
            className="card group flex items-center gap-4 transition-all hover:shadow-md hover:border-brand-200"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-100">
              <mod.icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 group-hover:text-brand-600">{mod.name}</h3>
                {mod.count !== null && (
                  <span className="badge bg-gray-100 text-gray-700">{mod.count}</span>
                )}
              </div>
              <p className="text-sm text-gray-500">{mod.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
