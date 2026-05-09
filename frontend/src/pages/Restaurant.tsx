import React, { useState } from 'react';
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
} from '../hooks/restaurant';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { MenuCategory, MenuItem, RestaurantTable } from '../types/restaurant';
import { useQuery } from '@tanstack/react-query';

const emptyCategory = {
  name: '',
  code: '',
  description: '',
  display_order: 0,
  is_active: true,
};

const emptyItem = {
  category: '',
  name: '',
  sku: '',
  description: '',
  price: '',
  preparation_station: 'kitchen' as MenuItem['preparation_station'],
  preparation_time_minutes: 15,
  is_available: true,
  is_active: true,
};

const emptyTable = {
  table_number: '',
  section: '',
  capacity: 2,
  status: 'available' as RestaurantTable['status'],
  is_active: true,
};

const emptyOrder = {
  table: '',
  order_type: 'dine_in' as const,
  notes: '',
};

const emptyOrderLine = {
  menu_item: '',
  quantity: 1,
  notes: '',
};

const Restaurant: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: categories, isLoading: categoriesLoading } = useMenuCategories();
  const { data: items, isLoading: itemsLoading } = useMenuItems();
  const { data: tables, isLoading: tablesLoading } = useRestaurantTables();
  const { data: orders } = useRestaurantOrders();
  const { data: tickets } = useKitchenTickets();
  const createCategory = useCreateMenuCategory();
  const createItem = useCreateMenuItem();
  const createTable = useCreateRestaurantTable();
  const createOrder = useCreateRestaurantOrder();
  const orderAction = useRestaurantOrderAction();
  const ticketAction = useKitchenTicketAction();
  const [activeForm, setActiveForm] = useState<'category' | 'item' | 'table' | 'order' | null>(null);
  const [categoryForm, setCategoryForm] = useState<Omit<MenuCategory, 'id'>>(emptyCategory);
  const [itemForm, setItemForm] = useState<Omit<MenuItem, 'id' | 'category_details'>>(emptyItem);
  const [tableForm, setTableForm] = useState<Omit<RestaurantTable, 'id'>>(emptyTable);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [lineForms, setLineForms] = useState<Record<string, typeof emptyOrderLine>>({});

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    createCategory.mutate(categoryForm, {
      onSuccess: () => {
        setActiveForm(null);
        setCategoryForm(emptyCategory);
      },
    });
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(itemForm, {
      onSuccess: () => {
        setActiveForm(null);
        setItemForm(emptyItem);
      },
    });
  };

  const handleCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    createTable.mutate(tableForm, {
      onSuccess: () => {
        setActiveForm(null);
        setTableForm(emptyTable);
      },
    });
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    createOrder.mutate(
      {
        table: orderForm.order_type === 'dine_in' ? orderForm.table : undefined,
        order_type: orderForm.order_type,
        notes: orderForm.notes,
      },
      {
        onSuccess: () => {
          setActiveForm(null);
          setOrderForm(emptyOrder);
        },
      },
    );
  };

  const handleAddLine = (orderId: string) => {
    const lineForm = lineForms[orderId] || emptyOrderLine;
    if (!lineForm.menu_item) return;
    orderAction.mutate({
      orderId,
      action: 'add_line',
      payload: {
        menu_item: lineForm.menu_item,
        quantity: lineForm.quantity,
        notes: lineForm.notes,
      },
    });
    setLineForms({ ...lineForms, [orderId]: emptyOrderLine });
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Restaurant Management</h1>
          <p className="mt-2 text-slate-600">Set up menus, food items, preparation stations, and dining tables.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveForm(activeForm === 'category' ? null : 'category')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add Category
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'item' ? null : 'item')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add Item
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'table' ? null : 'table')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add Table
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'order' ? null : 'order')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New Order
          </button>
        </div>
      </div>

      {activeForm === 'category' && (
        <form onSubmit={handleCreateCategory} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Menu Category</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              placeholder="Category Name"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Code"
              value={categoryForm.code}
              onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="number"
              placeholder="Display Order"
              value={categoryForm.display_order}
              onChange={(e) => setCategoryForm({ ...categoryForm, display_order: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <textarea
              placeholder="Description"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Category
          </button>
        </form>
      )}

      {activeForm === 'item' && (
        <form onSubmit={handleCreateItem} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Menu Item</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={itemForm.category}
              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">{categoriesLoading ? 'Loading categories...' : 'Select Category'}</option>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Item Name"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="SKU"
              value={itemForm.sku}
              onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Price"
              value={itemForm.price}
              onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <select
              value={itemForm.preparation_station}
              onChange={(e) => setItemForm({ ...itemForm, preparation_station: e.target.value as MenuItem['preparation_station'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar</option>
              <option value="pastry">Pastry</option>
              <option value="counter">Counter</option>
            </select>
            <input
              type="number"
              placeholder="Prep Time"
              value={itemForm.preparation_time_minutes}
              onChange={(e) => setItemForm({ ...itemForm, preparation_time_minutes: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
            />
            <textarea
              placeholder="Description"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Item
          </button>
        </form>
      )}

      {activeForm === 'table' && (
        <form onSubmit={handleCreateTable} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Table</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              placeholder="Table Number"
              value={tableForm.table_number}
              onChange={(e) => setTableForm({ ...tableForm, table_number: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Section"
              value={tableForm.section}
              onChange={(e) => setTableForm({ ...tableForm, section: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              type="number"
              placeholder="Capacity"
              value={tableForm.capacity}
              onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              min="1"
            />
            <select
              value={tableForm.status}
              onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as RestaurantTable['status'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="occupied">Occupied</option>
              <option value="cleaning">Cleaning</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Table
          </button>
        </form>
      )}

      {activeForm === 'order' && (
        <form onSubmit={handleCreateOrder} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Restaurant Order</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={orderForm.order_type}
              onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value as typeof emptyOrder.order_type })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="dine_in">Dine In</option>
              <option value="takeaway">Takeaway</option>
              <option value="room_service">Room Service</option>
            </select>
            {orderForm.order_type === 'dine_in' && (
              <select
                value={orderForm.table}
                onChange={(e) => setOrderForm({ ...orderForm, table: e.target.value })}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="">Select Table</option>
                {tables?.map((table) => (
                  <option key={table.id} value={table.id}>
                    Table {table.table_number} - {table.status}
                  </option>
                ))}
              </select>
            )}
            <textarea
              placeholder="Order notes"
              value={orderForm.notes}
              onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Order
          </button>
        </form>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
          <div className="mt-4 space-y-3">
            {categoriesLoading && <p className="text-sm text-slate-600">Loading...</p>}
            {categories?.map((category) => (
              <div key={category.id} className="rounded-2xl border border-slate-200 p-3">
                <h3 className="font-semibold text-slate-900">{category.name}</h3>
                <p className="text-sm text-slate-500">{category.code}</p>
              </div>
            ))}
            {categories?.length === 0 && <p className="text-sm text-slate-600">No categories yet.</p>}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Menu Items</h2>
          <div className="mt-4 space-y-3">
            {itemsLoading && <p className="text-sm text-slate-600">Loading...</p>}
            {items?.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{item.name}</h3>
                    <p className="text-sm text-slate-500">{item.category_details?.name}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{formatMoney(item.price, settings?.currency)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.preparation_station} | {item.preparation_time_minutes} min</p>
              </div>
            ))}
            {items?.length === 0 && <p className="text-sm text-slate-600">No menu items yet.</p>}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Tables</h2>
          <div className="mt-4 space-y-3">
            {tablesLoading && <p className="text-sm text-slate-600">Loading...</p>}
            {tables?.map((table) => (
              <div key={table.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">Table {table.table_number}</h3>
                    <p className="text-sm text-slate-500">{table.section || 'Main'} | {table.capacity} seats</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{table.status}</span>
                </div>
              </div>
            ))}
            {tables?.length === 0 && <p className="text-sm text-slate-600">No tables yet.</p>}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Active Orders</h2>
          <div className="mt-4 space-y-4">
            {orders?.map((order) => {
              const lineForm = lineForms[order.id] || emptyOrderLine;
              return (
                <div key={order.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{order.order_number}</h3>
                      <p className="text-sm text-slate-500">
                        {order.order_type} {order.table_details ? `| Table ${order.table_details.table_number}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{order.status}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {order.lines.map((line) => (
                      <div key={line.id} className="flex items-center justify-between text-sm text-slate-700">
                        <span>
                          {line.quantity} x {line.menu_item_details?.name}
                        </span>
                        <span>{formatMoney(line.line_total, settings?.currency)}</span>
                      </div>
                    ))}
                    {order.lines.length === 0 && <p className="text-sm text-slate-500">No items added yet.</p>}
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_80px]">
                    <select
                      value={lineForm.menu_item}
                      onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, menu_item: e.target.value } })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <option value="">Select item</option>
                      {items?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} - {formatMoney(item.price, settings?.currency)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={lineForm.quantity}
                      min="1"
                      onChange={(e) => setLineForms({ ...lineForms, [order.id]: { ...lineForm, quantity: Number(e.target.value) } })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">Total: {formatMoney(order.grand_total, settings?.currency)}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleAddLine(order.id)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Add Item
                      </button>
                      {order.lines.length > 0 && ['draft', 'sent_to_kitchen'].includes(order.status) && (
                        <button
                          onClick={() => orderAction.mutate({ orderId: order.id, action: 'send_to_kitchen' })}
                          className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                        >
                          Send to Kitchen
                        </button>
                      )}
                      {['sent_to_kitchen', 'preparing'].includes(order.status) && (
                        <button
                          onClick={() => orderAction.mutate({ orderId: order.id, action: 'mark_served' })}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {orders?.length === 0 && <p className="text-sm text-slate-600">No restaurant orders yet.</p>}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Kitchen Tickets</h2>
          <div className="mt-4 space-y-4">
            {tickets?.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{ticket.ticket_number}</h3>
                    <p className="text-sm text-slate-500">
                      {ticket.station} | {ticket.order_details?.order_number}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{ticket.status}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {ticket.lines.map((line) => (
                    <p key={line.id} className="text-sm text-slate-700">
                      {line.quantity} x {line.order_line_details?.menu_item_details?.name}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  {ticket.status === 'open' && (
                    <button
                      onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'start' })}
                      className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                    >
                      Start
                    </button>
                  )}
                  {['open', 'preparing'].includes(ticket.status) && (
                    <button
                      onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'mark_ready' })}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Mark Ready
                    </button>
                  )}
                </div>
              </div>
            ))}
            {tickets?.length === 0 && <p className="text-sm text-slate-600">No kitchen tickets yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Restaurant;
