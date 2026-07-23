import { ACTION_TYPES, CALL_ACTION_TYPES } from '../data/constants';

const TYPE_MAP = Object.fromEntries([...ACTION_TYPES, ...CALL_ACTION_TYPES].map(action => [action.value, action]));

function ts(entry) {
  // Prefer full ISO timestamp; fall back to date-only
  return entry.at || (entry.date ? entry.date + 'T12:00:00' : null);
}

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const hasTime = /T\d\d:\d\d/.test(iso) && !/T12:00:00$/.test(iso);
  return hasTime
    ? `${datePart}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : datePart;
}

// Flattens every logged action across clients + contacts into one timeline.
export default function RecentActivity({
  clients = [],
  contacts = [],
  events,
  limit = 15,
  onOpenContact,
  onOpenClient,
}) {
  const acts = events ? events.map(event => ({
    ...event,
    type: event.type,
    at: event.occurredAt,
    who: event.label,
    note: event.detail,
    src: event.relatedType,
    relatedId: event.relatedId,
    key: event.key,
  })) : [];
  clients.forEach(c => (c.actionLog ?? []).forEach(e =>
    !events && acts.push({ ...e, who: c.name, sub: c.facilityName, src: 'client', relatedId: c.id })));
  contacts.forEach(c => (c.actionLog ?? []).forEach(e =>
    !events && acts.push({ ...e, who: c.ownerName || c.facilityName, sub: c.facilityName, src: 'contact', relatedId: c.id })));

  acts.sort((a, b) => new Date(ts(b)) - new Date(ts(a)));
  const recent = acts.slice(0, limit);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Activity</h2>
        <span className="text-xs text-slate-600">{acts.length} logged</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-600 italic">No actions logged yet. Hit "+ Log" on any card to start the timeline.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-auto pr-1">
          {recent.map((e, i) => {
            const t = TYPE_MAP[e.type];
            const onOpen = e.src === 'contact'
              ? () => onOpenContact?.(e.relatedId)
              : e.src === 'client'
                ? () => onOpenClient?.(e.relatedId)
                : null;
            return (
              <button
                type="button"
                key={e.key || e.eventId || e.messageId || `${ts(e)}-${e.relatedId || i}`}
                onClick={onOpen || undefined}
                disabled={!onOpen}
                className="w-full flex items-start gap-2.5 text-sm text-left rounded-md px-1 py-0.5 hover:bg-slate-800/70 disabled:hover:bg-transparent"
              >
                <span className="flex-shrink-0 mt-0.5">{t?.icon ?? '•'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-200 truncate">{e.who || 'Unknown'}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{fmt(ts(e))}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {e.needsReview && <span className="text-amber-400 font-bold mr-1" title="Low-confidence email match — verify this is the right contact">⚠ review</span>}
                    {e.note || t?.label}
                    {e.sub ? <span className="text-slate-600"> · {e.sub}</span> : null}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
