import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-black ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ clients }) {
  const buyers = clients.filter(c => c.type === 'Buyer').length;
  const sellers = clients.filter(c => c.type === 'Seller').length;

  const inContract = clients.filter(c => c.stageId === 8).length;
  const closed = clients.filter(c => c.stageId === 9 || c.stageId === 10).length;

  const totalUnits = clients.reduce((sum, c) => sum + (c.units ?? 0), 0);
  const totalSqft = clients.reduce((sum, c) => sum + (c.sqft ?? 0), 0);

  // Active = stages 2-9
  const active = clients.filter(c => c.stageId >= 2 && c.stageId <= 9).length;

  // Most-used stage
  const stageCounts = PIPELINE_STAGES.map(s => ({ ...s, count: clients.filter(c => c.stageId === s.id).length }));
  const busiest = stageCounts.reduce((a, b) => (b.count > a.count ? b : a), stageCounts[0]);

  return (
    <div className="space-y-6">
      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Clients" value={clients.length} />
        <StatCard label="Buyers" value={buyers} accent="text-blue-400" />
        <StatCard label="Sellers" value={sellers} accent="text-amber-400" />
        <StatCard label="Active Deals" value={active} sub="Stages 2–9" accent="text-green-400" />
        <StatCard label="In Contract" value={inContract} accent="text-orange-400" />
        <StatCard label="Closed" value={closed} sub="Close + Post-Close" accent="text-purple-400" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Units Tracked</p>
          <p className="text-2xl font-black text-white">{totalUnits > 0 ? totalUnits.toLocaleString() : '—'}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Sq Ft</p>
          <p className="text-2xl font-black text-white">{totalSqft > 0 ? `${(totalSqft / 1000).toFixed(0)}k` : '—'}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Busiest Stage</p>
          <p className="text-base font-black text-white leading-tight mt-1">{busiest.count > 0 ? busiest.label : '—'}</p>
          {busiest.count > 0 && <p className="text-xs text-slate-500">{busiest.count} client{busiest.count !== 1 ? 's' : ''}</p>}
        </div>
      </div>

      {/* Funnel Charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FunnelChart clients={clients} filter="All" />
        </div>
        <div className="grid grid-rows-2 gap-4">
          <FunnelChart clients={clients} filter="Seller" />
          <FunnelChart clients={clients} filter="Buyer" />
        </div>
      </div>
    </div>
  );
}
