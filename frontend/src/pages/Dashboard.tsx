import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, logout } from '../services/auth';
import { canAccess } from '../services/permissions';

const tenantModules = [
  {
    title: 'Staff & Roles',
    description: 'Create staff users and assign hotel or restaurant roles.',
    path: '/staff',
    permissions: ['users.staff.read', 'users.staff.create'],
    tenantAdminOnly: true,
  },
  {
    title: 'Rooms Management',
    description: 'Manage hotel rooms, availability, and maintenance.',
    path: '/rooms',
    permissions: ['rooms.room.read', 'rooms.room.update'],
  },
  {
    title: 'Reservations',
    description: 'Handle bookings, check-ins, check-outs, and guest management.',
    path: '/bookings',
    permissions: ['bookings.reservation.read', 'bookings.reservation.create'],
  },
  {
    title: 'Housekeeping',
    description: 'Manage cleaning tasks, room readiness, and maintenance escalation.',
    path: '/housekeeping',
    permissions: ['housekeeping.task.update'],
  },
  {
    title: 'Restaurant Management',
    description: 'Set up menus, food items, preparation stations, and dining tables.',
    path: '/restaurant',
    permissions: ['restaurant.order.create', 'restaurant.order.update', 'restaurant.kitchen.update'],
  },
  {
    title: 'POS & Cashier',
    description: 'Settle bills, process payments, and close cashier shifts.',
    path: '/pos',
    permissions: ['pos.sale.create'],
  },
  {
    title: 'Accounting',
    description: 'Review ledgers, journals, and financial reports.',
    path: '/accounting',
    permissions: ['accounting.ledger.read', 'accounting.journal.create'],
  },
  {
    title: 'Inventory',
    description: 'Track stock, vendors, purchase orders, and food costing.',
    path: '/inventory',
    permissions: ['inventory.stock.read', 'inventory.purchase.create'],
  },
  {
    title: 'HRMS',
    description: 'Manage employee records, shifts, attendance, and leave.',
    path: '/hrms',
    permissions: ['hrms.employee.read', 'hrms.employee.create'],
    disabled: true,
  },
  {
    title: 'Reports',
    description: 'View occupancy, revenue, operational, and financial reports.',
    path: '/reports',
    permissions: ['reports.operational.read'],
    disabled: true,
  },
];

const Dashboard = () => {
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Hotel ERP</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">
              {user?.is_platform_admin ? 'Super Admin Dashboard' : 'Tenant Dashboard'}
            </h1>
            {user && <p className="mt-2 text-slate-600">{user.full_name || user.email}</p>}
          </div>
          <button
            onClick={() => {
              logout();
              window.location.href = '/';
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {user?.is_platform_admin && (
          <Link to="/onboarding" className="rounded-3xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <h2 className="text-lg font-semibold">Tenant Onboarding</h2>
            <p className="mt-3 text-slate-600">Create hotel and restaurant workspaces with default admin accounts.</p>
          </Link>
        )}
        {tenantModules
          .filter((module) => !module.tenantAdminOnly || user?.is_tenant_admin)
          .filter((module) => canAccess(user, module.permissions))
          .map((module) =>
            module.disabled ? (
              <article key={module.title} className="rounded-3xl bg-white p-6 opacity-70 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">{module.title}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Soon</span>
                </div>
                <p className="mt-3 text-slate-600">{module.description}</p>
              </article>
            ) : (
              <Link key={module.title} to={module.path} className="rounded-3xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <h2 className="text-lg font-semibold">{module.title}</h2>
                <p className="mt-3 text-slate-600">{module.description}</p>
              </Link>
            ),
          )}
      </section>
    </div>
  );
};

export default Dashboard;
