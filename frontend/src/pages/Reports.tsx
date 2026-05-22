import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useBookings, useGuestFolios, useRooms } from '../hooks/bookings';
import { useInventoryItems, useStockMovements } from '../hooks/inventory';
import { useCashierShifts, useRestaurantOrderApprovals, useRestaurantOrders } from '../hooks/restaurant';
import { useJournalEntries } from '../hooks/accounting';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { downloadCsv } from '../utils/csv';

type ReportTab = 'occupancy' | 'revenue' | 'restaurant' | 'inventory' | 'cashier';
type CashierExceptionType = 'all' | 'variance' | 'reprint' | 'approval';
type CashierExceptionRow = {
  type: 'Shift Variance' | 'Receipt Reprint' | 'Approval';
  reference: string;
  actor: string;
  context: string;
  status: string;
  amount: number;
  occurredAt: string;
  detail: string;
};

const Reports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: rooms } = useRooms();
  const { data: bookings } = useBookings();
  const { data: folios } = useGuestFolios();
  const { data: restaurantOrders } = useRestaurantOrders();
  const { data: cashierShifts } = useCashierShifts();
  const { data: approvals } = useRestaurantOrderApprovals();
  const { data: inventoryItems } = useInventoryItems();
  const { data: stockMovements } = useStockMovements();
  const { data: journalEntries } = useJournalEntries();
  const [activeTab, setActiveTab] = useState<ReportTab>((searchParams.get('tab') as ReportTab | null) || 'occupancy');
  const [cashierExceptionType, setCashierExceptionType] = useState<CashierExceptionType>('all');
  const [cashierDateFrom, setCashierDateFrom] = useState('');
  const [cashierDateTo, setCashierDateTo] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const paidFolios = folios?.filter((folio) => folio.status === 'paid') || [];
  const paidOrders = restaurantOrders?.filter((order) => order.status === 'paid') || [];
  const closedShifts = cashierShifts?.filter((shift) => shift.status === 'closed') || [];
  const varianceShifts = closedShifts.filter((shift) => Number(shift.total_variance || shift.cash_variance || 0) !== 0);
  const receiptReprints = paidOrders.flatMap((order) =>
    (order.receipt_reprints || []).map((reprint) => ({
      ...reprint,
      order_number: order.order_number,
      receipt_number: reprint.receipt_number || order.receipt_number || '',
      paid_at: order.paid_at,
    })),
  );
  const exceptionApprovals = approvals?.filter((approval) => ['void_line', 'discount', 'complimentary'].includes(approval.action_type)) || [];
  const isWithinCashierDateRange = (dateValue: string | null | undefined) => {
    if (!dateValue) return false;
    const date = dateValue.slice(0, 10);
    if (cashierDateFrom && date < cashierDateFrom) return false;
    if (cashierDateTo && date > cashierDateTo) return false;
    return true;
  };
  const cashierExceptionRows = useMemo<CashierExceptionRow[]>(() => {
    const rows: CashierExceptionRow[] = [
      ...varianceShifts.map((shift) => ({
        type: 'Shift Variance' as const,
        reference: shift.business_date,
        actor: shift.cashier_email || '-',
        context: shift.counter_details?.name || '-',
        status: shift.status,
        amount: Number(shift.total_variance || shift.cash_variance || 0),
        occurredAt: shift.closed_at || '',
        detail: [
          `Cash ${formatMoney(shift.cash_variance, settings?.currency)}`,
          `Card ${formatMoney(shift.card_variance, settings?.currency)}`,
          `Wallet ${formatMoney(shift.wallet_variance, settings?.currency)}`,
          `Bank ${formatMoney(shift.bank_transfer_variance, settings?.currency)}`,
          `Room ${formatMoney(shift.room_posting_variance, settings?.currency)}`,
        ].join(' | '),
      })),
      ...receiptReprints.map((reprint) => ({
        type: 'Receipt Reprint' as const,
        reference: reprint.receipt_number,
        actor: reprint.reprinted_by_email || '-',
        context: reprint.order_number,
        status: reprint.reason || '-',
        amount: 0,
        occurredAt: reprint.reprinted_at,
        detail: reprint.reason || 'Receipt copy issued',
      })),
      ...exceptionApprovals.map((approval) => ({
        type: 'Approval' as const,
        reference: approval.order_details?.order_number || approval.order,
        actor: approval.requested_by_email || '-',
        context: approval.action_type_display || approval.action_type,
        status: approval.status,
        amount: Number(approval.discount_amount || 0),
        occurredAt: approval.decided_at || approval.created_at,
        detail: approval.reason || approval.decision_notes || '-',
      })),
    ];

    return rows
      .filter((row) => cashierExceptionType === 'all' || row.type.toLowerCase().includes(cashierExceptionType))
      .filter((row) => isWithinCashierDateRange(row.occurredAt))
      .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());
  }, [cashierDateFrom, cashierDateTo, cashierExceptionType, exceptionApprovals, receiptReprints, settings?.currency, varianceShifts]);
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
      closedShifts: closedShifts.length,
      varianceShifts: varianceShifts.length,
      totalVariance: varianceShifts.reduce((sum, shift) => sum + Number(shift.total_variance || shift.cash_variance || 0), 0),
      receiptReprints: receiptReprints.length,
      pendingApprovals: exceptionApprovals.filter((approval) => approval.status === 'pending').length,
      totalDiscountApproved: exceptionApprovals
        .filter((approval) => approval.action_type !== 'void_line' && approval.status === 'approved')
        .reduce((sum, approval) => sum + Number(approval.discount_amount || 0), 0),
    };
  }, [bookings, closedShifts.length, exceptionApprovals, journalEntries, lowStockItems.length, openFolios, paidFolios, paidOrders, purchaseMovements, receiptReprints.length, rooms, saleMovements, today, varianceShifts]);

  const paymentMethodRows = useMemo(() => {
    const methods = [
      ['cash', 'Cash'],
      ['card', 'Card'],
      ['wallet', 'Wallet'],
      ['bank_transfer', 'Bank Transfer'],
      ['room_posting', 'Room Posting'],
    ];
    return methods.map(([method, label]) => {
      const restaurantTotal = paidOrders.reduce((sum, order) => {
        const paymentTotal = (order.payments || [])
          .filter((payment) => payment.payment_method === method)
          .reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0);
        if (paymentTotal) return sum + paymentTotal;
        return order.payment_method === method ? sum + Number(order.paid_amount || order.grand_total || 0) : sum;
      }, 0);
      const folioTotal = paidFolios
        .filter((folio) => folio.payment_method === method)
        .reduce((sum, folio) => sum + Number(folio.paid_amount || folio.grand_total || 0), 0);
      return { method, label, restaurantTotal, folioTotal, total: restaurantTotal + folioTotal };
    });
  }, [paidFolios, paidOrders]);

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

  const bookingStatusRows: Array<[string, number]> = [
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

    if (activeTab === 'cashier') {
      downloadCsv(
        `cashier-exceptions-report-${today}.csv`,
        ['Type', 'Reference', 'Actor', 'Context', 'Status', 'Amount', 'Date/Time', 'Detail'],
        cashierExceptionRows.map((row) => [
          row.type,
          row.reference,
          row.actor,
          row.context,
          row.status,
          row.amount.toFixed(2),
          row.occurredAt,
          row.detail,
        ]),
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
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Management PDF
          </button>
          {activeTab === 'cashier' && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Print
            </button>
          )}
        </div>
      </div>

      <CompactTabs
        tabs={[
          { id: 'occupancy', label: 'Occupancy' },
          { id: 'revenue', label: 'Revenue' },
          { id: 'restaurant', label: 'Restaurant' },
          { id: 'inventory', label: 'Inventory' },
          { id: 'cashier', label: 'Cashier' },
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

      {activeTab === 'cashier' && (
        <section className="space-y-4">
          <MetricGrid
            metrics={[
              ['Closed Shifts', reportData.closedShifts, 'Cashier shifts closed'],
              ['Variance Shifts', reportData.varianceShifts, 'Any non-zero method variance'],
              ['Total Variance', formatMoney(reportData.totalVariance, settings?.currency), 'Net over/short across methods'],
              ['Receipt Reprints', reportData.receiptReprints, 'Paid restaurant receipts reprinted'],
            ]}
          />

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
            <label className="text-xs font-semibold uppercase text-slate-500">
              Type
              <select
                value={cashierExceptionType}
                onChange={(event) => setCashierExceptionType(event.target.value as CashierExceptionType)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case text-slate-800"
              >
                <option value="all">All exceptions</option>
                <option value="variance">Shift variances</option>
                <option value="reprint">Receipt reprints</option>
                <option value="approval">Approvals</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase text-slate-500">
              From
              <input
                type="date"
                value={cashierDateFrom}
                onChange={(event) => setCashierDateFrom(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <label className="text-xs font-semibold uppercase text-slate-500">
              To
              <input
                type="date"
                value={cashierDateTo}
                onChange={(event) => setCashierDateTo(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setCashierExceptionType('all');
                  setCashierDateFrom('');
                  setCashierDateTo('');
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          </div>

          <RowsTable headers={['Payment Method', 'Restaurant', 'Rooms/Folios', 'Total']}>
            {paymentMethodRows.map((row) => (
              <tr key={row.method}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.restaurantTotal, settings?.currency)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.folioTotal, settings?.currency)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(row.total, settings?.currency)}</td>
              </tr>
            ))}
          </RowsTable>

          <RowsTable headers={['Type', 'Reference', 'Actor', 'Context', 'Status', 'Amount', 'Occurred', 'Detail']}>
            {cashierExceptionRows.slice(0, 50).map((row, index) => (
              <tr key={`${row.type}-${row.reference}-${row.occurredAt}-${index}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.type}</td>
                <td className="px-4 py-3 text-right">{row.reference}</td>
                <td className="px-4 py-3 text-right">{row.actor}</td>
                <td className="px-4 py-3 text-right">{row.context}</td>
                <td className="px-4 py-3 text-right capitalize">{row.status}</td>
                <td className={`px-4 py-3 text-right font-semibold ${row.amount < 0 ? 'text-rose-700' : row.amount > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {row.amount ? formatMoney(row.amount, settings?.currency) : '-'}
                </td>
                <td className="px-4 py-3 text-right">{row.occurredAt ? new Date(row.occurredAt).toLocaleString() : '-'}</td>
                <td className="px-4 py-3 text-right">{row.detail}</td>
              </tr>
            ))}
            {!cashierExceptionRows.length && <EmptyRow columns={8} label="No cashier exceptions match the current filters." />}
          </RowsTable>

          <RowsTable headers={['Shift', 'Cashier', 'Counter', 'Expected', 'Counted', 'Total Variance']}>
            {closedShifts.slice(0, 12).map((shift) => (
              <tr key={shift.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{shift.business_date}</td>
                <td className="px-4 py-3 text-right">{shift.cashier_email || '-'}</td>
                <td className="px-4 py-3 text-right">{shift.counter_details?.name || '-'}</td>
                <td className="px-4 py-3 text-right">{formatMoney(shift.expected_total, settings?.currency)}</td>
                <td className="px-4 py-3 text-right">
                  {formatMoney(
                    Number(shift.actual_cash || 0) +
                      Number(shift.actual_card || 0) +
                      Number(shift.actual_wallet || 0) +
                      Number(shift.actual_bank_transfer || 0) +
                      Number(shift.actual_room_posting || 0),
                    settings?.currency,
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${Number(shift.total_variance || shift.cash_variance || 0) === 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                  {formatMoney(shift.total_variance || shift.cash_variance, settings?.currency)}
                </td>
              </tr>
            ))}
            {!closedShifts.length && <EmptyRow columns={6} label="No closed cashier shifts yet." />}
          </RowsTable>

          <RowsTable headers={['Receipt', 'Order', 'Reprinted By', 'Reason', 'Reprinted At']}>
            {receiptReprints.slice(0, 12).map((reprint) => (
              <tr key={reprint.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{reprint.receipt_number}</td>
                <td className="px-4 py-3 text-right">{reprint.order_number}</td>
                <td className="px-4 py-3 text-right">{reprint.reprinted_by_email || '-'}</td>
                <td className="px-4 py-3 text-right">{reprint.reason || '-'}</td>
                <td className="px-4 py-3 text-right">{new Date(reprint.reprinted_at).toLocaleString()}</td>
              </tr>
            ))}
            {!receiptReprints.length && <EmptyRow columns={5} label="No receipt reprints yet." />}
          </RowsTable>

          <RowsTable headers={['Order', 'Action', 'Requested By', 'Status', 'Amount', 'Decided At']}>
            {exceptionApprovals.slice(0, 12).map((approval) => (
              <tr key={approval.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{approval.order_details?.order_number || approval.order}</td>
                <td className="px-4 py-3 text-right">{approval.action_type_display || approval.action_type}</td>
                <td className="px-4 py-3 text-right">{approval.requested_by_email || '-'}</td>
                <td className="px-4 py-3 text-right capitalize">{approval.status}</td>
                <td className="px-4 py-3 text-right">{formatMoney(approval.discount_amount || '0.00', settings?.currency)}</td>
                <td className="px-4 py-3 text-right">{approval.decided_at ? new Date(approval.decided_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
            {!exceptionApprovals.length && <EmptyRow columns={6} label="No void, discount, or complimentary approvals yet." />}
          </RowsTable>
        </section>
      )}

      {summaryOpen && (
        <ActionModal title="Management summary" onClose={() => setSummaryOpen(false)} maxWidthClassName="max-w-5xl">
          <ManagementSummary
            hotelName={settings?.name || 'Hotel'}
            currency={settings?.currency}
            reportData={reportData}
            bookingStatusRows={bookingStatusRows}
            paymentMethodRows={paymentMethodRows}
            restaurantItemSales={restaurantItemSales}
            lowStockItems={lowStockItems}
            cashierExceptionRows={cashierExceptionRows}
            generatedAt={new Date().toLocaleString()}
          />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setSummaryOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print / Save PDF
            </button>
          </div>
        </ActionModal>
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

const ManagementSummary = ({
  hotelName,
  currency,
  reportData,
  bookingStatusRows,
  paymentMethodRows,
  restaurantItemSales,
  lowStockItems,
  cashierExceptionRows,
  generatedAt,
}: {
  hotelName: string;
  currency?: string;
  reportData: {
    totalRooms: number;
    occupiedRooms: number;
    occupancyRate: number;
    availableRooms: number;
    arrivalsToday: number;
    departuresToday: number;
    activeBookings: number;
    roomRevenue: number;
    restaurantRevenue: number;
    totalRevenue: number;
    openFolioValue: number;
    paidOrders: number;
    averageTicket: number;
    purchaseValue: number;
    inventorySaleValue: number;
    lowStockItems: number;
    closedShifts: number;
    varianceShifts: number;
    totalVariance: number;
    receiptReprints: number;
    pendingApprovals: number;
    totalDiscountApproved: number;
  };
  bookingStatusRows: Array<[string, string | number]>;
  paymentMethodRows: Array<{ method: string; label: string; restaurantTotal: number; folioTotal: number; total: number }>;
  restaurantItemSales: Array<{ name: string; quantity: number; total: number }>;
  lowStockItems: Array<{ id: string; name: string; sku: string; current_stock: string; unit: string; reorder_level: string }>;
  cashierExceptionRows: CashierExceptionRow[];
  generatedAt: string;
}) => (
  <div className="receipt-print grid gap-4 text-sm text-slate-800">
    <div className="print-header border-b border-slate-200 pb-3 text-center">
      <h2 className="text-xl font-bold text-slate-900">{hotelName}</h2>
      <p className="mt-1 text-xs font-semibold uppercase text-slate-600">Management Summary</p>
      <p className="mt-1 text-xs text-slate-500">Generated {generatedAt}</p>
    </div>

    <div className="print-metrics grid gap-2 md:grid-cols-4">
      <SummaryMetric label="Occupancy" value={`${reportData.occupancyRate}%`} detail={`${reportData.occupiedRooms}/${reportData.totalRooms} rooms`} />
      <SummaryMetric label="Total Revenue" value={formatMoney(reportData.totalRevenue, currency)} detail="Rooms + restaurant" />
      <SummaryMetric label="Open Folios" value={formatMoney(reportData.openFolioValue, currency)} detail="Awaiting settlement" />
      <SummaryMetric label="Cashier Variance" value={formatMoney(reportData.totalVariance, currency)} detail={`${reportData.varianceShifts} shifts`} />
      <SummaryMetric label="Arrivals" value={String(reportData.arrivalsToday)} detail="Due today" />
      <SummaryMetric label="Departures" value={String(reportData.departuresToday)} detail="Due today" />
      <SummaryMetric label="Restaurant Avg" value={formatMoney(reportData.averageTicket, currency)} detail={`${reportData.paidOrders} paid orders`} />
      <SummaryMetric label="Low Stock" value={String(reportData.lowStockItems)} detail="Items at reorder" />
    </div>

    <div className="print-section grid gap-4 md:grid-cols-2">
      <SummaryTable title="Booking Status" headers={['Status', 'Count']}>
        {bookingStatusRows.map(([status, count]) => (
          <tr key={status}><td className="py-2 pr-3">{status}</td><td className="py-2 pr-3 text-right font-semibold">{count}</td></tr>
        ))}
      </SummaryTable>
      <SummaryTable title="Revenue Mix" headers={['Source', 'Amount']}>
        <tr><td className="py-2 pr-3">Room revenue</td><td className="py-2 pr-3 text-right font-semibold">{formatMoney(reportData.roomRevenue, currency)}</td></tr>
        <tr><td className="py-2 pr-3">Restaurant revenue</td><td className="py-2 pr-3 text-right font-semibold">{formatMoney(reportData.restaurantRevenue, currency)}</td></tr>
        <tr><td className="py-2 pr-3">Inventory purchases</td><td className="py-2 pr-3 text-right font-semibold">{formatMoney(reportData.purchaseValue, currency)}</td></tr>
        <tr><td className="py-2 pr-3">Inventory sale cost</td><td className="py-2 pr-3 text-right font-semibold">{formatMoney(reportData.inventorySaleValue, currency)}</td></tr>
      </SummaryTable>
    </div>

    <SummaryTable title="Payment Methods" headers={['Method', 'Restaurant', 'Rooms/Folios', 'Total']}>
      {paymentMethodRows.map((row) => (
        <tr key={row.method}>
          <td className="py-2 pr-3">{row.label}</td>
          <td className="py-2 pr-3 text-right">{formatMoney(row.restaurantTotal, currency)}</td>
          <td className="py-2 pr-3 text-right">{formatMoney(row.folioTotal, currency)}</td>
          <td className="py-2 pr-3 text-right font-semibold">{formatMoney(row.total, currency)}</td>
        </tr>
      ))}
    </SummaryTable>

    <div className="print-section grid gap-4 md:grid-cols-2">
      <SummaryTable title="Top Restaurant Items" headers={['Item', 'Qty', 'Sales']}>
        {restaurantItemSales.slice(0, 8).map((row) => (
          <tr key={row.name}><td className="py-2 pr-3">{row.name}</td><td className="py-2 pr-3 text-right">{row.quantity}</td><td className="py-2 pr-3 text-right font-semibold">{formatMoney(row.total, currency)}</td></tr>
        ))}
        {!restaurantItemSales.length && <tr><td colSpan={3} className="py-4 text-center text-slate-500">No restaurant sales yet.</td></tr>}
      </SummaryTable>
      <SummaryTable title="Low Stock Watch" headers={['Item', 'Stock', 'Reorder']}>
        {lowStockItems.slice(0, 8).map((item) => (
          <tr key={item.id}>
            <td className="py-2 pr-3">{item.name}<span className="block text-xs text-slate-500">{item.sku}</span></td>
            <td className="py-2 pr-3 text-right">{Number(item.current_stock).toLocaleString()} {item.unit}</td>
            <td className="py-2 pr-3 text-right font-semibold">{Number(item.reorder_level).toLocaleString()}</td>
          </tr>
        ))}
        {!lowStockItems.length && <tr><td colSpan={3} className="py-4 text-center text-slate-500">No low-stock items.</td></tr>}
      </SummaryTable>
    </div>

    <SummaryTable title="Cashier Exceptions" headers={['Type', 'Reference', 'Actor', 'Amount', 'Occurred']}>
      {cashierExceptionRows.slice(0, 10).map((row, index) => (
        <tr key={`${row.type}-${row.reference}-${index}`}>
          <td className="py-2 pr-3">{row.type}</td>
          <td className="py-2 pr-3">{row.reference}</td>
          <td className="py-2 pr-3">{row.actor}</td>
          <td className="py-2 pr-3 text-right font-semibold">{row.amount ? formatMoney(row.amount, currency) : '-'}</td>
          <td className="py-2 pr-3 text-right">{row.occurredAt ? new Date(row.occurredAt).toLocaleString() : '-'}</td>
        </tr>
      ))}
      {!cashierExceptionRows.length && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No cashier exceptions in current filters.</td></tr>}
    </SummaryTable>

    <div className="print-section grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 md:grid-cols-4">
      <span>Closed shifts: <strong>{reportData.closedShifts}</strong></span>
      <span>Receipt reprints: <strong>{reportData.receiptReprints}</strong></span>
      <span>Pending approvals: <strong>{reportData.pendingApprovals}</strong></span>
      <span>Approved discounts: <strong>{formatMoney(reportData.totalDiscountApproved, currency)}</strong></span>
    </div>
  </div>
);

const SummaryMetric = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs uppercase text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>
);

const SummaryTable = ({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) => (
  <div className="print-section overflow-x-auto">
    <h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
    <table className="w-full text-left text-xs">
      <thead className="border-b border-slate-200 uppercase text-slate-500">
        <tr>
          {headers.map((header, index) => (
            <th key={header} className={`py-2 pr-3 ${index > 0 ? 'text-right' : ''}`}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

export default Reports;
