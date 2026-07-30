// Dense signal table (not decorative gauges). Plain language, clearly
// system-generated synthesis with a direction + confidence per signal.
const SIGNALS = [
  ['debtCost', 'Debt Cost'],
  ['creditAvailability', 'Credit Availability'],
  ['buyerLiquidity', 'Buyer Liquidity'],
  ['capRatePressure', 'Cap-Rate Pressure'],
  ['transactionVelocity', 'Transaction Velocity'],
];
const DIR_ARROW = { rising: '▲', widening: '▲', deteriorating: '▼', falling: '▼', tightening: '▼', improving: '▲', stable: '→', mixed: '↔', unknown: '·' };
const CONF_TONE = { high: 'text-emerald-300', medium: 'text-amber-300', low: 'text-slate-500' };

function directionTone(signal, direction) {
  if (direction === 'stable' || direction === 'unknown') return 'text-slate-400';
  if (direction === 'mixed') return 'text-amber-300';
  if (direction === 'improving') return 'text-emerald-300';
  if (direction === 'deteriorating' || direction === 'tightening') return 'text-red-300';

  const favorableWhenRising = signal === 'creditAvailability'
    || signal === 'buyerLiquidity'
    || signal === 'transactionVelocity';
  const favorable = direction === 'rising' || direction === 'widening'
    ? favorableWhenRising
    : !favorableWhenRising;
  return favorable ? 'text-emerald-300' : 'text-red-300';
}

export default function DealEnvironment({ dealEnvironment }) {
  if (!dealEnvironment) {
    return <p className="text-xs text-slate-600 italic py-2">The deal-environment matrix generates with the daily brief.</p>;
  }
  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-600 text-left">
            <th className="font-semibold pb-1.5">Signal</th>
            <th className="font-semibold pb-1.5">Read</th>
            <th className="font-semibold pb-1.5">Direction</th>
            <th className="font-semibold pb-1.5 text-right">Conf.</th>
          </tr>
        </thead>
        <tbody>
          {SIGNALS.map(([key, label]) => {
            const cell = dealEnvironment[key] ?? {};
            const dir = String(cell.direction ?? 'unknown').toLowerCase();
            return (
              <tr key={key} className="border-t border-slate-800/70">
                <td className="py-1.5 text-slate-400 font-medium">{label}</td>
                <td className="py-1.5 text-slate-200 font-semibold">{cell.read ?? 'Unknown'}</td>
                <td className={`py-1.5 font-semibold ${directionTone(key, dir)}`}>
                  <span className="mr-1">{DIR_ARROW[dir] ?? '·'}</span>{dir}
                </td>
                <td className={`py-1.5 text-right ${CONF_TONE[String(cell.confidence ?? 'low').toLowerCase()] ?? 'text-slate-500'}`}>
                  {cell.confidence ?? 'low'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-600 leading-snug">Arrow = direction. Color = estimated deal impact. System-generated inference, not objective prices or advice.</p>
    </div>
  );
}
