import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { PIPELINE_STAGES, LEAD_TEMPS } from '../data/constants';
import { formatMoney, formatPercent, projectedCommissionAmount } from '../lib/dealValue';
import { pipelineAttention } from '../lib/relationshipWorkspace';
import ActionCenterModal from './ActionCenterModal';
import EngagementPanel from './EngagementPanel';
import MoveMenu from './MoveMenu';
import { StatusBadge } from './ui';
import { getNextOpenTask, legacyActionDefaults, taskEditDefaults } from './tasks';

/* ── Draggable client chip ── */
function DraggableChip({ client, onEdit, onLogAction, onDeleteAction, onMoveToDatabase, taskApi }) {
  const [showActionCenter, setShowActionCenter] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { client },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const openTasks = taskApi?.getRelatedTasks('client', client.id) ?? [];
  const nextTask = getNextOpenTask(openTasks);
  const projectedCommission = projectedCommissionAmount(client.desiredSalePrice, client.projectedCommissionPct);
  const attention = pipelineAttention(client, taskApi?.tasks ?? []);
  const modalDefaults = nextTask
    ? taskEditDefaults(nextTask)
    : legacyActionDefaults(client.nextActionType, client.nextActionDate, client.nextActionNote);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group relative bg-slate-800/80 border rounded-xl p-3 shadow-sm ring-1 ring-inset ring-white/[0.03] cursor-grab active:cursor-grabbing transition-[border-color,background-color,box-shadow] duration-150 select-none ${
        isDragging ? 'opacity-30 border-slate-600' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1 flex-wrap">
            <StatusBadge variant={client.type === 'Buyer' ? 'buyer' : 'seller'} pill={false} className="font-bold px-1.5">
              {client.type}
            </StatusBadge>
            {(() => {
              const temp = LEAD_TEMPS.find(t => t.value === client.leadTemp);
              return temp ? (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${temp.bg} ${temp.border} ${temp.text}`}>
                  {temp.icon}
                </span>
              ) : null;
            })()}
          </div>
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {client.opportunityName || client.facilityName || client.name}
          </p>
          {client.age && (
            <p className="text-[11px] font-semibold text-slate-500 leading-tight">Age {client.age}</p>
          )}
          <p className="text-xs text-slate-400 truncate">
            {[client.name, client.opportunityName ? client.facilityName : ''].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-slate-500">
            <span>{attention.daysInStage ?? 0}d in stage</span>
            <span>·</span>
            <span>{client.assignedUser || 'Brandon Greene'}</span>
            {(attention.overdue || attention.stale) && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-bold text-red-400">
                {attention.overdue ? 'Overdue' : 'Stale'}
              </span>
            )}
          </div>
          {(client.desiredSalePrice || projectedCommission) && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold">
              {client.desiredSalePrice && (
                <span className="text-slate-300 bg-slate-900/70 border border-slate-700 px-1.5 py-0.5 rounded-md">
                  {formatMoney(client.desiredSalePrice, { compact: true })}
                </span>
              )}
              {projectedCommission && (
                <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded-md">
                  {formatMoney(projectedCommission, { compact: true })}
                  {client.projectedCommissionPct ? ` @ ${formatPercent(client.projectedCommissionPct)}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onMoveToDatabase && (
            <MoveMenu label="More" options={[{ label: 'Remove from Pipeline', onClick: () => { if (confirm(`Remove "${client.name}" from the active pipeline? Their contact, lists, properties, tasks, and activity will stay unchanged.`)) onMoveToDatabase(client); } }]} />
          )}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(client); }}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all text-xs"
          >
            Edit
          </button>
        </div>
      </div>

      <EngagementPanel
        record={client}
        taskApi={taskApi}
        onOpen={() => setShowActionCenter(true)}
        compact
        stopPointerDown
      />

      {showActionCenter && (
        <ActionCenterModal
          name={client.name}
          subtitle={client.facilityName}
          actionLog={client.actionLog}
          onLogAction={onLogAction ? (entry) => onLogAction(client.id, entry) : undefined}
          onDeleteAction={onDeleteAction ? (index) => onDeleteAction(client.id, index) : undefined}
          taskContext={{ relatedType: 'client', relatedId: client.id, relatedName: client.name, source: 'pipeline' }}
          taskDefaults={modalDefaults}
          onSaveTask={modalDefaults.id
            ? (fields) => taskApi?.updateTask(modalDefaults.id, fields)
            : taskApi?.createTask}
          onClose={() => setShowActionCenter(false)}
        />
      )}
    </div>
  );
}

/* ── Droppable column ── */
function StageColumn({ stage, clients, onEdit, onLogAction, onDeleteAction, onMoveToDatabase, taskApi, isOver: isOverProp }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(stage.id) });
  const active = isOver || isOverProp;

  return (
    <div className="flex flex-col min-w-[200px] max-w-[220px] flex-shrink-0">
      {/* Column header */}
      <div
        className="rounded-t-xl px-3 py-2.5 border-b-2 ring-1 ring-inset ring-white/[0.04]"
        style={{ background: `${stage.hex}14`, borderBottomColor: stage.hex }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center text-white tabular-nums shadow-sm flex-shrink-0" style={{ background: stage.hex }}>
              {stage.id}
            </span>
            <span className="text-xs font-semibold text-slate-100 leading-tight tracking-tight truncate">{stage.label}</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-300 tabular-nums bg-slate-950/60 ring-1 ring-inset ring-white/10 px-2 py-0.5 rounded-full flex-shrink-0">
            {clients.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[300px] rounded-b-xl p-2 space-y-2 border border-t-0 transition-all overflow-y-auto scrollbar-thin ${
          active
            ? 'border-amber-500/60 bg-amber-500/5'
            : 'border-slate-700/60 bg-slate-900/40'
        }`}
      >
        {clients.length === 0 && (
          <div className={`flex items-center justify-center h-16 rounded-lg border border-dashed text-xs text-slate-600 transition-all ${
            active ? 'border-amber-500/40 text-amber-600' : 'border-slate-700'
          }`}>
            Drop here
          </div>
        )}
        {clients.map(c => (
          <DraggableChip key={c.id} client={c} onEdit={onEdit} onLogAction={onLogAction} onDeleteAction={onDeleteAction} onMoveToDatabase={onMoveToDatabase} taskApi={taskApi} />
        ))}
      </div>
    </div>
  );
}

/* ── Drag overlay chip ── */
function OverlayChip({ client }) {
  return (
    <div className="bg-slate-800 border border-amber-500 rounded-xl p-3 shadow-2xl w-[200px] cursor-grabbing rotate-2 opacity-95">
      <div className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded mb-1 ${
        client.type === 'Buyer' ? 'bg-blue-900/60 text-blue-300' : 'bg-amber-900/60 text-amber-300'
      }`}>
        {client.type}
      </div>
      <p className="text-sm font-semibold text-white truncate">{client.name}</p>
      {client.age && <p className="text-[11px] font-semibold text-slate-500 truncate">Age {client.age}</p>}
      {client.facilityName && <p className="text-xs text-slate-400 truncate">{client.facilityName}</p>}
    </div>
  );
}

/* ── Main Pipeline Board ── */
export default function PipelineBoard({ clients, onEdit, onStageChange, onLogAction, onDeleteAction, onMoveToDatabase, filter, taskApi }) {
  const [activeClient, setActiveClient] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filteredClients = filter === 'All'
    ? clients
    : clients.filter(c => c.type === filter);

  function handleDragStart({ active }) {
    setActiveClient(filteredClients.find(c => c.id === active.id) ?? null);
  }

  function handleDragEnd({ active, over }) {
    setActiveClient(null);
    if (!over) return;
    const newStageId = Number(over.id);
    const client = filteredClients.find(c => c.id === active.id);
    if (client && client.stageId !== newStageId) {
      onStageChange(client.id, newStageId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 pb-4 overflow-x-auto scrollbar-thin">
        {PIPELINE_STAGES.map(stage => (
          <StageColumn
            key={stage.id}
            stage={stage}
            clients={filteredClients.filter(c => c.stageId === stage.id)}
            onEdit={onEdit}
            onLogAction={onLogAction}
            onDeleteAction={onDeleteAction}
            onMoveToDatabase={onMoveToDatabase}
            taskApi={taskApi}
          />
        ))}
      </div>

      <DragOverlay>
        {activeClient && <OverlayChip client={activeClient} />}
      </DragOverlay>
    </DndContext>
  );
}
