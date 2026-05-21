import { useState } from 'react';
import { PIPELINE_STAGES, PROPERTY_TYPES, ACTION_TYPES } from '../data/constants';
import { useFileStorage } from '../hooks/useFileStorage';

function ActionModal({ client, onSave, onClose }) {
  const [type, setType] = useState(client.nextActionType ?? '');
  const [date, setDate] = useState(client.nextActionDate ?? '');
  const [note, setNote] = useState(client.nextActionNote ?? '');

  function handleSave() {
    onSave(client.id, { nextActionType: type, nextActionDate: date, nextActionNote: note });
    onClose();
  }

  function handleClear() {
    onSave(client.id, { nextActionType: '', nextActionDate: '', nextActionNote: '' });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-black text-white">Set Next Action</h2>
            <p className="text-xs text-slate-500 mt-0.5">{client.name}{client.facilityName ? ` · ${client.facilityName}` : ''}</p>
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
          {client.nextActionType ? (
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
      </div>
    </div>
  );
}

export default function ClientCard({ client, onEdit, onDelete, onStageChange, onSetAction, compact = false }) {
  const stage = PIPELINE_STAGES.find(s => s.id === client.stageId) ?? PIPELINE_STAGES[0];
  const { openFile } = useFileStorage();
  const propType = PROPERTY_TYPES.find(p => p.value === client.propertyType);
  const docs = client.documents ?? [];
  const [showActionModal, setShowActionModal] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = client.nextActionDate && client.nextActionDate < today;
  const isDueToday = client.nextActionDate === today;
  const actionType = ACTION_TYPES.find(a => a.value === client.nextActionType);

  return (
    <>
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500 transition-all group">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              client.type === 'Buyer'
                ? 'bg-blue-900/50 border-blue-700 text-blue-300'
                : 'bg-amber-900/50 border-amber-700 text-amber-300'
            }`}>
              {client.type}
            </span>
            {propType && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-emerald-900/40 border-emerald-700 text-emerald-300">
                {propType.icon} {propType.label}
              </span>
            )}
            {!compact && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${stage.text} border-current bg-slate-900/50`}>
                {stage.id}. {stage.short}
              </span>
            )}
          </div>
          <h3 className="font-bold text-white text-sm mt-1 truncate">{client.name}</h3>
          {client.facilityName && (
            <p className="text-xs text-slate-400 truncate">{client.facilityName}</p>
          )}
        </div>
        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(client)}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(client.id)}
            className="p-1.5 rounded-lg hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition-all text-xs"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Address — clickable Google Maps link */}
      {client.address && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 hover:text-amber-400 mb-2 truncate flex items-center gap-1 transition-colors"
          title="Open in Google Maps"
        >
          📍 {client.address}
        </a>
      )}

      {/* Phone + Email */}
      {(client.phone || client.email) && (
        <div className="flex flex-col gap-0.5 mb-2">
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
            >
              📞 {client.phone}
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors truncate"
            >
              ✉️ {client.email}
            </a>
          )}
        </div>
      )}

      {/* Stats row */}
      {(client.units || client.sqft) && (
        <div className="flex gap-3 mb-2">
          {client.units && (
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{client.units.toLocaleString()}</span> units
            </span>
          )}
          {client.sqft && (
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{client.sqft.toLocaleString()}</span> sq ft
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <p className="text-xs text-slate-500 italic line-clamp-2">{client.notes}</p>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-700/60">
          <p className="text-xs text-slate-600 mb-1 uppercase tracking-wide font-semibold">
            📎 {docs.length} document{docs.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-0.5">
            {docs.map(doc => (
              <button
                key={doc.id}
                onClick={() => openFile(doc.id)}
                className="w-full text-left text-xs text-slate-400 hover:text-amber-400 truncate flex items-center gap-1 transition-colors"
                title={doc.name}
              >
                <span className="flex-shrink-0">↗</span>
                <span className="truncate">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Next Action display / set button */}
      <div className="mt-3 pt-3 border-t border-slate-700">
        {actionType ? (
          <button
            onClick={() => setShowActionModal(true)}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition-all border ${
              isOverdue
                ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                : isDueToday
                  ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{actionType.icon}</span>
                <span className={`text-xs font-bold truncate ${
                  isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {actionType.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isOverdue && <span className="text-xs text-red-400 font-black">OVERDUE</span>}
                {isDueToday && !isOverdue && <span className="text-xs text-amber-400 font-black">TODAY</span>}
                {client.nextActionDate && !isOverdue && !isDueToday && (
                  <span className="text-xs text-slate-500">{client.nextActionDate}</span>
                )}
              </div>
            </div>
            {client.nextActionNote && (
              <p className="text-xs text-slate-500 mt-1 truncate">{client.nextActionNote}</p>
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowActionModal(true)}
            className="w-full bg-transparent border border-dashed border-slate-700 hover:border-amber-500/40 text-slate-500 hover:text-amber-400 font-semibold px-3 py-2.5 rounded-xl text-xs transition-all"
          >
            + Set Next Action
          </button>
        )}
      </div>

      {/* Stage selector (mini) */}
      {!compact && (
        <div className="mt-2">
          <select
            value={client.stageId}
            onChange={e => onStageChange(client.id, Number(e.target.value))}
            className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-amber-500"
          >
            {PIPELINE_STAGES.map(s => (
              <option key={s.id} value={s.id}>{s.id}. {s.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>

    {showActionModal && (
      <ActionModal
        client={client}
        onSave={onSetAction}
        onClose={() => setShowActionModal(false)}
      />
    )}
    </>
  );
}
