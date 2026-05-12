import {
  BarChart3,
  BedDouble,
  Building2,
  Calculator,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Utensils,
  Users,
} from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, logout } from '../services/auth';
import { canAccess } from '../services/permissions';

const navItems = [
  { title: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { title: 'Tenants', path: '/onboarding', icon: Building2, permissions: ['platform.tenants.create'], platformOnly: true },
  { title: 'Staff & Roles', path: '/staff', icon: ShieldCheck, permissions: ['users.staff.read', 'users.staff.create'], tenantAdminOnly: true },
  { title: 'Rooms', path: '/rooms', icon: BedDouble, permissions: ['rooms.room.read', 'rooms.room.update'] },
  { title: 'Reservations', path: '/bookings', icon: CalendarCheck, permissions: ['bookings.reservation.read', 'bookings.reservation.create'] },
  { title: 'Housekeeping', path: '/housekeeping', icon: ClipboardList, permissions: ['housekeeping.task.update'] },
  { title: 'Restaurant', path: '/restaurant', icon: Utensils, permissions: ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update'] },
  { title: 'POS', path: '/pos', icon: Receipt, permissions: ['pos.sale.create'] },
  { title: 'Inventory', path: '/inventory', icon: Package, permissions: ['inventory.stock.read', 'inventory.purchase.create'] },
  { title: 'Accounting', path: '/accounting', icon: Calculator, permissions: ['accounting.ledger.read', 'accounting.journal.create'] },
  { title: 'Reports', path: '/reports', icon: BarChart3, permissions: ['reports.operational.read'], disabled: true },
];

const AppShell = () => {
  const location = useLocation();
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });

  const visibleItems = navItems.filter((item) => {
    if (item.platformOnly && !user?.is_platform_admin) return false;
    if (item.tenantAdminOnly && !user?.is_tenant_admin) return false;
    if (!item.permissions) return true;
    return canAccess(user, item.permissions);
  });

  const initials = (user?.full_name || user?.email || 'A').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-[#edf7f1] text-slate-800 lg:flex">
      <aside className="bg-[#1F5E3B] p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0">
        <div className="mb-7 flex items-center gap-3 rounded-3xl bg-white/10 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#1F5E3B]">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">PyLoom</h1>
            <p className="text-sm text-green-100">Hospitality Management System</p>
          </div>
        </div>

        <nav className="grid gap-2 sm:grid-cols-2 lg:block lg:space-y-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const content = (
              <>
                <Icon size={19} />
                <span>{item.title}</span>
                {item.disabled && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs">Soon</span>}
              </>
            );

            if (item.disabled) {
              return (
                <div key={item.path} className="flex items-center gap-3 rounded-2xl p-3 text-sm text-green-100 opacity-70">
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-2xl p-3 text-sm font-medium transition ${
                  isActive ? 'bg-white text-[#1F5E3B]' : 'text-green-50 hover:bg-[#2B7A4B]'
                }`}
              >
                {content}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 p-4 md:p-6">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#1F5E3B]">
              {user?.is_platform_admin ? 'Super Admin Workspace' : 'Hotel Operations'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{user?.full_name || user?.email || 'Welcome back'}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-slate-400 sm:w-72">
              <Search size={18} />
              <input className="w-full bg-transparent text-sm outline-none" placeholder="Search operations..." />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1F5E3B] font-bold text-white">
                {initials}
              </div>
              <button
                onClick={() => {
                  logout();
                  window.location.href = '/';
                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
};

export default AppShell;
