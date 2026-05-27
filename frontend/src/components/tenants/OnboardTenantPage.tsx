import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { onboardTenant } from '@/services/tenants';
import { ArrowLeft, Building2, Check } from 'lucide-react';

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
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    domain: '',
    entraDirectoryId: '',
    clientId: '',
    clientSecret: '',
    adminConsent: false,
    enabledModules: ['users', 'groups', 'security-alerts'] as string[],
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: onboardTenant,
    onSuccess: (data) => navigate(`/tenants/${data.id}`),
    onError: (err: any) => setError(err.response?.data?.error?.message || 'Onboarding failed'),
  });

  function toggleModule(id: string) {
    setForm((prev) => ({
      ...prev,
      enabledModules: prev.enabledModules.includes(id)
        ? prev.enabledModules.filter((m) => m !== id)
        : [...prev.enabledModules, id],
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    mutation.mutate(form);
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
            <p className="text-sm text-gray-500">Step {step} of 3</p>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-brand-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold">Tenant Information</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Contoso Ltd" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                <input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="input-field" placeholder="contoso.onmicrosoft.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entra Directory ID</label>
                <input required value={form.entraDirectoryId} onChange={(e) => setForm({ ...form, entraDirectoryId: e.target.value })} className="input-field font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold">App Registration</h2>
              <p className="text-sm text-gray-500">Enter the credentials from the Azure App Registration configured for this tenant.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Application (Client) ID</label>
                <input required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="input-field font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                <input required type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} className="input-field" placeholder="Enter client secret" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" required checked={form.adminConsent} onChange={(e) => setForm({ ...form, adminConsent: e.target.checked })} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                <span>I confirm admin consent has been granted for the required Graph API permissions</span>
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold">Select Modules</h2>
              <p className="text-sm text-gray-500">Choose which management modules to enable for this tenant.</p>
              <div className="space-y-2">
                {MODULES.map((mod) => (
                  <label key={mod.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${form.enabledModules.includes(mod.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={form.enabledModules.includes(mod.id)} onChange={() => toggleModule(mod.id)} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{mod.label}</p>
                      <p className="text-xs text-gray-500">{mod.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-between pt-4 border-t">
            {step > 1 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary">Back</button>
            ) : <div />}
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {step < 3 ? 'Continue' : mutation.isPending ? 'Onboarding...' : 'Onboard Tenant'}
              {step === 3 && !mutation.isPending && <Check className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
