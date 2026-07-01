import { useState } from 'react';
import { ACTION_TYPES } from '../data/constants';
import ModalLayout from './ui/ModalLayout';

export default function ActionModal({ name, subtitle, actionType, actionDate, actionNote, onSave, onClose }) {
  const [type, setType] = useState(actionType ?? '');
  const [date, setDate] = useState(actionDate ?? '');
  const [note, setNote] = useState(actionNote ?? '');

  function handleSave() {
    onSave({ nextActionType: type, nextActionDate: date, nextActionNote: note });
    onClose();
  }

  function handleClear() {
    onSave({ nextActionType: '', nextActionDate: '', nextActionNote: '' });
    onClose();
  }

  return (
    <ModalLayout onClose={onClose}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">Set Next Action</h2>
            <p className="text-xs text-slate-500 mt-0.5">{name}{subtitle ? ` · ${subtitle}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Action type buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Action Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map(a => (
                <button
                  key={a.value}
                  onClick={() => setType(a.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left ${
                    type === a.value
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  <span className="text-base">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">When</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Note</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Quick reminder for yourself..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-800">
          {actionType ? (
            <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-400 font-semibold transition-colors">
              Clear Action
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!type}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                type ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              Save Action
            </button>
          </div>
        </div>
    </ModalLayout>
  );
}
