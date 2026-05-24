import { Vendor } from './inventory';

export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent: string | null;
  is_active: boolean;
}

export interface FiscalPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  closed_by_details?: {
    id: string;
    email: string;
    full_name: string;
  } | null;
}

export interface TaxRate {
  id: string;
  code: string;
  name: string;
  tax_type: 'sales' | 'purchase' | 'both';
  rate: string;
  account: string;
  account_details?: Account;
  description: string;
  is_default: boolean;
  is_active: boolean;
}

export interface TaxRateCreateInput {
  code: string;
  name: string;
  tax_type: TaxRate['tax_type'];
  rate: string;
  account: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export interface VendorBillLine {
  id?: string;
  vendor_bill?: string;
  account: string;
  account_details?: Account;
  tax_rate?: string | null;
  tax_rate_details?: TaxRate | null;
  description: string;
  amount: string;
  tax_amount: string;
  line_total?: string;
}

export interface VendorBill {
  id: string;
  bill_number: string;
  vendor: string;
  vendor_details?: Vendor;
  invoice_number: string;
  bill_date: string;
  due_date: string | null;
  status: 'draft' | 'posted' | 'void';
  subtotal: string;
  tax_total: string;
  total_amount: string;
  notes: string;
  journal_entry: string | null;
  journal_entry_number?: string | null;
  posted_by: string | null;
  posted_at: string | null;
  lines: VendorBillLine[];
}

export interface VendorBillCreateInput {
  vendor: string;
  invoice_number?: string;
  bill_date?: string;
  due_date?: string;
  notes?: string;
  lines: Array<{
    account: string;
    tax_rate?: string | null;
    description: string;
    amount: string;
    tax_amount?: string;
  }>;
}

export interface NightAuditSchedule {
  id: string;
  enabled: boolean;
  run_time: string;
  timezone: string;
  last_run_at: string | null;
  notes: string;
}

export interface NightAuditRun {
  id: string;
  audit_date: string;
  status: 'completed' | 'completed_with_exceptions' | 'failed';
  started_at: string;
  completed_at: string | null;
  triggered_by: string | null;
  triggered_by_details?: {
    id: string;
    email: string;
    full_name: string;
  } | null;
  checked_in_bookings: number;
  folios_reviewed: number;
  room_charge_lines_created: number;
  open_folios: number;
  paid_folios: number;
  exceptions: Array<{
    type: string;
    booking_id?: string;
    folio_id?: string;
    message: string;
  }>;
  summary: Record<string, number | string>;
  error_message: string;
}

export interface JournalLine {
  id: string;
  journal_entry: string;
  account: string;
  account_details?: Account;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalLineCreateInput {
  account: string;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalEntryCreateInput {
  entry_date?: string;
  description: string;
  source_module: string;
  source_id: string;
  status: 'draft' | 'posted' | 'void';
  lines: JournalLineCreateInput[];
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_module: string;
  source_id: string;
  status: 'draft' | 'posted' | 'void';
  fiscal_period: string | null;
  fiscal_period_name?: string | null;
  posted_by: string | null;
  posted_at: string;
  total_debit: string;
  total_credit: string;
  lines: JournalLine[];
}

export interface FiscalPeriodCreateInput {
  name: string;
  start_date: string;
  end_date: string;
  status?: 'open' | 'closed';
}

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: Account['account_type'];
  debit: string;
  credit: string;
  balance: string;
  debit_balance: string;
  credit_balance: string;
}

export interface TrialBalanceReport {
  date_from: string | null;
  date_to: string | null;
  rows: TrialBalanceRow[];
  totals: {
    debit_balance: string;
    credit_balance: string;
  };
}

export interface ProfitAndLossRow extends TrialBalanceRow {
  amount: string;
}

export interface ProfitAndLossReport {
  date_from: string;
  date_to: string;
  revenue: ProfitAndLossRow[];
  expenses: ProfitAndLossRow[];
  totals: {
    revenue: string;
    expenses: string;
    net_income: string;
  };
}

export interface BalanceSheetRow extends TrialBalanceRow {
  amount: string;
}

export interface BalanceSheetReport {
  as_of: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    asset: string;
    liability: string;
    equity: string;
    liabilities_and_equity: string;
  };
}
