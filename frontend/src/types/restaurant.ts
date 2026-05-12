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
  price: string;
  preparation_station: 'kitchen' | 'bar' | 'pastry' | 'counter';
  preparation_time_minutes: number;
  is_available: boolean;
  is_active: boolean;
}

export interface RestaurantTable {
  id: string;
  table_number: string;
  section: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'inactive';
  is_active: boolean;
}

export interface RestaurantOrderLine {
  id: string;
  order: string;
  menu_item: string;
  menu_item_details?: MenuItem;
  quantity: number;
  unit_price: string;
  line_total: string;
  notes: string;
  status: 'ordered' | 'preparing' | 'ready' | 'served' | 'cancelled';
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
  payment_method: '' | 'cash' | 'card' | 'wallet' | 'room_posting' | 'bank_transfer';
  paid_at: string | null;
  notes: string;
  lines: RestaurantOrderLine[];
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
}
