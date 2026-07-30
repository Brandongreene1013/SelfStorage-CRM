import { ACTION_TYPES } from '../data/constants';
import { LastActionLine } from './ActionLog';
import { dueMeta, getNextOpenTask } from './tasks';

function toneClasses(tone) {
  if (tone === 'red') {
    return {
      border: 'border-red-500/30',
      accent: 'bg-red-400',
      due: 'text-red-300',
    };
  }
  if (tone === 'amber') {
    return {
      border: 'border-amber-500/30',
      accent: 'bg-amber-400',
      due: 'text-amber-300',
    };
  }
  return {
    border: 'border-slate-700',
    accent: 'bg-slate-600',
    due: 'text-slate-500',
  };
}

export default function EngagementPanel({
  record,
  taskApi,
  onOpen,
  relatedType = 'client',
  compact = false,
  stopPointerDown = false,
}) {
  const openTasks = taskApi?.getRelatedTasks(relatedType, record.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const legacyType = ACTION_TYPES.find(action => action.value === record.nextActionType);
  const due = dueMeta(nextTask?.dueDate || record.nextActionDate);
  const tone = toneClasses(due?.tone);
  const nextAction = nextTask?.title
    || record.nextActionNote
    || legacyType?.label
    || 'No next action scheduled';
  const openLabel = openTasks.length === 1 ? '1 open task' : `${openTasks.length} open tasks`;

  return (
    <button
      type="button"
      data-testid={`${relatedType}-engagement-${record.id}`}
      onPointerDown={stopPointerDown ? event => event.stopPropagation() : undefined}
      onClick={event => {
        event.stopPropagation();
        onOpen();
      }}
      className={`relative mt-3 w-full overflow-hidden rounded-xl border bg-slate-950/35 text-left transition-colors hover:border-amber-500/35 hover:bg-slate-950/55 ${tone.border}`}
    >
      <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.accent}`} />
      <div className={compact ? 'px-3 py-2' : 'px-3.5 py-2.5'}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Next action</span>
          {due && <span className={`flex-shrink-0 text-[11px] font-bold ${tone.due}`}>{due.label}</span>}
        </div>
        <p className={`mt-0.5 truncate font-semibold ${nextTask || legacyType ? 'text-slate-200' : 'text-slate-500'} ${compact ? 'text-xs' : 'text-sm'}`}>
          {nextAction}
        </p>
        {compact ? (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-[11px] font-bold">
            <span className="truncate text-amber-400">Activity & tasks</span>
            <span className="flex-shrink-0 text-slate-600">{openTasks.length} open →</span>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-800/80 pt-2">
            <div className="min-w-0">
              <LastActionLine actionLog={record.actionLog} />
            </div>
            <span className="flex-shrink-0 text-[11px] font-bold text-slate-500">
              {openLabel} <span className="ml-1 text-amber-400">Open →</span>
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
