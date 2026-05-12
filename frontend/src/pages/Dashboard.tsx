import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRooms, useBookings, useGuestFolios } from '../hooks/bookings';
import { useHousekeepingTasks } from '../hooks/housekeeping';
import { useInventoryItems, useStockMovements } from '../hooks/inventory';
import { useRestaurantOrders } from '../hooks/restaurant';
import { getCurrentUser } from '../services/auth';
import { canAccess } from '../services/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';

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

const toneClass = {
  green: 'bg-emerald-50 text-[#1F5E3B] border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-100',
} as const;

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('operations');
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: rooms, isLoading: roomsLoading } = useRooms();
  const { data: bookings, isLoading: bookingsLoading } = useBookings();
  const { data: folios, isLoading: foliosLoading } = useGuestFolios();
  const { data: housekeepingTasks, isLoading: housekeepingLoading } = useHousekeepingTasks();
  const { data: restaurantOrders, isLoading: restaurantLoading } = useRestaurantOrders();
  const { data: inventoryItems, isLoading: inventoryLoading } = useInventoryItems();
  const { data: stockMovements, isLoading: movementsLoading } = useStockMovements();

  const today = new Date().toISOString().slice(0, 10);
  const totalRooms = rooms?.length || 0;
  const occupiedRooms = rooms?.filter((room) => room.status === 'occupied').length || 0;
  const availableRooms = rooms?.filter((room) => room.status === 'available').length || 0;
  const occupancyRate = totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const arrivalsToday = bookings?.filter((booking) => booking.check_in_date === today && booking.status === 'confirmed').length || 0;
  const departuresToday = bookings?.filter((booking) => booking.check_out_date === today && booking.status === 'checked_in').length || 0;
  const openTasks = housekeepingTasks?.filter((task) => task.status !== 'done').length || 0;
  const urgentTasks = housekeepingTasks?.filter((task) => task.priority === 'urgent' && task.status !== 'done').length || 0;
  const openFolios = folios?.filter((folio) => folio.status === 'open').length || 0;
  const paidFolios = folios?.filter((folio) => folio.status === 'paid') || [];
  const roomRevenue = paidFolios.reduce((total, folio) => total + Number(folio.paid_amount || folio.grand_total || 0), 0);
  const paidRestaurantOrders = restaurantOrders?.filter((order) => order.status === 'paid') || [];
  const restaurantRevenue = paidRestaurantOrders.reduce((total, order) => total + Number(order.paid_amount || order.grand_total || 0), 0);
  const lowStockItems = inventoryItems?.filter((item) => item.is_low_stock) || [];
  const purchaseReceipts = stockMovements?.filter((movement) => movement.movement_type === 'purchase').length || 0;
  const saleDeductions = stockMovements?.filter((movement) => movement.movement_type === 'sale').length || 0;
  const stockAdjustments =
    stockMovements?.filter((movement) => ['waste', 'adjustment_in', 'adjustment_out'].includes(movement.movement_type)).length || 0;
  const journalReady = Number(roomRevenue + restaurantRevenue) > 0 ? 'Active' : 'No postings';
  const hasLoadedCore = !roomsLoading && !bookingsLoading;

  const insightTabs = [
    {
      id: 'operations',
      label: 'Operations',
      metrics: [
        { title: 'Occupancy Signal', value: totalRooms ? `${occupancyRate}%` : 'No rooms', detail: `${availableRooms} rooms available`, tone: 'green' },
        { title: 'Arrivals Today', value: arrivalsToday, detail: 'Confirmed check-ins', tone: 'slate' },
        { title: 'Departures Today', value: departuresToday, detail: 'Checked-in bookings due out', tone: departuresToday ? 'amber' : 'green' },
        { title: 'Housekeeping Queue', value: openTasks, detail: `${urgentTasks} urgent tasks`, tone: urgentTasks ? 'red' : openTasks ? 'amber' : 'green' },
      ],
    },
    {
      id: 'revenue',
      label: 'Revenue',
      metrics: [
        { title: 'Room Revenue', value: formatMoney(roomRevenue, settings?.currency), detail: 'Paid folios', tone: 'green' },
        { title: 'Restaurant Sales', value: formatMoney(restaurantRevenue, settings?.currency), detail: 'Paid POS orders', tone: 'slate' },
        { title: 'Open Folios', value: openFolios, detail: 'Awaiting settlement', tone: openFolios ? 'amber' : 'green' },
        { title: 'Journal Activity', value: journalReady, detail: 'Based on settled flows', tone: journalReady === 'Active' ? 'green' : 'slate' },
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory',
      metrics: [
        { title: 'Low Stock Items', value: lowStockItems.length, detail: 'At or below reorder level', tone: lowStockItems.length ? 'amber' : 'green' },
        { title: 'Purchase Receipts', value: purchaseReceipts, detail: 'All recorded receipts', tone: 'green' },
        { title: 'POS Deductions', value: saleDeductions, detail: 'Restaurant sale movements', tone: saleDeductions ? 'green' : 'slate' },
        { title: 'Stock Adjustments', value: stockAdjustments, detail: 'Manual corrections/waste', tone: stockAdjustments ? 'amber' : 'slate' },
      ],
    },
  ];

  const selectedTab = insightTabs.find((tab) => tab.id === activeTab) || insightTabs[0];
  const visibleModules = tenantModules
    .filter((module) => !module.tenantAdminOnly || user?.is_tenant_admin)
    .filter((module) => canAccess(user, module.permissions));

  const watchlist = [
    openTasks ? ['Rooms pending cleaning', `${openTasks} housekeeping tasks are still open`] : null,
    lowStockItems.length ? ['Inventory reorder', `${lowStockItems.length} items are at or below reorder level`] : null,
    openFolios ? ['Open folios', `${openFolios} folios are awaiting settlement`] : null,
    restaurantOrders?.some((order) => ['sent_to_kitchen', 'preparing'].includes(order.status))
      ? ['Kitchen queue', `${restaurantOrders.filter((order) => ['sent_to_kitchen', 'preparing'].includes(order.status)).length} orders are in kitchen workflow`]
      : null,
  ].filter(Boolean) as string[][];

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
          { title: 'Occupancy Rate', value: hasLoadedCore && totalRooms ? `${occupancyRate}%` : 'No data', subtitle: `${occupiedRooms}/${totalRooms}`, detail: 'Occupied rooms' },
          { title: 'New Reservations', value: bookings?.filter((booking) => booking.status === 'confirmed').length ?? '...', subtitle: 'Open', detail: 'Confirmed bookings' },
          { title: 'Settled Revenue', value: formatMoney(roomRevenue + restaurantRevenue, settings?.currency), subtitle: 'Live', detail: 'Paid folios + POS' },
          { title: 'Available Rooms', value: hasLoadedCore ? availableRooms : '...', subtitle: 'Live', detail: 'Ready to sell' },
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
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{watchlist.length} signals</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {watchlist.map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
            {watchlist.length === 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 md:col-span-2">
                <p className="font-semibold text-[#1F5E3B]">No priority signals</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Live data does not currently show open housekeeping, low stock, open folios, or kitchen queue issues.
                </p>
              </div>
            )}
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
