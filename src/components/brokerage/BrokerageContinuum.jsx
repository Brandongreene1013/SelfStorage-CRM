import { useMemo, useState } from 'react';
import {
  BROKERAGE_CONTINUUM_GROUPS,
  BROKERAGE_CONTINUUM_REASONS,
  BROKERAGE_CONTINUUM_STAGES,
  brokerageContinuumDirection,
  brokerageContinuumStage,
  continuumDaysInStage,
  continuumTransitionRequirements,
  suggestedContinuumStageFromPipeline,
} from '../../lib/brokerageContinuum';
import { Button, ModalLayout } from '../ui';

const toneClasses = {
  slate: 'border-slate-600/50 bg-slate-700/40 text-slate-200',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
  blue: 'border-blue-500/35 bg-blue-500/10 text-blue-300',
  indigo: 'border-indigo-500/35 bg-indigo-500/10 text-indigo-300',
  purple: 'border-purple-500/35 bg-purple-500/10 text-purple-300',
  violet: 'border-violet-500/35 bg-violet-500/10 text-violet-300',
  amber: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  orange: 'border-orange-500/35 bg-orange-500/10 text-orange-300',
  rose: 'border-rose-500/35 bg-rose-500/10 text-rose-300',
  emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  teal: 'border-teal-500/35 bg-teal-500/10 text-teal-300',
};

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500';

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function reasonLabel(value) {
  return BROKERAGE_CONTINUUM_REASONS.find(reason => reason.value === value)?.label || value?.replaceAll('_', ' ') || '';
}

export function BrokerageContinuumBadge({ stage, enteredAt, showDays = true, className = '' }) {
  const definition = brokerageContinuumStage(stage);
  const days = continuumDaysInStage(enteredAt);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses[definition.tone]} ${className}`}>
      <span>{definition.label}</span>
      {showDays && enteredAt && <span className="font-medium opacity-70">{days}d</span>}
    </span>
  );
}

export function BrokerageContinuumStepper({ stage }) {
  const current = brokerageContinuumStage(stage);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[930px] items-start gap-1">
        {BROKERAGE_CONTINUUM_STAGES.map(item => {
          const active = item.value === current.value;
          return (
            <div key={item.value} className="flex min-w-0 flex-1 items-start">
              <div className="min-w-0 flex-1 text-center">
                <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black ${active ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,.25)]' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>
                  {item.order}
                </div>
                <p className={`mt-1.5 truncate text-[10px] font-bold ${active ? 'text-amber-300' : 'text-slate-600'}`}>{item.shortLabel}</p>
              </div>
              {item.order < BROKERAGE_CONTINUUM_STAGES.length && <div className="mt-3.5 h-px w-2 bg-slate-700" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BrokerageContinuumFilter({ selected, onChange }) {
  const toggle = stage => onChange(selected.includes(stage)
    ? selected.filter(value => value !== stage)
    : [...selected, stage]);
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
        Continuum {selected.length ? `(${selected.length})` : '— All'}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Stages</p>
          {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs font-bold text-amber-400">Clear</button>}
        </div>
        {BROKERAGE_CONTINUUM_GROUPS.map(group => (
          <div key={group.value} className="mb-3 last:mb-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{group.label}</p>
            {group.stages.map(stage => {
              const definition = brokerageContinuumStage(stage);
              return (
                <label key={stage} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-300 hover:bg-slate-900">
                  <input type="checkbox" checked={selected.includes(stage)} onChange={() => toggle(stage)} className="accent-amber-500" />
                  {definition.order}. {definition.label}
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

export function BrokerageContinuumSummary({ profiles }) {
  const counts = useMemo(() => Object.fromEntries(BROKERAGE_CONTINUUM_STAGES.map(stage => [
    stage.value,
    profiles.filter(profile => profile.brokerageContinuumStage === stage.value).length,
  ])), [profiles]);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {BROKERAGE_CONTINUUM_STAGES.map(stage => (
        <div key={stage.value} className="min-w-[104px] rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-lg font-bold text-white">{counts[stage.value]}</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{stage.shortLabel}</p>
        </div>
      ))}
    </div>
  );
}

export function BrokerageContinuumChangeModal({
  profile,
  properties = [],
  pipelineRecords = [],
  initialStage,
  onSave,
  onClose,
}) {
  const [newStage, setNewStage] = useState(initialStage || profile.brokerageContinuumStage);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localDateTimeValue());
  const [propertyId, setPropertyId] = useState(profile.primaryPropertyId || '');
  const [clientId, setClientId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requirements = continuumTransitionRequirements(profile.brokerageContinuumStage, newStage, reason);
  const direction = brokerageContinuumDirection(profile.brokerageContinuumStage, newStage);
  const newDefinition = brokerageContinuumStage(newStage);
  const isSame = direction === 'unchanged';
  const highestPipelineStage = Math.max(0, ...pipelineRecords.map(client => Number(client.stageId) || 0));
  const operationalWarning = newStage === 'exclusive_listing' && highestPipelineStage < 5
    ? 'No linked Pipeline opportunity currently reflects an active listing. You can still proceed, but confirm the property record next.'
    : ['contract', 'due_diligence'].includes(newStage) && highestPipelineStage < 8
      ? 'No linked Pipeline opportunity is currently under contract. Confirm the transaction record after this relationship update.'
      : ['close', 'post_close'].includes(newStage) && highestPipelineStage < 9
        ? 'No linked Pipeline opportunity currently reflects a closing or completed transaction.'
        : '';

  async function submit(event) {
    event.preventDefault();
    if (isSame) return setError('Choose a different stage.');
    if (requirements.reasonRequired && !reason) return setError('Select a reason for this transition.');
    if (requirements.noteRequired && !note.trim()) return setError('Add a note explaining this transition.');
    setSaving(true);
    setError('');
    const result = await onSave({
      coreClientId: profile.id,
      newStage,
      changedBy: profile.assignedUser,
      reason,
      note,
      effectiveAt: new Date(effectiveAt).toISOString(),
      source: 'manual',
      relatedPropertyId: propertyId,
      relatedClientId: clientId,
    });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onClose();
  }

  return (
    <ModalLayout onClose={() => !saving && onClose()} size="lg">
      <form onSubmit={submit}>
        <div className="border-b border-slate-800 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-400">Brokerage Continuum</p>
          <h2 className="mt-1 text-xl font-bold text-white">Change relationship stage</h2>
          <p className="mt-1 text-sm text-slate-500">This creates a permanent, time-stamped history entry.</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Current</span>
              <BrokerageContinuumBadge stage={profile.brokerageContinuumStage} enteredAt={profile.brokerageContinuumStageEnteredAt} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">New stage</span>
              <select className={inputClass} value={newStage} onChange={event => setNewStage(event.target.value)}>
                {BROKERAGE_CONTINUUM_STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.order}. {stage.label}</option>)}
              </select>
            </label>
          </div>
          {!isSame && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${direction === 'backward' || requirements.skippedForward ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
              {direction === 'backward' ? 'Moving backward requires context so the relationship history remains intelligible.' : requirements.skippedForward ? 'This skips multiple stages. Record why the intervening stages do not apply.' : `Next objective: ${newDefinition.objective}`}
            </div>
          )}
          {operationalWarning && <p className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">{operationalWarning}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Reason {requirements.reasonRequired ? '*' : '(optional)'}</span>
              <select className={inputClass} value={reason} onChange={event => setReason(event.target.value)}>
                <option value="">Select a reason</option>
                {BROKERAGE_CONTINUUM_REASONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Effective date</span>
              <input type="datetime-local" className={inputClass} value={effectiveAt} max={localDateTimeValue()} onChange={event => setEffectiveAt(event.target.value)} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Related property</span>
              <select className={inputClass} value={propertyId} onChange={event => setPropertyId(event.target.value)}>
                <option value="">None</option>
                {properties.map(property => <option key={property.id} value={property.id}>{property.facilityName || property.address || 'Unnamed property'}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Related opportunity</span>
              <select className={inputClass} value={clientId} onChange={event => setClientId(event.target.value)}>
                <option value="">None</option>
                {pipelineRecords.map(client => <option key={client.id} value={client.id}>{client.facilityName || client.propertyName || client.ownerName || 'Pipeline opportunity'}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Transition note {requirements.noteRequired ? '*' : '(optional)'}</span>
            <textarea className={inputClass} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Decision context, transaction status, or next relationship objective…" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || isSame}>{saving ? 'Saving…' : 'Record stage change'}</Button>
        </div>
      </form>
    </ModalLayout>
  );
}

export function BrokerageContinuumHistory({ history = [], properties = [], pipelineRecords = [] }) {
  if (!history.length) return <p className="text-sm italic text-slate-600">No stage history recorded yet.</p>;
  return (
    <ol className="space-y-3">
      {history.map(entry => {
        const property = properties.find(item => item.id === entry.relatedPropertyId);
        const opportunity = pipelineRecords.find(item => item.id === entry.relatedClientId);
        return (
          <li key={entry.id} className="border-l border-slate-700 pl-4">
            <div className="flex flex-wrap items-center gap-2">
              {entry.previousStage && <span className="text-xs text-slate-500">{brokerageContinuumStage(entry.previousStage).label} →</span>}
              <BrokerageContinuumBadge stage={entry.newStage} showDays={false} />
              <span className="text-xs text-slate-600">{new Date(entry.effectiveAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {entry.changedBy || 'Unknown user'}{entry.changeReason ? ` · ${reasonLabel(entry.changeReason)}` : ''}{entry.source !== 'manual' ? ` · ${entry.source.replaceAll('_', ' ')}` : ''}
            </p>
            {entry.changeNote && <p className="mt-1 text-sm text-slate-300">{entry.changeNote}</p>}
            {(property || opportunity) && <p className="mt-1 text-xs text-slate-600">{property?.facilityName || property?.address || opportunity?.facilityName || opportunity?.propertyName}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function BrokerageContinuumPanel({
  profile,
  properties = [],
  pipelineRecords = [],
  history = [],
  migrationNeeded = false,
  onChange,
}) {
  const [changing, setChanging] = useState(null);
  const current = brokerageContinuumStage(profile.brokerageContinuumStage);
  const days = continuumDaysInStage(profile.brokerageContinuumStageEnteredAt);
  const highestPipeline = [...pipelineRecords].sort((a, b) => Number(b.stageId) - Number(a.stageId))[0];
  const suggested = highestPipeline ? suggestedContinuumStageFromPipeline(highestPipeline.stageId) : null;
  const suggestionDiffers = suggested && suggested !== current.value;
  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Brokerage Continuum</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BrokerageContinuumBadge stage={current.value} enteredAt={profile.brokerageContinuumStageEnteredAt} />
            <span className="text-xs text-slate-500">{days} {days === 1 ? 'day' : 'days'} in stage</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{current.objective}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setChanging(current.value)} disabled={migrationNeeded}>Change stage</Button>
      </div>
      <div className="mt-4"><BrokerageContinuumStepper stage={current.value} /></div>
      {migrationNeeded && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Run <code>sql/brokerage_continuum_migration.sql</code> in Supabase to enable controlled stage changes and history.</p>}
      {!migrationNeeded && suggestionDiffers && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2">
          <p className="text-sm text-sky-200">Pipeline activity suggests <strong>{brokerageContinuumStage(suggested).label}</strong>. Review—this will never update automatically.</p>
          <button type="button" onClick={() => setChanging(suggested)} className="text-xs font-bold text-sky-300 hover:text-white">Review suggestion</button>
        </div>
      )}
      <details className="mt-4 border-t border-slate-800 pt-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Stage history ({history.length})</summary>
        <div className="mt-3 max-h-60 overflow-y-auto pr-2"><BrokerageContinuumHistory history={history} properties={properties} pipelineRecords={pipelineRecords} /></div>
      </details>
      {changing && (
        <BrokerageContinuumChangeModal
          profile={profile}
          properties={properties}
          pipelineRecords={pipelineRecords}
          initialStage={changing}
          onSave={onChange}
          onClose={() => setChanging(null)}
        />
      )}
    </section>
  );
}
