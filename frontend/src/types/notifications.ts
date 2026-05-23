export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  subject_template: string;
  body_template: string;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface NotificationEvent {
  id: string;
  template?: string | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app' | 'system';
  status: 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'canceled';
  workflow_status: 'open' | 'acknowledged' | 'resolved';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  event_type: string;
  module: string;
  subject: string;
  message: string;
  recipient_email: string;
  recipient_phone: string;
  payload: Record<string, any>;
  provider: string;
  provider_message_id: string;
  error_message: string;
  attempts: number;
  next_retry_at?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  failed_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  follow_up_notes: string;
  created_at: string;
  updated_at: string;
  template_details?: NotificationTemplate | null;
  recipient_user_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  created_by_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  acknowledged_by_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  resolved_by_details?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}
