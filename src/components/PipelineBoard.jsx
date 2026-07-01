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
import { PIPELINE_STAGES, ACTION_TYPES, LEAD_TEMPS } from '../data/constants';
import { LogActionModal, LastActionLine } from './ActionLog';
import MoveMenu from './MoveMenu';
import { StatusBadge } from './ui';
import { NextActionIndicator } from './tasks';

/* ── Draggable client chip ── */
function DraggableChip({ client, stage, onEdit, onSetAction, onLogAction, onMoveToDatabase, taskApi }) {
  const [showLog, setShowLog] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { client },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const actionType = ACTION_TYPES.find(a => a.value === client.nextActionType);
  const isOverdue = client.nextActionDate && client.nextActionDate < today;
  const isDueToday = client.nextActionDate === today;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group relative bg-slate-800 border rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragging ? 'opacity-30 border-slate-600' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-750'
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
                <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${temp.bg} ${temp.border} ${temp.text}`}>
                  {temp.icon}
                </span>
              ) : null;
            })()}
            <NextActionIndicator taskApi={taskApi} relatedType="client" relatedId={client.id} />
          </div>
          <p className="text-sm font-semibold text-white truncate leading-tight">{client.name}</p>
          {client.facilityName && (
            <p className="text-xs text-slate-400 truncate">{client.facilityName}</p>
          )}
          {client.address && (
            <p className="text-xs text-slate-500 truncate mt-0.5">📍 {client.address}</p>
          )}
          {(client.units || client.sqft) && (
            <div className="flex gap-2 mt-1">
              {client.units && <span className="text-xs text-slate-400">{client.units.toLocaleString()} units</span>}
              {client.sqft && <span className="text-xs text-slate-400">{(client.sqft / 1000).toFixed(0)}k sqft</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onMoveToDatabase && (
            <MoveMenu label="⋯" options={[{ label: '→ Master Database (out of pipeline)', onClick: () => { if (confirm(`Move "${client.name}" out of the pipeline and into the Master Database?`)) onMoveToDatabase(client); } }]} />
          )}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(client); }}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all text-xs"
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Next action indicator */}
      {actionType ? (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onSetAction?.(client); }}
          className={`mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs cursor-pointer transition-all border ${
            isOverdue
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : isDueToday
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-700/50 border-slate-600/50 text-slate-400'
          }`}
        >
          <span>{actionType.icon}</span>
          <span className="font-semibold truncate">{actionType.label}</span>
          {isOverdue && <span className="font-black ml-auto flex-shrink-0">OVERDUE</span>}
          {isDueToday && !isOverdue && <span className="font-black ml-auto flex-shrink-0">TODAY</span>}
        </div>
      ) : (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onSetAction?.(client); }}
          className="mt-2 w-full text-xs text-slate-600 hover:text-amber-400 border border-dashed border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-1.5 transition-all"
        >
          + Set Action
        </button>
      )}

      {/* Activity log: Last Action + Log button */}
      {onLogAction && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <LastActionLine actionLog={client.actionLog} />
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setShowLog(true); }}
            className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-0.5 transition-all"
          >
            + Log
          </button>
        </div>
      )}

      {showLog && (
        <LogActionModal
          name={client.name}
          subtitle={client.facilityName}
          actionLog={client.actionLog}
          onSave={(entry) => onLogAction(client.id, entry)}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}

/* ── Droppable column ── */
function StageColumn({ stage, clients, onEdit, onSetAction, onLogAction, onMoveToDatabase, taskApi, isOver: isOverProp }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(stage.id) });
  const active = isOver || isOverProp;

  return (
    <div className="flex flex-col min-w-[200px] max-w-[220px] flex-shrink-0">
      {/* Column header */}
      <div className={`rounded-t-xl px-3 py-2.5 border-b-2 ${stage.color} bg-opacity-20`} style={{ background: `${stage.hex}22` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black w-5 h-5 rounded-full flex items-center justify-center text-white`} style={{ background: stage.hex }}>
              {stage.id}
            </span>
            <span className="text-xs font-bold text-slate-200 leading-tight">{stage.label}</span>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
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
          <DraggableChip key={c.id} client={c} stage={stage} onEdit={onEdit} onSetAction={onSetAction} onLogAction={onLogAction} onMoveToDatabase={onMoveToDatabase} taskApi={taskApi} />
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
      {client.facilityName && <p className="text-xs text-slate-400 truncate">{client.facilityName}</p>}
    </div>
  );
}

/* ── Main Pipeline Board ── */
export default function PipelineBoard({ clients, onEdit, onStageChange, onSetAction, onLogAction, onMoveToDatabase, filter, taskApi }) {
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
            onSetAction={onSetAction}
            onLogAction={onLogAction}
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
