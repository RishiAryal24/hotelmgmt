import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import {
  useAdjustStock,
  useCreateInventoryItem,
  useCreatePurchaseOrder,
  useCreateVendor,
  useInventoryItems,
  useLowStockItems,
  usePurchaseOrderAction,
  usePurchaseOrders,
  useReceiveStock,
  useStockMovements,
  useVendors,
} from '../hooks/inventory';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { InventoryItem, PurchaseOrder, Vendor } from '../types/inventory';

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
const emptyPurchaseOrder = {
  vendor: '',
  expected_date: '',
  reference: '',
  notes: '',
  lines: [{ item: '', quantity: '', unit_cost: '', notes: '' }],
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
  const { data: lowStockApiItems } = useLowStockItems();
  const { data: movements } = useStockMovements();
  const { data: purchaseOrders } = usePurchaseOrders();
  const createVendor = useCreateVendor();
  const createItem = useCreateInventoryItem();
  const receiveStock = useReceiveStock();
  const adjustStock = useAdjustStock();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const purchaseOrderAction = usePurchaseOrderAction();
  const [activeTab, setActiveTab] = useState('overview');
  const [vendorForm, setVendorForm] = useState<Omit<Vendor, 'id'>>(emptyVendor);
  const [itemForm, setItemForm] = useState<Omit<InventoryItem, 'id' | 'current_stock' | 'is_low_stock'>>(emptyItem);
  const [receiveForm, setReceiveForm] = useState(emptyReceive);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);
  const [purchaseOrderForm, setPurchaseOrderForm] = useState(emptyPurchaseOrder);
  const [movementFilter, setMovementFilter] = useState<'all' | 'purchase' | 'sale' | 'adjustment'>('all');
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = useState(false);

  const lowStockItems = lowStockApiItems || items?.filter((item) => item.is_low_stock) || [];
  const totalStockValue = items?.reduce((total, item) => total + Number(item.current_stock || 0) * Number(item.cost_price || 0), 0) || 0;
  const purchaseCount = movements?.filter((movement) => movement.movement_type === 'purchase').length || 0;
  const openPurchaseOrders = purchaseOrders?.filter((order) => ['draft', 'ordered'].includes(order.status)).length || 0;
  const unpaidPurchaseOrders = purchaseOrders?.filter((order) => order.status === 'received' && order.payment_status === 'unpaid').length || 0;
  const saleCount = movements?.filter((movement) => movement.movement_type === 'sale').length || 0;
  const filteredMovements =
    movements?.filter((movement) => {
      if (movementFilter === 'all') return true;
      if (movementFilter === 'adjustment') return ['waste', 'adjustment_in', 'adjustment_out'].includes(movement.movement_type);
      return movement.movement_type === movementFilter;
    }) || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'low-stock', label: 'Low Stock', count: lowStockItems.length },
    { id: 'items', label: 'Items', count: items?.length || 0 },
    { id: 'vendors', label: 'Vendors', count: vendors?.length || 0 },
    { id: 'purchase-orders', label: 'Purchase Orders', count: openPurchaseOrders + unpaidPurchaseOrders },
    { id: 'receive', label: 'Receive' },
    { id: 'movements', label: 'Movements', count: movements?.length || 0 },
    { id: 'adjust', label: 'Adjust' },
  ];

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate(vendorForm, {
      onSuccess: () => {
        setVendorForm(emptyVendor);
        setIsVendorModalOpen(false);
      },
    });
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(itemForm, {
      onSuccess: () => {
        setItemForm(emptyItem);
        setIsItemModalOpen(false);
      },
    });
  };

  const handleReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    receiveStock.mutate(
      { ...receiveForm, vendor: receiveForm.vendor || undefined },
      {
        onSuccess: () => {
          setReceiveForm(emptyReceive);
          setIsReceiveModalOpen(false);
        },
      },
    );
  };

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    adjustStock.mutate(
      { ...adjustmentForm, unit_cost: adjustmentForm.unit_cost || undefined },
      {
        onSuccess: () => {
          setAdjustmentForm(emptyAdjustment);
          setIsAdjustModalOpen(false);
        },
      },
    );
  };

  const handleCreatePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    createPurchaseOrder.mutate(
      {
        ...purchaseOrderForm,
        expected_date: purchaseOrderForm.expected_date || undefined,
        lines: purchaseOrderForm.lines.filter((line) => line.item && line.quantity && line.unit_cost),
      },
      {
        onSuccess: () => {
          setPurchaseOrderForm(emptyPurchaseOrder);
          setIsPurchaseOrderModalOpen(false);
        },
      },
    );
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'receive') {
      setIsReceiveModalOpen(true);
      return;
    }
    if (tabId === 'adjust') {
      setIsAdjustModalOpen(true);
      return;
    }
    setActiveTab(tabId);
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
          <CompactTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
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

      {activeTab === 'low-stock' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Reorder Alerts</h2>
                <p className="text-sm text-slate-500">Items at or below reorder level, ready for purchase receiving.</p>
              </div>
              <button
                onClick={() => {
                  const firstItem = lowStockItems[0];
                  if (firstItem) {
                    setReceiveForm({ ...emptyReceive, item: firstItem.id, unit_cost: firstItem.cost_price });
                  }
                  setIsReceiveModalOpen(true);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={!lowStockItems.length}
              >
                Receive selected
              </button>
            </div>
            <InventoryItemsTable items={lowStockItems} currency={settings?.currency} />
          </div>
          <aside className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Buying Notes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Use the Receive tab to record actual purchase quantities and invoice/reference numbers.</p>
              <p>Receiving stock updates the item cost price and creates the accounting purchase journal automatically.</p>
              <p>Restaurant sales deduct linked inventory after POS settlement.</p>
            </div>
          </aside>
        </section>
      )}

      {activeTab === 'items' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => setIsItemModalOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Add item
            </button>
          </div>
            <InventoryItemsTable items={items || []} currency={settings?.currency} />
        </section>
      )}

      {activeTab === 'vendors' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => setIsVendorModalOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Add vendor
            </button>
          </div>
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
        </section>
      )}

      {activeTab === 'purchase-orders' && (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="font-bold text-slate-900">Purchase Orders</h2>
              <button type="button" onClick={() => setIsPurchaseOrderModalOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Create PO
              </button>
              </div>
              <p className="text-sm text-slate-500">Order, receive stock, then pay vendor bills from one queue.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr><th className="py-3 pr-4">PO</th><th className="py-3 pr-4">Vendor</th><th className="py-3 pr-4">Lines</th><th className="py-3 pr-4 text-right">Total</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(purchaseOrders || []).map((order) => (
                    <tr key={order.id} className="align-top">
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {order.po_number}
                        <span className="block text-xs font-normal text-slate-500">{order.reference || order.order_date}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{order.vendor_details?.name || '-'}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {order.lines.map((line) => `${line.item_details?.name || 'Item'} x ${Number(line.quantity).toLocaleString()}`).join(', ')}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-900">{formatMoney(order.total_amount, settings?.currency)}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{order.status}</span>
                        <span className={`ml-1 rounded-full px-2 py-1 text-xs font-medium ${order.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{order.payment_status}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex justify-end gap-2">
                          {order.status === 'draft' && (
                            <button onClick={() => purchaseOrderAction.mutate({ purchaseOrderId: order.id, action: 'submit' })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Order</button>
                          )}
                          {['draft', 'ordered'].includes(order.status) && (
                            <>
                              <button onClick={() => purchaseOrderAction.mutate({ purchaseOrderId: order.id, action: 'receive' })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Receive</button>
                              <button onClick={() => purchaseOrderAction.mutate({ purchaseOrderId: order.id, action: 'cancel' })} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">Cancel</button>
                            </>
                          )}
                          {order.status === 'received' && order.payment_status === 'unpaid' && (
                            <>
                              <button onClick={() => purchaseOrderAction.mutate({ purchaseOrderId: order.id, action: 'pay', payload: { payment_method: 'cash' } })} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Pay cash</button>
                              <button onClick={() => purchaseOrderAction.mutate({ purchaseOrderId: order.id, action: 'pay', payload: { payment_method: 'bank' } })} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900">Pay bank</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(purchaseOrders || []).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No purchase orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {purchaseOrderAction.isError && <p className="mt-3 text-sm text-red-600">Purchase order action failed.</p>}
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
          {receiveStock.isError && <p className="text-sm text-red-600 md:col-span-2">Could not receive stock. Check item, quantity, and unit cost.</p>}
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
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Movement History</h2>
              <p className="text-sm text-slate-500">Filter purchases, POS deductions, and stock adjustments.</p>
            </div>
            <div className="flex overflow-x-auto rounded-2xl bg-emerald-50 p-1 text-sm">
              {[
                ['all', 'All'],
                ['purchase', 'Purchases'],
                ['sale', 'Sales'],
                ['adjustment', 'Adjustments'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMovementFilter(id as typeof movementFilter)}
                  className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
                    movementFilter === id ? 'bg-white text-[#1F5E3B] shadow-sm' : 'text-emerald-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-3 pr-4">Item</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4">Value</th><th className="py-3 pr-4">Reference</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.map((movement) => (
                  <tr key={movement.id}><td className="py-3 pr-4 font-medium text-slate-900">{movement.item_details?.name}</td><td className="py-3 pr-4">{movement.movement_type}</td><td className="py-3 pr-4">{Number(movement.quantity).toLocaleString()} {movement.item_details?.unit}</td><td className="py-3 pr-4">{formatMoney(movement.total_cost, settings?.currency)}</td><td className="py-3 pr-4">{movement.reference || '-'}</td></tr>
                ))}
                {filteredMovements.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No stock movements match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isItemModalOpen && (
        <ActionModal title="Add inventory item" onClose={() => setIsItemModalOpen(false)}>
          <form onSubmit={handleCreateItem}>
            <div className="grid gap-3 md:grid-cols-2">
              <input placeholder="SKU" value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase().replace(/\s+/g, '-') })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input placeholder="Item Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input placeholder="Category" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value as InventoryItem['unit'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Cost Price" value={itemForm.cost_price} onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" step="0.001" placeholder="Reorder Level" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsItemModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={createItem.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">Create item</button>
            </div>
          </form>
        </ActionModal>
      )}

      {isVendorModalOpen && (
        <ActionModal title="Add vendor" onClose={() => setIsVendorModalOpen(false)}>
          <form onSubmit={handleCreateVendor}>
            <div className="grid gap-3 md:grid-cols-2">
              <input placeholder="Vendor Name" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input type="email" placeholder="Email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input placeholder="Phone" value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input placeholder="Tax Number" value={vendorForm.tax_number} onChange={(e) => setVendorForm({ ...vendorForm, tax_number: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea placeholder="Address" value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsVendorModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={createVendor.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">Create vendor</button>
            </div>
          </form>
        </ActionModal>
      )}

      {isReceiveModalOpen && (
        <ActionModal title="Receive stock" onClose={() => setIsReceiveModalOpen(false)}>
          <form onSubmit={handleReceiveStock}>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsReceiveModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={receiveStock.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">Receive stock</button>
            </div>
            {receiveStock.isError && <p className="mt-3 text-sm text-red-600">Could not receive stock. Check item, quantity, and unit cost.</p>}
          </form>
        </ActionModal>
      )}

      {isAdjustModalOpen && (
        <ActionModal title="Adjust stock" onClose={() => setIsAdjustModalOpen(false)}>
          <form onSubmit={handleAdjustStock}>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsAdjustModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={adjustStock.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">Save adjustment</button>
            </div>
          </form>
        </ActionModal>
      )}

      {isPurchaseOrderModalOpen && (
        <ActionModal title="Create purchase order" onClose={() => setIsPurchaseOrderModalOpen(false)}>
          <form onSubmit={handleCreatePurchaseOrder}>
            <div className="grid gap-3">
              <select value={purchaseOrderForm.vendor} onChange={(e) => setPurchaseOrderForm({ ...purchaseOrderForm, vendor: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                <option value="">Select vendor</option>
                {vendors?.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
              <input type="date" value={purchaseOrderForm.expected_date} onChange={(e) => setPurchaseOrderForm({ ...purchaseOrderForm, expected_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input placeholder="Reference" value={purchaseOrderForm.reference} onChange={(e) => setPurchaseOrderForm({ ...purchaseOrderForm, reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea placeholder="Notes" value={purchaseOrderForm.notes} onChange={(e) => setPurchaseOrderForm({ ...purchaseOrderForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              {purchaseOrderForm.lines.map((line, index) => (
                <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="grid gap-2">
                    <select
                      value={line.item}
                      onChange={(e) => {
                        const item = items?.find((record) => record.id === e.target.value);
                        const nextLines = [...purchaseOrderForm.lines];
                        nextLines[index] = { ...line, item: e.target.value, unit_cost: line.unit_cost || item?.cost_price || '' };
                        setPurchaseOrderForm({ ...purchaseOrderForm, lines: nextLines });
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select item</option>
                      {items?.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.001"
                        placeholder="Quantity"
                        value={line.quantity}
                        onChange={(e) => {
                          const nextLines = [...purchaseOrderForm.lines];
                          nextLines[index] = { ...line, quantity: e.target.value };
                          setPurchaseOrderForm({ ...purchaseOrderForm, lines: nextLines });
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        required
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Unit cost"
                        value={line.unit_cost}
                        onChange={(e) => {
                          const nextLines = [...purchaseOrderForm.lines];
                          nextLines[index] = { ...line, unit_cost: e.target.value };
                          setPurchaseOrderForm({ ...purchaseOrderForm, lines: nextLines });
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <input
                      placeholder="Line notes"
                      value={line.notes}
                      onChange={(e) => {
                        const nextLines = [...purchaseOrderForm.lines];
                        nextLines[index] = { ...line, notes: e.target.value };
                        setPurchaseOrderForm({ ...purchaseOrderForm, lines: nextLines });
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setPurchaseOrderForm({ ...purchaseOrderForm, lines: [...purchaseOrderForm.lines, { item: '', quantity: '', unit_cost: '', notes: '' }] })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Add line
              </button>
              <button type="button" onClick={() => setIsPurchaseOrderModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createPurchaseOrder.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save PO
              </button>
            </div>
            {createPurchaseOrder.isError && <p className="mt-3 text-sm text-red-600">Could not create purchase order.</p>}
          </form>
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
