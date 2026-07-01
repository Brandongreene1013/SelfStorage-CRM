import { useState, useMemo } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';
import RecentActivity from './RecentActivity';
import NeedsReview from './NeedsReview';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';
import { SectionCard, MetricCardGrid, LoadingSkeleton, EmptyState } from './ui';
import { TaskRow, TaskModal } from './tasks';

// ─── Pipeline Continuum Snapshot ──────────────────────────────────────────────
function PipelineContinuum({ stageCounts, totalUnits, totalSqft }) {
  const max = Math.max(...stageCounts.map(s => s.count), 1);

  return (
    <SectionCard
      title="Brokerage Pipeline"
      subtitle="Deal distribution across the full lifecycle"
      actions={
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
      }
    >
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
    </SectionCard>
  );
}

// ─── Today's Progress ─────────────────────────────────────────────────────────
function TodaysProgress({ today, increment, decrement, setValue, todayLabel }) {
  return (
    <SectionCard
      title="Today's Progress"
      subtitle={`${todayLabel} · Resets at midnight`}
      actions={
        <div className="flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-green-400">Live</span>
        </div>
      }
    >

      <div className="space-y-2">
        {PROGRESS_FIELDS.map(f => (
          <div key={f.key}
            className={`${f.bg} border ${f.border} rounded-lg px-4 py-2.5 flex items-center justify-between`}>
            <span className={`text-xs font-semibold ${f.accent}`}>{f.label}</span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={today[f.key] ?? 0}
                onChange={e => setValue(f.key, e.target.value)}
                onFocus={e => e.target.select()}
                className={`text-xl font-black ${f.accent} w-14 text-center tabular-nums bg-slate-800/60 border border-slate-700 rounded-md py-0.5 focus:outline-none focus:border-current [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                title="Type a number, or use +/−"
              />
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
    </SectionCard>
  );
}

// ─── Productivity Analytics ───────────────────────────────────────────────────
function ProductivityAnalytics({ analyticsRange, setAnalyticsRange, analyticsData, selectedMonth, setSelectedMonth }) {
  // Recomputed on every render so it's always accurate regardless of year
  const monthOptions = useMemo(() => {
    const year = new Date().getFullYear(); // always current year — auto-updates on Jan 1
    return Array.from({ length: 12 }, (_, i) => {
      const value = `${year}-${String(i + 1).padStart(2, '0')}`;
      const label = new Date(year, i, 1).toLocaleDateString('default', { month: 'long', year: 'numeric' });
      return { value, label };
    });
  }, []);

  const subLabel = analyticsRange === 'Week' ? 'Last 7 days'
    : analyticsRange === 'Year' ? 'Last 365 days'
    : analyticsRange === 'Month' ? 'Last 30 days'
    : monthOptions.find(o => o.value === selectedMonth)?.label ?? '';

  return (
    <SectionCard
      title="Productivity Analytics"
      subtitle={`Compounded totals · ${subLabel}`}
      actions={
        <>
          {/* Month picker — only shown when a specific month is selected */}
          {analyticsRange === 'SpecificMonth' && (
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {monthOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {['Week', 'Month', 'Year'].map(r => (
              <button key={r} onClick={() => setAnalyticsRange(r)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  analyticsRange === r ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'
                }`}>
                {r}
              </button>
            ))}
            {/* Calendar icon button to pick a specific month */}
            <button
              onClick={() => setAnalyticsRange('SpecificMonth')}
              title="Pick a specific month"
              className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                analyticsRange === 'SpecificMonth' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'
              }`}>
              ▾
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-5 gap-2">
        {PROGRESS_FIELDS.map(f => (
          <div key={f.key} className={`${f.bg} border ${f.border} rounded-xl p-3 text-center`}>
            <p className={`text-xs font-semibold ${f.accent} mb-1 leading-tight`}>{f.label}</p>
            <p className={`text-2xl font-black ${f.accent}`}>{analyticsData[f.key]}</p>
          </div>
        ))}
      </div>
    </SectionCard>
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
    <SectionCard
      title="Upcoming Meetings"
      subtitle={new Date().toLocaleDateString('default', { month: 'long', day: 'numeric' })}
      actions={
        <div className="text-right">
          <p className={`text-2xl font-black leading-none ${todayCount > 0 ? 'text-amber-400' : 'text-slate-700'}`}>
            {todayCount}
          </p>
          <p className="text-xs text-slate-600">today</p>
        </div>
      }
    >
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
                  <p className="text-xs font-semibold text-white truncate">
                    {m.title}
                    {m.source === 'outlook' && <span className="ml-1.5 text-[10px] text-blue-400/80 font-bold">· Outlook</span>}
                  </p>
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
    </SectionCard>
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
    <SectionCard
      title="Active Relationships"
      subtitle="Cold Call → Exclusive Listing"
      actions={
        <span className="text-xs bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md font-semibold">
          {clients.filter(c => [2,3,4,5].includes(c.stageId)).length}
        </span>
      }
    >
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
    </SectionCard>
  );
}

// ─── Universal Tasks (Sprint 2) ───────────────────────────────────────────────
function DashboardTasks({ taskApi }) {
  const [quickTitle, setQuickTitle] = useState('');
  const [showFullModal, setShowFullModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  if (!taskApi) return null;
  const { loading, migrationNeeded, groups, createTask, completeTask, deleteTask } = taskApi;
  const { overdue, dueToday, upcoming, noDueDate, completedToday } = groups;
  const totalOpen = overdue.length + dueToday.length + upcoming.length + noDueDate.length;

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await createTask({ title, taskType: 'general', dueDate: new Date().toISOString().slice(0, 10), source: 'dashboard' });
  }

  function group(label, items, tone) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${tone}`}>{label} ({items.length})</p>
        <div className="space-y-1.5">
          {items.map(t => (
            <TaskRow key={t.id} task={t} onComplete={completeTask} onDelete={deleteTask} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title="Tasks"
      subtitle={`${totalOpen} open`}
      actions={
        <button onClick={() => setShowFullModal(true)}
          className="text-xs text-slate-500 hover:text-amber-400 transition-colors font-semibold">
          + Full Task
        </button>
      }
      bodyClassName="space-y-3"
    >
      {migrationNeeded && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
          Task table needs a one-time SQL migration — run <code>sql/tasks_table_migration.sql</code> in Supabase, then refresh.
        </p>
      )}

      {/* Quick add */}
      <div className="flex gap-2">
        <input
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') quickAdd(); }}
          placeholder="Quick add a task (due today)..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
        />
        <button
          onClick={quickAdd}
          disabled={!quickTitle.trim()}
          className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
            quickTitle.trim() ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          +
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : totalOpen === 0 ? (
        <EmptyState icon="✅" message="Nothing open — you're caught up." />
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {group('Overdue', overdue, 'text-red-400')}
          {group('Due Today', dueToday, 'text-amber-400')}
          {group('Upcoming', upcoming, 'text-slate-400')}
          {group('No Due Date', noDueDate, 'text-slate-500')}
        </div>
      )}

      {completedToday.length > 0 && (
        <div>
          <button onClick={() => setShowCompleted(v => !v)}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors font-semibold">
            {showCompleted ? '▾' : '▸'} Completed today ({completedToday.length})
          </button>
          {showCompleted && (
            <div className="space-y-1 mt-1.5 opacity-60">
              {completedToday.map(t => (
                <div key={t.id} className="text-xs text-slate-500 line-through px-3 py-1">{t.title}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {showFullModal && (
        <TaskModal
          context={{ relatedType: 'general', source: 'dashboard' }}
          onSave={createTask}
          onClose={() => setShowFullModal(false)}
        />
      )}
    </SectionCard>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({ clients, contacts = [], meetings = [], onNavigateCalendar, onAddToPipeline, review, taskApi }) {
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

  const { today, increment, decrement, setValue, getWeek, getMonth, getYear, getSpecificMonth } = useDailyProgress();
  const [analyticsRange, setAnalyticsRange] = useState('Week');
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );

  const analyticsData = analyticsRange === 'Week' ? getWeek()
    : analyticsRange === 'Month' ? getMonth()
    : analyticsRange === 'Year' ? getYear()
    : getSpecificMonth(selectedMonth);

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
      <MetricCardGrid metrics={kpiStats} />

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
            setValue={setValue}
            todayLabel={todayLabel}
          />

          <ProductivityAnalytics
            analyticsRange={analyticsRange}
            setAnalyticsRange={setAnalyticsRange}
            analyticsData={analyticsData}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
          />

          <FunnelChart clients={clients} filter="All" />
        </div>

        {/* Right: Tasks + Meetings + Recent Activity + Active Relationships */}
        <div className="space-y-4">
          <DashboardTasks taskApi={taskApi} />
          <UpcomingMeetingsWidget
            meetings={meetings}
            clients={clients}
            onNavigate={onNavigateCalendar}
          />
          {review && (
            <NeedsReview
              items={review.items}
              records={review.records}
              onConfirm={review.onConfirm}
              onReassign={review.onReassign}
              onDismiss={review.onDismiss}
            />
          )}
          <RecentActivity clients={clients} contacts={contacts} />
          <ActiveRelationships clients={clients} />
        </div>

      </div>
    </div>
  );
}
