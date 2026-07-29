import { useState } from 'react';
import { PIPELINE_STAGES } from '../data/constants';
import { Button, ModalLayout } from './ui';

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500';
const normalized = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export default function PipelineOpportunityModal({
  contact,
  properties = [],
  clients = [],
  onSave,
  onTaskCreate,
  onClose,
}) {
  const availableProperties = properties.filter(property => contact?.ownershipGroupId
    ? property.ownershipGroupId === contact.ownershipGroupId
    : (normalized(property.facilityName) && normalized(property.facilityName) === normalized(contact.facilityName))
      || (normalized(property.address) && normalized(property.address) === normalized(contact.address))
  );
  const [form, setForm] = useState({
    propertyId: availableProperties[0]?.id ?? '',
    stageId: 1,
    opportunityName: '',
    desiredSalePrice: '',
    ownerPricingExpectation: '',
    nextAction: '',
    nextActionDueDate: '',
    assignedUser: 'Brandon Greene',
    importantNotes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedProperty = availableProperties.find(property => property.id === form.propertyId);

  function update(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const duplicate = clients.find(client =>
      client.contactId === contact.id
      && ((form.propertyId && client.propertyId === form.propertyId)
        || (!form.propertyId && !client.propertyId
          && String(client.facilityName || '').trim().toLowerCase() === String(selectedProperty?.facilityName || contact.facilityName || '').trim().toLowerCase()))
    );
    if (duplicate) {
      setError(`This owner and property are already in Pipeline as "${duplicate.opportunityName || duplicate.facilityName || duplicate.name}".`);
      return;
    }
    setSaving(true);
    setError('');
    const propertyName = selectedProperty?.facilityName || contact.facilityName || '';
    const payload = {
      contactId: contact.id,
      ownershipGroupId: contact.ownershipGroupId ?? selectedProperty?.ownershipGroupId ?? null,
      propertyId: form.propertyId || null,
      opportunityName: form.opportunityName.trim() || `${propertyName || contact.ownerName || 'Owner'} Opportunity`,
      name: contact.ownerName || contact.facilityName || 'Unknown Owner',
      type: 'Seller',
      propertyType: selectedProperty?.propertyType || 'Self-Storage',
      facilityName: propertyName,
      address: selectedProperty?.address || contact.address || '',
      phone: contact.phone || '',
      email: contact.email || '',
      leadSource: contact.leadSource || '',
      notes: contact.notes || '',
      importantNotes: form.importantNotes,
      stageId: Number(form.stageId),
      stageEnteredAt: new Date().toISOString(),
      assignedUser: form.assignedUser,
      desiredSalePrice: form.desiredSalePrice || null,
      ownerPricingExpectation: form.ownerPricingExpectation || null,
      nextActionType: form.nextAction ? 'call' : '',
      nextActionDate: form.nextActionDueDate,
      nextActionNote: form.nextAction,
      actionLog: [{
        eventId: crypto.randomUUID(),
        type: 'pipeline_stage_changed',
        analytics: false,
        previousStageId: null,
        newStageId: Number(form.stageId),
        changedBy: form.assignedUser,
        date: new Date().toISOString().slice(0, 10),
        at: new Date().toISOString(),
        note: 'Pipeline opportunity created.',
      }],
    };
    const result = await onSave(payload);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    if (form.nextAction && form.nextActionDueDate && onTaskCreate) {
      const taskResult = await onTaskCreate({
        title: form.nextAction,
        description: form.importantNotes,
        taskType: 'follow_up',
        priority: 'normal',
        dueDate: form.nextActionDueDate,
        relatedType: 'client',
        relatedId: result.client.id,
        relatedName: payload.opportunityName,
        source: 'pipeline',
      });
      if (taskResult?.error) {
        setError(`Opportunity saved, but the next task failed: ${taskResult.error}`);
        setSaving(false);
        return;
      }
    }
    onClose();
  }

  return (
    <ModalLayout onClose={() => !saving && onClose()} size="lg" className="overflow-hidden">
      <form onSubmit={submit}>
        <div className="border-b border-slate-800 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Pipeline opportunity</p>
          <h2 className="mt-1 text-xl font-bold text-white">{contact.ownerName || contact.facilityName || 'Owner'}</h2>
          <p className="mt-1 text-sm text-slate-500">Create a property-specific opportunity linked to this existing contact.</p>
        </div>
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Property or portfolio</span>
            <select className={inputClass} value={form.propertyId} onChange={event => update('propertyId', event.target.value)}>
              <option value="">Use contact facility details</option>
              {availableProperties.map(property => <option key={property.id} value={property.id}>{property.facilityName || property.address || 'Unnamed property'}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Opportunity name</span>
            <input className={inputClass} value={form.opportunityName} onChange={event => update('opportunityName', event.target.value)} placeholder="Defaults from property" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Starting stage</span>
            <select className={inputClass} value={form.stageId} onChange={event => update('stageId', event.target.value)}>
              {PIPELINE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Estimated property value</span>
            <input type="number" min="0" className={inputClass} value={form.desiredSalePrice} onChange={event => update('desiredSalePrice', event.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Owner pricing expectation</span>
            <input type="number" min="0" className={inputClass} value={form.ownerPricingExpectation} onChange={event => update('ownerPricingExpectation', event.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Next action</span>
            <input className={inputClass} value={form.nextAction} onChange={event => update('nextAction', event.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Next-action due date</span>
            <input type="date" className={inputClass} value={form.nextActionDueDate} onChange={event => update('nextActionDueDate', event.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Assigned user</span>
            <input className={inputClass} value={form.assignedUser} onChange={event => update('assignedUser', event.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Important notes</span>
            <textarea rows={3} className={inputClass} value={form.importantNotes} onChange={event => update('importantNotes', event.target.value)} />
          </label>
          {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Add to Pipeline'}</Button>
        </div>
      </form>
    </ModalLayout>
  );
}
