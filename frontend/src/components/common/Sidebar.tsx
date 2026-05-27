import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';
import {
  LayoutDashboard,
  Building2,
  Users,
  Shield,
  Bell,
  Server,
  Settings,
} from 'lucide-react';
import { useTenantStore } from '@/store/tenant';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'Agents', href: '/agents', icon: Server },
];

const tenantNavigation = [
  { name: 'Users', path: 'users', icon: Users },
  { name: 'Groups', path: 'groups', icon: Users },
  { name: 'Policies', path: 'policies', icon: Shield },
  { name: 'Alerts', path: 'alerts', icon: Bell },
];

export function Sidebar() {
  const selectedTenantId = useTenantStore((s) => s.selectedTenantId);

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900">Entra Portal</h1>
          <p className="text-xs text-gray-500">MSP Management</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Main
        </div>
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}

        {selectedTenantId && (
          <>
            <div className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Tenant
            </div>
            {tenantNavigation.map((item) => (
              <NavLink
                key={item.name}
                to={`/tenants/${selectedTenantId}/${item.path}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-gray-200 p-3">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
