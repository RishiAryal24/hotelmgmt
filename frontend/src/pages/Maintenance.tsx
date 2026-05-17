import React, { useMemo, useState } from 'react';
import ActionModal from '../components/ActionModal';
import CompactTabs from '../components/CompactTabs';
import { useRooms } from '../hooks/bookings';
import { useCreateMaintenanceTicket, useMaintenanceAction, useMaintenanceTickets } from '../hooks/maintenance';
import { MaintenanceTicket } from '../types/maintenance';

const categoryLabels: Record<MaintenanceTicket['category'], string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  furniture: 'Furniture',
  appliance: 'Appliance',
  safety: 'Safety',
  other: 'Other',
};

const statusClass: Record<MaintenanceTicket['status'], string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
  canceled: 'bg-rose-50 text-rose-700',
};

const priorityClass: Record<MaintenanceTicket['priority'], string> = {
  low: 'text-slate-500',
  normal: 'text-slate-700',
  high: 'text-amber-700',
  urgent: 'text-rose-700',
};

const emptyTicket = {
  room: '',
  title: '',
  description: '',
  category: 'other' as MaintenanceTicket['category'],
  priority: 'normal' as MaintenanceTicket['priority'],
  due_at: '',
};

type MaintenanceTab = MaintenanceTicket['status'] | 'create';

const Maintenance: React.FC = () => {
  const { data: tickets, isLoading, error } = useMaintenanceTickets();
  const { data: rooms } = useRooms();
  const createTicket = useCreateMaintenanceTicket();
  const ticketAction = useMaintenanceAction();
  const [activeTab, setActiveTab] = useState<MaintenanceTab>('open');
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [resolvingTicket, setResolvingTicket] = useState<MaintenanceTicket | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<MaintenanceTicket['priority'] | 'all'>('all');
  const [formData, setFormData] = useState(emptyTicket);

  const counts = useMemo(
    () => ({
      open: tickets?.filter((ticket) => ticket.status === 'open').length || 0,
      in_progress: tickets?.filter((ticket) => ticket.status === 'in_progress').length || 0,
      resolved: tickets?.filter((ticket) => ticket.status === 'resolved').length || 0,
      closed: tickets?.filter((ticket) => ticket.status === 'closed').length || 0,
      canceled: tickets?.filter((ticket) => ticket.status === 'canceled').length || 0,
    }),
    [tickets],
  );

  const visibleTickets = useMemo(
    () =>
      tickets?.filter((ticket) => {
        if (activeTab === 'create' || ticket.status !== activeTab) return false;
        return priorityFilter === 'all' || ticket.priority === priorityFilter;
      }) || [],
    [activeTab, priorityFilter, tickets],
  );

  const maintenanceRooms = rooms?.filter((room) => room.status === 'maintenance').length || 0;
  const urgentTickets = tickets?.filter((ticket) => ['open', 'in_progress'].includes(ticket.status) && ticket.priority === 'urgent').length || 0;
  const activeTickets = tickets?.filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTicket.mutate(
      {
        ...formData,
        due_at: formData.due_at || undefined,
      },
      {
        onSuccess: () => {
          setFormData(emptyTicket);
          setIsCreateTicketOpen(false);
          setActiveTab('open');
        },
      },
    );
  };

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingTicket) return;
    ticketAction.mutate(
      { ticketId: resolvingTicket.id, action: 'resolve', resolution_notes: resolutionNotes },
      {
        onSuccess: () => {
          setResolvingTicket(null);
          setResolutionNotes('');
        },
      },
    );
  };

  const handleTabChange = (tabId: string) => {
    if (tabId === 'create') {
      setIsCreateTicketOpen(true);
      return;
    }
    setActiveTab(tabId as MaintenanceTab);
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading maintenance tickets...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading maintenance tickets</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Maintenance</h1>
          <p className="mt-1 text-sm text-slate-600">Manage room downtime, repair tickets, and housekeeping escalations.</p>
        </div>
        <button
          onClick={() => setIsCreateTicketOpen(true)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          New ticket
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: 'Active tickets', value: activeTickets },
          { label: 'Urgent tickets', value: urgentTickets },
          { label: 'Rooms offline', value: maintenanceRooms },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <CompactTabs
        tabs={[
          { id: 'open', label: 'Open', count: counts.open },
          { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
          { id: 'resolved', label: 'Resolved', count: counts.resolved },
          { id: 'closed', label: 'Closed', count: counts.closed },
          { id: 'canceled', label: 'Canceled', count: counts.canceled },
          { id: 'create', label: 'New Ticket' },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold capitalize text-slate-900">
                {activeTab.replace('_', ' ')} tickets{priorityFilter !== 'all' ? ` - ${priorityFilter} priority` : ''}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{visibleTickets.length} matching ticket(s)</p>
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as MaintenanceTicket['priority'] | 'all')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTickets.map((ticket) => (
                  <tr key={ticket.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      Room {ticket.room_details?.room_number || '-'}
                      <span className="block text-xs font-normal text-slate-500">{ticket.room_details?.status || 'room status unknown'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {ticket.title}
                      {ticket.description && <span className="block max-w-sm truncate text-xs text-slate-500">{ticket.description}</span>}
                      {ticket.resolution_notes && <span className="block max-w-sm truncate text-xs text-emerald-700">{ticket.resolution_notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{categoryLabels[ticket.category]}</td>
                    <td className={`px-4 py-3 font-medium ${priorityClass[ticket.priority]}`}>{ticket.priority}</td>
                    <td className="px-4 py-3 text-slate-600">{ticket.due_at ? new Date(ticket.due_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[ticket.status]}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {ticket.status === 'open' && (
                          <button
                            onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'start' })}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                          >
                            Start
                          </button>
                        )}
                        {['open', 'in_progress'].includes(ticket.status) && (
                          <>
                            <button
                              onClick={() => {
                                setResolvingTicket(ticket);
                                setResolutionNotes(ticket.resolution_notes || '');
                              }}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'cancel' })}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {ticket.status === 'resolved' && (
                          <button
                            onClick={() => ticketAction.mutate({ ticketId: ticket.id, action: 'close' })}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleTickets.length === 0 && <p className="p-4 text-sm text-slate-600">No {activeTab.replace('_', ' ')} tickets.</p>}
        </section>

      {isCreateTicketOpen && (
        <ActionModal title="Create maintenance ticket" onClose={() => setIsCreateTicketOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={formData.room}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              >
                <option value="">Select room</option>
                {rooms?.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.room_number} - {room.status}
                  </option>
                ))}
              </select>
              <input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Issue title"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as MaintenanceTicket['category'] })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as MaintenanceTicket['priority'] })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                type="datetime-local"
                value={formData.due_at}
                onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description"
                className="min-h-24 rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsCreateTicketOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={createTicket.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Save ticket
              </button>
            </div>
            {createTicket.isError && <p className="mt-3 text-sm text-red-600">Could not create maintenance ticket.</p>}
          </form>
        </ActionModal>
      )}

      {resolvingTicket && (
        <ActionModal
          title={`Resolve ${resolvingTicket.title}`}
          description={`Room ${resolvingTicket.room_details?.room_number || '-'}`}
          onClose={() => setResolvingTicket(null)}
        >
          <form onSubmit={handleResolve}>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Resolution notes"
              className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setResolvingTicket(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={ticketAction.isPending} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                Resolve ticket
              </button>
            </div>
            {ticketAction.isError && <p className="mt-3 text-sm text-red-600">Could not resolve ticket.</p>}
          </form>
        </ActionModal>
      )}
    </div>
  );
};

export default Maintenance;
