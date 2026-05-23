import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import {
  useAccounts,
  useBalanceSheet,
  useCreateFiscalPeriod,
  useCreateJournalEntry,
  useFiscalPeriodAction,
  useFiscalPeriods,
  useJournalEntries,
  useProfitAndLoss,
  useSeedAccounts,
  useTrialBalance,
} from '../hooks/accounting';
import { usePermissions } from '../hooks/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { FiscalPeriod, JournalEntry } from '../types/accounting';

type JournalLineInput = {
  account: string;
  description: string;
  debit: string;
  credit: string;
};

type JournalEntryForm = {
  entry_date: string;
  description: string;
  source_module: string;
  source_id: string;
  status: 'draft' | 'posted' | 'void';
  lines: JournalLineInput[];
};

type FiscalPeriodForm = {
  name: string;
  start_date: string;
  end_date: string;
};

type AccountingTab = 'summary' | 'statements' | 'journals' | 'fiscal_periods' | 'accounts' | 'create';
type JournalSourceFilter = 'all' | 'guest_folio' | 'restaurant_order' | 'inventory_purchase' | 'manual';
type JournalStatusFilter = 'all' | JournalEntry['status'];

const emptyJournalEntry: JournalEntryForm = {
  entry_date: '',
  description: '',
  source_module: '',
  source_id: '',
  status: 'posted',
  lines: [
    { account: '', description: '', debit: '', credit: '' },
    { account: '', description: '', debit: '', credit: '' },
  ],
};

const emptyFiscalPeriod: FiscalPeriodForm = {
  name: '',
  start_date: '',
  end_date: '',
};

const sourceLabels: Record<string, string> = {
  guest_folio: 'Room Folio',
  restaurant_order: 'Restaurant',
  inventory_purchase: 'Inventory Purchase',
  manual: 'Manual',
};

const accountBalance = (entries: JournalEntry[] | undefined, code: string, normalSide: 'debit' | 'credit') => {
  const total =
    entries
      ?.filter((entry) => entry.status === 'posted')
      .flatMap((entry) => entry.lines)
      .filter((line) => line.account_details?.code === code)
      .reduce((sum, line) => {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        return sum + (normalSide === 'debit' ? debit - credit : credit - debit);
      }, 0) || 0;
  return total;
};

const accountTypeBalance = (entries: JournalEntry[] | undefined, accountType: string) => {
  return (
    entries
      ?.filter((entry) => entry.status === 'posted')
      .flatMap((entry) => entry.lines)
      .filter((line) => line.account_details?.account_type === accountType)
      .reduce((sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0) || 0
  );
};

const StatementSection = ({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: { account_code: string; account_name: string; amount: string }[];
  currency?: string;
}) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <div className="mt-2 space-y-2">
      {rows.length ? (
        rows.map((row) => (
          <div key={row.account_code} className="flex items-center justify-between text-sm">
            <span>{row.account_name}</span>
            <span className="font-medium text-slate-800">{formatMoney(row.amount, currency)}</span>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-500">No activity.</p>
      )}
    </div>
  </div>
);

const PeriodBadge = ({ period }: { period: FiscalPeriod }) => (
  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${period.status === 'closed' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
    {period.status}
  </span>
);

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const maybeResponse = error as {
      response?: {
        data?: Record<string, unknown> | string;
      };
      message?: string;
    };
    const data = maybeResponse.response?.data;
    if (typeof data === 'string' && data.trim()) {
      return data;
    }
    if (data && typeof data === 'object') {
      const firstValue = Object.values(data)[0];
      if (typeof firstValue === 'string' && firstValue.trim()) {
        return firstValue;
      }
      if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') {
        return firstValue[0];
      }
    }
    if (maybeResponse.message) {
      return maybeResponse.message;
    }
  }
  return fallback;
};

const Accounting = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: journalEntries, isLoading: entriesLoading } = useJournalEntries();
  const { data: fiscalPeriods = [], isLoading: fiscalPeriodsLoading } = useFiscalPeriods();
  const seedAccounts = useSeedAccounts();
  const createJournalEntry = useCreateJournalEntry();
  const createFiscalPeriod = useCreateFiscalPeriod();
  const fiscalPeriodAction = useFiscalPeriodAction();
  const { can } = usePermissions();

  const [activeTab, setActiveTab] = useState<AccountingTab>('summary');
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalEntryForm, setJournalEntryForm] = useState<JournalEntryForm>(emptyJournalEntry);
  const [fiscalPeriodForm, setFiscalPeriodForm] = useState<FiscalPeriodForm>(emptyFiscalPeriod);
  const [sourceFilter, setSourceFilter] = useState<JournalSourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<JournalStatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [statementRange, setStatementRange] = useState({
    date_from: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
    as_of: new Date().toISOString().slice(0, 10),
  });

  const { data: trialBalance } = useTrialBalance({ date_from: statementRange.date_from, date_to: statementRange.date_to });
  const { data: profitAndLoss } = useProfitAndLoss({ date_from: statementRange.date_from, date_to: statementRange.date_to });
  const { data: balanceSheet } = useBalanceSheet({ as_of: statementRange.as_of });

  const totals = useMemo(
    () => ({
      activeAccounts: accounts?.filter((account) => account.is_active).length || 0,
      postedEntries: journalEntries?.filter((entry) => entry.status === 'posted').length || 0,
      draftEntries: journalEntries?.filter((entry) => entry.status === 'draft').length || 0,
      roomRevenue: accountBalance(journalEntries, '4000', 'credit'),
      restaurantRevenue: accountBalance(journalEntries, '4100', 'credit'),
      accountsReceivable: accountBalance(journalEntries, '1100', 'debit'),
      inventoryAsset: accountBalance(journalEntries, '1200', 'debit'),
      payables: accountBalance(journalEntries, '2000', 'credit'),
      expenses: accountTypeBalance(journalEntries, 'expense'),
    }),
    [accounts, journalEntries],
  );

  const filteredJournalEntries = useMemo(
    () =>
      journalEntries?.filter((entry) => {
        const source = entry.source_module || 'manual';
        const matchesSource = sourceFilter === 'all' || source === sourceFilter;
        const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
        const matchesFrom = !dateFrom || entry.entry_date >= dateFrom;
        const matchesTo = !dateTo || entry.entry_date <= dateTo;
        return matchesSource && matchesStatus && matchesFrom && matchesTo;
      }) || [],
    [dateFrom, dateTo, journalEntries, sourceFilter, statusFilter],
  );

  const sourceSummary = useMemo(() => {
    const buckets = new Map<string, { count: number; debit: number; credit: number }>();
    journalEntries
      ?.filter((entry) => entry.status === 'posted')
      .forEach((entry) => {
        const source = entry.source_module || 'manual';
        const current = buckets.get(source) || { count: 0, debit: 0, credit: 0 };
        current.count += 1;
        current.debit += Number(entry.total_debit || 0);
        current.credit += Number(entry.total_credit || 0);
        buckets.set(source, current);
      });
    return Array.from(buckets.entries()).map(([source, value]) => ({ source, ...value }));
  }, [journalEntries]);

  const updateLine = (index: number, nextLine: Partial<JournalLineInput>) => {
    const nextLines = [...journalEntryForm.lines];
    nextLines[index] = { ...nextLines[index], ...nextLine };
    setJournalEntryForm({ ...journalEntryForm, lines: nextLines });
  };

  const removeLine = (index: number) => {
    setJournalEntryForm({
      ...journalEntryForm,
      lines: journalEntryForm.lines.filter((_, lineIndex) => lineIndex !== index),
    });
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create') {
      setIsJournalModalOpen(true);
      return;
    }
    setActiveTab(tabId as AccountingTab);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Accounting</h1>
          <p className="mt-1 text-sm text-slate-600">Manage periods, inspect journals, and read management-ready statements from posted activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('accounting.journal.create') && (
            <button onClick={() => setIsJournalModalOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              New journal
            </button>
          )}
          {can('accounting.journal.create') && (
            <button onClick={() => seedAccounts.mutate()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Seed accounts
            </button>
          )}
        </div>
      </div>

      <CompactTabs
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'statements', label: 'Statements' },
          { id: 'journals', label: 'Journals', count: journalEntries?.length || 0 },
          { id: 'fiscal_periods', label: 'Fiscal Periods', count: fiscalPeriods.length },
          { id: 'accounts', label: 'Accounts', count: totals.activeAccounts },
          ...(can('accounting.journal.create') ? [{ id: 'create', label: 'Create Entry' }] : []),
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === 'summary' && (
        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['Room Revenue', totals.roomRevenue, '4000 Room Revenue'],
              ['Restaurant Revenue', totals.restaurantRevenue, '4100 Restaurant Revenue'],
              ['Accounts Receivable', totals.accountsReceivable, '1100 room-posted charges'],
              ['Inventory Asset', totals.inventoryAsset, '1200 stock on hand'],
              ['Payables', totals.payables, '2000 inventory payable'],
              ['Expenses', totals.expenses, 'Expense account activity'],
            ].map(([title, value, detail]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{title}</p>
                <p className="mt-2 text-2xl font-semibold text-[#1F5E3B]">{formatMoney(Number(value), settings?.currency)}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Journal Sources</h2>
              <p className="text-sm text-slate-500">Posted activity grouped by operating flow.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3 text-right">Entries</th>
                    <th className="px-4 py-3 text-right">Debits</th>
                    <th className="px-4 py-3 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sourceSummary.map((row) => (
                    <tr key={row.source} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{sourceLabels[row.source] || row.source}</td>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(row.debit, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(row.credit, settings?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sourceSummary.length === 0 && <p className="p-4 text-sm text-slate-600">No posted journal activity yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'statements' && (
        <section className="space-y-5">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
            <input type="date" value={statementRange.date_from} onChange={(e) => setStatementRange({ ...statementRange, date_from: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={statementRange.date_to} onChange={(e) => setStatementRange({ ...statementRange, date_to: e.target.value, as_of: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={statementRange.as_of} onChange={(e) => setStatementRange({ ...statementRange, as_of: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">Trial Balance</h2>
                <p className="text-sm text-slate-500">Balanced account view for the selected period.</p>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trialBalance?.rows.map((row) => (
                      <tr key={row.account_code}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">{row.account_code}</span>
                          <span className="block text-xs text-slate-500">{row.account_name}</span>
                        </td>
                        <td className="px-4 py-3 text-right">{Number(row.debit_balance) ? formatMoney(row.debit_balance, settings?.currency) : '-'}</td>
                        <td className="px-4 py-3 text-right">{Number(row.credit_balance) ? formatMoney(row.credit_balance, settings?.currency) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                {formatMoney(trialBalance?.totals.debit_balance || 0, settings?.currency)} / {formatMoney(trialBalance?.totals.credit_balance || 0, settings?.currency)}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">Profit &amp; Loss</h2>
                <p className="text-sm text-slate-500">Revenue and expenses between the selected dates.</p>
              </div>
              <div className="space-y-4 p-4">
                <StatementSection title="Revenue" rows={profitAndLoss?.revenue || []} currency={settings?.currency} />
                <StatementSection title="Expenses" rows={profitAndLoss?.expenses || []} currency={settings?.currency} />
              </div>
              <div className="grid gap-2 border-t border-slate-100 px-4 py-3 text-sm">
                <div className="flex items-center justify-between"><span>Total revenue</span><span>{formatMoney(profitAndLoss?.totals.revenue || 0, settings?.currency)}</span></div>
                <div className="flex items-center justify-between"><span>Total expenses</span><span>{formatMoney(profitAndLoss?.totals.expenses || 0, settings?.currency)}</span></div>
                <div className="flex items-center justify-between font-semibold text-slate-900"><span>Net income</span><span>{formatMoney(profitAndLoss?.totals.net_income || 0, settings?.currency)}</span></div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">Balance Sheet</h2>
                <p className="text-sm text-slate-500">Position as of the selected date.</p>
              </div>
              <div className="space-y-4 p-4">
                <StatementSection title="Assets" rows={balanceSheet?.assets || []} currency={settings?.currency} />
                <StatementSection title="Liabilities" rows={balanceSheet?.liabilities || []} currency={settings?.currency} />
                <StatementSection title="Equity" rows={balanceSheet?.equity || []} currency={settings?.currency} />
              </div>
              <div className="grid gap-2 border-t border-slate-100 px-4 py-3 text-sm">
                <div className="flex items-center justify-between"><span>Total assets</span><span>{formatMoney(balanceSheet?.totals.asset || 0, settings?.currency)}</span></div>
                <div className="flex items-center justify-between"><span>Total liabilities + equity</span><span>{formatMoney(balanceSheet?.totals.liabilities_and_equity || 0, settings?.currency)}</span></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'journals' && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-5">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as JournalSourceFilter)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="all">All sources</option>
              <option value="guest_folio">Room folio</option>
              <option value="restaurant_order">Restaurant</option>
              <option value="inventory_purchase">Inventory purchase</option>
              <option value="manual">Manual</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as JournalStatusFilter)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={() => {
                setSourceFilter('all');
                setStatusFilter('all');
                setDateFrom('');
                setDateTo('');
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Lines</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJournalEntries.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <button type="button" onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)} className="font-medium text-slate-900 hover:text-[#1F5E3B]">
                            {entry.entry_number}
                          </button>
                          <span className="block text-xs font-normal text-slate-500">{entry.description}</span>
                          <span className="block text-xs font-normal text-slate-500">{entry.entry_date}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {sourceLabels[entry.source_module || 'manual'] || entry.source_module || 'Manual'}
                          {entry.source_id && <span className="block max-w-[180px] truncate text-xs text-slate-500">{entry.source_id}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entry.fiscal_period_name || '-'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(entry.total_debit, settings?.currency)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(entry.total_credit, settings?.currency)}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{entry.status}</span></td>
                        <td className="px-4 py-3 text-slate-700">
                          {entry.lines.slice(0, 2).map((line) => (
                            <span key={line.id} className="block max-w-sm truncate text-xs">
                              {line.account_details?.code} - {line.description || line.account_details?.name}
                            </span>
                          ))}
                          {entry.lines.length > 2 && <span className="text-xs text-slate-500">+{entry.lines.length - 2} more</span>}
                        </td>
                      </tr>
                      {expandedEntry === entry.id && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="px-4 py-3">
                            <table className="w-full text-left text-xs">
                              <thead className="uppercase text-slate-500">
                                <tr>
                                  <th className="py-2 pr-4">Account</th>
                                  <th className="py-2 pr-4">Description</th>
                                  <th className="py-2 pr-4 text-right">Debit</th>
                                  <th className="py-2 pr-4 text-right">Credit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {entry.lines.map((line) => (
                                  <tr key={line.id}>
                                    <td className="py-2 pr-4 font-medium text-slate-800">{line.account_details?.code} - {line.account_details?.name}</td>
                                    <td className="py-2 pr-4 text-slate-600">{line.description || '-'}</td>
                                    <td className="py-2 pr-4 text-right">{Number(line.debit) ? formatMoney(line.debit, settings?.currency) : '-'}</td>
                                    <td className="py-2 pr-4 text-right">{Number(line.credit) ? formatMoney(line.credit, settings?.currency) : '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {entriesLoading && <p className="p-4 text-sm text-slate-600">Loading journal entries...</p>}
            {filteredJournalEntries.length === 0 && <p className="p-4 text-sm text-slate-600">No journal entries match these filters.</p>}
          </div>
        </section>
      )}

      {activeTab === 'fiscal_periods' && (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Create Fiscal Period</h2>
            <div className="mt-4 grid gap-3">
              <input value={fiscalPeriodForm.name} onChange={(e) => setFiscalPeriodForm({ ...fiscalPeriodForm, name: e.target.value })} placeholder="May 2026" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={fiscalPeriodForm.start_date} onChange={(e) => setFiscalPeriodForm({ ...fiscalPeriodForm, start_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={fiscalPeriodForm.end_date} onChange={(e) => setFiscalPeriodForm({ ...fiscalPeriodForm, end_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() =>
                  createFiscalPeriod.mutate(fiscalPeriodForm, {
                    onSuccess: () => setFiscalPeriodForm(emptyFiscalPeriod),
                  })
                }
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Create period
              </button>
              {createFiscalPeriod.isError && <p className="text-sm text-red-600">{getApiErrorMessage(createFiscalPeriod.error, 'Could not create fiscal period.')}</p>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Fiscal Period Register</h2>
              <p className="text-sm text-slate-500">Close a period to block new posted entries inside that date range.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Date Range</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Closed By</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fiscalPeriods.map((period) => (
                    <tr key={period.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{period.name}</td>
                      <td className="px-4 py-3 text-slate-700">{period.start_date} to {period.end_date}</td>
                      <td className="px-4 py-3"><PeriodBadge period={period} /></td>
                      <td className="px-4 py-3 text-slate-700">{period.closed_by_details?.email || '-'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => fiscalPeriodAction.mutate({ periodId: period.id, action: period.status === 'open' ? 'close' : 'reopen' })}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {period.status === 'open' ? 'Close period' : 'Reopen period'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fiscalPeriodsLoading && <p className="p-4 text-sm text-slate-600">Loading fiscal periods...</p>}
            {!fiscalPeriodsLoading && fiscalPeriods.length === 0 && <p className="p-4 text-sm text-slate-600">No fiscal periods yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'accounts' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts?.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">{account.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{account.name}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{account.account_type}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {account.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accountsLoading && <p className="p-4 text-sm text-slate-600">Loading accounts...</p>}
          {accounts?.length === 0 && <p className="p-4 text-sm text-slate-600">No accounts yet. Use Seed accounts to create defaults.</p>}
        </section>
      )}

      {isJournalModalOpen && (
        <ActionModal title="Create journal entry" onClose={() => setIsJournalModalOpen(false)} maxWidthClassName="max-w-5xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createJournalEntry.mutate(
                {
                  entry_date: journalEntryForm.entry_date || undefined,
                  description: journalEntryForm.description,
                  source_module: journalEntryForm.source_module,
                  source_id: journalEntryForm.source_id,
                  status: journalEntryForm.status,
                  lines: journalEntryForm.lines.map((line) => ({
                    account: line.account,
                    description: line.description,
                    debit: line.debit || '0',
                    credit: line.credit || '0',
                  })),
                },
                {
                  onSuccess: () => {
                    setJournalEntryForm(emptyJournalEntry);
                    setIsJournalModalOpen(false);
                    setActiveTab('journals');
                  },
                },
              );
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <input type="date" value={journalEntryForm.entry_date} onChange={(e) => setJournalEntryForm({ ...journalEntryForm, entry_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={journalEntryForm.description} onChange={(e) => setJournalEntryForm({ ...journalEntryForm, description: e.target.value })} placeholder="Description" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <select value={journalEntryForm.status} onChange={(e) => setJournalEntryForm({ ...journalEntryForm, status: e.target.value as JournalEntryForm['status'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="void">Void</option>
              </select>
              <input value={journalEntryForm.source_module} onChange={(e) => setJournalEntryForm({ ...journalEntryForm, source_module: e.target.value })} placeholder="Source module" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={journalEntryForm.source_id} onChange={(e) => setJournalEntryForm({ ...journalEntryForm, source_id: e.target.value })} placeholder="Source ID" className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Line description</th>
                    <th className="px-3 py-2">Debit</th>
                    <th className="px-3 py-2">Credit</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journalEntryForm.lines.map((line, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        <select value={line.account} onChange={(e) => updateLine(index, { account: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" required>
                          <option value="">Select account</option>
                          {accounts?.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateLine(index, { debit: e.target.value, credit: '' })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateLine(index, { credit: e.target.value, debit: '' })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeLine(index)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setJournalEntryForm({ ...journalEntryForm, lines: [...journalEntryForm.lines, { account: '', description: '', debit: '', credit: '' }] })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add line
              </button>
              <button type="button" onClick={() => setIsJournalModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createJournalEntry.status === 'pending'} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {createJournalEntry.status === 'pending' ? 'Saving...' : 'Save journal'}
              </button>
            </div>
            {createJournalEntry.status === 'error' && <p className="mt-3 text-sm text-red-600">Failed to create journal entry. Check that debits and credits balance or whether the fiscal period is closed.</p>}
          </form>
        </ActionModal>
      )}
    </div>
  );
};

export default Accounting;
