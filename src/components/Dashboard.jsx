import { useEffect, useState, useMemo } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import FunnelChart from './FunnelChart';
import RecentActivity from './RecentActivity';
import NeedsReview from './NeedsReview';
import ActionCenterModal from './ActionCenterModal';
import { useDailyProgress, PROGRESS_FIELDS } from '../hooks/useDailyProgress';
import { buildCommissionSummary, formatMoney } from '../lib/dealValue';
import { normalizeDisplayText, normalizeMeetingText } from '../lib/textNormalize';
import { SectionCard, MetricCardGrid, LoadingSkeleton, EmptyState, ModalLayout } from './ui';
import { TaskRow, TaskModal, getNextOpenTask, buildCallbackTaskQueue } from './tasks';

const todayStr = () => new Date().toISOString().slice(0, 10);

// â”€â”€â”€ Attack List / Needs Follow-Up / Pipeline Attention builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// These read the universal tasks table plus Database contacts and Clients â€”
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
    // list - a lukewarm lead sitting there with an old conversation logged
    // isn't something Brandon needs nagged about on the Dashboard.
    if (masterListId && c.listId === masterListId) return;
    if (c.status !== 'conversation' && c.status !== 'appointment') return;
    if (taskApi.getRelatedTasks('contact', c.id).length > 0) return;
    rows.push({
      key: `nf-contact-${c.id}`, kind: 'contact',
      name: c.ownerName || 'Unknown Owner', facilityName: c.facilityName || '',
      reason: c.status === 'appointment' ? 'Appt set - no follow-up task' : 'Conversation logged - no follow-up task',
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
      reason: 'Active pipeline stage - no next action',
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

// â”€â”€â”€ Today Command Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CommandHeader({ today, overdueCount, dueTodayCount, bovsDueCount, todayCallbacks, overdueCallbacks, onStartCallMode }) {
  const dateLabel = new Date().toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
  const stats = [
    { label: 'Due Today', value: dueTodayCount, accent: dueTodayCount > 0 ? 'text-amber-300' : 'text-slate-500' },
    { label: 'Overdue', value: overdueCount, accent: overdueCount > 0 ? 'text-red-300' : 'text-slate-500' },
    { label: 'Callbacks', value: todayCallbacks, accent: todayCallbacks > 0 ? 'text-cyan-300' : 'text-slate-500' },
    { label: 'Overdue CB', value: overdueCallbacks, accent: overdueCallbacks > 0 ? 'text-red-300' : 'text-slate-500' },
    { label: 'Calls', value: today.calls, accent: today.calls > 0 ? 'text-blue-300' : 'text-slate-500' },
    { label: 'Convos', value: today.conversations, accent: today.conversations > 0 ? 'text-emerald-300' : 'text-slate-500' },
    { label: 'BOVs Due', value: bovsDueCount, accent: bovsDueCount > 0 ? 'text-purple-300' : 'text-slate-500' },
    { label: 'DB Adds', value: today.additionsToDatabase, accent: today.additionsToDatabase > 0 ? 'text-emerald-300' : 'text-slate-500' },
  ];

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Dashboard</p>
          <h2 className="text-lg font-black text-white leading-tight">Today · {dateLabel}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onStartCallMode('today')}
            disabled={todayCallbacks === 0}
            className={`h-9 rounded-lg border px-3 text-xs font-bold transition-all ${
              todayCallbacks > 0 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/15' : 'bg-slate-900 border-slate-800 text-slate-600'
            }`}
          >
            {todayCallbacks} callbacks
          </button>
          <button
            onClick={() => onStartCallMode('overdue')}
            disabled={overdueCallbacks === 0}
            className={`h-9 rounded-lg border px-3 text-xs font-bold transition-all ${
              overdueCallbacks > 0 ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/15' : 'bg-slate-900 border-slate-800 text-slate-600'
            }`}
          >
            {overdueCallbacks} overdue
          </button>
          <button
            onClick={onStartCallMode}
            className="h-9 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 rounded-lg text-xs transition-all"
          >
            Start Call Session
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-950/70 px-3 py-2">
            <p className={`text-xl font-black leading-none tabular-nums ${s.accent}`}>{s.value}</p>
            <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function AttackList({ rows, onCallContact, onEditClient, onOpenDatabase }) {
  const actionButton = 'h-9 min-w-[68px] inline-flex items-center justify-center rounded-lg border px-3 text-xs font-bold transition-all';

  return (
    <SectionCard
      title="Today's Attack List"
      subtitle="Who to contact next, ranked overdue to due today"
      actions={
        <button
          onClick={onOpenDatabase}
          className={`${actionButton} border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25`}
        >
          Call Mode
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon="??" message="Nothing overdue or due today. You're caught up." />
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
                    className={`${actionButton} border-green-600/40 bg-green-600/20 text-green-400 hover:bg-green-600/30`}>
                    Call
                  </a>
                )}
                {r.kind === 'contact' && r.contact && (
                  <button onClick={() => onCallContact(r.contact)}
                    className={`${actionButton} border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25`}>
                    Open
                  </button>
                )}
                {r.kind === 'client' && r.client && (
                  <button onClick={() => onEditClient(r.client)}
                    className={`${actionButton} border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25`}>
                    Open
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

// â”€â”€â”€ Pipeline Attention â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [actionClient, setActionClient] = useState(null);

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
                <button onClick={() => setActionClient(r.client)} className="text-xs font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 px-2 py-1 rounded-lg">
                  Log / Task
                </button>
              </div>
            );
          })}
        </div>
      )}

      {actionClient && (
        <ActionCenterModal
          name={actionClient.name}
          subtitle={actionClient.facilityName}
          actionLog={actionClient.actionLog}
          onLogAction={(entry) => onLogClientAction?.(actionClient.id, entry)}
          onDeleteAction={onDeleteClientAction ? (index) => {
            onDeleteClientAction(actionClient.id, index);
            setActionClient(prev => prev ? { ...prev, actionLog: (prev.actionLog ?? []).filter((_, idx) => idx !== index) } : prev);
          } : undefined}
          taskContext={{ relatedType: 'client', relatedId: actionClient.id, relatedName: actionClient.name, source: 'dashboard' }}
          onSaveTask={taskApi?.createTask}
          onClose={() => setActionClient(null)}
        />
      )}
    </SectionCard>
  );
}

// â”€â”€â”€ Needs Follow-Up (V1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                title="Not actionable right now - park this lead in the Master Database and stop nudging me about it"
                className="flex-shrink-0 text-xs font-semibold text-slate-500 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 rounded-lg px-2 py-1 transition-all"
              >
                Move to Master DB
              </button>
            )}
            <span className="text-xs text-slate-600 flex-shrink-0">{r.kind === 'contact' ? 'Call' : 'Deal'}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BrokerCommandCenter({
  attackRows,
  followUpRows,
  attentionRows,
  today,
  weeklyProduction,
  active,
  inContract,
  closed,
  todayCallbacks,
  overdueCallbacks,
  overdueCount,
  dueTodayCount,
  completedTodayCount,
  callbacksCreatedToday,
  onCallContact,
  onEditClient,
  onStartCallMode,
  onMoveToMasterDB,
  onLogClientAction,
  onDeleteClientAction,
  taskApi,
}) {
  const [actionClient, setActionClient] = useState(null);
  const rankedMoves = [
    ...attackRows.map(r => ({
      key: r.key,
      rank: r.overdue ? 0 : 1,
      tone: r.overdue ? 'red' : 'amber',
      label: r.overdue ? 'Overdue' : 'Due Today',
      title: r.name,
      subtitle: r.facilityName,
      detail: r.reason,
      phone: r.kind === 'contact' ? r.phone : '',
      onOpen: () => r.kind === 'contact' ? onCallContact(r.contact) : onEditClient(r.client),
    })),
    ...followUpRows.map(r => ({
      key: r.key,
      rank: r.kind === 'contact' ? 2 : 3,
      tone: r.kind === 'contact' ? 'emerald' : 'slate',
      label: r.kind === 'contact' ? 'Follow-up' : 'Pipeline',
      title: r.name,
      subtitle: r.facilityName,
      detail: r.reason,
      onOpen: () => r.kind === 'contact' ? onCallContact(r.contact) : onEditClient(r.client),
      onPark: r.kind === 'contact' && onMoveToMasterDB ? () => onMoveToMasterDB(r.contact) : null,
    })),
    ...attentionRows.map(r => {
      const stage = PIPELINE_STAGES.find(s => s.id === r.client.stageId);
      const meetingText = r.meeting ? `Meeting ${r.meeting.date === todayStr() ? 'today' : r.meeting.date}` : '';
      const rank = r.reason === 'Overdue task' ? 0 : r.reason === 'Task due today' ? 1 : r.reason === 'No next action' ? 3 : 4;
      return {
        key: r.key,
        rank,
        tone: r.reason === 'Overdue task' ? 'red' : r.reason === 'Task due today' ? 'amber' : 'slate',
        label: stage?.short ?? 'Deal',
        title: r.client.name,
        subtitle: r.client.facilityName,
        detail: [r.reason, meetingText].filter(Boolean).join(' · '),
        phone: r.client.phone,
        onOpen: () => onEditClient(r.client),
        onLog: () => setActionClient(r.client),
      };
    }),
  ].sort((a, b) => a.rank - b.rank).slice(0, 8);

  const topMoves = rankedMoves.slice(0, 3);
  const signalRows = rankedMoves.slice(3, 8);
  const briefItems = [
    { label: 'Calls', value: today.calls, tone: 'text-blue-300' },
    { label: 'Convos', value: today.conversations, tone: 'text-emerald-300' },
    { label: 'Owners ID', value: today.ownersIdentified, tone: 'text-cyan-300' },
    { label: 'DB Adds', value: today.additionsToDatabase, tone: 'text-amber-300' },
  ];
  const weekItems = [
    { label: 'Week calls', value: weeklyProduction.calls, tone: 'text-blue-300' },
    { label: 'Week convos', value: weeklyProduction.conversations, tone: 'text-emerald-300' },
    { label: 'Tasks done', value: completedTodayCount, tone: 'text-purple-300' },
    { label: 'Callbacks made', value: callbacksCreatedToday, tone: 'text-cyan-300' },
  ];
  const alertItems = [
    { label: 'Overdue tasks', value: overdueCount, tone: overdueCount > 0 ? 'text-red-300' : 'text-slate-600' },
    { label: 'Due today', value: dueTodayCount, tone: dueTodayCount > 0 ? 'text-amber-300' : 'text-slate-600' },
    { label: 'Callbacks', value: todayCallbacks, tone: todayCallbacks > 0 ? 'text-cyan-300' : 'text-slate-600' },
    { label: 'Overdue CB', value: overdueCallbacks, tone: overdueCallbacks > 0 ? 'text-red-300' : 'text-slate-600' },
  ];
  const pipelineItems = [
    { label: 'Active deals', value: active, tone: active > 0 ? 'text-emerald-300' : 'text-slate-700' },
    { label: 'In contract', value: inContract, tone: inContract > 0 ? 'text-orange-300' : 'text-slate-700' },
    { label: 'Closed', value: closed, tone: closed > 0 ? 'text-purple-300' : 'text-slate-700' },
    { label: 'Needs attention', value: attentionRows.length, tone: attentionRows.length > 0 ? 'text-amber-300' : 'text-slate-700' },
  ];

  const toneClass = {
    red: 'text-red-300 border-red-500/30 bg-red-500/10',
    amber: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    slate: 'text-slate-400 border-slate-700 bg-slate-900',
  };

  return (
    <SectionCard
      title="Broker Command Center"
      subtitle="Today, next actions, and relationship signals"
      className="p-4"
      actions={
        <button onClick={onStartCallMode} className="h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold text-amber-300 hover:bg-amber-500/15">
          Call Mode
        </button>
      }
    >
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Today's Brief</p>
                  <p className="text-sm font-bold text-white mt-1">Production pulse</p>
                </div>
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-400">Live</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
                {briefItems.map(item => (
                  <div key={item.label} className="bg-slate-950/70 px-3 py-2 min-w-0">
                    <p className={`text-2xl font-black leading-none tabular-nums ${item.value > 0 ? item.tone : 'text-slate-700'}`}>{item.value}</p>
                    <p className="text-[11px] font-semibold text-slate-500 mt-1 truncate">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {weekItems.map(item => (
                  <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 min-w-0">
                    <p className={`text-lg font-black leading-none tabular-nums ${item.value > 0 ? item.tone : 'text-slate-700'}`}>{item.value}</p>
                    <p className="text-[11px] text-slate-600 mt-1 truncate">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Pipeline Attention</p>
                  <p className="text-sm font-bold text-white mt-1">Deal movement without the dollar figures</p>
                </div>
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-400">Discreet</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
                {pipelineItems.map(item => (
                  <div key={item.label} className="bg-slate-950/70 px-3 py-2 min-w-0">
                    <p className={`text-2xl font-black leading-none tabular-nums ${item.tone}`}>{item.value}</p>
                    <p className="text-[11px] font-semibold text-slate-500 mt-1 truncate">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Current focus</p>
                <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                  {attentionRows[0]?.reason ? `${attentionRows[0].reason}: ${attentionRows[0].client?.name ?? 'Open pipeline item'}` : 'No urgent pipeline gaps showing right now.'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Top Moves</p>
                <p className="text-sm font-bold text-white">The next three things worth doing</p>
              </div>
              <span className="text-[11px] font-bold text-slate-600">{rankedMoves.length} signals</span>
            </div>
            {topMoves.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-5 text-center">No urgent work queued. Use Call Mode to create fresh momentum.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                {topMoves.map((r, idx) => (
                  <div key={r.key} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] font-black text-slate-600">0{idx + 1}</span>
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${toneClass[r.tone]}`}>{r.label}</span>
                    </div>
                    <button onClick={r.onOpen} className="w-full text-left min-w-0">
                      <p className="text-sm font-black text-white truncate">{r.title}</p>
                      {r.subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{r.subtitle}</p>}
                      <p className="text-xs text-slate-400 line-clamp-2 mt-2 min-h-[2rem]">{r.detail || 'Open and decide the next action.'}</p>
                    </button>
                    <div className="mt-3 flex items-center gap-1.5">
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="h-8 inline-flex items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15">
                          Call
                        </a>
                      )}
                      <button onClick={r.onOpen} className="h-8 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/15">
                        Open
                      </button>
                      {r.onLog && (
                        <button onClick={r.onLog} className="h-8 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-400 hover:text-slate-200">
                          Log
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Relationship Signals</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {alertItems.map(item => (
                <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <p className={`text-2xl font-black leading-none tabular-nums ${item.tone}`}>{item.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onStartCallMode?.('today')} className="h-8 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/15">
                Work callbacks
              </button>
              <button onClick={onStartCallMode} className="h-8 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/15">
                Start calls
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Watchlist</p>
              <p className="text-[11px] font-bold text-slate-600">Next 5</p>
            </div>
            {signalRows.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-4 text-center">No secondary signals right now.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                {signalRows.map(r => (
                  <div key={r.key} className="flex items-center gap-3 bg-slate-950/40 hover:bg-slate-900 px-3 py-2.5">
                    <span className={`w-20 flex-shrink-0 rounded-md border px-2 py-1 text-[10px] font-black text-center ${toneClass[r.tone]}`}>
                      {r.label}
                    </span>
                    <button onClick={r.onOpen} className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-white truncate">{r.title}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{r.detail}</p>
                    </button>
                    {r.onPark && (
                      <button onClick={r.onPark} className="h-8 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-500 hover:text-emerald-300">
                        Park
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {actionClient && (
        <ActionCenterModal
          name={actionClient.name}
          subtitle={actionClient.facilityName}
          actionLog={actionClient.actionLog}
          onLogAction={(entry) => onLogClientAction?.(actionClient.id, entry)}
          onDeleteAction={onDeleteClientAction ? (index) => {
            onDeleteClientAction(actionClient.id, index);
            setActionClient(prev => prev ? { ...prev, actionLog: (prev.actionLog ?? []).filter((_, idx) => idx !== index) } : prev);
          } : undefined}
          taskContext={{ relatedType: 'client', relatedId: actionClient.id, relatedName: actionClient.name, source: 'dashboard' }}
          onSaveTask={taskApi?.createTask}
          onClose={() => setActionClient(null)}
        />
      )}
    </SectionCard>
  );
}

// â”€â”€â”€ Pipeline Continuum Snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              {s.count > 0 ? s.count : '-'}
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
              <span className="text-slate-700 text-xs mx-0.5">&gt;</span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// â”€â”€â”€ Weekly Production Scorecard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WeeklyProductionScorecard({ data, completedTodayCount, callbacksCreatedToday }) {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekLabel = `${monday.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - Today`;
  const fields = [
    ['calls', 'Calls'],
    ['conversations', 'Conversations'],
    ['voicemails', 'Voicemails'],
    ['ownersIdentified', 'Owners Identified'],
    ['additionsToDatabase', 'Database Adds'],
    ['bovProposals', 'BOVs Sent'],
    ['uniqueOwnersWorked', 'Owners Worked'],
    ['totalOwnerActions', 'Actions Logged'],
  ];
  const systemStats = [
    ['Tasks Completed', completedTodayCount],
    ['Callbacks Created', callbacksCreatedToday],
  ];

  return (
    <SectionCard
      title="Weekly Production"
      subtitle={weekLabel}
      className="p-3"
      bodyClassName="grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-10 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800"
    >
      {fields.map(([key, label]) => (
        <div key={key} className="bg-slate-950/60 px-3 py-2 min-w-0">
          <p className="text-lg font-black leading-none tabular-nums text-slate-100">{data[key] ?? 0}</p>
          <p className="text-[10px] font-semibold text-slate-500 mt-1 truncate">{label}</p>
        </div>
      ))}
      {systemStats.map(([label, value]) => (
        <div key={label} className="bg-slate-950/60 px-3 py-2 min-w-0">
          <p className="text-lg font-black leading-none tabular-nums text-slate-100">{value ?? 0}</p>
          <p className="text-[10px] font-semibold text-slate-500 mt-1 truncate">{label}</p>
        </div>
      ))}
    </SectionCard>
  );
}

function CommissionCounter({ summary, migrationNeeded, active, inContract, closed }) {
  const gross = summary.grossPipelineCommission;
  const saleValue = summary.pipelineSaleValue;
  const avgRate = saleValue > 0 ? (gross / saleValue) * 100 : 0;
  const onMarketGross = summary.grossOnMarketCommission;
  const onMarketSaleValue = summary.onMarketSaleValue;
  const onMarketAvgRate = onMarketSaleValue > 0 ? (onMarketGross / onMarketSaleValue) * 100 : 0;
  const metrics = [
    { label: 'Active Deals', value: active, tone: 'text-emerald-300' },
    { label: 'In Contract', value: inContract, tone: 'text-orange-300' },
    { label: 'Closed', value: closed, tone: 'text-purple-300' },
    { label: 'Missing Fees', value: summary.missingCommissionDeals, tone: summary.missingCommissionDeals > 0 ? 'text-amber-300' : 'text-slate-500' },
  ];

  return (
    <SectionCard
      title="Pipeline Value"
      subtitle="Projected gross commission"
      className="p-4 border-emerald-500/20 bg-emerald-950/5"
      actions={<span className="text-[11px] font-bold text-slate-500">{summary.pricedPipelineDeals} priced</span>}
    >
      {migrationNeeded && (
        <p className="mb-3 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          Run <code>sql/client_deal_value_migration.sql</code> in Supabase, then refresh.
        </p>
      )}
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
        <p className="text-[11px] font-bold text-emerald-200/80 uppercase tracking-wide">Gross Pipeline Commission</p>
        <p className="text-4xl font-black text-emerald-300 mt-1 leading-none">{formatMoney(gross) || '$0'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-500 font-semibold">Pipeline Sale Value</p>
            <p className="text-white font-black">{formatMoney(saleValue, { compact: true }) || '$0'}</p>
          </div>
          <div>
            <p className="text-slate-500 font-semibold">Blended Fee</p>
            <p className="text-white font-black">{avgRate > 0 ? `${avgRate.toFixed(2)}%` : '--'}</p>
          </div>
        </div>
      </div>
      <div className="mt-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-sky-200/80 uppercase tracking-wide">On-Market Potential Gross Commission</p>
            <p className="text-2xl font-black text-sky-300 mt-1 leading-none">{formatMoney(onMarketGross) || '$0'}</p>
          </div>
          <span className="text-[11px] font-bold text-sky-200/70 whitespace-nowrap">
            {summary.pricedOnMarketDeals} priced
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-500 font-semibold">On-Market Sale Value</p>
            <p className="text-white font-black">{formatMoney(onMarketSaleValue, { compact: true }) || '$0'}</p>
          </div>
          <div>
            <p className="text-slate-500 font-semibold">Blended Fee</p>
            <p className="text-white font-black">{onMarketAvgRate > 0 ? `${onMarketAvgRate.toFixed(2)}%` : '--'}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Exclusive Listing and later</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
        {metrics.map(m => (
          <div key={m.label} className="bg-slate-950/60 px-3 py-2">
            <p className={`text-xl font-black leading-none ${m.tone}`}>{m.value}</p>
            <p className="text-[11px] text-slate-500 font-semibold mt-1">{m.label}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function QuickCallLogger({ onLog }) {
  const [draft, setDraft] = useState({
    calls: '',
    voicemails: '',
    conversations: '',
    ownersIdentified: '',
    additionsToDatabase: '',
    bovProposals: '',
    uniqueOwnersWorked: '',
    totalOwnerActions: '',
  });

  const fields = [
    ['calls', 'Calls'],
    ['conversations', 'Conversations'],
    ['voicemails', 'Voicemails'],
    ['additionsToDatabase', 'DB Adds'],
    ['ownersIdentified', 'Owners ID'],
    ['bovProposals', 'BOVs Sent'],
    ['uniqueOwnersWorked', 'Owners Worked'],
    ['totalOwnerActions', 'Actions'],
  ];
  const hasValue = Object.values(draft).some(v => Number(v) > 0);
  const inputClass = 'w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-sm font-black text-slate-100 tabular-nums focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  function setField(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  function logNow() {
    if (!hasValue) return;
    onLog(Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, Math.max(0, Math.floor(Number(value) || 0))])
    ));
    setDraft({
      calls: '',
      voicemails: '',
      conversations: '',
      ownersIdentified: '',
      additionsToDatabase: '',
      bovProposals: '',
      uniqueOwnersWorked: '',
      totalOwnerActions: '',
    });
  }

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-black text-white uppercase tracking-wide">Manual Activity Logger</p>
          <p className="text-[11px] text-slate-600">Batch-add today's work to the daily and weekly log</p>
        </div>
        <button
          type="button"
          onClick={logNow}
          disabled={!hasValue}
          className="h-8 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black rounded-lg px-3 text-xs transition-all"
        >
          Add Batch
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {fields.map(([key, label]) => (
          <label key={key} className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>
            <input
              type="number"
              min="0"
              value={draft[key]}
              onChange={e => setField(key, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') logNow(); }}
              placeholder="0"
              className={inputClass}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ManualActivityModal({ onLog, onClose }) {
  return (
    <ModalLayout onClose={onClose} size="lg">
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h2 className="text-base font-black text-white">Manual Activity Logger</h2>
          <p className="text-xs text-slate-500 mt-0.5">Record work that happened outside Call Mode.</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">x</button>
      </div>
      <div className="p-5">
        <QuickCallLogger
          onLog={(values) => {
            onLog(values);
            onClose();
          }}
        />
      </div>
    </ModalLayout>
  );
}

function DailyProduction({ today, increment, decrement, addValues, setValue, todayLabel, completedTodayCount, callbacksCreatedToday, migrationNeeded }) {
  const [showLogger, setShowLogger] = useState(false);
  const fields = [
    ['calls', 'Calls'],
    ['conversations', 'Conversations'],
    ['voicemails', 'Voicemails'],
    ['additionsToDatabase', 'DB Adds'],
    ['ownersIdentified', 'Owners ID'],
    ['bovProposals', 'BOVs'],
    ['uniqueOwnersWorked', 'Owners Worked'],
    ['totalOwnerActions', 'Actions'],
  ];

  return (
    <SectionCard
      title="Daily Activity"
      subtitle={`${todayLabel} · autosaved`}
      className="p-4"
      actions={
        <button
          onClick={() => setShowLogger(true)}
          className="h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-black text-amber-300 hover:bg-amber-500/15 transition-all"
        >
          Manual Activity Logger
        </button>
      }
    >
      <div className="space-y-3">
        {migrationNeeded && (
          <p className="text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
            Run <code>sql/daily_progress_scorecard_migration.sql</code> in Supabase, then refresh to save all scorecard fields.
          </p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
          <p className="text-xs text-slate-500">What work have I completed today?</p>
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-300">Saved</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
          {fields.map(([key, label]) => {
            const f = PROGRESS_FIELDS.find(item => item.key === key);
            return (
            <div key={key} className="bg-slate-950/60 px-4 py-3">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 leading-tight">{label}</span>
              <div className="mt-2 flex items-center justify-between gap-3">
                <input
                  type="number"
                  min="0"
                  value={today[key] ?? 0}
                  onChange={e => setValue(key, e.target.value)}
                  onFocus={e => e.target.select()}
                  className={`min-w-0 flex-1 bg-transparent text-3xl font-black leading-none tabular-nums ${f?.accent ?? 'text-slate-100'} focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  title={`Enter today's ${label}`}
                />
                <div className="flex items-center gap-1.5">
                  <button onClick={() => decrement(key)} title={`Subtract one ${label}`} className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-600 hover:text-red-300 hover:border-red-500/30 text-xs font-black transition-all">-</button>
                  <button onClick={() => increment(key)} title={`Add one ${label}`} className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-emerald-300 hover:border-emerald-500/30 text-xs font-black transition-all">+</button>
                </div>
              </div>
            </div>
          )})}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2">
            <p className="text-lg font-black text-emerald-300 leading-none">{completedTodayCount}</p>
            <p className="text-[11px] text-slate-600 mt-1">Tasks completed</p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2">
            <p className="text-lg font-black text-purple-300 leading-none">{callbacksCreatedToday}</p>
            <p className="text-[11px] text-slate-600 mt-1">Callbacks created</p>
          </div>
        </div>
        {showLogger && <ManualActivityModal onLog={addValues} onClose={() => setShowLogger(false)} />}
      </div>
    </SectionCard>
  );
}
function DailyActivityIntelligenceReview() {
  const [review, setReview] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadStatus() {
    try {
      const res = await fetch('/api/daily-activity?mode=status');
      const data = await res.json();
      if (data.review) {
        setReview(data.review);
        setCounts(data.review.approved_counts || data.review.summary || {});
      }
    } catch {
      setMessage('Activity review is available after deployment.');
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function generateDraft() {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/daily-activity?mode=draft');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate review');
      setReview({
        activity_date: data.activityDate,
        status: 'draft',
        summary: data.analysis.counts,
        important_items: data.analysis.importantItems,
        slipped_items: data.analysis.slippedItems,
      });
      setCounts(data.analysis.counts);
      setMessage('Draft generated.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!review?.activity_date) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/daily-activity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'approve', activityDate: review.activity_date, counts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not approve review');
      setReview(prev => ({ ...prev, status: 'approved', approved_counts: counts }));
      setMessage('Approved and merged into today\'s scorecard.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const status = review?.status || 'not generated';
  const important = review?.important_items ?? [];
  const slipped = review?.slipped_items ?? [];

  return (
    <SectionCard
      title="Activity Intelligence"
      subtitle={`Today · ${status.replace('_', ' ')}`}
      actions={
        <button
          onClick={generateDraft}
          disabled={loading}
          className="text-xs font-semibold text-slate-500 hover:text-amber-400 disabled:text-slate-700 transition-colors"
        >
          {loading ? 'Working...' : review ? 'Refresh Draft' : 'Generate'}
        </button>
      }
    >
      {!review ? (
        <div className="text-center py-4">
          <p className="text-xs text-slate-500 mb-3">No activity review has been generated for today yet.</p>
          <button
            onClick={generateDraft}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold rounded-lg px-4 py-2 text-sm"
          >
            Generate Today's Review
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {PROGRESS_FIELDS.map(field => (
              <label key={field.key} className={`${field.bg} border ${field.border} rounded-lg px-3 py-2`}>
                <span className={`block text-xs font-bold ${field.accent} mb-1`}>{field.shortLabel || field.label}</span>
                <input
                  type="number"
                  min="0"
                  value={counts[field.key] ?? 0}
                  onChange={e => setCounts(prev => ({ ...prev, [field.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  className={`w-full bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1 text-lg font-black tabular-nums ${field.accent} focus:outline-none focus:border-current`}
                />
              </label>
            ))}
          </div>

          {(important.length > 0 || slipped.length > 0) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {important.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                  <p className="text-xs font-black text-amber-400 uppercase mb-2">Important</p>
                  <div className="space-y-1">
                    {important.slice(0, 5).map((item, idx) => (
                      <p key={idx} className="text-xs text-slate-300 truncate">{item.label}: <span className="text-slate-500">{item.reason}</span></p>
                    ))}
                  </div>
                </div>
              )}
              {slipped.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                  <p className="text-xs font-black text-red-400 uppercase mb-2">May Have Slipped</p>
                  <div className="space-y-1">
                    {slipped.slice(0, 5).map((item, idx) => (
                      <p key={idx} className="text-xs text-slate-300 truncate">{item.email}: <span className="text-slate-500">{item.reason}</span></p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className={`text-xs ${message.includes('Could') ? 'text-red-400' : 'text-slate-500'}`}>{message}</p>
            <button
              onClick={approve}
              disabled={loading || status === 'approved' || status === 'auto_logged'}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold rounded-lg px-4 py-2 text-sm"
            >
              {status === 'approved' ? 'Approved' : status === 'auto_logged' ? 'Auto-logged' : 'Approve + Merge'}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ProductivityAnalytics({ analyticsRange, setAnalyticsRange, analyticsData, selectedMonth, setSelectedMonth }) {
  // Recomputed on every render so it's always accurate regardless of year
  const monthOptions = useMemo(() => {
    const year = new Date().getFullYear(); // always current year â€” auto-updates on Jan 1
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
          {/* Month picker - only shown when a specific month is selected */}
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
              v
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
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

// â”€â”€â”€ Upcoming Meetings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UpcomingMeetingsWidget({ meetings, clients, onNavigate }) {
  const today = todayStr();
  const upcoming = [...meetings]
    .filter(m => m.date >= today)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 5);
  const todayCount = meetings.filter(m => m.date === today).length;
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  function meetingDateLabel(date) {
    if (date === today) return 'Today';
    if (date === tomorrow) return 'Tomorrow';
    return new Date(`${date}T12:00:00`).toLocaleDateString('default', { month: 'short', day: 'numeric' });
  }

  function meetingTimeLabel(m) {
    if (m.allDay) return 'All day';
    if (m.startTime) return normalizeDisplayText(m.startTime);
    return '';
  }

  function meetingSecondaryLine(m, client) {
    const location = normalizeMeetingText(m.location);
    const organizer = normalizeDisplayText(m.organizer);
    const fallback = m.isOnline || /teams|zoom|meet/i.test(location) ? 'Microsoft Teams' : '';
    const secondary = [client?.name, location || fallback, organizer]
      .map(v => normalizeMeetingText(v))
      .filter(Boolean)
      .filter((v, idx, arr) => arr.findIndex(x => x.toLowerCase() === v.toLowerCase()) === idx)
      .filter(v => v.toLowerCase() !== normalizeMeetingText(m.title).toLowerCase())
      .slice(0, 2)
      .join(' · ');
    return secondary;
  }

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
            const dateLabel = meetingDateLabel(m.date);
            const title = normalizeMeetingText(m.title) || 'Untitled meeting';
            const timeLabel = meetingTimeLabel(m);
            const secondary = meetingSecondaryLine(m, client);
            const clickableClass = 'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/50 hover:border-slate-600 transition-all';
            const content = (
              <>
                <div className={`flex-shrink-0 rounded-lg px-2 py-1 min-w-[54px] text-center ${
                  isToday ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-slate-700/70 border border-slate-600/80'
                }`}>
                  <p className={`text-xs font-black leading-none ${isToday ? 'text-amber-300' : 'text-slate-300'}`}>{dateLabel}</p>
                  {timeLabel && <p className={`text-xs mt-0.5 ${isToday ? 'text-amber-300/70' : 'text-slate-500'}`}>{timeLabel}</p>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate" title={title}>{title}</p>
                  {secondary && <p className="text-xs text-slate-500 truncate mt-0.5" title={secondary}>{secondary}</p>}
                </div>
              </>
            );

            return m.outlookUrl ? (
              <a key={m.id} href={m.outlookUrl} target="_blank" rel="noopener noreferrer" className={clickableClass} title={title}>
                {content}
              </a>
            ) : (
              <button key={m.id} onClick={onNavigate} className={clickableClass} title={title}>
                {content}
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

// â”€â”€â”€ Universal Tasks (Sprint 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DashboardTasks({ taskApi }) {
  const [quickTitle, setQuickTitle] = useState('');
  const [showFullModal, setShowFullModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [filter, setFilter] = useState('open');

  if (!taskApi) return null;
  const { loading, migrationNeeded, groups, createTask, completeTask, deleteTask } = taskApi;
  const { overdue, dueToday, upcoming, noDueDate, completedToday } = groups;
  const totalOpen = overdue.length + dueToday.length + upcoming.length + noDueDate.length;
  const filters = [
    ['open', 'Open', totalOpen],
    ['overdue', 'Overdue', overdue.length],
    ['today', 'Today', dueToday.length],
    ['upcoming', 'Upcoming', upcoming.length],
    ['completed', 'Done', completedToday.length],
  ];

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle('');
    await createTask({ title, taskType: 'general', dueDate: new Date().toISOString().slice(0, 10), source: 'dashboard' });
  }

  function visibleGroups() {
    if (filter === 'overdue') return [['Overdue', overdue, 'text-red-400']];
    if (filter === 'today') return [['Due Today', dueToday, 'text-amber-400']];
    if (filter === 'upcoming') return [['Upcoming', upcoming, 'text-slate-400'], ['No Due Date', noDueDate, 'text-slate-500']];
    if (filter === 'completed') return [['Recently Completed', completedToday, 'text-emerald-400']];
    return [
      ['Overdue', overdue, 'text-red-400'],
      ['Due Today', dueToday, 'text-amber-400'],
      ['Upcoming', upcoming, 'text-slate-400'],
      ['No Due Date', noDueDate, 'text-slate-500'],
    ];
  }

  function group(label, items, tone, completed = false) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${tone}`}>{label} ({items.length})</p>
        <div className="space-y-1.5">
          {items.map(t => (
            completed
              ? <div key={t.id} className="text-xs text-slate-500 line-through px-3 py-1">{t.title}</div>
              : <TaskRow key={t.id} task={t} onComplete={completeTask} onDelete={deleteTask} onEdit={setEditingTask} />
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
          className="h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-black text-amber-300 hover:bg-amber-500/15 transition-all">
          Add Task
        </button>
      }
      bodyClassName="space-y-3"
    >
      {migrationNeeded && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
          Task table needs a one-time SQL migration - run <code>sql/tasks_table_migration.sql</code> in Supabase, then refresh.
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

      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-950/60 border border-slate-800 p-1">
        {filters.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
              filter === key ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label} <span className="text-slate-600">{count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : totalOpen === 0 && filter !== 'completed' ? (
        <EmptyState icon="Done" message="Nothing open. You're caught up." />
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {visibleGroups().map(([label, items, tone]) => group(label, items, tone, filter === 'completed'))}
        </div>
      )}

      {filter !== 'completed' && completedToday.length > 0 && (
        <div>
          <button onClick={() => setShowCompleted(v => !v)}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors font-semibold">
            {showCompleted ? 'v' : '>'} Completed today ({completedToday.length})
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

// â”€â”€â”€ Main Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Dashboard({
  clients, contacts = [], meetings = [], onNavigateCalendar,
  onStartCallMode, onOpenContact, onEditClient, onLogClientAction, onDeleteClientAction, onMoveToMasterDB, masterListId, review, taskApi, dealValueMigrationNeeded,
}) {
  const buyers      = clients.filter(c => c.type === 'Buyer').length;
  const sellers     = clients.filter(c => c.type === 'Seller').length;
  const inContract  = clients.filter(c => c.stageId === 8).length;
  const closed      = clients.filter(c => c.stageId === 9 || c.stageId === 10).length;
  const active      = clients.filter(c => c.stageId >= 2 && c.stageId <= 9).length;
  const totalUnits  = clients.reduce((sum, c) => sum + (c.units ?? 0), 0);
  const totalSqft   = clients.reduce((sum, c) => sum + (c.sqft ?? 0), 0);
  const commissionSummary = useMemo(() => buildCommissionSummary(clients), [clients]);
  const stageCounts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: clients.filter(c => c.stageId === s.id).length,
  }));

  const { today, increment, decrement, addValues, setValue, getWeek, getMonth, getYear, getSpecificMonth, migrationNeeded } = useDailyProgress();
  const [analyticsRange, setAnalyticsRange] = useState('Week');
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [showReporting, setShowReporting] = useState(false);

  const analyticsData = analyticsRange === 'Week' ? getWeek()
    : analyticsRange === 'Month' ? getMonth()
    : analyticsRange === 'Year' ? getYear()
    : getSpecificMonth(selectedMonth);
  const weeklyProduction = getWeek();

  const todayLabel = new Date().toLocaleDateString('default', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const kpiStats = [
    { label: 'Total Clients', value: clients.length },
    { label: 'Buyers',        value: buyers,      accent: 'text-blue-400' },
    { label: 'Sellers',       value: sellers,     accent: 'text-amber-400' },
    { label: 'Active Deals',  value: active,      accent: 'text-green-400', sub: 'Stages 2-9' },
    { label: 'Gross Fees',    value: formatMoney(commissionSummary.grossPipelineCommission, { compact: true }) || '$0', accent: 'text-emerald-400', sub: 'Active pipeline' },
    { label: 'In Contract',   value: inContract,  accent: 'text-orange-400' },
    { label: 'Closed',        value: closed,      accent: 'text-purple-400', sub: 'Close + Post-Close' },
  ];

  const attackRows = useMemo(() => buildAttackList(taskApi, contacts, clients), [taskApi, contacts, clients]);
  const followUpRows = useMemo(() => buildNeedsFollowUp(taskApi, contacts, clients, masterListId), [taskApi, contacts, clients, masterListId]);
  const attentionRows = useMemo(() => buildPipelineAttention(taskApi, clients, meetings), [taskApi, clients, meetings]);

  const overdueCount = taskApi?.groups?.overdue?.length ?? 0;
  const dueTodayCount = taskApi?.groups?.dueToday?.length ?? 0;
  // Callback counts (Sprint 7) - identical logic to Call Mode's Today's /
  // Overdue Callbacks queues (open call tasks on contacts, deduped), via the
  // shared builder in tasks/taskUtils.js.
  const todayCallbacks = useMemo(() =>
    buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: false }).length, [contacts, taskApi]);
  const overdueCallbacks = useMemo(() =>
    buildCallbackTaskQueue(contacts, taskApi?.tasks, { overdue: true }).length, [contacts, taskApi]);
  // Sprint 17 - Dashboard "Upcoming" is bounded to the next 30 days so a
  // callback parked months out doesn't inflate today's attention numbers.
  // The Database queue this card routes into uses the same 30-day window.
  const completedTodayCount = taskApi?.groups?.completedToday?.length ?? 0;
  const callbacksCreatedToday = useMemo(() => {
    const today = todayStr();
    return (taskApi?.tasks ?? []).filter(t =>
      t.taskType === 'call' && t.source === 'database' && (t.createdAt ?? '').slice(0, 10) === today
    ).length;
  }, [taskApi]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <WeeklyProductionScorecard
        data={weeklyProduction}
        completedTodayCount={completedTodayCount}
        callbacksCreatedToday={callbacksCreatedToday}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.1fr)_minmax(320px,0.8fr)] gap-4 items-start">
        <DailyProduction
          today={today}
          increment={increment}
          decrement={decrement}
          addValues={addValues}
          setValue={setValue}
          todayLabel={todayLabel}
          completedTodayCount={completedTodayCount}
          callbacksCreatedToday={callbacksCreatedToday}
          migrationNeeded={migrationNeeded}
        />

        <DashboardTasks taskApi={taskApi} />

        <div className="space-y-4 min-w-0">
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
        </div>
      </div>

      <BrokerCommandCenter
        attackRows={attackRows}
        followUpRows={followUpRows}
        attentionRows={attentionRows}
        today={today}
        weeklyProduction={weeklyProduction}
        active={active}
        inContract={inContract}
        closed={closed}
        todayCallbacks={todayCallbacks}
        overdueCallbacks={overdueCallbacks}
        overdueCount={overdueCount}
        dueTodayCount={dueTodayCount}
        completedTodayCount={completedTodayCount}
        callbacksCreatedToday={callbacksCreatedToday}
        onCallContact={onOpenContact}
        onEditClient={onEditClient}
        onStartCallMode={onStartCallMode}
        onMoveToMasterDB={onMoveToMasterDB}
        onLogClientAction={onLogClientAction}
        onDeleteClientAction={onDeleteClientAction}
        taskApi={taskApi}
      />

      <DailyActivityIntelligenceReview />

      <div className="pt-4" data-dashboard-financial-section>
        <CommissionCounter
          summary={commissionSummary}
          migrationNeeded={dealValueMigrationNeeded}
          active={active}
          inContract={inContract}
          closed={closed}
        />
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
            <MetricCardGrid metrics={kpiStats} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-7" />
            <PipelineContinuum
              stageCounts={stageCounts}
              totalUnits={totalUnits}
              totalSqft={totalSqft}
            />
            <div className="grid grid-cols-1 gap-4">
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
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-white">{clients.length}</p>
              <p className="text-xs text-slate-500">clients</p>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-green-400">{active}</p>
              <p className="text-xs text-slate-500">active deals</p>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-emerald-400">{completedTodayCount}</p>
              <p className="text-xs text-slate-500">tasks done today</p>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xl font-black text-purple-400">{callbacksCreatedToday}</p>
              <p className="text-xs text-slate-500">callbacks created</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

