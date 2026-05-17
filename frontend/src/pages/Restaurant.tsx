import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useBookings } from '../hooks/bookings';
import { useInventoryItems } from '../hooks/inventory';
import {
  useCreateMenuCategory,
  useCreateMenuItem,
  useCreateRestaurantOrder,
  useCreateRestaurantTable,
  useKitchenTicketAction,
  useKitchenTickets,
  useMenuCategories,
  useMenuItems,
  useRestaurantOrderAction,
  useRestaurantOrders,
  useRestaurantTables,
  useSettleRestaurantOrder,
} from '../hooks/restaurant';
import { usePermissions } from '../hooks/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { MenuCategory, MenuItem, RestaurantOrder, RestaurantTable } from '../types/restaurant';

const emptyCategory = { name: '', code: '', description: '', display_order: 0, is_active: true };
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
const emptyOrderLine = { menu_item: '', quantity: 1, notes: '' };
const emptySettleForm = { payment_method: 'cash' as RestaurantOrder['payment_method'], paid_amount: '', booking: '' };

const Restaurant: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: categories } = useMenuCategories();
  const { data: items } = useMenuItems();
  const { data: inventoryItems, isLoading: inventoryLoading } = useInventoryItems();
  const { data: tables } = useRestaurantTables();
  const { data: orders } = useRestaurantOrders();
  const { data: tickets } = useKitchenTickets();
  const { data: bookings } = useBookings();
  const createCategory = useCreateMenuCategory();
  const createItem = useCreateMenuItem();
  const createTable = useCreateRestaurantTable();
  const createOrder = useCreateRestaurantOrder();
  const orderAction = useRestaurantOrderAction();
  const settleOrder = useSettleRestaurantOrder();
  const ticketAction = useKitchenTicketAction();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('orders');
  const [categoryForm, setCategoryForm] = useState<Omit<MenuCategory, 'id'>>(emptyCategory);
  const [itemForm, setItemForm] = useState<Omit<MenuItem, 'id' | 'category_details' | 'inventory_item_details'>>(emptyItem);
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [tableForm, setTableForm] = useState<Omit<RestaurantTable, 'id'>>(emptyTable);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [lineForms, setLineForms] = useState<Record<string, typeof emptyOrderLine>>({});
  const [settleForms, setSettleForms] = useState<Record<string, typeof emptySettleForm>>({});
  const [settlingOrder, setSettlingOrder] = useState<RestaurantOrder | null>(null);

  const activeOrders = orders?.filter((order) => order.status !== 'paid' && order.status !== 'cancelled') || [];
  const inHouseBookings = bookings?.filter((booking) => booking.status === 'checked_in') || [];
  const tabs = [
    { id: 'orders', label: 'Orders', count: activeOrders.length },
    { id: 'menu', label: 'Menu', count: items?.length || 0 },
    { id: 'categories', label: 'Categories', count: categories?.length || 0 },
    { id: 'tables', label: 'Tables', count: tables?.length || 0 },
    { id: 'kitchen', label: 'Kitchen', count: tickets?.filter((ticket) => ticket.status !== 'served').length || 0 },
  ];

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    createCategory.mutate(categoryForm, { onSuccess: () => setCategoryForm(emptyCategory) });
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
    orderAction.mutate({ orderId, action: 'add_line', payload: { menu_item: lineForm.menu_item, quantity: lineForm.quantity, notes: lineForm.notes } });
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
      },
      {
        onSuccess: () => {
          setSettleForms({ ...settleForms, [orderId]: emptySettleForm });
          setSettlingOrder(null);
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
                    return (
                      <tr key={order.id}>
                        <td className="py-3 pr-4"><p className="font-medium text-slate-900">{order.order_number}</p><p className="text-xs text-slate-500">{order.order_type} {order.table_details ? `| Table ${order.table_details.table_number}` : ''}{order.room_number ? ` | Room ${order.room_number}` : ''}</p></td>
                        <td className="py-3 pr-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span></td>
                        <td className="py-3 pr-4">{order.lines.length ? order.lines.map((line) => `${line.quantity}x ${line.menu_item_details?.name}`).join(', ') : 'No items'}</td>
                        <td className="py-3 pr-4 font-medium">{formatMoney(order.grand_total, settings?.currency)}</td>
                        <td className="py-3 pr-4">
                          <div className="grid min-w-[260px] grid-cols-[1fr_64px] gap-2">
                            <select value={lineForm.menu_item} onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, menu_item: e.target.value } })} className="rounded-xl border border-slate-200 px-2 py-2 text-xs">
                              <option value="">Select item</option>
                              {items?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                            <input type="number" value={lineForm.quantity} min="1" onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, quantity: Number(e.target.value) } })} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" />
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs text-slate-500">{order.status === 'served' ? 'Ready to settle' : 'Mark served first'}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {can('restaurant.order.update') && <button onClick={() => handleAddLine(order.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Add</button>}
                            {can('restaurant.order.update') && order.lines.length > 0 && ['draft', 'sent_to_kitchen'].includes(order.status) && <button onClick={() => orderAction.mutate({ orderId: order.id, action: 'send_to_kitchen' })} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white">Kitchen</button>}
                            {can('restaurant.order.update') && ['sent_to_kitchen', 'preparing'].includes(order.status) && <button onClick={() => orderAction.mutate({ orderId: order.id, action: 'mark_served' })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">Served</button>}
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
          {can('restaurant.order.update') && <FormPanel title="Add Menu Item" onSubmit={handleCreateItem}>
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
          </FormPanel>}
          <RowsTable headers={['Picture', 'Item', 'Category', 'Price', 'Station', 'Inventory Deduction']}>
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
                <td className="py-3 pr-4">{item.preparation_station}</td>
                <td className="py-3 pr-4">{item.inventory_item_details ? `${item.inventory_quantity_per_unit} ${item.inventory_item_details.unit} ${item.inventory_item_details.name}` : '-'}</td>
              </tr>
            ))}
            {items?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No menu items yet.</td></tr>}
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

      {activeTab === 'kitchen' && (
        <RowsTable headers={['Ticket', 'Order', 'Station', 'Items', 'Status', 'Actions']}>
          {tickets?.map((ticket) => (
            <tr key={ticket.id}><td className="py-3 pr-4 font-medium text-slate-900">{ticket.ticket_number}</td><td className="py-3 pr-4">{ticket.order_details?.order_number}</td><td className="py-3 pr-4">{ticket.station}</td><td className="py-3 pr-4">{ticket.lines.map((line) => `${line.quantity}x ${line.order_line_details?.menu_item_details?.name}`).join(', ')}</td><td className="py-3 pr-4">{ticket.status}</td><td className="py-3 pr-4"><div className="flex gap-2">{can('restaurant.kitchen.update') && ticket.status === 'open' && <button onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'start' })} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white">Start</button>}{can('restaurant.kitchen.update') && ['open', 'preparing'].includes(ticket.status) && <button onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'mark_ready' })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white">Ready</button>}</div></td></tr>
          ))}
          {tickets?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No kitchen tickets yet.</td></tr>}
        </RowsTable>
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
