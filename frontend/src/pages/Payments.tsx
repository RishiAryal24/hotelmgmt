import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, CircleSlash, Loader2, Plus, RefreshCw, Search, XCircle } from 'lucide-react';
import { getPaymentIntentExportUrl, useCreatePaymentIntent, usePaymentFollowUpAction, usePaymentIntentAction, usePaymentIntents, usePaymentProviderAction, usePaymentReconciliationSummary } from '../hooks/payments';
import apiClient from '../services/api';
import { getTenantSettings, updateTenantSettings } from '../services/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import { PaymentIntent, PaymentIntentCreatePayload, PaymentIntentStatus, PaymentProvider, PaymentSettlementStatus, PaymentSourceModule } from '../types/payments';
import { downloadCsv } from '../utils/csv';

const sourceOptions: { value: PaymentSourceModule; label: string }[] = [
  { value: 'guest_folio', label: 'Guest folio' },
  { value: 'restaurant_order', label: 'Restaurant order' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'manual', label: 'Manual' },
];

const providerOptions: { value: PaymentProvider; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'mock', label: 'Mock' },
  { value: 'khalti', label: 'Khalti' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'stripe', label: 'Stripe' },
];

const statusStyles: Record<PaymentIntentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  requires_action: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-slate-200 text-slate-600',
};

const settlementStyles: Record<PaymentSettlementStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  settled: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
};

const emptyForm: PaymentIntentCreatePayload = {
  source_module: 'manual',
  source_id: '',
  amount: '',
  currency: 'NPR',
  provider: 'manual',
  idempotency_key: '',
  description: '',
};

const formatMoney = (amount: string, currency: string) => `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (status: string) => status.replace('_', ' ');
const maskedSecret = '********';
const defaultStripeSettings = {
  publishable_key: '',
  secret_key: '',
  success_url: 'http://localhost:5173/payments',
  cancel_url: 'http://localhost:5173/payments',
};

const Payments = () => {
  const { data: intents = [], isLoading, isError } = usePaymentIntents();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const { data: filteredIntents = [], isLoading: filtersLoading, isError: filtersError } = usePaymentIntents(activeFilters);
  const { data: reconciliationSummary } = usePaymentReconciliationSummary(activeFilters);
  const createIntent = useCreatePaymentIntent();
  const intentAction = usePaymentIntentAction();
  const providerAction = usePaymentProviderAction();
  const followUpAction = usePaymentFollowUpAction();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const [form, setForm] = useState<PaymentIntentCreatePayload>(emptyForm);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [stripeSettingsForm, setStripeSettingsForm] = useState(defaultStripeSettings);
  const [stripeSettingsState, setStripeSettingsState] = useState<{ saving: boolean; message: string; error: string }>({
    saving: false,
    message: '',
    error: '',
  });

  useEffect(() => {
    const stripe = settings?.payment_settings?.stripe || {};
    setStripeSettingsForm({
      publishable_key: stripe.publishable_key || '',
      secret_key: stripe.secret_key || '',
      success_url: stripe.success_url || defaultStripeSettings.success_url,
      cancel_url: stripe.cancel_url || defaultStripeSettings.cancel_url,
    });
  }, [settings]);

  const summary = useMemo(() => {
    const totalOpen = intents.filter((intent) => ['draft', 'requires_action', 'processing'].includes(intent.status)).length;
    const succeededTotal = intents
      .filter((intent) => intent.status === 'succeeded')
      .reduce((sum, intent) => sum + Number(intent.amount || 0), 0);
    return { totalOpen, succeededTotal };
  }, [intents]);

  const visibleIntents = Object.keys(activeFilters).length ? filteredIntents : intents;
  const loadingRows = Object.keys(activeFilters).length ? filtersLoading : isLoading;
  const rowsError = Object.keys(activeFilters).length ? filtersError : isError;

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    createIntent.mutate(
      {
        ...form,
        idempotency_key: form.idempotency_key || `${form.source_module}-${form.source_id}-${Date.now()}`,
      },
      {
        onSuccess: () => setForm(emptyForm),
      },
    );
  };

  const runAction = (intent: PaymentIntent, action: 'processing' | 'succeed' | 'fail' | 'cancel' | 'reconcile') => {
    intentAction.mutate({
      intentId: intent.id,
      action,
      provider_reference: intent.provider_reference || actionNotes[intent.id] || '',
      message: actionNotes[intent.id] || '',
      payload: { source: 'payment_intents_screen' },
    });
  };

  const runFollowUp = (intent: PaymentIntent, status: 'open' | 'in_review' | 'resolved') => {
    followUpAction.mutate({
      intentId: intent.id,
      status,
      notes: actionNotes[intent.id] || '',
    });
  };

  const sourceLink = (intent: PaymentIntent) => {
    if (intent.source_module === 'guest_folio') return `/pos?tab=folios&folio=${intent.source_id}`;
    if (intent.source_module === 'restaurant_order') return `/pos?tab=paid&order=${intent.source_id}`;
    return '';
  };

  const exportIntentRows = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `payment-intents-${date}.csv`,
      ['Source', 'Source ID', 'Provider', 'Provider Reference', 'Amount', 'Currency', 'Gateway Status', 'Settlement Status', 'Follow-up', 'Created At', 'Settled At', 'Description'],
      visibleIntents.map((intent) => [
        statusLabel(intent.source_module),
        intent.source_id,
        intent.provider,
        intent.provider_reference,
        intent.amount,
        intent.currency,
        intent.status,
        intent.settlement_status,
        intent.follow_up_status,
        intent.created_at,
        intent.settled_at || '',
        intent.description,
      ]),
    );
  };

  const exportServerIntentRows = async () => {
    const response = await apiClient.get(getPaymentIntentExportUrl(activeFilters), { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `payment-intents-server-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const exportSummaryRows = () => {
    const date = new Date().toISOString().slice(0, 10);
    const rows = [
      ...(reconciliationSummary?.by_provider || []).map((row) => ['Provider', row.provider || '-', row.count, row.amount]),
      ...(reconciliationSummary?.by_status || []).map((row) => ['Gateway Status', row.status || '-', row.count, row.amount]),
      ...(reconciliationSummary?.by_settlement || []).map((row) => ['Settlement Status', row.settlement_status || '-', row.count, row.amount]),
      ...(reconciliationSummary?.by_follow_up || []).map((row) => ['Follow-up Status', row.follow_up_status || '-', row.count, row.amount]),
    ];
    downloadCsv(`payment-reconciliation-summary-${date}.csv`, ['Group', 'Value', 'Count', 'Amount'], rows);
  };

  const toggleProvider = (provider: 'khalti' | 'esewa' | 'stripe', enabled: boolean) => {
    updateTenantSettings({
      payment_settings: {
        [provider]: {
          ...(settings?.payment_settings?.[provider] || {}),
          enabled,
        },
      },
    }).then(() => window.location.reload());
  };

  const saveStripeSettings = async () => {
    setStripeSettingsState({ saving: true, message: '', error: '' });
    try {
      await updateTenantSettings({
        payment_settings: {
          stripe: {
            ...(settings?.payment_settings?.stripe || {}),
            enabled: Boolean(settings?.payment_settings?.stripe?.enabled),
            mode: 'test',
            publishable_key: stripeSettingsForm.publishable_key.trim(),
            secret_key: stripeSettingsForm.secret_key.trim() || maskedSecret,
            success_url: stripeSettingsForm.success_url.trim(),
            cancel_url: stripeSettingsForm.cancel_url.trim(),
          },
        },
      });
      setStripeSettingsState({ saving: false, message: 'Stripe sandbox settings saved.', error: '' });
    } catch (error) {
      setStripeSettingsState({
        saving: false,
        message: '',
        error: error instanceof Error ? error.message : 'Could not save Stripe sandbox settings.',
      });
    }
  };

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F5E3B]">Payment Intents</h1>
          <p className="mt-1 text-sm text-slate-500">Provider-neutral payment tracking for folios, POS, purchases, and manual adjustments.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Open intents" value={summary.totalOpen.toString()} />
          <Metric label="Succeeded value" value={`NPR ${summary.succeededTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Filtered total" value={formatMoney(String(reconciliationSummary?.amount || 0), settings?.currency || 'NPR')} />
        <Metric label="Filtered count" value={String(reconciliationSummary?.count || 0)} />
        <Metric label="Needs attention" value={String(reconciliationSummary?.attention_count || 0)} />
        <Metric label="Settled" value={String(reconciliationSummary?.by_settlement.find((row) => row.settlement_status === 'settled')?.count || 0)} />
      </section>

      <section className="flex flex-wrap gap-3 rounded-lg bg-white p-4 shadow-sm">
        <button type="button" onClick={exportIntentRows} className="rounded-lg bg-[#1F5E3B] px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          Export filtered intents
        </button>
        <button type="button" onClick={exportServerIntentRows} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Export all matches
        </button>
        <button type="button" onClick={exportSummaryRows} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Export summary
        </button>
      </section>

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="grid gap-5">
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Reconciliation Filters</h2>
          <div className="mt-4 grid gap-3">
            <FilterSelect label="Provider" value={filters.provider || ''} onChange={(value) => setFilters({ ...filters, provider: value })} options={providerOptions} />
            <FilterSelect label="Gateway status" value={filters.status || ''} onChange={(value) => setFilters({ ...filters, status: value })} options={Object.keys(statusStyles).map((value) => ({ value, label: statusLabel(value) }))} />
            <FilterSelect label="Settlement" value={filters.settlement_status || ''} onChange={(value) => setFilters({ ...filters, settlement_status: value })} options={Object.keys(settlementStyles).map((value) => ({ value, label: statusLabel(value) }))} />
            <FilterSelect label="Follow-up" value={filters.follow_up_status || ''} onChange={(value) => setFilters({ ...filters, follow_up_status: value })} options={['none', 'open', 'in_review', 'resolved'].map((value) => ({ value, label: statusLabel(value) }))} />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Source ID
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <Search size={15} className="text-slate-400" />
                <input className="min-w-0 flex-1 outline-none" value={filters.source_id || ''} onChange={(event) => setFilters({ ...filters, source_id: event.target.value })} />
              </div>
            </label>
            <button type="button" onClick={() => setFilters({})} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Clear filters
            </button>
          </div>
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Sandbox Providers</h2>
          <div className="mt-4 grid gap-3">
            {(['khalti', 'esewa', 'stripe'] as const).map((provider) => (
              <label key={provider} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                <span className="capitalize">{provider} sandbox</span>
                <input type="checkbox" checked={Boolean(settings?.payment_settings?.[provider]?.enabled)} onChange={(event) => toggleProvider(provider, event.target.checked)} />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Stripe Sandbox Settings</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Publishable key
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                value={stripeSettingsForm.publishable_key}
                onChange={(event) => setStripeSettingsForm({ ...stripeSettingsForm, publishable_key: event.target.value })}
                placeholder="pk_test_..."
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Secret key
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                value={stripeSettingsForm.secret_key}
                onChange={(event) => setStripeSettingsForm({ ...stripeSettingsForm, secret_key: event.target.value })}
                placeholder="sk_test_... or leave masked value unchanged"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Success URL
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                value={stripeSettingsForm.success_url}
                onChange={(event) => setStripeSettingsForm({ ...stripeSettingsForm, success_url: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Cancel URL
              <input
                className="rounded-lg border border-slate-200 px-3 py-2"
                value={stripeSettingsForm.cancel_url}
                onChange={(event) => setStripeSettingsForm({ ...stripeSettingsForm, cancel_url: event.target.value })}
              />
            </label>
            <button
              type="button"
              disabled={stripeSettingsState.saving}
              onClick={saveStripeSettings}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {stripeSettingsState.saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Save Stripe settings
            </button>
            <p className="text-xs text-slate-500">Masked secret keys are preserved unless you replace them with a new test key.</p>
            {stripeSettingsState.message && <p className="text-sm text-emerald-700">{stripeSettingsState.message}</p>}
            {stripeSettingsState.error && <p className="text-sm text-red-600">{stripeSettingsState.error}</p>}
          </div>
        </section>

        <form onSubmit={handleCreate} className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Create Intent</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Source
              <select className="rounded-lg border border-slate-200 px-3 py-2" value={form.source_module} onChange={(event) => setForm({ ...form, source_module: event.target.value as PaymentSourceModule })}>
                {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Source ID
              <input className="rounded-lg border border-slate-200 px-3 py-2" value={form.source_id} onChange={(event) => setForm({ ...form, source_id: event.target.value })} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Amount
                <input type="number" min="0.01" step="0.01" className="rounded-lg border border-slate-200 px-3 py-2" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Currency
                <input className="rounded-lg border border-slate-200 px-3 py-2" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Provider
              <select className="rounded-lg border border-slate-200 px-3 py-2" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as PaymentProvider })}>
                {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Idempotency key
              <input className="rounded-lg border border-slate-200 px-3 py-2" value={form.idempotency_key} onChange={(event) => setForm({ ...form, idempotency_key: event.target.value })} placeholder="Auto-filled if blank" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Description
              <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <button disabled={createIntent.isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1F5E3B] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
              {createIntent.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Create intent
            </button>
            {createIntent.isError && <p className="text-sm text-red-600">Could not create payment intent.</p>}
          </div>
        </form>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-base font-semibold text-slate-900">Intent Register</h2>
          </div>
          {loadingRows && <p className="p-5 text-sm text-slate-500">Loading payment intents...</p>}
          {rowsError && <p className="p-5 text-sm text-red-600">Could not load payment intents.</p>}
          {!loadingRows && !rowsError && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Settlement</th>
                    <th className="px-4 py-3">Reference / Note</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleIntents.map((intent) => (
                    <tr key={intent.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{statusLabel(intent.source_module)}</p>
                        <p className="text-xs text-slate-500">{intent.source_id}</p>
                        {sourceLink(intent) && <a className="mt-1 inline-block text-xs font-semibold text-[#1F5E3B]" href={sourceLink(intent)}>Open source</a>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium capitalize text-slate-800">{intent.provider}</p>
                        <p className="text-xs text-slate-500">{intent.provider_reference || '-'}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatMoney(intent.amount, intent.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[intent.status]}`}>{statusLabel(intent.status)}</span>
                        {intent.failure_message && <p className="mt-1 max-w-48 text-xs text-red-600">{intent.failure_message}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${settlementStyles[intent.settlement_status]}`}>{statusLabel(intent.settlement_status)}</span>
                        {intent.settlement_message && <p className="mt-1 max-w-48 text-xs text-slate-500">{intent.settlement_message}</p>}
                        {intent.follow_up_status !== 'none' && <p className="mt-1 text-xs font-semibold capitalize text-slate-600">Follow-up: {statusLabel(intent.follow_up_status)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                          value={actionNotes[intent.id] || ''}
                          onChange={(event) => setActionNotes({ ...actionNotes, [intent.id]: event.target.value })}
                          placeholder={intent.provider === 'stripe' ? 'Stripe test payment method' : 'Reference or note'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <IconButton label="Processing" disabled={intentAction.isPending || ['succeeded', 'failed', 'canceled'].includes(intent.status)} onClick={() => runAction(intent, 'processing')} icon={<RefreshCw size={15} />} />
                          <IconButton label="Succeed" disabled={intentAction.isPending || ['succeeded', 'canceled'].includes(intent.status)} onClick={() => runAction(intent, 'succeed')} icon={<CheckCircle2 size={15} />} />
                          <IconButton label="Fail" disabled={intentAction.isPending || ['succeeded', 'failed', 'canceled'].includes(intent.status)} onClick={() => runAction(intent, 'fail')} icon={<XCircle size={15} />} />
                          <IconButton label="Cancel" disabled={intentAction.isPending || ['succeeded', 'canceled'].includes(intent.status)} onClick={() => runAction(intent, 'cancel')} icon={<CircleSlash size={15} />} />
                          <IconButton label="Reconcile" disabled={intentAction.isPending || intent.status !== 'succeeded' || intent.settlement_status === 'settled'} onClick={() => runAction(intent, 'reconcile')} icon={<CheckCircle2 size={15} />} />
                          {intent.provider === 'khalti' && <IconButton label="Initiate Khalti" disabled={providerAction.isPending || intent.status === 'succeeded'} onClick={() => providerAction.mutate({ intentId: intent.id, action: 'initiate-khalti' })} icon={<Plus size={15} />} />}
                          {intent.provider === 'khalti' && <IconButton label="Lookup Khalti" disabled={providerAction.isPending || !intent.provider_reference || intent.status === 'succeeded'} onClick={() => providerAction.mutate({ intentId: intent.id, action: 'lookup-khalti' })} icon={<RefreshCw size={15} />} />}
                          {intent.provider === 'esewa' && <IconButton label="Initiate eSewa" disabled={providerAction.isPending || intent.status === 'succeeded'} onClick={() => providerAction.mutate({ intentId: intent.id, action: 'initiate-esewa' })} icon={<Plus size={15} />} />}
                          {intent.provider === 'stripe' && <IconButton label="Initiate Stripe" disabled={providerAction.isPending || intent.status === 'succeeded'} onClick={() => providerAction.mutate({ intentId: intent.id, action: 'initiate-stripe' })} icon={<Plus size={15} />} />}
                          {intent.provider === 'stripe' && <IconButton label="Confirm Stripe Test" disabled={providerAction.isPending || !intent.provider_reference || ['succeeded', 'failed', 'canceled'].includes(intent.status)} onClick={() => providerAction.mutate({ intentId: intent.id, action: 'confirm-stripe', payload: { payment_method: actionNotes[intent.id] || 'pm_card_visa' } })} icon={<CheckCircle2 size={15} />} />}
                          <TextButton label="Review" disabled={followUpAction.isPending || intent.follow_up_status === 'in_review'} onClick={() => runFollowUp(intent, 'in_review')} />
                          <TextButton label="Resolve" disabled={followUpAction.isPending || intent.follow_up_status === 'resolved'} onClick={() => runFollowUp(intent, 'resolved')} />
                        </div>
                        {typeof intent.provider_payload?.payment_url === 'string' && <a className="mt-2 inline-block text-xs font-semibold text-[#1F5E3B]" href={intent.provider_payload.payment_url as string} target="_blank" rel="noreferrer">Open hosted payment</a>}
                        {intent.provider === 'stripe' && typeof intent.provider_payload?.client_secret === 'string' && <p className="mt-2 max-w-64 break-all text-xs text-slate-500">Client secret: {intent.provider_payload.client_secret as string}</p>}
                      </td>
                    </tr>
                  ))}
                  {!visibleIntents.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No payment intents yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-white px-5 py-4 shadow-sm">
    <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
  </div>
);

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) => (
  <label className="grid gap-1 text-sm font-medium text-slate-700">
    {label}
    <select className="rounded-lg border border-slate-200 px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

const IconButton = ({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void }) => (
  <button
    type="button"
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
  >
    {icon}
  </button>
);

const TextButton = ({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
  >
    {label}
  </button>
);

export default Payments;
