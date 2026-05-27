import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { onboardTenant } from '@/services/tenants';
import { ArrowLeft, Building2, Check, Loader2, Zap, Wrench } from 'lucide-react';

const MODULES = [
  { id: 'users', label: 'User Management', description: 'Sync and manage Entra ID users' },
  { id: 'groups', label: 'Group Management', description: 'Manage security and M365 groups' },
  { id: 'conditional-access', label: 'Conditional Access', description: 'Monitor CA policies' },
  { id: 'mfa', label: 'MFA Monitoring', description: 'Track MFA adoption and methods' },
  { id: 'licenses', label: 'License Management', description: 'Monitor license utilization' },
  { id: 'audit-logs', label: 'Audit Logs', description: 'Aggregate directory audit logs' },
  { id: 'security-alerts', label: 'Security Alerts', description: 'Real-time security monitoring' },
];

type OnboardMode = 'choose' | 'automatic' | 'manual';

export function OnboardTenantPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<OnboardMode>('choose');
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [enabledModules, setEnabledModules] = useState(['users', 'groups', 'security-alerts']);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);

  // Manual form fields
  const [manualForm, setManualForm] = useState({
    domain: '',
    entraDirectoryId: '',
    clientId: '',
    clientSecret: '',
    adminConsent: false,
  });

  const { data: consentConfig } = useQuery({
    queryKey: ['consent-config'],
    queryFn: async () => { const { data } = await api.get('/tenants/consent/config'); return data.data; },
  });

  const consentEnabled = consentConfig?.enabled;

  // Handle admin consent callback
  useEffect(() => {
    const adminConsent = searchParams.get('admin_consent');
    const tenant = searchParams.get('tenant');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    if (errorParam) { setError(errorDesc || errorParam); return; }

    if (adminConsent && tenant && state) {
      setCompleting(true);
      api.post('/tenants/consent/complete', { state, tenant, admin_consent: adminConsent })
        .then(({ data }) => navigate(`/tenants/${data.data.id}`))
        .catch((err) => { setError(err.response?.data?.error?.message || 'Failed to complete onboarding'); setCompleting(false); });
    }
  }, [searchParams, navigate]);

  const consentMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/tenants/consent/start', { name, enabledModules });
      return data.data;
    },
    onSuccess: (data) => { window.location.href = data.consentUrl; },
    onError: (err: any) => setError(err.response?.data?.error?.message || 'Failed to start consent'),
  });

  const manualMutation = useMutation({
    mutationFn: () => onboardTenant({ name, ...manualForm, enabledModules }),
    onSuccess: (data) => navigate(`/tenants/${data.id}`),
    onError: (err: any) => setError(err.response?.data?.error?.message || 'Onboarding failed'),
  });

  function toggleModule(id: string) {
    setEnabledModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
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
            <p className="text-sm text-gray-500">
              {mode === 'choose' ? 'Choose onboarding method' : mode === 'automatic' ? `Step ${step} of 2` : `Step ${step} of 3`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
        )}

        {/* Step 0: Choose method */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">How do you want to connect?</h2>

            {consentEnabled && (
              <button
                onClick={() => { setMode('automatic'); setStep(1); setError(''); }}
                className="w-full rounded-lg border-2 border-brand-200 bg-brand-50 p-5 text-left transition-all hover:border-brand-400 hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Automatic (Recommended)</p>
                    <p className="text-xs text-brand-600">One-click Microsoft admin consent</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 ml-13">
                  Click a button, sign in as the customer's Global Admin, approve permissions.
                  Tenant ID, domain, and credentials are configured automatically.
                </p>
              </button>
            )}

            <button
              onClick={() => { setMode('manual'); setStep(1); setError(''); }}
              className="w-full rounded-lg border-2 border-gray-200 bg-white p-5 text-left transition-all hover:border-gray-400 hover:shadow-md"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500">
                  <Wrench className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Manual</p>
                  <p className="text-xs text-gray-500">Enter app registration details yourself</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 ml-13">
                Create an app registration in the customer's Azure portal and paste the
                Client ID, Client Secret, and Directory ID manually.
              </p>
            </button>

            {!consentEnabled && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                Automatic onboarding available when MSP_CLIENT_ID is configured in .env
              </div>
            )}
          </div>
        )}

        {/* Automatic flow */}
        {mode === 'automatic' && (
          <form onSubmit={(e) => { e.preventDefault(); if (step === 1) { setStep(2); } else { consentMutation.mutate(); }}} className="space-y-4">
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold">Tenant Details</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Contoso Ltd" />
                </div>
                <ModuleSelector modules={enabledModules} toggle={toggleModule} />
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold">Connect to Microsoft</h2>
                <div className="rounded-lg border-2 border-dashed border-brand-200 bg-brand-50 p-6 text-center">
                  <MicrosoftLogo />
                  <p className="text-sm font-medium text-gray-900 mb-1">Grant admin consent for "{name}"</p>
                  <p className="text-xs text-gray-500 mb-4">
                    Sign in as a Global Admin of the customer's tenant and approve.
                    Everything else is configured automatically.
                  </p>
                  <button type="submit" disabled={consentMutation.isPending} className="btn-primary">
                    {consentMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</> : 'Approve with Microsoft'}
                  </button>
                </div>
                <PermissionsList />
              </>
            )}

            <NavButtons onBack={() => step === 1 ? setMode('choose') : setStep(1)} showSubmit={step === 1} />
          </form>
        )}

        {/* Manual flow */}
        {mode === 'manual' && (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (step < 3) { setStep(step + 1); return; }
            manualMutation.mutate();
          }} className="space-y-4">
            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold">Tenant Information</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Contoso Ltd" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                  <input required value={manualForm.domain} onChange={(e) => setManualForm({ ...manualForm, domain: e.target.value })} className="input-field" placeholder="contoso.onmicrosoft.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entra Directory ID (Tenant ID)</label>
                  <input required value={manualForm.entraDirectoryId} onChange={(e) => setManualForm({ ...manualForm, entraDirectoryId: e.target.value })} className="input-field font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold">App Registration Credentials</h2>
                <p className="text-sm text-gray-500">From the Azure App Registration in the customer's tenant.</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Application (Client) ID</label>
                  <input required value={manualForm.clientId} onChange={(e) => setManualForm({ ...manualForm, clientId: e.target.value })} className="input-field font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                  <input required type="password" value={manualForm.clientSecret} onChange={(e) => setManualForm({ ...manualForm, clientSecret: e.target.value })} className="input-field" />
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-800 mb-2">Required API Permissions (Application type)</p>
                  <p className="text-xs text-blue-600 mb-3">Add these in the app registration under API permissions, then click "Grant admin consent".</p>
                  <div className="grid grid-cols-1 gap-1 text-xs font-mono text-blue-700">
                    <div className="font-sans font-medium text-blue-800 mt-1">Core:</div>
                    <div className="flex justify-between"><span>User.Read.All</span><span className="text-blue-500 font-sans">List/view users</span></div>
                    <div className="flex justify-between"><span>User.ReadWrite.All</span><span className="text-blue-500 font-sans">Create/disable/delete users</span></div>
                    <div className="flex justify-between"><span>Group.Read.All</span><span className="text-blue-500 font-sans">List/view groups</span></div>
                    <div className="flex justify-between"><span>Group.ReadWrite.All</span><span className="text-blue-500 font-sans">Manage group membership</span></div>
                    <div className="flex justify-between"><span>Directory.Read.All</span><span className="text-blue-500 font-sans">Org info, domains</span></div>
                    <div className="flex justify-between"><span>Policy.Read.All</span><span className="text-blue-500 font-sans">Conditional access policies</span></div>
                    <div className="flex justify-between"><span>AuditLog.Read.All</span><span className="text-blue-500 font-sans">Directory audit logs</span></div>
                    <div className="flex justify-between"><span>Reports.Read.All</span><span className="text-blue-500 font-sans">License usage</span></div>
                    <div className="flex justify-between"><span>UserAuthenticationMethod.Read.All</span><span className="text-blue-500 font-sans">MFA status</span></div>
                    <div className="font-sans font-medium text-blue-800 mt-2">Intune:</div>
                    <div className="flex justify-between"><span>DeviceManagementManagedDevices.Read.All</span><span className="text-blue-500 font-sans">List devices</span></div>
                    <div className="flex justify-between"><span>DeviceManagementManagedDevices.ReadWrite.All</span><span className="text-blue-500 font-sans">Sync/wipe/retire</span></div>
                    <div className="flex justify-between"><span>DeviceManagementConfiguration.Read.All</span><span className="text-blue-500 font-sans">Compliance policies</span></div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" required checked={manualForm.adminConsent} onChange={(e) => setManualForm({ ...manualForm, adminConsent: e.target.checked })} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                  I confirm admin consent has been granted for the required Graph API permissions
                </label>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-lg font-semibold">Select Modules</h2>
                <ModuleSelector modules={enabledModules} toggle={toggleModule} />
              </>
            )}

            <NavButtons
              onBack={() => step === 1 ? setMode('choose') : setStep(step - 1)}
              showSubmit={step < 3}
              submitLabel={step === 3 ? (manualMutation.isPending ? 'Onboarding...' : 'Onboard Tenant') : 'Continue'}
              isSubmitting={manualMutation.isPending}
              isFinalStep={step === 3}
            />
          </form>
        )}
      </div>
    </div>
  );
}

function ModuleSelector({ modules, toggle }: { modules: string[]; toggle: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Modules</h3>
      {MODULES.map((mod) => (
        <label key={mod.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${modules.includes(mod.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}>
          <input type="checkbox" checked={modules.includes(mod.id)} onChange={() => toggle(mod.id)} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">{mod.label}</p>
            <p className="text-xs text-gray-500">{mod.description}</p>
          </div>
        </label>
      ))}
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
}

function PermissionsList() {
  return (
    <div className="text-xs text-gray-400">
      <p className="font-medium text-gray-500 mb-1">Permissions requested:</p>
      <ul className="list-disc list-inside space-y-0.5">
        <li>User &amp; Group management</li>
        <li>Conditional Access policies (read)</li>
        <li>Audit logs &amp; directory data (read)</li>
        <li>Intune device management</li>
      </ul>
    </div>
  );
}

function NavButtons({ onBack, showSubmit = true, submitLabel, isSubmitting, isFinalStep }: {
  onBack: () => void; showSubmit?: boolean; submitLabel?: string; isSubmitting?: boolean; isFinalStep?: boolean;
}) {
  return (
    <div className="flex justify-between pt-4 border-t">
      <button type="button" onClick={onBack} className="btn-secondary">Back</button>
      {(showSubmit || isFinalStep) && (
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {submitLabel || 'Continue'} {!isSubmitting && <Check className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
