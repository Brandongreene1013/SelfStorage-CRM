import { useState } from 'react';
import { ACTION_TYPES, CALL_ACTION_TYPES, TASK_PRIORITIES } from '../data/constants';
import ModalLayout from './ui/ModalLayout';

const TYPE_MAP = Object.fromEntries([...ACTION_TYPES, ...CALL_ACTION_TYPES].map(action => [action.value, action]));
const PRIORITY_MAP = Object.fromEntries(TASK_PRIORITIES.map(priority => [priority.value, priority]));

// Compact "Last Action" line shown on every card. actionLog = [{date,type,note}]
export function LastActionLine({ actionLog, onDeleteLast }) {
  if (!actionLog || actionLog.length === 0) {
    return <span className="text-xs text-slate-600 italic">No actions logged yet</span>;
  }
  const last = actionLog[actionLog.length - 1];
  const t = TYPE_MAP[last.type];
  const priority = PRIORITY_MAP[last.priority];
  return (
    <span className="text-xs text-slate-400 flex items-center gap-1 min-w-0">
      <span className="text-slate-500 flex-shrink-0">Last:</span>
      <span className="flex-shrink-0">{t?.icon ?? '•'}</span>
      <span className="truncate">{t?.label || 'Action'}{last.note ? ` · ${last.note}` : ''}</span>
      {last.priority && last.priority !== 'normal' && (
        <span className={`flex-shrink-0 font-bold ${priority?.text ?? 'text-slate-500'}`}>{priority?.label}</span>
      )}
      {last.date && <span className="text-slate-600 flex-shrink-0">- {last.date.slice(5)}</span>}
      {onDeleteLast && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteLast(actionLog.length - 1);
          }}
          className="ml-0.5 text-slate-600 hover:text-red-400 font-bold px-1 flex-shrink-0"
          title="Delete this activity"
        >
          ×
        </button>
      )}
    </span>
  );
}

// Modal to log a completed action (appends to the activity log)
export function LogActionModal({ name, subtitle, actionLog = [], onSave, onDelete, onClose }) {
  const [type, setType] = useState('call');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  function handleSave() {
    onSave({ type, date, note: note.trim(), at: new Date().toISOString() });
    onClose();
  }

  function handleDelete(index) {
    if (!onDelete) return;
    onDelete(index);
  }

  const recent = actionLog
    .map((entry, index) => ({ entry, index }))
    .reverse()
    .slice(0, 6);

  return (
    <ModalLayout onClose={onClose}>
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">Log Action</h2>
          <p className="text-xs text-slate-500 mt-0.5">{name}{subtitle ? ` - ${subtitle}` : ''}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">What did you do?</label>
          <div className="grid grid-cols-2 gap-2">
            {ACTION_TYPES.map(a => (
              <button key={a.value} onClick={() => setType(a.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left ${
                  type === a.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                }`}>
                <span className="text-base">{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">When</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Note</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="e.g. Left voicemail, owner wants a BOV..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
        </div>

        {recent.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Recent activity</p>
            <div className="space-y-1 max-h-32 overflow-auto">
              {recent.map(({ entry, index }) => (
                <div key={index} className="flex items-center gap-2 text-xs bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <span>{TYPE_MAP[entry.type]?.icon ?? '•'}</span>
                  <span className="text-slate-300 truncate flex-1">{entry.note || TYPE_MAP[entry.type]?.label}</span>
                  <span className="text-slate-600 flex-shrink-0">{entry.date}</span>
                  {onDelete && (
                    <button
                      onClick={() => handleDelete(index)}
                      className="text-slate-600 hover:text-red-400 font-bold px-1"
                      title="Delete activity"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-800">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
        <button onClick={handleSave}
          className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 transition-all">
          Log It
        </button>
      </div>
    </ModalLayout>
  );
}
