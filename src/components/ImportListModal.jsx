import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { parseImportData } from '../hooks/useDatabase';

const SOURCES = ['Internal DB', 'CoStar', 'Tractiq', 'Other'];

function excelToTSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        // Use the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Convert to CSV (handles merged cells, numbers, etc.)
        const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t' });
        resolve({ tsv: csv, sheetName, sheetNames: workbook.SheetNames });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function ImportListModal({ onImport, onClose }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('Internal DB');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      setError('Unsupported file type. Use .xlsx, .xls, or .csv');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      let tsv;
      if (ext === 'csv' || ext === 'tsv') {
        // Read as text
        tsv = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result);
          r.onerror = rej;
          r.readAsText(file);
        });
      } else {
        const result = await excelToTSV(file);
        tsv = result.tsv;
      }

      setRawText(tsv);
      setFileName(file.name);

      // Auto-set list name from filename if not set
      if (!name) {
        setName(file.name.replace(/\.[^.]+$/, ''));
      }

      // Auto-preview
      const parsed = parseImportData(tsv);
      if (parsed.contacts.length === 0) {
        setError('No contacts found. Make sure row 1 has column headers.');
      } else {
        setPreview(parsed);
      }
    } catch (err) {
      setError('Failed to read file: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [name]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  function handleImport() {
    if (!name.trim()) { setError('Give this list a name'); return; }
    if (!preview) { setError('Load a file first'); return; }
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
            <p className="text-xs text-slate-500 mt-0.5">Supports .xlsx · .xls · .csv</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none p-2">✕</button>
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

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-amber-500 bg-amber-500/10'
                : preview
                  ? 'border-green-600/50 bg-green-600/5'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold">Reading file...</p>
              </div>
            ) : preview ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-4xl">✅</div>
                <p className="text-sm font-bold text-green-400">{fileName}</p>
                <p className="text-xs text-slate-400">{preview.contacts.length} contacts loaded — click to replace</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="text-5xl">📂</div>
                <div>
                  <p className="text-sm font-bold text-white">Drop your Excel or CSV file here</p>
                  <p className="text-xs text-slate-500 mt-1">or click to browse · .xlsx · .xls · .csv</p>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Auto-detects: Facility Name · Owner · Phone · Email · Address · City · State · Zip
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 font-semibold bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Preview */}
          {preview && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-green-400">
                  {preview.contacts.length} contacts detected
                </p>
                <p className="text-xs text-slate-500">Columns: {preview.headers.slice(0, 6).join(', ')}{preview.headers.length > 6 ? '...' : ''}</p>
              </div>

              <div className="overflow-auto max-h-52">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-1.5 px-2">Facility</th>
                      <th className="text-left py-1.5 px-2">Owner</th>
                      <th className="text-left py-1.5 px-2">Phone</th>
                      <th className="text-left py-1.5 px-2">State</th>
                      <th className="text-left py-1.5 px-2">Market</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.contacts.slice(0, 8).map((c, i) => (
                      <tr key={i} className="border-b border-slate-700/50 text-slate-300 hover:bg-slate-700/30">
                        <td className="py-1.5 px-2 max-w-[180px] truncate">{c.facilityName || '—'}</td>
                        <td className="py-1.5 px-2">{c.ownerName || '—'}</td>
                        <td className="py-1.5 px-2 font-mono">{c.phone || '—'}</td>
                        <td className="py-1.5 px-2">{c.state || '—'}</td>
                        <td className="py-1.5 px-2">{c.market || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.contacts.length > 8 && (
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    +{preview.contacts.length - 8} more rows
                  </p>
                )}
              </div>

              {/* State badges */}
              {(() => {
                const states = {};
                preview.contacts.forEach(c => { if (c.state) states[c.state] = (states[c.state] ?? 0) + 1; });
                const entries = Object.entries(states).sort((a, b) => b[1] - a[1]);
                if (!entries.length) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-xs font-semibold text-slate-400 mb-1.5">Markets Detected:</p>
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-all">
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
