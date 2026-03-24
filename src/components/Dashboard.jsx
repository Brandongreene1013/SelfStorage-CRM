import { useState } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-black ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Counter card ─────────────────────────────────────────────────────────────
function CounterCard({ label, value, accent, bg, border, onUp, onDown }) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-4 flex flex-col items-center gap-2`}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center leading-tight">{label}</p>
      <p className={`text-4xl font-black ${accent}`}>{value}</p>
      <div className="flex gap-2">
        <button
          onClick={onUp}
          title="Increment"
          className="w-8 h-8 rounded-lg bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/40 transition-all text-lg font-black leading-none flex items-center justify-center"
        >
          ▲
        </button>
        <button
          onClick={onDown}
          title="Decrement"
          className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-600/40 text-red-400 hover:bg-red-600/40 transition-all text-lg font-black leading-none flex items-center justify-center"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

// ─── Analytics row ────────────────────────────────────────────────────────────
function AnalyticsRow({ label, data }) {
  return (
    <div className="grid grid-cols-6 gap-3 items-center">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide col-span-1">{label}</p>
      {PROGRESS_FIELDS.map(f => (
        <div key={f.key} className={`${f.bg} border ${f.border} rounded-lg p-3 text-center`}>
          <p className={`text-2xl font-black ${f.accent}`}>{data[f.key]}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Mini calendar upcoming widget ───────────────────────────────────────────
function UpcomingMeetingsWidget({ meetings, clients, onNavigate }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = [...meetings]
    .filter(m => m.date >= todayStr)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 5);

  const todayMeetings = meetings.filter(m => m.date === todayStr);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Upcoming Meetings</p>
          <p className="text-xl font-black text-white mt-0.5">
            {new Date().toLocaleDateString('default', { month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-black ${todayMeetings.length > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
            {todayMeetings.length}
          </p>
          <p className="text-xs text-slate-500">today</p>
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {/* List */}
      {upcoming.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-4 text-slate-600">
          <div className="text-3xl mb-2">📅</div>
          <p className="text-xs">No upcoming meetings</p>
          <button
            onClick={onNavigate}
            className="mt-2 text-amber-500 hover:text-amber-400 text-xs font-semibold transition-colors"
          >
            + Schedule one →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(m => {
            const client = clients.find(c => c.id === m.clientId);
            const isToday = m.date === todayStr;
            const isTomorrow = m.date === (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
            const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
              : new Date(m.date + 'T12:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' });

            return (
              <button
                key={m.id}
                onClick={onNavigate}
                className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all"
              >
                <div className={`flex-shrink-0 rounded-lg px-2 py-1 text-center min-w-[48px] ${isToday ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-slate-700 border border-slate-600'}`}>
                  <p className={`text-xs font-black leading-none ${isToday ? 'text-amber-400' : 'text-slate-300'}`}>{dateLabel}</p>
                  {m.startTime && <p className={`text-xs mt-0.5 ${isToday ? 'text-amber-400/70' : 'text-slate-500'}`}>{m.startTime}</p>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{m.title}</p>
                  {client && <p className="text-xs text-amber-400/70 truncate mt-0.5">{client.name}</p>}
                  {m.location && <p className="text-xs text-slate-500 truncate">📍 {m.location}</p>}
                </div>
              </button>
            );
          })}
          <button
            onClick={onNavigate}
            className="w-full text-xs text-slate-500 hover:text-amber-400 py-1 transition-colors text-center"
          >
            View full calendar →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ clients, meetings = [], onNavigateCalendar }) {
  const buyers = clients.filter(c => c.type === 'Buyer').length;
  const sellers = clients.filter(c => c.type === 'Seller').length;
  const inContract = clients.filter(c => c.stageId === 8).length;
  const closed = clients.filter(c => c.stageId === 9 || c.stageId === 10).length;
  const totalUnits = clients.reduce((sum, c) => sum + (c.units ?? 0), 0);
  const totalSqft = clients.reduce((sum, c) => sum + (c.sqft ?? 0), 0);
  const active = clients.filter(c => c.stageId >= 2 && c.stageId <= 9).length;
  const stageCounts = PIPELINE_STAGES.map(s => ({ ...s, count: clients.filter(c => c.stageId === s.id).length }));
  const busiest = stageCounts.reduce((a, b) => (b.count > a.count ? b : a), stageCounts[0]);

  const { today, increment, decrement, getWeek, getMonth, getYear } = useDailyProgress();
  const [analyticsRange, setAnalyticsRange] = useState('Week');

  const analyticsData = analyticsRange === 'Week' ? getWeek()
    : analyticsRange === 'Month' ? getMonth()
    : getYear();

  const todayLabel = new Date().toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">

      {/* ── Top stat grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Clients" value={clients.length} />
        <StatCard label="Buyers" value={buyers} accent="text-blue-400" />
        <StatCard label="Sellers" value={sellers} accent="text-amber-400" />
        <StatCard label="Active Deals" value={active} sub="Stages 2–9" accent="text-green-400" />
        <StatCard label="In Contract" value={inContract} accent="text-orange-400" />
        <StatCard label="Closed" value={closed} sub="Close + Post-Close" accent="text-purple-400" />
      </div>

      {/* ── Secondary stats + Calendar widget ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Stats column */}
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
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

        {/* Mini calendar widget */}
        <div className="lg:col-span-1">
          <UpcomingMeetingsWidget
            meetings={meetings}
            clients={clients}
            onNavigate={onNavigateCalendar}
          />
        </div>
      </div>

      {/* ── Today's Progress ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Today's Progress</h2>
            <p className="text-xs text-slate-500 mt-0.5">{todayLabel} · Resets at midnight</p>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-400">Live</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PROGRESS_FIELDS.map(f => (
            <CounterCard
              key={f.key}
              label={f.label}
              value={today[f.key] ?? 0}
              accent={f.accent}
              bg={f.bg}
              border={f.border}
              onUp={() => increment(f.key)}
              onDown={() => decrement(f.key)}
            />
          ))}
        </div>
      </div>

      {/* ── Productivity Analytics ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Productivity Analytics</h2>
            <p className="text-xs text-slate-500 mt-0.5">Compounded totals across selected period</p>
          </div>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {['Week', 'Month', 'Year'].map(r => (
              <button
                key={r}
                onClick={() => setAnalyticsRange(r)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  analyticsRange === r
                    ? 'bg-amber-500 text-slate-900 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-6 gap-3 mb-2">
          <div />
          {PROGRESS_FIELDS.map(f => (
            <p key={f.key} className={`text-xs font-semibold ${f.accent} uppercase tracking-wide text-center`}>
              {f.label}
            </p>
          ))}
        </div>

        <div className="space-y-3">
          <AnalyticsRow label={analyticsRange} data={analyticsData} />
        </div>

        {/* Micro breakdown note */}
        <p className="text-xs text-slate-600 mt-4 text-center">
          {analyticsRange === 'Week' ? 'Last 7 days including today'
            : analyticsRange === 'Month' ? 'Last 30 days including today'
            : 'Last 365 days including today'}
        </p>
      </div>

      {/* ── Funnel Charts ── */}
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
