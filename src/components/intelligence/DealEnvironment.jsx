// Dense signal table (not decorative gauges). Plain language, clearly
// system-generated synthesis with a direction + confidence per signal.
const SIGNALS = [
  ['debtCost', 'Debt Cost'],
  ['creditAvailability', 'Credit Availability'],
  ['buyerLiquidity', 'Buyer Liquidity'],
  ['capRatePressure', 'Cap-Rate Pressure'],
  ['transactionVelocity', 'Transaction Velocity'],
];
const DIR_TONE = {
  rising: 'text-red-300', widening: 'text-red-300', deteriorating: 'text-red-300',
  falling: 'text-emerald-300', tightening: 'text-emerald-300', improving: 'text-emerald-300',
  stable: 'text-slate-400', mixed: 'text-amber-300', unknown: 'text-slate-600',
};
const DIR_ARROW = { rising: '▲', widening: '▲', deteriorating: '▲', falling: '▼', tightening: '▼', improving: '▼', stable: '▬', mixed: '◆', unknown: '·' };
const CONF_TONE = { high: 'text-emerald-300', medium: 'text-amber-300', low: 'text-slate-500' };

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
                <td className={`py-1.5 font-semibold ${DIR_TONE[dir] ?? 'text-slate-500'}`}>
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
      <p className="mt-2 text-[10px] text-slate-600 leading-snug">System-generated synthesis from ingested sources — analytical inference, not objective prices or advice.</p>
    </div>
  );
}
