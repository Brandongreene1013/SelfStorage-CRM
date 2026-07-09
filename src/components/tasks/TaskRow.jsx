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
export default function TaskRow({ task, onComplete, onDelete, onEdit, compact = false }) {
  const type = TYPE_MAP[task.taskType] ?? TYPE_MAP.general;
  const priority = PRIORITY_MAP[task.priority] ?? PRIORITY_MAP.normal;
  const due = dueLabel(task.dueDate);

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg border bg-slate-800 border-slate-700 group transition-all">
      <button
        onClick={() => onComplete(task.id)}
        title="Mark complete"
        className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 border-slate-600 hover:border-amber-500 hover:bg-amber-500/20 transition-all"
      />
      <div
        className={`flex-1 min-w-0 ${onEdit ? 'cursor-pointer' : ''}`}
        onClick={onEdit ? () => onEdit(task) : undefined}
        title={onEdit ? 'Click to edit this task' : undefined}
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
            <span className="text-xs text-amber-400/70 truncate">{task.relatedName}</span>
          )}
          {task.description && <span className="text-xs text-slate-600 truncate">{task.description}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {due && <span className={`text-xs font-black whitespace-nowrap ${due.tone}`}>{due.label}</span>}
        {onDelete && (
          <button
            onClick={() => onDelete(task.id)}
            className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 text-xs transition-all leading-none"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
