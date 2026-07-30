import { useMemo, useState } from 'react';
import {
  CORE_MOTIVATION_LEVELS,
  CORE_SELLING_TIMELINES,
} from '../data/constants';
import { coreClientAttention } from '../lib/relationshipWorkspace';
import { shiftDay } from '../lib/activityLog';
import ActionCenterModal from './ActionCenterModal';
import CoreClientModal from './CoreClientModal';
import { EmptyState, PageHeader, SearchToolbar, StatusBadge } from './ui';

const VIEW_OPTIONS = [
  ['all', 'All Active'],
  ['today', 'Due Today'],
  ['overdue', 'Overdue'],
  ['no_contact_30', 'No Contact 30d'],
  ['no_contact_60', 'No Contact 60d'],
  ['strong', 'Strong Motivation'],
  ['within_12', 'Selling Within 12m'],
  ['no_next', 'No Next Action'],
  ['recent', 'Recently Added'],
];

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function motivationVariant(value) {
  if (value === 'immediate') return 'red';
  if (value === 'strong') return 'amber';
  if (value === 'moderate') return 'blue';
  return 'slate';
}

export default function CoreClients({
  coreApi,
  contacts,
  properties,
  clients,
  taskApi,
  onLogContactAction,
  onDeleteContactAction,
  onAddToPipeline,
  onOpenContact,
}) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(null);
  const [activity, setActivity] = useState(null);
  const [filterMotivation, setFilterMotivation] = useState('all');
  const [filterTimeline, setFilterTimeline] = useState('all');
  const today = new Date().toISOString().slice(0, 10);
  const recentCutoff = shiftDay(today, -30);

  const rows = useMemo(() => coreApi.activeCoreClients.map(profile => {
    const contact = contacts.find(item => item.id === profile.contactId);
    if (!contact) return null;
    const property = properties.find(item => item.id === profile.primaryPropertyId);
    const attention = coreClientAttention(profile, contact, taskApi.tasks, today);
    const pipeline = clients.filter(client => client.contactId === contact.id);
    return { profile, contact, property, attention, pipeline };
  }).filter(Boolean), [clients, contacts, coreApi.activeCoreClients, properties, taskApi.tasks, today]);

  const filtered = rows.filter(row => {
    const { profile, contact, property, attention } = row;
    const q = search.trim().toLowerCase();
    if (q && ![
      contact.ownerName,
      contact.ownerEntity,
      contact.facilityName,
      property?.facilityName,
      property?.address,
      profile.sellingMotivation,
    ].some(value => String(value || '').toLowerCase().includes(q))) return false;
    if (filterMotivation !== 'all' && profile.motivationStrength !== filterMotivation) return false;
    if (filterTimeline !== 'all' && profile.sellingTimeline !== filterTimeline) return false;
    if (view === 'today' && !attention.dueToday) return false;
    if (view === 'overdue' && !(attention.overdue || attention.cadenceOverdue)) return false;
    if (view === 'no_contact_30' && !(attention.daysSinceContact === null || attention.daysSinceContact >= 30)) return false;
    if (view === 'no_contact_60' && !(attention.daysSinceContact === null || attention.daysSinceContact >= 60)) return false;
    if (view === 'strong' && !['strong', 'immediate'].includes(profile.motivationStrength)) return false;
    if (view === 'within_12' && !['0_3_months', '3_6_months', '6_12_months'].includes(profile.sellingTimeline)) return false;
    if (view === 'no_next' && !attention.noNextAction) return false;
    if (view === 'recent' && String(profile.createdAt || '').slice(0, 10) < recentCutoff) return false;
    return true;
  }).sort((a, b) => {
    const score = row => (row.attention.overdue ? 4 : 0)
      + (row.attention.cadenceOverdue ? 2 : 0)
      + (['strong', 'immediate'].includes(row.profile.motivationStrength) ? 1 : 0);
    return score(b) - score(a);
  });

  if (coreApi.migrationNeeded) {
    return (
      <div>
        <PageHeader title="Core Clients" badge="Connected relationship workspace" />
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-lg font-bold text-amber-300">Database migration required</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Run <code className="rounded bg-slate-950 px-1.5 py-0.5 text-amber-300">sql/core_clients_pipeline_migration.sql</code> in Supabase. It adds relationship profiles and Pipeline audit history without changing or deleting any existing CRM record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Core Clients"
        subtitle="Motivated owners who require disciplined relationship follow-up"
        badge={`${rows.length} active relationships`}
      />
      <div className="mt-5 space-y-4">
        <SearchToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search owner, property, entity, address, or motivation…"
          trailing={(
            <div className="flex flex-wrap gap-2">
              <select value={filterMotivation} onChange={event => setFilterMotivation(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                <option value="all">All motivation</option>
                {CORE_MOTIVATION_LEVELS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={filterTimeline} onChange={event => setFilterTimeline(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                <option value="all">All timelines</option>
                {CORE_SELLING_TIMELINES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}
        >
          <div className="flex gap-1 overflow-x-auto pb-1">
            {VIEW_OPTIONS.map(([value, label]) => (
              <button key={value} onClick={() => setView(value)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${view === value ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </SearchToolbar>

        {filtered.length === 0 ? (
          <EmptyState title="No Core Clients match this view" message="Adjust the saved view or add an existing Master Database contact to Core Clients." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-[1180px] w-full text-left">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Owner / Property</th>
                  <th className="px-4 py-3">Motivation</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3">Last meaningful contact</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(row => {
                  const { profile, contact, property, attention, pipeline } = row;
                  return (
                    <tr key={profile.id} className={`${attention.neglected ? 'bg-red-500/[0.04]' : ''} hover:bg-white/[0.025]`}>
                      <td className="px-4 py-3">
                        <button className="font-semibold text-white hover:text-amber-300" onClick={() => onOpenContact(contact)}>{contact.ownerName || 'Unknown owner'}</button>
                        <p className="mt-0.5 max-w-64 truncate text-xs text-slate-500">{property?.facilityName || contact.facilityName || 'No primary property'}{property?.city || property?.state ? ` · ${[property.city, property.state].filter(Boolean).join(', ')}` : ''}</p>
                        {pipeline.length > 0 && <StatusBadge variant="green" className="mt-1">{pipeline.length} Pipeline {pipeline.length === 1 ? 'opportunity' : 'opportunities'}</StatusBadge>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={motivationVariant(profile.motivationStrength)}>{CORE_MOTIVATION_LEVELS.find(option => option.value === profile.motivationStrength)?.label}</StatusBadge>
                        <p className="mt-1 max-w-56 line-clamp-2 text-xs text-slate-500">{profile.sellingMotivation || 'No motivation detail'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{CORE_SELLING_TIMELINES.find(option => option.value === profile.sellingTimeline)?.label}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-300">{formatDate(attention.lastContactAt)}</p>
                        <p className={`text-xs font-semibold ${attention.cadenceOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                          {attention.daysSinceContact === null ? 'No contact recorded' : `${attention.daysSinceContact} days ago`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`max-w-52 truncate text-sm font-semibold ${attention.overdue ? 'text-red-400' : attention.dueToday ? 'text-amber-300' : 'text-slate-300'}`}>{attention.nextTask?.title || profile.nextAction || 'No next action'}</p>
                        <p className="text-xs text-slate-500">{attention.dueDate || 'No due date'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{profile.assignedUser}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setActivity(row)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300">Activity & tasks</button>
                          <button onClick={() => setEditing(row)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white">Edit</button>
                          <button onClick={() => onAddToPipeline(contact)} className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25">Pipeline</button>
                          <button onClick={() => {
                            if (confirm(`Remove ${contact.ownerName || 'this owner'} from Core Clients? Their Master Database contact, properties, tasks, and history will remain.`)) {
                              coreApi.archiveCoreClient(contact.id);
                            }
                          }} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:text-red-400">Archive</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CoreClientModal
          contact={editing.contact}
          profile={editing.profile}
          properties={properties}
          onSave={coreApi.saveCoreClient}
          onTaskCreate={taskApi.createTask}
          onClose={() => setEditing(null)}
        />
      )}
      {activity && (
        <ActionCenterModal
          name={activity.contact.ownerName || activity.contact.facilityName || 'Core Client'}
          subtitle={activity.property?.facilityName || activity.contact.facilityName}
          mode="combined"
          actionLog={activity.contact.actionLog}
          onLogAction={entry => onLogContactAction(activity.contact.id, entry)}
          onDeleteAction={index => onDeleteContactAction(activity.contact.id, index)}
          taskContext={{ relatedType: 'contact', relatedId: activity.contact.id, relatedName: activity.contact.ownerName || 'Core Client', source: 'database' }}
          onSaveTask={taskApi.createTask}
          onClose={() => setActivity(null)}
        />
      )}
    </div>
  );
}
