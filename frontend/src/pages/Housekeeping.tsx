import React, { useState } from 'react';
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
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800',
};

const emptyTask = {
  room: '',
  task_type: 'checkout_clean' as HousekeepingTask['task_type'],
  priority: 'normal' as HousekeepingTask['priority'],
  notes: '',
};

const Housekeeping: React.FC = () => {
  const { data: tasks, isLoading, error } = useHousekeepingTasks();
  const { data: rooms } = useRooms();
  const createTask = useCreateHousekeepingTask();
  const taskAction = useHousekeepingAction();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyTask);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTask.mutate(formData, {
      onSuccess: () => {
        setShowForm(false);
        setFormData(emptyTask);
      },
    });
  };

  if (isLoading) return <div className="p-6 text-slate-600">Loading housekeeping tasks...</div>;
  if (error) return <div className="p-6 text-red-600">Error loading housekeeping tasks</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Housekeeping</h1>
          <p className="mt-2 text-slate-600">Track room readiness, cleaning tasks, and maintenance escalations.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'Create Task'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create Housekeeping Task</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <select
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">Select Room</option>
              {rooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.status}
                </option>
              ))}
            </select>
            <select
              value={formData.task_type}
              onChange={(e) => setFormData({ ...formData, task_type: e.target.value as HousekeepingTask['task_type'] })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
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
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          {createTask.isError && <p className="mt-4 text-sm text-red-600">Could not create housekeeping task.</p>}
          <button type="submit" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Create Task
          </button>
        </form>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {tasks?.map((task) => (
          <article key={task.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Room {task.room_details?.room_number} - {taskTypeLabels[task.task_type]}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Priority: {task.priority}</p>
                {task.notes && <p className="mt-3 text-sm text-slate-700">{task.notes}</p>}
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass[task.status]}`}>{task.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['open', 'blocked'].includes(task.status) && (
                <button
                  onClick={() => taskAction.mutate({ taskId: task.id, action: 'start' })}
                  className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Start
                </button>
              )}
              {task.status !== 'done' && (
                <button
                  onClick={() => taskAction.mutate({ taskId: task.id, action: 'complete' })}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Mark Clean
                </button>
              )}
              {task.status !== 'done' && (
                <button
                  onClick={() => {
                    const notes = window.prompt('Maintenance notes');
                    if (notes !== null) {
                      taskAction.mutate({ taskId: task.id, action: 'escalate_maintenance', notes });
                    }
                  }}
                  className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Escalate
                </button>
              )}
            </div>
          </article>
        ))}
        {tasks?.length === 0 && <p className="text-slate-600">No housekeeping tasks yet.</p>}
      </section>
    </div>
  );
};

export default Housekeeping;
