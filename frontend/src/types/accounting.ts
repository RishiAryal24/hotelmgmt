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
