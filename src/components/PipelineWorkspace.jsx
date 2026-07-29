import { useMemo, useState } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import { formatMoney } from '../lib/dealValue';
import { pipelineAttention } from '../lib/relationshipWorkspace';
import PipelineBoard from './PipelineBoard';
import { Button, EmptyState, PageHeader, StatusBadge } from './ui';

function stageVariant(stageId) {
  if (stageId >= 8) return 'red';
  if (stageId >= 5) return 'green';
  if (stageId >= 3) return 'blue';
  return 'slate';
}

export default function PipelineWorkspace({
  clients,
  contacts,
  properties,
  taskApi,
  filter,
  onEdit,
  onStageChange,
  onLogAction,
  onDeleteAction,
  onMoveToDatabase,
}) {
  const [mode, setMode] = useState('board');
  const [stage, setStage] = useState(0);
  const [assigned, setAssigned] = useState('all');
  const [state, setState] = useState('all');
  const [attentionFilter, setAttentionFilter] = useState('all');
  const [stageError, setStageError] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => clients.map(client => {
    const contact = contacts.find(item => item.id === client.contactId);
    const property = properties.find(item => item.id === client.propertyId);
    return { client, contact, property, attention: pipelineAttention(client, taskApi.tasks, today) };
  }), [clients, contacts, properties, taskApi.tasks, today]);

  const assignedUsers = [...new Set(rows.map(row => row.client.assignedUser).filter(Boolean))].sort();
  const states = [...new Set(rows.map(row => row.property?.state || row.contact?.state).filter(Boolean))].sort();
  const filteredRows = rows.filter(row => {
    if (stage && Number(row.client.stageId) !== Number(stage)) return false;
    if (assigned !== 'all' && row.client.assignedUser !== assigned) return false;
    if (state !== 'all' && (row.property?.state || row.contact?.state) !== state) return false;
    if (attentionFilter === 'overdue' && !row.attention.overdue) return false;
    if (attentionFilter === 'no_next' && !row.attention.noNextAction) return false;
    if (attentionFilter === 'stale' && !row.attention.stale) return false;
    return true;
  });

  async function move(clientId, stageId) {
    setStageError('');
    const result = await onStageChange(clientId, stageId);
    if (result?.error) setStageError(result.error);
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Property-specific brokerage opportunities"
        badge="10 established stages"
        actions={(
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <Button size="sm" variant={mode === 'board' ? 'primary' : 'ghost'} onClick={() => setMode('board')}>Board</Button>
            <Button size="sm" variant={mode === 'table' ? 'primary' : 'ghost'} onClick={() => setMode('table')}>Table</Button>
          </div>
        )}
      />
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <select value={stage} onChange={event => setStage(Number(event.target.value))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <option value={0}>All stages</option>
          {PIPELINE_STAGES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <select value={assigned} onChange={event => setAssigned(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <option value="all">All assigned users</option>
          {assignedUsers.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={state} onChange={event => setState(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <option value="all">All states</option>
          {states.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={attentionFilter} onChange={event => setAttentionFilter(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <option value="all">All attention states</option>
          <option value="overdue">Overdue next action</option>
          <option value="no_next">No next action</option>
          <option value="stale">Inactive 30+ days</option>
        </select>
        <span className="ml-auto self-center text-xs font-semibold text-slate-500">{filteredRows.length} opportunities</span>
      </div>
      {stageError && <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{stageError}</p>}

      <div className="mt-4">
        {mode === 'board' ? (
          <PipelineBoard
            clients={filteredRows.map(row => row.client)}
            onEdit={onEdit}
            onStageChange={move}
            onLogAction={onLogAction}
            onDeleteAction={onDeleteAction}
            onMoveToDatabase={onMoveToDatabase}
            filter={filter}
            taskApi={taskApi}
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState title="No opportunities match these filters" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-[1280px] w-full text-left">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Opportunity / Property</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-4 py-3">Days in stage</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRows.map(({ client, contact, property, attention }) => {
                  const pipelineStage = PIPELINE_STAGES.find(option => option.id === Number(client.stageId));
                  return (
                    <tr key={client.id} className={`${attention.overdue || attention.stale ? 'bg-red-500/[0.035]' : ''} hover:bg-white/[0.025]`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{client.opportunityName || client.facilityName || client.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{property?.facilityName || client.facilityName || 'No linked property'} · {[property?.city, property?.state].filter(Boolean).join(', ') || client.address || 'Location unknown'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{contact?.ownerName || client.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={stageVariant(client.stageId)}>{pipelineStage?.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-300">{attention.lastActivityAt ? new Date(attention.lastActivityAt).toLocaleDateString() : 'Never'}</p>
                        {attention.stale && <p className="text-xs font-bold text-red-400">Inactive {attention.daysInactive} days</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className={`max-w-52 truncate text-sm ${attention.overdue ? 'font-bold text-red-400' : 'text-slate-300'}`}>{attention.nextTask?.title || client.nextActionNote || 'No next action'}</p>
                        <p className="text-xs text-slate-500">{attention.dueDate || 'No due date'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-300">{attention.daysInStage ?? '—'}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-300">{client.desiredSalePrice ? formatMoney(client.desiredSalePrice, { compact: true }) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{client.assignedUser || 'Brandon Greene'}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => onEdit(client)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white">Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

