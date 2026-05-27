import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';
import { ArrowLeft, Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

export function PolicyListPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['policies', tenantId],
    queryFn: async () => {
      const { data } = await api.get(`/tenants/${tenantId}/policies`);
      return data;
    },
    enabled: !!tenantId,
  });

  const policies = data?.data || [];

  const stateIcons: Record<string, any> = {
    enabled: ShieldCheck,
    disabled: ShieldX,
    enabledForReportingButNotEnforced: ShieldAlert,
  };

  const stateColors: Record<string, string> = {
    enabled: 'bg-green-100 text-green-800',
    disabled: 'bg-gray-100 text-gray-600',
    enabledForReportingButNotEnforced: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="space-y-6">
      <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenant
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conditional Access Policies</h1>
        <p className="text-sm text-gray-500">Monitor and manage access control policies</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{policies.filter((p: any) => p.state === 'enabled').length}</p>
          <p className="text-xs text-gray-500">Enabled</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{policies.filter((p: any) => p.state === 'enabledForReportingButNotEnforced').length}</p>
          <p className="text-xs text-gray-500">Report-Only</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold text-gray-500">{policies.filter((p: any) => p.state === 'disabled').length}</p>
          <p className="text-xs text-gray-500">Disabled</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading policies...</div>
      ) : policies.length === 0 ? (
        <div className="card text-center py-12">
          <Shield className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">No conditional access policies found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy: any) => {
            const Icon = stateIcons[policy.state] || Shield;
            return (
              <div key={policy.id} className="card flex items-start gap-4">
                <Icon className={cn('h-6 w-6 mt-0.5', policy.state === 'enabled' ? 'text-green-500' : policy.state === 'disabled' ? 'text-gray-400' : 'text-yellow-500')} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{policy.displayName}</h3>
                    <span className={cn('badge', stateColors[policy.state])}>{policy.state}</span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>Grant: {policy.grantControls?.builtInControls?.join(', ') || 'None'}</span>
                    <span>Users: {policy.conditions?.userInclude?.length || 0} included</span>
                    <span>Apps: {policy.conditions?.applicationInclude?.length || 0} included</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
