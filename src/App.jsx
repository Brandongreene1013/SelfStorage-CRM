import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useCRM } from './hooks/useCRM';
import { useDatabase } from './hooks/useDatabase';
import { useMeetings } from './hooks/useMeetings';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { useTasks } from './hooks/useTasks';
import { useOwnership } from './hooks/useOwnership';
import { useMailerLists } from './hooks/useMailerLists';
import { useCoreClients } from './hooks/useCoreClients';
const MailerLists = lazy(() => import('./components/MailerLists'));
import ClientModal from './components/ClientModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
const PipelineWorkspace = lazy(() => import('./components/PipelineWorkspace'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const CoreClients = lazy(() => import('./components/CoreClients'));
import CoreClientModal from './components/CoreClientModal';
import PipelineOpportunityModal from './components/PipelineOpportunityModal';
import SystemHealthModal from './components/SystemHealthModal';
const Calendar = lazy(() => import('./components/Calendar'));
const Database = lazy(() => import('./components/Database'));
const Analyst = lazy(() => import('./components/Analyst'));
import ErrorBoundary from './components/ErrorBoundary';
import { canonicalLeadSource } from './data/constants';
import { SearchToolbar, FilterPills, PageHeader, Button } from './components/ui';
import { downloadCrmBackup } from './lib/crmBackupExport';
import { buildCommissionSummary, formatMoney } from './lib/dealValue';
import { isMeaningfulOwnerActivity } from './lib/relationshipWorkspace';
import { withCanonicalContact } from './lib/pipelineOpportunity';
import { popCrmView, pushCrmView } from './lib/crmNavigation';
import { useCrmBackHandler, useCrmNavigation } from './navigation/useCrmNavigation';
import './index.css';

const VIEWS = ['Dashboard', 'Pipeline', 'Core Clients', 'Database', 'Mailers', 'Analyst', 'Calendar'];
const FILTERS = ['All', 'Buyer', 'Seller'];

function contactFieldsFromClient(client) {
  return {
    ownerName: client.name ?? '',
    facilityName: client.facilityName ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    leadSource: canonicalLeadSource(client.leadSource),
    age: client.age ?? null,
    address: client.address ?? '',
    mailingAddress: client.mailingAddress ?? '',
    mailingAddresses: client.mailingAddresses ?? [],
    notes: client.notes ?? '',
    leadTemp: client.leadTemp ?? '',
    nextActionType: client.nextActionType ?? '',
    nextActionDate: client.nextActionDate ?? '',
    nextActionNote: client.nextActionNote ?? '',
    ownershipGroupId: client.ownershipGroupId ?? null,
  };
}

function PipelineValueHeader({ clients }) {
  const summary = buildCommissionSummary(clients);
  const blendedFee = summary.pipelineSaleValue > 0
    ? (summary.grossPipelineCommission / summary.pipelineSaleValue) * 100
    : 0;
  const onMarketFee = summary.onMarketSaleValue > 0
    ? (summary.grossOnMarketCommission / summary.onMarketSaleValue) * 100
    : 0;

  return (
    <div className="hidden lg:grid min-w-[520px] grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
      <div className="border-r border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">Pipeline Value</p>
          <span className="text-[10px] font-bold text-slate-500">{summary.pricedPipelineDeals} priced</span>
        </div>
        <p className="mt-1 text-lg font-bold leading-none text-emerald-300">{formatMoney(summary.grossPipelineCommission) || '$0'}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {formatMoney(summary.pipelineSaleValue, { compact: true }) || '$0'} sale value
          {blendedFee > 0 ? ` · ${blendedFee.toFixed(2)}% fee` : ''}
        </p>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300/80">On-Market Potential</p>
          <span className="text-[10px] font-bold text-slate-500">{summary.pricedOnMarketDeals} priced</span>
        </div>
        <p className="mt-1 text-lg font-bold leading-none text-sky-300">{formatMoney(summary.grossOnMarketCommission) || '$0'}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {formatMoney(summary.onMarketSaleValue, { compact: true }) || '$0'} sale value
          {onMarketFee > 0 ? ` · ${onMarketFee.toFixed(2)}% fee` : ''}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { goBack, canGoBack, backLabel } = useCrmNavigation();
  const { clients, dealValueMigrationNeeded, pipelineStageRpcStatus, addClient, updateClient, deleteClient, moveClientToStage, setClientAction, logClientAction, deleteClientAction, mutateClientLog } = useCRM();
  const db = useDatabase(); // shared Database state (lifted so contacts can move to/from Clients)
  const { meetings, addMeeting, updateMeeting, deleteMeeting } = useMeetings();
  const { calendarEvents } = useCalendarEvents();
  const taskApi = useTasks(); // universal task/next-action engine (Sprint 2)
  const ownershipApi = useOwnership();
  const coreApi = useCoreClients();
  const [backupStatus, setBackupStatus] = useState('');
  const [showSystemHealth, setShowSystemHealth] = useState(false);
  const mailerApi = useMailerLists(); // mailer lists — shared so the ✉️ buttons and the Mailers tab stay in sync

  const pipelineOpportunities = useMemo(() => {
    const contactsById = new Map(db.contacts.map(contact => [contact.id, contact]));
    return clients.map(opportunity => withCanonicalContact(
      opportunity,
      contactsById.get(opportunity.contactId),
    ));
  }, [clients, db.contacts]);

  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('dbFolder') || params.has('dbList') ? 'Database' : 'Dashboard';
  });
  const [viewHistory, setViewHistory] = useState([]);
  const navigateToView = useCallback((nextView) => {
    if (nextView === view) return;
    setViewHistory(history => pushCrmView(history, view, nextView));
    setView(nextView);
  }, [view]);
  const navigateBackView = useCallback(() => {
    const destination = popCrmView(viewHistory);
    setViewHistory(destination.history);
    setView(destination.view);
  }, [viewHistory]);
  useCrmBackHandler({
    active: viewHistory.length > 0 || view !== 'Dashboard',
    onBack: navigateBackView,
    label: viewHistory.length > 0 ? `Back to ${viewHistory.at(-1)}` : 'Back to Dashboard',
    priority: 10,
  });
  const [coreClientTarget, setCoreClientTarget] = useState(null);
  const [pipelineTarget, setPipelineTarget] = useState(null);

  // ── Email "needs review" matches: build the flagged list + confirm/reassign/dismiss ──
  const reviewRecords = useMemo(() => [
    ...pipelineOpportunities.map(c => ({ table: 'clients', id: c.id, name: c.name, facility: c.facilityName, email: c.email, actionLog: c.actionLog ?? [] })),
    ...db.contacts.map(c => ({ table: 'contacts', id: c.id, name: c.ownerName, facility: c.facilityName, email: c.email, actionLog: c.actionLog ?? [] })),
  ], [pipelineOpportunities, db.contacts]);
  const reviewItems = reviewRecords.flatMap(r =>
    (r.actionLog || []).filter(e => e.needsReview).map(entry => ({ host: r, entry })));

  const mutateLog = useCallback((table, id, payload) =>
    table === 'clients' ? mutateClientLog(id, payload) : db.mutateContactLog(id, payload),
    [mutateClientLog, db]);

  const handleReviewConfirm = useCallback(async ({ host, entry }) => {
    const rec = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    if (!rec) return { error: 'The activity record changed. Refresh and try again.' };
    const log = (rec.actionLog || []).map(e => e.messageId === entry.messageId ? { ...e, needsReview: false } : e);
    const email = (!rec.email || !rec.email.trim()) && entry.email ? entry.email : undefined;
    return mutateLog(host.table, host.id, { log, email });
  }, [reviewRecords, mutateLog]);

  const handleReviewDismiss = useCallback(async ({ host, entry }) => {
    const rec = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    if (!rec) return { error: 'The activity record changed. Refresh and try again.' };
    const log = (rec.actionLog || []).filter(e => e.messageId !== entry.messageId);
    return mutateLog(host.table, host.id, { log });
  }, [reviewRecords, mutateLog]);

  const handleReviewReassign = useCallback(async ({ host, entry }, target) => {
    const src = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    const dst = reviewRecords.find(r => r.table === target.table && r.id === target.id);
    if (!src || !dst) return { error: 'The source or destination changed. Refresh and try again.' };
    if (src.table === dst.table && src.id === dst.id) {
      return handleReviewConfirm({ host, entry });
    }

    // Add first so the activity cannot be lost if the second write fails.
    const cleaned = { ...entry, needsReview: false };
    const email = (!dst.email || !dst.email.trim()) && entry.email ? entry.email : undefined;
    const destinationResult = await mutateLog(target.table, target.id, {
      log: [...(dst.actionLog || []), cleaned],
      email,
    });
    if (destinationResult?.error) return destinationResult;

    const sourceResult = await mutateLog(host.table, host.id, {
      log: (src.actionLog || []).filter(e => e.messageId !== entry.messageId),
    });
    if (!sourceResult?.error) return { ok: true };

    const rollbackResult = await mutateLog(target.table, target.id, { log: dst.actionLog || [] });
    return {
      error: rollbackResult?.error
        ? `Reassignment partially failed and needs review: ${sourceResult.error}`
        : `Reassignment was rolled back because the source could not be updated: ${sourceResult.error}`,
    };
  }, [reviewRecords, mutateLog, handleReviewConfirm]);

  // ── Move a Database contact → Clients/Pipeline (drag onto the Clients target) ──
  const handleContactToClients = useCallback((contact) => {
    if (contact) setPipelineTarget(contact);
  }, []);

  const handleMeaningfulContact = useCallback(async (contactId, entry) => {
    if (!isMeaningfulOwnerActivity(entry)) return { ok: true };
    const profile = coreApi.coreClients.find(item => item.contactId === contactId && item.status === 'active');
    if (!profile) return { ok: true };
    const profileResult = await coreApi.saveCoreClient({
      ...profile,
      lastMeaningfulContactAt: entry.at || new Date().toISOString(),
    });
    return profileResult?.error ? { error: `Core Client last contact did not update: ${profileResult.error}` } : { ok: true };
  }, [coreApi]);

  const handleLogContactAction = useCallback(async (contactId, entry) => {
    const result = await db.logContactAction(contactId, entry);
    if (result?.error) return result;
    const profileResult = await handleMeaningfulContact(contactId, entry);
    return profileResult?.error
      ? { error: `Activity saved, but ${profileResult.error}` }
      : result;
  }, [db, handleMeaningfulContact]);

  // ── Move a Client → Master Database (button on the client card) ──
  const handleClientToDatabase = useCallback(async (client) => {
    if (!client) return;
    let contactId = client.contactId;
    if (contactId) {
      const result = await db.updateContact(contactId, {
        ...contactFieldsFromClient(client),
        status: 'conversation',
      });
      if (result?.error) {
        alert(result.error);
        return;
      }
      if (db.masterListId) await db.moveContactToList(contactId, db.masterListId);
    } else {
      const existingMaster = db.contacts.find(contact =>
        contact.listId === db.masterListId &&
        contact.ownerName === client.name &&
        contact.facilityName === client.facilityName
      );
      const added = await db.addToMasterDB({
        ...contactFieldsFromClient(client),
        status: 'conversation',
      }, { mergeIfExists: true });
      if (added?.error) {
        alert(added.error);
        return;
      }
      if (added && typeof added === 'object') contactId = added.id;
      else if (existingMaster) contactId = existingMaster.id;
    }
    const result = await updateClient(client.id, {
      ...client,
      contactId: contactId ?? client.contactId ?? null,
      stageId: 10,
      status: 'conversation',
    });
    if (result?.error) alert(result.error);
  }, [db, updateClient]);

  // Dashboard → Database deep links: "Start Calling" / Attack List quick
  // actions navigate into Database and tell it what to open. Consumed once
  // by Database, then cleared here so the same action can fire again.
  const [dbEntryRequest, setDbEntryRequest] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const handleStartCallMode = useCallback((queueSource) => {
    // Opens Database's Call Mode queue picker (Sprint 6) rather than jumping
    // straight into an ambiguous All Contacts session. When Dashboard already
    // knows the exact callback bucket, it can pass the queue key through.
    setDbEntryRequest({ subView: 'callQueue', queueSource });
    navigateToView('Database');
  }, [navigateToView]);

  const handleOpenCallQueue = useCallback((queueKey) => {
    setDbEntryRequest({ subView: 'callQueue', queueKey });
    navigateToView('Database');
  }, [navigateToView]);

  const handleOpenDatabaseFilter = useCallback((statusFilter = 'all') => {
    setDbEntryRequest({ subView: 'contacts', listId: 'all', statusFilter });
    navigateToView('Database');
  }, [navigateToView]);

  const handleOpenContact = useCallback((contact) => {
    if (!contact) return;
    setDbEntryRequest({ openContactId: contact.id });
    navigateToView('Database');
  }, [navigateToView]);

  const handleOpenImportedFacility = useCallback(async (result) => {
    await db.reload?.();
    const contactIds = Object.values(result?.contactIds || {});
    setDbEntryRequest({
      subView: 'contacts',
      listId: db.masterListId || 'all',
      search: result?.facilityName || '',
      openContactId: contactIds[0] || null,
    });
    navigateToView('Database');
  }, [db, navigateToView]);

  const handleDownloadBackup = useCallback(async () => {
    setBackupStatus('exporting');
    try {
      const payload = await downloadCrmBackup();
      setBackupStatus(payload.errors.length ? 'partial' : 'done');
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (error) {
      console.error('CRM backup export failed', error);
      setBackupStatus('error');
      setTimeout(() => setBackupStatus(''), 5000);
    }
  }, []);

  // Dashboard "Move to Master DB" quick action — for a lukewarm contact that
  // shouldn't be nudging Brandon as a follow-up anymore. Parks it in the
  // Master Database list without leaving the Dashboard.
  const handleMoveContactToMasterDB = useCallback((contact) => {
    if (!contact || !db.masterListId) return;
    db.moveContactToList(contact.id, db.masterListId);
  }, [db]);

  const [editingClient, setEditingClient] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingClient, setDeletingClient] = useState(null);

  function handleEdit(client) {
    setEditingClient(client);
  }

  async function handleSaveEdit(data) {
    const linkedContact = editingClient.contactId
      ? db.contacts.find(contact => contact.id === editingClient.contactId)
      : null;
    const payload = linkedContact
      ? withCanonicalContact({ ...data, contactId: editingClient.contactId }, linkedContact)
      : data;
    const result = await updateClient(editingClient.id, payload);
    if (result?.ok) {
      setEditingClient(null);
    }
    return result;
  }

  function handleDelete(id) {
    const c = clients.find(x => x.id === id);
    setDeletingClient(c);
  }

  function confirmDelete() {
    if (deletingClient) deleteClient(deletingClient.id);
    setDeletingClient(null);
  }


  const visibleClients = pipelineOpportunities.filter(c => {
    if (filter !== 'All' && c.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.facilityName ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header — sticky app shell */}
      <header className="sticky top-0 z-30 bg-slate-900/80 supports-[backdrop-filter]:bg-slate-900/65 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_0_0_rgba(255,255,255,0.03),0_8px_24px_-12px_rgba(0,0,0,0.6)] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label={backLabel}
            title={`${backLabel} (Alt + Left Arrow)`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 text-xs font-bold text-slate-300 shadow-sm transition-all hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-700"
          >
            <span aria-hidden="true" className="text-base leading-none">←</span>
            <span className="hidden sm:inline">Back</span>
          </button>
          {/* Storage Hunters logo — Superman-inspired shield */}
          <div className="w-9 h-9 flex-shrink-0" style={{ filter: 'drop-shadow(0 2px 8px rgba(245,158,11,0.35))' }}>
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              {/* Shield shape */}
              <path d="M20 2 L36 8 L36 22 C36 31 20 38 20 38 C20 38 4 31 4 22 L4 8 Z"
                fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
              {/* Yellow upper band */}
              <path d="M20 2 L36 8 L36 14 L4 14 L4 8 Z" fill="#f59e0b" />
              {/* Red lower fill */}
              <path d="M4 14 L36 14 L36 22 C36 31 20 38 20 38 C20 38 4 31 4 22 Z" fill="#dc2626" />
              {/* "S" letter */}
              <text x="20" y="31" textAnchor="middle" fontSize="15" fontWeight="900"
                fontFamily="Arial Black, sans-serif" fill="#f59e0b" letterSpacing="-1">S</text>
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="text-[15px] font-bold text-white tracking-[-0.02em]">Storage Hunters</h1>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 tracking-wide">Investment Brokerage Platform</p>
          </div>
        </div>

        {/* Nav — segmented control */}
        <nav className="flex items-center gap-0.5 bg-slate-950/60 ring-1 ring-white/[0.06] rounded-xl p-1 overflow-x-auto max-w-full scrollbar-thin shadow-inner">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => navigateToView(v)}
              aria-current={view === v ? 'page' : undefined}
              className={`relative px-3.5 py-1.5 rounded-lg text-[13px] font-medium tracking-tight transition-colors duration-150 flex-shrink-0 ${
                view === v
                  ? 'text-white bg-slate-800 shadow-sm ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
              }`}
            >
              {v}
              {view === v && (
                <span className="absolute -bottom-px left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSystemHealth(true)}
            title="Read-only schema and migration diagnostics"
          >
            Health
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadBackup}
            disabled={backupStatus === 'exporting'}
            title="Download a JSON safety export of CRM tables"
          >
            {backupStatus === 'exporting' ? 'Exporting' : backupStatus === 'done' ? 'Exported' : backupStatus === 'partial' ? 'Partial Export' : backupStatus === 'error' ? 'Export Failed' : 'Backup'}
          </Button>
          {!['Calendar', 'Database', 'Mailers', 'Analyst', 'Core Clients'].includes(view) && (
            <Button onClick={() => setShowAddModal(true)}>
              <span className="text-lg leading-none font-bold">+</span> Add Client
            </Button>
          )}
        </div>
      </header>

      {/* Pipeline search and relationship-type filters */}
      {view === 'Pipeline' && (
        <SearchToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search name, facility, address..."
          trailing={
            <div className="ml-auto flex flex-col items-end gap-2">
              <span className="text-xs text-slate-500 hidden sm:block">
                {visibleClients.length} / {pipelineOpportunities.length} opportunities
              </span>
              <PipelineValueHeader clients={visibleClients} />
            </div>
          }
        >
          <FilterPills
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            colorFor={f => f === 'Buyer' ? 'bg-blue-600 text-white' : f === 'Seller' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'}
          />
        </SearchToolbar>
      )}

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Per-view safety net: key={view} remounts (and clears) the boundary
            on tab switch, so a crash in one view never blocks the others. */}
        <ErrorBoundary key={view} label={view}>
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Loading workspace…</div>}>
        {view === 'Dashboard' && (
          <Dashboard
            clients={pipelineOpportunities}
            contacts={db.contacts}
            meetings={meetings}
            calendarEvents={calendarEvents}
            masterListId={db.masterListId}
            onNavigateCalendar={() => navigateToView('Calendar')}
            onStartCallMode={handleStartCallMode}
            onOpenCallQueue={handleOpenCallQueue}
            onOpenDatabaseFilter={handleOpenDatabaseFilter}
            onMoveToMasterDB={handleMoveContactToMasterDB}
            onOpenContact={handleOpenContact}
            onEditClient={handleEdit}
            onLogClientAction={logClientAction}
            onDeleteClientAction={deleteClientAction}
            dealValueMigrationNeeded={dealValueMigrationNeeded}
            analyticsMigrationNeeded={db.analyticsMigrationNeeded}
            coreClients={coreApi.activeCoreClients}
            onOpenCoreClients={() => navigateToView('Core Clients')}
            taskApi={taskApi}
            review={{
              items: reviewItems,
              records: reviewRecords,
              onConfirm: handleReviewConfirm,
              onReassign: handleReviewReassign,
              onDismiss: handleReviewDismiss,
            }}
          />
        )}

        {view === 'Pipeline' && (
          <PipelineWorkspace
            clients={visibleClients}
            contacts={db.contacts}
            properties={ownershipApi.properties}
            onEdit={handleEdit}
            onStageChange={moveClientToStage}
            onLogAction={logClientAction}
            onDeleteAction={deleteClientAction}
            onMoveToDatabase={handleClientToDatabase}
            filter={filter}
            taskApi={taskApi}
          />
        )}

        {view === 'Core Clients' && (
          <CoreClients
            coreApi={coreApi}
            contacts={db.contacts}
            properties={ownershipApi.properties}
            clients={pipelineOpportunities}
            taskApi={taskApi}
            onLogContactAction={handleLogContactAction}
            onDeleteContactAction={db.deleteContactAction}
            onAddToPipeline={setPipelineTarget}
          />
        )}

        {view === 'Database' && (
          <Database
            db={db}
            onContactToClients={handleContactToClients}
            clients={pipelineOpportunities}
            clientHandlers={{
              onEdit: handleEdit,
              onDelete: handleDelete,
              onStageChange: moveClientToStage,
              onSetAction: setClientAction,
              onLogAction: logClientAction,
              onDeleteAction: deleteClientAction,
              mailerApi,
            }}
            taskApi={taskApi}
            ownershipApi={ownershipApi}
            coreApi={coreApi}
            onAddToCoreClients={setCoreClientTarget}
            onAddToPipeline={setPipelineTarget}
            contactActionLogger={handleLogContactAction}
            onMeaningfulContact={handleMeaningfulContact}
            mailerApi={mailerApi}
            entryRequest={dbEntryRequest}
            onEntryConsumed={() => setDbEntryRequest(null)}
          />
        )}

          {view === 'Mailers' && (
            <div>
              <PageHeader title="Mailer Lists" badge="Who's getting mail, and where" />
              <MailerLists mailerApi={mailerApi} contacts={db.contacts} clients={pipelineOpportunities} />
            </div>
          )}

          {view === 'Analyst' && <Analyst onOpenImportedFacility={handleOpenImportedFacility} />}

          {view === 'Calendar' && (
            <Calendar
              meetings={meetings}
              calendarEvents={calendarEvents}
              clients={pipelineOpportunities}
              onAdd={addMeeting}
              onUpdate={updateMeeting}
              onDelete={deleteMeeting}
            />
          )}
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* Modals */}
      {showAddModal && (
        <ClientModal
          client={null}
          onSave={addClient}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingClient && (
        <ClientModal
          client={editingClient}
          onSave={handleSaveEdit}
          onClose={() => setEditingClient(null)}
          mailerApi={mailerApi}
        />
      )}
      {deletingClient && (
        <DeleteConfirmModal
          clientName={deletingClient.name}
          onConfirm={confirmDelete}
          onClose={() => setDeletingClient(null)}
        />
      )}
      {coreClientTarget && (
        <CoreClientModal
          contact={db.contacts.find(contact => contact.id === coreClientTarget.id) ?? coreClientTarget}
          profile={coreApi.coreClients.find(item => item.contactId === coreClientTarget.id)}
          properties={ownershipApi.properties}
          onSave={coreApi.saveCoreClient}
          onTaskCreate={taskApi.createTask}
          pipelineRecords={pipelineOpportunities.filter(client => client.contactId === coreClientTarget.id)}
          continuumHistory={coreApi.historyForCoreClient(
            coreApi.coreClients.find(item => item.contactId === coreClientTarget.id)?.id,
          )}
          continuumMigrationNeeded={coreApi.continuumMigrationNeeded}
          onContinuumChange={coreApi.changeContinuumStage}
          taskApi={taskApi}
          onLogAction={entry => handleLogContactAction(coreClientTarget.id, entry)}
          onDeleteAction={index => db.deleteContactAction(coreClientTarget.id, index)}
          onClose={() => setCoreClientTarget(null)}
        />
      )}
      {pipelineTarget && (
        <PipelineOpportunityModal
          contact={pipelineTarget}
          properties={ownershipApi.properties}
          clients={pipelineOpportunities}
          onSave={addClient}
          onTaskCreate={taskApi.createTask}
          onRollback={deleteClient}
          onClose={() => setPipelineTarget(null)}
        />
      )}
      {showSystemHealth && (
        <SystemHealthModal
          signals={{
            taskMigrationNeeded: taskApi.migrationNeeded,
            coreMigrationNeeded: coreApi.migrationNeeded,
            continuumMigrationNeeded: coreApi.continuumMigrationNeeded,
            dealValueMigrationNeeded,
            analyticsMigrationNeeded: db.analyticsMigrationNeeded,
            mailerMigrationNeeded: mailerApi.tablesMissing || mailerApi.sentTrackingMissing,
            pipelineStageRpcStatus,
          }}
          onClose={() => setShowSystemHealth(false)}
        />
      )}
    </div>
  );
}
