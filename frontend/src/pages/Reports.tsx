import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CompactTabs from '../components/CompactTabs';
import { useBookings, useGuestFolios, useRooms } from '../hooks/bookings';
import { useInventoryItems, useStockMovements } from '../hooks/inventory';
import { useRestaurantOrders } from '../hooks/restaurant';
import { useJournalEntries } from '../hooks/accounting';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { downloadCsv } from '../utils/csv';

type ReportTab = 'occupancy' | 'revenue' | 'restaurant' | 'inventory';

const Reports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: rooms } = useRooms();
  const { data: bookings } = useBookings();
  const { data: folios } = useGuestFolios();
  const { data: restaurantOrders } = useRestaurantOrders();
  const { data: inventoryItems } = useInventoryItems();
  const { data: stockMovements } = useStockMovements();
  const { data: journalEntries } = useJournalEntries();
  const [activeTab, setActiveTab] = useState<ReportTab>((searchParams.get('tab') as ReportTab | null) || 'occupancy');

  const today = new Date().toISOString().slice(0, 10);
  const paidFolios = folios?.filter((folio) => folio.status === 'paid') || [];
  const paidOrders = restaurantOrders?.filter((order) => order.status === 'paid') || [];
  const openFolios = folios?.filter((folio) => folio.status === 'open') || [];
  const lowStockItems = inventoryItems?.filter((item) => item.is_low_stock) || [];
  const purchaseMovements = stockMovements?.filter((movement) => movement.movement_type === 'purchase') || [];
  const saleMovements = stockMovements?.filter((movement) => movement.movement_type === 'sale') || [];

  const reportData = useMemo(() => {
    const totalRooms = rooms?.length || 0;
    const occupiedRooms = rooms?.filter((room) => room.status === 'occupied').length || 0;
    const occupancyRate = totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const roomRevenue = paidFolios.reduce((sum, folio) => sum + Number(folio.paid_amount || folio.grand_total || 0), 0);
    const restaurantRevenue = paidOrders.reduce((sum, order) => sum + Number(order.paid_amount || order.grand_total || 0), 0);
    const roomPostedOrders = paidOrders.filter((order) => order.payment_method === 'room_posting');
    const purchaseValue = purchaseMovements.reduce((sum, movement) => sum + Number(movement.total_cost || 0), 0);
    const inventorySaleValue = saleMovements.reduce((sum, movement) => sum + Number(movement.total_cost || 0), 0);
    const postedJournalCount = journalEntries?.filter((entry) => entry.status === 'posted').length || 0;

    return {
      totalRooms,
      occupiedRooms,
      availableRooms: rooms?.filter((room) => room.status === 'available').length || 0,
      occupancyRate,
      arrivalsToday: bookings?.filter((booking) => booking.check_in_date === today && booking.status === 'confirmed').length || 0,
      departuresToday: bookings?.filter((booking) => booking.check_out_date === today && booking.status === 'checked_in').length || 0,
      activeBookings: bookings?.filter((booking) => ['confirmed', 'checked_in'].includes(booking.status)).length || 0,
      roomRevenue,
      restaurantRevenue,
      totalRevenue: roomRevenue + restaurantRevenue,
      openFolioValue: openFolios.reduce((sum, folio) => sum + Number(folio.grand_total || 0), 0),
      paidOrders: paidOrders.length,
      roomPostedOrders: roomPostedOrders.length,
      averageTicket: paidOrders.length ? restaurantRevenue / paidOrders.length : 0,
      purchaseValue,
      inventorySaleValue,
      lowStockItems: lowStockItems.length,
      postedJournalCount,
    };
  }, [bookings, journalEntries, lowStockItems.length, openFolios, paidFolios, paidOrders, purchaseMovements, rooms, saleMovements, today]);

  const restaurantItemSales = useMemo(() => {
    const rows = new Map<string, { name: string; quantity: number; total: number }>();
    paidOrders.forEach((order) => {
      order.lines.forEach((line) => {
        const name = line.menu_item_details?.name || 'Unknown item';
        const current = rows.get(name) || { name, quantity: 0, total: 0 };
        current.quantity += Number(line.quantity || 0);
        current.total += Number(line.line_total || 0);
        rows.set(name, current);
      });
    });
    return Array.from(rows.values()).sort((a, b) => b.total - a.total);
  }, [paidOrders]);

  const bookingStatusRows = [
    ['Confirmed', bookings?.filter((booking) => booking.status === 'confirmed').length || 0],
    ['Checked In', bookings?.filter((booking) => booking.status === 'checked_in').length || 0],
    ['Checked Out', bookings?.filter((booking) => booking.status === 'checked_out').length || 0],
    ['Cancelled', bookings?.filter((booking) => booking.status === 'cancelled').length || 0],
  ];

  const exportReportsCsv = () => {
    if (activeTab === 'occupancy') {
      downloadCsv(
        `occupancy-report-${today}.csv`,
        ['Metric', 'Value', 'Detail'],
        [
          ['Occupancy', `${reportData.occupancyRate}%`, `${reportData.occupiedRooms}/${reportData.totalRooms} rooms occupied`],
          ['Available Rooms', reportData.availableRooms, 'Ready to sell'],
          ['Arrivals Today', reportData.arrivalsToday, 'Confirmed check-ins'],
          ['Departures Today', reportData.departuresToday, 'Checked-in guests due out'],
          ...bookingStatusRows.map(([status, count]) => [`Bookings - ${status}`, count, 'Booking status count']),
        ],
      );
      return;
    }

    if (activeTab === 'revenue') {
      downloadCsv(
        `revenue-report-${today}.csv`,
        ['Folio', 'Guest', 'Room', 'Grand Total', 'Paid Amount', 'Payment Method', 'Status'],
        (folios || []).map((folio) => [
          folio.folio_number,
          folio.guest_name,
          folio.room_number,
          folio.grand_total,
          folio.paid_amount,
          folio.payment_method,
          folio.status,
        ]),
      );
      return;
    }

    if (activeTab === 'restaurant') {
      downloadCsv(
        `restaurant-sales-report-${today}.csv`,
        ['Item', 'Quantity Sold', 'Sales Total'],
        restaurantItemSales.map((row) => [row.name, row.quantity, row.total.toFixed(2)]),
      );
      return;
    }

    downloadCsv(
      `inventory-report-${today}.csv`,
      ['Item', 'SKU', 'Category', 'Stock', 'Unit', 'Reorder Level', 'Cost Price', 'Low Stock'],
      (inventoryItems || []).map((item) => [
        item.name,
        item.sku,
        item.category,
        item.current_stock,
        item.unit,
        item.reorder_level,
        item.cost_price,
        item.is_low_stock ? 'Yes' : 'No',
      ]),
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Management</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">Operational reports for occupancy, revenue, restaurant sales, and inventory movement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            Posted journals: <span className="font-semibold text-slate-900">{reportData.postedJournalCount}</span>
          </div>
          <button
            type="button"
            onClick={exportReportsCsv}
            className="rounded-xl bg-[#1F5E3B] px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
          >
            Export CSV
          </button>
        </div>
      </div>

      <CompactTabs
        tabs={[
          { id: 'occupancy', label: 'Occupancy' },
          { id: 'revenue', label: 'Revenue' },
          { id: 'restaurant', label: 'Restaurant' },
          { id: 'inventory', label: 'Inventory' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => {
          setActiveTab(tabId as ReportTab);
          setSearchParams({ tab: tabId });
        }}
      />

      {activeTab === 'occupancy' && (
        <section className="space-y-4">
          <MetricGrid
            metrics={[
              ['Occupancy', `${reportData.occupancyRate}%`, `${reportData.occupiedRooms}/${reportData.totalRooms} rooms occupied`],
              ['Available Rooms', reportData.availableRooms, 'Ready to sell'],
              ['Arrivals Today', reportData.arrivalsToday, 'Confirmed check-ins'],
              ['Departures Today', reportData.departuresToday, 'Checked-in guests due out'],
            ]}
          />
          <RowsTable headers={['Status', 'Bookings']}>
            {bookingStatusRows.map(([status, count]) => (
              <tr key={status}>
                <td className="px-4 py-3 font-medium text-slate-900">{status}</td>
                <td className="px-4 py-3 text-right">{count}</td>
              </tr>
            ))}
          </RowsTable>
        </section>
      )}

      {activeTab === 'revenue' && (
        <section className="space-y-4">
          <MetricGrid
            metrics={[
              ['Total Settled Revenue', formatMoney(reportData.totalRevenue, settings?.currency), 'Room folios + paid restaurant orders'],
              ['Room Revenue', formatMoney(reportData.roomRevenue, settings?.currency), 'Paid folios'],
              ['Restaurant Revenue', formatMoney(reportData.restaurantRevenue, settings?.currency), 'Paid POS orders'],
              ['Open Folio Value', formatMoney(reportData.openFolioValue, settings?.currency), 'Awaiting checkout settlement'],
            ]}
          />
          <RowsTable headers={['Folio', 'Guest', 'Room', 'Grand Total', 'Status']}>
            {(folios || []).slice(0, 12).map((folio) => (
              <tr key={folio.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{folio.folio_number}</td>
                <td className="px-4 py-3">{folio.guest_name}</td>
                <td className="px-4 py-3">{folio.room_number}</td>
                <td className="px-4 py-3 text-right">{formatMoney(folio.grand_total, settings?.currency)}</td>
                <td className="px-4 py-3">{folio.status}</td>
              </tr>
            ))}
            {!folios?.length && <EmptyRow columns={5} label="No folios yet." />}
          </RowsTable>
        </section>
      )}

      {activeTab === 'restaurant' && (
        <section className="space-y-4">
          <MetricGrid
            metrics={[
              ['Paid Orders', reportData.paidOrders, 'Settled restaurant orders'],
              ['Room Posted', reportData.roomPostedOrders, 'Charged to guest folio'],
              ['Average Ticket', formatMoney(reportData.averageTicket, settings?.currency), 'Paid order average'],
              ['Restaurant Revenue', formatMoney(reportData.restaurantRevenue, settings?.currency), 'Gross paid order total'],
            ]}
          />
          <RowsTable headers={['Item', 'Qty Sold', 'Sales Total']}>
            {restaurantItemSales.slice(0, 12).map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-right">{row.quantity}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.total, settings?.currency)}</td>
              </tr>
            ))}
            {!restaurantItemSales.length && <EmptyRow columns={3} label="No paid restaurant sales yet." />}
          </RowsTable>
        </section>
      )}

      {activeTab === 'inventory' && (
        <section className="space-y-4">
          <MetricGrid
            metrics={[
              ['Low Stock Items', reportData.lowStockItems, 'At or below reorder level'],
              ['Purchase Value', formatMoney(reportData.purchaseValue, settings?.currency), 'Received inventory'],
              ['POS Deductions', saleMovements.length, 'Restaurant inventory sale movements'],
              ['Deducted Cost', formatMoney(reportData.inventorySaleValue, settings?.currency), 'Cost value of sale movements'],
            ]}
          />
          <RowsTable headers={['Item', 'Stock', 'Reorder', 'Cost', 'Status']}>
            {(inventoryItems || []).slice(0, 14).map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                <td className="px-4 py-3 text-right">
                  {Number(item.current_stock).toLocaleString()} {item.unit}
                </td>
                <td className="px-4 py-3 text-right">{Number(item.reorder_level).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{formatMoney(item.cost_price, settings?.currency)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.is_low_stock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {item.is_low_stock ? 'Low' : 'OK'}
                  </span>
                </td>
              </tr>
            ))}
            {!inventoryItems?.length && <EmptyRow columns={5} label="No inventory items yet." />}
          </RowsTable>
        </section>
      )}
    </div>
  );
};

const MetricGrid = ({ metrics }: { metrics: Array<[string, string | number, string]> }) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {metrics.map(([title, value, detail]) => (
      <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-[#1F5E3B]">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </article>
    ))}
  </div>
);

const RowsTable = ({ headers, children }: { headers: string[]; children: React.ReactNode }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {headers.map((header, index) => (
              <th key={header} className={`px-4 py-3 ${index > 0 ? 'text-right' : ''}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  </section>
);

const EmptyRow = ({ columns, label }: { columns: number; label: string }) => (
  <tr>
    <td colSpan={columns} className="px-4 py-6 text-center text-slate-500">
      {label}
    </td>
  </tr>
);

export default Reports;
