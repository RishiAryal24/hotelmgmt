import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useBookings } from '../hooks/bookings';
import { useInventoryItems } from '../hooks/inventory';
import {
  useCreateMenuCategory,
  useCreateMenuItem,
  useCreateMenuModifier,
  useCreateMenuModifierGroup,
  useCreateMenuRecipeIngredient,
  useCreateRestaurantOrder,
  useCreateRestaurantTable,
  useCurrentCashierShift,
  useKitchenTicketAction,
  useKitchenTickets,
  useMenuCategories,
  useMenuItems,
  useMenuModifierGroups,
  useMenuModifiers,
  useMenuRecipeIngredients,
  useReprintRestaurantReceipt,
  useRequestRestaurantOrderApproval,
  useRestaurantOrderApprovalDecision,
  useRestaurantOrderApprovals,
  useRestaurantOrderAction,
  useRestaurantOrders,
  useRestaurantTables,
  useSettleRestaurantOrder,
} from '../hooks/restaurant';
import { usePermissions } from '../hooks/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { MenuCategory, MenuItem, MenuModifier, MenuModifierGroup, MenuRecipeIngredient, RestaurantOrder, RestaurantTable } from '../types/restaurant';

const emptyCategory = { name: '', code: '', description: '', display_order: 0, is_active: true };
const emptyModifierGroup = {
  name: '',
  code: '',
  selection_type: 'single' as MenuModifierGroup['selection_type'],
  is_required: false,
  display_order: 0,
  is_active: true,
  menu_items: [] as string[],
};
const emptyModifier = {
  group: '',
  name: '',
  code: '',
  price_delta: '0.00',
  display_order: 0,
  is_active: true,
};
const emptyRecipeIngredient = {
  menu_item: '',
  item: '',
  quantity: '',
  notes: '',
};
const emptyItem = {
  category: '',
  inventory_item: '',
  inventory_quantity_per_unit: '0',
  name: '',
  sku: '',
  description: '',
  image: null,
  price: '',
  preparation_station: 'kitchen' as MenuItem['preparation_station'],
  preparation_time_minutes: 15,
  is_available: true,
  is_active: true,
};
const emptyTable = { table_number: '', section: '', capacity: 2, status: 'available' as RestaurantTable['status'], is_active: true };
const emptyOrder: { table: string; room_booking: string; order_type: RestaurantOrder['order_type']; notes: string } = {
  table: '',
  room_booking: '',
  order_type: 'dine_in',
  notes: '',
};
const emptyOrderLine = { menu_item: '', quantity: 1, notes: '', modifiers: [] as string[] };
const emptySettleForm = { payment_method: 'cash' as RestaurantOrder['payment_method'], paid_amount: '', booking: '' };
const emptyVoidForm = { line: '', reason: '' };
const emptyDiscountForm = { discount_amount: '', reason: '' };
const emptyComplimentaryForm = { reason: '' };
const kitchenStatuses = ['all', 'open', 'preparing', 'ready', 'served'] as const;

const getMutationErrorMessage = (error: unknown, fallback: string) => {
  const responseData = (error as { response?: { data?: unknown } })?.response?.data;
  if (!responseData) return fallback;
  if (typeof responseData === 'string') return responseData;
  if (typeof responseData === 'object') {
    const data = responseData as Record<string, unknown>;
    if (typeof data.error === 'string') return data.error;
    const firstValue = Object.values(data)[0];
    if (Array.isArray(firstValue)) return firstValue.join(' ');
    if (typeof firstValue === 'string') return firstValue;
  }
  return fallback;
};

const formatTicketAge = (createdAt?: string) => {
  if (!createdAt) return '-';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const Restaurant: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: categories } = useMenuCategories();
  const { data: items } = useMenuItems();
  const { data: modifierGroups } = useMenuModifierGroups();
  const { data: modifiers } = useMenuModifiers();
  const { data: recipeIngredients } = useMenuRecipeIngredients();
  const { data: inventoryItems, isLoading: inventoryLoading } = useInventoryItems();
  const { data: tables } = useRestaurantTables();
  const { data: orders } = useRestaurantOrders();
  const { data: tickets } = useKitchenTickets();
  const { data: approvals } = useRestaurantOrderApprovals();
  const { data: currentShift } = useCurrentCashierShift();
  const { data: bookings } = useBookings();
  const createCategory = useCreateMenuCategory();
  const createItem = useCreateMenuItem();
  const createModifierGroup = useCreateMenuModifierGroup();
  const createModifier = useCreateMenuModifier();
  const createRecipeIngredient = useCreateMenuRecipeIngredient();
  const createTable = useCreateRestaurantTable();
  const createOrder = useCreateRestaurantOrder();
  const orderAction = useRestaurantOrderAction();
  const requestApproval = useRequestRestaurantOrderApproval();
  const approvalDecision = useRestaurantOrderApprovalDecision();
  const settleOrder = useSettleRestaurantOrder();
  const reprintRestaurantReceipt = useReprintRestaurantReceipt();
  const ticketAction = useKitchenTicketAction();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('orders');
  const [categoryForm, setCategoryForm] = useState<Omit<MenuCategory, 'id'>>(emptyCategory);
  const [modifierGroupForm, setModifierGroupForm] = useState<Omit<MenuModifierGroup, 'id' | 'modifiers'>>(emptyModifierGroup);
  const [modifierForm, setModifierForm] = useState<Omit<MenuModifier, 'id' | 'group_name'>>(emptyModifier);
  const [recipeIngredientForm, setRecipeIngredientForm] = useState<Omit<MenuRecipeIngredient, 'id' | 'item_details' | 'line_cost'>>(emptyRecipeIngredient);
  const [itemForm, setItemForm] = useState<Omit<MenuItem, 'id' | 'category_details' | 'inventory_item_details'>>(emptyItem);
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [tableForm, setTableForm] = useState<Omit<RestaurantTable, 'id'>>(emptyTable);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [lineForms, setLineForms] = useState<Record<string, typeof emptyOrderLine>>({});
  const [settleForms, setSettleForms] = useState<Record<string, typeof emptySettleForm>>({});
  const [settlingOrder, setSettlingOrder] = useState<RestaurantOrder | null>(null);
  const [transferOrder, setTransferOrder] = useState<RestaurantOrder | null>(null);
  const [transferForm, setTransferForm] = useState({ table: '' });
  const [mergeOrder, setMergeOrder] = useState<RestaurantOrder | null>(null);
  const [mergeForm, setMergeForm] = useState({ target_order: '' });
  const [splitOrder, setSplitOrder] = useState<RestaurantOrder | null>(null);
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});
  const [voidingOrder, setVoidingOrder] = useState<RestaurantOrder | null>(null);
  const [voidForm, setVoidForm] = useState(emptyVoidForm);
  const [discountOrder, setDiscountOrder] = useState<RestaurantOrder | null>(null);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm);
  const [complimentaryOrder, setComplimentaryOrder] = useState<RestaurantOrder | null>(null);
  const [complimentaryForm, setComplimentaryForm] = useState(emptyComplimentaryForm);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [receiptOrder, setReceiptOrder] = useState<RestaurantOrder | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [kitchenFilter, setKitchenFilter] = useState<(typeof kitchenStatuses)[number]>('all');

  const activeOrders = orders?.filter((order) => order.status !== 'paid' && order.status !== 'cancelled') || [];
  const historyOrders =
    orders?.filter((order) => {
      if (!['paid', 'cancelled'].includes(order.status)) return false;
      const query = historySearch.trim().toLowerCase();
      if (!query) return true;
      return [
        order.order_number,
        order.receipt_number,
        order.order_type,
        order.status,
        order.table_details?.table_number,
        order.room_number,
        order.guest_name,
        order.payment_method,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    }) || [];
  const inHouseBookings = bookings?.filter((booking) => booking.status === 'checked_in') || [];
  const pendingApprovals = approvals?.filter((approval) => approval.status === 'pending') || [];
  const filteredTickets = tickets?.filter((ticket) => kitchenFilter === 'all' || ticket.status === kitchenFilter) || [];
  const availableTransferTables =
    tables?.filter((table) => table.is_active && ['available', 'reserved'].includes(table.status) && table.id !== transferOrder?.table) || [];
  const availableMergeOrders = activeOrders.filter(
    (order) =>
      order.id !== mergeOrder?.id &&
      order.order_type === 'dine_in' &&
      ['draft', 'sent_to_kitchen', 'preparing', 'served'].includes(order.status),
  );
  const tabs = [
    { id: 'orders', label: 'Orders', count: activeOrders.length },
    { id: 'menu', label: 'Menu', count: items?.length || 0 },
    { id: 'categories', label: 'Categories', count: categories?.length || 0 },
    { id: 'tables', label: 'Tables', count: tables?.length || 0 },
    { id: 'approvals', label: 'Approvals', count: pendingApprovals.length },
    { id: 'kitchen', label: 'Kitchen', count: tickets?.filter((ticket) => ticket.status !== 'served').length || 0 },
    { id: 'history', label: 'History', count: historyOrders.length },
  ];

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    createCategory.mutate(categoryForm, { onSuccess: () => setCategoryForm(emptyCategory) });
  };

  const handleCreateModifierGroup = (e: React.FormEvent) => {
    e.preventDefault();
    createModifierGroup.mutate(modifierGroupForm, { onSuccess: () => setModifierGroupForm(emptyModifierGroup) });
  };

  const handleCreateModifier = (e: React.FormEvent) => {
    e.preventDefault();
    createModifier.mutate(modifierForm, { onSuccess: () => setModifierForm(emptyModifier) });
  };

  const handleCreateRecipeIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    createRecipeIngredient.mutate(recipeIngredientForm, { onSuccess: () => setRecipeIngredientForm(emptyRecipeIngredient) });
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = new FormData();
    Object.entries({ ...itemForm, inventory_item: itemForm.inventory_item || '' }).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        payload.append(key, String(value));
      }
    });
    if (itemImage) {
      payload.append('image', itemImage);
    }
    createItem.mutate(payload, {
      onSuccess: () => {
        setItemForm(emptyItem);
        setItemImage(null);
      },
    });
  };

  const handleCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    createTable.mutate(tableForm, { onSuccess: () => setTableForm(emptyTable) });
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    createOrder.mutate(
      {
        table: orderForm.order_type === 'dine_in' ? orderForm.table : undefined,
        room_booking: orderForm.order_type === 'room_service' ? orderForm.room_booking : undefined,
        order_type: orderForm.order_type,
        notes: orderForm.notes,
      },
      { onSuccess: () => setOrderForm(emptyOrder) },
    );
  };

  const handleAddLine = (orderId: string) => {
    const lineForm = lineForms[orderId] || emptyOrderLine;
    if (!lineForm.menu_item) return;
    orderAction.mutate({ orderId, action: 'add_line', payload: { menu_item: lineForm.menu_item, quantity: lineForm.quantity, notes: lineForm.notes, modifiers: lineForm.modifiers } });
    setLineForms({ ...lineForms, [orderId]: emptyOrderLine });
  };

  const handleSettleOrder = (orderId: string) => {
    const form = settleForms[orderId] || emptySettleForm;
    settleOrder.mutate(
      {
        orderId,
        payment_method: form.payment_method,
        paid_amount: form.paid_amount,
        booking: form.payment_method === 'room_posting' ? form.booking : undefined,
        cashier_shift: currentShift?.id,
      },
      {
        onSuccess: (settledOrder) => {
          setSettleForms({ ...settleForms, [orderId]: emptySettleForm });
          setSettlingOrder(null);
          setReceiptOrder(settledOrder as RestaurantOrder);
        },
      },
    );
  };

  const openSettleOrder = (order: RestaurantOrder) => {
    setSettleForms({
      ...settleForms,
      [order.id]: settleForms[order.id] || {
        ...emptySettleForm,
        paid_amount: order.grand_total,
        booking: order.room_booking || '',
      },
    });
    setSettlingOrder(order);
  };

  const openTransferOrder = (order: RestaurantOrder) => {
    setTransferOrder(order);
    setTransferForm({ table: '' });
  };

  const handleTransferOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferOrder || !transferForm.table) return;
    orderAction.mutate(
      { orderId: transferOrder.id, action: 'transfer_table', payload: transferForm },
      { onSuccess: () => setTransferOrder(null) },
    );
  };

  const openMergeOrder = (order: RestaurantOrder) => {
    setMergeOrder(order);
    setMergeForm({ target_order: '' });
  };

  const handleMergeOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeOrder || !mergeForm.target_order) return;
    orderAction.mutate(
      { orderId: mergeOrder.id, action: 'merge_table', payload: mergeForm },
      { onSuccess: () => setMergeOrder(null) },
    );
  };

  const openSplitOrder = (order: RestaurantOrder) => {
    setSplitOrder(order);
    setSplitQuantities(Object.fromEntries(order.lines.filter((line) => line.status !== 'cancelled').map((line) => [line.id, 0])));
  };

  const handleSplitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitOrder) return;
    const lines = splitOrder.lines
      .map((line) => ({ line: line.id, quantity: Number(splitQuantities[line.id] || 0) }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) return;
    orderAction.mutate(
      { orderId: splitOrder.id, action: 'split_bill', payload: { lines } },
      { onSuccess: () => setSplitOrder(null) },
    );
  };

  const openVoidOrderLine = (order: RestaurantOrder) => {
    const activeLines = order.lines.filter((line) => line.status !== 'cancelled');
    setVoidingOrder(order);
    setVoidForm({ line: activeLines[0]?.id || '', reason: '' });
  };

  const handleVoidOrderLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingOrder || !voidForm.line) return;
    requestApproval.mutate(
      { orderId: voidingOrder.id, action: 'request_void_line', payload: voidForm },
      { onSuccess: () => setVoidingOrder(null) },
    );
  };

  const openDiscountOrder = (order: RestaurantOrder) => {
    setDiscountOrder(order);
    setDiscountForm({ discount_amount: order.discount_total && order.discount_total !== '0.00' ? order.discount_total : '', reason: '' });
  };

  const handleApplyDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountOrder) return;
    requestApproval.mutate(
      { orderId: discountOrder.id, action: 'request_discount', payload: { ...discountForm, discount_amount: discountForm.discount_amount || '0.00' } },
      { onSuccess: () => setDiscountOrder(null) },
    );
  };

  const openComplimentaryOrder = (order: RestaurantOrder) => {
    setComplimentaryOrder(order);
    setComplimentaryForm(emptyComplimentaryForm);
  };

  const handleComplimentaryRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!complimentaryOrder) return;
    requestApproval.mutate(
      { orderId: complimentaryOrder.id, action: 'request_complimentary', payload: complimentaryForm },
      { onSuccess: () => setComplimentaryOrder(null) },
    );
  };

  const selectedSplitTotal = splitOrder
    ? splitOrder.lines.filter((line) => line.status !== 'cancelled').reduce((total, line) => {
        const quantity = Math.min(Number(splitQuantities[line.id] || 0), line.quantity);
        return total + quantity * Number(line.unit_price || 0);
      }, 0)
    : 0;
  const selectedSplitQuantity = splitOrder ? Object.values(splitQuantities).reduce((total, quantity) => total + Number(quantity || 0), 0) : 0;
  const splitOrderQuantity = splitOrder ? splitOrder.lines.filter((line) => line.status !== 'cancelled').reduce((total, line) => total + line.quantity, 0) : 0;
  const getItemModifierGroups = (menuItemId: string) => {
    const item = items?.find((menuItem) => menuItem.id === menuItemId);
    return item?.modifier_groups_details?.filter((group) => group.is_active) || [];
  };
  const toggleLineModifier = (orderId: string, modifierGroup: MenuModifierGroup, modifierId: string, checked: boolean) => {
    const form = lineForms[orderId] || emptyOrderLine;
    const groupModifierIds = modifierGroup.modifiers.map((modifier) => modifier.id);
    const withoutGroupSingle = modifierGroup.selection_type === 'single'
      ? form.modifiers.filter((selectedId) => !groupModifierIds.includes(selectedId))
      : form.modifiers;
    const nextModifiers = checked
      ? Array.from(new Set([...withoutGroupSingle, modifierId]))
      : form.modifiers.filter((selectedId) => selectedId !== modifierId);
    setLineForms({ ...lineForms, [orderId]: { ...form, modifiers: nextModifiers } });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Restaurant</h1>
            <p className="mt-1 text-sm text-slate-500">Orders, menu setup, tables, and kitchen workflow in compact rows.</p>
          </div>
          <CompactTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>
      </section>

      {activeTab === 'orders' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {can('restaurant.order.create') && <FormPanel title="New Order" onSubmit={handleCreateOrder}>
            <select value={orderForm.order_type} onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value as typeof emptyOrder.order_type })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="dine_in">Dine In</option><option value="takeaway">Takeaway</option><option value="room_service">Room Service</option>
            </select>
            {orderForm.order_type === 'dine_in' && (
              <select value={orderForm.table} onChange={(e) => setOrderForm({ ...orderForm, table: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                <option value="">Select Table</option>
                {tables?.map((table) => <option key={table.id} value={table.id}>Table {table.table_number} - {table.status}</option>)}
              </select>
            )}
            {orderForm.order_type === 'room_service' && (
              <select value={orderForm.room_booking} onChange={(e) => setOrderForm({ ...orderForm, room_booking: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select In-house Room</option>
                {inHouseBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    Room {booking.room_details?.room_number} - {booking.guest_details?.first_name} {booking.guest_details?.last_name}
                  </option>
                ))}
              </select>
            )}
            <textarea placeholder="Order notes" value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            {createOrder.isError && (
              <p className="text-sm text-red-600 md:col-span-2">
                {getMutationErrorMessage(createOrder.error, 'Could not create order. Check the order type and table or room selection.')}
              </p>
            )}
          </FormPanel>}

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Items</th><th className="py-3 pr-4">Total</th><th className="py-3 pr-4">Add Item</th><th className="py-3 pr-4">Settle</th><th className="py-3 pr-4">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeOrders.map((order) => {
                    const lineForm = lineForms[order.id] || emptyOrderLine;
                    const activeLines = order.lines.filter((line) => line.status !== 'cancelled');
                    const orderedLines = order.lines.filter((line) => line.status === 'ordered');
                    const itemModifierGroups = getItemModifierGroups(lineForm.menu_item);
                    return (
                      <tr key={order.id}>
                        <td className="py-3 pr-4"><p className="font-medium text-slate-900">{order.order_number}</p><p className="text-xs text-slate-500">{order.order_type} {order.table_details ? `| Table ${order.table_details.table_number}` : ''}{order.room_number ? ` | Room ${order.room_number}` : ''}</p></td>
                        <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span></td>
                        <td className="py-3 pr-4">
                          {activeLines.length ? activeLines.map((line) => `${line.quantity}x ${line.menu_item_details?.name}${line.modifier_details?.length ? ` (${line.modifier_details.map((modifier) => modifier.name).join(', ')})` : ''}`).join(', ') : 'No active items'}
                          {order.lines.some((line) => line.status === 'cancelled') && <p className="text-xs text-slate-400">Voided items hidden from total</p>}
                        </td>
                        <td className="py-3 pr-4 font-medium">{formatMoney(order.grand_total, settings?.currency)}</td>
                        <td className="py-3 pr-4">
                          <div className="grid min-w-[260px] grid-cols-[1fr_64px] gap-2">
                            <select value={lineForm.menu_item} onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, menu_item: e.target.value, modifiers: [] } })} className="rounded-xl border border-slate-200 px-2 py-2 text-xs">
                              <option value="">Select item</option>
                              {items?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                            <input type="number" value={lineForm.quantity} min="1" onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, quantity: Number(e.target.value) } })} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" />
                          </div>
                          {itemModifierGroups.length > 0 && (
                            <div className="mt-2 grid min-w-[260px] gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                              {itemModifierGroups.map((group) => (
                                <div key={group.id}>
                                  <p className="text-[11px] font-semibold uppercase text-slate-500">{group.name}{group.is_required ? ' *' : ''}</p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {group.modifiers.filter((modifier) => modifier.is_active).map((modifier) => (
                                      <label key={modifier.id} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] text-slate-700">
                                        <input
                                          type={group.selection_type === 'single' ? 'radio' : 'checkbox'}
                                          name={`${order.id}-${group.id}`}
                                          checked={lineForm.modifiers.includes(modifier.id)}
                                          onChange={(e) => toggleLineModifier(order.id, group, modifier.id, e.target.checked)}
                                        />
                                        {modifier.name}{Number(modifier.price_delta) > 0 ? ` +${formatMoney(modifier.price_delta, settings?.currency)}` : ''}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs text-slate-500">{order.status === 'served' ? 'Ready to settle' : 'Mark served first'}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {can('restaurant.order.update') && <button onClick={() => handleAddLine(order.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Add</button>}
                            {can('restaurant.order.update') && orderedLines.length > 0 && ['draft', 'sent_to_kitchen'].includes(order.status) && <button onClick={() => orderAction.mutate({ orderId: order.id, action: 'send_to_kitchen' })} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white">Kitchen</button>}
                            {can('restaurant.order.update') && ['sent_to_kitchen', 'preparing'].includes(order.status) && <button onClick={() => orderAction.mutate({ orderId: order.id, action: 'mark_served' })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">Served</button>}
                            {can('restaurant.order.update') && order.order_type === 'dine_in' && ['draft', 'sent_to_kitchen', 'preparing', 'served'].includes(order.status) && <button onClick={() => openTransferOrder(order)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Transfer</button>}
                            {can('restaurant.order.update') && order.order_type === 'dine_in' && ['draft', 'sent_to_kitchen', 'preparing', 'served'].includes(order.status) && <button onClick={() => openMergeOrder(order)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Merge</button>}
                            {can('restaurant.order.update') && ['draft', 'served'].includes(order.status) && activeLines.length > 0 && <button onClick={() => openSplitOrder(order)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Split</button>}
                            {can('restaurant.order.update') && activeLines.length > 0 && <button onClick={() => openVoidOrderLine(order)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50">Void</button>}
                            {can('restaurant.order.update') && activeLines.length > 0 && <button onClick={() => openDiscountOrder(order)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Discount</button>}
                            {can('restaurant.order.update') && activeLines.length > 0 && <button onClick={() => openComplimentaryOrder(order)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Comp</button>}
                            {can('pos.sale.create') && order.status === 'served' && <button onClick={() => openSettleOrder(order)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white">Settle</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {activeOrders.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No active restaurant orders.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'menu' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {can('restaurant.order.update') && (
            <div className="grid gap-5">
              <FormPanel title="Add Menu Item" onSubmit={handleCreateItem}>
                <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Select Category</option>{categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <input placeholder="Item Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="SKU" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input type="number" step="0.01" placeholder="Price" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <select value={itemForm.preparation_station} onChange={(e) => setItemForm({ ...itemForm, preparation_station: e.target.value as MenuItem['preparation_station'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="pastry">Pastry</option><option value="counter">Counter</option>
                </select>
                <input type="number" placeholder="Prep Time" value={itemForm.preparation_time_minutes} onChange={(e) => setItemForm({ ...itemForm, preparation_time_minutes: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <select value={itemForm.inventory_item || ''} onChange={(e) => setItemForm({ ...itemForm, inventory_item: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">{inventoryLoading ? 'Loading inventory...' : 'No inventory deduction'}</option>{inventoryItems?.map((inventoryItem) => <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.sku} - {inventoryItem.name}</option>)}
                </select>
                <input type="number" step="0.001" placeholder="Inventory Qty per Sale" value={itemForm.inventory_quantity_per_unit} onChange={(e) => setItemForm({ ...itemForm, inventory_quantity_per_unit: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
                  <span className="block font-medium text-slate-700">Menu Picture</span>
                  <input type="file" accept="image/*" onChange={(e) => setItemImage(e.target.files?.[0] || null)} className="mt-2 w-full text-xs" />
                  {itemImage && <span className="mt-1 block text-xs text-[#1F5E3B]">{itemImage.name}</span>}
                </label>
              </FormPanel>

              <FormPanel title="Add Modifier Group" onSubmit={handleCreateModifierGroup}>
                <input placeholder="Group name" value={modifierGroupForm.name} onChange={(e) => setModifierGroupForm({ ...modifierGroupForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="Code" value={modifierGroupForm.code} onChange={(e) => setModifierGroupForm({ ...modifierGroupForm, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <select value={modifierGroupForm.selection_type} onChange={(e) => setModifierGroupForm({ ...modifierGroupForm, selection_type: e.target.value as MenuModifierGroup['selection_type'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="single">Single choice</option><option value="multiple">Multiple choice</option>
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={modifierGroupForm.is_required} onChange={(e) => setModifierGroupForm({ ...modifierGroupForm, is_required: e.target.checked })} />
                  Required
                </label>
                <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 md:col-span-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Menu items</p>
                  <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                    {(items || []).map((item) => (
                      <label key={item.id} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={modifierGroupForm.menu_items.includes(item.id)}
                          onChange={(e) => {
                            const nextItems = e.target.checked ? [...modifierGroupForm.menu_items, item.id] : modifierGroupForm.menu_items.filter((id) => id !== item.id);
                            setModifierGroupForm({ ...modifierGroupForm, menu_items: nextItems });
                          }}
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </div>
              </FormPanel>

              <FormPanel title="Add Modifier" onSubmit={handleCreateModifier}>
                <select value={modifierForm.group} onChange={(e) => setModifierForm({ ...modifierForm, group: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Select group</option>{modifierGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <input placeholder="Modifier name" value={modifierForm.name} onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="Code" value={modifierForm.code} onChange={(e) => setModifierForm({ ...modifierForm, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input type="number" step="0.01" placeholder="Price add-on" value={modifierForm.price_delta} onChange={(e) => setModifierForm({ ...modifierForm, price_delta: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </FormPanel>

              <FormPanel title="Add Recipe Ingredient" onSubmit={handleCreateRecipeIngredient}>
                <select value={recipeIngredientForm.menu_item} onChange={(e) => setRecipeIngredientForm({ ...recipeIngredientForm, menu_item: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Select menu item</option>{items?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <select value={recipeIngredientForm.item} onChange={(e) => setRecipeIngredientForm({ ...recipeIngredientForm, item: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Select inventory item</option>{inventoryItems?.map((inventoryItem) => <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.sku} - {inventoryItem.name} ({inventoryItem.unit})</option>)}
                </select>
                <input type="number" step="0.001" placeholder="Quantity per sale" value={recipeIngredientForm.quantity} onChange={(e) => setRecipeIngredientForm({ ...recipeIngredientForm, quantity: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="Notes" value={recipeIngredientForm.notes} onChange={(e) => setRecipeIngredientForm({ ...recipeIngredientForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </FormPanel>
            </div>
          )}
          <RowsTable headers={['Picture', 'Item', 'Category', 'Price', 'Food Cost', 'Margin', 'Recipe / Deduction']}>
            {items?.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-4">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-12 w-16 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-16 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">No image</div>
                  )}
                </td>
                <td className="py-3 pr-4 font-medium text-slate-900">{item.name}<p className="text-xs text-slate-500">{item.sku}</p></td>
                <td className="py-3 pr-4">{item.category_details?.name}</td>
                <td className="py-3 pr-4">{formatMoney(item.price, settings?.currency)}</td>
                <td className="py-3 pr-4">{formatMoney(item.recipe_cost || '0.00', settings?.currency)}</td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{formatMoney(item.gross_margin || '0.00', settings?.currency)}</p>
                  <p className="text-xs text-slate-500">{Number(item.gross_margin_percent || 0).toFixed(1)}%</p>
                </td>
                <td className="py-3 pr-4 text-xs text-slate-600">
                  {item.recipe_ingredients?.length
                    ? item.recipe_ingredients.map((line) => `${line.quantity} ${line.item_details?.unit || ''} ${line.item_details?.name || 'item'}`).join(', ')
                    : item.inventory_item_details ? `${item.inventory_quantity_per_unit} ${item.inventory_item_details.unit} ${item.inventory_item_details.name}` : '-'}
                  {item.modifier_groups_details?.length ? <p className="mt-1 text-slate-400">Modifiers: {item.modifier_groups_details.map((group) => group.name).join(', ')}</p> : null}
                </td>
              </tr>
            ))}
            {items?.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No menu items yet.</td></tr>}
          </RowsTable>
        </section>
      )}

      {activeTab === 'categories' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {can('restaurant.order.update') && <FormPanel title="Add Category" onSubmit={handleCreateCategory}>
            <input placeholder="Category Name" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Code" value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input type="number" placeholder="Display Order" value={categoryForm.display_order} onChange={(e) => setCategoryForm({ ...categoryForm, display_order: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <textarea placeholder="Description" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </FormPanel>}
          <RowsTable headers={['Category', 'Code', 'Order', 'Active']}>
            {categories?.map((category) => <tr key={category.id}><td className="py-3 pr-4 font-medium text-slate-900">{category.name}</td><td className="py-3 pr-4">{category.code}</td><td className="py-3 pr-4">{category.display_order}</td><td className="py-3 pr-4">{category.is_active ? 'Yes' : 'No'}</td></tr>)}
            {categories?.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No categories yet.</td></tr>}
          </RowsTable>
        </section>
      )}

      {activeTab === 'tables' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {can('restaurant.order.update') && <FormPanel title="Add Table" onSubmit={handleCreateTable}>
            <input placeholder="Table Number" value={tableForm.table_number} onChange={(e) => setTableForm({ ...tableForm, table_number: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
            <input placeholder="Section" value={tableForm.section} onChange={(e) => setTableForm({ ...tableForm, section: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="number" placeholder="Capacity" value={tableForm.capacity} onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={tableForm.status} onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as RestaurantTable['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="available">Available</option><option value="reserved">Reserved</option><option value="occupied">Occupied</option><option value="cleaning">Cleaning</option><option value="inactive">Inactive</option>
            </select>
          </FormPanel>}
          <RowsTable headers={['Table', 'Section', 'Capacity', 'Status', 'Active']}>
            {tables?.map((table) => <tr key={table.id}><td className="py-3 pr-4 font-medium text-slate-900">Table {table.table_number}</td><td className="py-3 pr-4">{table.section || '-'}</td><td className="py-3 pr-4">{table.capacity}</td><td className="py-3 pr-4">{table.status}</td><td className="py-3 pr-4">{table.is_active ? 'Yes' : 'No'}</td></tr>)}
            {tables?.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No tables yet.</td></tr>}
          </RowsTable>
        </section>
      )}

      {activeTab === 'approvals' && (
        <RowsTable headers={['Request', 'Order', 'Reason', 'Decision', 'Actions']}>
          {(approvals || []).map((approval) => {
            const note = approvalNotes[approval.id] || '';
            return (
              <tr key={approval.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{approval.action_type_display || approval.action_type}</p>
                  <p className="text-xs text-slate-500">{approval.requested_by_email || 'Requested'} | {new Date(approval.created_at).toLocaleString()}</p>
                </td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{approval.order_details?.order_number || approval.order}</p>
                  <p className="text-xs text-slate-500">{approval.line_details?.menu_item_details?.name || (approval.order_details ? getOrderLocation(approval.order_details) : '-')}</p>
                </td>
                <td className="py-3 pr-4">
                  <p>{approval.reason || '-'}</p>
                  {Number(approval.discount_amount) > 0 && <p className="text-xs text-slate-500">{formatMoney(approval.discount_amount, settings?.currency)}</p>}
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${approval.status === 'pending' ? 'bg-amber-50 text-amber-700' : approval.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {approval.status_display || approval.status}
                  </span>
                  {approval.decided_by_email && <p className="mt-1 text-xs text-slate-500">{approval.decided_by_email}</p>}
                </td>
                <td className="py-3 pr-4">
                  {approval.status === 'pending' && can('restaurant.order.approve') ? (
                    <div className="grid min-w-[280px] gap-2">
                      <input
                        placeholder="Decision note"
                        value={note}
                        onChange={(e) => setApprovalNotes({ ...approvalNotes, [approval.id]: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => approvalDecision.mutate({ approvalId: approval.id, action: 'approve', decision_notes: note })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">
                          Approve
                        </button>
                        <button onClick={() => approvalDecision.mutate({ approvalId: approval.id, action: 'reject', decision_notes: note })} className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-medium text-white">
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">{approval.decision_notes || 'No action available'}</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!approvals?.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No approval requests yet.</td></tr>}
        </RowsTable>
      )}

      {activeTab === 'kitchen' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            {kitchenStatuses.map((status) => (
              <button
                key={status}
                onClick={() => setKitchenFilter(status)}
                className={`rounded-xl px-3 py-2 text-xs font-medium capitalize ${kitchenFilter === status ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                {status}
              </button>
            ))}
          </div>
          <RowsTable headers={['Ticket', 'Order', 'Age', 'Station', 'Items', 'Status', 'Actions']}>
            {filteredTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td className="py-3 pr-4 font-medium text-slate-900">{ticket.ticket_number}</td>
                <td className="py-3 pr-4">
                  <p>{ticket.order_details?.order_number}</p>
                  {ticket.order_details?.notes && <p className="mt-1 max-w-xs text-xs text-amber-700">{ticket.order_details.notes}</p>}
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${formatTicketAge(ticket.created_at).startsWith('0m') ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                    {formatTicketAge(ticket.created_at)}
                  </span>
                </td>
                <td className="py-3 pr-4 capitalize">{ticket.station}</td>
                <td className="py-3 pr-4">
                  <div className="grid gap-2">
                    {ticket.lines.map((line) => (
                      <div key={line.id}>
                        <p className="font-medium text-slate-900">{line.quantity}x {line.order_line_details?.menu_item_details?.name || 'Item'}</p>
                        {line.order_line_details?.modifier_details?.length ? <p className="text-xs text-slate-500">{line.order_line_details.modifier_details.map((modifier) => modifier.name).join(', ')}</p> : null}
                        {line.order_line_details?.notes ? <p className="text-xs text-amber-700">{line.order_line_details.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4 capitalize">{ticket.status}</td>
                <td className="py-3 pr-4">
                  <div className="flex gap-2">
                    {can('restaurant.kitchen.update') && ticket.status === 'open' && <button onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'start' })} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white">Start</button>}
                    {can('restaurant.kitchen.update') && ['open', 'preparing'].includes(ticket.status) && <button onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'mark_ready' })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">Ready</button>}
                  </div>
                </td>
              </tr>
            ))}
            {filteredTickets.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No kitchen tickets for this filter.</td></tr>}
          </RowsTable>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Order History</h2>
              <p className="mt-1 text-sm text-slate-500">Paid and cancelled restaurant orders.</p>
            </div>
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search orders, table, room, guest"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-80"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Receipt</th><th className="py-3 pr-4">Location</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Payment</th><th className="py-3 pr-4">Total</th><th className="py-3 pr-4">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900">{order.order_number}</p>
                      <p className="text-xs text-slate-500">{order.order_type}</p>
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-700">{order.receipt_number || '-'}</td>
                    <td className="py-3 pr-4">{getOrderLocation(order)}</td>
                    <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span></td>
                    <td className="py-3 pr-4">{order.payment_method || '-'}</td>
                    <td className="py-3 pr-4 font-medium">{formatMoney(order.grand_total, settings?.currency)}</td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => {
                          if (order.status === 'paid') {
                            reprintRestaurantReceipt.mutate(
                              { orderId: order.id, reason: 'Restaurant history reprint' },
                              { onSuccess: (updatedOrder) => setReceiptOrder(updatedOrder) },
                            );
                          } else {
                            setReceiptOrder(order);
                          }
                        }}
                        disabled={reprintRestaurantReceipt.isPending}
                        className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
                {historyOrders.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No historical restaurant orders found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {settlingOrder && (
        <ActionModal
          title={`Settle order ${settlingOrder.order_number}`}
          description={`Total due ${formatMoney(settlingOrder.grand_total, settings?.currency)}`}
          onClose={() => setSettlingOrder(null)}
        >
          {(() => {
            const settleForm = settleForms[settlingOrder.id] || {
              ...emptySettleForm,
              paid_amount: settlingOrder.grand_total,
              booking: settlingOrder.room_booking || '',
            };
            return (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSettleOrder(settlingOrder.id);
                }}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={settleForm.payment_method}
                    onChange={(e) =>
                      setSettleForms({
                        ...settleForms,
                        [settlingOrder.id]: { ...settleForm, payment_method: e.target.value as typeof emptySettleForm.payment_method },
                      })
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="wallet">Wallet</option>
                    <option value="bank_transfer">Bank</option>
                    <option value="room_posting">Room</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={settleForm.paid_amount}
                    onChange={(e) => setSettleForms({ ...settleForms, [settlingOrder.id]: { ...settleForm, paid_amount: e.target.value } })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                  <select
                    value={settleForm.booking}
                    onChange={(e) => setSettleForms({ ...settleForms, [settlingOrder.id]: { ...settleForm, booking: e.target.value } })}
                    disabled={settleForm.payment_method !== 'room_posting'}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 md:col-span-2"
                    required={settleForm.payment_method === 'room_posting'}
                  >
                    <option value="">In-house room</option>
                    {inHouseBookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {booking.room_details?.room_number} - {booking.guest_details?.first_name} {booking.guest_details?.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => setSettlingOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={settleOrder.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                    Settle order
                  </button>
                </div>
                {settleOrder.isError && <p className="mt-3 text-sm text-red-600">Could not settle order. Check payment and room selection.</p>}
              </form>
            );
          })()}
        </ActionModal>
      )}

      {transferOrder && (
        <ActionModal
          title={`Transfer ${transferOrder.order_number}`}
          description={`Move this dine-in order from Table ${transferOrder.table_details?.table_number || '-'}.`}
          onClose={() => setTransferOrder(null)}
        >
          <form onSubmit={handleTransferOrder}>
            <div className="grid gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="transfer-table">
                Target table
              </label>
              <select
                id="transfer-table"
                value={transferForm.table}
                onChange={(e) => setTransferForm({ table: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select available table</option>
                {availableTransferTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    Table {table.table_number} - {table.section || 'No section'} - {table.status}
                  </option>
                ))}
              </select>
              {availableTransferTables.length === 0 && <p className="text-sm text-amber-700">No available or reserved tables are ready for transfer.</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setTransferOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={orderAction.isPending || !transferForm.table} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Transfer order
              </button>
            </div>
            {orderAction.isError && <p className="mt-3 text-sm text-red-600">Could not transfer order. Check table availability.</p>}
          </form>
        </ActionModal>
      )}

      {mergeOrder && (
        <ActionModal
          title={`Merge ${mergeOrder.order_number}`}
          description="Move this order into another active dine-in bill."
          onClose={() => setMergeOrder(null)}
        >
          <form onSubmit={handleMergeOrder}>
            <div className="grid gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="merge-order">
                Target bill
              </label>
              <select
                id="merge-order"
                value={mergeForm.target_order}
                onChange={(e) => setMergeForm({ target_order: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select active order</option>
                {availableMergeOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} - Table {order.table_details?.table_number || '-'} - {formatMoney(order.grand_total, settings?.currency)}
                  </option>
                ))}
              </select>
              {availableMergeOrders.length === 0 && <p className="text-sm text-amber-700">No other active dine-in orders are available to merge.</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setMergeOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={orderAction.isPending || !mergeForm.target_order} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Merge order
              </button>
            </div>
            {orderAction.isError && <p className="mt-3 text-sm text-red-600">Could not merge order. Check the target bill status.</p>}
          </form>
        </ActionModal>
      )}

      {splitOrder && (
        <ActionModal
          title={`Split bill ${splitOrder.order_number}`}
          description="Choose the quantities to move into a separate bill."
          onClose={() => setSplitOrder(null)}
        >
          <form onSubmit={handleSplitOrder}>
            <div className="space-y-3">
              {splitOrder.lines.filter((line) => line.status !== 'cancelled').map((line) => {
                const quantity = splitQuantities[line.id] || 0;
                return (
                  <div key={line.id} className="grid gap-3 rounded-2xl border border-slate-100 p-3 md:grid-cols-[minmax(0,1fr)_120px] md:items-center">
                    <div>
                      <p className="font-medium text-slate-900">{line.menu_item_details?.name || 'Menu item'}</p>
                      <p className="text-xs text-slate-500">
                        {line.quantity} available at {formatMoney(line.unit_price, settings?.currency)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={line.quantity}
                      value={quantity}
                      onChange={(e) => {
                        const nextQuantity = Math.max(0, Math.min(Number(e.target.value), line.quantity));
                        setSplitQuantities({ ...splitQuantities, [line.id]: nextQuantity });
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700">Split total: {formatMoney(String(selectedSplitTotal.toFixed(2)), settings?.currency)}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSplitOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={orderAction.isPending || selectedSplitTotal <= 0 || selectedSplitQuantity >= splitOrderQuantity} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                  Create split bill
                </button>
              </div>
            </div>
            {orderAction.isError && <p className="mt-3 text-sm text-red-600">Could not split bill. Leave at least one item on the original order.</p>}
          </form>
        </ActionModal>
      )}

      {voidingOrder && (
        <ActionModal
          title={`Void item ${voidingOrder.order_number}`}
          description="Select the item and submit it for manager approval."
          onClose={() => setVoidingOrder(null)}
        >
          <form onSubmit={handleVoidOrderLine}>
            <div className="grid gap-3">
              <label className="text-sm font-medium text-slate-700" htmlFor="void-line">
                Order item
              </label>
              <select
                id="void-line"
                value={voidForm.line}
                onChange={(e) => setVoidForm({ ...voidForm, line: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select item</option>
                {voidingOrder.lines.filter((line) => line.status !== 'cancelled').map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.quantity}x {line.menu_item_details?.name} - {formatMoney(line.line_total, settings?.currency)}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Reason"
                value={voidForm.reason}
                onChange={(e) => setVoidForm({ ...voidForm, reason: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setVoidingOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={requestApproval.isPending || !voidForm.line} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                Request approval
              </button>
            </div>
            {requestApproval.isError && <p className="mt-3 text-sm text-red-600">Could not request approval. Check order status and try again.</p>}
          </form>
        </ActionModal>
      )}

      {discountOrder && (
        <ActionModal
          title={`Discount ${discountOrder.order_number}`}
          description={`Current bill total ${formatMoney(discountOrder.grand_total, settings?.currency)}`}
          onClose={() => setDiscountOrder(null)}
        >
          <form onSubmit={handleApplyDiscount}>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount amount"
                value={discountForm.discount_amount}
                onChange={(e) => setDiscountForm({ ...discountForm, discount_amount: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Reason"
                value={discountForm.reason}
                onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setDiscountOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={requestApproval.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Request approval
              </button>
            </div>
            {requestApproval.isError && <p className="mt-3 text-sm text-red-600">Could not request discount approval. It cannot exceed the active order total.</p>}
          </form>
        </ActionModal>
      )}

      {complimentaryOrder && (
        <ActionModal
          title={`Comp bill ${complimentaryOrder.order_number}`}
          description={`Current bill total ${formatMoney(complimentaryOrder.grand_total, settings?.currency)}`}
          onClose={() => setComplimentaryOrder(null)}
        >
          <form onSubmit={handleComplimentaryRequest}>
            <textarea
              placeholder="Reason"
              value={complimentaryForm.reason}
              onChange={(e) => setComplimentaryForm({ reason: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setComplimentaryOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={requestApproval.isPending} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300">
                Request approval
              </button>
            </div>
            {requestApproval.isError && <p className="mt-3 text-sm text-red-600">Could not request complimentary approval.</p>}
          </form>
        </ActionModal>
      )}

      {receiptOrder && (
        <ActionModal
          title={`Receipt ${receiptOrder.receipt_number || receiptOrder.order_number}`}
          description={getOrderLocation(receiptOrder)}
          onClose={() => setReceiptOrder(null)}
          maxWidthClassName="max-w-xl"
        >
          <ReceiptView order={receiptOrder} currency={settings?.currency} />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button type="button" onClick={() => setReceiptOrder(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              Print
            </button>
          </div>
        </ActionModal>
      )}
    </div>
  );
};

const getOrderLocation = (order: RestaurantOrder) => {
  if (order.table_details) return `Table ${order.table_details.table_number}`;
  if (order.room_number) return `Room ${order.room_number}${order.guest_name ? ` - ${order.guest_name}` : ''}`;
  return order.order_type;
};

const ReceiptView = ({ order, currency }: { order: RestaurantOrder; currency?: string }) => {
  const activeLines = order.lines.filter((line) => line.status !== 'cancelled');
  const voidedLines = order.lines.filter((line) => line.status === 'cancelled');

  return (
    <div className="receipt-print rounded-2xl border border-slate-200 p-4 text-sm text-slate-800">
      <div className="border-b border-dashed border-slate-300 pb-3 text-center">
        <p className="text-lg font-bold text-slate-950">Restaurant Receipt</p>
        <p className="mt-1 text-xs text-slate-700">{order.receipt_number || '-'}</p>
        <p className="mt-1 text-xs text-slate-500">Order {order.order_number}</p>
      </div>
      <div className="grid gap-2 border-b border-dashed border-slate-300 py-3 text-xs text-slate-600">
        <div className="flex justify-between gap-4"><span>Location</span><span className="text-right font-medium text-slate-900">{getOrderLocation(order)}</span></div>
        <div className="flex justify-between gap-4"><span>Status</span><span className="text-right font-medium text-slate-900">{order.status}</span></div>
        <div className="flex justify-between gap-4"><span>Payment</span><span className="text-right font-medium text-slate-900">{order.payment_method || '-'}</span></div>
        {order.receipt_issued_at && <div className="flex justify-between gap-4"><span>Issued at</span><span className="text-right font-medium text-slate-900">{new Date(order.receipt_issued_at).toLocaleString()}</span></div>}
        {order.paid_at && <div className="flex justify-between gap-4"><span>Paid at</span><span className="text-right font-medium text-slate-900">{new Date(order.paid_at).toLocaleString()}</span></div>}
        <div className="flex justify-between gap-4"><span>Reprints</span><span className="text-right font-medium text-slate-900">{order.receipt_reprint_count || 0}</span></div>
      </div>
      <div className="border-b border-dashed border-slate-300 py-3">
        <div className="space-y-2">
          {activeLines.map((line) => (
            <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <p className="font-medium text-slate-900">{line.menu_item_details?.name || 'Menu item'}</p>
                <p className="text-xs text-slate-500">{line.quantity} x {formatMoney(line.unit_price, currency)}</p>
                {line.modifier_details?.length ? (
                  <p className="text-xs text-slate-500">
                    {line.modifier_details.map((modifier) => `${modifier.name}${Number(modifier.price_delta) > 0 ? ` +${formatMoney(modifier.price_delta, currency)}` : ''}`).join(', ')}
                  </p>
                ) : null}
              </div>
              <p className="font-medium text-slate-900">{formatMoney(line.line_total, currency)}</p>
            </div>
          ))}
          {activeLines.length === 0 && <p className="text-center text-slate-500">No payable items.</p>}
        </div>
        {voidedLines.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Voided</p>
            {voidedLines.map((line) => (
              <div key={line.id} className="flex justify-between gap-3 text-xs text-slate-500">
                <span>{line.quantity}x {line.menu_item_details?.name || 'Menu item'}</span>
                <span>{formatMoney(line.line_total, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 pt-3">
        <div className="flex justify-between gap-4"><span>Subtotal</span><span>{formatMoney(order.subtotal, currency)}</span></div>
        {Number(order.tax_total) > 0 && <div className="flex justify-between gap-4"><span>Tax</span><span>{formatMoney(order.tax_total, currency)}</span></div>}
        {Number(order.service_charge_total) > 0 && <div className="flex justify-between gap-4"><span>Service</span><span>{formatMoney(order.service_charge_total, currency)}</span></div>}
        {Number(order.discount_total) > 0 && <div className="flex justify-between gap-4 text-rose-700"><span>Discount</span><span>-{formatMoney(order.discount_total, currency)}</span></div>}
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-950"><span>Total</span><span>{formatMoney(order.grand_total, currency)}</span></div>
        {Number(order.paid_amount) > 0 && <div className="flex justify-between gap-4 text-sm font-medium"><span>Paid</span><span>{formatMoney(order.paid_amount, currency)}</span></div>}
      </div>
    </div>
  );
};

const FormPanel = ({ title, onSubmit, children }: { title: string; onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <form onSubmit={onSubmit}>
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
      <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
    </form>
  </section>
);

const RowsTable = ({ headers, children }: { headers: string[]; children: React.ReactNode }) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{headers.map((header) => <th key={header} className="py-3 pr-4">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  </section>
);

export default Restaurant;
