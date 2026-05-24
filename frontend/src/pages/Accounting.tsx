import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import {
  useAccounts,
  useBalanceSheet,
  useCreateFiscalPeriod,
  useCreateJournalEntry,
  useCreateTaxRate,
  useCreateVendorBill,
  useFiscalPeriodAction,
  useFiscalPeriods,
  useJournalEntries,
  useNightAuditRuns,
  useNightAuditSchedule,
  useProfitAndLoss,
  useRunNightAudit,
  useSeedAccounts,
  useTaxRates,
  useTrialBalance,
  useUpdateNightAuditSchedule,
  useVendorBillAction,
  useVendorBills,
} from '../hooks/accounting';
import { useVendors } from '../hooks/inventory';
import { usePermissions } from '../hooks/permissions';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';
import { FiscalPeriod, JournalEntry, TaxRate } from '../types/accounting';

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

type TaxRateForm = {
  code: string;
  name: string;
  tax_type: TaxRate['tax_type'];
  rate: string;
  account: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
};

type VendorBillLineInput = {
  account: string;
  tax_rate: string;
  description: string;
  amount: string;
};

type VendorBillForm = {
  vendor: string;
  invoice_number: string;
  bill_date: string;
  due_date: string;
  notes: string;
  lines: VendorBillLineInput[];
};

type AccountingTab = 'summary' | 'statements' | 'journals' | 'fiscal_periods' | 'taxes' | 'vendor_bills' | 'night_audit' | 'accounts' | 'create';
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

const emptyTaxRate: TaxRateForm = {
  code: '',
  name: '',
  tax_type: 'sales',
  rate: '',
  account: '',
  description: '',
  is_default: false,
  is_active: true,
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyVendorBill = (): VendorBillForm => ({
  vendor: '',
  invoice_number: '',
  bill_date: todayIso(),
  due_date: '',
  notes: '',
  lines: [{ account: '', tax_rate: '', description: '', amount: '' }],
});

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
  const { data: taxRates = [], isLoading: taxRatesLoading } = useTaxRates();
  const { data: vendorBills = [], isLoading: vendorBillsLoading } = useVendorBills();
  const { data: nightAuditRuns = [], isLoading: nightAuditRunsLoading } = useNightAuditRuns();
  const { data: nightAuditSchedule } = useNightAuditSchedule();
  const { data: vendors = [] } = useVendors();
  const seedAccounts = useSeedAccounts();
  const createJournalEntry = useCreateJournalEntry();
  const createFiscalPeriod = useCreateFiscalPeriod();
  const createTaxRate = useCreateTaxRate();
  const createVendorBill = useCreateVendorBill();
  const vendorBillAction = useVendorBillAction();
  const fiscalPeriodAction = useFiscalPeriodAction();
  const updateNightAuditSchedule = useUpdateNightAuditSchedule();
  const runNightAudit = useRunNightAudit();
  const { can } = usePermissions();

  const [activeTab, setActiveTab] = useState<AccountingTab>('summary');
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalEntryForm, setJournalEntryForm] = useState<JournalEntryForm>(emptyJournalEntry);
  const [fiscalPeriodForm, setFiscalPeriodForm] = useState<FiscalPeriodForm>(emptyFiscalPeriod);
  const [taxRateForm, setTaxRateForm] = useState<TaxRateForm>(emptyTaxRate);
  const [vendorBillForm, setVendorBillForm] = useState<VendorBillForm>(emptyVendorBill());
  const [nightAuditDate, setNightAuditDate] = useState(todayIso());
  const [nightAuditScheduleForm, setNightAuditScheduleForm] = useState({
    enabled: false,
    run_time: '02:00',
    timezone: 'Asia/Katmandu',
    notes: '',
  });
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
  const latestNightAudit = nightAuditRuns[0];
  const taxControlAccounts = useMemo(() => accounts?.filter((account) => account.account_type === 'liability' && account.is_active) || [], [accounts]);
  const vendorBillAccounts = useMemo(() => accounts?.filter((account) => ['asset', 'expense'].includes(account.account_type) && account.is_active) || [], [accounts]);
  const purchaseTaxRates = useMemo(() => taxRates.filter((taxRate) => taxRate.is_active && ['purchase', 'both'].includes(taxRate.tax_type)), [taxRates]);

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

  const updateVendorBillLine = (index: number, nextLine: Partial<VendorBillLineInput>) => {
    const nextLines = [...vendorBillForm.lines];
    nextLines[index] = { ...nextLines[index], ...nextLine };
    setVendorBillForm({ ...vendorBillForm, lines: nextLines });
  };

  const removeVendorBillLine = (index: number) => {
    setVendorBillForm({
      ...vendorBillForm,
      lines: vendorBillForm.lines.filter((_, lineIndex) => lineIndex !== index),
    });
  };

  const getVendorBillTaxAmount = (line: VendorBillLineInput) => {
    const taxRate = purchaseTaxRates.find((rate) => rate.id === line.tax_rate);
    if (!taxRate || !line.amount) {
      return '0.00';
    }
    return ((Number(line.amount) * Number(taxRate.rate)) / 100).toFixed(2);
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create') {
      setIsJournalModalOpen(true);
      return;
    }
    setActiveTab(tabId as AccountingTab);
  };

  useEffect(() => {
    if (!nightAuditSchedule) return;
    setNightAuditScheduleForm({
      enabled: nightAuditSchedule.enabled,
      run_time: nightAuditSchedule.run_time?.slice(0, 5) || '02:00',
      timezone: nightAuditSchedule.timezone || 'Asia/Katmandu',
      notes: nightAuditSchedule.notes || '',
    });
  }, [nightAuditSchedule]);

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
          { id: 'taxes', label: 'Taxes', count: taxRates.length },
          { id: 'vendor_bills', label: 'Vendor Bills', count: vendorBills.length },
          { id: 'night_audit', label: 'Night Audit', count: nightAuditRuns.length },
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

      {activeTab === 'taxes' && (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Create Tax Rate</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                createTaxRate.mutate(
                  {
                    ...taxRateForm,
                    rate: taxRateForm.rate || '0',
                  },
                  {
                    onSuccess: () => setTaxRateForm(emptyTaxRate),
                  },
                );
              }}
            >
              <input value={taxRateForm.code} onChange={(e) => setTaxRateForm({ ...taxRateForm, code: e.target.value.toUpperCase() })} placeholder="VAT13" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input value={taxRateForm.name} onChange={(e) => setTaxRateForm({ ...taxRateForm, name: e.target.value })} placeholder="VAT 13%" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <select value={taxRateForm.tax_type} onChange={(e) => setTaxRateForm({ ...taxRateForm, tax_type: e.target.value as TaxRate['tax_type'] })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="sales">Sales</option>
                <option value="purchase">Purchase</option>
                <option value="both">Sales and purchase</option>
              </select>
              <input type="number" min="0" step="0.001" value={taxRateForm.rate} onChange={(e) => setTaxRateForm({ ...taxRateForm, rate: e.target.value })} placeholder="Rate %" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <select value={taxRateForm.account} onChange={(e) => setTaxRateForm({ ...taxRateForm, account: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                <option value="">Tax control account</option>
                {taxControlAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
              <textarea value={taxRateForm.description} onChange={(e) => setTaxRateForm({ ...taxRateForm, description: e.target.value })} placeholder="Description" className="min-h-[80px] rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={taxRateForm.is_default} onChange={(e) => setTaxRateForm({ ...taxRateForm, is_default: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                Default rate
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={taxRateForm.is_active} onChange={(e) => setTaxRateForm({ ...taxRateForm, is_active: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                Active
              </label>
              <button type="submit" disabled={createTaxRate.status === 'pending'} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {createTaxRate.status === 'pending' ? 'Saving...' : 'Create tax rate'}
              </button>
              {createTaxRate.isError && <p className="text-sm text-red-600">{getApiErrorMessage(createTaxRate.error, 'Could not create tax rate.')}</p>}
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Tax Register</h2>
              <p className="text-sm text-slate-500">Rates map tax collection and purchase tax to accounting control accounts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3">Control Account</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxRates.map((taxRate) => (
                    <tr key={taxRate.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-sm text-slate-700">{taxRate.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {taxRate.name}
                        {taxRate.is_default && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Default</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">{taxRate.tax_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{Number(taxRate.rate).toFixed(3)}%</td>
                      <td className="px-4 py-3 text-slate-700">{taxRate.account_details ? `${taxRate.account_details.code} - ${taxRate.account_details.name}` : '-'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {taxRate.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {taxRatesLoading && <p className="p-4 text-sm text-slate-600">Loading tax rates...</p>}
            {!taxRatesLoading && taxRates.length === 0 && <p className="p-4 text-sm text-slate-600">No tax rates configured yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'vendor_bills' && (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Capture Vendor Bill</h2>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                createVendorBill.mutate(
                  {
                    vendor: vendorBillForm.vendor,
                    invoice_number: vendorBillForm.invoice_number,
                    bill_date: vendorBillForm.bill_date,
                    due_date: vendorBillForm.due_date || undefined,
                    notes: vendorBillForm.notes,
                    lines: vendorBillForm.lines.map((line) => ({
                      account: line.account,
                      tax_rate: line.tax_rate || null,
                      description: line.description,
                      amount: line.amount || '0',
                      tax_amount: getVendorBillTaxAmount(line),
                    })),
                  },
                  {
                    onSuccess: () => setVendorBillForm(emptyVendorBill()),
                  },
                );
              }}
            >
              <select value={vendorBillForm.vendor} onChange={(e) => setVendorBillForm({ ...vendorBillForm, vendor: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required>
                <option value="">Vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              <input value={vendorBillForm.invoice_number} onChange={(e) => setVendorBillForm({ ...vendorBillForm, invoice_number: e.target.value })} placeholder="Invoice number" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="date" value={vendorBillForm.bill_date} onChange={(e) => setVendorBillForm({ ...vendorBillForm, bill_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="date" value={vendorBillForm.due_date} onChange={(e) => setVendorBillForm({ ...vendorBillForm, due_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorBillForm.lines.map((line, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          <select value={line.account} onChange={(e) => updateVendorBillLine(index, { account: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" required>
                            <option value="">Account</option>
                            {vendorBillAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input value={line.description} onChange={(e) => updateVendorBillLine(index, { description: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" required />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0.01" step="0.01" value={line.amount} onChange={(e) => updateVendorBillLine(index, { amount: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" required />
                        </td>
                        <td className="px-3 py-2">
                          <select value={line.tax_rate} onChange={(e) => updateVendorBillLine(index, { tax_rate: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                            <option value="">No tax</option>
                            {purchaseTaxRates.map((taxRate) => (
                              <option key={taxRate.id} value={taxRate.id}>
                                {taxRate.code} {Number(taxRate.rate).toFixed(3)}%
                              </option>
                            ))}
                          </select>
                          {line.tax_rate && <span className="mt-1 block text-xs text-slate-500">{formatMoney(getVendorBillTaxAmount(line), settings?.currency)}</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeVendorBillLine(index)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <textarea value={vendorBillForm.notes} onChange={(e) => setVendorBillForm({ ...vendorBillForm, notes: e.target.value })} placeholder="Notes" className="min-h-[80px] rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setVendorBillForm({ ...vendorBillForm, lines: [...vendorBillForm.lines, { account: '', tax_rate: '', description: '', amount: '' }] })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Add line
                </button>
                <button type="submit" disabled={createVendorBill.status === 'pending'} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  {createVendorBill.status === 'pending' ? 'Saving...' : 'Save bill'}
                </button>
              </div>
              {createVendorBill.isError && <p className="text-sm text-red-600">{getApiErrorMessage(createVendorBill.error, 'Could not save vendor bill.')}</p>}
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Vendor Bill Register</h2>
              <p className="text-sm text-slate-500">Draft bills can be posted to accounts payable when reviewed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Bill</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorBills.map((bill) => (
                    <tr key={bill.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {bill.bill_number}
                        {bill.invoice_number && <span className="block text-xs font-normal text-slate-500">{bill.invoice_number}</span>}
                        {bill.journal_entry_number && <span className="block text-xs font-normal text-slate-500">{bill.journal_entry_number}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{bill.vendor_details?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {bill.bill_date}
                        {bill.due_date && <span className="block text-xs text-slate-500">Due {bill.due_date}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">{formatMoney(bill.subtotal, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(bill.tax_total, settings?.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(bill.total_amount, settings?.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${bill.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {bill.status === 'draft' && (
                          <button type="button" onClick={() => vendorBillAction.mutate({ billId: bill.id, action: 'post' })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            Post
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {vendorBillsLoading && <p className="p-4 text-sm text-slate-600">Loading vendor bills...</p>}
            {!vendorBillsLoading && vendorBills.length === 0 && <p className="p-4 text-sm text-slate-600">No vendor bills captured yet.</p>}
            {vendorBillAction.isError && <p className="border-t border-slate-100 p-4 text-sm text-red-600">{getApiErrorMessage(vendorBillAction.error, 'Could not post vendor bill.')}</p>}
          </div>
        </section>
      )}

      {activeTab === 'night_audit' && (
        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              ['Last status', latestNightAudit?.status?.replace(/_/g, ' ') || 'Not run'],
              ['Checked-in stays', latestNightAudit?.checked_in_bookings || 0],
              ['Folios reviewed', latestNightAudit?.folios_reviewed || 0],
              ['Open folios', latestNightAudit?.open_folios || 0],
              ['Exceptions', latestNightAudit?.exceptions.length || 0],
            ].map(([title, value]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
                <p className="mt-2 text-xl font-semibold capitalize text-slate-900">{value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-5">
              {can('accounting.journal.create') && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateNightAuditSchedule.mutate(nightAuditScheduleForm);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <h2 className="font-semibold text-slate-900">Schedule</h2>
                  <div className="mt-4 grid gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={nightAuditScheduleForm.enabled} onChange={(e) => setNightAuditScheduleForm({ ...nightAuditScheduleForm, enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                      Enabled
                    </label>
                    <input type="time" value={nightAuditScheduleForm.run_time} onChange={(e) => setNightAuditScheduleForm({ ...nightAuditScheduleForm, run_time: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                    <input value={nightAuditScheduleForm.timezone} onChange={(e) => setNightAuditScheduleForm({ ...nightAuditScheduleForm, timezone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                    <textarea value={nightAuditScheduleForm.notes} onChange={(e) => setNightAuditScheduleForm({ ...nightAuditScheduleForm, notes: e.target.value })} placeholder="Notes" className="min-h-[80px] rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <button type="submit" disabled={updateNightAuditSchedule.status === 'pending'} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                      {updateNightAuditSchedule.status === 'pending' ? 'Saving...' : 'Save schedule'}
                    </button>
                    {nightAuditSchedule?.last_run_at && <p className="text-xs text-slate-500">Last scheduled run {new Date(nightAuditSchedule.last_run_at).toLocaleString()}</p>}
                  </div>
                </form>
              )}

              {can('accounting.journal.create') && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    runNightAudit.mutate({ audit_date: nightAuditDate });
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <h2 className="font-semibold text-slate-900">Run Audit</h2>
                  <div className="mt-4 grid gap-3">
                    <input type="date" value={nightAuditDate} onChange={(e) => setNightAuditDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <button type="submit" disabled={runNightAudit.status === 'pending'} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60">
                      {runNightAudit.status === 'pending' ? 'Running...' : 'Run night audit'}
                    </button>
                    {runNightAudit.isError && <p className="text-sm text-red-600">{getApiErrorMessage(runNightAudit.error, 'Could not run night audit.')}</p>}
                  </div>
                </form>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">Audit Runs</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Stays</th><th className="px-4 py-3 text-right">Folios</th><th className="px-4 py-3 text-right">Room Lines</th><th className="px-4 py-3">Exceptions</th><th className="px-4 py-3">Completed</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nightAuditRuns.map((run) => (
                      <tr key={run.id} className="align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">{run.audit_date}</td>
                        <td className="px-4 py-3 capitalize text-slate-700">{run.status.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right">{run.checked_in_bookings}</td>
                        <td className="px-4 py-3 text-right">{run.folios_reviewed}</td>
                        <td className="px-4 py-3 text-right">{run.room_charge_lines_created}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {run.exceptions.length ? run.exceptions.map((exception) => <p key={`${run.id}-${exception.type}-${exception.message}`} className="mb-1 last:mb-0">{exception.message}</p>) : '-'}
                          {run.error_message && <p className="text-red-600">{run.error_message}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nightAuditRunsLoading && <p className="p-4 text-sm text-slate-600">Loading night audit runs...</p>}
              {!nightAuditRunsLoading && nightAuditRuns.length === 0 && <p className="p-4 text-sm text-slate-600">No night audit runs yet.</p>}
            </div>
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
