import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUser } from '@/services/users';
import { statusColor, formatDate, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { ArrowLeft, Shield, ShieldOff, Mail, Briefcase, Building, Clock, Key } from 'lucide-react';

export function UserDetailPage() {
  const { tenantId, userId } = useParams<{ tenantId: string; userId: string }>();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', tenantId, userId],
    queryFn: () => getUser(tenantId!, userId!),
    enabled: !!tenantId && !!userId,
  });

  if (isLoading) return <div className="text-gray-500">Loading...</div>;
  if (!user) return <div className="text-gray-500">User not found</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={`/tenants/${tenantId}/users`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600 text-xl font-bold">
              {user.displayName.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{user.displayName}</h1>
              <p className="text-sm text-gray-500">{user.userPrincipalName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={cn('badge', user.accountEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
              {user.accountEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className={cn('badge', statusColor(user.riskLevel === 'none' ? 'active' : 'disconnected'))}>
              Risk: {user.riskLevel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Profile</h2>
          <dl className="space-y-3">
            <Detail icon={Mail} label="Email" value={user.mail || 'Not set'} />
            <Detail icon={Briefcase} label="Job Title" value={user.jobTitle || 'Not set'} />
            <Detail icon={Building} label="Department" value={user.department || 'Not set'} />
            <Detail icon={Clock} label="Created" value={formatDate(user.createdDateTime)} />
            <Detail icon={Clock} label="Last Sign-In" value={user.lastSignIn ? timeAgo(user.lastSignIn) : 'Never'} />
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Security</h2>
          <div className="mb-4 flex items-center gap-3 rounded-lg border p-3">
            {user.mfaEnabled ? (
              <Shield className="h-8 w-8 text-green-500" />
            ) : (
              <ShieldOff className="h-8 w-8 text-red-400" />
            )}
            <div>
              <p className="font-medium text-gray-900">{user.mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}</p>
              <p className="text-sm text-gray-500">
                {user.mfaMethods.length > 0 ? user.mfaMethods.join(', ') : 'No methods configured'}
              </p>
            </div>
          </div>

          {user.assignedLicenses.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Licenses</h3>
              <div className="space-y-1">
                {user.assignedLicenses.map((lic: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <Key className="h-3.5 w-3.5 text-gray-400" />
                    {lic}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 text-xs text-gray-400">
            Entra Object ID: <span className="font-mono">{user.entraObjectId}</span>
          </div>
          <div className="text-xs text-gray-400">
            Last synced: {timeAgo(user.syncedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="text-sm text-gray-900">{value}</dd>
      </div>
    </div>
  );
}
