import { dueMeta, getNextOpenTask } from './taskUtils';

// Tiny awareness chip for the Pipeline kanban card. Shows the number of open
// universal tasks and can optionally open the task context when clicked.
export default function NextActionIndicator({ taskApi, relatedType, relatedId, onClick }) {
  if (!taskApi) return null;
  const open = taskApi.getRelatedTasks(relatedType, relatedId);
  if (open.length === 0) return null;

  const soonest = getNextOpenTask(open);
  const due = dueMeta(soonest?.dueDate);
  const isOverdue = due?.tone === 'red';
  const isToday = due?.tone === 'amber';
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onPointerDown={onClick ? e => e.stopPropagation() : undefined}
      onClick={onClick}
      title={`${open.length} open task${open.length !== 1 ? 's' : ''}: ${soonest?.title ?? 'Next action'}`}
      className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded border ${
        isOverdue
          ? 'bg-red-500/15 border-red-500/40 text-red-400'
          : isToday
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            : 'bg-slate-700/50 border-slate-600/50 text-slate-400'
      }`}
    >
      Tasks {open.length}
    </Component>
  );
}
