export interface RoomType {
  id: string;
  name: string;
  code: string;
  base_occupancy: number;
  max_occupancy: number;
  base_rate: string;
  description: string;
  amenities: Record<string, any>;
  is_active: boolean;
}

export interface Room {
  id: string;
  room_number: string;
  room_type: string;
  room_type_name: string;
  room_type_details?: RoomType;
  capacity: number;
  price_per_night: string;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  description: string;
  amenities: Record<string, any>;
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  id_type: string;
  id_number: string;
}

export interface Booking {
  id: string;
  room: string;
  guest: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  total_amount: string;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
  special_requests: string;
  room_details?: Room;
  guest_details?: Guest;
  folio_details?: GuestFolio | null;
}

export interface GuestFolio {
  id: string;
  booking: string;
  folio_number: string;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  grand_total: string;
  status: 'open' | 'paid' | 'void';
  payment_method: '' | 'cash' | 'card' | 'wallet' | 'bank_transfer';
  paid_amount: string;
  paid_at?: string | null;
  guest_name: string;
  room_number: string;
  booking_status: Booking['status'];
  check_in_date: string;
  check_out_date: string;
  lines: GuestFolioLine[];
}

export interface GuestFolioLine {
  id: string;
  folio: string;
  source_module: string;
  source_id: string;
  description: string;
  amount: string;
}
