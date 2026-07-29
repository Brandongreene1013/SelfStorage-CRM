import { useState } from 'react';
import {
  CORE_FOLLOW_UP_FREQUENCIES,
  CORE_MOTIVATION_LEVELS,
  CORE_SELLING_TIMELINES,
} from '../data/constants';
import { Button, ModalLayout } from './ui';

function Field({ label, children, span = false }) {
  return (
    <label className={span ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500';
const normalized = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export default function CoreClientModal({
  contact,
  profile,
  properties = [],
  onSave,
  onClose,
  onTaskCreate,
}) {
  const contactProperties = properties.filter(property => contact?.ownershipGroupId
    ? property.ownershipGroupId === contact.ownershipGroupId
    : (normalized(property.facilityName) && normalized(property.facilityName) === normalized(contact.facilityName))
      || (normalized(property.address) && normalized(property.address) === normalized(contact.address))
  );
  const [form, setForm] = useState(() => ({
    contactId: contact.id,
    primaryPropertyId: profile?.primaryPropertyId ?? '',
    sellingMotivation: profile?.sellingMotivation ?? '',
    motivationStrength: profile?.motivationStrength ?? 'unclear',
    sellingTimeline: profile?.sellingTimeline ?? 'unknown',
    priceExpectations: profile?.priceExpectations ?? '',
    saleBarriers: profile?.saleBarriers ?? '',
    followUpFrequencyDays: profile?.followUpFrequencyDays ? String(profile.followUpFrequencyDays) : '',
    nextAction: profile?.nextAction ?? '',
    nextActionDueDate: profile?.nextActionDueDate ?? '',
    assignedUser: profile?.assignedUser ?? 'Brandon Greene',
    notes: profile?.notes ?? '',
    status: 'active',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const result = await onSave(form);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    if (form.nextActionDueDate && form.nextAction && onTaskCreate) {
      const taskResult = await onTaskCreate({
        title: form.nextAction,
        description: form.sellingMotivation,
        taskType: 'follow_up',
        priority: ['strong', 'immediate'].includes(form.motivationStrength) ? 'high' : 'normal',
        dueDate: form.nextActionDueDate,
        relatedType: 'contact',
        relatedId: contact.id,
        relatedName: contact.ownerName || contact.facilityName || 'Core Client',
        source: 'database',
      });
      if (taskResult?.error) {
        setError(`Core Client saved, but the follow-up task failed: ${taskResult.error}`);
        setSaving(false);
        return;
      }
    }
    onClose();
  }

  return (
    <ModalLayout onClose={() => !saving && onClose()} size="xl" className="overflow-hidden">
      <form onSubmit={submit}>
        <div className="border-b border-slate-800 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-400">Core Client</p>
          <h2 className="mt-1 text-xl font-bold text-white">{contact.ownerName || contact.facilityName || 'Owner relationship'}</h2>
          <p className="mt-1 text-sm text-slate-500">Classify this existing Master Database contact—no duplicate person is created.</p>
        </div>
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <Field label="Primary property">
            <select className={inputClass} value={form.primaryPropertyId} onChange={event => update('primaryPropertyId', event.target.value)}>
              <option value="">No property selected</option>
              {contactProperties.map(property => (
                <option key={property.id} value={property.id}>{property.facilityName || property.address || 'Unnamed property'}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned user">
            <input className={inputClass} value={form.assignedUser} onChange={event => update('assignedUser', event.target.value)} />
          </Field>
          <Field label="Motivation strength">
            <select className={inputClass} value={form.motivationStrength} onChange={event => update('motivationStrength', event.target.value)}>
              {CORE_MOTIVATION_LEVELS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Estimated selling timeline">
            <select className={inputClass} value={form.sellingTimeline} onChange={event => update('sellingTimeline', event.target.value)}>
              {CORE_SELLING_TIMELINES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Follow-up frequency">
            <select className={inputClass} value={form.followUpFrequencyDays} onChange={event => update('followUpFrequencyDays', event.target.value)}>
              {CORE_FOLLOW_UP_FREQUENCIES.map(option => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Price expectations">
            <input className={inputClass} value={form.priceExpectations} onChange={event => update('priceExpectations', event.target.value)} placeholder="What price or terms would motivate a sale?" />
          </Field>
          <Field label="Selling motivation" span>
            <textarea className={inputClass} rows={3} value={form.sellingMotivation} onChange={event => update('sellingMotivation', event.target.value)} placeholder="Why might this owner sell?" />
          </Field>
          <Field label="Barriers preventing a sale" span>
            <textarea className={inputClass} rows={2} value={form.saleBarriers} onChange={event => update('saleBarriers', event.target.value)} placeholder="Expansion, occupancy, timing, family, pricing…" />
          </Field>
          <Field label="Next action">
            <input className={inputClass} value={form.nextAction} onChange={event => update('nextAction', event.target.value)} placeholder="Call, send report, prepare BOV…" />
          </Field>
          <Field label="Next-action due date">
            <input type="date" className={inputClass} value={form.nextActionDueDate} onChange={event => update('nextActionDueDate', event.target.value)} />
          </Field>
          <Field label="Relationship notes" span>
            <textarea className={inputClass} rows={3} value={form.notes} onChange={event => update('notes', event.target.value)} />
          </Field>
          {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : profile ? 'Save Core Client' : 'Add to Core Clients'}</Button>
        </div>
      </form>
    </ModalLayout>
  );
}
