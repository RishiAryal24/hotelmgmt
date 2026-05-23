import React, { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Mail, MessageSquare, RefreshCcw, Smartphone } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGuestFollowUpAction, useGuestFollowUps } from '../hooks/bookings';
import { useNotificationDeliveryAction, useNotificationEvents, useNotificationTemplates, useNotificationTestDelivery, useNotificationWorkflowAction } from '../hooks/notifications';
import { getCurrentUser } from '../services/auth';
import { canAccess } from '../services/permissions';
import { getTenantSettings, updateTenantSettings } from '../services/tenantSettings';
import { NotificationEvent } from '../types/notifications';

const statusClass: Record<NotificationEvent['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-50 text-sky-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  canceled: 'bg-slate-100 text-slate-500',
};

const priorityClass: Record<NotificationEvent['priority'], string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-rose-50 text-rose-700',
};

const workflowClass: Record<NotificationEvent['workflow_status'], string> = {
  open: 'bg-rose-50 text-rose-700',
  acknowledged: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
};

const channelIcon = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageSquare,
  in_app: Bell,
  system: RefreshCcw,
};

const Notifications: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: events, isLoading: eventsLoading, error: eventsError } = useNotificationEvents();
  const { data: templates, isLoading: templatesLoading } = useNotificationTemplates();
  const { data: user } = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser });
  const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: getTenantSettings });
  const { data: guestFollowUps } = useGuestFollowUps({ status: 'open' });
  const workflowAction = useNotificationWorkflowAction();
  const deliveryAction = useNotificationDeliveryAction();
  const testDelivery = useNotificationTestDelivery();
  const guestFollowUpAction = useGuestFollowUpAction();
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<NotificationEvent['status'] | 'all'>('all');
  const [workflowFilter, setWorkflowFilter] = useState<NotificationEvent['workflow_status'] | 'all'>('all');
  const [search, setSearch] = useState('');
  const [testRecipient, setTestRecipient] = useState({ email: '', sms: '', whatsapp: '' });
  const canUpdateNotifications = canAccess(user, ['notifications.event.update']);
  const canManageTemplates = canAccess(user, ['notifications.template.manage']);
  const canUpdateGuestFollowUps = canAccess(user, ['bookings.reservation.create']);

  const modules = useMemo(() => Array.from(new Set((events || []).map((event) => event.module))).sort(), [events]);
  const visibleEvents = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (events || []).filter((event) => {
      const matchesModule = moduleFilter === 'all' || event.module === moduleFilter;
      const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
      const matchesWorkflow = workflowFilter === 'all' || event.workflow_status === workflowFilter;
      const text = [event.subject, event.message, event.event_type, event.recipient_email, event.recipient_phone].filter(Boolean).join(' ').toLowerCase();
      return matchesModule && matchesStatus && matchesWorkflow && (!value || text.includes(value));
    });
  }, [events, moduleFilter, search, statusFilter, workflowFilter]);

  const counts = useMemo(
    () => ({
      events: events?.length || 0,
      open: events?.filter((event) => event.workflow_status === 'open').length || 0,
      failed: events?.filter((event) => event.status === 'failed').length || 0,
      urgent: events?.filter((event) => event.priority === 'urgent').length || 0,
      templates: templates?.length || 0,
    }),
    [events, templates],
  );

  if (eventsLoading || templatesLoading) return <div className="p-6 text-slate-600">Loading notifications...</div>;
  if (eventsError) return <div className="p-6 text-red-600">Error loading notifications</div>;

  const submitWorkflowAction = (event: NotificationEvent, action: 'acknowledge' | 'resolve' | 'reopen') => {
    const notes = window.prompt(action === 'resolve' ? 'Resolution or follow-up note' : 'Follow-up note', event.follow_up_notes || '');
    if (notes === null) return;
    workflowAction.mutate({ eventId: event.id, action, notes });
  };

  const submitDeliveryAction = (event: NotificationEvent, action: 'retry' | 'cancel-delivery') => {
    const reason = action === 'cancel-delivery' ? window.prompt('Cancellation reason', event.error_message || '') : '';
    if (reason === null) return;
    deliveryAction.mutate({ eventId: event.id, action, reason });
  };

  const deliverySettings = settings?.notification_settings || {};
  const openGuestFollowUps = (guestFollowUps || []).slice(0, 6);

  const toggleChannel = (channel: 'sms' | 'whatsapp', enabled: boolean) => {
    updateTenantSettings({
      notification_settings: {
        [channel]: {
          ...(settings?.notification_settings?.[channel] || {}),
          enabled,
          provider: channel === 'sms' ? 'twilio' : 'twilio_whatsapp',
        },
      },
    }).then(() => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] }));
  };

  const saveChannelCredentials = (channel: 'sms' | 'whatsapp') => {
    const current = settings?.notification_settings?.[channel] || {};
    const accountSid = window.prompt(`${channel.toUpperCase()} account SID`, current.account_sid || '');
    if (accountSid === null) return;
    const authToken = window.prompt(`${channel.toUpperCase()} auth token`, current.auth_token || '');
    if (authToken === null) return;
    const fromNumber = window.prompt(`${channel.toUpperCase()} sender number`, current.from_number || '');
    if (fromNumber === null) return;
    updateTenantSettings({
      notification_settings: {
        [channel]: {
          ...current,
          provider: channel === 'sms' ? 'twilio' : 'twilio_whatsapp',
          account_sid: accountSid,
          auth_token: authToken,
          from_number: fromNumber,
        },
      },
    }).then(() => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] }));
  };

  const sendTestDelivery = (channel: 'email' | 'sms' | 'whatsapp') => {
    testDelivery.mutate({
      channel,
      recipient_email: channel === 'email' ? testRecipient.email : undefined,
      recipient_phone: channel === 'sms' ? testRecipient.sms : channel === 'whatsapp' ? testRecipient.whatsapp : undefined,
      message: `Test ${channel.replace('_', ' ')} notification from hotel management.`,
    });
  };

  const submitGuestFollowUpAction = (reminderId: string, action: 'complete' | 'snooze' | 'cancel') => {
    const notes = window.prompt(action === 'complete' ? 'Completion note' : 'Follow-up note', '');
    if (notes === null) return;
    if (action === 'snooze') {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      const snoozedUntil = window.prompt('Snooze until', tomorrow);
      if (!snoozedUntil) return;
      guestFollowUpAction.mutate({ reminderId, action, notes, snoozed_until: new Date(snoozedUntil).toISOString() });
      return;
    }
    guestFollowUpAction.mutate({ reminderId, action, notes });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">Review system events, delivery state, and reusable templates across hotel operations.</p>
        </div>
        <div className="grid grid-cols-5 gap-2 text-right text-xs text-slate-500">
          <span><strong className="block text-lg text-slate-900">{counts.events}</strong>events</span>
          <span><strong className="block text-lg text-rose-700">{counts.open}</strong>open</span>
          <span><strong className="block text-lg text-rose-700">{counts.failed}</strong>failed</span>
          <span><strong className="block text-lg text-amber-700">{counts.urgent}</strong>urgent</span>
          <span><strong className="block text-lg text-slate-900">{counts.templates}</strong>templates</span>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {['email', 'sms', 'whatsapp', 'in_app'].map((channel) => {
            const channelSettings = deliverySettings[channel] || {};
            const enabled = channelSettings.enabled !== false && (channel === 'email' || channel === 'in_app' || channelSettings.enabled === true);
            return (
              <div key={channel} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase text-slate-500">{channel.replace('_', ' ')}</p>
                <p className={`mt-1 text-sm font-semibold ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{enabled ? 'Enabled' : 'Disabled'}</p>
                <p className="mt-1 text-xs text-slate-500">{channelSettings.provider || (channel === 'email' ? 'django_email' : channel === 'in_app' ? 'in_app' : 'disabled')}</p>
              </div>
            );
          })}
        </div>
        {canManageTemplates && (
          <div className="mb-4 grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-3">
            {(['sms', 'whatsapp'] as const).map((channel) => {
              const channelSettings = deliverySettings[channel] || {};
              const enabled = Boolean(channelSettings.enabled);
              return (
                <div key={channel} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900">{channel} provider</p>
                      <p className="mt-1 text-xs text-slate-500">{channelSettings.account_sid ? `SID ${channelSettings.account_sid}` : 'No account SID saved'}</p>
                    </div>
                    <input type="checkbox" checked={enabled} onChange={(event) => toggleChannel(channel, event.target.checked)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => saveChannelCredentials(channel)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      Credentials
                    </button>
                    <input
                      value={testRecipient[channel]}
                      onChange={(event) => setTestRecipient({ ...testRecipient, [channel]: event.target.value })}
                      placeholder={channel === 'sms' ? '+9779800000000' : '+9779800000000'}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                    />
                    <button type="button" onClick={() => sendTestDelivery(channel)} disabled={testDelivery.isPending || !testRecipient[channel]} className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:text-slate-300">
                      Test
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Email test</p>
              <p className="mt-1 text-xs text-slate-500">{deliverySettings.email?.provider || 'django_email'}</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={testRecipient.email}
                  onChange={(event) => setTestRecipient({ ...testRecipient, email: event.target.value })}
                  placeholder="manager@example.com"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                />
                <button type="button" onClick={() => sendTestDelivery('email')} disabled={testDelivery.isPending || !testRecipient.email} className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:text-slate-300">
                  Test
                </button>
              </div>
            </div>
            {testDelivery.isError && <p className="text-sm text-rose-600">Test delivery failed; see the latest notification event for provider diagnostics.</p>}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, message, recipient, or event type"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All modules</option>
            {modules.map((module) => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as NotificationEvent['status'] | 'all')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="queued">Queued</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="canceled">Canceled</option>
          </select>
          <select value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value as NotificationEvent['workflow_status'] | 'all')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All follow-up</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Guest follow-ups</h2>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">{guestFollowUps?.length || 0} open</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {openGuestFollowUps.map((reminder) => (
            <article key={reminder.id} className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-sky-700">{reminder.reminder_type.replace('_', ' ')}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">{reminder.priority}</span>
                  </div>
                  <p className="mt-3 font-medium text-slate-900">{reminder.subject}</p>
                  <p className="mt-1 text-sm text-slate-600">{reminder.message}</p>
                  <p className="mt-2 text-xs text-slate-500">{reminder.guest_details?.full_name || reminder.guest_details?.email || 'Guest'} - due {new Date(reminder.due_at).toLocaleString()}</p>
                </div>
                {canUpdateGuestFollowUps && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button onClick={() => submitGuestFollowUpAction(reminder.id, 'complete')} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                      Complete
                    </button>
                    <button onClick={() => submitGuestFollowUpAction(reminder.id, 'snooze')} className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50">
                      Snooze
                    </button>
                    <button onClick={() => submitGuestFollowUpAction(reminder.id, 'cancel')} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
          {openGuestFollowUps.length === 0 && <p className="text-sm text-slate-600">No open guest follow-ups.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEvents.map((event) => {
                const Icon = channelIcon[event.channel];
                return (
                  <tr key={event.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600">{new Date(event.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{event.subject || event.event_type}</div>
                      <div className="mt-1 max-w-xl text-xs text-slate-500">{event.message || 'No message body captured.'}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{event.module}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityClass[event.priority]}`}>{event.priority}</span>
                      </div>
                      {event.follow_up_notes && <div className="mt-2 max-w-xl text-xs text-slate-600">Note: {event.follow_up_notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        <Icon size={16} />
                        {event.channel.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[event.status]}`}>{event.status}</span></td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${workflowClass[event.workflow_status]}`}>{event.workflow_status}</span>
                      {event.acknowledged_by_details && <span className="mt-2 block text-xs text-slate-500">Ack: {event.acknowledged_by_details.full_name || event.acknowledged_by_details.email}</span>}
                      {event.resolved_by_details && <span className="mt-1 block text-xs text-slate-500">Done: {event.resolved_by_details.full_name || event.resolved_by_details.email}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.recipient_user_details?.full_name || event.recipient_email || event.recipient_phone || 'System'}
                      {event.recipient_email && <span className="block text-xs text-slate-500">{event.recipient_email}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {event.provider || '-'}
                      <span className="block text-xs text-slate-500">{event.error_message || `${event.attempts} attempt${event.attempts === 1 ? '' : 's'}`}</span>
                    </td>
                    <td className="px-4 py-3">
                      {canUpdateNotifications ? (
                        <div className="flex flex-wrap gap-2">
                          {event.workflow_status === 'open' && (
                            <button onClick={() => submitWorkflowAction(event, 'acknowledge')} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
                              Acknowledge
                            </button>
                          )}
                          {event.workflow_status !== 'resolved' && (
                            <button onClick={() => submitWorkflowAction(event, 'resolve')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                              <CheckCircle2 size={14} />
                              Resolve
                            </button>
                          )}
                          {event.workflow_status === 'resolved' && (
                            <button onClick={() => submitWorkflowAction(event, 'reopen')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                              Reopen
                            </button>
                          )}
                          {['failed', 'pending'].includes(event.status) && (
                            <button onClick={() => submitDeliveryAction(event, 'retry')} className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50">
                              Retry
                            </button>
                          )}
                          {['pending', 'queued', 'failed'].includes(event.status) && (
                            <button onClick={() => submitDeliveryAction(event, 'cancel-delivery')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">
                              Cancel
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">View only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleEvents.length === 0 && <p className="p-4 text-sm text-slate-600">No notification events match the current filters.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Templates</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(templates || []).map((template) => (
            <article key={template.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-slate-900">{template.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{template.code}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${template.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {template.is_active ? 'active' : 'inactive'}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-slate-600">{template.body_template}</p>
              <p className="mt-3 text-xs uppercase text-slate-500">{template.channel.replace('_', ' ')}</p>
            </article>
          ))}
          {(templates || []).length === 0 && <p className="text-sm text-slate-600">No notification templates configured yet.</p>}
        </div>
      </section>
    </div>
  );
};

export default Notifications;
