import { useState, useCallback, useMemo } from 'react';
import { useCRM } from './hooks/useCRM';
import { useDatabase } from './hooks/useDatabase';
import { useMeetings } from './hooks/useMeetings';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { useDailyProgress } from './hooks/useDailyProgress';
import { useTasks } from './hooks/useTasks';
import { useOwnership } from './hooks/useOwnership';
import { useMailerLists } from './hooks/useMailerLists';
import MailerLists from './components/MailerLists';
import ClientModal from './components/ClientModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import PipelineBoard from './components/PipelineBoard';
import ClientCard from './components/ClientCard';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import Database from './components/Database';
import Analyst from './components/Analyst';
import { PIPELINE_STAGES } from './data/constants';
import { SearchToolbar, FilterPills, EmptyState, PageHeader, Button } from './components/ui';
import './index.css';

const VIEWS = ['Dashboard', 'Pipeline', 'Clients', 'Database', 'Mailers', 'Analyst', 'Calendar'];
const FILTERS = ['All', 'Buyer', 'Seller'];

export default function App() {
  const { clients, addClient, updateClient, deleteClient, moveClientToStage, setClientAction, logClientAction, deleteClientAction, mutateClientLog } = useCRM();
  const db = useDatabase(); // shared Database state (lifted so contacts can move to/from Clients)
  const { meetings, addMeeting, updateMeeting, deleteMeeting } = useMeetings();
  const { calendarEvents } = useCalendarEvents();
  const { increment: incrementProgress } = useDailyProgress();
  const taskApi = useTasks(); // universal task/next-action engine (Sprint 2)
  const ownershipApi = useOwnership();
  const mailerApi = useMailerLists(); // mailer lists — shared so the ✉️ buttons and the Mailers tab stay in sync

  // CRM meetings + synced Outlook calendar events, for the dashboard widget
  const allMeetings = [...meetings, ...calendarEvents];
  const [view, setView] = useState('Dashboard');

  // ── Email "needs review" matches: build the flagged list + confirm/reassign/dismiss ──
  const reviewRecords = useMemo(() => [
    ...clients.map(c => ({ table: 'clients', id: c.id, name: c.name, facility: c.facilityName, email: c.email, actionLog: c.actionLog ?? [] })),
    ...db.contacts.map(c => ({ table: 'contacts', id: c.id, name: c.ownerName, facility: c.facilityName, email: c.email, actionLog: c.actionLog ?? [] })),
  ], [clients, db.contacts]);
  const reviewItems = reviewRecords.flatMap(r =>
    (r.actionLog || []).filter(e => e.needsReview).map(entry => ({ host: r, entry })));

  const mutateLog = useCallback((table, id, payload) =>
    table === 'clients' ? mutateClientLog(id, payload) : db.mutateContactLog(id, payload),
    [mutateClientLog, db]);

  const handleReviewConfirm = useCallback(({ host, entry }) => {
    const rec = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    if (!rec) return;
    const log = (rec.actionLog || []).map(e => e.messageId === entry.messageId ? { ...e, needsReview: false } : e);
    const email = (!rec.email || !rec.email.trim()) && entry.email ? entry.email : undefined;
    mutateLog(host.table, host.id, { log, email });
  }, [reviewRecords, mutateLog]);

  const handleReviewDismiss = useCallback(({ host, entry }) => {
    const rec = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    if (!rec) return;
    const log = (rec.actionLog || []).filter(e => e.messageId !== entry.messageId);
    mutateLog(host.table, host.id, { log });
  }, [reviewRecords, mutateLog]);

  const handleReviewReassign = useCallback(({ host, entry }, target) => {
    const src = reviewRecords.find(r => r.table === host.table && r.id === host.id);
    const dst = reviewRecords.find(r => r.table === target.table && r.id === target.id);
    if (!src || !dst) return;
    // remove from source
    mutateLog(host.table, host.id, { log: (src.actionLog || []).filter(e => e.messageId !== entry.messageId) });
    // add to target (cleared flag) + backfill address if target has none
    const cleaned = { ...entry, needsReview: false };
    const email = (!dst.email || !dst.email.trim()) && entry.email ? entry.email : undefined;
    mutateLog(target.table, target.id, { log: [...(dst.actionLog || []), cleaned], email });
  }, [reviewRecords, mutateLog]);

  // ── Move a Database contact → Clients/Pipeline (drag onto the Clients target) ──
  const handleContactToClients = useCallback((contact) => {
    if (!contact) return;
    addClient({
      name: contact.ownerName || contact.facilityName || 'Unknown',
      type: 'Seller',
      propertyType: 'Self-Storage',
      facilityName: contact.facilityName ?? '',
      address: contact.address ?? '',
      mailingAddress: contact.mailingAddress ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      notes: contact.notes ?? '',
      stageId: 1,
      leadTemp: contact.leadTemp ?? '',
      nextActionType: contact.nextActionType ?? '',
      nextActionDate: contact.nextActionDate ?? '',
      nextActionNote: contact.nextActionNote ?? '',
      ownershipGroupId: contact.ownershipGroupId ?? null,
    });
    db.deleteContact(contact.id);
  }, [addClient, db]);

  // ── Move a Client → Master Database (button on the client card) ──
  const handleClientToDatabase = useCallback(async (client) => {
    if (!client) return;
    await db.addToMasterDB({
      ownerName: client.name ?? '',
      facilityName: client.facilityName ?? '',
      phone: client.phone ?? '',
      email: client.email ?? '',
      address: client.address ?? '',
      mailingAddress: client.mailingAddress ?? '',
      notes: client.notes ?? '',
      status: 'conversation',
      leadTemp: client.leadTemp ?? '',
      nextActionType: client.nextActionType ?? '',
      nextActionDate: client.nextActionDate ?? '',
      nextActionNote: client.nextActionNote ?? '',
      ownershipGroupId: client.ownershipGroupId ?? null,
    });
    deleteClient(client.id);
  }, [db, deleteClient]);

  // Dashboard → Database deep links: "Start Calling" / Attack List quick
  // actions navigate into Database and tell it what to open. Consumed once
  // by Database, then cleared here so the same action can fire again.
  const [dbEntryRequest, setDbEntryRequest] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(0);

  const handleStartCallMode = useCallback((queueSource) => {
    // Opens Database's Call Mode queue picker (Sprint 6) rather than jumping
    // straight into an ambiguous All Contacts session. When Dashboard already
    // knows the exact callback bucket, it can pass the queue key through.
    setDbEntryRequest({ subView: 'callQueue', queueSource });
    setView('Database');
  }, []);

  const handleOpenCallQueue = useCallback((queueKey) => {
    setDbEntryRequest({ subView: 'callQueue', queueKey });
    setView('Database');
  }, []);

  const handleOpenDatabaseFilter = useCallback((statusFilter = 'all') => {
    setDbEntryRequest({ subView: 'contacts', listId: 'all', statusFilter });
    setView('Database');
  }, []);

  const handleOpenContact = useCallback((contact) => {
    if (!contact) return;
    setDbEntryRequest({ openContactId: contact.id });
    setView('Database');
  }, []);

  // Dashboard "Move to Master DB" quick action — for a lukewarm contact that
  // shouldn't be nudging Brandon as a follow-up anymore. Parks it in the
  // Master Database list without leaving the Dashboard.
  const handleMoveContactToMasterDB = useCallback((contact) => {
    if (!contact || !db.masterListId) return;
    db.moveContactToList(contact.id, db.masterListId);
  }, [db]);

  // When a call is logged from Database, auto-increment dashboard counters
  const handleCallLogged = useCallback((outcome) => {
    incrementProgress('calls');
    if (outcome === 'conversation') incrementProgress('conversations');
    if (outcome === 'appointment') incrementProgress('firstAppts');
    // Any non-fresh outcome means we reached a facility (got through)
    if (outcome === 'conversation' || outcome === 'appointment' || outcome === 'voicemail') {
      incrementProgress('facilities');
    }
  }, [incrementProgress]);

  const [editingClient, setEditingClient] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingClient, setDeletingClient] = useState(null);

  function handleEdit(client) {
    setEditingClient(client);
  }

  function handleSaveEdit(data) {
    updateClient(editingClient.id, data);
    setEditingClient(null);
  }

  function handleDelete(id) {
    const c = clients.find(x => x.id === id);
    setDeletingClient(c);
  }

  function confirmDelete() {
    if (deletingClient) deleteClient(deletingClient.id);
    setDeletingClient(null);
  }


  const visibleClients = clients.filter(c => {
    if (filter !== 'All' && c.type !== filter) return false;
    if (stageFilter !== 0 && c.stageId !== stageFilter) return false;
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
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Storage Hero logo — Superman-inspired shield */}
          <div className="w-10 h-10 flex-shrink-0" style={{ filter: 'drop-shadow(0 2px 6px rgba(245,158,11,0.5))' }}>
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
          <div>
            <h1 className="text-base font-black text-white leading-tight tracking-tight">Storage Hero</h1>
            <p className="text-xs text-slate-500 leading-tight">Investment Brokerage Pipeline</p>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-1 bg-slate-800 rounded-xl p-1 overflow-x-auto max-w-full scrollbar-thin">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
                view === v
                  ? 'bg-amber-500 text-slate-900 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </nav>

        {!['Calendar', 'Database', 'Mailers', 'Analyst'].includes(view) && (
          <Button onClick={() => setShowAddModal(true)}>
            <span className="text-lg leading-none font-black">+</span> Add Client
          </Button>
        )}
        {['Calendar', 'Database', 'Mailers', 'Analyst'].includes(view) && (
          <div className="w-[110px]" />
        )}
      </header>

      {/* Filter bar — only for Pipeline / Clients */}
      {(view === 'Pipeline' || view === 'Clients') && (
        <SearchToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search name, facility, address..."
          trailing={
            <>
              {view === 'Clients' && (
                <select
                  value={stageFilter}
                  onChange={e => setStageFilter(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                >
                  <option value={0}>All Stages</option>
                  {PIPELINE_STAGES.map(s => (
                    <option key={s.id} value={s.id}>{s.id}. {s.label}</option>
                  ))}
                </select>
              )}
              <span className="ml-auto text-xs text-slate-500 hidden sm:block">
                {visibleClients.length} / {clients.length} clients
              </span>
            </>
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
        {view === 'Dashboard' && (
          <Dashboard
            clients={clients}
            contacts={db.contacts}
            meetings={allMeetings}
            masterListId={db.masterListId}
            onNavigateCalendar={() => setView('Calendar')}
            onStartCallMode={handleStartCallMode}
            onOpenCallQueue={handleOpenCallQueue}
            onOpenDatabaseFilter={handleOpenDatabaseFilter}
            onMoveToMasterDB={handleMoveContactToMasterDB}
            onOpenContact={handleOpenContact}
            onEditClient={handleEdit}
            onLogClientAction={logClientAction}
            onDeleteClientAction={deleteClientAction}
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
          <div>
            <PageHeader title="Pipeline Board" badge="Drag cards to move between stages" />
            <PipelineBoard
              clients={visibleClients}
              onEdit={handleEdit}
              onStageChange={moveClientToStage}
              onLogAction={logClientAction}
              onDeleteAction={deleteClientAction}
              onMoveToDatabase={handleClientToDatabase}
              filter={filter}
              taskApi={taskApi}
            />
          </div>
        )}

        {view === 'Clients' && (
          <div>
            <PageHeader title="All Clients" />
            {visibleClients.length === 0 ? (
              <EmptyState
                message="No clients match your filters."
                action={
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 text-amber-500 hover:text-amber-400 text-sm font-semibold"
                  >
                    + Add your first client
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleClients.map(c => (
                  <ClientCard
                    key={c.id}
                    client={c}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStageChange={moveClientToStage}
                    onSetAction={setClientAction}
                    onMoveToDatabase={handleClientToDatabase}
                    onLogAction={logClientAction}
                    onDeleteAction={deleteClientAction}
                    taskApi={taskApi}
                    ownershipApi={ownershipApi}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'Database' && (
          <Database
            db={db}
            onCallLogged={handleCallLogged}
            onContactToClients={handleContactToClients}
            clients={clients}
            clientHandlers={{
              onEdit: handleEdit,
              onDelete: handleDelete,
              onStageChange: moveClientToStage,
              onSetAction: setClientAction,
              onLogAction: logClientAction,
              onDeleteAction: deleteClientAction,
            }}
            taskApi={taskApi}
            mailerApi={mailerApi}
            entryRequest={dbEntryRequest}
            onEntryConsumed={() => setDbEntryRequest(null)}
          />
        )}

        {view === 'Mailers' && (
          <div>
            <PageHeader title="Mailer Lists" badge="Who's getting mail, and where" />
            <MailerLists mailerApi={mailerApi} contacts={db.contacts} clients={clients} />
          </div>
        )}

        {view === 'Analyst' && <Analyst />}

        {view === 'Calendar' && (
          <Calendar
            meetings={meetings}
            calendarEvents={calendarEvents}
            clients={clients}
            onAdd={addMeeting}
            onUpdate={updateMeeting}
            onDelete={deleteMeeting}
          />
        )}
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
    </div>
  );
}
