import { useState } from 'react';
import { TASK_TYPES, TASK_PRIORITIES, TASK_QUICK_PICKS } from '../../data/constants';
import ModalLayout from '../ui/ModalLayout';

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Create (or quick-edit) a universal task. `context` carries where it's tied
// to: { relatedType, relatedId, relatedName, source }. Pass `emphasizeDueDate`
// to visually push for a due date (used for the "Call Back" outcome prompt).
export default function TaskModal({ context, defaults = {}, emphasizeDueDate = false, heading = 'Add Task', saveLabel = 'Save Task', onSave, onClose }) {
  const [title, setTitle] = useState(defaults.title ?? '');
  const [taskType, setTaskType] = useState(defaults.taskType ?? 'follow_up');
  const [priority, setPriority] = useState(defaults.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? plusDays(1));
  const [description, setDescription] = useState(defaults.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function applyQuickPick(qp) {
    setTitle(qp.title);
    setTaskType(qp.taskType);
    setDueDate(plusDays(qp.offsetDays));
  }

  async function handleSave() {
    const t = title.trim();
    if (!t || saving || !onSave) return;
    setSaving(true);
    setError('');
    try {
      const result = await onSave({
        title: t,
        taskType,
        priority,
        dueDate: dueDate || null,
        description: description.trim(),
        relatedType: context?.relatedType ?? 'general',
        relatedId: context?.relatedId ?? null,
        relatedName: context?.relatedName ?? '',
        source: context?.source ?? 'dashboard',
      });
      if (result?.error) {
        setError(result.error === 'migration_needed'
          ? 'The task database needs its one-time migration before this can be saved.'
          : result.error);
        return;
      }
      onClose();
    } catch (saveFailure) {
      setError(saveFailure?.message || 'Could not save this task. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalLayout onClose={onClose} size="md">
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h2 className="text-base font-black text-white">{heading}</h2>
          {context?.relatedName && (
            <p className="text-xs text-slate-500 mt-0.5">For {context.relatedName}</p>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
      </div>

      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Quick picks */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Quick Pick</label>
          <div className="flex flex-wrap gap-1.5">
            {TASK_QUICK_PICKS.map(qp => (
              <button
                key={qp.title}
                onClick={() => applyQuickPick(qp)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-400 transition-all"
              >
                {qp.title}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Task</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="e.g. Call back about T-12 request..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Type</label>
          <div className="grid grid-cols-3 gap-1.5">
            {TASK_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setTaskType(t.value)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-left ${
                  taskType === t.value
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                }`}
              >
                <span>{t.icon}</span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Due date + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-1.5 ${emphasizeDueDate ? 'text-amber-400' : 'text-slate-400'}`}>
              Due Date{emphasizeDueDate ? ' *' : ''}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                emphasizeDueDate ? 'border-amber-500/60 focus:border-amber-500' : 'border-slate-700 focus:border-amber-500'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Priority</label>
            <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
              {TASK_PRIORITIES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  title={p.label}
                  className={`flex-1 rounded-md py-1 text-xs font-bold transition-all ${
                    priority === p.value ? `${p.bg} ${p.text}` : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {p.label[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Notes</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="Optional detail..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-800">
        {error && <p role="alert" className="mr-auto text-xs text-red-400">{error}</p>}
        <button onClick={onClose} disabled={saving} className="text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50">Cancel</button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            title.trim() && !saving ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </ModalLayout>
  );
}
