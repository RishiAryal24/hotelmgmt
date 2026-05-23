import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Cable, CheckCircle2, Clock3, Download, Link2, RefreshCw, Save, Search, Send, XCircle } from 'lucide-react';
import { useRatePlans, useRoomTypes } from '../hooks/bookings';
import { useCreateOTAChannel, useCreateOTARateMapping, useCreateOTARoomMapping, useCreateZodomusTestReservation, useOTAActivateRooms, useOTAChannels, useOTAConnectionCheck, useOTADiscoverInventory, useOTAPullReservations, useOTARateMappings, useOTAReservationImportAction, useOTAReservationImports, useOTARoomMappings, useOTASyncAction, useOTASyncJobs, useOTAWebhookEvents, useUpdateOTAChannel } from '../hooks/integrations';
import { OTAChannel } from '../types/integrations';

const today = new Date().toISOString().slice(0, 10);
const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const providerLabels: Record<OTAChannel['provider'], string> = {
  zodomus: 'Zodomus',
  booking_com: 'Booking.com',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  manual: 'Manual',
};

const isSeededLocalZodomusChannel = (channel: OTAChannel) =>
  channel.provider === 'zodomus' && Boolean(channel.settings?.test_mode) && channel.code === 'zodomus-local-test';

const statusClass = {
  queued: 'bg-slate-100 text-slate-700',
  running: 'bg-sky-50 text-sky-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
};

const webhookStatusClass = {
  received: 'bg-slate-100 text-slate-700',
  processed: 'bg-emerald-50 text-emerald-700',
  duplicate: 'bg-amber-50 text-amber-700',
  failed: 'bg-rose-50 text-rose-700',
};

const importStatusClass = {
  pending: 'bg-sky-50 text-sky-700',
  conflict: 'bg-rose-50 text-rose-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-600',
  canceled: 'bg-amber-50 text-amber-700',
};

const Integrations = () => {
  const { data: channels = [], isLoading: channelsLoading, isError: channelsError } = useOTAChannels();
  const { data: roomMappings = [] } = useOTARoomMappings();
  const { data: rateMappings = [] } = useOTARateMappings();
  const { data: jobs = [] } = useOTASyncJobs();
  const { data: webhooks = [] } = useOTAWebhookEvents();
  const { data: reservationImports = [] } = useOTAReservationImports();
  const { data: roomTypes = [] } = useRoomTypes();
  const { data: ratePlans = [] } = useRatePlans();
  const createChannel = useCreateOTAChannel();
  const updateChannel = useUpdateOTAChannel();
  const createRoomMapping = useCreateOTARoomMapping();
  const createRateMapping = useCreateOTARateMapping();
  const syncAction = useOTASyncAction();
  const connectionCheck = useOTAConnectionCheck();
  const discoverInventory = useOTADiscoverInventory();
  const activateRooms = useOTAActivateRooms();
  const pullReservations = useOTAPullReservations();
  const testReservation = useCreateZodomusTestReservation();
  const importAction = useOTAReservationImportAction();
  const [syncRange, setSyncRange] = useState({ date_from: today, date_to: weekAhead });
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [channelForm, setChannelForm] = useState({
    name: 'Zodomus',
    code: 'zodomus',
    provider: 'zodomus' as OTAChannel['provider'],
    base_url: 'https://api.zodomus.com',
    api_key: '',
    api_secret: '',
    channel_id: '',
    property_id: '',
    test_mode: true,
  });
  const [mappingForm, setMappingForm] = useState({
    channel: '',
    room_type: '',
    external_room_type_id: '',
    rate_plan: '',
    external_rate_plan_id: '',
  });
  const [testReservationForm, setTestReservationForm] = useState({
    channel: '',
    external_room_type_id: '',
    external_rate_plan_id: '',
    check_in_date: today,
    check_out_date: weekAhead,
    guest_first_name: 'Sandbox',
    guest_last_name: 'Guest',
    guest_email: 'sandbox.guest@example.com',
    total_amount: '100.00',
  });
  const [providerFeedback, setProviderFeedback] = useState('');

  const visibleChannels = useMemo(() => channels.filter((channel) => !isSeededLocalZodomusChannel(channel)), [channels]);

  const selectedChannel = visibleChannels.find((channel) => String(channel.id) === selectedChannelId) || null;
  const zodomusChannels = useMemo(() => visibleChannels.filter((channel) => channel.provider === 'zodomus'), [visibleChannels]);
  const preferredLiveZodomusChannel = useMemo(
    () => zodomusChannels.find((channel) => !isSeededLocalZodomusChannel(channel)) || zodomusChannels[0] || null,
    [zodomusChannels],
  );
  const selectableTestChannels = useMemo(
    () => zodomusChannels.filter((channel) => !isSeededLocalZodomusChannel(channel)),
    [zodomusChannels],
  );

  useEffect(() => {
    if (!selectedChannelId) return;
    if (!selectedChannel) return;
    setChannelForm({
      name: selectedChannel.name,
      code: selectedChannel.code,
      provider: selectedChannel.provider,
      base_url: selectedChannel.base_url || 'https://api.zodomus.com',
      api_key: '',
      api_secret: '',
      channel_id: String(selectedChannel.settings?.channel_id || ''),
      property_id: String(selectedChannel.settings?.property_id || ''),
      test_mode: Boolean(selectedChannel.settings?.test_mode),
    });
  }, [selectedChannel, selectedChannelId]);

  useEffect(() => {
    const availableTestChannels = selectableTestChannels.length ? selectableTestChannels : zodomusChannels;
    if (!availableTestChannels.length) return;
    if (testReservationForm.channel && availableTestChannels.some((channel) => String(channel.id) === testReservationForm.channel)) return;
    setTestReservationForm((current) => ({
      ...current,
      channel: String((preferredLiveZodomusChannel || availableTestChannels[0]).id),
    }));
  }, [preferredLiveZodomusChannel, selectableTestChannels, testReservationForm.channel, zodomusChannels]);

  const submitChannel = (event: FormEvent) => {
    event.preventDefault();
    setProviderFeedback('');
    const payload = {
      ...channelForm,
      code: channelForm.code.trim().toLowerCase().replace(/\s+/g, '-'),
      settings: {
        ...(selectedChannel?.settings || {}),
        channel_id: channelForm.channel_id ? Number(channelForm.channel_id) : '',
        property_id: channelForm.property_id,
        test_mode: channelForm.test_mode,
      },
      sync_direction: selectedChannel?.sync_direction || 'both',
      is_active: selectedChannel?.is_active ?? true,
    };
    if (selectedChannel) {
      const updatePayload: Record<string, unknown> = { ...payload };
      if (!channelForm.api_key.trim()) delete updatePayload.api_key;
      if (!channelForm.api_secret.trim()) delete updatePayload.api_secret;
      updateChannel.mutate(
        {
          channelId: selectedChannel.id,
          payload: updatePayload,
        },
        {
          onSuccess: (channel) => {
            setProviderFeedback(`Saved channel settings for ${channel.name}.`);
            setChannelForm((current) => ({
              ...current,
              api_key: '',
              api_secret: '',
              channel_id: String(channel.settings?.channel_id || ''),
              property_id: String(channel.settings?.property_id || ''),
            }));
          },
        },
      );
      return;
    }
    createChannel.mutate(payload, {
      onSuccess: (channel) => {
        setSelectedChannelId(String(channel.id));
        setProviderFeedback(`Created channel ${channel.name}.`);
        setChannelForm({
          name: channel.name,
          code: channel.code,
          provider: channel.provider,
          base_url: channel.base_url || 'https://api.zodomus.com',
          api_key: '',
          api_secret: '',
          channel_id: String(channel.settings?.channel_id || ''),
          property_id: String(channel.settings?.property_id || ''),
          test_mode: Boolean(channel.settings?.test_mode),
        });
      },
    });
  };

  const runSync = (channel: OTAChannel, action: 'sync-availability' | 'sync-rates') => {
    syncAction.mutate({ channelId: channel.id, action, ...syncRange });
  };

  const visibleRoomMappings = useMemo(() => roomMappings.filter((mapping) => visibleChannels.some((channel) => channel.id === mapping.channel)), [roomMappings, visibleChannels]);
  const visibleRateMappings = useMemo(() => rateMappings.filter((mapping) => visibleChannels.some((channel) => channel.id === mapping.channel)), [rateMappings, visibleChannels]);
  const visibleJobs = useMemo(() => jobs.filter((job) => visibleChannels.some((channel) => channel.id === job.channel)), [jobs, visibleChannels]);
  const visibleWebhooks = useMemo(() => webhooks.filter((event) => visibleChannels.some((channel) => channel.id === event.channel)), [webhooks, visibleChannels]);
  const visibleReservationImports = useMemo(
    () => reservationImports.filter((reservationImport) => visibleChannels.some((channel) => channel.id === reservationImport.channel)),
    [reservationImports, visibleChannels],
  );

  const metrics = useMemo(
    () => ({
      active: visibleChannels.filter((channel) => channel.is_active).length,
      roomMappings: visibleRoomMappings.length,
      rateMappings: visibleRateMappings.length,
      failedJobs: visibleJobs.filter((job) => job.status === 'failed').length,
      importsNeedingReview: visibleReservationImports.filter((reservationImport) => ['pending', 'conflict'].includes(reservationImport.status)).length,
    }),
    [visibleChannels, visibleJobs, visibleRateMappings, visibleReservationImports, visibleRoomMappings],
  );

  const selectedMappingChannel = Number(mappingForm.channel || visibleChannels[0]?.id || 0);
  const selectedTestChannel = Number(testReservationForm.channel || preferredLiveZodomusChannel?.id || zodomusChannels[0]?.id || visibleChannels[0]?.id || 0);

  const submitRoomMapping = (event: FormEvent) => {
    event.preventDefault();
    createRoomMapping.mutate(
      {
        channel: selectedMappingChannel,
        room_type: mappingForm.room_type,
        external_room_type_id: mappingForm.external_room_type_id,
        is_active: true,
      },
      { onSuccess: () => setMappingForm({ ...mappingForm, room_type: '', external_room_type_id: '' }) },
    );
  };

  const submitRateMapping = (event: FormEvent) => {
    event.preventDefault();
    createRateMapping.mutate(
      {
        channel: selectedMappingChannel,
        rate_plan: mappingForm.rate_plan,
        external_rate_plan_id: mappingForm.external_rate_plan_id,
        is_active: true,
      },
      { onSuccess: () => setMappingForm({ ...mappingForm, rate_plan: '', external_rate_plan_id: '' }) },
    );
  };

  const submitTestReservation = (event: FormEvent) => {
    event.preventDefault();
    const { channel: _channel, ...payload } = testReservationForm;
    testReservation.mutate({ channelId: selectedTestChannel, payload });
  };

  const reviewImport = (importId: number, action: 'accept' | 'reject' | 'apply-modification' | 'apply-cancellation') => {
    const notes = window.prompt(action === 'reject' ? 'Rejection note' : 'Review note', '');
    if (notes === null) return;
    importAction.mutate({ importId, action, notes });
  };

  if (channelsLoading) return <div className="p-6 text-slate-600">Loading integrations...</div>;
  if (channelsError) return <div className="p-6 text-rose-600">Could not load integrations.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Connectivity</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">OTA Channels</h1>
          <p className="mt-1 text-sm text-slate-600">Manage channel mappings, push availability/rates, and inspect webhook activity.</p>
        </div>
        <div className="grid grid-cols-5 gap-2 text-right text-xs text-slate-500">
          <Metric label="active" value={metrics.active} />
          <Metric label="rooms" value={metrics.roomMappings} />
          <Metric label="rates" value={metrics.rateMappings} />
          <Metric label="review" value={metrics.importsNeedingReview} tone={metrics.importsNeedingReview ? 'text-rose-700' : 'text-slate-900'} />
          <Metric label="failed" value={metrics.failedJobs} tone={metrics.failedJobs ? 'text-rose-700' : 'text-slate-900'} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <form onSubmit={submitChannel} className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Channel</h2>
            <div className="mt-4 grid gap-3">
              <select value={selectedChannelId} onChange={(event) => setSelectedChannelId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Create new channel</option>
                {visibleChannels.map((channel) => <option key={channel.id} value={channel.id}>Edit {channel.name}</option>)}
              </select>
              <input value={channelForm.name} onChange={(event) => setChannelForm({ ...channelForm, name: event.target.value })} placeholder="Channel name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
              <input value={channelForm.code} onChange={(event) => setChannelForm({ ...channelForm, code: event.target.value })} placeholder="Code" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
              <select value={channelForm.provider} onChange={(event) => setChannelForm({ ...channelForm, provider: event.target.value as OTAChannel['provider'] })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input value={channelForm.base_url} onChange={(event) => setChannelForm({ ...channelForm, base_url: event.target.value })} placeholder="Provider base URL" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={channelForm.api_key} onChange={(event) => setChannelForm({ ...channelForm, api_key: event.target.value })} placeholder="Zodomus API user" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="password" value={channelForm.api_secret} onChange={(event) => setChannelForm({ ...channelForm, api_secret: event.target.value })} placeholder="Zodomus API password" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={channelForm.channel_id} onChange={(event) => setChannelForm({ ...channelForm, channel_id: event.target.value })} placeholder="Zodomus channel ID (for example 1 = Booking.com)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={channelForm.property_id} onChange={(event) => setChannelForm({ ...channelForm, property_id: event.target.value })} placeholder="Zodomus property ID (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                Local test mode
                <input type="checkbox" checked={channelForm.test_mode} onChange={(event) => setChannelForm({ ...channelForm, test_mode: event.target.checked })} />
              </label>
              <button disabled={createChannel.isPending || updateChannel.isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1F5E3B] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
                {selectedChannel ? <Save size={16} /> : <Cable size={16} />}
                {selectedChannel ? 'Save channel' : 'Add channel'}
              </button>
              {providerFeedback && <p className="text-xs text-emerald-700">{providerFeedback}</p>}
              {selectedChannel && (
                <p className="text-xs text-slate-500">
                  Leave `API user` or `API password` blank if you only want to update `property_id` or test mode without replacing saved credentials.
                </p>
              )}
            </div>
          </form>

          <section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Sync Range</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input type="date" value={syncRange.date_from} onChange={(event) => setSyncRange({ ...syncRange, date_from: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="date" value={syncRange.date_to} onChange={(event) => setSyncRange({ ...syncRange, date_to: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </section>

          <section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Mappings</h2>
            <div className="mt-4 grid gap-3">
              <select value={mappingForm.channel || String(visibleChannels[0]?.id || '')} onChange={(event) => setMappingForm({ ...mappingForm, channel: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {visibleChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              <form onSubmit={submitRoomMapping} className="grid gap-2 border-t border-slate-100 pt-3">
                <select value={mappingForm.room_type} onChange={(event) => setMappingForm({ ...mappingForm, room_type: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Local room type</option>
                  {roomTypes.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name} ({roomType.code})</option>)}
                </select>
                <input value={mappingForm.external_room_type_id} onChange={(event) => setMappingForm({ ...mappingForm, external_room_type_id: event.target.value })} placeholder="Zodomus room ID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                <button disabled={createRoomMapping.isPending || !selectedMappingChannel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">Map room type</button>
              </form>
              <form onSubmit={submitRateMapping} className="grid gap-2 border-t border-slate-100 pt-3">
                <select value={mappingForm.rate_plan} onChange={(event) => setMappingForm({ ...mappingForm, rate_plan: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
                  <option value="">Local rate plan</option>
                  {ratePlans.map((ratePlan) => <option key={ratePlan.id} value={ratePlan.id}>{ratePlan.name}</option>)}
                </select>
                <input value={mappingForm.external_rate_plan_id} onChange={(event) => setMappingForm({ ...mappingForm, external_rate_plan_id: event.target.value })} placeholder="Zodomus rate ID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                <button disabled={createRateMapping.isPending || !selectedMappingChannel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">Map rate plan</button>
              </form>
            </div>
          </section>

          <form onSubmit={submitTestReservation} className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Zodomus Test Reservation</h2>
            <div className="mt-4 grid gap-3">
              <select value={testReservationForm.channel || String(selectedTestChannel || '')} onChange={(event) => setTestReservationForm({ ...testReservationForm, channel: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
                {(selectableTestChannels.length ? selectableTestChannels : zodomusChannels).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              <input value={testReservationForm.external_room_type_id} onChange={(event) => setTestReservationForm({ ...testReservationForm, external_room_type_id: event.target.value })} placeholder="Zodomus room ID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={testReservationForm.external_rate_plan_id} onChange={(event) => setTestReservationForm({ ...testReservationForm, external_rate_plan_id: event.target.value })} placeholder="Zodomus rate ID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={testReservationForm.check_in_date} onChange={(event) => setTestReservationForm({ ...testReservationForm, check_in_date: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
                <input type="date" value={testReservationForm.check_out_date} onChange={(event) => setTestReservationForm({ ...testReservationForm, check_out_date: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={testReservationForm.guest_first_name} onChange={(event) => setTestReservationForm({ ...testReservationForm, guest_first_name: event.target.value })} placeholder="First name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input value={testReservationForm.guest_last_name} onChange={(event) => setTestReservationForm({ ...testReservationForm, guest_last_name: event.target.value })} placeholder="Last name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <input value={testReservationForm.guest_email} onChange={(event) => setTestReservationForm({ ...testReservationForm, guest_email: event.target.value })} placeholder="Guest email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" min="0" step="0.01" value={testReservationForm.total_amount} onChange={(event) => setTestReservationForm({ ...testReservationForm, total_amount: event.target.value })} placeholder="Total amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button disabled={testReservation.isPending || !selectedTestChannel} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:text-slate-300">
                <Send size={16} />
                Create test reservation
              </button>
            </div>
          </form>

          <section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Local Inventory</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Metric label="room types" value={roomTypes.length} />
              <Metric label="rate plans" value={ratePlans.length} />
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-base font-semibold text-slate-900">Channels</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Mappings</th>
                  <th className="px-4 py-3">Last sync</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleChannels.map((channel) => (
                  <tr key={channel.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{channel.name}</p>
                      <p className="text-xs text-slate-500">{channel.code}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${channel.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{channel.is_active ? 'active' : 'inactive'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {providerLabels[channel.provider]}
                      <p className="mt-1 text-xs text-slate-500">{channel.base_url || 'No endpoint configured'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="block">{channel.room_type_mapping_count || 0} room types</span>
                      <span className="block text-xs text-slate-500">{channel.rate_plan_mapping_count || 0} rate plans</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{channel.last_sync ? new Date(channel.last_sync).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <IconButton label="Sync availability" disabled={syncAction.isPending || !channel.is_active} onClick={() => runSync(channel, 'sync-availability')} icon={<Send size={15} />} />
                        <IconButton label="Sync rates" disabled={syncAction.isPending || !channel.is_active} onClick={() => runSync(channel, 'sync-rates')} icon={<RefreshCw size={15} />} />
                        {channel.provider === 'zodomus' && (
                          <>
                            <button
                              type="button"
                              disabled={connectionCheck.isPending || !channel.is_active}
                              onClick={() => connectionCheck.mutate(channel.id, {
                                onSuccess: (result) => {
                                  setProviderFeedback(result.property_id ? `Zodomus connected. Property ID: ${result.property_id}` : 'Zodomus connection check succeeded.');
                                },
                                onError: (error: any) => setProviderFeedback(error?.response?.data?.error || 'Zodomus connection check failed.'),
                              })}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Cable size={15} />
                              {connectionCheck.isPending ? 'Checking...' : 'Check Zodomus'}
                            </button>
                            <button
                              type="button"
                              disabled={activateRooms.isPending || !channel.is_active}
                              onClick={() => activateRooms.mutate(channel.id, {
                                onSuccess: (result) => {
                                  const providerData = JSON.stringify(result.provider_response || {}, null, 2);
                                  setProviderFeedback(`Room activation succeeded.\n${providerData}`);
                                },
                                onError: (error: any) => setProviderFeedback(error?.response?.data?.error || 'Room activation failed.'),
                              })}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Link2 size={15} />
                              {activateRooms.isPending ? 'Activating...' : 'Activate Rooms'}
                            </button>
                            <button
                              type="button"
                              disabled={pullReservations.isPending || !channel.is_active}
                              onClick={() => pullReservations.mutate(channel.id, {
                                onSuccess: (job) => {
                                  const processed = job.summary?.processed ? JSON.stringify(job.summary.processed, null, 2) : '';
                                  setProviderFeedback(`Reservation pull succeeded. Processed ${job.summary?.records ?? 0} reservation(s).\n${processed}`);
                                },
                                onError: (error: any) => setProviderFeedback(error?.response?.data?.error || 'Reservation pull failed.'),
                              })}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Download size={15} />
                              {pullReservations.isPending ? 'Pulling...' : 'Pull Reservations'}
                            </button>
                            <button
                              type="button"
                              disabled={discoverInventory.isPending || !channel.is_active}
                              onClick={() => discoverInventory.mutate(channel.id, {
                                onSuccess: (result) => {
                                  const providerData = JSON.stringify(result.provider_response || {}, null, 2);
                                  setProviderFeedback(`Inventory discovery succeeded.\n${providerData}`);
                                },
                                onError: (error: any) => setProviderFeedback(error?.response?.data?.error || 'Inventory discovery failed.'),
                              })}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Search size={15} />
                              {discoverInventory.isPending ? 'Reading...' : 'Discover IDs'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleChannels.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No OTA channels configured yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Provider Feedback</h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950/95 p-4 text-xs text-slate-100">{providerFeedback || 'Run a Zodomus connection check or inventory discovery to inspect the provider response here.'}</pre>
        </section>
        <section className="rounded-lg bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Reservation Imports</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Reservation</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Stay</th>
                  <th className="px-4 py-3">Conflict</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleReservationImports.map((reservationImport) => (
                  <tr key={reservationImport.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{reservationImport.external_reservation_id}</p>
                      <p className="text-xs text-slate-500">{reservationImport.channel_name || reservationImport.channel_code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800">{[reservationImport.guest_first_name, reservationImport.guest_last_name].filter(Boolean).join(' ') || 'Guest'}</p>
                      <p className="text-xs text-slate-500">{reservationImport.guest_email || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {reservationImport.check_in_date || '-'} to {reservationImport.check_out_date || '-'}
                      <p className="text-xs text-slate-500">Room {reservationImport.external_room_type_id || '-'} / Rate {reservationImport.external_rate_plan_id || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {reservationImport.conflict_type}
                      {reservationImport.conflict_message && <p className="mt-1 max-w-xs text-xs text-rose-600">{reservationImport.conflict_message}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${importStatusClass[reservationImport.status]}`}>{reservationImport.status}</span>
                      {reservationImport.booking_reference && <p className="mt-1 text-xs text-slate-500">Booking {reservationImport.booking_reference}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {['pending', 'conflict'].includes(reservationImport.status) ? (
                        <div className="flex flex-wrap gap-2">
                          {reservationImport.conflict_type === 'modification_review' ? (
                            <button type="button" onClick={() => reviewImport(reservationImport.id, 'apply-modification')} disabled={importAction.isPending} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300">Apply change</button>
                          ) : reservationImport.conflict_type === 'cancellation_review' ? (
                            <button type="button" onClick={() => reviewImport(reservationImport.id, 'apply-cancellation')} disabled={importAction.isPending} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:text-slate-300">Cancel booking</button>
                          ) : (
                            <button type="button" onClick={() => reviewImport(reservationImport.id, 'accept')} disabled={importAction.isPending} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300">Accept</button>
                          )}
                          <button type="button" onClick={() => reviewImport(reservationImport.id, 'reject')} disabled={importAction.isPending} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:text-slate-300">Reject</button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{reservationImport.reviewed_by_email || 'Reviewed'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleReservationImports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No OTA reservation imports yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <HistoryPanel title="Sync Jobs" rows={visibleJobs.map((job) => ({
          id: job.id,
          icon: job.status === 'succeeded' ? <CheckCircle2 size={16} /> : job.status === 'failed' ? <XCircle size={16} /> : <Clock3 size={16} />,
          title: `${job.channel_name || job.channel_code || job.channel} - ${job.sync_type.replace('_', ' ')}`,
          detail: job.error_message || `${job.summary?.records ?? 0} record${job.summary?.records === 1 ? '' : 's'}`,
          status: job.status,
          statusClass: statusClass[job.status],
          time: job.created_at,
        }))} />
        <HistoryPanel title="Webhook Events" rows={visibleWebhooks.map((event) => ({
          id: event.id,
          icon: event.status === 'processed' ? <CheckCircle2 size={16} /> : event.status === 'failed' ? <XCircle size={16} /> : <Clock3 size={16} />,
          title: `${event.channel_name || event.channel_code || event.channel} - ${event.event_type || 'event'}`,
          detail: event.external_event_id,
          status: event.status,
          statusClass: webhookStatusClass[event.status],
          time: event.created_at,
        }))} />
      </section>
    </div>
  );
};

const Metric = ({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) => (
  <div>
    <strong className={`block text-lg ${tone}`}>{value}</strong>
    <span>{label}</span>
  </div>
);

const IconButton = ({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled: boolean; onClick: () => void }) => (
  <button type="button" title={label} disabled={disabled} onClick={onClick} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
    {icon}
  </button>
);

const HistoryPanel = ({ title, rows }: { title: string; rows: { id: number; icon: ReactNode; title: string; detail: string; status: string; statusClass: string; time: string }[] }) => (
  <section className="rounded-lg bg-white p-5 shadow-sm">
    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
    <div className="mt-4 divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-3 py-3">
          <span className="mt-0.5 text-slate-500">{row.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{row.title}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{row.detail}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(row.time).toLocaleString()}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.statusClass}`}>{row.status}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="py-4 text-sm text-slate-500">No records yet.</p>}
    </div>
  </section>
);

export default Integrations;
