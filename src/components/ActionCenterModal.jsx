import { useState } from 'react';
import { TASK_PRIORITIES, TASK_QUICK_PICKS, TASK_TYPES } from '../data/constants';
import ModalLayout from './ui/ModalLayout';
import { createActivityEventId } from '../lib/activityAnalytics';

const ACTIVITY_OPTIONS = [
  { value: 'call', label: 'Call / call notes' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'voicemail', label: 'Voicemail left' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text message' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'appointment', label: 'Appointment set' },
  { value: 'bov', label: 'BOV / valuation' },
  { value: 'bov_offered', label: 'BOV offered' },
  { value: 'bov_sent', label: 'BOV sent' },
  { value: 'tractiq_report_sent', label: 'TractIQ report sent' },
  { value: 'financials_requested', label: 'Financials requested' },
  { value: 'financials_received', label: 'Financials received' },
  { value: 'listing_agreement_sent', label: 'Listing agreement sent' },
  { value: 'listing_agreement_executed', label: 'Listing agreement executed' },
  { value: 'marketing_update', label: 'Marketing update' },
  { value: 'offer_received', label: 'Offer received' },
  { value: 'contract_update', label: 'Contract update' },
  { value: 'closing_update', label: 'Closing update' },
  { value: 'follow_up', label: 'Follow-up completed' },
  { value: 'note', label: 'Internal note' },
  { value: 'research', label: 'Research' },
  { value: 'callback', label: 'Callback requested' },
  { value: 'not_interested', label: 'Not interested' },
];

const ACTIVITY_LABELS = Object.fromEntries(ACTIVITY_OPTIONS.map(option => [option.value, option.label]));

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
  const canLogActivity = Boolean(onLogAction);
  const canScheduleTask = Boolean(onSaveTask);
  const editingTask = Boolean(taskDefaults.id);
  const [logEnabled, setLogEnabled] = useState(canLogActivity && mode !== 'task' && !editingTask);
  const [taskEnabled, setTaskEnabled] = useState(canScheduleTask && (mode === 'task' || Boolean(taskDefaults.title)));
  const [activitySaved, setActivitySaved] = useState(false);

  const [logType, setLogType] = useState('call');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logNote, setLogNote] = useState('');

  const [title, setTitle] = useState(taskDefaults.title ?? '');
  const [taskType, setTaskType] = useState(taskDefaults.taskType ?? 'follow_up');
  const [taskPriority, setTaskPriority] = useState(taskDefaults.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(taskDefaults.dueDate ?? plusDays(1));
  const [description, setDescription] = useState(taskDefaults.description ?? '');
  const [templateValue, setTemplateValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsActivitySave = logEnabled && !activitySaved;
  const activityValid = !needsActivitySave || Boolean(logType);
  const taskValid = !taskEnabled || Boolean(title.trim() && dueDate);
  const hasWork = needsActivitySave || taskEnabled;
  const canSave = hasWork && activityValid && taskValid;

  function applyTemplate(value) {
    setTemplateValue(value);
    const template = TASK_QUICK_PICKS.find(item => item.title === value);
    if (!template) return;
    setTitle(template.title);
    setTaskType(template.taskType);
    setDueDate(plusDays(template.offsetDays));
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    let savedActivityThisAttempt = activitySaved;
    try {
      if (needsActivitySave) {
        const result = await onLogAction({
          eventId: createActivityEventId(),
          type: logType,
          date: logDate,
          priority: 'normal',
          note: logNote.trim(),
          at: new Date().toISOString(),
        });
        const message = saveError(result, 'Could not save this activity.');
        if (message) {
          setError(message);
          return;
        }
        savedActivityThisAttempt = true;
        setActivitySaved(true);
      }

      if (taskEnabled) {
        const result = await onSaveTask({
          title: title.trim(),
          taskType,
          priority: taskPriority,
          dueDate,
          description: description.trim(),
          relatedType: taskContext?.relatedType ?? 'general',
          relatedId: taskContext?.relatedId ?? null,
          relatedName: taskContext?.relatedName ?? '',
          source: taskContext?.source ?? 'dashboard',
        });
        const message = saveError(result, 'Could not schedule this task.');
        if (message) {
          setError(savedActivityThisAttempt
            ? `Activity saved. The task was not scheduled: ${message}`
            : message);
          return;
        }
      }
      onClose();
    } catch (saveFailure) {
      setError(saveFailure?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const recent = actionLog.map((entry, index) => ({ entry, index })).reverse().slice(0, 3);
  const fieldLabel = 'block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5';
  const inputClass = 'w-full min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors';
  const saveLabel = activitySaved && taskEnabled
    ? 'Retry task'
    : needsActivitySave && taskEnabled
      ? 'Save activity & task'
      : needsActivitySave
        ? 'Save activity'
        : editingTask ? 'Save task' : 'Schedule task';

  return (
    <ModalLayout onClose={onClose} size="md" className="max-h-[90vh] flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-800 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">Activity & tasks</h2>
          <p className="text-xs text-slate-500 mt-1 truncate">{name}{subtitle ? ` · ${subtitle}` : ''}</p>
          <p className="text-xs text-slate-400 mt-2">Log what already happened. Schedule what needs to happen next.</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1" aria-label="Close">×</button>
      </div>

      <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto min-h-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {canLogActivity && (
            <button
              type="button"
              onClick={() => !activitySaved && setLogEnabled(value => !value)}
              disabled={activitySaved}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                logEnabled
                  ? 'border-blue-500/45 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-900 hover:border-slate-600'
              } disabled:cursor-default`}
            >
              <span className={`block text-sm font-bold ${logEnabled ? 'text-blue-300' : 'text-slate-300'}`}>
                {activitySaved ? 'Activity saved' : 'Log activity'}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">A call, conversation, email, or meeting that already happened.</span>
            </button>
          )}
          {canScheduleTask && (
            <button
              type="button"
              onClick={() => setTaskEnabled(value => !value)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                taskEnabled
                  ? 'border-amber-500/45 bg-amber-500/10'
                  : 'border-slate-700 bg-slate-900 hover:border-slate-600'
              }`}
            >
              <span className={`block text-sm font-bold ${taskEnabled ? 'text-amber-300' : 'text-slate-300'}`}>{editingTask ? 'Edit next task' : 'Schedule task'}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{editingTask ? 'Update the current next action without creating a duplicate.' : 'A future call, email, meeting, or follow-up with a due date.'}</span>
            </button>
          )}
        </div>

        {logEnabled && (
          <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">Past activity</p>
                <p className="text-xs text-slate-500">Record what you did and the important context.</p>
              </div>
              {activitySaved && <span className="text-xs font-bold text-emerald-300">Saved</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px] gap-3">
              <div>
                <label className={fieldLabel}>Activity type</label>
                <select value={logType} onChange={event => setLogType(event.target.value)} disabled={activitySaved} className={inputClass}>
                  {ACTIVITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Date completed</label>
                <input type="date" value={logDate} onChange={event => setLogDate(event.target.value)} disabled={activitySaved} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Notes</label>
              <textarea
                autoFocus={mode !== 'task'}
                value={logNote}
                onChange={event => setLogNote(event.target.value)}
                disabled={activitySaved}
                rows={4}
                placeholder="Call notes, what the owner said, motivation, timing, objections, pricing..."
                className={`${inputClass} resize-y`}
              />
            </div>
          </section>
        )}

        {taskEnabled && (
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-white">{editingTask ? 'Next task' : 'Future task'}</p>
              <p className="text-xs text-slate-500">Define the next step and when it is due.</p>
            </div>
            <div>
              <label className={fieldLabel}>Task</label>
              <input
                autoFocus={mode === 'task'}
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Example: Call owner back"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Template <span className="normal-case text-slate-600">(optional)</span></label>
                <select value={templateValue} onChange={event => applyTemplate(event.target.value)} className={inputClass}>
                  <option value="">Choose a common follow-up</option>
                  {TASK_QUICK_PICKS.map(template => <option key={template.title} value={template.title}>{template.title}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Due date</label>
                <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-slate-500">Set due:</span>
              {[
                ['Tomorrow', 1],
                ['1 week', 7],
                ['2 weeks', 14],
                ['30 days', 30],
              ].map(([label, days]) => (
                <button key={label} type="button" onClick={() => setDueDate(plusDays(days))}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:border-amber-500/40 hover:text-amber-300">
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Task type</label>
                <select value={taskType} onChange={event => setTaskType(event.target.value)} className={inputClass}>
                  {TASK_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Priority</label>
                <select value={taskPriority} onChange={event => setTaskPriority(event.target.value)} className={inputClass}>
                  {TASK_PRIORITIES.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Task notes <span className="normal-case text-slate-600">(optional)</span></label>
              <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2}
                placeholder="Anything you will need when this task comes due..." className={`${inputClass} resize-y`} />
            </div>
          </section>
        )}

        {logEnabled && recent.length > 0 && !activitySaved && (
          <section className="border-t border-slate-800 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Recent activity</p>
            <div className="space-y-1.5">
              {recent.map(({ entry, index }) => (
                <div key={`${entry.at ?? entry.date}-${index}`} className="flex items-start gap-3 rounded-lg bg-slate-900 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-300">{ACTIVITY_LABELS[entry.type] || entry.type || 'Activity'}</p>
                    {entry.note && <p className="mt-0.5 line-clamp-2 text-slate-500">{entry.note}</p>}
                  </div>
                  <span className="flex-shrink-0 text-slate-600">{entry.date}</span>
                  {onDeleteAction && (
                    <button type="button" onClick={() => onDeleteAction(index)} className="flex-shrink-0 text-slate-600 hover:text-red-400">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-900 p-4 sm:p-5 flex-shrink-0">
        <button type="button" onClick={onClose} disabled={saving} className="text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
        <button type="button" onClick={handleSave} disabled={!canSave || saving}
          className={`min-w-36 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors ${
            canSave && !saving ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'cursor-not-allowed bg-slate-700 text-slate-500'
          }`}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </ModalLayout>
  );
}
