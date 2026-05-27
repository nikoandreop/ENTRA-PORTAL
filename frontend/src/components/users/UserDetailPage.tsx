import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUser } from '@/services/users';
import { api } from '@/services/api';
import { statusColor, formatDate, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { ArrowLeft, Shield, ShieldOff, Mail, Briefcase, Building, Clock, Key, UserX, UserCheck, RotateCcw, Plus, Minus } from 'lucide-react';

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

        <div className="space-y-4">
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
            <div className="text-xs text-gray-400">
              Entra Object ID: <span className="font-mono">{user.entraObjectId}</span>
            </div>
            <div className="text-xs text-gray-400">
              Last synced: {timeAgo(user.syncedAt)}
            </div>
          </div>

          <UserActions tenantId={tenantId!} userId={userId!} user={user} />
          <LicenseManager tenantId={tenantId!} userId={userId!} assignedLicenses={user.assignedLicenses} />
        </div>
      </div>
    </div>
  );
}

function UserActions({ tenantId, userId, user }: { tenantId: string; userId: string; user: any }) {
  const [actionMsg, setActionMsg] = useState('');

  const disableMutation = useMutation({
    mutationFn: () => api.patch(`/tenants/${tenantId}/users/${userId}/disable`),
    onSuccess: () => setActionMsg('Disable request sent'),
  });
  const enableMutation = useMutation({
    mutationFn: () => api.patch(`/tenants/${tenantId}/users/${userId}/enable`),
    onSuccess: () => setActionMsg('Enable request sent'),
  });
  const resetMutation = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/users/${userId}/reset-password`),
    onSuccess: () => setActionMsg('Password reset request sent'),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tenants/${tenantId}/users/${userId}`),
    onSuccess: () => setActionMsg('Delete request sent'),
  });

  return (
    <div className="card">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Actions</h2>
      {actionMsg && <div className="mb-3 rounded-md bg-green-50 p-2 text-sm text-green-700 border border-green-200">{actionMsg}</div>}
      <div className="flex flex-wrap gap-2">
        {user.accountEnabled ? (
          <button onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending} className="btn-secondary text-sm">
            <UserX className="h-4 w-4" /> Disable Account
          </button>
        ) : (
          <button onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending} className="btn-secondary text-sm">
            <UserCheck className="h-4 w-4" /> Enable Account
          </button>
        )}
        <button onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending} className="btn-secondary text-sm">
          <RotateCcw className="h-4 w-4" /> Reset Password
        </button>
        <button onClick={() => { if (confirm(`Delete ${user.userPrincipalName}? This cannot be undone.`)) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} className="btn-danger text-sm">
          Delete User
        </button>
      </div>
    </div>
  );
}

function LicenseManager({ tenantId, userId, assignedLicenses }: { tenantId: string; userId: string; assignedLicenses: any[] }) {
  const queryClient = useQueryClient();
  const [actionMsg, setActionMsg] = useState('');

  const { data: licenseData } = useQuery({
    queryKey: ['user-licenses', tenantId, userId],
    queryFn: async () => { const { data } = await api.get(`/tenants/${tenantId}/users/${userId}/licenses`); return data.data; },
  });

  const assignMutation = useMutation({
    mutationFn: (skuId: string) => api.post(`/tenants/${tenantId}/users/${userId}/licenses/assign`, { skuId }),
    onSuccess: () => { setActionMsg('License assigned'); queryClient.invalidateQueries({ queryKey: ['user-licenses'] }); },
    onError: (err: any) => setActionMsg(err.response?.data?.error?.message || 'Failed'),
  });

  const removeMutation = useMutation({
    mutationFn: (skuId: string) => api.post(`/tenants/${tenantId}/users/${userId}/licenses/remove`, { skuId }),
    onSuccess: () => { setActionMsg('License removed'); queryClient.invalidateQueries({ queryKey: ['user-licenses'] }); },
    onError: (err: any) => setActionMsg(err.response?.data?.error?.message || 'Failed'),
  });

  const available = licenseData?.available || [];

  return (
    <div className="card">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Licenses</h2>
      {actionMsg && <div className="mb-3 rounded-md bg-blue-50 p-2 text-sm text-blue-700 border border-blue-200">{actionMsg}</div>}

      {assignedLicenses.length > 0 ? (
        <div className="mb-4 space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Assigned</h3>
          {assignedLicenses.map((lic: any, i: number) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-2">
              <div className="flex items-center gap-2 text-sm">
                <Key className="h-4 w-4 text-brand-500" />
                <span className="text-gray-900">{typeof lic === 'string' ? lic : lic.skuId || JSON.stringify(lic)}</span>
              </div>
              <button
                onClick={() => removeMutation.mutate(typeof lic === 'string' ? lic : lic.skuId)}
                disabled={removeMutation.isPending}
                className="text-red-500 hover:text-red-700 p-1"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-500">No licenses assigned</p>
      )}

      {available.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Available Licenses</h3>
          {available.map((lic: any) => (
            <div key={lic.skuId} className="flex items-center justify-between rounded-lg border p-2 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">{lic.displayName || lic.skuPartNumber}</p>
                <p className="text-xs text-gray-500">{lic.consumedUnits}/{lic.totalUnits} used ({lic.availableUnits} available)</p>
              </div>
              <button
                onClick={() => assignMutation.mutate(lic.skuId)}
                disabled={assignMutation.isPending || lic.availableUnits <= 0}
                className="btn-secondary text-xs py-1 px-2"
              >
                <Plus className="h-3 w-3" /> Assign
              </button>
            </div>
          ))}
        </div>
      )}
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
