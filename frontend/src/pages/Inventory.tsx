import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAdjustStock,
  useCreateInventoryItem,
  useCreateVendor,
  useInventoryItems,
  useReceiveStock,
  useStockMovements,
  useVendors,
} from '../hooks/inventory';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { InventoryItem, Vendor } from '../types/inventory';

const emptyVendor = {
  name: '',
  email: '',
  phone: '',
  address: '',
  tax_number: '',
  is_active: true,
};

const emptyItem = {
  sku: '',
  name: '',
  category: '',
  unit: 'pcs' as InventoryItem['unit'],
  cost_price: '0.00',
  reorder_level: '0',
  is_active: true,
};

const emptyReceive = {
  item: '',
  vendor: '',
  quantity: '',
  unit_cost: '',
  reference: '',
  notes: '',
  payment_account: '2000' as const,
};

const emptyAdjustment = {
  item: '',
  movement_type: 'adjustment_in' as const,
  quantity: '',
  unit_cost: '',
  reference: '',
  notes: '',
};

const unitLabels: Record<InventoryItem['unit'], string> = {
  pcs: 'Pieces',
  kg: 'Kilogram',
  g: 'Gram',
  l: 'Liter',
  ml: 'Milliliter',
  pack: 'Pack',
  box: 'Box',
  bottle: 'Bottle',
};

const Inventory: React.FC = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: vendors, isLoading: vendorsLoading } = useVendors();
  const { data: items, isLoading: itemsLoading, error } = useInventoryItems();
  const { data: movements } = useStockMovements();
  const createVendor = useCreateVendor();
  const createItem = useCreateInventoryItem();
  const receiveStock = useReceiveStock();
  const adjustStock = useAdjustStock();
  const [activeForm, setActiveForm] = useState<'vendor' | 'item' | 'receive' | 'adjust' | null>(null);
  const [vendorForm, setVendorForm] = useState<Omit<Vendor, 'id'>>(emptyVendor);
  const [itemForm, setItemForm] = useState<Omit<InventoryItem, 'id' | 'current_stock' | 'is_low_stock'>>(emptyItem);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);

  const lowStockItems = items?.filter((item) => item.is_low_stock) || [];
  const totalStockValue =
    items?.reduce((total, item) => total + Number(item.current_stock || 0) * Number(item.cost_price || 0), 0) || 0;

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate(vendorForm, {
      onSuccess: () => {
        setActiveForm(null);
        setVendorForm(emptyVendor);
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

  const handleReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    receiveStock.mutate(
      {
        ...receiveForm,
        vendor: receiveForm.vendor || undefined,
      },
      {
        onSuccess: () => {
          setActiveForm(null);
          setReceiveForm(emptyReceive);
        },
      },
    );
  };

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    adjustStock.mutate(
      {
        ...adjustmentForm,
        unit_cost: adjustmentForm.unit_cost || undefined,
      },
      {
        onSuccess: () => {
          setActiveForm(null);
          setAdjustmentForm(emptyAdjustment);
        },
      },
    );
  };

  if (itemsLoading) return <div className="p-6 text-slate-600">Loading inventory...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading inventory</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventory</h1>
          <p className="mt-2 text-slate-600">Track vendors, stock levels, purchase receiving, and adjustments.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveForm(activeForm === 'vendor' ? null : 'vendor')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add Vendor
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'item' ? null : 'item')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add Item
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'adjust' ? null : 'adjust')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Adjust Stock
          </button>
          <button
            onClick={() => setActiveForm(activeForm === 'receive' ? null : 'receive')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Receive Stock
          </button>
        </div>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Stock Value</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(totalStockValue, settings?.currency)}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Tracked Items</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{items?.length || 0}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low Stock</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{lowStockItems.length}</p>
        </div>
      </section>

      {activeForm === 'vendor' && (
        <form onSubmit={handleCreateVendor} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Vendor</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              placeholder="Vendor Name"
              value={vendorForm.name}
              onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={vendorForm.email}
              onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              placeholder="Phone"
              value={vendorForm.phone}
              onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              placeholder="Tax Number"
              value={vendorForm.tax_number}
              onChange={(e) => setVendorForm({ ...vendorForm, tax_number: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <textarea
              placeholder="Address"
              value={vendorForm.address}
              onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Vendor
          </button>
        </form>
      )}

      {activeForm === 'item' && (
        <form onSubmit={handleCreateItem} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Inventory Item</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              placeholder="SKU"
              value={itemForm.sku}
              onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Item Name"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              placeholder="Category"
              value={itemForm.category}
              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <select
              value={itemForm.unit}
              onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value as InventoryItem['unit'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              {Object.entries(unitLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Cost Price"
              value={itemForm.cost_price}
              onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              type="number"
              step="0.001"
              placeholder="Reorder Level"
              value={itemForm.reorder_level}
              onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Item
          </button>
        </form>
      )}

      {activeForm === 'receive' && (
        <form onSubmit={handleReceiveStock} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Receive Stock</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={receiveForm.item}
              onChange={(e) => setReceiveForm({ ...receiveForm, item: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">Select Item</option>
              {items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name}
                </option>
              ))}
            </select>
            <select
              value={receiveForm.vendor}
              onChange={(e) => setReceiveForm({ ...receiveForm, vendor: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">{vendorsLoading ? 'Loading vendors...' : 'No vendor selected'}</option>
              {vendors?.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.001"
              placeholder="Quantity"
              value={receiveForm.quantity}
              onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Unit Cost"
              value={receiveForm.unit_cost}
              onChange={(e) => setReceiveForm({ ...receiveForm, unit_cost: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <select
              value={receiveForm.payment_account}
              onChange={(e) => setReceiveForm({ ...receiveForm, payment_account: e.target.value as typeof emptyReceive.payment_account })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="2000">Accounts Payable</option>
              <option value="1000">Cash</option>
              <option value="1010">Bank</option>
            </select>
            <input
              placeholder="Reference"
              value={receiveForm.reference}
              onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <textarea
              placeholder="Notes"
              value={receiveForm.notes}
              onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Receive Stock
          </button>
        </form>
      )}

      {activeForm === 'adjust' && (
        <form onSubmit={handleAdjustStock} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Adjust Stock</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={adjustmentForm.item}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, item: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">Select Item</option>
              {items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name}
                </option>
              ))}
            </select>
            <select
              value={adjustmentForm.movement_type}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, movement_type: e.target.value as typeof emptyAdjustment.movement_type })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="adjustment_in">Adjustment In</option>
              <option value="adjustment_out">Adjustment Out</option>
              <option value="waste">Waste</option>
            </select>
            <input
              type="number"
              step="0.001"
              placeholder="Quantity"
              value={adjustmentForm.quantity}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Unit Cost"
              value={adjustmentForm.unit_cost}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, unit_cost: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <input
              placeholder="Reference"
              value={adjustmentForm.reference}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reference: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
            <textarea
              placeholder="Notes"
              value={adjustmentForm.notes}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <button className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Save Adjustment
          </button>
        </form>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Stock Items</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Stock</th>
                  <th className="py-3 pr-4">Reorder</th>
                  <th className="py-3 pr-4">Cost</th>
                  <th className="py-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items?.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.sku}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{item.category || '-'}</td>
                    <td className="py-3 pr-4 text-slate-700">
                      {Number(item.current_stock).toLocaleString()} {item.unit}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{Number(item.reorder_level).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-slate-700">{formatMoney(item.cost_price, settings?.currency)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.is_low_stock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.is_low_stock ? 'Low' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
                {items?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-600">
                      No inventory items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Low Stock</h2>
            <div className="mt-4 space-y-3">
              {lowStockItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                  <p className="font-medium text-amber-900">{item.name}</p>
                  <p className="text-sm text-amber-700">
                    {Number(item.current_stock).toLocaleString()} {item.unit} on hand
                  </p>
                </div>
              ))}
              {lowStockItems.length === 0 && <p className="text-sm text-slate-600">All tracked items are above reorder level.</p>}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Vendors</h2>
            <div className="mt-4 space-y-3">
              {vendors?.slice(0, 6).map((vendor) => (
                <div key={vendor.id} className="rounded-2xl border border-slate-200 p-3">
                  <p className="font-medium text-slate-900">{vendor.name}</p>
                  <p className="text-sm text-slate-500">{vendor.phone || vendor.email || 'No contact'}</p>
                </div>
              ))}
              {vendors?.length === 0 && <p className="text-sm text-slate-600">No vendors yet.</p>}
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent Movements</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {movements?.slice(0, 10).map((movement) => (
            <div key={movement.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{movement.item_details?.name}</p>
                  <p className="text-sm text-slate-500">
                    {movement.movement_type} | {Number(movement.quantity).toLocaleString()} {movement.item_details?.unit}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-900">{formatMoney(movement.total_cost, settings?.currency)}</span>
              </div>
              {movement.reference && <p className="mt-2 text-xs text-slate-500">Ref: {movement.reference}</p>}
            </div>
          ))}
          {movements?.length === 0 && <p className="text-sm text-slate-600">No stock movements yet.</p>}
        </div>
      </section>
    </div>
  );
};

export default Inventory;
