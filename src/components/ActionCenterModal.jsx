import { useState } from 'react';
import { ACTION_TYPES, TASK_TYPES, TASK_PRIORITIES, TASK_QUICK_PICKS } from '../data/constants';
import ModalLayout from './ui/ModalLayout';

const ACTION_TYPE_MAP = Object.fromEntries(ACTION_TYPES.map(a => [a.value, a]));

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// One popup for the whole touch: log what happened AND schedule what's next,
// saved together with a single button. Replaces the old two-modal dance
// (LogActionModal + TaskModal) on client cards, pipeline chips, contact
// cards, and the Dashboard's pipeline-attention rows.
//
// Both halves are optional: pick an activity type to log it, type a task
// title to schedule it, or do both at once. Save stays disabled until at
// least one half has something in it.
export default function ActionCenterModal({
  name,
  subtitle,
  actionLog = [],
  onLogAction,      // (entry) => void — omit to hide the log section
  onDeleteAction,   // (index) => void — enables delete on recent activity
  taskContext,      // { relatedType, relatedId, relatedName, source }
  taskDefaults = {},
  onSaveTask,       // (task) => void — omit to hide the schedule section
  onClose,
}) {
  // What happened
  const [logType, setLogType] = useState(null); // null = not logging anything
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logNote, setLogNote] = useState('');

  // What's next
  const [title, setTitle] = useState(taskDefaults.title ?? '');
  const [taskType, setTaskType] = useState(taskDefaults.taskType ?? 'follow_up');
  const [priority, setPriority] = useState(taskDefaults.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(taskDefaults.dueDate ?? plusDays(1));
  const [description, setDescription] = useState(taskDefaults.description ?? '');

  const willLog = Boolean(onLogAction && logType);
  const willSchedule = Boolean(onSaveTask && title.trim());
  const canSave = willLog || willSchedule;
  const saveLabel = willLog && willSchedule ? 'Log + Schedule'
    : willLog ? 'Log It'
    : 'Save Next Action';

  function applyQuickPick(qp) {
    setTitle(qp.title);
    setTaskType(qp.taskType);
    setDueDate(plusDays(qp.offsetDays));
  }

  function handleSave() {
    if (!canSave) return;
    if (willLog) {
      onLogAction({ type: logType, date: logDate, note: logNote.trim(), at: new Date().toISOString() });
    }
    if (willSchedule) {
      onSaveTask({
        title: title.trim(),
        taskType,
        priority,
        dueDate: dueDate || null,
        description: description.trim(),
        relatedType: taskContext?.relatedType ?? 'general',
        relatedId: taskContext?.relatedId ?? null,
        relatedName: taskContext?.relatedName ?? '',
        source: taskContext?.source ?? 'dashboard',
      });
    }
    onClose();
  }

  function handleDeleteActivity(index) {
    if (!onDeleteAction) return;
    onDeleteAction(index);
  }

  const recent = actionLog
    .map((entry, index) => ({ entry, index }))
    .reverse()
    .slice(0, 5);

  const sectionLabel = 'text-xs font-black uppercase tracking-widest';
  const fieldLabel = 'block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5';
  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors';

  return (
    <ModalLayout onClose={onClose} size="md" className="max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
        <div>
          <h2 className="text-base font-black text-white">Log & Next Action</h2>
          <p className="text-xs text-slate-500 mt-0.5">{name}{subtitle ? ` · ${subtitle}` : ''}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
      </div>

      <div className="p-5 space-y-5 flex-1 overflow-y-auto min-h-0">
        {/* ── What happened ── */}
        {onLogAction && (
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className={`${sectionLabel} ${willLog ? 'text-amber-400' : 'text-slate-500'}`}>What happened?</p>
              {willLog ? (
                <button onClick={() => setLogType(null)} className="text-xs text-slate-500 hover:text-slate-300 font-semibold">
                  Not logging
                </button>
              ) : (
                <span className="text-xs text-slate-600">optional</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {ACTION_TYPES.map(a => (
                <button key={a.value} onClick={() => setLogType(logType === a.value ? null : a.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                    logType === a.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}>
                  <span className="text-base">{a.icon}</span>
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
            {willLog && (
              <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
                <div>
                  <label className={fieldLabel}>When</label>
                  <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={fieldLabel}>Note</label>
                  <input value={logNote} onChange={e => setLogNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    placeholder="e.g. Left voicemail, owner wants a BOV..."
                    className={inputCls} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── What's next ── */}
        {onSaveTask && (
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className={`${sectionLabel} ${willSchedule ? 'text-amber-400' : 'text-slate-500'}`}>What's next?</p>
              {!willSchedule && <span className="text-xs text-slate-600">optional</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_QUICK_PICKS.map(qp => (
                <button key={qp.title} onClick={() => applyQuickPick(qp)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-400 transition-all">
                  {qp.title}
                </button>
              ))}
            </div>
            <div>
              <label className={fieldLabel}>Task</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g. Call back about T-12 request..."
                className={inputCls} />
            </div>
            {willSchedule && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {TASK_TYPES.map(t => (
                    <button key={t.value} onClick={() => setTaskType(t.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                        taskType === t.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                      }`}>
                      <span>{t.icon}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Priority</label>
                    <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                      {TASK_PRIORITIES.map(p => (
                        <button key={p.value} onClick={() => setPriority(p.value)} title={p.label}
                          className={`flex-1 rounded-md py-1 text-xs font-bold transition-all ${
                            priority === p.value ? `${p.bg} ${p.text}` : 'text-slate-600 hover:text-slate-400'
                          }`}>
                          {p.label[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className={fieldLabel}>Notes</label>
                  <input value={description} onChange={e => setDescription(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                    placeholder="Optional detail..."
                    className={inputCls} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Recent activity ── */}
        {recent.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Recent activity</p>
            <div className="space-y-1 max-h-32 overflow-auto">
              {recent.map(({ entry, index }) => (
                <div key={index} className="flex items-center gap-2 text-xs bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <span>{ACTION_TYPE_MAP[entry.type]?.icon ?? '•'}</span>
                  <span className="text-slate-300 truncate flex-1">{entry.note || ACTION_TYPE_MAP[entry.type]?.label}</span>
                  <span className="text-slate-600 flex-shrink-0">{entry.date}</span>
                  {onDeleteAction && (
                    <button onClick={() => handleDeleteActivity(index)}
                      className="text-slate-600 hover:text-red-400 font-black px-1" title="Delete activity">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-5 border-t border-slate-800 flex-shrink-0">
        <p className="text-xs text-slate-500 min-w-0 truncate">
          {willLog && willSchedule ? `Logging "${ACTION_TYPE_MAP[logType]?.label}" + scheduling "${title.trim()}"`
            : willLog ? `Logging "${ACTION_TYPE_MAP[logType]?.label}"`
            : willSchedule ? `Scheduling "${title.trim()}"`
            : 'Pick an activity, a next task, or both'}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              canSave ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}>
            {saveLabel}
          </button>
        </div>
      </div>
    </ModalLayout>
  );
}
