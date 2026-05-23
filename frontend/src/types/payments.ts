export type PaymentSourceModule = 'guest_folio' | 'restaurant_order' | 'purchase_order' | 'manual';
export type PaymentProvider = 'manual' | 'mock' | 'khalti' | 'esewa' | 'stripe';
export type PaymentIntentStatus = 'draft' | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled';
export type PaymentSettlementStatus = 'pending' | 'settled' | 'skipped' | 'failed';
export type PaymentFollowUpStatus = 'none' | 'open' | 'in_review' | 'resolved';

export interface PaymentIntent {
  id: string;
  source_module: PaymentSourceModule;
  source_id: string;
  amount: string;
  currency: string;
  provider: PaymentProvider;
  provider_reference: string;
  idempotency_key: string;
  status: PaymentIntentStatus;
  description: string;
  metadata: Record<string, unknown>;
  callback_payload: Record<string, unknown>;
  provider_payload: Record<string, unknown>;
  settlement_status: PaymentSettlementStatus;
  settlement_message: string;
  settled_at: string | null;
  follow_up_status: PaymentFollowUpStatus;
  follow_up_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  failure_message: string;
  created_by: string | null;
  created_by_details?: {
    id: string;
    email: string;
    full_name: string;
  } | null;
  succeeded_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSummaryRow {
  provider?: PaymentProvider;
  status?: PaymentIntentStatus;
  settlement_status?: PaymentSettlementStatus;
  follow_up_status?: PaymentFollowUpStatus;
  count: number;
  amount: string;
}

export interface PaymentReconciliationSummary {
  count: number;
  amount: string;
  attention_count: number;
  by_provider: PaymentSummaryRow[];
  by_status: PaymentSummaryRow[];
  by_settlement: PaymentSummaryRow[];
  by_follow_up: PaymentSummaryRow[];
}

export interface PaymentIntentCreatePayload {
  source_module: PaymentSourceModule;
  source_id: string;
  amount: string;
  currency: string;
  provider: PaymentProvider;
  idempotency_key: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
