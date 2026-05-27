import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { severityColor, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { ArrowLeft, Bell, Check, CheckCheck } from 'lucide-react';

export function AlertListPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', tenantId, severityFilter, statusFilter],
    queryFn: async () => {
      const { data } = await api.get(`/tenants/${tenantId}/alerts`, {
        params: { severity: severityFilter || undefined, status: statusFilter || undefined },
      });
      return data;
    },
    enabled: !!tenantId,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/tenants/${tenantId}/alerts/${alertId}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', tenantId] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/tenants/${tenantId}/alerts/${alertId}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', tenantId] }),
  });

  const alerts = data?.data || [];

  return (
    <div className="space-y-6">
      <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenant
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Alerts</h1>
        <p className="text-sm text-gray-500">Monitor and respond to security events</p>
      </div>

      <div className="flex gap-3">
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="input-field w-40">
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-40">
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">No alerts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert: any) => (
            <div key={alert.id} className={cn('card border-l-4', alert.severity === 'critical' ? 'border-l-red-500' : alert.severity === 'high' ? 'border-l-orange-500' : alert.severity === 'medium' ? 'border-l-yellow-500' : 'border-l-blue-500')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('badge', severityColor(alert.severity))}>{alert.severity}</span>
                    <span className="badge bg-gray-100 text-gray-600">{alert.type}</span>
                    <span className={cn('badge', alert.status === 'new' ? 'bg-blue-100 text-blue-700' : alert.status === 'acknowledged' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700')}>
                      {alert.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900">{alert.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{alert.description}</p>
                  <p className="mt-2 text-xs text-gray-400">Detected {timeAgo(alert.detectedAt)}</p>
                </div>
                {alert.status !== 'resolved' && (
                  <div className="flex gap-2">
                    {alert.status === 'new' && (
                      <button onClick={() => acknowledgeMutation.mutate(alert.id)} className="btn-secondary text-xs py-1 px-2">
                        <Check className="h-3 w-3" /> Ack
                      </button>
                    )}
                    <button onClick={() => resolveMutation.mutate(alert.id)} className="btn-secondary text-xs py-1 px-2">
                      <CheckCheck className="h-3 w-3" /> Resolve
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
