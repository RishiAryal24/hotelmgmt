export interface OTAChannel {
  id: number;
  name: string;
  code: string;
  provider: 'zodomus' | 'booking_com' | 'expedia' | 'airbnb' | 'manual';
  api_key?: string;
  api_secret?: string;
  base_url: string;
  is_active: boolean;
  sync_direction: 'push' | 'pull' | 'both';
  last_sync?: string | null;
  settings: Record<string, any>;
  room_type_mapping_count?: number;
  rate_plan_mapping_count?: number;
  api_key_configured?: boolean;
  api_secret_configured?: boolean;
}

export interface OTAProviderActionResult {
  status: string;
  property_id?: string;
  provider_response?: Record<string, any>;
  message?: string;
  error?: string;
}

export interface OTARoomTypeMapping {
  id: number;
  channel: number;
  room_type: string;
  external_room_type_id: string;
  external_room_type_name: string;
  is_active: boolean;
  room_type_name?: string;
  room_type_code?: string;
  channel_code?: string;
}

export interface OTARatePlanMapping {
  id: number;
  channel: number;
  rate_plan: string;
  external_rate_plan_id: string;
  external_rate_plan_name: string;
  is_active: boolean;
  rate_plan_name?: string;
  room_type_code?: string;
  channel_code?: string;
}

export interface OTASyncJob {
  id: number;
  channel: number;
  channel_name?: string;
  channel_code?: string;
  sync_type: 'availability_push' | 'rate_push' | 'booking_pull' | 'webhook';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  started_at?: string | null;
  completed_at?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  summary: Record<string, any>;
  error_message: string;
  created_at: string;
}

export interface OTAWebhookEvent {
  id: number;
  channel: number;
  channel_name?: string;
  channel_code?: string;
  external_event_id: string;
  event_type: string;
  status: 'received' | 'processed' | 'duplicate' | 'failed';
  payload: Record<string, any>;
  processed_at?: string | null;
  error_message: string;
  created_at: string;
}

export interface OTAReservationImport {
  id: number;
  channel: number;
  channel_name?: string;
  channel_code?: string;
  webhook_event?: number | null;
  booking?: string | null;
  booking_reference?: string | null;
  external_reservation_id: string;
  external_room_type_id: string;
  external_rate_plan_id: string;
  status: 'pending' | 'conflict' | 'accepted' | 'rejected' | 'canceled';
  conflict_type: 'none' | 'duplicate' | 'missing_mapping' | 'no_room_available' | 'invalid_dates' | 'guest_blacklisted' | 'modification_review' | 'cancellation_review';
  conflict_message: string;
  guest_first_name: string;
  guest_last_name: string;
  guest_email: string;
  guest_phone: string;
  check_in_date?: string | null;
  check_out_date?: string | null;
  number_of_guests: number;
  total_amount?: string | null;
  currency: string;
  raw_payload: Record<string, any>;
  normalized_payload: Record<string, any>;
  reviewed_by?: string | null;
  reviewed_by_email?: string;
  reviewed_at?: string | null;
  review_notes: string;
  created_at: string;
  updated_at: string;
}
