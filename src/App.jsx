import { useState } from 'react';
import { useCRM } from './hooks/useCRM';
import { useMeetings } from './hooks/useMeetings';
import ClientModal from './components/ClientModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import PipelineBoard from './components/PipelineBoard';
import ClientCard from './components/ClientCard';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import { PIPELINE_STAGES } from './data/constants';
import './index.css';

const VIEWS = ['Dashboard', 'Pipeline', 'Clients', 'Calendar'];
const FILTERS = ['All', 'Buyer', 'Seller'];

export default function App() {
  const { clients, addClient, updateClient, deleteClient, moveClientToStage } = useCRM();
  const { meetings, addMeeting, updateMeeting, deleteMeeting } = useMeetings();

  const [view, setView] = useState('Dashboard');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(0);

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
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-slate-900 text-xl shadow">
            🏢
          </div>
          <div>
            <h1 className="text-base font-black text-white leading-tight tracking-tight">SelfStorage CRM</h1>
            <p className="text-xs text-slate-500 leading-tight">Investment Brokerage Pipeline</p>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                view === v
                  ? 'bg-amber-500 text-slate-900 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </nav>

        {view !== 'Calendar' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow"
          >
            <span className="text-lg leading-none font-black">+</span> Add Client
          </button>
        )}
        {view === 'Calendar' && (
          <div className="w-[110px]" />
        )}
      </header>

      {/* Filter bar — only for Pipeline / Clients */}
      {(view === 'Pipeline' || view === 'Clients') && (
        <div className="bg-slate-900/60 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  filter === f
                    ? f === 'Buyer'
                      ? 'bg-blue-600 text-white'
                      : f === 'Seller'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, facility, address..."
            className="flex-1 min-w-[180px] max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />

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
        </div>
      )}

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {view === 'Dashboard' && (
          <Dashboard clients={clients} />
        )}

        {view === 'Pipeline' && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-black text-white">Pipeline Board</h2>
              <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
                Drag cards to move between stages
              </span>
            </div>
            <PipelineBoard
              clients={visibleClients}
              onEdit={handleEdit}
              onStageChange={moveClientToStage}
              filter={filter}
            />
          </div>
        )}

        {view === 'Clients' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-white">All Clients</h2>
            </div>
            {visibleClients.length === 0 ? (
              <div className="text-center py-20 text-slate-600">
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-sm">No clients match your filters.</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 text-amber-500 hover:text-amber-400 text-sm font-semibold"
                >
                  + Add your first client
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleClients.map(c => (
                  <ClientCard
                    key={c.id}
                    client={c}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStageChange={moveClientToStage}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'Calendar' && (
          <Calendar
            meetings={meetings}
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
