import { useState } from 'react';
import { parseImportData } from '../hooks/useDatabase';

const SOURCES = ['Internal DB', 'CoStar', 'Tractiq', 'Other'];

export default function ImportListModal({ onImport, onClose }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('Internal DB');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  function handlePreview() {
    if (!rawText.trim()) { setError('Paste your data first'); return; }
    const result = parseImportData(rawText);
    if (result.contacts.length === 0) {
      setError('Could not parse any contacts. Make sure first row has column headers.');
      return;
    }
    setError('');
    setPreview(result);
  }

  function handleImport() {
    if (!name.trim()) { setError('Give this list a name'); return; }
    onImport(name.trim(), source, rawText);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-black text-white">Import Cold Call List</h2>
            <p className="text-xs text-slate-500 mt-0.5">Paste tab or comma-separated data with headers</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none p-2">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Name + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">List Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Florida Market - CoStar March 2026"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Source</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Paste area */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Paste Data (first row = headers)
            </label>
            <textarea
              value={rawText}
              onChange={e => { setRawText(e.target.value); setPreview(null); }}
              rows={8}
              placeholder={`Facility Name\tOwner Name\tPhone\tEmail\tAddress\tCity\tState\tZip\nABC Self Storage\tJohn Smith\t555-123-4567\tjohn@abc.com\t123 Main St\tTampa\tFL\t33601\n...`}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
            />
            <p className="text-xs text-slate-600 mt-1">
              Supports: Facility Name, Owner Name, Phone, Email, Address, City, State, Zip, Units, Sq Ft
            </p>
          </div>

          {/* Preview */}
          {!preview && (
            <button
              onClick={handlePreview}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all"
            >
              Preview Import
            </button>
          )}

          {error && (
            <p className="text-xs text-red-400 font-semibold">{error}</p>
          )}

          {preview && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-green-400">
                  {preview.contacts.length} contacts detected
                </p>
                <div className="flex gap-2 text-xs text-slate-500">
                  <span>Headers: {preview.headers.join(', ')}</span>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-1 px-2">Facility</th>
                      <th className="text-left py-1 px-2">Owner</th>
                      <th className="text-left py-1 px-2">Phone</th>
                      <th className="text-left py-1 px-2">State</th>
                      <th className="text-left py-1 px-2">Market</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.contacts.slice(0, 5).map((c, i) => (
                      <tr key={i} className="border-b border-slate-700/50 text-slate-300">
                        <td className="py-1.5 px-2">{c.facilityName || '—'}</td>
                        <td className="py-1.5 px-2">{c.ownerName || '—'}</td>
                        <td className="py-1.5 px-2">{c.phone || '—'}</td>
                        <td className="py-1.5 px-2">{c.state || '—'}</td>
                        <td className="py-1.5 px-2">{c.market || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.contacts.length > 5 && (
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    ... and {preview.contacts.length - 5} more
                  </p>
                )}
              </div>

              {/* Market summary */}
              {(() => {
                const states = {};
                preview.contacts.forEach(c => {
                  if (c.state) states[c.state] = (states[c.state] ?? 0) + 1;
                });
                const entries = Object.entries(states).sort((a, b) => b[1] - a[1]);
                if (entries.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-xs font-semibold text-slate-400 mb-1">Markets Detected:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map(([st, count]) => (
                        <span key={st} className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-md">
                          {st}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || !name.trim()}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              preview && name.trim()
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Import {preview ? `${preview.contacts.length} Contacts` : 'List'}
          </button>
        </div>
      </div>
    </div>
  );
}
