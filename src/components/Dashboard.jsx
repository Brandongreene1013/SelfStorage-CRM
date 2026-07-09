import { useState, useMemo } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';
import RecentActivity from './RecentActivity';
import NeedsReview from './NeedsReview';
import { LogActionModal } from './ActionLog';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';
import { SectionCard, MetricCardGrid, LoadingSkeleton, EmptyState } from './ui';
import { TaskRow, TaskModal, getNextOpenTask, buildCallbackTaskQueue } from './tasks';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Attack List / Needs Follow-Up / Pipeline Attention builders ─────────────
// These read the universal tasks table plus Database contacts and Clients —
// no new data source, no new schema. Kept as plain functions (not hooks) so
// they're easy to reason about and cheap to recompute via useMemo below.

function buildAttackList(taskApi, contacts, clients) {
  if (!taskApi) return [];
  const today = todayStr();
  const { overdue = [], dueToday = [] } = taskApi.groups ?? {};
  const dated = [...overdue, ...dueToday].filter(t => t.relatedType === 'contact' || t.relatedType === 'client');

  const rows = dated.map(t => {
    const isOverdue = !!(t.dueDate && t.dueDate < today);
    if (t.relatedType === 'contact') {
      const c = contacts.find(x => x.id === t.relatedId);
      return {
        key: `task-${t.id}`, kind: 'contact', taskId: t.id,
        name: c?.ownerName || t.relatedName || 'Unknown Owner',
        facilityName: c?.facilityName || '', phone: c?.phone || '',
        reason: t.title, overdue: isOverdue, dueDate: t.dueDate,
        contact: c ?? null,
      };
    }
    const cl = clients.find(x => x.id === t.relatedId);
    return {
      key: `task-${t.id}`, kind: 'client', taskId: t.id,
      name: cl?.name || t.relatedName || 'Unknown Client',
      facilityName: cl?.facilityName || '', phone: cl?.phone || '',
      reason: t.title, overdue: isOverdue, dueDate: t.dueDate,
      client: cl ?? null,
    };
  });

  // Safety net for contacts flagged "Call Back" with a due date but no
  // matching task row (e.g. legacy data predating Sprint 4's task creation).
  const coveredContactIds = new Set(rows.filter(r => r.kind === 'contact' && r.contact).map(r => r.contact.id));
  contacts.forEach(c => {
    if (c.status === 'callback' && c.callbackDate && c.callbackDate <= today && !coveredContactIds.has(c.id)) {
      rows.push({
        key: `callback-${c.id}`, kind: 'contact',
        name: c.ownerName || 'Unknown Owner',
        facilityName: c.facilityName || '', phone: c.phone || '',
        reason: 'Callback due', overdue: c.callbackDate < today, dueDate: c.callbackDate,
        contact: c,
      });
    }
  });

  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });
  return rows;
}

function buildNeedsFollowUp(taskApi, contacts, clients, masterListId) {
  if (!taskApi) return [];
  const rows = [];
  contacts.forEach(c => {
    // Master Database is the parked/warehoused bucket, not an active working
    // list — a lukewarm lead sitting there with an old conversation logged
    // isn't something Brandon needs nagged about on the Dashboard.
    if (masterListId && c.listId === masterListId) return;
    if (c.status !== 'conversation' && c.status !== 'appointment') return;
    if (taskApi.getRelatedTasks('contact', c.id).length > 0) return;
    rows.push({
      key: `nf-contact-${c.id}`, kind: 'contact',
      name: c.ownerName || 'Unknown Owner', facilityName: c.facilityName || '',
      reason: c.status === 'appointment' ? 'Appt set — no follow-up task' : 'Conversation logged — no follow-up task',
      contact: c,
    });
  });
  clients.forEach(cl => {
    if (cl.stageId < 2 || cl.stageId > 9) return;
    if (cl.nextActionType) return;
    if (taskApi.getRelatedTasks('client', cl.id).length > 0) return;
    rows.push({
      key: `nf-client-${cl.id}`, kind: 'client',
      name: cl.name, facilityName: cl.facilityName || '',
      reason: 'Active pipeline stage — no next action',
      client: cl,
    });
  });
  return rows.slice(0, 10);
}

function buildPipelineAttention(taskApi, clients, meetings) {
  const today = todayStr();
  const rows = [];
  clients.forEach(cl => {
    if (cl.stageId < 2 || cl.stageId > 9) return;
    const open = taskApi?.getRelatedTasks('client', cl.id) ?? [];
    const next = getNextOpenTask(open);
    let reason = null;
    if (next?.dueDate && next.dueDate < today) reason = 'Overdue task';
    else if (next?.dueDate === today) reason = 'Task due today';
    else if (!next && !cl.nextActionType) reason = 'No next action';
    const meeting = meetings.find(m => m.clientId === cl.id && m.date >= today);
    if (!reason && !meeting) return;
    rows.push({ key: `pa-${cl.id}`, client: cl, reason: reason || 'Upcoming meeting', meeting });
  });
  const rank = { 'Overdue task': 0, 'Task due today': 1, 'No next action': 2 };
  rows.sort((a, b) => (rank[a.reason] ?? 3) - (rank[b.reason] ?? 3));
  return rows.slice(0, 8);
}

// ─── Today Command Header ────────────────────────────────────────────────────
function CommandHeader({ today, overdueCount, dueTodayCount, bovsDueCount, meetingsToday, todayCallbacks, overdueCallbacks, onStartCallMode }) {
  const dateLabel = new Date().toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
  const stats = [
    { label: 'Calls Today', value: today.calls, accent: 'text-blue-400' },
    { label: 'Conversations', value: today.conversations, accent: 'text-green-400' },
    { label: 'Appts Set', value: today.firstAppts, accent: 'text-amber-400' },
    { label: 'BOVs Due', value: bovsDueCount, accent: bovsDueCount > 0 ? 'text-purple-400' : 'text-slate-600' },
    { label: 'Due Today', value: dueTodayCount, accent: dueTodayCount > 0 ? 'text-amber-400' : 'text-slate-600' },
    { label: 'Overdue', value: overdueCount, accent: overdueCount > 0 ? 'text-red-400' : 'text-slate-600' },
    { label: 'Meetings Today', value: meetingsToday, accent: meetingsToday > 0 ? 'text-cyan-400' : 'text-slate-600' },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-xl font-black text-white">Today · {dateLabel}</h2>
          <p className="text-xs text-slate-500 mt-0.5">What Brandon should attack today</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onStartCallMode}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-black px-5 py-3 rounded-xl text-sm transition-all shadow flex items-center gap-2"
          >
            Start Call Session
          </button>
          {/* Callbacks owed — same task-based logic as Call Mode's Today's/
              Overdue Callbacks queues, so these numbers always match what
              the queue picker will show. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onStartCallMode('today')}
              disabled={todayCallbacks === 0}
              title="Open today's callback queue"
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
              todayCallbacks > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-800/60 border-slate-700 text-slate-600'
            }`}>
              {todayCallbacks} callback{todayCallbacks === 1 ? '' : 's'} due today
            </button>
            <button
              onClick={() => onStartCallMode('overdue')}
              disabled={overdueCallbacks === 0}
              title="Open overdue callback queue"
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
              overdueCallbacks > 0 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-800/60 border-slate-700 text-slate-600'
            }`}>
              {overdueCallbacks} overdue callback{overdueCallbacks === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-center">
            <p className={`text-2xl font-black leading-none ${s.accent}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Today's Attack List ──────────────────────────────────────────────────────
function AttackList({ rows, onCallContact, onEditClient, onOpenDatabase }) {
  return (
    <SectionCard
      title="Today's Attack List"
      subtitle="Who to contact next, ranked overdue to due today"
      actions={
        <button onClick={onOpenDatabase} className="text-xs text-amber-500 hover:text-amber-400 font-semibold transition-colors">
          Open Call Mode
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="🎯" message="Nothing overdue or due today. You're caught up." />
      ) : (
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
          {rows.map(r => (
            <div key={r.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                r.overdue ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">{r.name}</span>
                  {r.facilityName && <span className="text-xs text-slate-500 truncate">{r.facilityName}</span>}
                </div>
                <p className={`text-xs mt-0.5 truncate ${r.overdue ? 'text-red-400' : 'text-amber-400/80'}`}>
                  {r.overdue ? 'OVERDUE - ' : ''}{r.reason}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {r.kind === 'contact' && r.phone && (
                  <a href={`tel:${r.phone}`} onClick={e => e.stopPropagation()} title="Dial"
                    className="text-xs font-bold bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 px-2 py-1 rounded-lg transition-all">
                    📞
                  </a>
                )}
                {r.kind === 'contact' && r.contact && (
                  <button onClick={() => onCallContact(r.contact)}
                    className="text-xs font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 px-2.5 py-1 rounded-lg transition-all">
                    Open
                  </button>
                )}
                {r.kind === 'client' && r.client && (
                  <button onClick={() => onEditClient(r.client)}
                    className="text-xs font-bold bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25 px-2.5 py-1 rounded-lg transition-all">
                    Push
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Pipeline Attention ───────────────────────────────────────────────────────
function CallbackCommandCenter({ todayCallbacks, overdueCallbacks, upcomingCallbacks, followUpCount, appointmentFollowUps, onOpenQueue, onOpenDatabaseFilter }) {
  const cards = [
    { key: 'today', label: "Today's Callbacks", value: todayCallbacks, tone: 'text-amber-400', bg: 'hover:border-amber-500/50', onClick: () => onOpenQueue?.('today') },
    { key: 'overdue', label: 'Overdue Callbacks', value: overdueCallbacks, tone: 'text-red-400', bg: 'hover:border-red-500/50', onClick: () => onOpenQueue?.('overdue') },
    { key: 'upcoming', label: 'Upcoming', value: upcomingCallbacks, tone: 'text-purple-400', bg: 'hover:border-purple-500/50', onClick: () => onOpenQueue?.('upcoming') },
    { key: 'followup', label: 'Recent Conversations', value: followUpCount, tone: 'text-green-400', bg: 'hover:border-green-500/50', onClick: () => onOpenQueue?.('followup') },
    { key: 'appointment', label: 'Appt / BOV Follow-Up', value: appointmentFollowUps, tone: 'text-cyan-400', bg: 'hover:border-cyan-500/50', onClick: () => onOpenDatabaseFilter?.('appointment') },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {cards.map(card => (
        <button
          key={card.key}
          onClick={card.onClick}
          className={`text-left bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 transition-all ${card.bg}`}
        >
          <p className={`text-3xl font-black leading-none ${card.value > 0 ? card.tone : 'text-slate-700'}`}>{card.value}</p>
          <p className="text-xs font-bold text-slate-300 mt-2">{card.label}</p>
        </button>
      ))}
    </div>
  );
}

function PipelineAttentionActions({ rows, onEditClient, onLogClientAction, onDeleteClientAction, taskApi }) {
  const [loggingClient, setLoggingClient] = useState(null);
  const [taskClient, setTaskClient] = useState(null);

  return (
    <SectionCard title="Pipeline Attention" subtitle="Deals that need a push">
      {rows.length === 0 ? (
        <p className="text-xs text-slate-600 italic text-center py-4">No active deals need attention right now.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => {
            const stage = PIPELINE_STAGES.find(s => s.id === r.client.stageId);
            const tone = r.reason === 'Overdue task' ? 'text-red-400'
              : r.reason === 'Task due today' ? 'text-amber-400'
              : r.reason === 'No next action' ? 'text-slate-400'
              : 'text-cyan-400';
            const meetingText = r.meeting ? ` | Meeting ${r.meeting.date === todayStr() ? 'today' : r.meeting.date}` : '';
            return (
              <div key={r.key}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage?.hex ?? '#475569' }} />
                <button onClick={() => onEditClient(r.client)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-semibold text-white truncate">{r.client.name}</p>
                  <p className={`text-xs truncate ${tone}`}>{r.reason}{meetingText}</p>
                </button>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${stage?.text ?? 'text-slate-400'}`} style={{ fontSize: '9px' }}>
                  {stage?.short}
                </span>
                {r.client.phone && (
                  <a href={`tel:${r.client.phone}`} className="text-xs font-bold bg-green-600/15 border border-green-600/30 text-green-400 hover:bg-green-600/25 px-2 py-1 rounded-lg">
                    Call
                  </a>
                )}
                <button onClick={() => setLoggingClient(r.client)} className="text-xs font-bold bg-slate-700/70 border border-slate-600 text-slate-300 hover:text-white px-2 py-1 rounded-lg">
                  Log
                </button>
                <button onClick={() => setTaskClient(r.client)} className="text-xs font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 px-2 py-1 rounded-lg">
                  Task
                </button>
              </div>
            );
          })}
        </div>
      )}

      {loggingClient && (
        <LogActionModal
          name={loggingClient.name}
          subtitle={loggingClient.facilityName}
          actionLog={loggingClient.actionLog}
          onSave={(entry) => onLogClientAction?.(loggingClient.id, entry)}
          onDelete={onDeleteClientAction ? (index) => {
            onDeleteClientAction(loggingClient.id, index);
            setLoggingClient(prev => prev ? { ...prev, actionLog: (prev.actionLog ?? []).filter((_, idx) => idx !== index) } : prev);
          } : undefined}
          onClose={() => setLoggingClient(null)}
        />
      )}

      {taskClient && (
        <TaskModal
          context={{ relatedType: 'client', relatedId: taskClient.id, relatedName: taskClient.name, source: 'dashboard' }}
          defaults={{ title: '', taskType: 'follow_up' }}
          onSave={taskApi?.createTask}
          onClose={() => setTaskClient(null)}
        />
      )}
    </SectionCard>
  );
}

// ─── Needs Follow-Up (V1) ─────────────────────────────────────────────────────
function NeedsFollowUp({ rows, onCallContact, onEditClient, onMoveToMasterDB }) {
  if (rows.length === 0) return null;
  return (
    <SectionCard title="Needs Follow-Up" subtitle="Activity logged with no open task">
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.key}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all">
            <button
              onClick={() => r.kind === 'contact' ? onCallContact(r.contact) : onEditClient(r.client)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-xs font-semibold text-white truncate">{r.name}</p>
              <p className="text-xs text-slate-500 truncate">{r.reason}</p>
            </button>
            {r.kind === 'contact' && onMoveToMasterDB && (
              <button
                onClick={() => onMoveToMasterDB(r.contact)}
                title="Not actionable right now — park this lead in the Master Database and stop nudging me about it"
                className="flex-shrink-0 text-xs font-semibold text-slate-500 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 rounded-lg px-2 py-1 transition-all"
              >
                Move to Master DB
              </button>
            )}
            <span className="text-xs text-slate-600 flex-shrink-0">{r.kind === 'contact' ? '☎' : '💼'}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

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

// ─── Daily Production ─────────────────────────────────────────────────────────
function DailyProduction({ today, increment, decrement, setValue, todayLabel, completedTodayCount, callbacksCreatedToday }) {
  return (
    <SectionCard
      title="Daily Production"
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
        <div className="flex gap-2 pt-1">
          <div className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-black text-emerald-400 leading-none">{completedTodayCount}</p>
            <p className="text-xs text-slate-500 mt-1">Tasks Completed</p>
          </div>
          <div className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-black text-purple-400 leading-none">{callbacksCreatedToday}</p>
            <p className="text-xs text-slate-500 mt-1">Callbacks Created</p>
          </div>
        </div>
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
  const today = todayStr();
  const upcoming = [...meetings]
    .filter(m => m.date >= today)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 5);
  const todayCount = meetings.filter(m => m.date === today).length;

  return (
    <SectionCard
      title="Meetings"
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
          <p className="text-xs">No upcoming meetings</p>
          <button onClick={onNavigate}
            className="text-amber-500 hover:text-amber-400 text-xs font-semibold transition-colors">
            Schedule one
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(m => {
            const client = clients.find(c => c.id === m.clientId);
            const isToday = m.date === today;
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
            View full calendar
          </button>
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
  const [editingTask, setEditingTask] = useState(null);

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
            <TaskRow key={t.id} task={t} onComplete={completeTask} onDelete={deleteTask} onEdit={setEditingTask} />
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
        <EmptyState icon="✅" message="Nothing open. You're caught up." />
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

      {editingTask && (
        <TaskModal
          context={{
            relatedType: editingTask.relatedType,
            relatedId: editingTask.relatedId,
            relatedName: editingTask.relatedName,
            source: editingTask.source,
          }}
          defaults={{
            title: editingTask.title,
            taskType: editingTask.taskType,
            priority: editingTask.priority,
            dueDate: editingTask.dueDate ?? undefined,
            description: editingTask.description,
          }}
          heading="Edit Task"
          saveLabel="Save Changes"
          onSave={(fields) => taskApi.updateTask(editingTask.id, fields)}
          onClose={() => setEditingTask(null)}
        />
      )}
    </SectionCard>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({
  clients, contacts = [], meetings = [], onNavigateCalendar,
  onStartCallMode, onOpenCallQueue, onOpenDatabaseFilter, onOpenContact, onEditClient, onLogClientAction, onDeleteClientAction, onMoveToMasterDB, masterListId, review, taskApi,
}) {
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
  const [showReporting, setShowReporting] = useState(false);

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

  const attackRows = useMemo(() => buildAttackList(taskApi, contacts, clients), [taskApi, contacts, clients]);
  const followUpRows = useMemo(() => buildNeedsFollowUp(taskApi, contacts, clients, masterListId), [taskApi, contacts, clients, masterListId]);
  const attentionRows = useMemo(() => buildPipelineAttention(taskApi, clients, meetings), [taskApi, clients, meetings]);

  const overdueCount = taskApi?.groups?.overdue?.length ?? 0;
  const dueTodayCount = taskApi?.groups?.dueToday?.length ?? 0;
  const bovsDueCount = useMemo(() => {
    const { overdue = [], dueToday = [] } = taskApi?.groups ?? {};
    return [...overdue, ...dueToday].filter(t => t.taskType === 'bov').length;
  }, [taskApi]);
  const meetingsToday = meetings.filter(m => m.date === todayStr()).length;
  // Callback counts (Sprint 7) — identical logic to Call Mode's Today's /
  // Overdue Callbacks queues (open call tasks on contacts, deduped), via the
  // shared builder in tasks/taskUtils.js.
  const todayCallbacks = useMemo(() =>
    buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: false }).length, [contacts, taskApi]);
  const overdueCallbacks = useMemo(() =>
    buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: true }).length, [contacts, taskApi]);
  // Sprint 17 — Dashboard "Upcoming" is bounded to the next 30 days so a
  // callback parked months out doesn't inflate today's attention numbers.
  // The Database queue this card routes into uses the same 30-day window.
  const upcomingCallbacks = useMemo(() =>
    buildCallbackTaskQueue(contacts, taskApi?.tasks, { upcoming: true, windowDays: 30 }).length, [contacts, taskApi]);
  const completedTodayCount = taskApi?.groups?.completedToday?.length ?? 0;
  const appointmentFollowUps = followUpRows.filter(r => r.kind === 'contact' && r.contact?.status === 'appointment').length
    + (taskApi?.tasks ?? []).filter(t => t.status === 'open' && (t.taskType === 'bov' || t.taskType === 'meeting')).length;
  const callbacksCreatedToday = useMemo(() => {
    const today = todayStr();
    return (taskApi?.tasks ?? []).filter(t =>
      t.taskType === 'call' && t.source === 'database' && (t.createdAt ?? '').slice(0, 10) === today
    ).length;
  }, [taskApi]);

  return (
    <div className="space-y-4">

      {/* ── Today Command Header ── */}
      <CommandHeader
        today={today}
        overdueCount={overdueCount}
        dueTodayCount={dueTodayCount}
        bovsDueCount={bovsDueCount}
        meetingsToday={meetingsToday}
        todayCallbacks={todayCallbacks}
        overdueCallbacks={overdueCallbacks}
        onStartCallMode={onStartCallMode}
      />

      <CallbackCommandCenter
        todayCallbacks={todayCallbacks}
        overdueCallbacks={overdueCallbacks}
        upcomingCallbacks={upcomingCallbacks}
        followUpCount={followUpRows.length}
        appointmentFollowUps={appointmentFollowUps}
        onOpenQueue={onOpenCallQueue}
        onOpenDatabaseFilter={onOpenDatabaseFilter}
      />

      {/* ── Attack List + Pipeline Attention ── */}
      {attackRows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AttackList
              rows={attackRows}
              onCallContact={onOpenContact}
              onEditClient={onEditClient}
              onOpenDatabase={onStartCallMode}
            />
          </div>
          <div className="space-y-4">
            <PipelineAttentionActions rows={attentionRows} onEditClient={onEditClient} onLogClientAction={onLogClientAction} onDeleteClientAction={onDeleteClientAction} taskApi={taskApi} />
            <NeedsFollowUp rows={followUpRows} onCallContact={onOpenContact} onEditClient={onEditClient} onMoveToMasterDB={onMoveToMasterDB} />
          </div>
        </div>
      ) : followUpRows.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PipelineAttentionActions rows={attentionRows} onEditClient={onEditClient} onLogClientAction={onLogClientAction} onDeleteClientAction={onDeleteClientAction} taskApi={taskApi} />
          <NeedsFollowUp rows={followUpRows} onCallContact={onOpenContact} onEditClient={onEditClient} onMoveToMasterDB={onMoveToMasterDB} />
        </div>
      ) : (
        <PipelineAttentionActions rows={attentionRows} onEditClient={onEditClient} onLogClientAction={onLogClientAction} onDeleteClientAction={onDeleteClientAction} taskApi={taskApi} />
      )}

      {/* ── Main Body: Daily work + lighter sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Tasks + Meetings + Review */}
        <div className="lg:col-span-2 space-y-4">
          <DashboardTasks taskApi={taskApi} />
          <UpcomingMeetingsWidget
            meetings={meetings}
            clients={clients}
            onNavigate={onNavigateCalendar}
          />
        </div>

        {/* Right: Review + Recent Activity */}
        <div className="space-y-4">
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
        </div>

      </div>

      <div className="border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-black text-white">Performance</h2>
            <p className="text-xs text-slate-500">Pipeline and production reporting</p>
          </div>
          <button
            onClick={() => setShowReporting(v => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-amber-400 transition-colors"
          >
            {showReporting ? 'Hide' : 'Show'}
          </button>
        </div>
        {showReporting ? (
          <div className="space-y-4">
            <MetricCardGrid metrics={kpiStats} />
            <PipelineContinuum
              stageCounts={stageCounts}
              totalUnits={totalUnits}
              totalSqft={totalSqft}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailyProduction
                today={today}
                increment={increment}
                decrement={decrement}
                setValue={setValue}
                todayLabel={todayLabel}
                completedTodayCount={completedTodayCount}
                callbacksCreatedToday={callbacksCreatedToday}
              />
              <ProductivityAnalytics
                analyticsRange={analyticsRange}
                setAnalyticsRange={setAnalyticsRange}
                analyticsData={analyticsData}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
              />
            </div>
            <FunnelChart clients={clients} filter="All" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-white">{clients.length}</p>
              <p className="text-xs text-slate-500">clients</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-green-400">{active}</p>
              <p className="text-xs text-slate-500">active deals</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-emerald-400">{completedTodayCount}</p>
              <p className="text-xs text-slate-500">tasks done today</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-purple-400">{callbacksCreatedToday}</p>
              <p className="text-xs text-slate-500">callbacks created</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
