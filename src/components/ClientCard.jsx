import { PIPELINE_STAGES } from '../data/constants';

export default function ClientCard({ client, onEdit, onDelete, onStageChange, compact = false }) {
  const stage = PIPELINE_STAGES.find(s => s.id === client.stageId) ?? PIPELINE_STAGES[0];

  return (
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

      {/* Address */}
      {client.address && (
        <p className="text-xs text-slate-500 mb-2 truncate">📍 {client.address}</p>
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

      {/* Stage selector (mini) */}
      {!compact && (
        <div className="mt-3 pt-3 border-t border-slate-700">
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
  );
}
