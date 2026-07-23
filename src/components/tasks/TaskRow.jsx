import { useState } from 'react';
import { TASK_TYPES, TASK_PRIORITIES } from '../../data/constants';

const TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.value, t]));
const PRIORITY_MAP = Object.fromEntries(TASK_PRIORITIES.map(p => [p.value, p]));
const today = () => new Date().toISOString().slice(0, 10);

function dueLabel(dueDate) {
  if (!dueDate) return null;
  const t = today();
  if (dueDate < t) return { label: 'OVERDUE', tone: 'text-red-400' };
  if (dueDate === t) return { label: 'TODAY', tone: 'text-amber-400' };
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDate === tomorrow.toISOString().slice(0, 10)) return { label: 'Tomorrow', tone: 'text-slate-400' };
  return { label: new Date(dueDate + 'T12:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' }), tone: 'text-slate-500' };
}

// One task row — used on the Dashboard and in RelatedTasks (Client/Contact).
// `compact` drops the related-entity name (redundant when already scoped to
// one entity's task list).
export default function TaskRow({ task, onComplete, onDelete, onEdit, onOpenRelated, relatedMissing = false, compact = false }) {
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const type = TYPE_MAP[task.taskType] ?? TYPE_MAP.general;
  const priority = PRIORITY_MAP[task.priority] ?? PRIORITY_MAP.normal;
  const due = dueLabel(task.dueDate);

  async function run(action, handler) {
    if (!handler || pendingAction) return;
    setPendingAction(action);
    setError('');
    try {
      const result = await handler(task.id);
      if (result?.error) throw new Error(result.error);
    } catch (cause) {
      setError(cause?.message || `Could not ${action} this task.`);
    } finally {
      setPendingAction('');
    }
  }

  return (
    <div className="rounded-lg border bg-slate-800 border-slate-700 group transition-all">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <button
          onClick={() => run('complete', onComplete)}
          disabled={!!pendingAction}
          title="Mark complete"
          className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 border-slate-600 hover:border-amber-500 hover:bg-amber-500/20 disabled:opacity-40 transition-all"
        />
        <div
          className={`flex-1 min-w-0 ${onEdit ? 'cursor-pointer' : ''}`}
          onClick={onEdit && !pendingAction ? () => onEdit(task) : undefined}
          title={onEdit ? 'Edit or reschedule this task' : undefined}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs flex-shrink-0">{type.icon}</span>
            <span className="text-sm text-slate-200 truncate">{task.title}</span>
            {task.priority !== 'normal' && (
              <span className={`text-xs font-bold ${priority.text}`}>{priority.label[0]}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!compact && task.relatedName && (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onOpenRelated?.(task);
                }}
                disabled={!onOpenRelated || relatedMissing}
                className={`text-xs truncate ${relatedMissing ? 'text-red-400' : 'text-amber-400/70 hover:text-amber-300'} disabled:cursor-default`}
                title={relatedMissing ? 'The related record no longer exists' : 'Open related record'}
              >
                {task.relatedName}{relatedMissing ? ' (missing)' : ''}
              </button>
            )}
            {task.description && <span className="text-xs text-slate-600 truncate">{task.description}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pendingAction && <span className="text-[10px] text-slate-500">Saving...</span>}
          {due && <span className={`text-xs font-black whitespace-nowrap ${due.tone}`}>{due.label}</span>}
          {onDelete && (
            <button
              onClick={() => run('delete', onDelete)}
              disabled={!!pendingAction}
              title="Delete task"
              className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 disabled:opacity-30 text-xs transition-all leading-none"
            >
              x
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="px-3 pb-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
