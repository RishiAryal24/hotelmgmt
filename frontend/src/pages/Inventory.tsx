import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CompactTabs from '../components/CompactTabs';
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

const emptyVendor = { name: '', email: '', phone: '', address: '', tax_number: '', is_active: true };
const emptyItem = {
  sku: '',
  name: '',
  category: '',
  unit: 'pcs' as InventoryItem['unit'],
  cost_price: '0.00',
  reorder_level: '0',
  is_active: true,
};
const emptyReceive = { item: '', vendor: '', quantity: '', unit_cost: '', reference: '', notes: '', payment_account: '2000' as const };
const emptyAdjustment = { item: '', movement_type: 'adjustment_in' as const, quantity: '', unit_cost: '', reference: '', notes: '' };

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
  const [activeTab, setActiveTab] = useState('overview');
  const [vendorForm, setVendorForm] = useState<Omit<Vendor, 'id'>>(emptyVendor);
  const [itemForm, setItemForm] = useState<Omit<InventoryItem, 'id' | 'current_stock' | 'is_low_stock'>>(emptyItem);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);

  const lowStockItems = items?.filter((item) => item.is_low_stock) || [];
  const totalStockValue = items?.reduce((total, item) => total + Number(item.current_stock || 0) * Number(item.cost_price || 0), 0) || 0;
  const purchaseCount = movements?.filter((movement) => movement.movement_type === 'purchase').length || 0;
  const saleCount = movements?.filter((movement) => movement.movement_type === 'sale').length || 0;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'items', label: 'Items', count: items?.length || 0 },
    { id: 'vendors', label: 'Vendors', count: vendors?.length || 0 },
    { id: 'receive', label: 'Receive' },
    { id: 'movements', label: 'Movements', count: movements?.length || 0 },
    { id: 'adjust', label: 'Adjust' },
  ];

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate(vendorForm, { onSuccess: () => setVendorForm(emptyVendor) });
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(itemForm, { onSuccess: () => setItemForm(emptyItem) });
  };

  const handleReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    receiveStock.mutate({ ...receiveForm, vendor: receiveForm.vendor || undefined }, { onSuccess: () => setReceiveForm(emptyReceive) });
  };

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    adjustStock.mutate({ ...adjustmentForm, unit_cost: adjustmentForm.unit_cost || undefined }, { onSuccess: () => setAdjustmentForm(emptyAdjustment) });
  };

  if (itemsLoading) return <div className="p-6 text-slate-600">Loading inventory...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading inventory</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">Stock, vendors, receiving, and movement history in compact rows.</p>
          </div>
          <CompactTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>
      </section>

      {activeTab === 'overview' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Stock Value', formatMoney(totalStockValue, settings?.currency), 'Current stock x cost'],
            ['Tracked Items', items?.length || 0, `${lowStockItems.length} low stock`],
            ['Purchase Receipts', purchaseCount, 'Received movements'],
            ['POS Deductions', saleCount, 'Restaurant sale movements'],
          ].map(([title, value, detail]) => (
            <article key={title} className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{title}</p>
              <p className="mt-2 text-2xl font-bold text-[#1F5E3B]">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </article>
          ))}
          <div className="rounded-3xl bg-white p-5 shadow-sm md:col-span-2 xl:col-span-4">
            <h2 className="text-lg font-bold text-slate-900">Low Stock Watch</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Item</th>
                    <th className="py-3 pr-4">Stock</th>
                    <th className="py-3 pr-4">Reorder</th>
                    <th className="py-3 pr-4">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{item.name}</td>
                      <td className="py-3 pr-4">{Number(item.current_stock).toLocaleString()} {item.unit}</td>
                      <td className="py-3 pr-4">{Number(item.reorder_level).toLocaleString()}</td>
                      <td className="py-3 pr-4">{formatMoney(item.cost_price, settings?.currency)}</td>
                    </tr>
                  ))}
                  {lowStockItems.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">All tracked items are above reorder level.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'items' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <form onSubmit={handleCreateItem} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="font-bold text-slate-900">Add Item</h2>
              <div className="mt-3 grid gap-3">
                <input placeholder="SKU" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="Item Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input placeholder="Category" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value as InventoryItem['unit'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Cost Price" value={itemForm.cost_price} onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" step="0.001" placeholder="Reorder Level" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Create Item</button>
              </div>
            </form>
            <InventoryItemsTable items={items || []} currency={settings?.currency} />
          </div>
        </section>
      )}

      {activeTab === 'vendors' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <form onSubmit={handleCreateVendor} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="font-bold text-slate-900">Add Vendor</h2>
              <div className="mt-3 grid gap-3">
                <input placeholder="Vendor Name" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                <input type="email" placeholder="Email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input placeholder="Phone" value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input placeholder="Tax Number" value={vendorForm.tax_number} onChange={(e) => setVendorForm({ ...vendorForm, tax_number: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <textarea placeholder="Address" value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Create Vendor</button>
              </div>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-3 pr-4">Vendor</th><th className="py-3 pr-4">Contact</th><th className="py-3 pr-4">Tax No.</th><th className="py-3 pr-4">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorsLoading && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Loading vendors...</td></tr>}
                  {vendors?.map((vendor) => (
                    <tr key={vendor.id}><td className="py-3 pr-4 font-medium text-slate-900">{vendor.name}</td><td className="py-3 pr-4">{vendor.phone || vendor.email || '-'}</td><td className="py-3 pr-4">{vendor.tax_number || '-'}</td><td className="py-3 pr-4">{vendor.is_active ? 'Active' : 'Inactive'}</td></tr>
                  ))}
                  {vendors?.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No vendors yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'receive' && (
        <FormPanel title="Receive Stock" onSubmit={handleReceiveStock}>
          <select value={receiveForm.item} onChange={(e) => setReceiveForm({ ...receiveForm, item: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
            <option value="">Select Item</option>
            {items?.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
          </select>
          <select value={receiveForm.vendor} onChange={(e) => setReceiveForm({ ...receiveForm, vendor: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">{vendorsLoading ? 'Loading vendors...' : 'No vendor selected'}</option>
            {vendors?.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
          <input type="number" step="0.001" placeholder="Quantity" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <input type="number" step="0.01" placeholder="Unit Cost" value={receiveForm.unit_cost} onChange={(e) => setReceiveForm({ ...receiveForm, unit_cost: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <select value={receiveForm.payment_account} onChange={(e) => setReceiveForm({ ...receiveForm, payment_account: e.target.value as typeof emptyReceive.payment_account })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="2000">Accounts Payable</option><option value="1000">Cash</option><option value="1010">Bank</option>
          </select>
          <input placeholder="Reference" value={receiveForm.reference} onChange={(e) => setReceiveForm({ ...receiveForm, reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <textarea placeholder="Notes" value={receiveForm.notes} onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
        </FormPanel>
      )}

      {activeTab === 'adjust' && (
        <FormPanel title="Adjust Stock" onSubmit={handleAdjustStock}>
          <select value={adjustmentForm.item} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, item: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
            <option value="">Select Item</option>
            {items?.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
          </select>
          <select value={adjustmentForm.movement_type} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, movement_type: e.target.value as typeof emptyAdjustment.movement_type })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="adjustment_in">Adjustment In</option><option value="adjustment_out">Adjustment Out</option><option value="waste">Waste</option>
          </select>
          <input type="number" step="0.001" placeholder="Quantity" value={adjustmentForm.quantity} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
          <input type="number" step="0.01" placeholder="Unit Cost" value={adjustmentForm.unit_cost} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, unit_cost: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Reference" value={adjustmentForm.reference} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <textarea placeholder="Notes" value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </FormPanel>
      )}

      {activeTab === 'movements' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4">Value</th><th className="py-3 pr-4">Reference</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movements?.map((movement) => (
                  <tr key={movement.id}><td className="py-3 pr-4 font-medium text-slate-900">{movement.item_details?.name}</td><td className="py-3 pr-4">{movement.movement_type}</td><td className="py-3 pr-4">{Number(movement.quantity).toLocaleString()} {movement.item_details?.unit}</td><td className="py-3 pr-4">{formatMoney(movement.total_cost, settings?.currency)}</td><td className="py-3 pr-4">{movement.reference || '-'}</td></tr>
                ))}
                {movements?.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No stock movements yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
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

const InventoryItemsTable = ({ items, currency }: { items: InventoryItem[]; currency?: string }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
        <tr><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Category</th><th className="py-3 pr-4">Stock</th><th className="py-3 pr-4">Reorder</th><th className="py-3 pr-4">Cost</th><th className="py-3 pr-4">Status</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((item) => (
          <tr key={item.id}>
            <td className="py-3 pr-4"><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.sku}</p></td>
            <td className="py-3 pr-4">{item.category || '-'}</td>
            <td className="py-3 pr-4">{Number(item.current_stock).toLocaleString()} {item.unit}</td>
            <td className="py-3 pr-4">{Number(item.reorder_level).toLocaleString()}</td>
            <td className="py-3 pr-4">{formatMoney(item.cost_price, currency)}</td>
            <td className="py-3 pr-4"><span className={`rounded-full px-2 py-1 text-xs font-medium ${item.is_low_stock ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.is_low_stock ? 'Low' : 'OK'}</span></td>
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No inventory items yet.</td></tr>}
      </tbody>
    </table>
  </div>
);

export default Inventory;
