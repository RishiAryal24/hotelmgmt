import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useAddGuestFolioCharge, useBookings, useCreateFacilityAmenity, useCreateFacilityService, useFacilityAmenities, useFacilityServices, useGuestFolios } from '../hooks/bookings';
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
import { FacilityAmenity, FacilityService } from '../types/bookings';
import { CashierCounter, RestaurantOrder } from '../types/restaurant';

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'room_posting', label: 'Room Posting' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const getAmenityCategory = (amenity?: FacilityAmenity): FacilityService['category'] => {
  const value = `${amenity?.code || ''} ${amenity?.name || ''}`.toLowerCase();
  if (value.includes('pool')) return 'pool';
  if (value.includes('spa')) return 'spa';
  if (value.includes('laundry')) return 'laundry';
  if (value.includes('minibar') || value.includes('mini-bar')) return 'minibar';
  if (value.includes('bed')) return 'extra_bed';
  if (value.includes('transport') || value.includes('pickup') || value.includes('airport')) return 'transport';
  if (value.includes('banquet') || value.includes('event')) return 'banquet';
  return 'other';
};

const POS: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: orders, isLoading, error } = useRestaurantOrders();
  const { data: currentShift, isLoading: shiftLoading } = useCurrentCashierShift();
  const { data: cashierCounters } = useCashierCounters();
  const { data: cashierShifts } = useCashierShifts();
  const { data: bookings } = useBookings();
  const { data: folios } = useGuestFolios();
  const { data: facilityAmenities } = useFacilityAmenities();
  const { data: facilityServices } = useFacilityServices();
  const addFolioCharge = useAddGuestFolioCharge();
  const settleOrder = useSettleRestaurantOrder();
  const openCashierShift = useOpenCashierShift();
  const closeCashierShift = useCloseCashierShift();
  const createCashierCounter = useCreateCashierCounter();
  const createFacilityAmenity = useCreateFacilityAmenity();
  const createFacilityService = useCreateFacilityService();
  const { can } = usePermissions();
  const [paymentForms, setPaymentForms] = useState<
    Record<string, { payment_method: RestaurantOrder['payment_method']; paid_amount: string; booking?: string }>
  >({});
  const [openShiftForm, setOpenShiftForm] = useState({ counter: '', opening_cash: '0.00', notes: '' });
  const [counterForm, setCounterForm] = useState({ name: '', code: '', outlet_type: 'restaurant' as CashierCounter['outlet_type'], is_active: true, notes: '' });
  const [addingCounter, setAddingCounter] = useState(false);
  const [addingFacilityAmenity, setAddingFacilityAmenity] = useState(false);
  const [addingFacilityService, setAddingFacilityService] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [closeShiftForm, setCloseShiftForm] = useState({ actual_cash: '', notes: '' });
  const [activeTab, setActiveTab] = useState('settlement');
  const [facilityChargeForm, setFacilityChargeForm] = useState({
    folioId: '',
    facility_service: '',
    amenity: '',
    source_module: '',
    description: '',
    amount: '',
  });
  const [facilityServiceForm, setFacilityServiceForm] = useState({
    name: '',
    code: '',
    amenity: '',
    default_price: '',
    description: '',
    is_active: true,
  });
  const [facilityAmenityForm, setFacilityAmenityForm] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true,
  });

  const payableOrders = orders?.filter((order) => order.status === 'served') || [];
  const paidOrders = orders?.filter((order) => order.status === 'paid') || [];
  const openFolios = folios?.filter((folio) => folio.status === 'open') || [];
  const activeFacilityAmenities = (facilityAmenities || []).filter((amenity) => amenity.is_active);
  const activeFacilityServices = (facilityServices || []).filter((service) => service.is_active);
  const facilityChargeLines = (folios || [])
    .flatMap((folio) =>
      folio.lines
        .filter((line) => !['restaurant_order', 'room_transfer', 'booking_extension'].includes(line.source_module))
        .map((line) => ({ ...line, folio })),
    )
    .slice(-12)
    .reverse();
  const tabs = [
    { id: 'settlement', label: 'Settlement', count: payableOrders.length },
    { id: 'facilities', label: 'Facilities', count: facilityChargeLines.length },
    { id: 'catalog', label: 'Catalog', count: (facilityAmenities?.length || 0) + (facilityServices?.length || 0) },
    { id: 'counters', label: 'Counters', count: cashierCounters?.length || 0 },
    { id: 'shifts', label: 'Shifts', count: cashierShifts?.length || 0 },
    { id: 'paid', label: 'Paid Orders', count: paidOrders.length },
  ];
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

  const selectedFacilityService = activeFacilityServices.find((service) => service.id === facilityChargeForm.facility_service);
  const selectedFacilityAmenity = activeFacilityAmenities.find((amenity) => amenity.id === facilityChargeForm.amenity);
  const selectedFolio = openFolios.find((folio) => folio.id === facilityChargeForm.folioId);

  const getAmenitySourceModule = (amenity?: FacilityAmenity | null, fallback = 'charge') =>
    `facility_${(amenity?.code || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'charge'}`;

  const handleFacilityItemSelect = (itemValue: string) => {
    const [itemType, itemId] = itemValue.split(':');
    if (itemType === 'service') {
      const service = activeFacilityServices.find((item) => item.id === itemId);
      setFacilityChargeForm({
        ...facilityChargeForm,
        facility_service: itemId,
        amenity: '',
        source_module: getAmenitySourceModule(service?.amenity_details, service?.category),
        description: service?.name || '',
        amount: service?.default_price || '',
      });
      return;
    }
    const amenity = activeFacilityAmenities.find((item) => item.id === itemId);
    setFacilityChargeForm({
      ...facilityChargeForm,
      facility_service: '',
      amenity: itemId,
      source_module: getAmenitySourceModule(amenity),
      description: amenity?.name || '',
      amount: '',
    });
  };

  const handleFacilityCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityChargeForm.folioId || (!facilityChargeForm.facility_service && !facilityChargeForm.amenity) || !facilityChargeForm.amount) return;
    addFolioCharge.mutate(
      {
        folioId: facilityChargeForm.folioId,
        facility_service: facilityChargeForm.facility_service || undefined,
        source_module: facilityChargeForm.source_module,
        description: facilityChargeForm.description || selectedFacilityService?.name || selectedFacilityAmenity?.name || 'Facility charge',
        amount: facilityChargeForm.amount,
      },
      {
        onSuccess: () => setFacilityChargeForm({ folioId: '', facility_service: '', amenity: '', source_module: '', description: '', amount: '' }),
      },
    );
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <CompactTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
            {currentShift && (
              <button onClick={() => setClosingShift(true)} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
                Close shift
              </button>
            )}
          </div>
        </div>
      </section>

      {activeTab === 'settlement' && <section className="grid gap-5">
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
      </section>}

      {activeTab === 'facilities' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <form onSubmit={handleFacilityCharge}>
              <h2 className="font-bold text-slate-900">Facility Charge</h2>
              <div className="mt-4 grid gap-3">
                <select
                  value={facilityChargeForm.folioId}
                  onChange={(e) => setFacilityChargeForm({ ...facilityChargeForm, folioId: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select in-house guest</option>
                  {openFolios.map((folio) => (
                    <option key={folio.id} value={folio.id}>
                      Room {folio.room_number} - {folio.guest_name}
                    </option>
                  ))}
                </select>
                <select
                  value={facilityChargeForm.facility_service ? `service:${facilityChargeForm.facility_service}` : facilityChargeForm.amenity ? `amenity:${facilityChargeForm.amenity}` : ''}
                  onChange={(e) => handleFacilityItemSelect(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select facility or amenity</option>
                  {activeFacilityAmenities.map((amenity) => (
                    <option key={`amenity-${amenity.id}`} value={`amenity:${amenity.id}`}>
                      {amenity.name}
                    </option>
                  ))}
                  {activeFacilityServices.map((service) => (
                    <option key={`service-${service.id}`} value={`service:${service.id}`}>
                      {service.amenity_details?.name ? `${service.amenity_details.name} - ` : ''}{service.name} - {formatMoney(service.default_price, settings?.currency)}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Description"
                  value={facilityChargeForm.description}
                  onChange={(e) => setFacilityChargeForm({ ...facilityChargeForm, description: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={facilityChargeForm.amount}
                  onChange={(e) => setFacilityChargeForm({ ...facilityChargeForm, amount: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              {selectedFolio && (
                <p className="mt-3 text-xs text-slate-500">
                  Posting to {selectedFolio.folio_number} for Room {selectedFolio.room_number}.
                </p>
              )}
              {activeFacilityServices.length === 0 && (
                <p className="mt-3 text-xs text-amber-700">
                  Add services in the Catalog tab for preset prices, or select an amenity and enter the amount manually.
                </p>
              )}
              <button
                disabled={!can('bookings.reservation.check_out') || addFolioCharge.isPending || (activeFacilityServices.length === 0 && activeFacilityAmenities.length === 0)}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Post charge
              </button>
              {addFolioCharge.isError && <p className="mt-3 text-sm text-red-600">Could not post charge. Check the folio and amount.</p>}
            </form>
          </div>

          <RowsTable headers={['Room', 'Guest', 'Charge', 'Amount']} minWidthClassName="min-w-[760px]">
            {facilityChargeLines.map((line) => (
              <tr key={line.id}>
                <td className="py-3 pr-4 font-medium text-slate-900">Room {line.folio.room_number}</td>
                <td className="py-3 pr-4">{line.folio.guest_name}</td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{line.description}</p>
                  <p className="text-xs text-slate-500">{line.source_module}</p>
                </td>
                <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(line.amount, settings?.currency)}</td>
              </tr>
            ))}
            {facilityChargeLines.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No facility charges posted yet.</td></tr>}
          </RowsTable>
        </section>
      )}

      {activeTab === 'catalog' && (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase text-slate-700">Amenities</h2>
                <p className="mt-0.5 text-xs text-slate-500">Admin-created hotel facilities such as Pool, Spa, or Airport Pickup.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddingFacilityAmenity(true)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Add amenity
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-2 pr-4">Amenity</th><th className="py-2 pr-4">Active</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(facilityAmenities || []).map((amenity) => (
                    <tr key={amenity.id}>
                      <td className="py-2 pr-4">
                        <p className="font-medium text-slate-900">{amenity.name}</p>
                        <p className="text-xs text-slate-500">{amenity.code}</p>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${amenity.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {amenity.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!facilityAmenities?.length && <tr><td colSpan={2} className="py-4 text-center text-slate-500">No amenities yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase text-slate-700">Charge Items</h2>
                <p className="mt-0.5 text-xs text-slate-500">Billable services attached to an amenity.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddingFacilityService(true)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Add service
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">Amenity</th><th className="py-2 pr-4">Category</th><th className="py-2 pr-4">Default Price</th><th className="py-2 pr-4">Active</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(facilityServices || []).map((service) => (
                    <tr key={service.id}>
                      <td className="py-2 pr-4">
                        <p className="font-medium text-slate-900">{service.name}</p>
                        <p className="text-xs text-slate-500">{service.code}</p>
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-600">{service.amenity_details?.name || 'Unassigned'}</td>
                      <td className="py-2 pr-4 text-xs text-slate-600">{service.category_display || service.category}</td>
                      <td className="py-2 pr-4 font-semibold text-slate-900">{formatMoney(service.default_price, settings?.currency)}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${service.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {service.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!facilityServices?.length && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No charge items yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'counters' && (
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
      )}

      {activeTab === 'shifts' && (
        <RowsTable headers={['Date', 'Counter', 'Status', 'Variance']} minWidthClassName="min-w-[760px]">
          {(cashierShifts || []).map((shift) => (
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
      )}

      {activeTab === 'paid' && (
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
      )}

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

      {addingFacilityAmenity && (
        <ActionModal
          title="Add amenity"
          description="Create the facility or amenity group first, then add billable services under it."
          onClose={() => setAddingFacilityAmenity(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createFacilityAmenity.mutate(facilityAmenityForm, {
                onSuccess: () => {
                  setFacilityAmenityForm({ name: '', code: '', description: '', is_active: true });
                  setAddingFacilityAmenity(false);
                },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Amenity name"
                value={facilityAmenityForm.name}
                onChange={(e) => setFacilityAmenityForm({ ...facilityAmenityForm, name: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                placeholder="Code"
                value={facilityAmenityForm.code}
                onChange={(e) => setFacilityAmenityForm({ ...facilityAmenityForm, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={facilityAmenityForm.is_active}
                  onChange={(e) => setFacilityAmenityForm({ ...facilityAmenityForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <textarea
                placeholder="Description"
                value={facilityAmenityForm.description}
                onChange={(e) => setFacilityAmenityForm({ ...facilityAmenityForm, description: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setAddingFacilityAmenity(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createFacilityAmenity.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save amenity
              </button>
            </div>
            {createFacilityAmenity.isError && <p className="mt-3 text-sm text-red-600">Could not create amenity. Check for duplicate name or code.</p>}
          </form>
        </ActionModal>
      )}

      {addingFacilityService && (
        <ActionModal
          title="Add service"
          description="Create a reusable charge item under an amenity or facility."
          onClose={() => setAddingFacilityService(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amenity = activeFacilityAmenities.find((item) => item.id === facilityServiceForm.amenity);
              createFacilityService.mutate({ ...facilityServiceForm, category: getAmenityCategory(amenity) }, {
                onSuccess: () => {
                  setFacilityServiceForm({ name: '', code: '', amenity: '', default_price: '', description: '', is_active: true });
                  setAddingFacilityService(false);
                },
              });
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Service name"
                value={facilityServiceForm.name}
                onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, name: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                placeholder="Code"
                value={facilityServiceForm.code}
                onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={facilityServiceForm.amenity}
                onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, amenity: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select amenity</option>
                {activeFacilityAmenities.map((amenity) => (
                  <option key={amenity.id} value={amenity.id}>{amenity.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Default price"
                value={facilityServiceForm.default_price}
                onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, default_price: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={facilityServiceForm.is_active}
                  onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, is_active: e.target.checked })}
                />
                Active
              </label>
              <textarea
                placeholder="Description"
                value={facilityServiceForm.description}
                onChange={(e) => setFacilityServiceForm({ ...facilityServiceForm, description: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setAddingFacilityService(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createFacilityService.isPending || activeFacilityAmenities.length === 0} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save service
              </button>
            </div>
            {activeFacilityAmenities.length === 0 && <p className="mt-3 text-sm text-amber-700">Create an amenity before adding services.</p>}
            {createFacilityService.isError && <p className="mt-3 text-sm text-red-600">Could not create service. Check for duplicate name or code.</p>}
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
