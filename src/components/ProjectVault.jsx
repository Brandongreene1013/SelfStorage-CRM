import { useState, useRef } from 'react';
import { useVault, VAULT_CATEGORIES } from '../hooks/useVault';

const TYPE_META = {
  bov: { label: 'BOV', accent: 'amber', badge: 'bg-amber-500/20 border-amber-500/40 text-amber-400' },
  om:  { label: 'OM',  accent: 'blue',  badge: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
};

const fmtSize = (n) => !n ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
const isImg = (mime, name) => (mime || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(name || '');

// ── Person picker (clients + contacts) ──
function PersonPicker({ people, value, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = q.trim()
    ? people.filter(p => (p.name || '').toLowerCase().includes(q.toLowerCase()) || (p.facility || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
          <span className="text-sm text-white truncate">🔗 {value.name}{value.facility ? <span className="text-slate-500"> · {value.facility}</span> : null}</span>
          <button onClick={() => onChange(null)} className="text-slate-500 hover:text-red-400 text-xs ml-2">✕</button>
        </div>
      ) : (
        <>
          <input
            value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            placeholder="Link to a client / contact (optional)…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          />
          {open && matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-auto">
              {matches.map(p => (
                <button key={`${p.table}:${p.id}`} onClick={() => { onChange(p); setQ(''); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-all">
                  <span className="text-slate-200 font-semibold">{p.name}</span>
                  {p.facility ? <span className="text-slate-500"> · {p.facility}</span> : null}
                  <span className="text-slate-600"> · {p.table === 'clients' ? 'Client' : 'Contact'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Add Project modal ──
function AddProjectModal({ people, onSave, onClose }) {
  const [type, setType] = useState('bov');
  const [name, setName] = useState('');
  const [linked, setLinked] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-black text-white">New Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Type</label>
            <div className="flex gap-2">
              {['bov', 'om'].map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${type === t ? TYPE_META[t].badge : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'}`}>
                  {t === 'bov' ? 'BOV' : 'OM'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Project Name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onSave({ type, name: name.trim(), linked }); onClose(); } }}
              placeholder="e.g. Speedy's Boat & RV — Ocala FL"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Link to</label>
            <PersonPicker people={people} value={linked} onChange={setLinked} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-800">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => { if (name.trim()) { onSave({ type, name: name.trim(), linked }); onClose(); } }}
            disabled={!name.trim()}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${name.trim() ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

// ── A category slot (drag-drop + click upload + file list) ──
function CategorySlot({ cat, files, onUpload, onDelete }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFiles(list) {
    setBusy(true);
    for (const f of Array.from(list)) { try { await onUpload(cat.key, f); } catch (e) { alert(`Upload failed: ${e.message}`); } }
    setBusy(false);
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-slate-200">{cat.icon} {cat.label}</span>
        <span className="text-xs text-slate-600">{files.length}</span>
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all mb-3 ${drag ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 hover:border-slate-600'}`}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp,.heic,.docx,.pptx" className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <p className="text-xs text-slate-500">{busy ? 'Uploading…' : 'Drop files or click to upload'}</p>
      </div>

      {cat.key === 'photos' ? (
        <div className="grid grid-cols-3 gap-2">
          {files.map(f => (
            <div key={f.id} className="relative group rounded-lg overflow-hidden bg-slate-800 aspect-square">
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                <img src={f.url} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
              </a>
              <button onClick={() => onDelete(f)} className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white text-xs rounded px-1 opacity-0 group-hover:opacity-100 transition-all">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 group">
              <span className="text-sm flex-shrink-0">{isImg(f.mime, f.name) ? '🖼️' : /\.(xlsx|xls|csv)$/i.test(f.name) ? '📊' : /\.pdf$/i.test(f.name) ? '📄' : '📎'}</span>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 truncate flex-1">{f.name}</a>
              <span className="text-xs text-slate-600 flex-shrink-0">{fmtSize(f.size_bytes)}</span>
              <button onClick={() => onDelete(f)} className="text-slate-600 hover:text-red-400 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project detail ──
function ProjectDetail({ project, files, people, vault, onBack }) {
  const meta = TYPE_META[project.type] ?? TYPE_META.bov;
  const projFiles = files.filter(f => f.project_id === project.id);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">← All projects</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-black px-2 py-0.5 rounded-md border ${meta.badge}`}>{meta.label}</span>
            <h2 className="text-lg font-black text-white">{project.name}</h2>
          </div>
          <div className="w-72"><PersonPicker people={people} value={project.linked_id ? { table: project.linked_table, id: project.linked_id, name: project.linked_name } : null}
            onChange={(p) => vault.linkProject(project.id, p)} /></div>
        </div>
        <button onClick={() => { if (confirm(`Delete project "${project.name}" and all its files?`)) { vault.deleteProject(project.id); onBack(); } }}
          className="text-xs font-semibold text-red-500 hover:text-red-400 border border-red-900/40 bg-red-900/10 rounded-lg px-3 py-1.5 transition-all">
          Delete project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {VAULT_CATEGORIES.map(cat => (
          <CategorySlot key={cat.key} cat={cat}
            files={projFiles.filter(f => f.category === cat.key)}
            onUpload={(category, file) => vault.uploadFile(project.id, category, file)}
            onDelete={vault.deleteFile} />
        ))}
      </div>
    </div>
  );
}

// ── Project card ──
function ProjectCard({ project, files, onOpen }) {
  const meta = TYPE_META[project.type] ?? TYPE_META.bov;
  const projFiles = files.filter(f => f.project_id === project.id);
  const cover = projFiles.find(f => f.category === 'photos' && isImg(f.mime, f.name));
  return (
    <button onClick={onOpen} className="text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-black/30 group">
      <div className="h-28 bg-slate-800 flex items-center justify-center overflow-hidden">
        {cover ? <img src={cover.url} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-4xl opacity-40">{project.type === 'om' ? '📘' : '📋'}</span>}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
          <span className="text-xs text-slate-600">{projFiles.length} file{projFiles.length !== 1 ? 's' : ''}</span>
        </div>
        <p className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">{project.name}</p>
        {project.linked_name && <p className="text-xs text-amber-400/70 truncate mt-0.5">🔗 {project.linked_name}</p>}
      </div>
    </button>
  );
}

export default function ProjectVault({ people = [] }) {
  const vault = useVault();
  const [tab, setTab] = useState('bov');
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState(null);

  const openProject = vault.projects.find(p => p.id === openId);
  const visible = vault.projects.filter(p => p.type === tab);

  if (openProject) {
    return (
      <div className="max-w-5xl mx-auto">
        <ProjectDetail project={openProject} files={vault.files} people={people} vault={vault} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-900 text-lg shadow">🗄️</div>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">Project Vault</h2>
            <p className="text-xs text-slate-500">Your BOV & OM packages, models, photos, and reports — synced everywhere</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-1.5 shadow">
          <span className="text-lg leading-none font-black">+</span> Add Project
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {[{ k: 'bov', l: 'BOVs' }, { k: 'om', l: 'OMs' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${tab === t.k ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-white'}`}>
            {t.l} <span className="opacity-60">{vault.projects.filter(p => p.type === t.k).length}</span>
          </button>
        ))}
      </div>

      {!vault.loaded && <p className="text-sm text-slate-500">Loading…</p>}
      {vault.loaded && visible.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          <div className="text-5xl mb-4">🗄️</div>
          <p className="text-base font-semibold text-slate-500 mb-2">No {tab === 'bov' ? 'BOVs' : 'OMs'} yet</p>
          <p className="text-sm text-slate-600 mb-5">Create a project and drop in the package, financial model, drone photos, and reports.</p>
          <button onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow">+ Add Project</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map(p => <ProjectCard key={p.id} project={p} files={vault.files} onOpen={() => setOpenId(p.id)} />)}
        </div>
      )}

      {showAdd && (
        <AddProjectModal people={people} onClose={() => setShowAdd(false)}
          onSave={async (data) => { const p = await vault.addProject(data); if (p) setOpenId(p.id); }} />
      )}
    </div>
  );
}
