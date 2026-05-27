import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { api } from '@/services/api';
import { changePassword } from '@/services/auth';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/formatters';
import { Users, Shield, Key, Server, UserPlus, Trash2 } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Platform configuration and user management</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileCard />
        <PasswordCard />
        <UserManagementCard />
        <SystemInfoCard />
      </div>
    </div>
  );
}

function ProfileCard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-brand-500" /> My Profile
      </h2>
      <dl className="space-y-3">
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Email</dt>
          <dd className="text-sm font-medium text-gray-900">{user?.email}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Display Name</dt>
          <dd className="text-sm font-medium text-gray-900">{user?.displayName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Role</dt>
          <dd><span className="badge bg-brand-100 text-brand-700">{user?.role}</span></dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Tenant Access</dt>
          <dd className="text-sm font-medium text-gray-900">
            {user?.tenantAccess?.includes('*') ? 'All Tenants' : `${user?.tenantAccess?.length || 0} tenants`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setMessage('Password updated successfully');
      setError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to change password');
      setMessage('');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 12) { setError('Password must be at least 12 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    mutation.mutate();
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Key className="h-5 w-5 text-brand-500" /> Change Password
      </h2>

      {message && <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700 border border-green-200">{message}</div>}
      {error && <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" required minLength={12} />
          <p className="text-xs text-gray-400 mt-1">Minimum 12 characters</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" required />
        </div>
        <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
          {mutation.isPending ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

function UserManagementCard() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [newPass, setNewPass] = useState('');

  const { data: users } = useQuery({
    queryKey: ['dashboard-users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data.data;
    },
    enabled: currentUser?.role === 'superadmin' || currentUser?.role === 'admin',
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/users', { email: newEmail, displayName: newName, role: newRole, password: newPass });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-users'] });
      setShowAddForm(false);
      setNewEmail('');
      setNewName('');
      setNewRole('viewer');
      setNewPass('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/auth/users/${userId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-users'] }),
  });

  if (currentUser?.role !== 'superadmin' && currentUser?.role !== 'admin') {
    return null;
  }

  return (
    <div className="card lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-brand-500" /> Dashboard Users
        </h2>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-secondary text-sm">
          <UserPlus className="h-4 w-4" /> Add User
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="mb-4 rounded-lg border p-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input-field">
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
                {currentUser?.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className="input-field" required minLength={12} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={addMutation.isPending} className="btn-primary text-sm">
              {addMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(users || []).map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{u.displayName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('badge', u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-blue-100 text-blue-700' : u.role === 'operator' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="badge bg-gray-100 text-gray-600">
                    {u.authProvider === 'microsoft' ? 'SSO' : 'Local'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.lastLogin ? timeAgo(u.lastLogin) : 'Never'}</td>
                <td className="px-4 py-3">
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => { if (confirm(`Delete ${u.email}?`)) deleteMutation.mutate(u.id); }}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SystemInfoCard() {
  const { data: health } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const { data } = await api.get('/health');
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Server className="h-5 w-5 text-brand-500" /> System Status
      </h2>
      <dl className="space-y-3">
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">API Status</dt>
          <dd>
            <span className={cn('badge', health?.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
              {health?.status || 'checking...'}
            </span>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Database</dt>
          <dd>
            <span className={cn('badge', health?.database === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
              {health?.database || 'checking...'}
            </span>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Version</dt>
          <dd className="text-sm font-medium text-gray-900">{health?.version || '-'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sm text-gray-500">Server Time</dt>
          <dd className="text-sm font-mono text-gray-700">{health?.timestamp ? new Date(health.timestamp).toLocaleString() : '-'}</dd>
        </div>
      </dl>
    </div>
  );
}
