import { ACTION_TYPES, CALL_ACTION_TYPES } from '../data/constants';

const TYPE_MAP = Object.fromEntries([...ACTION_TYPES, ...CALL_ACTION_TYPES].map(action => [action.value, action]));

// Compact activity summary shown on contact and client cards.
export function LastActionLine({ actionLog, onDeleteLast }) {
  if (!actionLog || actionLog.length === 0) {
    return <span className="text-xs italic text-slate-600">No activity logged</span>;
  }
  const last = actionLog[actionLog.length - 1];
  const type = TYPE_MAP[last.type];
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-slate-400">
      <span className="flex-shrink-0 font-semibold text-slate-500">Last activity:</span>
      <span className="truncate">{type?.label || 'Activity'}{last.note ? ` · ${last.note}` : ''}</span>
      {last.date && <span className="flex-shrink-0 text-slate-600">· {last.date.slice(5)}</span>}
      {onDeleteLast && (
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onDeleteLast(actionLog.length - 1);
          }}
          className="ml-0.5 flex-shrink-0 px-1 font-semibold text-slate-600 hover:text-red-400"
          title="Remove this activity"
        >
          Remove
        </button>
      )}
    </span>
  );
}
