import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccounts, useJournalEntries, useCreateJournalEntry, useSeedAccounts } from '../hooks/accounting';
import { formatMoney, getTenantSettings } from '../services/tenantSettings';

type JournalLineInput = {
  account: string;
  description: string;
  debit: string;
  credit: string;
};

type JournalEntryForm = {
  description: string;
  source_module: string;
  source_id: string;
  status: 'draft' | 'posted' | 'void';
  lines: JournalLineInput[];
};

const Accounting = () => {
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: journalEntries, isLoading: entriesLoading } = useJournalEntries();
  const seedAccounts = useSeedAccounts();
  const createJournalEntry = useCreateJournalEntry();
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [journalEntryForm, setJournalEntryForm] = useState<JournalEntryForm>({
    description: '',
    source_module: '',
    source_id: '',
    status: 'posted',
    lines: [{ account: '', description: '', debit: '', credit: '' }],
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounting</h1>
          <p className="mt-2 text-slate-600">Review chart of accounts and posted journal entries.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateEntry((value) => !value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {showCreateEntry ? 'Hide Entry Form' : 'New Journal Entry'}
          </button>
          <button
            onClick={() => seedAccounts.mutate()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seed Accounts
          </button>
        </div>
      </div>

      {showCreateEntry && (
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Create Journal Entry</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createJournalEntry.mutate(
                {
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
                    setShowCreateEntry(false);
                    setJournalEntryForm({
                      description: '',
                      source_module: '',
                      source_id: '',
                      status: 'posted',
                      lines: [{ account: '', description: '', debit: '', credit: '' }],
                    });
                  },
                },
              );
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={journalEntryForm.description}
                onChange={(e) => setJournalEntryForm({ ...journalEntryForm, description: e.target.value })}
                placeholder="Description"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                required
              />
              <input
                value={journalEntryForm.source_module}
                onChange={(e) => setJournalEntryForm({ ...journalEntryForm, source_module: e.target.value })}
                placeholder="Source module"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={journalEntryForm.source_id}
                onChange={(e) => setJournalEntryForm({ ...journalEntryForm, source_id: e.target.value })}
                placeholder="Source ID"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
              <select
                value={journalEntryForm.status}
                onChange={(e) => setJournalEntryForm({ ...journalEntryForm, status: e.target.value as JournalEntryForm['status'] })}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              >
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="void">Void</option>
              </select>
            </div>
            <div className="space-y-4">
              {journalEntryForm.lines.map((line, index) => (
                <div key={index} className="grid gap-4 md:grid-cols-[180px_1fr_120px_120px]">
                  <select
                    value={line.account}
                    onChange={(e) => {
                      const nextLines = [...journalEntryForm.lines];
                      nextLines[index] = { ...nextLines[index], account: e.target.value };
                      setJournalEntryForm({ ...journalEntryForm, lines: nextLines });
                    }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts?.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={line.description}
                    onChange={(e) => {
                      const nextLines = [...journalEntryForm.lines];
                      nextLines[index] = { ...nextLines[index], description: e.target.value };
                      setJournalEntryForm({ ...journalEntryForm, lines: nextLines });
                    }}
                    placeholder="Line description"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                  <input
                    value={line.debit}
                    onChange={(e) => {
                      const nextLines = [...journalEntryForm.lines];
                      nextLines[index] = { ...nextLines[index], debit: e.target.value, credit: '' };
                      setJournalEntryForm({ ...journalEntryForm, lines: nextLines });
                    }}
                    placeholder="Debit"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <input
                    value={line.credit}
                    onChange={(e) => {
                      const nextLines = [...journalEntryForm.lines];
                      nextLines[index] = { ...nextLines[index], credit: e.target.value, debit: '' };
                      setJournalEntryForm({ ...journalEntryForm, lines: nextLines });
                    }}
                    placeholder="Credit"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setJournalEntryForm({
                    ...journalEntryForm,
                    lines: [...journalEntryForm.lines, { account: '', description: '', debit: '', credit: '' }],
                  })
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add line item
              </button>
              <button
                type="submit"
                disabled={createJournalEntry.status === 'pending'}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createJournalEntry.status === 'pending' ? 'Saving...' : 'Save Journal Entry'}
              </button>
            </div>
            {createJournalEntry.status === 'error' && (
              <p className="text-sm text-red-600">Failed to create journal entry. Please check the line items and try again.</p>
            )}
          </form>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Chart of Accounts</h2>
          <div className="mt-4 space-y-3">
            {accountsLoading && <p className="text-sm text-slate-600">Loading accounts...</p>}
            {accounts?.map((account) => (
              <div key={account.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {account.code} - {account.name}
                    </h3>
                    <p className="text-sm text-slate-500">{account.account_type}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {account.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
            {accounts?.length === 0 && <p className="text-sm text-slate-600">No accounts yet.</p>}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Journal Entries</h2>
          <div className="mt-4 space-y-4">
            {entriesLoading && <p className="text-sm text-slate-600">Loading journal entries...</p>}
            {journalEntries?.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{entry.entry_number}</h3>
                    <p className="text-sm text-slate-500">{entry.description}</p>
                    <p className="text-xs text-slate-500">
                      {entry.entry_date} | {entry.source_module || 'manual'}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    {entry.status}
                  </span>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2">Account</th>
                        <th className="py-2 text-right">Debit</th>
                        <th className="py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="border-t border-slate-100">
                          <td className="py-2">
                            {line.account_details?.code} - {line.account_details?.name}
                          </td>
                          <td className="py-2 text-right">{Number(line.debit) ? formatMoney(line.debit, settings?.currency) : '-'}</td>
                          <td className="py-2 text-right">{Number(line.credit) ? formatMoney(line.credit, settings?.currency) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 font-semibold">
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right">{formatMoney(entry.total_debit, settings?.currency)}</td>
                        <td className="py-2 text-right">{formatMoney(entry.total_credit, settings?.currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </article>
            ))}
            {journalEntries?.length === 0 && <p className="text-sm text-slate-600">No journal entries yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Accounting;
