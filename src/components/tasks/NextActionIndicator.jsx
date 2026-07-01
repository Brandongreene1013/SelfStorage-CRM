const today = () => new Date().toISOString().slice(0, 10);

// Tiny awareness chip for the Pipeline kanban card — deliberately minimal
// (a single small pill, not a banner) so it doesn't compete with the card's
// existing "Next Action" button. Shows nothing if there are no open tasks.
export default function NextActionIndicator({ taskApi, relatedType, relatedId }) {
  if (!taskApi) return null;
  const open = taskApi.getRelatedTasks(relatedType, relatedId);
  if (open.length === 0) return null;

  const soonest = [...open].sort((a, b) => (a.dueDate ?? '9999') > (b.dueDate ?? '9999') ? 1 : -1)[0];
  const t = today();
  const isOverdue = soonest.dueDate && soonest.dueDate < t;
  const isToday = soonest.dueDate === t;

  return (
    <span
      title={`${open.length} open task${open.length !== 1 ? 's' : ''}`}
      className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded border ${
        isOverdue
          ? 'bg-red-500/15 border-red-500/40 text-red-400'
          : isToday
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            : 'bg-slate-700/50 border-slate-600/50 text-slate-400'
      }`}
    >
      📋 {open.length}
    </span>
  );
}
