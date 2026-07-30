import { useMemo, useState } from 'react';
import { ACTION_TYPES, CALL_ACTION_TYPES } from '../data/constants';
import { EVENT_META } from '../lib/activityLog';
import ActionCenterModal from './ActionCenterModal';

const ACTIVITY_LABELS = {
  ...Object.fromEntries([...ACTION_TYPES, ...CALL_ACTION_TYPES].map(action => [action.value, action.label])),
  ...Object.fromEntries(Object.entries(EVENT_META).map(([value, meta]) => [value, meta.label])),
  dial: 'Outbound dial',
};

const CALL_OUTCOME_LABELS = {
  fresh: 'Fresh',
  no_answer: 'No Answer',
  voicemail: 'Left Voicemail',
  conversation: 'Conversation',
  appointment: 'Appointment Set',
  not_interested: 'Not Interested',
  callback: 'Call Back',
};

function actionTypeLabel(type) {
  return ACTIVITY_LABELS[type] || String(type || 'Activity').replaceAll('_', ' ');
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(value) {
  if (!value) return 'No date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ActivityRow({ entry }) {
  return (
    <div className="relative border-l border-slate-700 pb-3 pl-4 last:pb-0">
      <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-blue-400 ring-4 ring-slate-950" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold capitalize text-slate-200">{actionTypeLabel(entry.type)}</p>
        <span className="text-[11px] font-medium text-slate-600">{shortDate(entry.date || entry.at)}</span>
      </div>
      {entry.note && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{entry.note}</p>}
    </div>
  );
}

function CallHistoryRow({ call }) {
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-blue-300">{CALL_OUTCOME_LABELS[call.outcome] || actionTypeLabel(call.outcome)}</p>
        <span className="text-[11px] font-medium text-slate-600">{shortDate(call.date)}</span>
      </div>
      {call.notes
        ? <p className="mt-1 text-sm leading-relaxed text-slate-300">{call.notes}</p>
        : <p className="mt-1 text-xs italic text-slate-600">No note recorded for this call.</p>}
    </div>
  );
}

function TaskHistoryRow({ task, taskApi }) {
  const completed = task.status === 'completed';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${completed ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-slate-700 bg-slate-900/70'}`}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => completed ? taskApi.reopenTask(task.id) : taskApi.completeTask(task.id)}
          title={completed ? 'Reopen task' : 'Mark complete'}
          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] font-black ${
            completed ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : 'border-slate-600 text-transparent hover:border-amber-400'
          }`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${completed ? 'text-slate-400 line-through decoration-slate-600' : 'text-slate-200'}`}>{task.title}</p>
          {task.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>}
          <p className="mt-1 text-[11px] font-medium text-slate-600">
            {completed
              ? `Completed ${shortDate(task.completedAt || task.updatedAt)}`
              : task.dueDate ? `Due ${shortDate(task.dueDate)}` : 'No due date'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CoreClientRelationshipRecord({
  contact,
  taskApi,
  onLogAction,
  onDeleteAction,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showActionCenter, setShowActionCenter] = useState(false);
  const activities = useMemo(() => [...(contact.actionLog ?? [])]
    .sort((a, b) => timestamp(b.date || b.at) - timestamp(a.date || a.at)), [contact.actionLog]);
  const callHistory = useMemo(() => [...(contact.callHistory ?? [])]
    .sort((a, b) => timestamp(b.date) - timestamp(a.date)), [contact.callHistory]);
  const relatedTasks = taskApi?.getRelatedTasks('contact', contact.id, { includeCompleted: true }) ?? [];
  const openTasks = relatedTasks
    .filter(task => task.status === 'open')
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  const completedTasks = relatedTasks
    .filter(task => task.status === 'completed')
    .sort((a, b) => timestamp(b.completedAt || b.updatedAt) - timestamp(a.completedAt || a.updatedAt));
  const visibleActivities = expanded ? activities : activities.slice(0, 4);
  const visibleCalls = expanded ? callHistory : callHistory.slice(0, 5);
  const visibleOpenTasks = expanded ? openTasks : openTasks.slice(0, 3);
  const visibleCompletedTasks = expanded ? completedTasks : completedTasks.slice(0, 3);
  const hiddenCount = Math.max(0, callHistory.length - visibleCalls.length)
    + Math.max(0, activities.length - visibleActivities.length)
    + Math.max(0, openTasks.length - visibleOpenTasks.length)
    + Math.max(0, completedTasks.length - visibleCompletedTasks.length);

  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Relationship record</p>
          <p className="mt-1 text-sm text-slate-400">
            {callHistory.length} past {callHistory.length === 1 ? 'call' : 'calls'} · {activities.length} logged {activities.length === 1 ? 'action' : 'actions'} · {openTasks.length} open · {completedTasks.length} completed
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowActionCenter(true)}
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
        >
          Log activity / add task
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-300/80">Call notes & history</p>
          <span className="text-[11px] font-semibold text-slate-600">{callHistory.length} calls</span>
        </div>
        {contact.notes && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400/80">Saved contact notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{contact.notes}</p>
          </div>
        )}
        {visibleCalls.length ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {visibleCalls.map((call, index) => <CallHistoryRow key={`${call.date}-${call.outcome}-${index}`} call={call} />)}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs italic text-slate-600">
            No historical calls recorded yet.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Past activity</p>
            <span className="text-[11px] font-semibold text-slate-600">{activities.length} total</span>
          </div>
          {visibleActivities.length ? (
            <div className="pl-1">{visibleActivities.map((entry, index) => <ActivityRow key={entry.eventId || `${entry.date || entry.at}-${index}`} entry={entry} />)}</div>
          ) : <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs italic text-slate-600">No activity logged yet.</p>}
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Open tasks</p>
              <span className="text-[11px] font-semibold text-amber-400">{openTasks.length}</span>
            </div>
            {visibleOpenTasks.length ? <div className="space-y-2">{visibleOpenTasks.map(task => <TaskHistoryRow key={task.id} task={task} taskApi={taskApi} />)}</div>
              : <p className="text-xs italic text-slate-600">No open tasks.</p>}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Completed tasks</p>
              <span className="text-[11px] font-semibold text-emerald-400">{completedTasks.length}</span>
            </div>
            {visibleCompletedTasks.length ? <div className="space-y-2">{visibleCompletedTasks.map(task => <TaskHistoryRow key={task.id} task={task} taskApi={taskApi} />)}</div>
              : <p className="text-xs italic text-slate-600">No completed tasks recorded.</p>}
          </div>
        </div>
      </div>

      {(hiddenCount > 0 || expanded) && (
        <button type="button" onClick={() => setExpanded(value => !value)} className="mt-4 w-full border-t border-slate-800 pt-3 text-xs font-bold text-slate-500 hover:text-amber-300">
          {expanded ? 'Show recent summary' : `Show full relationship record (${hiddenCount} more)`}
        </button>
      )}

      {showActionCenter && (
        <ActionCenterModal
          name={contact.ownerName || contact.facilityName || 'Core Client'}
          subtitle={contact.facilityName}
          mode="combined"
          actionLog={contact.actionLog}
          onLogAction={onLogAction}
          onDeleteAction={onDeleteAction}
          taskContext={{
            relatedType: 'contact',
            relatedId: contact.id,
            relatedName: contact.ownerName || contact.facilityName || 'Core Client',
            source: 'core_clients',
          }}
          onSaveTask={taskApi?.createTask}
          onClose={() => setShowActionCenter(false)}
        />
      )}
    </section>
  );
}
