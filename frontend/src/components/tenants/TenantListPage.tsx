import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getTenants } from '@/services/tenants';
import { useTenantStore } from '@/store/tenant';
import { statusColor, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Plus, Search, Building2, Users, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

export function TenantListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const setSelectedTenant = useTenantStore((s) => s.setSelectedTenant);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', search, statusFilter],
    queryFn: () => getTenants({ search: search || undefined, status: statusFilter || undefined }),
  });

  const tenants = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500">Manage all connected Entra ID tenants</p>
        </div>
        <Link to="/tenants/onboard" className="btn-primary">
          <Plus className="h-4 w-4" /> Onboard Tenant
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-40"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="onboarding">Onboarding</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading tenants...</div>
      ) : tenants.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">No tenants found</p>
          <Link to="/tenants/onboard" className="btn-primary mt-4 inline-flex">
            Onboard your first tenant
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant: any) => (
            <Link
              key={tenant.id}
              to={`/tenants/${tenant.id}`}
              onClick={() => setSelectedTenant(tenant.id)}
              className="card group transition-all hover:shadow-md hover:border-brand-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600">{tenant.name}</h3>
                  <p className="text-sm text-gray-500">{tenant.domain}</p>
                </div>
                <span className={cn('badge', statusColor(tenant.status))}>{tenant.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
                <div>
                  <div className="flex items-center justify-center gap-1 text-sm font-semibold text-gray-900">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    {tenant.userCount}
                  </div>
                  <p className="text-xs text-gray-500">Users</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-sm font-semibold text-gray-900">
                    <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />
                    {tenant.alertCount}
                  </div>
                  <p className="text-xs text-gray-500">Alerts</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-sm font-semibold">
                    {tenant.agentStatus === 'connected' ? (
                      <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-green-700">Online</span></>
                    ) : (
                      <><WifiOff className="h-3.5 w-3.5 text-red-500" /><span className="text-red-700">Offline</span></>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Agent</p>
                </div>
              </div>
              {tenant.lastSyncAt && (
                <p className="mt-3 text-xs text-gray-400 border-t pt-2">Last sync: {timeAgo(tenant.lastSyncAt)}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
