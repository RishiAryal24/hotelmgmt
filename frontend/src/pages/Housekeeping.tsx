import React, { useMemo, useState } from 'react';
import CompactTabs from '../components/CompactTabs';
import { useRooms } from '../hooks/bookings';
import { useCreateHousekeepingTask, useHousekeepingAction, useHousekeepingTasks } from '../hooks/housekeeping';
import { HousekeepingTask } from '../types/housekeeping';

const taskTypeLabels: Record<HousekeepingTask['task_type'], string> = {
  checkout_clean: 'Checkout Clean',
  stayover_clean: 'Stayover Clean',
  deep_clean: 'Deep Clean',
  inspection: 'Inspection',
  maintenance_escalation: 'Maintenance Escalation',
};

const statusClass: Record<HousekeepingTask['status'], string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  blocked: 'bg-rose-50 text-rose-700',
};

const priorityClass: Record<HousekeepingTask['priority'], string> = {
  low: 'text-slate-500',
  normal: 'text-slate-700',
  high: 'text-amber-700',
  urgent: 'text-rose-700',
};

const emptyTask = {
  room: '',
  task_type: 'checkout_clean' as HousekeepingTask['task_type'],
  priority: 'normal' as HousekeepingTask['priority'],
  notes: '',
};

type HousekeepingTab = HousekeepingTask['status'] | 'create';

const Housekeeping: React.FC = () => {
  const { data: tasks, isLoading, error } = useHousekeepingTasks();
  const { data: rooms } = useRooms();
  const createTask = useCreateHousekeepingTask();
  const taskAction = useHousekeepingAction();
  const [activeTab, setActiveTab] = useState<HousekeepingTab>('open');
  const [formData, setFormData] = useState(emptyTask);

  const counts = useMemo(
    () => ({
      open: tasks?.filter((task) => task.status === 'open').length || 0,
      in_progress: tasks?.filter((task) => task.status === 'in_progress').length || 0,
      blocked: tasks?.filter((task) => task.status === 'blocked').length || 0,
      done: tasks?.filter((task) => task.status === 'done').length || 0,
    }),
    [tasks],
  );

  const visibleTasks = useMemo(
    () => tasks?.filter((task) => activeTab !== 'create' && task.status === activeTab) || [],
    [activeTab, tasks],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTask.mutate(formData, {
      onSuccess: () => {
        setFormData(emptyTask);
        setActiveTab('open');
      },
    });
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading housekeeping tasks...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading housekeeping tasks</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Housekeeping</h1>
          <p className="mt-1 text-sm text-slate-600">Track room readiness, cleaning queues, and maintenance escalations.</p>
        </div>
        <button
          onClick={() => setActiveTab('create')}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Create task
        </button>
      </div>

      <CompactTabs
        tabs={[
          { id: 'open', label: 'Open', count: counts.open },
          { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
          { id: 'blocked', label: 'Blocked', count: counts.blocked },
          { id: 'done', label: 'Done', count: counts.done },
          { id: 'create', label: 'New Task' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as HousekeepingTab)}
      />

      {activeTab === 'create' ? (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4">
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
            <select
              value={formData.task_type}
              onChange={(e) => setFormData({ ...formData, task_type: e.target.value as HousekeepingTask['task_type'] })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {Object.entries(taskTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as HousekeepingTask['priority'] })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Save task
            </button>
          </div>
          {createTask.isError && <p className="mt-3 text-sm text-red-600">Could not create housekeeping task.</p>}
        </form>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTasks.map((task) => (
                  <tr key={task.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      Room {task.room_details?.room_number || '-'}
                      <span className="block text-xs font-normal text-slate-500">{task.room_details?.status || 'room status unknown'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {taskTypeLabels[task.task_type]}
                      {task.notes && <span className="block max-w-sm truncate text-xs text-slate-500">{task.notes}</span>}
                    </td>
                    <td className={`px-4 py-3 font-medium ${priorityClass[task.priority]}`}>{task.priority}</td>
                    <td className="px-4 py-3 text-slate-700">{task.assigned_to_details?.full_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[task.status]}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {['open', 'blocked'].includes(task.status) && (
                          <button
                            onClick={() => taskAction.mutate({ taskId: task.id, action: 'start' })}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                          >
                            Start
                          </button>
                        )}
                        {task.status !== 'done' && (
                          <>
                            <button
                              onClick={() => taskAction.mutate({ taskId: task.id, action: 'complete' })}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => {
                                const notes = window.prompt('Maintenance notes');
                                if (notes !== null) {
                                  taskAction.mutate({ taskId: task.id, action: 'escalate_maintenance', notes });
                                }
                              }}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Escalate
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleTasks.length === 0 && <p className="p-4 text-sm text-slate-600">No {activeTab.replace('_', ' ')} tasks.</p>}
        </section>
      )}
    </div>
  );
};

export default Housekeeping;
