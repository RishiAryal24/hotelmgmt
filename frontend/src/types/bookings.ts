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

export interface RatePlan {
  id: string;
  name: string;
  room_type: string;
  room_type_name?: string;
  base_rate: string;
  is_active: boolean;
  valid_from: string;
  valid_to: string;
  conditions: Record<string, any>;
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  phone: string;
  address: string;
  id_type: string;
  id_number: string;
  vip_level: 'standard' | 'vip' | 'blacklist';
  preferences: Record<string, any>;
  notes: string;
  marketing_opt_in: boolean;
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
  checkout_readiness?: CheckoutReadiness;
}

export interface CheckoutReadiness {
  is_ready: boolean;
  blockers: string[];
  warnings: string[];
  folio_id: string;
  folio_status: string;
  has_open_folio: boolean;
  has_room_charge_line: boolean;
  room_charge_line_count: number;
  restaurant_posting_count: number;
  facility_posting_count: number;
  unresolved_posting_count: number;
  unresolved_postings: {
    id: string;
    order_number: string;
    status: string;
    grand_total: string;
  }[];
  total_due: string;
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
  cashier_shift?: string | null;
  guest_name: string;
  room_number: string;
  booking_status: Booking['status'];
  check_in_date: string;
  check_out_date: string;
  lines: GuestFolioLine[];
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

export interface GuestFolioLine {
  id: string;
  folio: string;
  source_module: string;
  source_id: string;
  description: string;
  amount: string;
}

export interface FacilityAmenity {
  id: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface FacilityService {
  id: string;
  name: string;
  code: string;
  amenity?: string | null;
  amenity_details?: FacilityAmenity | null;
  category: 'pool' | 'spa' | 'laundry' | 'minibar' | 'extra_bed' | 'transport' | 'banquet' | 'other';
  category_display?: string;
  default_price: string;
  description: string;
  is_active: boolean;
}

export interface GuestHistory {
  guest: Guest;
  summary: {
    total_bookings: number;
    completed_stays: number;
    active_bookings: number;
    canceled_bookings: number;
    open_folios: number;
    lifetime_value: string;
    last_stay?: string | null;
    next_arrival?: string | null;
  };
  bookings: Booking[];
  folios: GuestFolio[];
}

export interface GuestCommunication {
  id: string;
  guest: string;
  booking?: string | null;
  channel: 'email' | 'phone' | 'sms' | 'whatsapp' | 'in_person' | 'note';
  direction: 'inbound' | 'outbound' | 'internal';
  subject: string;
  message: string;
  status: 'logged' | 'sent' | 'failed' | 'follow_up';
  occurred_at: string;
  created_at: string;
  guest_name?: string;
  booking_reference?: string;
  created_by_email?: string;
}

export interface GuestFollowUpReminder {
  id: string;
  guest: string;
  booking?: string | null;
  reminder_type: 'arrival' | 'vip' | 'payment' | 'post_stay' | 'custom';
  status: 'open' | 'snoozed' | 'completed' | 'canceled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  message: string;
  due_at: string;
  snoozed_until?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  follow_up_notes: string;
  guest_details?: Guest;
  booking_details?: Booking | null;
  assigned_to_email?: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
}
