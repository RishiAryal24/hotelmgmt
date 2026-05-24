import { InventoryItem } from './inventory';

export interface MenuCategory {
  id: string;
  name: string;
  code: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category: string;
  category_details?: MenuCategory;
  inventory_item: string | null;
  inventory_item_details?: InventoryItem | null;
  inventory_quantity_per_unit: string;
  name: string;
  sku: string;
  description: string;
  image: string | null;
  price: string;
  preparation_station: 'kitchen' | 'bar' | 'pastry' | 'counter';
  preparation_time_minutes: number;
  is_available: boolean;
  is_active: boolean;
  modifier_groups?: string[];
  modifier_groups_details?: MenuModifierGroup[];
  recipe_ingredients?: MenuRecipeIngredient[];
  recipe_cost?: string;
  gross_margin?: string;
  gross_margin_percent?: string;
}

export interface MenuModifier {
  id: string;
  group: string;
  group_name?: string;
  name: string;
  code: string;
  price_delta: string;
  display_order: number;
  is_active: boolean;
}

export interface MenuModifierGroup {
  id: string;
  name: string;
  code: string;
  selection_type: 'single' | 'multiple';
  is_required: boolean;
  display_order: number;
  is_active: boolean;
  menu_items: string[];
  modifiers: MenuModifier[];
}

export interface MenuRecipeIngredient {
  id: string;
  menu_item: string;
  item: string;
  item_details?: InventoryItem;
  quantity: string;
  notes: string;
  line_cost: string;
}

export interface RestaurantTable {
  id: string;
  table_number: string;
  section: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'inactive';
  is_active: boolean;
}

export interface RestaurantChargeConfig {
  id: string;
  code: string;
  name: string;
  tax_rate: string;
  service_charge_rate: string;
  apply_tax: boolean;
  apply_service_charge: boolean;
  is_active: boolean;
}

export interface RestaurantOrderLine {
  id: string;
  order: string;
  menu_item: string;
  menu_item_details?: MenuItem;
  modifiers: string[];
  modifier_details?: MenuModifier[];
  quantity: number;
  unit_price: string;
  line_total: string;
  notes: string;
  status: 'ordered' | 'preparing' | 'ready' | 'served' | 'cancelled';
}

export interface RestaurantOrderPayment {
  id: string;
  order: string;
  payment_method: RestaurantOrder['payment_method'];
  amount: string;
  cashier_shift?: string | null;
  paid_at: string;
  payment_reference?: PaymentReference | null;
}

export interface PaymentReference {
  id: string;
  provider: string;
  provider_reference: string;
  idempotency_key: string;
  status: string;
  settlement_status: string;
  settled_at: string | null;
}

export interface RestaurantReceiptReprint {
  id: string;
  order: string;
  receipt_number: string;
  reprinted_by: string | null;
  reprinted_by_email?: string;
  cashier_shift: string | null;
  reprinted_at: string;
  reason: string;
}

export interface RestaurantOrder {
  id: string;
  table: string | null;
  table_details?: RestaurantTable | null;
  room_booking: string | null;
  room_number?: string;
  guest_name?: string;
  order_number: string;
  order_type: 'dine_in' | 'takeaway' | 'room_service';
  status: 'draft' | 'sent_to_kitchen' | 'preparing' | 'served' | 'paid' | 'cancelled';
  waiter: string | null;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  discount_total: string;
  grand_total: string;
  paid_amount: string;
  payment_method: '' | 'cash' | 'card' | 'wallet' | 'room_posting' | 'bank_transfer' | 'split';
  paid_at: string | null;
  receipt_number: string | null;
  receipt_issued_at: string | null;
  receipt_reprint_count: number;
  notes: string;
  lines: RestaurantOrderLine[];
  payments: RestaurantOrderPayment[];
  receipt_reprints?: RestaurantReceiptReprint[];
  payment_reference?: PaymentReference | null;
}

export interface RestaurantOrderApproval {
  id: string;
  order: string;
  order_details?: RestaurantOrder;
  line: string | null;
  line_details?: RestaurantOrderLine | null;
  action_type: 'void_line' | 'discount' | 'complimentary';
  action_type_display?: string;
  status: 'pending' | 'approved' | 'rejected';
  status_display?: string;
  discount_amount: string;
  reason: string;
  requested_by: string | null;
  requested_by_email?: string;
  decided_by: string | null;
  decided_by_email?: string;
  decided_at: string | null;
  decision_notes: string;
  created_at: string;
}

export interface KitchenTicketLine {
  id: string;
  ticket: string;
  order_line: string;
  order_line_details?: RestaurantOrderLine;
  quantity: number;
  status: RestaurantOrderLine['status'];
}

export interface KitchenTicket {
  id: string;
  order: string;
  order_details?: RestaurantOrder;
  ticket_number: string;
  station: string;
  status: 'open' | 'preparing' | 'ready' | 'served';
  lines: KitchenTicketLine[];
  created_at: string;
  updated_at: string;
}

export interface CashierShiftTotals {
  restaurant_cash: string;
  folio_cash: string;
  facility_charges: string;
  opening_cash: string;
  cash_sales: string;
  expected_cash: string;
  expected_card: string;
  expected_wallet: string;
  expected_bank_transfer: string;
  expected_room_posting: string;
  expected_total: string;
  actual_cash: string;
  actual_card: string;
  actual_wallet: string;
  actual_bank_transfer: string;
  actual_room_posting: string;
  cash_variance: string;
  card_variance: string;
  wallet_variance: string;
  bank_transfer_variance: string;
  room_posting_variance: string;
  total_variance: string;
  sales_total: string;
  payment_breakdown: CashierShiftPaymentBreakdown[];
  payment_rows: CashierShiftPaymentRow[];
}

export interface CashierShiftPaymentBreakdown {
  payment_method: 'cash' | 'card' | 'wallet' | 'bank_transfer' | 'room_posting';
  label: string;
  restaurant_total: string;
  folio_total: string;
  total: string;
  actual_total?: string | null;
  variance?: string | null;
}

export interface CashierShiftPaymentRow {
  source: 'restaurant' | 'folio';
  reference: string;
  provider: string;
  provider_reference: string;
  guest_or_table: string;
  payment_method: RestaurantOrder['payment_method'];
  amount: string;
  paid_at: string | null;
}

export interface CashierCounter {
  id: string;
  name: string;
  code: string;
  outlet_type: 'reception' | 'restaurant' | 'pool' | 'spa' | 'bar' | 'banquet' | 'other';
  is_active: boolean;
  notes: string;
}

export interface CashierShift {
  id: string;
  counter: string;
  counter_details?: CashierCounter;
  cashier: string;
  cashier_email?: string;
  business_date: string;
  status: 'open' | 'closed';
  opening_cash: string;
  expected_cash: string;
  expected_card: string;
  expected_wallet: string;
  expected_bank_transfer: string;
  expected_room_posting: string;
  expected_total: string;
  actual_cash: string;
  actual_card: string;
  actual_wallet: string;
  actual_bank_transfer: string;
  actual_room_posting: string;
  cash_variance: string;
  card_variance: string;
  wallet_variance: string;
  bank_transfer_variance: string;
  room_posting_variance: string;
  total_variance: string;
  opened_at: string;
  closed_at: string | null;
  notes: string;
  live_totals?: CashierShiftTotals;
}

export interface POSManagerAnalytics {
  date_from: string | null;
  date_to: string | null;
  summary: {
    orders: number;
    gross_sales: string;
    tax_total: string;
    service_charge_total: string;
    discount_total: string;
    net_sales: string;
    average_check: string;
  };
  payments: Array<{
    payment_method: RestaurantOrder['payment_method'];
    count: number;
    amount: string;
  }>;
  daily_sales: Array<{
    date: string;
    orders: number;
    net_sales: string;
  }>;
  top_items: Array<{
    item_id: string;
    item_name: string;
    quantity: number;
    net_sales: string;
  }>;
  table_performance: Array<{
    label: string;
    orders: number;
    net_sales: string;
  }>;
  exceptions: {
    pending_approvals: number;
    approved_voids: number;
    discount_approvals: number;
    complimentary_approvals: number;
    receipt_reprints: number;
    closed_shifts: number;
    total_variance: string;
  };
}
