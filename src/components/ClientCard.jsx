import { useState } from 'react';
import { PIPELINE_STAGES, PROPERTY_TYPES, ACTION_TYPES, LEAD_TEMPS } from '../data/constants';
import { formatMoney, formatPercent, projectedCommissionAmount } from '../lib/dealValue';
import { LastActionLine } from './ActionLog';
import ActionCenterModal from './ActionCenterModal';
import { AddToMailerButton } from './MailerListPicker';
import OwnershipLinksPanel from './OwnershipLinksPanel';
import { StatusBadge } from './ui';
import { RelatedTasks, getNextOpenTask, dueMeta, TASK_TYPE_MAP } from './tasks';

export default function ClientCard({ client, onEdit, onDelete, onStageChange, onSetAction, onMoveToDatabase, onLogAction, onDeleteAction, compact = false, taskApi, ownershipApi, mailerApi }) {
  const stage = PIPELINE_STAGES.find(s => s.id === client.stageId) ?? PIPELINE_STAGES[0];
  const propType = PROPERTY_TYPES.find(p => p.value === client.propertyType);
  const [activityMode, setActivityMode] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const openTasks = taskApi?.getRelatedTasks('client', client.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const nextTaskType = nextTask ? TASK_TYPE_MAP[nextTask.taskType] : null;
  const nextTaskDue = dueMeta(nextTask?.dueDate);
  const actionType = ACTION_TYPES.find(a => a.value === client.nextActionType);
  const fallbackDue = dueMeta(client.nextActionDate);
  const projectedCommission = projectedCommissionAmount(client.desiredSalePrice, client.projectedCommissionPct);

  return (
    <>
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500 transition-all group">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge variant={client.type === 'Buyer' ? 'buyer' : 'seller'} className="font-bold">
              {client.type}
            </StatusBadge>
            {propType && (
              <StatusBadge variant="emerald">
                {propType.icon} {propType.label}
              </StatusBadge>
            )}
            {!compact && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${stage.text} border-current bg-slate-900/50`}>
                {stage.id}. {stage.short}
              </span>
            )}
            {(() => {
              const temp = LEAD_TEMPS.find(t => t.value === client.leadTemp);
              const order = ['', 'hot', 'warm', 'cold'];
              function cycleTemp() {
                const idx = order.indexOf(client.leadTemp ?? '');
                const next = order[(idx + 1) % order.length];
                onSetAction(client.id, { leadTemp: next });
              }
              return temp ? (
                <button onClick={cycleTemp} title="Click to change lead temperature"
                  className={`text-xs font-black px-2 py-0.5 rounded-full border transition-all ${temp.bg} ${temp.border} ${temp.text}`}>
                  {temp.icon} {temp.label}
                </button>
              ) : (
                <button onClick={cycleTemp} title="Set lead temperature"
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border border-dashed border-slate-600 text-slate-600 hover:text-slate-400 hover:border-slate-500 transition-all">
                  + Temp
                </button>
              );
            })()}
          </div>
          <h3 className="font-bold text-white text-sm mt-1 truncate">{client.name}</h3>
          {client.age && (
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Age {client.age}</p>
          )}
          {client.facilityName && (
            <p className="text-xs text-slate-400 truncate">{client.facilityName}</p>
          )}
          {(client.desiredSalePrice || projectedCommission) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              {client.desiredSalePrice && (
                <span className="text-slate-300 bg-slate-900/70 border border-slate-700 px-2 py-0.5 rounded-md">
                  Target {formatMoney(client.desiredSalePrice, { compact: true })}
                </span>
              )}
              {projectedCommission && (
                <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md">
                  Fee {formatMoney(projectedCommission, { compact: true })}
                  {client.projectedCommissionPct ? ` @ ${formatPercent(client.projectedCommissionPct)}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(client)}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs"
            title="Edit"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(client.id)}
            className="p-1.5 rounded-lg hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition-all text-xs"
            title="Delete"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Address — clickable Google Maps link */}
      <button
        onClick={() => setShowDetails(v => !v)}
        className="mb-2 text-xs font-semibold text-slate-600 hover:text-slate-300 transition-colors"
      >
        {showDetails ? 'Hide details' : 'Details'}
      </button>

      {showDetails && client.address && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 hover:text-amber-400 mb-2 truncate flex items-center gap-1 transition-colors"
          title="Open in Google Maps"
        >
          📍 {client.address}
        </a>
      )}
      {showDetails && client.mailingAddress && (
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs text-slate-500 truncate flex-1" title={client.mailingAddress}>
            Mail: {client.mailingAddress}
          </p>
          <AddToMailerButton
            mailerApi={mailerApi}
            member={{ type: 'client', id: client.id, name: client.name, mailingAddress: client.mailingAddress, addressLabel: 'Primary' }}
          />
        </div>
      )}

      {showDetails && client.mailingAddresses?.length > 0 && (
        <div className="mb-2 space-y-1">
          {client.mailingAddresses.map(row => (
            <div key={row.id || row.address} className="flex items-center gap-2">
              <p className="text-xs text-slate-500 truncate flex-1" title={row.address}>
                {row.label ? `${row.label}: ` : 'Mail: '}{row.address}
              </p>
              <AddToMailerButton
                mailerApi={mailerApi}
                member={{ type: 'client', id: client.id, name: client.name, mailingAddress: row.address, addressLabel: row.label || 'Affiliated' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Phone + Email */}
      {showDetails && (client.phone || client.email) && (
        <div className="flex flex-col gap-0.5 mb-2">
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
            >
              📞 {client.phone}
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors truncate"
            >
              ✉️ {client.email}
            </a>
          )}
        </div>
      )}

      {/* Stats row */}
      {showDetails && (client.units || client.sqft) && (
        <div className="flex gap-3 mb-2">
          {client.units && (
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{client.units.toLocaleString()}</span> units
            </span>
          )}
          {client.sqft && (
            <span className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{client.sqft.toLocaleString()}</span> sq ft
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {showDetails && client.notes && (
        <p className="text-xs text-slate-500 italic line-clamp-2">{client.notes}</p>
      )}

      {/* Next Action display */}
      {(nextTask || actionType) && <div className="mt-3 pt-3 border-t border-slate-700">
        {nextTask ? (
          <button
            onClick={() => setActivityMode('task')}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition-all border ${
              nextTaskDue?.tone === 'red'
                ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                : nextTaskDue?.tone === 'amber'
                  ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{nextTaskType?.icon ?? '>'}</span>
                <span className={`text-xs font-bold truncate ${
                  nextTaskDue?.tone === 'red' ? 'text-red-400' : nextTaskDue?.tone === 'amber' ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {nextTask.title}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {nextTaskDue && (
                  <span className={`text-xs font-black ${
                    nextTaskDue.tone === 'red' ? 'text-red-400' : nextTaskDue.tone === 'amber' ? 'text-amber-400' : 'text-slate-500'
                  }`}>{nextTaskDue.label}</span>
                )}
              </div>
            </div>
            {nextTask.description && (
              <p className="text-xs text-slate-500 mt-1 truncate">{nextTask.description}</p>
            )}
          </button>
        ) : actionType ? (
          <button
            onClick={() => setActivityMode('task')}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition-all border ${
              fallbackDue?.tone === 'red'
                ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                : fallbackDue?.tone === 'amber'
                  ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{actionType.icon}</span>
                <span className={`text-xs font-bold truncate ${
                  fallbackDue?.tone === 'red' ? 'text-red-400' : fallbackDue?.tone === 'amber' ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {actionType.label}
                </span>
              </div>
              {fallbackDue && (
                <span className={`text-xs font-black flex-shrink-0 ${
                  fallbackDue.tone === 'red' ? 'text-red-400' : fallbackDue.tone === 'amber' ? 'text-amber-400' : 'text-slate-500'
                }`}>{fallbackDue.label}</span>
              )}
            </div>
            {client.nextActionNote && (
              <p className="text-xs text-slate-500 mt-1 truncate">{client.nextActionNote}</p>
            )}
          </button>
        ) : null}
      </div>}

      {/* One compact relationship-work area: future Task or historical Action. */}
      {(onLogAction || taskApi) && (
        <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Relationship Activity</p>
          <div className="flex items-center justify-between gap-2">
          <LastActionLine
            actionLog={client.actionLog}
            onDeleteLast={onDeleteAction ? (index) => onDeleteAction(client.id, index) : undefined}
          />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setActivityMode('task')} disabled={!taskApi?.createTask}
              className="min-w-0 min-h-10 text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-2 transition-all disabled:opacity-40">
              + Task
            </button>
            <button type="button" onClick={() => setActivityMode('action')} disabled={!onLogAction}
              className="min-w-0 min-h-10 text-xs font-bold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-2 transition-all disabled:opacity-40">
              + Action
            </button>
          </div>
        </div>
      )}

      {showDetails && (
        <>
      {/* Universal tasks tied to this client (Sprint 2) */}
      <RelatedTasks
        taskApi={taskApi}
        relatedType="client"
        relatedId={client.id}
        relatedName={client.name}
        source="client"
        allowAdd={false}
      />

      {!compact && ownershipApi && (
        <OwnershipLinksPanel
          record={client}
          ownershipApi={ownershipApi}
          onUpdate={(id, fields) => onSetAction?.(id, fields)}
          compact
        />
      )}

      {/* Stage selector (mini) */}
      {!compact && (
        <div className="mt-2">
          <select
            value={client.stageId}
            onChange={e => onStageChange(client.id, Number(e.target.value))}
            className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-amber-500"
          >
            {PIPELINE_STAGES.map(s => (
              <option key={s.id} value={s.id}>{s.id}. {s.label}</option>
            ))}
          </select>
        </div>
      )}
        </>
      )}

      {/* Move out of the pipeline → keep as a Master Database contact */}
      {showDetails && onMoveToDatabase && (
        <button
          onClick={() => {
            if (confirm(`Archive "${client.name}" from the active pipeline and keep the owner in the Master Database?`)) onMoveToDatabase(client);
          }}
          className="mt-2 w-full text-xs font-semibold text-emerald-400 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 rounded-lg px-3 py-1.5 transition-all"
          title="Keeps the linked owner/contact record and moves this deal to Post-Close"
        >
          ⤳ Move to Master Database
        </button>
      )}
    </div>

    {activityMode && (
      <ActionCenterModal
        name={client.name}
        subtitle={client.facilityName}
        mode={activityMode}
        actionLog={client.actionLog}
        onLogAction={onLogAction ? (entry) => onLogAction(client.id, entry) : undefined}
        onDeleteAction={onDeleteAction ? (index) => onDeleteAction(client.id, index) : undefined}
        taskContext={{ relatedType: 'client', relatedId: client.id, relatedName: client.name, source: compact ? 'pipeline' : 'client' }}
        onSaveTask={taskApi?.createTask}
        onClose={() => setActivityMode(null)}
      />
    )}
    </>
  );
}
