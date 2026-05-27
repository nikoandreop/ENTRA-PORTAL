import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ArrowLeft, Building2, Check, Loader2 } from 'lucide-react';

const MODULES = [
  { id: 'users', label: 'User Management', description: 'Sync and manage Entra ID users' },
  { id: 'groups', label: 'Group Management', description: 'Manage security and M365 groups' },
  { id: 'conditional-access', label: 'Conditional Access', description: 'Monitor CA policies' },
  { id: 'mfa', label: 'MFA Monitoring', description: 'Track MFA adoption and methods' },
  { id: 'licenses', label: 'License Management', description: 'Monitor license utilization' },
  { id: 'audit-logs', label: 'Audit Logs', description: 'Aggregate directory audit logs' },
  { id: 'security-alerts', label: 'Security Alerts', description: 'Real-time security monitoring' },
];

export function OnboardTenantPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [enabledModules, setEnabledModules] = useState(['users', 'groups', 'security-alerts']);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);

  const { data: consentConfig } = useQuery({
    queryKey: ['consent-config'],
    queryFn: async () => { const { data } = await api.get('/tenants/consent/config'); return data.data; },
  });

  useEffect(() => {
    const adminConsent = searchParams.get('admin_consent');
    const tenant = searchParams.get('tenant');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDesc || errorParam);
      return;
    }

    if (adminConsent && tenant && state) {
      setCompleting(true);
      api.post('/tenants/consent/complete', { state, tenant, admin_consent: adminConsent })
        .then(({ data }) => navigate(`/tenants/${data.data.id}`))
        .catch((err) => {
          setError(err.response?.data?.error?.message || 'Failed to complete onboarding');
          setCompleting(false);
        });
    }
  }, [searchParams, navigate]);

  const consentMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/tenants/consent/start', { name, enabledModules });
      return data.data;
    },
    onSuccess: (data) => {
      window.location.href = data.consentUrl;
    },
    onError: (err: any) => setError(err.response?.data?.error?.message || 'Failed to start consent'),
  });

  function toggleModule(id: string) {
    setEnabledModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }
    consentMutation.mutate();
  }

  if (completing) {
    return (
      <div className="mx-auto max-w-2xl mt-20 text-center">
        <div className="card">
          <Loader2 className="mx-auto h-10 w-10 text-brand-500 animate-spin mb-4" />
          <h2 className="text-lg font-bold text-gray-900">Connecting tenant...</h2>
          <p className="text-sm text-gray-500 mt-1">Verifying consent and pulling tenant info from Microsoft.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to tenants
      </Link>

      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Onboard Tenant</h1>
            <p className="text-sm text-gray-500">Step {step} of 2</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-brand-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold">Tenant Details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Contoso Ltd" />
                <p className="text-xs text-gray-400 mt-1">Friendly name for this tenant in the dashboard</p>
              </div>

              <h3 className="text-sm font-semibold text-gray-700 mt-4">Modules</h3>
              <div className="space-y-2">
                {MODULES.map((mod) => (
                  <label key={mod.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${enabledModules.includes(mod.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={enabledModules.includes(mod.id)} onChange={() => toggleModule(mod.id)} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{mod.label}</p>
                      <p className="text-xs text-gray-500">{mod.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold">Connect to Microsoft</h2>
              {consentConfig?.enabled ? (
                <div className="space-y-4">
                  <div className="rounded-lg border-2 border-dashed border-brand-200 bg-brand-50 p-6 text-center">
                    <svg width="40" height="40" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    <p className="text-sm font-medium text-gray-900 mb-1">Grant admin consent for "{name}"</p>
                    <p className="text-xs text-gray-500 mb-4">
                      Sign in as a Global Admin of the customer's tenant. Microsoft will handle the permissions approval.
                      The tenant ID, domain, and connection will be set up automatically.
                    </p>
                    <button type="submit" disabled={consentMutation.isPending} className="btn-primary">
                      {consentMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</> : 'Approve with Microsoft'}
                    </button>
                  </div>

                  <div className="text-xs text-gray-400">
                    <p className="font-medium text-gray-500 mb-1">Permissions requested (read-only where possible):</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>User &amp; Group management</li>
                      <li>Conditional Access policies (read)</li>
                      <li>Audit logs &amp; directory data (read)</li>
                      <li>Intune device management</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-800">One-click onboarding not configured</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Set MSP_CLIENT_ID and MSP_CLIENT_SECRET in .env to enable automatic admin consent.
                    You need a multi-tenant app registration in your MSP Entra ID tenant.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-between pt-4 border-t">
            {step > 1 ? <button type="button" onClick={() => setStep(1)} className="btn-secondary">Back</button> : <div />}
            {step === 1 && <button type="submit" className="btn-primary">Continue <Check className="h-4 w-4" /></button>}
          </div>
        </form>
      </div>
    </div>
  );
}
