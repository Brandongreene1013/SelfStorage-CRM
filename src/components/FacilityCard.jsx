export default function FacilityCard({ card, onAddToPipeline, onDismiss }) {
  const hasOwner   = card.ownerName || card.entityName;
  const hasAgent   = card.registeredAgent;
  const scraped    = card.assessorScraped;
  const sosFound   = !!card.registeredAgent;

  return (
    <div className="bg-slate-900 border border-amber-500/40 rounded-xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-0.5">Facility Card</p>
          <p className="text-sm font-semibold text-white leading-tight">{card.address}</p>
          <p className="text-xs text-slate-400 mt-0.5">{card.county} County · {card.stateFull}</p>
        </div>
        <button onClick={onDismiss} className="text-slate-600 hover:text-slate-300 text-lg leading-none mt-0.5">×</button>
      </div>

      <div className="p-4 space-y-3">
        {/* Owner / Entity */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Owner Name</p>
            <p className="text-sm font-bold text-white">
              {card.ownerName ?? <span className="text-slate-600 font-normal italic">Not found</span>}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">LLC / Entity</p>
            <p className="text-sm font-bold text-white">
              {card.entityName ?? <span className="text-slate-600 font-normal italic">N/A</span>}
            </p>
          </div>
        </div>

        {/* Registered Agent */}
        {card.isLLC && (
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Registered Agent</p>
            {hasAgent ? (
              <>
                <p className="text-sm font-bold text-white">{card.registeredAgent}</p>
                {card.registeredAgentAddress && (
                  <p className="text-xs text-slate-400 mt-0.5">{card.registeredAgentAddress}</p>
                )}
                {card.entityStatus && (
                  <span className={`inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    card.entityStatus.toLowerCase().includes('active')
                      ? 'bg-green-900/40 text-green-400'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {card.entityStatus}
                  </span>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600 italic">Could not retrieve — check {card.sosName} manually</p>
            )}
          </div>
        )}

        {/* Source trail */}
        <div className="flex flex-wrap gap-2">
          {/* County Assessor */}
          <a
            href={card.assessorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
              scraped
                ? 'bg-green-900/30 border-green-500/30 text-green-400 hover:bg-green-900/50'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400'
            }`}
          >
            <span>{scraped ? '✓' : '↗'}</span>
            <span>{card.assessorName ?? `${card.county} County Assessor`}</span>
          </a>

          {/* SOS link */}
          {card.isLLC && (
            <a
              href={card.sosDetailUrl ?? card.sosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                sosFound
                  ? 'bg-green-900/30 border-green-500/30 text-green-400 hover:bg-green-900/50'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400'
              }`}
            >
              <span>{sosFound ? '✓' : '↗'}</span>
              <span>{card.sosName ?? 'State SOS'}</span>
            </a>
          )}
        </div>

        {/* Actions */}
        {hasOwner && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onAddToPipeline({
                name: card.ownerName ?? card.entityName,
                facilityName: '',
                type: 'Seller',
                address: card.address,
                notes: [
                  card.entityName ? `Entity: ${card.entityName}` : null,
                  card.registeredAgent ? `Registered Agent: ${card.registeredAgent}` : null,
                  card.entityStatus ? `Status: ${card.entityStatus}` : null,
                ].filter(Boolean).join('\n'),
              })}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs py-2 rounded-lg transition-all"
            >
              + Add to Pipeline
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-2 text-xs text-slate-500 hover:text-slate-300 rounded-lg transition-all"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
