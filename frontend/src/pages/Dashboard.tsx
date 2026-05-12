import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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

const insightTabs = [
  {
    id: 'operations',
    label: 'Operations',
    metrics: [
      { title: 'Occupancy Signal', value: '86%', detail: '12 rooms available', tone: 'green' },
      { title: 'Arrivals Today', value: '18', detail: '6 early check-ins', tone: 'slate' },
      { title: 'Departures Today', value: '14', detail: 'Checkout cleaning queued', tone: 'amber' },
      { title: 'Guest Requests', value: '9', detail: '3 high priority', tone: 'red' },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    metrics: [
      { title: 'Room Revenue', value: 'NPR 284K', detail: 'Projected daily total', tone: 'green' },
      { title: 'Restaurant Sales', value: 'NPR 76K', detail: 'POS settled today', tone: 'slate' },
      { title: 'Open Folios', value: '21', detail: 'Includes room posting', tone: 'amber' },
      { title: 'Journal Health', value: 'Balanced', detail: 'Auto-posting active', tone: 'green' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    metrics: [
      { title: 'Low Stock Items', value: '5', detail: 'Review reorder levels', tone: 'amber' },
      { title: 'Purchase Receipts', value: '12', detail: 'This week', tone: 'green' },
      { title: 'POS Deductions', value: 'Live', detail: 'Restaurant sales reduce stock', tone: 'green' },
      { title: 'Stock Adjustments', value: '3', detail: 'Manual corrections', tone: 'slate' },
    ],
  },
];

const toneClass = {
  green: 'bg-emerald-50 text-[#1F5E3B] border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-100',
} as const;

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState(insightTabs[0].id);
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });
  const selectedTab = insightTabs.find((tab) => tab.id === activeTab) || insightTabs[0];
  const visibleModules = tenantModules
    .filter((module) => !module.tenantAdminOnly || user?.is_tenant_admin)
    .filter((module) => canAccess(user, module.permissions));

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#1F5E3B]">
            Green Hospitality
          </p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 md:text-3xl">
            {user?.is_platform_admin ? 'Platform performance overview' : 'Hotel performance overview'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Analytical signals for reservations, rooms, housekeeping, restaurant, inventory, POS, and accounting.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:flex">
          <div className="rounded-2xl bg-[#1F5E3B] px-4 py-3 text-white">
            <p className="text-green-100">Mode</p>
            <p className="font-bold">{user?.is_platform_admin ? 'Platform' : 'Tenant'}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-[#1F5E3B]">
            <p className="text-emerald-700">Status</p>
            <p className="font-bold">Live</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: 'Occupancy Rate', value: '86%', subtitle: '+12%', detail: 'Week over week' },
          { title: 'New Reservations', value: '126', subtitle: '+8%', detail: 'Last 7 days' },
          { title: 'Revenue Today', value: 'NPR 360K', subtitle: '+18%', detail: 'Rooms + POS' },
          { title: 'Available Rooms', value: '48', subtitle: 'Live', detail: 'Ready to sell' },
        ].map((metric) => (
          <article key={metric.title} className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="text-sm text-slate-500">{metric.title}</h3>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-bold text-[#1F5E3B]">{metric.value}</p>
              <span className="text-sm font-medium text-green-600">{metric.subtitle}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#1F5E3B]">Analytical Insights</h2>
            <p className="mt-1 text-sm text-slate-500">Compact tab grid for faster scanning and less vertical clutter.</p>
          </div>
          <div className="grid grid-cols-3 rounded-2xl bg-emerald-50 p-1 text-sm">
            {insightTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-4 py-2 font-medium transition ${
                  activeTab === tab.id ? 'bg-white text-[#1F5E3B] shadow-sm' : 'text-emerald-700 hover:text-[#1F5E3B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {selectedTab.metrics.map((metric) => (
            <article key={metric.title} className={`rounded-2xl border p-4 ${toneClass[metric.tone as keyof typeof toneClass]}`}>
              <p className="text-sm font-medium opacity-80">{metric.title}</p>
              <p className="mt-3 text-2xl font-bold">{metric.value}</p>
              <p className="mt-1 text-xs opacity-75">{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#1F5E3B]">Priority Watchlist</h2>
              <p className="mt-1 text-sm text-slate-500">Operational items that need attention.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">4 signals</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['Rooms pending cleaning', '12 rooms need turnover before evening arrivals'],
              ['Inventory reorder', '5 items are at or below reorder level'],
              ['Open folios', '21 active folios include restaurant room posting'],
              ['Kitchen queue', '7 tickets are not marked ready yet'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-[#1F5E3B]">Quick Actions</h2>
          <div className="mt-4 grid gap-2">
            {visibleModules
              .filter((module) => !module.disabled)
              .slice(0, 6)
              .map((module) => (
                <Link
                  key={module.title}
                  to={module.path}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#1F5E3B]"
                >
                  <span>{module.title.replace(' Management', '')}</span>
                  <span className="text-xs text-slate-400">Open</span>
                </Link>
              ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {user?.is_platform_admin && (
          <Link to="/onboarding" className="rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <h2 className="text-sm font-bold text-[#1F5E3B]">Tenant Onboarding</h2>
            <p className="mt-2 text-xs text-slate-500">Create isolated workspaces.</p>
          </Link>
        )}
        {visibleModules.map((module) =>
            module.disabled ? (
              <article key={module.title} className="rounded-2xl bg-white p-4 opacity-70 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-bold text-[#1F5E3B]">{module.title}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Soon</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{module.description}</p>
              </article>
            ) : (
              <Link key={module.title} to={module.path} className="rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <h2 className="text-sm font-bold text-[#1F5E3B]">{module.title}</h2>
                <p className="mt-2 text-xs text-slate-500">{module.description}</p>
              </Link>
            ),
          )}
      </section>
    </div>
  );
};

export default Dashboard;
