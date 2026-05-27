import { useQuery } from '@tanstack/react-query';
import { getDashboardOverview, getComplianceOverview } from '@/services/dashboard';
import { statusColor, severityColor, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Building2, Users, AlertTriangle, Shield, Activity, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: getDashboardOverview,
  });

  const { data: compliance } = useQuery({
    queryKey: ['dashboard-compliance'],
    queryFn: getComplianceOverview,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading dashboard...</div></div>;
  }

  const tenants = overview?.tenants || {};
  const users = overview?.users || {};
  const alerts = overview?.alerts || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">MSP overview across all managed tenants</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Tenants" value={tenants.total || 0} sub={`${tenants.active || 0} active`} color="blue" />
        <StatCard icon={Users} label="Total Users" value={users.total || 0} sub={`${users.mfa_enabled || 0} MFA enabled`} color="green" />
        <StatCard icon={AlertTriangle} label="Open Alerts" value={alerts.new_alerts || 0} sub={`${alerts.critical || 0} critical`} color={alerts.critical > 0 ? 'red' : 'yellow'} />
        <StatCard icon={Activity} label="Agents Online" value={tenants.agents_connected || 0} sub={`${tenants.agents_disconnected || 0} offline`} color={tenants.agents_disconnected > 0 ? 'yellow' : 'green'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Alerts</h2>
          {overview?.recentAlerts?.length === 0 ? (
            <p className="text-sm text-gray-500">No recent alerts</p>
          ) : (
            <div className="space-y-3">
              {(overview?.recentAlerts || []).slice(0, 5).map((alert: any) => (
                <div key={alert.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className={cn('badge mt-0.5', severityColor(alert.severity))}>
                    {alert.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                    <p className="text-xs text-gray-500">{alert.tenantName} &middot; {timeAgo(alert.detectedAt)}</p>
                  </div>
                  <span className={cn('badge', statusColor(alert.status))}>{alert.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Compliance Overview</h2>
          {!compliance || compliance.length === 0 ? (
            <p className="text-sm text-gray-500">No active tenants</p>
          ) : (
            <div className="space-y-3">
              {compliance.map((t: any) => (
                <Link key={t.tenantId} to={`/tenants/${t.tenantId}`} className="block rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{t.tenantName}</span>
                    <span className={cn('badge', t.complianceScore >= 80 ? 'bg-green-100 text-green-800' : t.complianceScore >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')}>
                      {t.complianceScore}%
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span><Shield className="inline h-3 w-3 mr-1" />MFA: {t.mfaCoverage}%</span>
                    <span><TrendingUp className="inline h-3 w-3 mr-1" />CA Policies: {t.conditionalAccessPolicies}</span>
                    <span><AlertTriangle className="inline h-3 w-3 mr-1" />Alerts: {t.openAlerts}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', colorMap[color])}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
    </div>
  );
}
