import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBookings } from '../hooks/bookings';
import { useRestaurantOrders, useSettleRestaurantOrder } from '../hooks/restaurant';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { RestaurantOrder } from '../types/restaurant';

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
  const { data: bookings } = useBookings();
  const settleOrder = useSettleRestaurantOrder();
  const [paymentForms, setPaymentForms] = useState<
    Record<string, { payment_method: RestaurantOrder['payment_method']; paid_amount: string; booking?: string }>
  >({});

  const payableOrders = orders?.filter((order) => order.status === 'served') || [];
  const paidOrders = orders?.filter((order) => order.status === 'paid') || [];
  const activeBookings = bookings?.filter((booking) => booking.status === 'checked_in') || [];

  const getPaymentForm = (order: RestaurantOrder) =>
    paymentForms[order.id] || {
      payment_method: 'cash' as RestaurantOrder['payment_method'],
      paid_amount: order.grand_total,
      booking: '',
    };

  if (isLoading) return <div className="p-6 text-slate-600">Loading POS orders...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading POS orders</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">POS Settlement</h1>
        <p className="mt-2 text-slate-600">Settle served restaurant orders and release tables for cleaning.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {payableOrders.map((order) => {
            const form = getPaymentForm(order);
            return (
              <article key={order.id} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{order.order_number}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {order.order_type} {order.table_details ? `| Table ${order.table_details.table_number}` : ''}
                    </p>
                    <div className="mt-3 space-y-2">
                      {order.lines.map((line) => (
                        <div key={line.id} className="flex justify-between gap-4 text-sm text-slate-700">
                          <span>
                            {line.quantity} x {line.menu_item_details?.name}
                          </span>
                          <span>{formatMoney(line.line_total, settings?.currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-60 rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Amount Due</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatMoney(order.grand_total, settings?.currency)}</p>
                    <select
                      value={form.payment_method}
                      onChange={(e) =>
                        setPaymentForms({
                          ...paymentForms,
                          [order.id]: { ...form, payment_method: e.target.value as RestaurantOrder['payment_method'] },
                        })
                      }
                      className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
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
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    {form.payment_method === 'room_posting' && (
                      <select
                        value={form.booking || ''}
                        onChange={(e) =>
                          setPaymentForms({
                            ...paymentForms,
                            [order.id]: { ...form, booking: e.target.value },
                          })
                        }
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                    <button
                      onClick={() =>
                        settleOrder.mutate({
                          orderId: order.id,
                          payment_method: form.payment_method,
                          paid_amount: form.paid_amount,
                          booking: form.booking,
                        })
                      }
                      disabled={form.payment_method === 'room_posting' && !form.booking}
                      className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Settle Bill
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {payableOrders.length === 0 && <p className="text-slate-600">No served orders waiting for settlement.</p>}
        </div>

        <aside className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recent Paid Orders</h2>
          <div className="mt-4 space-y-3">
            {paidOrders.slice(0, 8).map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{order.order_number}</h3>
                    <p className="text-xs text-slate-500">
                      {order.payment_method}
                      {order.room_number ? ` | Room ${order.room_number}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{formatMoney(order.paid_amount, settings?.currency)}</span>
                </div>
              </div>
            ))}
            {paidOrders.length === 0 && <p className="text-sm text-slate-600">No paid orders yet.</p>}
          </div>
        </aside>
      </section>
    </div>
  );
};

export default POS;
