import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clipboardImageFiles,
  createSalesforceImport,
  loadSalesforceImport,
  loadStoredImportCredentials,
  salesforceImportAction,
  storeImportCredentials,
  uploadSalesforceImage,
} from '../../lib/salesforceImportClient';

const FACILITY_FIELDS = [
  ['name', 'Facility name'], ['recordType', 'Record type'], ['propertyType', 'Property type'],
  ['propertyClass', 'Class'], ['streetAddress', 'Street address'], ['city', 'City'],
  ['state', 'State'], ['zipCode', 'ZIP'], ['county', 'County'], ['website', 'Website'],
  ['propertyGroup', 'Property group'], ['yearBuilt', 'Year built'], ['facilityPhone', 'Facility phone'],
  ['units', 'Units'], ['rentableSqft', 'Rentable SF'], ['acreage', 'Acreage'],
  ['occupancy', 'Occupancy %'], ['expansionPotential', 'Expansion potential'], ['notes', 'Notes'],
];
const CONTACT_FIELDS = [
  ['displayName', 'Name'], ['firstName', 'First'], ['middleName', 'Middle'], ['lastName', 'Last'],
  ['jobTitle', 'Title'], ['role', 'Role'], ['company', 'Company'], ['email', 'Email'],
  ['primaryPhone', 'Primary phone'], ['secondaryPhone', 'Secondary phone'],
  ['mailingAddress', 'Mailing address'], ['sourceRecordId', 'Salesforce ID'], ['notes', 'Notes'],
];
const COMPANY_FIELDS = [
  ['name', 'Company name'], ['companyType', 'Company type'], ['website', 'Website'],
  ['mainPhone', 'Main phone'], ['mailingAddress', 'Mailing address'],
  ['sourceRecordId', 'Salesforce ID'], ['notes', 'Notes'],
];
const HISTORY_FIELDS = [
  ['lastSaleDate', 'Last sale date'], ['lastSalePrice', 'Last sale price'],
  ['lastSalePricePsf', 'Last sale $/SF'], ['lastCapRate', 'Last cap rate'],
  ['previousSaleNotes', 'Sale notes'],
];
const RELATIONSHIP_TYPES = [
  'facility_primary_owner_contact', 'facility_secondary_owner_contact', 'facility_owner_company',
  'facility_management_company', 'contact_company', 'company_parent_company', 'other',
];

const blankDecision = () => ({ facility: {}, contacts: {}, companies: {} });
const fieldValue = field => field?.value ?? '';
const titleCase = text => String(text || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function Confidence({ field }) {
  if (!field) return null;
  const tone = field.confidence >= .85 ? 'text-emerald-400' : field.confidence >= .6 ? 'text-amber-400' : 'text-rose-400';
  return (
    <span title={field.evidenceText || 'No visible evidence captured'} className={`text-[10px] ${tone}`}>
      {Math.round((field.confidence || 0) * 100)}%{field.screenshotId ? ` · shot ${String(field.screenshotId).slice(0, 4)}` : ''}
    </span>
  );
}

function FieldGrid({ entity, fields, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(([key, label]) => (
        <label key={key} className={`${key === 'notes' || key === 'previousSaleNotes' ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
          <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
            {label}<Confidence field={entity?.[key]} />
          </span>
          <input
            value={fieldValue(entity?.[key])}
            onChange={event => onChange(key, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
          />
          {entity?.[key]?.evidenceText && (
            <span className="mt-1 block truncate text-[10px] text-slate-600" title={entity[key].evidenceText}>
              Evidence: {entity[key].evidenceText}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

function DuplicatePicker({ title, matches, value, onChange, allowSkip = true }) {
  if (!matches?.length) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs font-bold text-amber-300">Possible duplicate: {title}</p>
      <select
        value={value?.action ? `${value.action}:${value.existingId || ''}` : ''}
        onChange={event => {
          const [action, existingId] = event.target.value.split(':');
          onChange(action ? { action, existingId: existingId || null } : {});
        }}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
      >
        <option value="">Choose what to do…</option>
        <option value="create:">Create a separate new record</option>
        {matches.map(match => (
          <Fragment key={match.existingId}>
            <option key={`${match.existingId}-use`} value={`use_existing:${match.existingId}`}>
              Use {match.display.name || match.display.facilityName || 'existing record'} ({match.strength}: {match.reasons.join(', ')})
            </option>
            <option key={`${match.existingId}-fill`} value={`update_blank:${match.existingId}`}>
              Use it and fill blank fields
            </option>
          </Fragment>
        ))}
        {allowSkip && <option value="skip:">Skip this record</option>}
      </select>
    </div>
  );
}

function EntitySection({ title, entity, fields, onChange, selected, onSelected, onRemove, duplicate }) {
  return (
    <section className={`rounded-xl border p-4 ${selected === false ? 'border-slate-800 opacity-60' : 'border-slate-700 bg-slate-900/40'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="font-bold text-white">{title}</h4>
        {onSelected && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={selected} onChange={event => onSelected(event.target.checked)} />
            Import
          </label>
        )}
        {onRemove && <button onClick={onRemove} className="text-xs text-rose-400">Remove</button>}
      </div>
      <FieldGrid entity={entity} fields={fields} onChange={onChange} />
      {duplicate}
    </section>
  );
}

export default function SalesforceScreenshotImport({ initialFiles = [], onInitialFilesConsumed, onOpenFacility }) {
  const [credentials, setCredentials] = useState(null);
  const [session, setSession] = useState(null);
  const [draft, setDraft] = useState(null);
  const [decisions, setDecisions] = useState(blankDecision);
  const [addressOverride, setAddressOverride] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pasteHint, setPasteHint] = useState('Paste Salesforce screenshots with Ctrl+V');
  const fileRef = useRef(null);
  const pasteAreaRef = useRef(null);
  const idempotencyRef = useRef(crypto.randomUUID());

  const syncSession = useCallback(next => {
    setSession(next);
    setDraft(next?.draft || null);
  }, []);

  useEffect(() => {
    const stored = loadStoredImportCredentials();
    if (!stored) return;
    setCredentials(stored);
    loadSalesforceImport(stored).then(result => syncSession(result.session)).catch(() => {
      storeImportCredentials(null);
      setCredentials(null);
    });
  }, [syncSession]);

  const ensureSession = useCallback(async method => {
    if (credentials) return credentials;
    const created = await createSalesforceImport(method);
    const next = { importId: created.session.id, capabilityToken: created.capabilityToken };
    setCredentials(next);
    syncSession(created.session);
    return next;
  }, [credentials, syncSession]);

  const addFiles = useCallback(async (files, method = 'uploaded_screenshot') => {
    const images = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    if (!images.length) {
      setPasteHint('No image found. Copy the screenshot itself, then press Ctrl+V here.');
      return;
    }
    setBusy('Uploading screenshots…');
    setError('');
    try {
      const creds = await ensureSession(method);
      let latest;
      for (const file of images) {
        latest = await uploadSalesforceImage(creds, file);
        syncSession(latest.session);
      }
      setPasteHint(`${latest?.session?.images?.length || images.length} screenshot(s) ready`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }, [ensureSession, syncSession]);

  useEffect(() => {
    pasteAreaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!initialFiles.length) return;
    onInitialFilesConsumed?.();
    addFiles(initialFiles, 'clipboard_screenshot');
  }, [addFiles, initialFiles, onInitialFilesConsumed]);

  useEffect(() => {
    const paste = event => {
      const target = event.target;
      if (target?.matches?.('input, textarea, [contenteditable="true"]')) return;
      const files = clipboardImageFiles(event.clipboardData);
      if (files.length) event.preventDefault();
      addFiles(files, 'clipboard_screenshot');
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [addFiles]);

  const updateField = (section, key, value, index = null) => {
    setDraft(current => {
      const next = structuredClone(current);
      const target = index == null ? next[section] : next[section][index];
      target[key] = { ...target[key], value, normalizedValue: value, confidence: 1, status: 'user_edited' };
      return next;
    });
  };

  const addEntity = (section, fields) => setDraft(current => {
    const next = structuredClone(current);
    const entity = Object.fromEntries(fields.map(([key]) => [key, {
      value: null, rawValue: null, normalizedValue: null, confidence: 0,
      screenshotId: null, evidenceText: null, status: 'user_edited',
    }]));
    entity.tempId = crypto.randomUUID();
    entity.selected = true;
    if (section === 'contacts') entity.companyTempId = null;
    next[section].push(entity);
    return next;
  });

  const act = async (action, payload = {}, label = '') => {
    setBusy(label);
    setError('');
    try {
      const result = await salesforceImportAction(action, { ...credentials, ...payload });
      if (result.session) syncSession(result.session);
      return result;
    } catch (err) {
      setError([err.message, ...(err.validationErrors || [])].join(' '));
      throw err;
    } finally {
      setBusy('');
    }
  };

  const reset = async reject => {
    if (reject && credentials && session?.status !== 'imported') {
      try { await salesforceImportAction('reject', credentials); } catch { /* expired sessions are safe to forget */ }
    }
    storeImportCredentials(null);
    setCredentials(null);
    setSession(null);
    setDraft(null);
    setDecisions(blankDecision());
    setAddressOverride(false);
    setError('');
    setPasteHint('Paste Salesforce screenshots with Ctrl+V');
    idempotencyRef.current = crypto.randomUUID();
  };

  const analyze = () => act('analyze', {}, 'Reading screenshots…');
  const saveDraft = () => act('save-draft', { draft }, 'Saving review…');
  const reorder = (index, direction) => {
    const ids = session.images.map(image => image.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    act('reorder', { imageIds: ids }, 'Reordering…').catch(() => {});
  };
  const commit = async () => {
    const result = await act('commit', {
      draft,
      duplicateDecisions: decisions,
      addressOverride,
      multiplePropertiesConfirmed: multipleConfirmed,
      idempotencyKey: idempotencyRef.current,
    }, 'Importing approved records…');
    return result;
  };

  const warningNeedsMultipleConfirmation = useMemo(
    () => draft?.warnings?.some(warning => warning.code === 'multiple_properties'),
    [draft],
  );
  const [multipleConfirmed, setMultipleConfirmed] = useState(false);

  if (session?.status === 'imported') {
    const result = session.importResult || {};
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <div className="text-3xl">✓</div>
        <h3 className="mt-2 text-lg font-bold text-white">Salesforce record imported</h3>
        <p className="mt-1 text-sm text-slate-400">The approved facility, contacts, companies, and relationships are now in the CRM.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={() => onOpenFacility?.(result)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950">Open facility</button>
          <button onClick={() => reset(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Import another</button>
        </div>
      </div>
    );
  }

  if (draft && session?.status === 'review_required') {
    const duplicates = draft.duplicateCandidates || {};
    return (
      <div className="space-y-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Review before anything enters the CRM</h3>
            <p className="text-xs text-slate-500">Every extracted value is editable. Hover confidence labels to see the screenshot evidence.</p>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            Overall confidence {Math.round((draft.overallConfidence || 0) * 100)}%
          </span>
        </div>
        <details className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-400">Review source screenshots ({session.images.length})</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {session.images.map((image, index) => (
              <a key={image.id} href={image.previewUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-700">
                <img src={image.previewUrl} alt={`Source screenshot ${index + 1}`} className="h-32 w-full object-cover object-top" />
                <span className="block p-2 text-[10px] text-slate-500">Screenshot {index + 1} · open full size</span>
              </a>
            ))}
          </div>
        </details>
        {draft.warnings?.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            {draft.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-200">• {warning.message}</p>)}
            {warningNeedsMultipleConfirmation && (
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-100">
                <input type="checkbox" checked={multipleConfirmed} onChange={event => setMultipleConfirmed(event.target.checked)} />
                I reviewed the warning that these screenshots may contain more than one property.
              </label>
            )}
          </div>
        )}
        {draft.facility && (
          <EntitySection
            title="Facility"
            entity={draft.facility}
            fields={FACILITY_FIELDS}
            onChange={(key, value) => updateField('facility', key, value)}
            duplicate={<DuplicatePicker allowSkip={false} title={fieldValue(draft.facility.name)} matches={duplicates.facility} value={decisions.facility} onChange={value => setDecisions(current => ({ ...current, facility: value }))} />}
          />
        )}
        {!fieldValue(draft.facility?.streetAddress) && (
          <label className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
            <input type="checkbox" checked={addressOverride} onChange={event => setAddressOverride(event.target.checked)} />
            Import this facility even though its address is missing.
          </label>
        )}
        {draft.contacts.map((contact, index) => (
          <EntitySection
            key={contact.tempId}
            title={`Contact ${index + 1}: ${fieldValue(contact.displayName) || 'Unnamed'}`}
            entity={contact}
            fields={CONTACT_FIELDS}
            selected={contact.selected}
            onSelected={selected => setDraft(current => {
              const next = structuredClone(current); next.contacts[index].selected = selected; return next;
            })}
            onRemove={() => setDraft(current => {
              const next = structuredClone(current);
              next.contacts.splice(index, 1);
              next.relationships = next.relationships.filter(item => item.contactTempId !== contact.tempId);
              return next;
            })}
            onChange={(key, value) => updateField('contacts', key, value, index)}
            duplicate={<DuplicatePicker title={fieldValue(contact.displayName)} matches={duplicates.contacts?.[contact.tempId]} value={decisions.contacts[contact.tempId]} onChange={value => setDecisions(current => ({ ...current, contacts: { ...current.contacts, [contact.tempId]: value } }))} />}
          />
        ))}
        <button onClick={() => addEntity('contacts', CONTACT_FIELDS)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">+ Add contact</button>
        {draft.companies.map((company, index) => (
          <EntitySection
            key={company.tempId}
            title={`Company ${index + 1}: ${fieldValue(company.name) || 'Unnamed'}`}
            entity={company}
            fields={COMPANY_FIELDS}
            selected={company.selected}
            onSelected={selected => setDraft(current => {
              const next = structuredClone(current); next.companies[index].selected = selected; return next;
            })}
            onRemove={() => setDraft(current => {
              const next = structuredClone(current);
              next.companies.splice(index, 1);
              next.relationships = next.relationships.filter(item => item.companyTempId !== company.tempId);
              return next;
            })}
            onChange={(key, value) => updateField('companies', key, value, index)}
            duplicate={<DuplicatePicker title={fieldValue(company.name)} matches={duplicates.companies?.[company.tempId]} value={decisions.companies[company.tempId]} onChange={value => setDecisions(current => ({ ...current, companies: { ...current.companies, [company.tempId]: value } }))} />}
          />
        ))}
        <button onClick={() => addEntity('companies', COMPANY_FIELDS)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">+ Add company</button>
        <EntitySection title="Property history" entity={draft.propertyHistory} fields={HISTORY_FIELDS} onChange={(key, value) => updateField('propertyHistory', key, value)} />
        {(
          <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <h4 className="mb-3 font-bold text-white">Relationships found</h4>
            <div className="space-y-2">
              {draft.relationships.map((relationship, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                  <select value={relationship.relationshipType} onChange={event => setDraft(current => {
                    const next = structuredClone(current); next.relationships[index].relationshipType = event.target.value; return next;
                  })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                    {RELATIONSHIP_TYPES.map(type => <option key={type} value={type}>{titleCase(type)}</option>)}
                  </select>
                  <select value={relationship.contactTempId || ''} onChange={event => setDraft(current => {
                    const next = structuredClone(current); next.relationships[index].contactTempId = event.target.value || null; return next;
                  })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                    <option value="">No contact</option>
                    {draft.contacts.map(item => <option key={item.tempId} value={item.tempId}>{fieldValue(item.displayName) || 'Unnamed contact'}</option>)}
                  </select>
                  <select value={relationship.companyTempId || ''} onChange={event => setDraft(current => {
                    const next = structuredClone(current); next.relationships[index].companyTempId = event.target.value || null; return next;
                  })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                    <option value="">No company</option>
                    {draft.companies.map(item => <option key={item.tempId} value={item.tempId}>{fieldValue(item.name) || 'Unnamed company'}</option>)}
                  </select>
                  <input value={relationship.role || ''} onChange={event => setDraft(current => {
                    const next = structuredClone(current); next.relationships[index].role = event.target.value; return next;
                  })} placeholder="Role" className="ml-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
                  <button onClick={() => setDraft(current => {
                    const next = structuredClone(current); next.relationships.splice(index, 1); return next;
                  })} className="text-rose-400">Remove</button>
                </div>
              ))}
            </div>
            <button onClick={() => setDraft(current => {
              const next = structuredClone(current);
              next.relationships.push({
                relationshipType: 'other', facilityTempId: 'facility-1',
                contactTempId: next.contacts[0]?.tempId || null,
                companyTempId: next.companies[0]?.tempId || null,
                role: '', confidence: 1, evidenceText: 'Added during user review', screenshotId: null,
              });
              return next;
            })} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300">+ Add relationship</button>
          </section>
        )}
        {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
        <p className="text-right text-sm font-semibold text-white">Are you sure you want to add this facility to the master database?</p>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-800 bg-slate-950/95 py-4">
          <button disabled={!!busy} onClick={() => reset(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">No, Cancel</button>
          <button disabled={!!busy} onClick={() => saveDraft().catch(() => {})} className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-300">Save review</button>
          <button
            disabled={!!busy || (warningNeedsMultipleConfirmation && !multipleConfirmed)}
            onClick={() => commit().catch(() => {})}
            className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy || 'Yes, Add Facility'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={pasteAreaRef}
        tabIndex={0}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
        onKeyDown={event => {
          if (event.key === 'Enter' && session?.images?.length && !busy) {
            event.preventDefault();
            analyze().catch(() => {});
          }
        }}
        className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/35 p-8 text-center transition hover:border-amber-500/50"
      >
        <div className="text-3xl">▣</div>
        <h3 className="mt-2 font-bold text-white">Salesforce screenshot import</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Copy one or several screenshots from Salesforce and press Ctrl+V or Cmd+V anywhere in Analyst. Nothing is written to the CRM until you review and approve it.
        </p>
        <p className="mt-3 text-xs font-semibold text-amber-300">{pasteHint}</p>
        <button onClick={() => fileRef.current?.click()} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:border-amber-500/50">Choose screenshots</button>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => addFiles(event.target.files)} />
      </div>
      {session?.images?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {session.images.map((image, index) => (
            <div key={image.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
              <a href={image.previewUrl} target="_blank" rel="noreferrer"><img src={image.previewUrl} alt={`Salesforce screenshot ${index + 1}`} className="h-36 w-full object-cover object-top" /></a>
              <div className="flex items-center gap-2 p-2 text-[10px] text-slate-500">
                <span>#{index + 1} · {image.width}×{image.height}</span>
                <button disabled={index === 0} onClick={() => reorder(index, -1)} className="ml-auto disabled:opacity-25" aria-label="Move screenshot earlier">←</button>
                <button disabled={index === session.images.length - 1} onClick={() => reorder(index, 1)} className="disabled:opacity-25" aria-label="Move screenshot later">→</button>
                <button onClick={() => act('remove-image', { imageId: image.id }, 'Removing…').catch(() => {})} className="text-rose-400">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        {session && <button disabled={!!busy} onClick={() => reset(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400">Clear</button>}
        {session && <button disabled={!!busy} onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Add another screenshot</button>}
        <button disabled={!!busy || !session?.images?.length} onClick={() => analyze().catch(() => {})} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">
          {busy || 'Create Facility Card'}
        </button>
      </div>
    </div>
  );
}
