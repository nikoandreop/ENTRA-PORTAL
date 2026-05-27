import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Layout } from '@/components/common/Layout';
import { LoginPage } from '@/components/common/LoginPage';
import { SsoCallback } from '@/components/common/SsoCallback';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { TenantListPage } from '@/components/tenants/TenantListPage';
import { TenantDetailPage } from '@/components/tenants/TenantDetailPage';
import { OnboardTenantPage } from '@/components/tenants/OnboardTenantPage';
import { UserListPage } from '@/components/users/UserListPage';
import { UserDetailPage } from '@/components/users/UserDetailPage';
import { GroupListPage } from '@/components/groups/GroupListPage';
import { PolicyListPage } from '@/components/policies/PolicyListPage';
import { AlertListPage } from '@/components/alerts/AlertListPage';
import { AgentListPage } from '@/components/settings/AgentListPage';
import { AuditTrailPage } from '@/components/common/AuditTrailPage';
import { DeviceListPage } from '@/components/intune/DeviceListPage';
import { SettingsPage } from '@/components/settings/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<SsoCallback />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="tenants" element={<TenantListPage />} />
        <Route path="tenants/onboard" element={<OnboardTenantPage />} />
        <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
        <Route path="tenants/:tenantId/users" element={<UserListPage />} />
        <Route path="tenants/:tenantId/users/:userId" element={<UserDetailPage />} />
        <Route path="tenants/:tenantId/groups" element={<GroupListPage />} />
        <Route path="tenants/:tenantId/policies" element={<PolicyListPage />} />
        <Route path="tenants/:tenantId/alerts" element={<AlertListPage />} />
        <Route path="tenants/:tenantId/devices" element={<DeviceListPage />} />
        <Route path="tenants/:tenantId/audit" element={<AuditTrailPage />} />
        <Route path="agents" element={<AgentListPage />} />
        <Route path="audit" element={<AuditTrailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
