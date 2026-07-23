import { useState } from 'react';
import { ACTION_TYPES, CALL_ACTION_TYPES, TASK_TYPES, TASK_PRIORITIES, TASK_QUICK_PICKS } from '../data/constants';
import ModalLayout from './ui/ModalLayout';
import { createActivityEventId } from '../lib/activityAnalytics';

const ACTION_TYPE_MAP = Object.fromEntries([...ACTION_TYPES, ...CALL_ACTION_TYPES].map(type => [type.value, type]));

function plusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function saveError(result, fallback) {
  if (!result?.error) return '';
  return result.error === 'migration_needed'
    ? 'The task database needs its one-time migration before this can be saved.'
    : result.error || fallback;
}

export default function ActionCenterModal({
  name,
  subtitle,
  mode = null,
  actionLog = [],
  onLogAction,
  onDeleteAction,
  taskContext,
  taskDefaults = {},
  onSaveTask,
  onClose,
}) {
  const focusedAction = mode === 'action';
  const focusedTask = mode === 'task';
  const combined = !focusedAction && !focusedTask;

  const [logType, setLogType] = useState(null);
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logPriority, setLogPriority] = useState('normal');
  const [logNote, setLogNote] = useState('');

  const [title, setTitle] = useState(taskDefaults.title ?? '');
  const [taskType, setTaskType] = useState(taskDefaults.taskType ?? 'follow_up');
  const [taskPriority, setTaskPriority] = useState(taskDefaults.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(taskDefaults.dueDate ?? plusDays(1));
  const [description, setDescription] = useState(taskDefaults.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const willLog = Boolean(onLogAction && logType);
  const willSchedule = Boolean(onSaveTask && title.trim());
  const canSave = focusedAction ? willLog : focusedTask ? willSchedule : willLog || willSchedule;
  const displayedActionTypes = focusedAction
    ? [...CALL_ACTION_TYPES, ...ACTION_TYPES.filter(action => action.value !== 'call')]
    : ACTION_TYPES;
  const heading = focusedAction ? 'Log Action' : focusedTask ? 'Add Task' : 'Log & Next Action';
  const saveLabel = focusedAction ? 'Save Action'
    : focusedTask ? 'Save Task'
      : willLog && willSchedule ? 'Log + Schedule' : willLog ? 'Log It' : 'Save Next Action';

  function applyQuickPick(quickPick) {
    setTitle(quickPick.title);
    setTaskType(quickPick.taskType);
    setDueDate(plusDays(quickPick.offsetDays));
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      if (willLog) {
        const result = await onLogAction({
          eventId: createActivityEventId(),
          type: logType,
          date: logDate,
          priority: logPriority,
          note: logNote.trim(),
          at: new Date().toISOString(),
        });
        const message = saveError(result, 'Could not save this action.');
        if (message) { setError(message); return; }
      }
      if (willSchedule) {
        const result = await onSaveTask({
          title: title.trim(),
          taskType,
          priority: taskPriority,
          dueDate: dueDate || null,
          description: description.trim(),
          relatedType: taskContext?.relatedType ?? 'general',
          relatedId: taskContext?.relatedId ?? null,
          relatedName: taskContext?.relatedName ?? '',
          source: taskContext?.source ?? 'dashboard',
        });
        const message = saveError(result, 'Could not save this task.');
        if (message) { setError(message); return; }
      }
      onClose();
    } catch (saveFailure) {
      setError(saveFailure?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const recent = actionLog.map((entry, index) => ({ entry, index })).reverse().slice(0, 5);
  const sectionLabel = 'text-xs font-black uppercase tracking-widest';
  const fieldLabel = 'block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5';
  const inputClass = 'w-full min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors';

  return (
    <ModalLayout onClose={onClose} size="md" className="max-h-[90vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-800 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white">{heading}</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{name}{subtitle ? ` · ${subtitle}` : ''}</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">×</button>
      </div>

      <div className="p-4 sm:p-5 space-y-5 flex-1 overflow-y-auto min-h-0">
        {(combined || focusedAction) && onLogAction && (
          <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className={`${sectionLabel} ${willLog ? 'text-amber-400' : 'text-slate-500'}`}>What happened?</p>
              {combined && <span className="text-xs text-slate-600">optional</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {displayedActionTypes.map(action => (
                <button type="button" key={action.value} onClick={() => setLogType(action.value)}
                  className={`flex min-w-0 items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                    logType === action.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}>
                  <span className="text-base flex-shrink-0">{action.icon}</span>
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
            </div>
            {(focusedAction || willLog) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Action Date</label>
                <input type="date" value={logDate} onChange={event => setLogDate(event.target.value)} className={inputClass} />
              </div>
              <PriorityPicker value={logPriority} onChange={setLogPriority} labelClass={fieldLabel} />
            </div>}
            {(focusedAction || willLog) && <div>
              <label className={fieldLabel}>What happened?</label>
              <textarea autoFocus={focusedAction} value={logNote} onChange={event => setLogNote(event.target.value)} rows={3}
                placeholder="Add context about the conversation, email, meeting, or outcome…"
                className={`${inputClass} resize-y`} />
            </div>}
          </section>
        )}

        {(combined || focusedTask) && onSaveTask && (
          <section className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className={`${sectionLabel} ${willSchedule ? 'text-amber-400' : 'text-slate-500'}`}>What needs to happen?</p>
              {combined && <span className="text-xs text-slate-600">optional</span>}
            </div>
            <textarea autoFocus={focusedTask} value={title} onChange={event => setTitle(event.target.value)} rows={2}
              placeholder="What needs to happen?"
              className={`${inputClass} resize-y`} />
            <div className="flex flex-wrap gap-1.5">
              {TASK_QUICK_PICKS.map(quickPick => (
                <button type="button" key={quickPick.title} onClick={() => applyQuickPick(quickPick)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-400 transition-all">
                  {quickPick.title}
                </button>
              ))}
            </div>
            {(focusedTask || willSchedule) && <div>
              <label className={fieldLabel}>Task Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TASK_TYPES.map(type => (
                  <button type="button" key={type.value} onClick={() => setTaskType(type.value)}
                    className={`flex min-w-0 items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                      taskType === type.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                    }`}>
                    <span>{type.icon}</span><span className="truncate">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>}
            {(focusedTask || willSchedule) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Due Date</label>
                <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={inputClass} />
              </div>
              <PriorityPicker value={taskPriority} onChange={setTaskPriority} labelClass={fieldLabel} />
            </div>}
            {(focusedTask || willSchedule) && <div>
              <label className={fieldLabel}>Notes</label>
              <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2}
                placeholder="Optional detail…" className={`${inputClass} resize-y`} />
            </div>}
          </section>
        )}

        {(combined || focusedAction) && recent.length > 0 && (
          <section>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Recent activity</p>
            <div className="space-y-1 max-h-32 overflow-auto">
              {recent.map(({ entry, index }) => {
                const action = ACTION_TYPE_MAP[entry.type];
                const priority = TASK_PRIORITIES.find(item => item.value === entry.priority);
                return (
                  <div key={`${entry.at ?? entry.date}-${index}`} className="flex items-center gap-2 text-xs bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                    <span>{action?.icon ?? '•'}</span>
                    <span className="text-slate-300 truncate flex-1">{entry.note || action?.label || entry.type}</span>
                    {entry.priority && entry.priority !== 'normal' && <span className={`font-bold ${priority?.text ?? 'text-slate-500'}`}>{priority?.label}</span>}
                    <span className="text-slate-600 flex-shrink-0">{entry.date}</span>
                    {onDeleteAction && (
                      <button type="button" onClick={() => onDeleteAction(index)} className="text-slate-600 hover:text-red-400 font-black px-1" title="Delete activity">×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-slate-800 flex-shrink-0 bg-slate-900">
        <button type="button" onClick={onClose} disabled={saving} className="text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
        <button type="button" onClick={handleSave} disabled={!canSave || saving}
          className={`min-w-28 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            canSave && !saving ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </ModalLayout>
  );
}

function PriorityPicker({ value, onChange, labelClass }) {
  return (
    <div>
      <label className={labelClass}>Priority</label>
      <div className="grid grid-cols-4 gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
        {TASK_PRIORITIES.map(priority => (
          <button type="button" key={priority.value} onClick={() => onChange(priority.value)} title={priority.label}
            className={`min-w-0 rounded-md px-1 py-1.5 text-[11px] font-bold transition-all ${
              value === priority.value ? `${priority.bg} ${priority.text}` : 'text-slate-600 hover:text-slate-400'
            }`}>
            {priority.label}
          </button>
        ))}
      </div>
    </div>
  );
}
