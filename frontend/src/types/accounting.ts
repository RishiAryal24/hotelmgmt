export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent: string | null;
  is_active: boolean;
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
  posted_by: string | null;
  posted_at: string;
  total_debit: string;
  total_credit: string;
  lines: JournalLine[];
}

