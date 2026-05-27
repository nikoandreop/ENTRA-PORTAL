import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, getUserStats } from '@/services/users';
import { api } from '@/services/api';
import { statusColor, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Search, Shield, ShieldOff, ArrowLeft, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';

export function UserListPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [mfaFilter, setMfaFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', tenantId, search, page, mfaFilter, enabledFilter],
    queryFn: () => getUsers(tenantId!, {
      search: search || undefined,
      page: String(page),
      pageSize: '50',
      mfaEnabled: mfaFilter || undefined,
      accountEnabled: enabledFilter || undefined,
    } as any),
    enabled: !!tenantId,
  });

  const { data: stats } = useQuery({
    queryKey: ['user-stats', tenantId],
    queryFn: () => getUserStats(tenantId!),
    enabled: !!tenantId,
  });

  const users = data?.data || [];
  const pagination = data?.pagination;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ displayName: '', userPrincipalName: '', password: '', department: '', jobTitle: '' });
  const [createMsg, setCreateMsg] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/tenants/${tenantId}/users`, newUser);
      return data.data;
    },
    onSuccess: (result) => {
      setCreateMsg(`User ${result.displayName} created. They will appear after the next sync.`);
      setNewUser({ displayName: '', userPrincipalName: '', password: '', department: '', jobTitle: '' });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['users', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['user-stats', tenantId] });
    },
    onError: (err: any) => setCreateMsg(err.response?.data?.error?.message || 'Failed to create user'),
  });

  return (
    <div className="space-y-6">
      <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenant
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage Entra ID users for this tenant</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <UserPlus className="h-4 w-4" /> Create User
        </button>
      </div>

      {createMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200">
          {createMsg}
          <button onClick={() => setCreateMsg('')} className="ml-2 text-green-900 font-medium">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <div className="card border-brand-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New User</h3>
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Name *</label>
                <input required value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} className="input-field" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email (UPN) *</label>
                <input required type="email" value={newUser.userPrincipalName} onChange={(e) => setNewUser({ ...newUser, userPrincipalName: e.target.value })} className="input-field" placeholder="john@contoso.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                <input required type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="input-field" placeholder="Min 8 characters" minLength={8} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <input value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} className="input-field" placeholder="IT" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                <input value={newUser.jobTitle} onChange={(e) => setNewUser({ ...newUser, jobTitle: e.target.value })} className="input-field" placeholder="Engineer" />
              </div>
            </div>
            <p className="text-xs text-gray-400">User will be forced to change password on first sign-in.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="btn-primary text-sm">
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total Users</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.enabled}</p>
            <p className="text-xs text-gray-500">Enabled</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-brand-600">{stats.mfaEnabled}</p>
            <p className="text-xs text-gray-500">MFA Enabled</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.atRisk}</p>
            <p className="text-xs text-gray-500">At Risk</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, email, or UPN..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input-field pl-10" />
        </div>
        <select value={enabledFilter} onChange={(e) => { setEnabledFilter(e.target.value); setPage(1); }} className="input-field w-36">
          <option value="">All Status</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <select value={mfaFilter} onChange={(e) => { setMfaFilter(e.target.value); setPage(1); }} className="input-field w-36">
          <option value="">All MFA</option>
          <option value="true">MFA On</option>
          <option value="false">MFA Off</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">MFA</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Last Sign-In</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No users found</td></tr>
            ) : (
              users.map((user: any) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/tenants/${tenantId}/users/${user.id}`} className="hover:text-brand-600">
                      <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                      <p className="text-xs text-gray-500">{user.userPrincipalName}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.department || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', user.accountEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                      {user.accountEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.mfaEnabled ? (
                      <Shield className="h-4 w-4 text-green-500" />
                    ) : (
                      <ShieldOff className="h-4 w-4 text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', statusColor(user.riskLevel === 'none' ? 'active' : user.riskLevel === 'low' ? 'onboarding' : 'disconnected'))}>
                      {user.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{timeAgo(user.lastSignIn)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} users)
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary p-2"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="btn-secondary p-2"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
