import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../services/auth';
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
    <div className="space-y-6">
      <section
        className="rounded-[30px] p-8 text-white shadow-sm md:p-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(31,94,59,0.9), rgba(54,120,82,0.76)), url('https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1600&auto=format&fit=crop')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-green-100">Green Hospitality</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-bold md:text-5xl">
          {user?.is_platform_admin ? 'Premium platform control for every property' : 'Premium hotel operations in one workspace'}
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-green-50">
          Smart reservations, housekeeping, restaurant, inventory, POS, and accounting workflows for development-stage hospitality operations.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: 'Operational Modules', value: tenantModules.filter((module) => !module.disabled).length, subtitle: 'Live' },
          { title: 'Inventory Control', value: 'On', subtitle: 'Stock linked' },
          { title: 'Accounting Flow', value: 'Auto', subtitle: 'Journals' },
          { title: 'Tenant Mode', value: user?.is_platform_admin ? 'Platform' : 'Hotel', subtitle: 'Active' },
        ].map((metric) => (
          <article key={metric.title} className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-sm text-slate-500">{metric.title}</h3>
            <div className="mt-4 flex items-end justify-between gap-3">
              <p className="text-4xl font-bold text-[#1F5E3B]">{metric.value}</p>
              <span className="text-sm font-medium text-green-600">{metric.subtitle}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {user?.is_platform_admin && (
          <Link to="/onboarding" className="rounded-3xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <h2 className="text-lg font-bold text-[#1F5E3B]">Tenant Onboarding</h2>
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
                  <h2 className="text-lg font-bold text-[#1F5E3B]">{module.title}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Soon</span>
                </div>
                <p className="mt-3 text-slate-600">{module.description}</p>
              </article>
            ) : (
              <Link key={module.title} to={module.path} className="rounded-3xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <h2 className="text-lg font-bold text-[#1F5E3B]">{module.title}</h2>
                <p className="mt-3 text-slate-600">{module.description}</p>
              </Link>
            ),
          )}
      </section>
    </div>
  );
};

export default Dashboard;
