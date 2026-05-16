import React, { useMemo, useState } from 'react';
import { useAuditLogs } from '../hooks/audit';
import { AuditLog } from '../types/audit';

const actionClass: Record<AuditLog['action'], string> = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-amber-50 text-amber-700',
  delete: 'bg-rose-50 text-rose-700',
};

const formatChangeSummary = (changes: Record<string, any>) => {
  const fields = Object.keys(changes || {});
  if (fields.includes('after')) return 'New record created';
  if (fields.includes('before')) return 'Record removed';
  if (!fields.length) return 'No field changes captured';
  return fields.slice(0, 4).join(', ') + (fields.length > 4 ? ` +${fields.length - 4}` : '');
};

const AuditLogs: React.FC = () => {
  const { data: logs, isLoading, error } = useAuditLogs();
  const [actionFilter, setActionFilter] = useState<AuditLog['action'] | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [search, setSearch] = useState('');

  const modules = useMemo(() => Array.from(new Set((logs || []).map((log) => log.module))).sort(), [logs]);
  const visibleLogs = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (logs || []).filter((log) => {
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
      const text = [log.actor_email, log.object_type, log.object_repr, log.object_id, log.metadata?.path].filter(Boolean).join(' ').toLowerCase();
      return matchesAction && matchesModule && (!value || text.includes(value));
    });
  }, [actionFilter, logs, moduleFilter, search]);

  if (isLoading) return <div className="p-6 text-slate-600">Loading audit logs...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading audit logs</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Governance</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-600">Review tenant activity across reservations, rooms, housekeeping, maintenance, inventory, restaurant, accounting, and HRMS.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs text-slate-500">
          <span>
            <strong className="block text-lg text-slate-900">{logs?.length || 0}</strong>
            recent logs
          </span>
          <span>
            <strong className="block text-lg text-slate-900">{logs?.filter((log) => log.action === 'update').length || 0}</strong>
            updates
          </span>
          <span>
            <strong className="block text-lg text-slate-900">{logs?.filter((log) => log.action === 'delete').length || 0}</strong>
            deletes
          </span>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actor, object, ID, or path"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as AuditLog['action'] | 'all')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All modules</option>
            {modules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3">Changes</th>
                <th className="px-4 py-3">Request</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLogs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-slate-600">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {log.actor_details?.full_name || log.actor_email || 'System'}
                    {log.actor_email && <span className="block text-xs text-slate-500">{log.actor_email}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${actionClass[log.action]}`}>{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="font-medium text-slate-900">{log.object_repr || log.object_type}</span>
                    <span className="block text-xs text-slate-500">{log.object_type} - {log.object_id.slice(0, 12)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatChangeSummary(log.changes)}
                    {log.action === 'update' && (
                      <span className="block max-w-md truncate text-xs text-slate-500">
                        {Object.entries(log.changes)
                          .slice(0, 2)
                          .map(([field, value]) => `${field}: ${value?.before ?? '-'} -> ${value?.after ?? '-'}`)
                          .join('; ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.metadata?.method || '-'}
                    <span className="block max-w-xs truncate text-xs text-slate-500">{log.metadata?.path || 'No request context'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleLogs.length === 0 && <p className="p-4 text-sm text-slate-600">No audit logs match the current filters.</p>}
      </section>
    </div>
  );
};

export default AuditLogs;
