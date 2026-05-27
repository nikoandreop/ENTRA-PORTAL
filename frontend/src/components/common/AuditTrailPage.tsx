import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { cn } from '@/utils/cn';
import { ArrowLeft, FileText, Search, Filter, CheckCircle, XCircle } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  auth: 'bg-purple-100 text-purple-700',
  tenant: 'bg-blue-100 text-blue-700',
  user: 'bg-green-100 text-green-700',
  group: 'bg-teal-100 text-teal-700',
  policy: 'bg-orange-100 text-orange-700',
  alert: 'bg-red-100 text-red-700',
  agent: 'bg-indigo-100 text-indigo-700',
  settings: 'bg-gray-100 text-gray-700',
};

export function AuditTrailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [category, setCategory] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);

  const isGlobal = !tenantId;
  const endpoint = isGlobal
    ? '/tenants/_/audit/global'
    : `/tenants/${tenantId}/audit`;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-trail', tenantId, category, result, page],
    queryFn: async () => {
      const { data } = await api.get(endpoint, {
        params: {
          category: category || undefined,
          result: result || undefined,
          page: String(page),
          pageSize: '50',
        },
      });
      return data;
    },
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {tenantId && (
        <Link to={`/tenants/${tenantId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to tenant
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isGlobal ? 'Global Audit Trail' : 'Audit Trail'}
        </h1>
        <p className="text-sm text-gray-500">
          {isGlobal
            ? 'All operator actions across all tenants'
            : 'Track all operator actions for this tenant'}
        </p>
      </div>

      <div className="flex gap-3">
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="input-field w-40"
        >
          <option value="">All Categories</option>
          <option value="auth">Authentication</option>
          <option value="tenant">Tenant</option>
          <option value="user">User</option>
          <option value="group">Group</option>
          <option value="policy">Policy</option>
          <option value="alert">Alert</option>
          <option value="agent">Agent</option>
          <option value="settings">Settings</option>
        </select>
        <select
          value={result}
          onChange={(e) => { setResult(e.target.value); setPage(1); }}
          className="input-field w-36"
        >
          <option value="">All Results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Initiated By</th>
              {isGlobal && <th className="px-4 py-3">Tenant</th>}
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={isGlobal ? 7 : 6} className="px-4 py-8 text-center text-gray-500">Loading audit trail...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={isGlobal ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                <FileText className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                No audit entries found
              </td></tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', CATEGORY_COLORS[log.category] || 'bg-gray-100 text-gray-700')}>
                      {log.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-gray-700">{log.initiatedBy}</td>
                  {isGlobal && (
                    <td className="px-4 py-3 text-gray-500">{log.tenantName || '-'}</td>
                  )}
                  <td className="px-4 py-3">
                    {log.result === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} entries)
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary py-1 px-3 text-sm">Prev</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="btn-secondary py-1 px-3 text-sm">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
