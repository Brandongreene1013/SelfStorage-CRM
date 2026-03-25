import { useState } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KPIStrip({ stats }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 divide-x divide-slate-800">
        {stats.map((s, i) => (
          <div key={i} className="px-5 py-3.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-2xl font-black leading-none ${s.accent ?? 'text-white'}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-slate-600 mt-1">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline Continuum Snapshot ──────────────────────────────────────────────
function PipelineContinuum({ stageCounts, totalUnits, totalSqft }) {
  const max = Math.max(...stageCounts.map(s => s.count), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Brokerage Pipeline</h2>
          <p className="text-xs text-slate-600 mt-0.5">Deal distribution across the full lifecycle</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          {totalUnits > 0 && (
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide">Units</p>
              <p className="text-sm font-bold text-slate-400">{totalUnits.toLocaleString()}</p>
            </div>
          )}
          {totalSqft > 0 && (
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide">Sq Ft</p>
              <p className="text-sm font-bold text-slate-400">{(totalSqft / 1000).toFixed(0)}k</p>
            </div>
          )}
        </div>
      </div>

      {/* Stage bar */}
      <div className="flex items-end gap-1.5">
        {stageCounts.map((s) => (
          <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5 group">
            {/* Count */}
            <span className={`text-sm font-black leading-none ${s.count > 0 ? s.text : 'text-slate-700'}`}>
              {s.count > 0 ? s.count : '·'}
            </span>
            {/* Bar */}
            <div className="w-full rounded-md transition-all duration-500"
              style={{
                height: `${Math.max((s.count / max) * 52, s.count > 0 ? 8 : 3)}px`,
                background: s.count > 0 ? s.hex : '#1e293b',
                opacity: s.count > 0 ? 0.85 : 1,
              }}
            />
            {/* Label */}
            <span className={`text-center leading-tight transition-colors ${s.count > 0 ? 'text-slate-400' : 'text-slate-700'}`}
              style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.03em' }}>
              {s.short}
            </span>
          </div>
        ))}
      </div>

      {/* Flow arrows */}
      <div className="flex items-center mt-3 px-1">
        {stageCounts.map((s, i) => (
          <div key={s.id} className="flex-1 flex items-center">
            <div className="flex-1 h-px bg-slate-800" />
            {i < stageCounts.length - 1 && (
              <span className="text-slate-700 text-xs mx-0.5">›</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Today's Progress ─────────────────────────────────────────────────────────
function TodaysProgress({ today, increment, decrement, todayLabel }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Today's Progress</h2>
          <p className="text-xs text-slate-600 mt-0.5">{todayLabel} · Resets at midnight</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-green-400">Live</span>
        </div>
      </div>

      <div className="space-y-2">
        {PROGRESS_FIELDS.map(f => (
          <div key={f.key}
            className={`${f.bg} border ${f.border} rounded-lg px-4 py-2.5 flex items-center justify-between`}>
            <span className={`text-xs font-semibold ${f.accent}`}>{f.label}</span>
            <div className="flex items-center gap-3">
              <span className={`text-xl font-black ${f.accent} w-8 text-center tabular-nums`}>
                {today[f.key] ?? 0}
              </span>
              <div className="flex gap-1">
                <button onClick={() => increment(f.key)}
                  className="w-6 h-6 rounded bg-slate-700/80 hover:bg-green-600/30 border border-slate-600 hover:border-green-600/50 text-slate-300 text-xs font-black transition-all flex items-center justify-center">
                  +
                </button>
                <button onClick={() => decrement(f.key)}
                  className="w-6 h-6 rounded bg-slate-700/80 hover:bg-red-600/20 border border-slate-600 hover:border-red-600/40 text-slate-500 text-xs font-black transition-all flex items-center justify-center">
                  −
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Productivity Analytics ───────────────────────────────────────────────────
function ProductivityAnalytics({ analyticsRange, setAnalyticsRange, analyticsData }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Productivity Analytics</h2>
          <p className="text-xs text-slate-600 mt-0.5">Compounded totals · {analyticsRange === 'Week' ? 'Last 7 days' : analyticsRange === 'Month' ? 'Last 30 days' : 'Last 365 days'}</p>
        </div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {['Week', 'Month', 'Year'].map(r => (
            <button key={r} onClick={() => setAnalyticsRange(r)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                analyticsRange === r ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {PROGRESS_FIELDS.map(f => (
          <div key={f.key} className={`${f.bg} border ${f.border} rounded-xl p-3 text-center`}>
            <p className={`text-xs font-semibold ${f.accent} mb-1 leading-tight`}>{f.label}</p>
            <p className={`text-2xl font-black ${f.accent}`}>{analyticsData[f.key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Upcoming Meetings ────────────────────────────────────────────────────────
function UpcomingMeetingsWidget({ meetings, clients, onNavigate }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = [...meetings]
    .filter(m => m.date >= todayStr)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 5);
  const todayCount = meetings.filter(m => m.date === todayStr).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Upcoming Meetings</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {new Date().toLocaleDateString('default', { month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black leading-none ${todayCount > 0 ? 'text-amber-400' : 'text-slate-700'}`}>
            {todayCount}
          </p>
          <p className="text-xs text-slate-600">today</p>
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-slate-600 gap-2">
          <span className="text-2xl">📅</span>
          <p className="text-xs">No upcoming meetings</p>
          <button onClick={onNavigate}
            className="text-amber-500 hover:text-amber-400 text-xs font-semibold transition-colors">
            + Schedule one →
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(m => {
            const client = clients.find(c => c.id === m.clientId);
            const isToday = m.date === todayStr;
            const isTomorrow = m.date === (() => {
              const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
            })();
            const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
              : new Date(m.date + 'T12:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' });

            return (
              <button key={m.id} onClick={onNavigate}
                className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/50 hover:border-slate-600 transition-all">
                <div className={`flex-shrink-0 rounded-lg px-2 py-1 min-w-[46px] text-center ${
                  isToday ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-slate-700 border border-slate-600'
                }`}>
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
          <button onClick={onNavigate}
            className="w-full text-xs text-slate-600 hover:text-amber-400 py-1 transition-colors text-center">
            View full calendar →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Active Relationships (Follow-ups) ────────────────────────────────────────
function ActiveRelationships({ clients }) {
  // Clients in relationship-building stages
  const active = clients
    .filter(c => [2, 3, 4, 5].includes(c.stageId))
    .sort((a, b) => a.stageId - b.stageId)
    .slice(0, 6);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Relationships</h2>
          <p className="text-xs text-slate-600 mt-0.5">Cold Call → Exclusive Listing</p>
        </div>
        <span className="text-xs bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md font-semibold">
          {clients.filter(c => [2,3,4,5].includes(c.stageId)).length}
        </span>
      </div>

      <div className="h-px bg-slate-800" />

      {active.length === 0 ? (
        <p className="text-xs text-slate-600 italic text-center py-4">No active relationships</p>
      ) : (
        <div className="space-y-1.5">
          {active.map(c => {
            const stage = PIPELINE_STAGES.find(s => s.id === c.stageId);
            return (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage?.hex ?? '#475569' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                </div>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${stage?.text ?? 'text-slate-400'}`}
                  style={{ fontSize: '9px' }}>
                  {stage?.short}
                </span>
              </div>
            );
          })}
          {clients.filter(c => [2,3,4,5].includes(c.stageId)).length > 6 && (
            <p className="text-xs text-slate-600 text-center pt-1">
              +{clients.filter(c => [2,3,4,5].includes(c.stageId)).length - 6} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ clients, meetings = [], onNavigateCalendar }) {
  const buyers      = clients.filter(c => c.type === 'Buyer').length;
  const sellers     = clients.filter(c => c.type === 'Seller').length;
  const inContract  = clients.filter(c => c.stageId === 8).length;
  const closed      = clients.filter(c => c.stageId === 9 || c.stageId === 10).length;
  const active      = clients.filter(c => c.stageId >= 2 && c.stageId <= 9).length;
  const totalUnits  = clients.reduce((sum, c) => sum + (c.units ?? 0), 0);
  const totalSqft   = clients.reduce((sum, c) => sum + (c.sqft ?? 0), 0);
  const stageCounts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: clients.filter(c => c.stageId === s.id).length,
  }));

  const { today, increment, decrement, getWeek, getMonth, getYear } = useDailyProgress();
  const [analyticsRange, setAnalyticsRange] = useState('Week');

  const analyticsData = analyticsRange === 'Week' ? getWeek()
    : analyticsRange === 'Month' ? getMonth()
    : getYear();

  const todayLabel = new Date().toLocaleDateString('default', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const kpiStats = [
    { label: 'Total Clients', value: clients.length },
    { label: 'Buyers',        value: buyers,      accent: 'text-blue-400' },
    { label: 'Sellers',       value: sellers,     accent: 'text-amber-400' },
    { label: 'Active Deals',  value: active,      accent: 'text-green-400', sub: 'Stages 2–9' },
    { label: 'In Contract',   value: inContract,  accent: 'text-orange-400' },
    { label: 'Closed',        value: closed,      accent: 'text-purple-400', sub: 'Close + Post-Close' },
  ];

  return (
    <div className="space-y-4">

      {/* ── KPI Strip ── */}
      <KPIStrip stats={kpiStats} />

      {/* ── Pipeline Continuum ── */}
      <PipelineContinuum
        stageCounts={stageCounts}
        totalUnits={totalUnits}
        totalSqft={totalSqft}
      />

      {/* ── Main Body: Left content + Right sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Today's Progress + Analytics + Funnel */}
        <div className="lg:col-span-2 space-y-4">
          <TodaysProgress
            today={today}
            increment={increment}
            decrement={decrement}
            todayLabel={todayLabel}
          />

          <ProductivityAnalytics
            analyticsRange={analyticsRange}
            setAnalyticsRange={setAnalyticsRange}
            analyticsData={analyticsData}
          />

          <FunnelChart clients={clients} filter="All" />
        </div>

        {/* Right: Meetings + Active Relationships */}
        <div className="space-y-4">
          <UpcomingMeetingsWidget
            meetings={meetings}
            clients={clients}
            onNavigate={onNavigateCalendar}
          />
          <ActiveRelationships clients={clients} />
        </div>

      </div>
    </div>
  );
}
