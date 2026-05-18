import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import { useBookings } from '../hooks/bookings';
import { usePermissions } from '../hooks/permissions';
import {
  useCashierCounters,
  useCashierShifts,
  useCloseCashierShift,
  useCreateCashierCounter,
  useCurrentCashierShift,
  useOpenCashierShift,
  useRestaurantOrders,
  useSettleRestaurantOrder,
} from '../hooks/restaurant';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { CashierCounter, RestaurantOrder } from '../types/restaurant';

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'room_posting', label: 'Room Posting' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

const POS: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: orders, isLoading, error } = useRestaurantOrders();
  const { data: currentShift, isLoading: shiftLoading } = useCurrentCashierShift();
  const { data: cashierCounters } = useCashierCounters();
  const { data: cashierShifts } = useCashierShifts();
  const { data: bookings } = useBookings();
  const settleOrder = useSettleRestaurantOrder();
  const openCashierShift = useOpenCashierShift();
  const closeCashierShift = useCloseCashierShift();
  const createCashierCounter = useCreateCashierCounter();
  const { can } = usePermissions();
  const [paymentForms, setPaymentForms] = useState<
    Record<string, { payment_method: RestaurantOrder['payment_method']; paid_amount: string; booking?: string }>
  >({});
  const [openShiftForm, setOpenShiftForm] = useState({ counter: '', opening_cash: '0.00', notes: '' });
  const [counterForm, setCounterForm] = useState({ name: '', code: '', outlet_type: 'restaurant' as CashierCounter['outlet_type'], is_active: true, notes: '' });
  const [addingCounter, setAddingCounter] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [closeShiftForm, setCloseShiftForm] = useState({ actual_cash: '', notes: '' });

  const payableOrders = orders?.filter((order) => order.status === 'served') || [];
  const paidOrders = orders?.filter((order) => order.status === 'paid') || [];
  const activeBookings = bookings?.filter((booking) => booking.status === 'checked_in') || [];
  const liveTotals = currentShift?.live_totals;
  const expectedCash = liveTotals?.expected_cash || currentShift?.expected_cash || '0.00';
  const closeVariance =
    closeShiftForm.actual_cash === ''
      ? null
      : Number(closeShiftForm.actual_cash || 0) - Number(expectedCash || 0);

  const getPaymentForm = (order: RestaurantOrder) =>
    paymentForms[order.id] || {
      payment_method: 'cash' as RestaurantOrder['payment_method'],
      paid_amount: order.grand_total,
      booking: '',
    };

  if (isLoading || shiftLoading) return <div className="p-6 text-slate-600">Loading POS orders...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading POS orders</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">POS Settlement</h1>
            <p className="mt-1 text-sm text-slate-500">Counter shifts, payable orders, and settled sales in compact rows.</p>
          </div>
          {currentShift && (
            <button onClick={() => setClosingShift(true)} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Close shift
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Cashier Shift</h2>
              <p className="mt-1 text-sm text-slate-500">
                {currentShift ? `${currentShift.counter_details?.name || 'Counter'} | Open since ${new Date(currentShift.opened_at).toLocaleString()}` : 'Open a counter shift before processing payments.'}
              </p>
            </div>
          </div>
          {currentShift ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <ShiftMetric label="Expected Cash" value={formatMoney(expectedCash, settings?.currency)} />
              <ShiftMetric label="Card" value={formatMoney(liveTotals?.expected_card || '0.00', settings?.currency)} />
              <ShiftMetric label="Wallet" value={formatMoney(liveTotals?.expected_wallet || '0.00', settings?.currency)} />
              <ShiftMetric label="Bank" value={formatMoney(liveTotals?.expected_bank_transfer || '0.00', settings?.currency)} />
              <ShiftMetric label="Room Posting" value={formatMoney(liveTotals?.expected_room_posting || '0.00', settings?.currency)} />
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openCashierShift.mutate(openShiftForm, { onSuccess: () => setOpenShiftForm({ counter: '', opening_cash: '0.00', notes: '' }) });
              }}
              className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,220px)_minmax(140px,180px)_minmax(0,1fr)_auto]"
            >
              <select
                value={openShiftForm.counter}
                onChange={(e) => setOpenShiftForm({ ...openShiftForm, counter: e.target.value })}
                className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select counter</option>
                {(cashierCounters || []).filter((counter) => counter.is_active).map((counter) => (
                  <option key={counter.id} value={counter.id}>{counter.name} - {counter.outlet_type}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openShiftForm.opening_cash}
                onChange={(e) => setOpenShiftForm({ ...openShiftForm, opening_cash: e.target.value })}
                className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                placeholder="Opening note"
                value={openShiftForm.notes}
                onChange={(e) => setOpenShiftForm({ ...openShiftForm, notes: e.target.value })}
                className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button disabled={!can('pos.sale.create') || openCashierShift.isPending || !openShiftForm.counter} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:col-span-2 xl:col-span-1">
                Open shift
              </button>
              {openCashierShift.isError && <p className="text-sm text-red-600 md:col-span-2 xl:col-span-4">Could not open shift. You or this counter may already have one open.</p>}
            </form>
          )}
        </div>

        <div className="grid min-w-0 gap-5">
          <RowsTable headers={['Date', 'Counter', 'Status', 'Variance']} minWidthClassName="min-w-[520px]">
            {(cashierShifts || []).slice(0, 6).map((shift) => (
              <tr key={shift.id}>
                <td className="py-3 pr-4 font-medium text-slate-900">{shift.business_date}</td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{shift.counter_details?.name || 'Counter'}</p>
                  <p className="text-xs text-slate-500">{shift.counter_details?.outlet_type || '-'}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{shift.status}</span>
                </td>
                <td className={`py-3 pr-4 font-semibold ${Number(shift.cash_variance || 0) === 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                  {formatMoney(shift.cash_variance, settings?.currency)}
                </td>
              </tr>
            ))}
            {!cashierShifts?.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No shifts yet.</td></tr>}
          </RowsTable>

          <div className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase text-slate-700">Cashier Counters</h2>
              <p className="mt-0.5 text-xs text-slate-500">Hotel payment points by outlet.</p>
            </div>
            <button
              type="button"
              onClick={() => setAddingCounter(true)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
            >
              Add counter
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="py-2 pr-4">Counter</th><th className="py-2 pr-4">Outlet</th><th className="py-2 pr-4">Active</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(cashierCounters || []).map((counter) => (
                  <tr key={counter.id}>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-900">{counter.name}</p>
                      <p className="text-xs text-slate-500">{counter.code}</p>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600">{counter.outlet_type}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${counter.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {counter.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!cashierCounters?.length && <tr><td colSpan={3} className="py-4 text-center text-slate-500">No counters yet.</td></tr>}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="font-bold text-slate-900">Payable Orders</h2>
            <p className="text-sm text-slate-500">Served restaurant orders waiting for settlement.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Order</th>
                  <th className="py-3 pr-4">Items</th>
                  <th className="py-3 pr-4">Amount Due</th>
                  <th className="py-3 pr-4">Method</th>
                  <th className="py-3 pr-4">Paid Amount</th>
                  <th className="py-3 pr-4">Room</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
          {payableOrders.map((order) => {
            const form = getPaymentForm(order);
            return (
              <tr key={order.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{order.order_number}</p>
                  <p className="text-xs text-slate-500">
                    {order.order_type} {order.table_details ? `| Table ${order.table_details.table_number}` : ''}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <div className="max-w-[320px] text-slate-700">
                    {order.lines.filter((line) => line.status !== 'cancelled').map((line) => `${line.quantity}x ${line.menu_item_details?.name}`).join(', ') || 'No active items'}
                  </div>
                </td>
                <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(order.grand_total, settings?.currency)}</td>
                <td className="py-3 pr-4">
                    <select
                      value={form.payment_method}
                      onChange={(e) =>
                        setPaymentForms({
                          ...paymentForms,
                          [order.id]: { ...form, payment_method: e.target.value as RestaurantOrder['payment_method'] },
                        })
                      }
                      className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                </td>
                <td className="py-3 pr-4">
                    <input
                      type="number"
                      step="0.01"
                      value={form.paid_amount}
                      disabled={form.payment_method === 'room_posting'}
                      onChange={(e) =>
                        setPaymentForms({
                          ...paymentForms,
                          [order.id]: { ...form, paid_amount: e.target.value },
                        })
                      }
                      className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                </td>
                <td className="py-3 pr-4">
                    {form.payment_method === 'room_posting' && (
                      <select
                        value={form.booking || ''}
                        onChange={(e) =>
                          setPaymentForms({
                            ...paymentForms,
                            [order.id]: { ...form, booking: e.target.value },
                          })
                        }
                        className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        required
                      >
                        <option value="">Select checked-in room</option>
                        {activeBookings.map((booking) => (
                          <option key={booking.id} value={booking.id}>
                            Room {booking.room_details?.room_number} - {booking.guest_details?.first_name} {booking.guest_details?.last_name}
                          </option>
                        ))}
                      </select>
                    )}
                    {form.payment_method !== 'room_posting' && <span className="text-xs text-slate-400">-</span>}
                </td>
                <td className="py-3 pr-4">
                    {can('pos.sale.create') && (
                      <button
                        onClick={() =>
                          settleOrder.mutate({
                            orderId: order.id,
                            payment_method: form.payment_method,
                            paid_amount: form.paid_amount,
                            booking: form.booking,
                            cashier_shift: currentShift?.id,
                          })
                        }
                        disabled={!currentShift || (form.payment_method === 'room_posting' && !form.booking)}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Settle
                      </button>
                    )}
                    {!currentShift && <p className="mt-2 text-xs text-amber-700">Open a cashier shift to settle bills.</p>}
                </td>
              </tr>
            );
          })}
          {payableOrders.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No served orders waiting for settlement.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <RowsTable headers={['Order', 'Location', 'Payment', 'Paid', 'Status']}>
          {paidOrders.slice(0, 10).map((order) => (
            <tr key={order.id}>
              <td className="py-3 pr-4 font-medium text-slate-900">{order.order_number}</td>
              <td className="py-3 pr-4">{order.table_details ? `Table ${order.table_details.table_number}` : order.room_number ? `Room ${order.room_number}` : order.order_type}</td>
              <td className="py-3 pr-4">{order.payment_method || '-'}</td>
              <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(order.paid_amount, settings?.currency)}</td>
              <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span></td>
            </tr>
          ))}
          {paidOrders.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No paid orders yet.</td></tr>}
        </RowsTable>
      </section>

      {closingShift && currentShift && (
        <ActionModal
          title="Close cashier shift"
          description={`Expected cash ${formatMoney(expectedCash, settings?.currency)}`}
          onClose={() => setClosingShift(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              closeCashierShift.mutate(
                { shiftId: currentShift.id, actual_cash: closeShiftForm.actual_cash, notes: closeShiftForm.notes },
                {
                  onSuccess: () => {
                    setClosingShift(false);
                    setCloseShiftForm({ actual_cash: '', notes: '' });
                  },
                },
              );
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ShiftMetric label="Expected Cash" value={formatMoney(expectedCash, settings?.currency)} />
              <ShiftMetric label="Expected Total" value={formatMoney(liveTotals?.expected_total || '0.00', settings?.currency)} />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Actual cash counted"
                value={closeShiftForm.actual_cash}
                onChange={(e) => setCloseShiftForm({ ...closeShiftForm, actual_cash: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                required
              />
              <textarea
                placeholder="Variance note"
                value={closeShiftForm.notes}
                onChange={(e) => setCloseShiftForm({ ...closeShiftForm, notes: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              {closeVariance !== null && (
                <p className={`text-sm font-medium md:col-span-2 ${closeVariance === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  Variance: {formatMoney(String(closeVariance.toFixed(2)), settings?.currency)}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setClosingShift(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={closeCashierShift.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Close shift
              </button>
            </div>
            {closeCashierShift.isError && <p className="mt-3 text-sm text-red-600">Could not close shift.</p>}
          </form>
        </ActionModal>
      )}

      {addingCounter && (
        <ActionModal
          title="Add cashier counter"
          description="Create a counter for each hotel payment point."
          onClose={() => setAddingCounter(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createCashierCounter.mutate(counterForm, {
                onSuccess: () => {
                  setCounterForm({ name: '', code: '', outlet_type: 'restaurant', is_active: true, notes: '' });
                  setAddingCounter(false);
                },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Counter name"
                value={counterForm.name}
                onChange={(e) => setCounterForm({ ...counterForm, name: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                placeholder="Code"
                value={counterForm.code}
                onChange={(e) => setCounterForm({ ...counterForm, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={counterForm.outlet_type}
                onChange={(e) => setCounterForm({ ...counterForm, outlet_type: e.target.value as typeof counterForm.outlet_type })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="reception">Reception</option>
                <option value="restaurant">Restaurant</option>
                <option value="pool">Pool</option>
                <option value="spa">Spa</option>
                <option value="bar">Bar</option>
                <option value="banquet">Banquet</option>
                <option value="other">Other</option>
              </select>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={counterForm.is_active}
                  onChange={(e) => setCounterForm({ ...counterForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <textarea
                placeholder="Notes"
                value={counterForm.notes}
                onChange={(e) => setCounterForm({ ...counterForm, notes: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setAddingCounter(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createCashierCounter.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save counter
              </button>
            </div>
            {createCashierCounter.isError && <p className="mt-3 text-sm text-red-600">Could not create counter. Check for duplicate name or code.</p>}
          </form>
        </ActionModal>
      )}
    </div>
  );
};

const ShiftMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 p-3">
    <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

const RowsTable = ({ headers, children, minWidthClassName = 'min-w-[760px]' }: { headers: string[]; children: React.ReactNode; minWidthClassName?: string }) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${minWidthClassName}`}>
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="py-3 pr-4">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  </section>
);

export default POS;
