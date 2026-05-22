import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useAddGuestFolioCharge, useBookings, useCreateFacilityAmenity, useCreateFacilityService, useFacilityAmenities, useFacilityServices, useGuestFolios, useSettleGuestFolio } from '../hooks/bookings';
import { usePermissions } from '../hooks/permissions';
import {
  useCashierCounters,
  useCashierShifts,
  useCloseCashierShift,
  useCreateCashierCounter,
  useCurrentCashierShift,
  useOpenCashierShift,
  useReprintRestaurantReceipt,
  useRestaurantChargeConfig,
  useRestaurantOrders,
  useSettleRestaurantOrder,
  useUpdateRestaurantChargeConfig,
} from '../hooks/restaurant';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { FacilityAmenity, FacilityService, GuestFolio } from '../types/bookings';
import { CashierCounter, CashierShift, RestaurantOrder } from '../types/restaurant';

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'room_posting', label: 'Room Posting' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const folioPaymentMethods = paymentMethods.filter((method) => method.value !== 'room_posting');
const splitPaymentMethods = folioPaymentMethods;
const restaurantPaymentMethods = [...paymentMethods, { value: 'split', label: 'Split Payment' }];

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

const formatFolioLineSource = (line: { source_module: string }) => {
  if (line.source_module === 'restaurant_order') return 'Restaurant order';
  if (line.source_module === 'room_charge') return 'Room charge';
  if (line.source_module === 'room_transfer') return 'Room transfer';
  if (line.source_module === 'booking_extension') return 'Stay extension';
  if (line.source_module.startsWith('facility_')) {
    return line.source_module
      .replace('facility_', '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return line.source_module
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const POS: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: orders, isLoading, error } = useRestaurantOrders();
  const { data: chargeConfig } = useRestaurantChargeConfig();
  const { data: currentShift, isLoading: shiftLoading } = useCurrentCashierShift();
  const { data: cashierCounters } = useCashierCounters();
  const { data: cashierShifts } = useCashierShifts();
  const { data: bookings } = useBookings();
  const { data: folios } = useGuestFolios();
  const { data: facilityAmenities } = useFacilityAmenities();
  const { data: facilityServices } = useFacilityServices();
  const addFolioCharge = useAddGuestFolioCharge();
  const settleGuestFolio = useSettleGuestFolio();
  const settleOrder = useSettleRestaurantOrder();
  const reprintRestaurantReceipt = useReprintRestaurantReceipt();
  const openCashierShift = useOpenCashierShift();
  const closeCashierShift = useCloseCashierShift();
  const createCashierCounter = useCreateCashierCounter();
  const createFacilityAmenity = useCreateFacilityAmenity();
  const createFacilityService = useCreateFacilityService();
  const updateChargeConfig = useUpdateRestaurantChargeConfig();
  const { can } = usePermissions();
  const [paymentForms, setPaymentForms] = useState<
    Record<string, { payment_method: RestaurantOrder['payment_method']; paid_amount: string; booking?: string; split_payments: { payment_method: RestaurantOrder['payment_method']; amount: string }[] }>
  >({});
  const [folioPaymentForms, setFolioPaymentForms] = useState<Record<string, { payment_method: GuestFolio['payment_method']; paid_amount: string }>>({});
  const [openShiftForm, setOpenShiftForm] = useState({ counter: '', opening_cash: '0.00', notes: '' });
  const [counterForm, setCounterForm] = useState({ name: '', code: '', outlet_type: 'restaurant' as CashierCounter['outlet_type'], is_active: true, notes: '' });
  const [addingCounter, setAddingCounter] = useState(false);
  const [addingFacilityAmenity, setAddingFacilityAmenity] = useState(false);
  const [addingFacilityService, setAddingFacilityService] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [closeShiftForm, setCloseShiftForm] = useState({
    actual_cash: '',
    actual_card: '',
    actual_wallet: '',
    actual_bank_transfer: '',
    actual_room_posting: '',
    notes: '',
  });
  const [closedShiftReport, setClosedShiftReport] = useState<CashierShift | null>(null);
  const [selectedFolioReport, setSelectedFolioReport] = useState<GuestFolio | null>(null);
  const [folioPaymentReceipt, setFolioPaymentReceipt] = useState<GuestFolio | null>(null);
  const [restaurantPaymentReceipt, setRestaurantPaymentReceipt] = useState<RestaurantOrder | null>(null);
  const [restaurantBillPreview, setRestaurantBillPreview] = useState<RestaurantOrder | null>(null);
  const [paidOrderSearch, setPaidOrderSearch] = useState('');
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
  const [chargeConfigForm, setChargeConfigForm] = useState({
    tax_rate: '0.00',
    service_charge_rate: '0.00',
    apply_tax: true,
    apply_service_charge: true,
    is_active: true,
  });

  useEffect(() => {
    if (!chargeConfig) return;
    setChargeConfigForm({
      tax_rate: chargeConfig.tax_rate,
      service_charge_rate: chargeConfig.service_charge_rate,
      apply_tax: chargeConfig.apply_tax,
      apply_service_charge: chargeConfig.apply_service_charge,
      is_active: chargeConfig.is_active,
    });
  }, [chargeConfig]);

  const payableOrders = orders?.filter((order) => order.status === 'served') || [];
  const paidOrders = orders?.filter((order) => order.status === 'paid') || [];
  const filteredPaidOrders = paidOrders.filter((order) => {
    const query = paidOrderSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      order.order_number,
      order.receipt_number,
      order.payment_method,
      order.table_details?.table_number,
      order.room_number,
      order.guest_name,
      order.order_type,
      order.paid_amount,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const openFolios = folios?.filter((folio) => folio.status === 'open') || [];
  const activeFacilityAmenities = (facilityAmenities || []).filter((amenity) => amenity.is_active);
  const activeFacilityServices = (facilityServices || []).filter((service) => service.is_active);
  const getOrderFolio = (order?: RestaurantOrder | null) =>
    order?.room_booking ? (folios || []).find((folio) => folio.booking === order.room_booking) : undefined;
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
    { id: 'folios', label: 'Folios', count: openFolios.length + payableOrders.length },
    { id: 'facilities', label: 'Facilities', count: facilityChargeLines.length },
    { id: 'catalog', label: 'Catalog', count: (facilityAmenities?.length || 0) + (facilityServices?.length || 0) },
    { id: 'settings', label: 'Settings', count: chargeConfig?.is_active ? 1 : 0 },
    { id: 'counters', label: 'Counters', count: cashierCounters?.length || 0 },
    { id: 'shifts', label: 'Shifts', count: cashierShifts?.length || 0 },
    { id: 'paid', label: 'Paid Orders', count: paidOrders.length },
  ];
  const activeBookings = bookings?.filter((booking) => booking.status === 'checked_in') || [];
  const liveTotals = currentShift?.live_totals;
  const expectedCash = liveTotals?.expected_cash || currentShift?.expected_cash || '0.00';
  const expectedTotal = liveTotals?.expected_total || currentShift?.expected_total || '0.00';
  const expectedCard = liveTotals?.expected_card || currentShift?.expected_card || '0.00';
  const expectedWallet = liveTotals?.expected_wallet || currentShift?.expected_wallet || '0.00';
  const expectedBankTransfer = liveTotals?.expected_bank_transfer || currentShift?.expected_bank_transfer || '0.00';
  const expectedRoomPosting = liveTotals?.expected_room_posting || currentShift?.expected_room_posting || '0.00';
  const paymentLabel = (method: string) =>
    restaurantPaymentMethods.find((item) => item.value === method)?.label || folioPaymentMethods.find((item) => item.value === method)?.label || method.replace('_', ' ');
  const closeVariances = [
    { label: 'Cash', actual: closeShiftForm.actual_cash, expected: expectedCash },
    { label: 'Card', actual: closeShiftForm.actual_card, expected: expectedCard },
    { label: 'Wallet', actual: closeShiftForm.actual_wallet, expected: expectedWallet },
    { label: 'Bank', actual: closeShiftForm.actual_bank_transfer, expected: expectedBankTransfer },
    { label: 'Room Posting', actual: closeShiftForm.actual_room_posting, expected: expectedRoomPosting },
  ].map((row) => ({
    ...row,
    variance: row.actual === '' ? null : Number(row.actual || 0) - Number(row.expected || 0),
  }));
  const closeVariance =
    closeVariances.some((row) => row.variance !== null)
      ? closeVariances.reduce((total, row) => total + (row.variance || 0), 0)
      : null;

  const getPaymentForm = (order: RestaurantOrder) =>
    paymentForms[order.id] || {
      payment_method: 'cash' as RestaurantOrder['payment_method'],
      paid_amount: order.grand_total,
      booking: '',
      split_payments: [
        { payment_method: 'cash' as RestaurantOrder['payment_method'], amount: order.grand_total },
        { payment_method: 'card' as RestaurantOrder['payment_method'], amount: '0.00' },
      ],
    };

  const getFolioPaymentForm = (folio: GuestFolio) =>
    folioPaymentForms[folio.id] || {
      payment_method: 'cash' as GuestFolio['payment_method'],
      paid_amount: folio.grand_total,
    };

  const getSplitPaymentTotal = (form: { split_payments: { amount: string }[] }) =>
    form.split_payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);

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

  const restaurantReceiptFolio = getOrderFolio(restaurantPaymentReceipt);

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
              <button
                onClick={() => {
                  setCloseShiftForm({
                    actual_cash: expectedCash,
                    actual_card: expectedCard,
                    actual_wallet: expectedWallet,
                    actual_bank_transfer: expectedBankTransfer,
                    actual_room_posting: expectedRoomPosting,
                    notes: '',
                  });
                  setClosingShift(true);
                }}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
              >
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ShiftMetric label="Expected Cash" value={formatMoney(expectedCash, settings?.currency)} />
              <ShiftMetric label="Card" value={formatMoney(liveTotals?.expected_card || '0.00', settings?.currency)} />
              <ShiftMetric label="Wallet" value={formatMoney(liveTotals?.expected_wallet || '0.00', settings?.currency)} />
              <ShiftMetric label="Bank" value={formatMoney(liveTotals?.expected_bank_transfer || '0.00', settings?.currency)} />
              <ShiftMetric label="Room Posting" value={formatMoney(liveTotals?.expected_room_posting || '0.00', settings?.currency)} />
              <ShiftMetric label="Facility Charges" value={formatMoney(liveTotals?.facility_charges || '0.00', settings?.currency)} />
              <ShiftMetric label="Restaurant Cash" value={formatMoney(liveTotals?.restaurant_cash || '0.00', settings?.currency)} />
              <ShiftMetric label="Expected Total" value={formatMoney(expectedTotal, settings?.currency)} />
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
                <td className="py-3 pr-4">
                  <p className="font-semibold text-slate-900">{formatMoney(order.grand_total, settings?.currency)}</p>
                  <p className="text-xs text-slate-500">
                    Sub {formatMoney(order.subtotal, settings?.currency)}
                    {Number(order.tax_total) > 0 ? ` | Tax ${formatMoney(order.tax_total, settings?.currency)}` : ''}
                    {Number(order.service_charge_total) > 0 ? ` | Service ${formatMoney(order.service_charge_total, settings?.currency)}` : ''}
                  </p>
                </td>
                <td className="py-3 pr-4">
                      <select
                        value={form.payment_method}
                        onChange={(e) =>
                          setPaymentForms({
                            ...paymentForms,
                            [order.id]: {
                              ...form,
                              payment_method: e.target.value as RestaurantOrder['payment_method'],
                              paid_amount: e.target.value === 'split' ? order.grand_total : form.paid_amount,
                              booking: e.target.value === 'room_posting' ? form.booking : '',
                            },
                          })
                        }
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                      {restaurantPaymentMethods.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                </td>
                <td className="py-3 pr-4">
                    {form.payment_method === 'split' ? (
                      <div className="grid min-w-[260px] gap-2">
                        {form.split_payments.map((payment, index) => (
                          <div key={index} className="flex gap-2">
                            <select
                              value={payment.payment_method}
                              onChange={(e) => {
                                const next = [...form.split_payments];
                                next[index] = { ...payment, payment_method: e.target.value as RestaurantOrder['payment_method'] };
                                setPaymentForms({ ...paymentForms, [order.id]: { ...form, split_payments: next } });
                              }}
                              className="w-32 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                            >
                              {splitPaymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                            </select>
                            <input
                              type="number"
                              step="0.01"
                              value={payment.amount}
                              onChange={(e) => {
                                const next = [...form.split_payments];
                                next[index] = { ...payment, amount: e.target.value };
                                setPaymentForms({ ...paymentForms, [order.id]: { ...form, split_payments: next } });
                              }}
                              className="w-24 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                            />
                            {form.split_payments.length > 1 && <button type="button" onClick={() => setPaymentForms({ ...paymentForms, [order.id]: { ...form, split_payments: form.split_payments.filter((_, rowIndex) => rowIndex !== index) } })} className="rounded-xl border border-slate-200 px-2 text-xs text-slate-600">Remove</button>}
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <button type="button" onClick={() => setPaymentForms({ ...paymentForms, [order.id]: { ...form, split_payments: [...form.split_payments, { payment_method: 'cash', amount: '0.00' }] } })} className="font-medium text-emerald-700 hover:underline">Add payment</button>
                          <span className={Math.abs(getSplitPaymentTotal(form) - Number(order.grand_total || 0)) < 0.01 ? 'text-emerald-700' : 'text-rose-700'}>
                            {formatMoney(getSplitPaymentTotal(form).toFixed(2), settings?.currency)}
                          </span>
                        </div>
                      </div>
                    ) : (
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
                    )}
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRestaurantBillPreview(order)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Print bill
                      </button>
                    {can('pos.sale.create') && (
                      <button
                        onClick={() =>
                          settleOrder.mutate({
                            orderId: order.id,
                            payment_method: form.payment_method,
                            paid_amount: form.paid_amount,
                            booking: form.booking,
                            cashier_shift: currentShift?.id,
                            payments: form.payment_method === 'split' ? form.split_payments.filter((payment) => Number(payment.amount || 0) > 0).map((payment) => ({ payment_method: payment.payment_method, amount: payment.amount })) : undefined,
                          }, { onSuccess: (settledOrder) => setRestaurantPaymentReceipt(settledOrder as RestaurantOrder) })
                        }
                        disabled={!currentShift || (form.payment_method === 'room_posting' && !form.booking) || (form.payment_method === 'split' && Math.abs(getSplitPaymentTotal(form) - Number(order.grand_total || 0)) >= 0.01)}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Settle
                      </button>
                    )}
                    </div>
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

      {activeTab === 'folios' && (
        <section className="grid gap-5 xl:grid-cols-2">
          <RowsTable headers={['Room Folio', 'Guest', 'Status', 'Due', 'Payment', 'Actions']} minWidthClassName="min-w-[980px]">
            {(folios || []).map((folio) => {
              const form = getFolioPaymentForm(folio);
              return (
                <tr key={folio.id}>
                  <td className="py-3 pr-4">
                    <button onClick={() => setSelectedFolioReport(folio)} className="text-left font-medium text-emerald-700 hover:underline">
                      {folio.folio_number}
                      <span className="block text-xs text-slate-500">Room {folio.room_number}</span>
                    </button>
                  </td>
                  <td className="py-3 pr-4">{folio.guest_name}</td>
                  <td className="py-3 pr-4 capitalize">{folio.status}</td>
                  <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(folio.grand_total, settings?.currency)}</td>
                  <td className="py-3 pr-4">
                    {folio.status === 'open' ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={form.payment_method}
                          onChange={(e) => setFolioPaymentForms({ ...folioPaymentForms, [folio.id]: { ...form, payment_method: e.target.value as GuestFolio['payment_method'] } })}
                          className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        >
                          {folioPaymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={form.paid_amount}
                          onChange={(e) => setFolioPaymentForms({ ...folioPaymentForms, [folio.id]: { ...form, paid_amount: e.target.value } })}
                          className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">{folio.payment_method || '-'}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setSelectedFolioReport(folio)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        View/Print
                      </button>
                      {folio.status === 'open' && (
                        <button
                          onClick={() =>
                            settleGuestFolio.mutate(
                              { folioId: folio.id, payment_method: form.payment_method, paid_amount: form.paid_amount, cashier_shift: currentShift?.id },
                              { onSuccess: (settledFolio) => setFolioPaymentReceipt(settledFolio) },
                            )
                          }
                          disabled={!currentShift || settleGuestFolio.isPending}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Settle
                        </button>
                      )}
                    </div>
                    {folio.status === 'open' && !currentShift && <p className="mt-2 text-xs text-amber-700">Open a cashier shift to settle.</p>}
                  </td>
                </tr>
              );
            })}
            {!folios?.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No room folios yet. They appear after guest check-in.</td></tr>}
          </RowsTable>

          <RowsTable headers={['Restaurant Folio', 'Location', 'Status', 'Due', 'Actions']} minWidthClassName="min-w-[760px]">
            {payableOrders.map((order) => (
              <tr key={order.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{order.order_number}</p>
                  <p className="text-xs text-slate-500">{order.lines.filter((line) => line.status !== 'cancelled').map((line) => `${line.quantity}x ${line.menu_item_details?.name}`).join(', ') || 'No active items'}</p>
                </td>
                <td className="py-3 pr-4">{order.table_details ? `Table ${order.table_details.table_number}` : order.room_number ? `Room ${order.room_number}` : order.order_type}</td>
                <td className="py-3 pr-4 capitalize">{order.status}</td>
                <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(order.grand_total, settings?.currency)}</td>
                <td className="py-3 pr-4">
                  <button onClick={() => setActiveTab('settlement')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                    Settle
                  </button>
                  <button onClick={() => setRestaurantBillPreview(order)} className="ml-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Print bill
                  </button>
                </td>
              </tr>
            ))}
            {payableOrders.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Restaurant folios appear after orders are served from kitchen.</td></tr>}
          </RowsTable>
        </section>
      )}

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
                  Posting to{' '}
                  <button type="button" onClick={() => setSelectedFolioReport(selectedFolio)} className="font-semibold text-emerald-700 hover:underline">
                    {selectedFolio.folio_number}
                  </button>{' '}
                  for Room {selectedFolio.room_number}.
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
                <td className="py-3 pr-4">
                  <button onClick={() => setSelectedFolioReport(line.folio)} className="text-left font-medium text-emerald-700 hover:underline">
                    Room {line.folio.room_number}
                    <span className="block text-xs text-slate-500">{line.folio.folio_number}</span>
                  </button>
                </td>
                <td className="py-3 pr-4">{line.folio.guest_name}</td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{line.description}</p>
                  <p className="text-xs text-slate-500">{formatFolioLineSource(line)}</p>
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

      {activeTab === 'settings' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="font-bold text-slate-900">Restaurant Charges</h2>
            <p className="text-sm text-slate-500">Default percentages applied to open restaurant orders before settlement.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateChargeConfig.mutate(chargeConfigForm);
            }}
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          >
            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-xs font-semibold uppercase text-slate-500">Tax %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={chargeConfigForm.tax_rate}
                onChange={(e) => setChargeConfigForm({ ...chargeConfigForm, tax_rate: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              <span className="text-xs font-semibold uppercase text-slate-500">Service %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={chargeConfigForm.service_charge_rate}
                onChange={(e) => setChargeConfigForm({ ...chargeConfigForm, service_charge_rate: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={chargeConfigForm.apply_tax} onChange={(e) => setChargeConfigForm({ ...chargeConfigForm, apply_tax: e.target.checked })} />
              Apply tax
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={chargeConfigForm.apply_service_charge} onChange={(e) => setChargeConfigForm({ ...chargeConfigForm, apply_service_charge: e.target.checked })} />
              Apply service
            </label>
            <button
              disabled={!can('restaurant.order.update') || updateChargeConfig.isPending}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Save charges
            </button>
          </form>
          {updateChargeConfig.isError && <p className="mt-3 text-sm text-red-600">Could not save restaurant charges.</p>}
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
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Paid Orders</h2>
              <p className="text-sm text-slate-500">{filteredPaidOrders.length} matching order(s)</p>
            </div>
            <input
              type="search"
              value={paidOrderSearch}
              onChange={(e) => setPaidOrderSearch(e.target.value)}
              placeholder="Search order, table, room, method"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-80"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Receipt</th><th className="py-3 pr-4">Location</th><th className="py-3 pr-4">Payment</th><th className="py-3 pr-4">Paid</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPaidOrders.slice(0, 25).map((order) => {
                  const orderFolio = getOrderFolio(order);
                  return (
                    <tr key={order.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{order.order_number}</td>
                      <td className="py-3 pr-4 font-medium text-slate-700">{order.receipt_number || '-'}</td>
                      <td className="py-3 pr-4">{order.table_details ? `Table ${order.table_details.table_number}` : order.room_number ? `Room ${order.room_number}` : order.order_type}</td>
                      <td className="py-3 pr-4">{order.payment_method || '-'}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{formatMoney(order.paid_amount, settings?.currency)}</td>
                      <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => reprintRestaurantReceipt.mutate(
                              { orderId: order.id, reason: 'POS paid orders reprint' },
                              { onSuccess: (updatedOrder) => setRestaurantPaymentReceipt(updatedOrder) },
                            )}
                            disabled={reprintRestaurantReceipt.isPending}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          >
                            Receipt
                          </button>
                          {orderFolio && (
                            <button onClick={() => setSelectedFolioReport(orderFolio)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                              Folio
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPaidOrders.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No paid orders match this search.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
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
                {
                  shiftId: currentShift.id,
                  actual_cash: closeShiftForm.actual_cash,
                  actual_card: closeShiftForm.actual_card,
                  actual_wallet: closeShiftForm.actual_wallet,
                  actual_bank_transfer: closeShiftForm.actual_bank_transfer,
                  actual_room_posting: closeShiftForm.actual_room_posting,
                  notes: closeShiftForm.notes,
                },
                {
                  onSuccess: (shift) => {
                    setClosingShift(false);
                    setCloseShiftForm({
                      actual_cash: '',
                      actual_card: '',
                      actual_wallet: '',
                      actual_bank_transfer: '',
                      actual_room_posting: '',
                      notes: '',
                    });
                    setClosedShiftReport(shift);
                  },
                },
              );
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ShiftMetric label="Expected Cash" value={formatMoney(expectedCash, settings?.currency)} />
              <ShiftMetric label="Expected Total" value={formatMoney(expectedTotal, settings?.currency)} />
              <ShiftMetric label="Card" value={formatMoney(expectedCard, settings?.currency)} />
              <ShiftMetric label="Room Posting" value={formatMoney(expectedRoomPosting, settings?.currency)} />
              {liveTotals?.payment_breakdown?.length ? (
                <div className="rounded-lg border border-slate-200 md:col-span-2">
                  <div className="grid grid-cols-4 gap-2 border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                    <span>Method</span>
                    <span className="text-right">Restaurant</span>
                    <span className="text-right">Rooms</span>
                    <span className="text-right">Total</span>
                  </div>
                  {liveTotals.payment_breakdown.map((row) => (
                    <div key={row.payment_method} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm text-slate-700">
                      <span>{row.label}</span>
                      <span className="text-right">{formatMoney(row.restaurant_total, settings?.currency)}</span>
                      <span className="text-right">{formatMoney(row.folio_total, settings?.currency)}</span>
                      <span className="text-right font-semibold text-slate-900">{formatMoney(row.total, settings?.currency)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {[
                ['actual_cash', 'Actual cash counted'],
                ['actual_card', 'Card settlement total'],
                ['actual_wallet', 'Wallet settlement total'],
                ['actual_bank_transfer', 'Bank transfer total'],
                ['actual_room_posting', 'Room posting total'],
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-medium text-slate-600">
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closeShiftForm[field as keyof typeof closeShiftForm]}
                    onChange={(e) => setCloseShiftForm({ ...closeShiftForm, [field]: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required={field === 'actual_cash'}
                  />
                </label>
              ))}
              <textarea
                placeholder="Variance note"
                value={closeShiftForm.notes}
                onChange={(e) => setCloseShiftForm({ ...closeShiftForm, notes: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
              {closeVariance !== null && (
                <div className={`rounded-xl px-3 py-2 text-sm font-medium md:col-span-2 ${closeVariance === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  Total variance: {formatMoney(String(closeVariance.toFixed(2)), settings?.currency)}
                  <div className="mt-1 grid gap-1 text-xs font-normal text-slate-600 md:grid-cols-5">
                    {closeVariances.map((row) => (
                      <span key={row.label}>{row.label}: {row.variance === null ? '-' : formatMoney(String(row.variance.toFixed(2)), settings?.currency)}</span>
                    ))}
                  </div>
                </div>
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

      {closedShiftReport && (
        <ActionModal
          title="Shift close report"
          description={`${closedShiftReport.counter_details?.name || 'Counter'} | ${new Date(closedShiftReport.opened_at).toLocaleString()} - ${closedShiftReport.closed_at ? new Date(closedShiftReport.closed_at).toLocaleString() : 'Closed'}`}
          onClose={() => setClosedShiftReport(null)}
        >
          <div className="receipt-print grid gap-3 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">Cashier Shift Close Report</p>
              <p className="mt-1 text-xs text-slate-600">{closedShiftReport.counter_details?.name || 'Counter'} | {closedShiftReport.cashier_email || '-'}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-4">
              <ShiftMetric label="Opening Cash" value={formatMoney(closedShiftReport.opening_cash, settings?.currency)} />
              <ShiftMetric label="Cash Sales" value={formatMoney(closedShiftReport.live_totals?.cash_sales || '0.00', settings?.currency)} />
              <ShiftMetric label="Expected Cash" value={formatMoney(closedShiftReport.expected_cash, settings?.currency)} />
              <ShiftMetric label="Actual Cash" value={formatMoney(closedShiftReport.actual_cash, settings?.currency)} />
              <ShiftMetric label="Cash Variance" value={formatMoney(closedShiftReport.cash_variance, settings?.currency)} />
              <ShiftMetric label="Card" value={formatMoney(closedShiftReport.expected_card, settings?.currency)} />
              <ShiftMetric label="Actual Card" value={formatMoney(closedShiftReport.actual_card, settings?.currency)} />
              <ShiftMetric label="Wallet" value={formatMoney(closedShiftReport.expected_wallet, settings?.currency)} />
              <ShiftMetric label="Actual Wallet" value={formatMoney(closedShiftReport.actual_wallet, settings?.currency)} />
              <ShiftMetric label="Bank" value={formatMoney(closedShiftReport.expected_bank_transfer, settings?.currency)} />
              <ShiftMetric label="Actual Bank" value={formatMoney(closedShiftReport.actual_bank_transfer, settings?.currency)} />
              <ShiftMetric label="Room Posting" value={formatMoney(closedShiftReport.expected_room_posting, settings?.currency)} />
              <ShiftMetric label="Actual Room Posting" value={formatMoney(closedShiftReport.actual_room_posting, settings?.currency)} />
              <ShiftMetric label="Sales Total" value={formatMoney(closedShiftReport.live_totals?.sales_total || '0.00', settings?.currency)} />
              <ShiftMetric label="Expected Total" value={formatMoney(closedShiftReport.expected_total, settings?.currency)} />
              <ShiftMetric label="Total Variance" value={formatMoney(closedShiftReport.total_variance, settings?.currency)} />
              <ShiftMetric label="Closed At" value={closedShiftReport.closed_at ? new Date(closedShiftReport.closed_at).toLocaleString() : '-'} />
            </div>
            {closedShiftReport.live_totals?.payment_breakdown?.length ? (
              <div className="print-section overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr><th className="py-2 pr-3">Payment Method</th><th className="py-2 pr-3 text-right">Restaurant</th><th className="py-2 pr-3 text-right">Rooms/Folios</th><th className="py-2 pr-3 text-right">Expected</th><th className="py-2 pr-3 text-right">Counted</th><th className="py-2 pr-3 text-right">Variance</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closedShiftReport.live_totals.payment_breakdown.map((row) => (
                      <tr key={row.payment_method}>
                        <td className="py-2 pr-3 font-medium text-slate-900">{row.label}</td>
                        <td className="py-2 pr-3 text-right">{formatMoney(row.restaurant_total, settings?.currency)}</td>
                        <td className="py-2 pr-3 text-right">{formatMoney(row.folio_total, settings?.currency)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatMoney(row.total, settings?.currency)}</td>
                        <td className="py-2 pr-3 text-right">{formatMoney(row.actual_total || '0.00', settings?.currency)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatMoney(row.variance || '0.00', settings?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {closedShiftReport.live_totals?.payment_rows?.length ? (
              <div className="print-section overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Guest/Table</th><th className="py-2 pr-3">Method</th><th className="py-2 pr-3 text-right">Amount</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closedShiftReport.live_totals.payment_rows.map((row, index) => (
                      <tr key={`${row.source}-${row.reference}-${index}`}>
                        <td className="py-2 pr-3">{row.paid_at ? new Date(row.paid_at).toLocaleTimeString() : '-'}</td>
                        <td className="py-2 pr-3 capitalize">{row.source}</td>
                        <td className="py-2 pr-3 font-medium text-slate-900">{row.reference}</td>
                        <td className="py-2 pr-3">{row.guest_or_table}</td>
                        <td className="py-2 pr-3 capitalize">{paymentLabel(row.payment_method)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatMoney(row.amount, settings?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {closedShiftReport.notes && <p className="text-sm text-slate-600">{closedShiftReport.notes}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setClosedShiftReport(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print
            </button>
          </div>
        </ActionModal>
      )}

      {folioPaymentReceipt && (
        <ActionModal
          title={`Payment receipt ${folioPaymentReceipt.folio_number}`}
          description={`Room ${folioPaymentReceipt.room_number} | ${folioPaymentReceipt.guest_name}`}
          onClose={() => setFolioPaymentReceipt(null)}
        >
          <div className="receipt-print grid gap-2 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">Payment Receipt</p>
              <p className="mt-1 text-xs text-slate-600">Folio {folioPaymentReceipt.folio_number}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-2">
              <ShiftMetric label="Guest" value={folioPaymentReceipt.guest_name} />
              <ShiftMetric label="Room" value={folioPaymentReceipt.room_number} />
              <ShiftMetric label="Payment Method" value={folioPaymentReceipt.payment_method || '-'} />
              <ShiftMetric label="Paid Amount" value={formatMoney(folioPaymentReceipt.paid_amount || '0.00', settings?.currency)} />
              <ShiftMetric label="Folio Total" value={formatMoney(folioPaymentReceipt.grand_total, settings?.currency)} />
              <ShiftMetric label="Paid At" value={folioPaymentReceipt.paid_at ? new Date(folioPaymentReceipt.paid_at).toLocaleString() : '-'} />
              <ShiftMetric label="Counter" value={currentShift?.counter_details?.name || '-'} />
              <ShiftMetric label="Cashier" value={currentShift?.cashier_email || '-'} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setSelectedFolioReport(folioPaymentReceipt)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Full folio
            </button>
            <button type="button" onClick={() => setFolioPaymentReceipt(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print receipt
            </button>
          </div>
        </ActionModal>
      )}

      {restaurantBillPreview && (
        <ActionModal
          title={`Restaurant bill ${restaurantBillPreview.order_number}`}
          description={restaurantBillPreview.table_details ? `Table ${restaurantBillPreview.table_details.table_number}` : restaurantBillPreview.room_number ? `Room ${restaurantBillPreview.room_number}` : restaurantBillPreview.order_type}
          onClose={() => setRestaurantBillPreview(null)}
        >
          <div className="receipt-print grid gap-2 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">Restaurant Bill</p>
              <p className="mt-1 text-xs text-slate-500">Order {restaurantBillPreview.order_number}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-2">
              <ShiftMetric label="Location" value={restaurantBillPreview.table_details ? `Table ${restaurantBillPreview.table_details.table_number}` : restaurantBillPreview.room_number ? `Room ${restaurantBillPreview.room_number}` : restaurantBillPreview.order_type} />
              <ShiftMetric label="Status" value={restaurantBillPreview.status} />
              <ShiftMetric label="Amount Due" value={formatMoney(restaurantBillPreview.grand_total, settings?.currency)} />
              <ShiftMetric label="Printed At" value={new Date().toLocaleString()} />
            </div>
            <div className="print-section overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {restaurantBillPreview.lines.filter((line) => line.status !== 'cancelled').map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{line.menu_item_details?.name || 'Item'}</p>
                        {line.modifier_details?.length ? <p className="text-xs text-slate-500">{line.modifier_details.map((modifier) => modifier.name).join(', ')}</p> : null}
                      </td>
                      <td className="py-3 pr-4">{line.quantity}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-slate-900">{formatMoney(line.line_total, settings?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Subtotal</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantBillPreview.subtotal, settings?.currency)}</td></tr>
                  {Number(restaurantBillPreview.tax_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Tax</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantBillPreview.tax_total, settings?.currency)}</td></tr>}
                  {Number(restaurantBillPreview.service_charge_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Service</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantBillPreview.service_charge_total, settings?.currency)}</td></tr>}
                  {Number(restaurantBillPreview.discount_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-rose-700" colSpan={2}>Discount</td><td className="py-3 pr-4 text-right font-semibold text-rose-700">-{formatMoney(restaurantBillPreview.discount_total, settings?.currency)}</td></tr>}
                  <tr><td className="print-total py-3 pr-4 text-base font-bold text-slate-900" colSpan={2}>Amount Due</td><td className="print-total py-3 pr-4 text-right text-base font-bold">{formatMoney(restaurantBillPreview.grand_total, settings?.currency)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setRestaurantBillPreview(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print bill
            </button>
          </div>
        </ActionModal>
      )}

      {restaurantPaymentReceipt && (
        <ActionModal
          title={`Restaurant receipt ${restaurantPaymentReceipt.receipt_number || restaurantPaymentReceipt.order_number}`}
          description={restaurantPaymentReceipt.table_details ? `Table ${restaurantPaymentReceipt.table_details.table_number}` : restaurantPaymentReceipt.room_number ? `Room ${restaurantPaymentReceipt.room_number}` : restaurantPaymentReceipt.order_type}
          onClose={() => setRestaurantPaymentReceipt(null)}
        >
          <div className="receipt-print grid gap-2 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">Restaurant Payment Receipt</p>
              <p className="mt-1 text-xs text-slate-600">Receipt {restaurantPaymentReceipt.receipt_number || '-'}</p>
              <p className="mt-1 text-xs text-slate-500">Order {restaurantPaymentReceipt.order_number}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-2">
              <ShiftMetric label="Location" value={restaurantPaymentReceipt.table_details ? `Table ${restaurantPaymentReceipt.table_details.table_number}` : restaurantPaymentReceipt.room_number ? `Room ${restaurantPaymentReceipt.room_number}` : restaurantPaymentReceipt.order_type} />
              <ShiftMetric label="Payment Method" value={restaurantPaymentReceipt.payment_method || '-'} />
              <ShiftMetric label="Receipt Number" value={restaurantPaymentReceipt.receipt_number || '-'} />
              <ShiftMetric label="Paid Amount" value={formatMoney(restaurantPaymentReceipt.paid_amount || '0.00', settings?.currency)} />
              <ShiftMetric label="Order Total" value={formatMoney(restaurantPaymentReceipt.grand_total, settings?.currency)} />
              <ShiftMetric label="Paid At" value={restaurantPaymentReceipt.paid_at ? new Date(restaurantPaymentReceipt.paid_at).toLocaleString() : '-'} />
              <ShiftMetric label="Counter" value={currentShift?.counter_details?.name || '-'} />
              <ShiftMetric label="Cashier" value={currentShift?.cashier_email || '-'} />
              <ShiftMetric label="Reprints" value={String(restaurantPaymentReceipt.receipt_reprint_count || 0)} />
            </div>
            {restaurantPaymentReceipt.payments?.length ? (
              <div className="print-section rounded-lg bg-slate-50 p-2">
                <p className="text-xs font-medium uppercase text-slate-500">Payment Breakdown</p>
                <div className="mt-2 grid gap-1 text-sm">
                  {restaurantPaymentReceipt.payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between gap-4">
                      <span className="capitalize text-slate-600">{payment.payment_method.replace('_', ' ')}</span>
                      <span className="font-semibold text-slate-900">{formatMoney(payment.amount, settings?.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="print-section overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {restaurantPaymentReceipt.lines.filter((line) => line.status !== 'cancelled').map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{line.menu_item_details?.name || 'Item'}</p>
                        {line.modifier_details?.length ? <p className="text-xs text-slate-500">{line.modifier_details.map((modifier) => modifier.name).join(', ')}</p> : null}
                      </td>
                      <td className="py-3 pr-4">{line.quantity}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-slate-900">{formatMoney(line.line_total, settings?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Subtotal</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantPaymentReceipt.subtotal, settings?.currency)}</td></tr>
                  {Number(restaurantPaymentReceipt.tax_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Tax</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantPaymentReceipt.tax_total, settings?.currency)}</td></tr>}
                  {Number(restaurantPaymentReceipt.service_charge_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={2}>Service</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(restaurantPaymentReceipt.service_charge_total, settings?.currency)}</td></tr>}
                  {Number(restaurantPaymentReceipt.discount_total) > 0 && <tr><td className="py-3 pr-4 font-semibold text-rose-700" colSpan={2}>Discount</td><td className="py-3 pr-4 text-right font-semibold text-rose-700">-{formatMoney(restaurantPaymentReceipt.discount_total, settings?.currency)}</td></tr>}
                  <tr><td className="print-total py-3 pr-4 text-base font-bold text-slate-900" colSpan={2}>Total</td><td className="print-total py-3 pr-4 text-right text-base font-bold">{formatMoney(restaurantPaymentReceipt.grand_total, settings?.currency)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            {restaurantReceiptFolio && (
              <button type="button" onClick={() => setSelectedFolioReport(restaurantReceiptFolio)} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                Full folio
              </button>
            )}
            <button type="button" onClick={() => setRestaurantPaymentReceipt(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print receipt
            </button>
          </div>
        </ActionModal>
      )}

      {selectedFolioReport && (
        <ActionModal
          title={`Folio ${selectedFolioReport.folio_number}`}
          description={`Room ${selectedFolioReport.room_number} | ${selectedFolioReport.guest_name}`}
          onClose={() => setSelectedFolioReport(null)}
        >
          <div className="receipt-print grid gap-2 text-xs">
            <div className="print-header border-b border-slate-200 pb-2 text-center">
              <h2 className="text-lg font-bold text-slate-900">{settings?.name || 'Hotel'}</h2>
              <p className="mt-1 text-xs text-slate-500">Printed {new Date().toLocaleString()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-900">Folio {selectedFolioReport.folio_number}</p>
              <p className="mt-1 text-xs text-slate-600">Room {selectedFolioReport.room_number} | {selectedFolioReport.guest_name}</p>
            </div>
            <div className="print-metrics grid gap-2 md:grid-cols-3">
              <ShiftMetric label="Status" value={selectedFolioReport.status} />
              <ShiftMetric label="Stay" value={`${new Date(selectedFolioReport.check_in_date).toLocaleDateString()} - ${new Date(selectedFolioReport.check_out_date).toLocaleDateString()}`} />
              <ShiftMetric label="Total" value={formatMoney(selectedFolioReport.grand_total, settings?.currency)} />
              <ShiftMetric label="Payment" value={selectedFolioReport.payment_method || '-'} />
              <ShiftMetric label="Paid Amount" value={formatMoney(selectedFolioReport.paid_amount || '0.00', settings?.currency)} />
              <ShiftMetric label="Paid At" value={selectedFolioReport.paid_at ? new Date(selectedFolioReport.paid_at).toLocaleString() : '-'} />
            </div>
            <div className="print-section overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">Description</th><th className="py-3 pr-4">Posted From</th><th className="py-3 pr-4">Reference</th><th className="py-3 pr-4 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedFolioReport.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{line.description}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatFolioLineSource(line)}</td>
                      <td className="py-3 pr-4 text-xs text-slate-500">{line.source_id ? line.source_id.slice(-8) : '-'}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-slate-900">{formatMoney(line.amount, settings?.currency)}</td>
                    </tr>
                  ))}
                  {selectedFolioReport.lines.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No folio lines yet.</td></tr>}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={3}>Subtotal</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(selectedFolioReport.subtotal, settings?.currency)}</td></tr>
                  <tr><td className="py-3 pr-4 font-semibold text-slate-900" colSpan={3}>Tax</td><td className="py-3 pr-4 text-right font-semibold">{formatMoney(selectedFolioReport.tax_total, settings?.currency)}</td></tr>
                  <tr><td className="print-total py-3 pr-4 text-base font-bold text-slate-900" colSpan={3}>Grand Total</td><td className="print-total py-3 pr-4 text-right text-base font-bold">{formatMoney(selectedFolioReport.grand_total, settings?.currency)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setSelectedFolioReport(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print folio
            </button>
          </div>
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
  <div className="rounded-lg bg-slate-50 p-2">
    <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
    <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
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
