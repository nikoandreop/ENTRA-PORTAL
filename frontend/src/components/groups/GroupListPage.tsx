import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';
import { Search, ArrowLeft, Users } from 'lucide-react';

export function GroupListPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['groups', tenantId, search],
    queryFn: async () => {
      const { data } = await api.get(`/tenants/${tenantId}/groups`, { params: { search: search || undefined } });
      return data;
    },
    enabled: !!tenantId,
  });

  const groups = data?.data || [];

  return (
    <div className="space-y-6">
      <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenant
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
        <p className="text-sm text-gray-500">Manage Entra ID groups</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search groups..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" />
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Membership</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Owners</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No groups found</td></tr>
            ) : (
              groups.map((group: any) => (
                <tr key={group.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{group.displayName}</p>
                    <p className="text-xs text-gray-500 truncate max-w-xs">{group.description || '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-gray-100 text-gray-700">{group.groupType}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', group.membershipType === 'dynamic' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                      {group.membershipType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Users className="h-3.5 w-3.5" /> {group.memberCount}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{group.ownerCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
