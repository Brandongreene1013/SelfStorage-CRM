import { useState } from 'react';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';
import { ACTION_TYPES } from '../data/constants';

const INTEREST = {
  hot:  { label: 'HOT',  bg: 'bg-red-500/20',   border: 'border-red-500/40',   text: 'text-red-400'   },
  warm: { label: 'WARM', bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  cool: { label: 'COOL', bg: 'bg-blue-500/20',  border: 'border-blue-500/40',  text: 'text-blue-400'  },
};

// ─── Prospect Card ─────────────────────────────────────────────────────────────
function ProspectCard({ prospect, onUpdate, onRemove, onComplete }) {
  const [notes,    setNotes]    = useState(prospect.notes ?? '');
  const [nextType, setNextType] = useState(prospect.nextActionType ?? '');
  const [nextDate, setNextDate] = useState(prospect.nextActionDate ?? '');
  const [nextNote, setNextNote] = useState(prospect.nextActionNote ?? '');

  const today    = new Date().toISOString().slice(0, 10);
  const isOverdue  = nextDate && nextDate < today;
  const isDueToday = nextDate === today;
  const mapsQuery  = encodeURIComponent([prospect.facilityName, 'self storage'].filter(Boolean).join(' '));
  const lvl = INTEREST[prospect.interestLevel ?? 'warm'];

  function saveNotes()  { onUpdate(prospect.id, { notes }); }
  function saveAction() {
    onUpdate(prospect.id, { nextActionType: nextType, nextActionDate: nextDate, nextActionNote: nextNote });
  }
  function cycleInterest() {
    const order = ['warm', 'hot', 'cool'];
    const next  = order[(order.indexOf(prospect.interestLevel ?? 'warm') + 1) % order.length];
    onUpdate(prospect.id, { interestLevel: next });
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <button
              onClick={cycleInterest}
              title="Click to change interest level"
              className={`text-xs font-black px-2.5 py-0.5 rounded-md border transition-all ${lvl.bg} ${lvl.border} ${lvl.text}`}
            >
              {lvl.label}
            </button>
            {prospect.dateAdded && (
              <span className="text-xs text-slate-600">Added {prospect.dateAdded}</span>
            )}
          </div>
          <h3 className="text-lg font-black text-white leading-tight truncate">
            {prospect.ownerName || <span className="text-slate-500 italic font-semibold text-sm">Unknown Owner</span>}
          </h3>
          {prospect.facilityName && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-slate-400 truncate">{prospect.facilityName}</span>
              <a
                href={`https://www.google.com/maps/search/${mapsQuery}`}
                target="_blank" rel="noopener noreferrer"
                className="text-slate-600 hover:text-blue-400 text-xs flex-shrink-0 transition-colors"
              >🗺</a>
            </div>
          )}
        </div>
        <button
          onClick={() => onRemove(prospect.id)}
          title="Remove from Brandon's Database"
          className="text-slate-700 hover:text-red-400 transition-colors text-xl leading-none flex-shrink-0 p-0.5"
        >✕</button>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5">
        {prospect.phone ? (
          <a
            href={`tel:${prospect.phone}`}
            className="flex items-center gap-2.5 bg-green-600/10 border border-green-600/30 rounded-xl px-3 py-2 hover:bg-green-600/20 transition-colors group"
          >
            <span className="text-base">📞</span>
            <span className="text-green-400 font-mono font-bold text-sm flex-1">{prospect.phone}</span>
            <span className="text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">Tap to call</span>
          </a>
        ) : (
          <p className="text-xs text-slate-600 italic flex items-center gap-1.5">
            <span>📞</span> No phone on file
          </p>
        )}
        {prospect.email && (
          <a href={`mailto:${prospect.email}`}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors truncate">
            <span>📧</span>
            <span className="truncate">{prospect.email}</span>
          </a>
        )}
        {prospect.address && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            <span>📍</span>
            <span className="truncate">{prospect.address}</span>
          </p>
        )}
      </div>

      {/* Conversation notes */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
          Conversation Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="What did they say? Interest, objections, timeline, key follow-up points..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none transition-colors"
        />
      </div>

      {/* Next action */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3.5 space-y-2.5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Next Action</p>
        <select
          value={nextType}
          onChange={e => setNextType(e.target.value)}
          onBlur={saveAction}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition-colors"
        >
          <option value="">Select action type...</option>
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={nextDate}
            onChange={e => setNextDate(e.target.value)}
            onBlur={saveAction}
            className={`flex-1 bg-slate-800 border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors ${
              isOverdue ? 'border-red-500/60' : isDueToday ? 'border-amber-500/60' : 'border-slate-700'
            }`}
          />
          {isOverdue   && <span className="text-xs text-red-400 font-black flex-shrink-0">OVERDUE</span>}
          {isDueToday && !isOverdue && <span className="text-xs text-amber-400 font-black flex-shrink-0">TODAY</span>}
        </div>
        <input
          value={nextNote}
          onChange={e => setNextNote(e.target.value)}
          onBlur={saveAction}
          placeholder="Note for next action..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Complete button */}
      <button
        onClick={() => onComplete(prospect.id)}
        className="w-full bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 font-bold px-3 py-2.5 rounded-xl text-xs transition-all mt-auto"
      >
        ✓ Mark Complete & Archive
      </button>
    </div>
  );
}

// ─── Add Prospect Modal ────────────────────────────────────────────────────────
function AddProspectModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    ownerName: '', facilityName: '', phone: '', email: '', address: '', interestLevel: 'warm',
  });

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })); }
  const canSave = form.ownerName.trim() || form.facilityName.trim();

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">Add Prospect</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manually add a prospect to your database</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
        </div>

        <div className="p-5 space-y-3">
          {/* Interest level */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Interest Level</label>
            <div className="flex gap-2">
              {Object.entries(INTEREST).map(([key, { label, bg, border, text }]) => (
                <button
                  key={key}
                  onClick={() => set('interestLevel', key)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                    form.interestLevel === key
                      ? `${bg} ${border} ${text}`
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {[
            { key: 'ownerName',    label: 'Owner Name *',   placeholder: 'John Smith',           type: 'text'  },
            { key: 'facilityName', label: 'Facility Name',  placeholder: 'ABC Self Storage',     type: 'text'  },
            { key: 'phone',        label: 'Phone',          placeholder: '(555) 000-0000',       type: 'tel'   },
            { key: 'email',        label: 'Email',          placeholder: 'john@storage.com',     type: 'email' },
            { key: 'address',      label: 'Address',        placeholder: '123 Main St, City FL', type: 'text'  },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                onKeyDown={e => { if (e.key === 'Enter' && canSave) { onSave(form); onClose(); } }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-800">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => { if (canSave) { onSave(form); onClose(); } }}
            disabled={!canSave}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              canSave ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Add to My Database
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TodaysOverview({ prospects, onAddProspect, onUpdateProspect, onRemoveProspect, onCompleteProspect }) {
  const { today } = useDailyProgress();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter]   = useState('all');

  const filtered   = filter === 'all' ? prospects : prospects.filter(p => p.interestLevel === filter);
  const hot        = prospects.filter(p => p.interestLevel === 'hot').length;
  const warm       = prospects.filter(p => p.interestLevel === 'warm').length;
  const cool       = prospects.filter(p => p.interestLevel === 'cool').length;
  const withAction = prospects.filter(p => p.nextActionType).length;

  return (
    <div className="space-y-5">
      {/* Daily stats bar */}
      <div className="grid grid-cols-5 gap-3">
        {PROGRESS_FIELDS.map(f => (
          <div key={f.key} className={`${f.bg} border ${f.border} rounded-xl px-4 py-3`}>
            <p className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${f.accent} opacity-70`}>{f.label}</p>
            <p className={`text-3xl font-black ${f.accent}`}>{today[f.key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-black text-white">Brandon's Database</h2>
          <div className="flex gap-1.5">
            {hot  > 0 && <span className="text-xs bg-red-500/20 border border-red-500/30 text-red-400 font-bold px-2.5 py-0.5 rounded-full">{hot} HOT</span>}
            {warm > 0 && <span className="text-xs bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold px-2.5 py-0.5 rounded-full">{warm} WARM</span>}
            {cool > 0 && <span className="text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold px-2.5 py-0.5 rounded-full">{cool} COOL</span>}
          </div>
          {withAction > 0 && (
            <span className="text-xs text-slate-500">{withAction} with next action scheduled</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {[
              { key: 'all',  label: 'All'     },
              { key: 'hot',  label: '🔥 Hot'  },
              { key: 'warm', label: 'Warm'    },
              { key: 'cool', label: 'Cool'    },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  filter === f.key ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow"
          >
            <span className="text-lg leading-none font-black">+</span> Add Prospect
          </button>
        </div>
      </div>

      {/* Cards or empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-slate-600">
          <div className="text-6xl mb-4">🎯</div>
          <p className="text-base font-semibold text-slate-500 mb-2">
            {prospects.length === 0 ? "Your database is empty" : `No ${filter} prospects`}
          </p>
          <p className="text-sm text-slate-600 max-w-sm mx-auto">
            {prospects.length === 0
              ? 'When a conversation goes well, add them here from the Database tab using the ★ button, or click Add Prospect below.'
              : 'Change the filter above to see other interest levels.'}
          </p>
          {prospects.length === 0 && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow"
            >
              + Add First Prospect
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <ProspectCard
              key={p.id}
              prospect={p}
              onUpdate={onUpdateProspect}
              onRemove={onRemoveProspect}
              onComplete={onCompleteProspect}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddProspectModal
          onSave={onAddProspect}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
