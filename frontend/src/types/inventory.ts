export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_number: string;
  is_active: boolean;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: 'pcs' | 'kg' | 'g' | 'l' | 'ml' | 'pack' | 'box' | 'bottle';
  cost_price: string;
  reorder_level: string;
  current_stock: string;
  is_low_stock: boolean;
  is_active: boolean;
}

export interface StockMovement {
  id: string;
  item: string;
  item_details?: InventoryItem;
  vendor: string | null;
  vendor_details?: Vendor | null;
  movement_type: 'purchase' | 'sale' | 'waste' | 'adjustment_in' | 'adjustment_out';
  quantity: string;
  unit_cost: string;
  total_cost: string;
  reference: string;
  notes: string;
  source_module: string;
  source_id: string;
  occurred_at: string;
  created_by: string | null;
}

export interface PurchaseOrderLine {
  id?: string;
  purchase_order?: string;
  item: string;
  item_details?: InventoryItem;
  quantity: string;
  unit_cost: string;
  total_cost?: string;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor: string;
  vendor_details?: Vendor;
  status: 'draft' | 'ordered' | 'received' | 'canceled';
  payment_status: 'unpaid' | 'paid';
  order_date: string;
  expected_date?: string | null;
  received_at?: string | null;
  paid_at?: string | null;
  payment_method: '' | 'cash' | 'bank';
  reference: string;
  notes: string;
  created_by: string | null;
  total_amount: string;
  lines: PurchaseOrderLine[];
}
