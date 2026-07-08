import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { IMPORT_FIELD_OPTIONS, parseImportData } from '../hooks/useDatabase';
import ModalLayout from './ui/ModalLayout';

const SOURCES = ['', 'TractIQ', 'Reonomy', 'CoStar', 'County Records', 'Manual Excel', 'Other'];

function excelToTSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
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

function fileBaseName(fileName) {
  return (fileName || '').replace(/\.[^.]+$/, '').trim();
}

function metric(label, value, tone = 'slate') {
  const toneClass = {
    amber: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
    red: 'border-red-500/30 text-red-300 bg-red-500/10',
    green: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
    blue: 'border-blue-500/30 text-blue-300 bg-blue-500/10',
    slate: 'border-slate-700 text-slate-300 bg-slate-900',
  }[tone];
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-black leading-tight">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

export default function ImportListModal({
  onImport,
  onClose,
  fixedListName,
  existingContacts = [],
  onOpenImportedList,
  onStartImportedCallSession,
  onOpenDuplicateReview,
}) {
  const intoFixed = !!fixedListName;
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [duplicateMode, setDuplicateMode] = useState('import');
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const effectiveSource = useMemo(() => {
    if (source) return source;
    if (fileName) return fileBaseName(fileName);
    return 'Manual / Unknown';
  }, [source, fileName]);

  const importableCount = preview
    ? duplicateMode === 'skip' || duplicateMode === 'append'
      ? preview.rows.filter(row => !row.flags.includes('Possible duplicate')).length
      : preview.rows.length
    : 0;
  const duplicateCount = preview?.summary.possibleDuplicates ?? 0;
  const actionableCount = duplicateMode === 'append'
    ? importableCount + duplicateCount
    : importableCount;

  function buildPreview(text, nextMappings) {
    const parsed = parseImportData(text, { mappings: nextMappings, existingContacts });
    setPreview(parsed);
    setMappings(parsed.mappings);
    return parsed;
  }

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      setError('Unsupported file type. Use .xlsx, .xls, .csv, or .tsv.');
      return;
    }

    setLoading(true);
    setError('');
    setPreview(null);
    setImportResult(null);

    try {
      let tsv;
      if (ext === 'csv' || ext === 'tsv') {
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
      if (!name) setName(fileBaseName(file.name));

      const parsed = buildPreview(tsv);
      if (parsed.contacts.length === 0) {
        setError('No rows found. Make sure the file has facility names, addresses, or column headers.');
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
  }, [name, existingContacts]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  function updateMapping(index, field) {
    const next = mappings.map(mapping => mapping.index === index ? { ...mapping, field } : mapping);
    buildPreview(rawText, next);
    setImportResult(null);
  }

  async function handleImport() {
    if (!preview) { setError('Load a file first'); return; }
    if (!intoFixed && !name.trim()) { setError('Give this list a name'); return; }
    setImporting(true);
    setError('');
    try {
      const result = await onImport(name.trim(), effectiveSource, rawText, {
        rows: preview.rows,
        mappings,
        duplicateMode,
        summary: preview.summary,
        fileName,
        source: effectiveSource,
      });
      setImportResult({ ...result, listName: intoFixed ? fixedListName : name.trim(), source: effectiveSource });
    } catch (err) {
      setError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <ModalLayout onClose={onClose} size="2xl" className="max-h-[92vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-black text-white">
            {intoFixed ? `Bulk Upload to ${fixedListName}` : 'Import Cold Call List'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Supports .xlsx, .xls, .csv, and .tsv</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none p-2">x</button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!intoFixed && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">List Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Florida Market - CoStar March 2026"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
          <div className={intoFixed ? 'md:col-span-2' : ''}>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {SOURCES.map(s => <option key={s || 'filename'} value={s}>{s || 'Use filename'}</option>)}
            </select>
          </div>
        </div>

        {intoFixed && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5 text-sm text-emerald-300">
            Adding these contacts straight into <strong>{fixedListName}</strong>.
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-amber-500 bg-amber-500/10'
              : preview
                ? 'border-emerald-600/50 bg-emerald-600/5'
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
              <div className="text-3xl">OK</div>
              <p className="text-sm font-bold text-emerald-400">{fileName}</p>
              <p className="text-xs text-slate-400">{preview.contacts.length} rows loaded, click to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">Import</div>
              <div>
                <p className="text-sm font-bold text-white">Drop your Excel or CSV file here</p>
                <p className="text-xs text-slate-500 mt-1">or click to browse</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 font-semibold bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
        )}

        {preview && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {metric('Total rows', preview.summary.total)}
              {metric('Ready to work', preview.summary.readyToCall, 'green')}
              {metric('Needs phone', preview.summary.missingPhone, preview.summary.missingPhone ? 'amber' : 'slate')}
              {metric('Possible duplicates', preview.summary.possibleDuplicates, preview.summary.possibleDuplicates ? 'amber' : 'slate')}
              {metric('Missing owner', preview.summary.missingOwner, preview.summary.missingOwner ? 'amber' : 'slate')}
              {metric('Missing address', preview.summary.missingAddress, preview.summary.missingAddress ? 'amber' : 'slate')}
              {metric('Multi-phone rows', preview.summary.multiplePhoneRecords, preview.summary.multiplePhoneRecords ? 'blue' : 'slate')}
              {metric('Extra phones', preview.summary.additionalPhones, preview.summary.additionalPhones ? 'blue' : 'slate')}
            </div>

            {preview.mappingWarnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wide mb-1">Missing important mapping</p>
                <p className="text-sm text-amber-100">{preview.mappingWarnings.join(', ')}</p>
              </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">Column Mapping</p>
                <p className="text-xs text-slate-500">Source saved as: {effectiveSource}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {mappings.map(mapping => (
                  <div key={`${mapping.index}-${mapping.header}`} className="grid grid-cols-[minmax(0,1fr)_190px] gap-2 items-center">
                    <div className="min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 truncate">{mapping.header || `Column ${mapping.index + 1}`}</p>
                    </div>
                    <select
                      value={mapping.field}
                      onChange={e => updateMapping(mapping.index, e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      {IMPORT_FIELD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                <p className="text-sm font-bold text-white">Import Preview</p>
                <select
                  value={duplicateMode}
                  onChange={e => setDuplicateMode(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="import">Import anyway</option>
                  <option value="skip">Skip possible duplicates</option>
                  <option value="append">Append missing phones/notes</option>
                </select>
              </div>

              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-1.5 px-2">Row</th>
                      <th className="text-left py-1.5 px-2">Facility</th>
                      <th className="text-left py-1.5 px-2">Owner</th>
                      <th className="text-left py-1.5 px-2">Phone</th>
                      <th className="text-left py-1.5 px-2">Extra</th>
                      <th className="text-left py-1.5 px-2">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 12).map(row => (
                      <tr key={row.rowNumber} className="border-b border-slate-700/50 text-slate-300 hover:bg-slate-700/30">
                        <td className="py-1.5 px-2 text-slate-500">{row.rowNumber}</td>
                        <td className="py-1.5 px-2 max-w-[170px] truncate">{row.contact.facilityName || '-'}</td>
                        <td className="py-1.5 px-2 max-w-[150px] truncate">{row.contact.ownerName || '-'}</td>
                        <td className="py-1.5 px-2 font-mono">{row.contact.phone || '-'}</td>
                        <td className="py-1.5 px-2">{row.contact.alternatePhones?.length ?? 0}</td>
                        <td className="py-1.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {row.flags.map(flag => (
                              <span key={flag} className={`rounded px-1.5 py-0.5 border ${
                                flag === 'Ready to call' || flag === 'Ready to work' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : flag === 'Possible duplicate' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                    : flag === 'Multiple phones found' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                              }`}>
                                {flag}
                              </span>
                            ))}
                          </div>
                          {row.duplicateReasons.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[11px] text-slate-500">{row.duplicateReasons.join(', ')}</p>
                              {row.duplicateMatches?.length > 0 && (
                                <p className="text-[11px] text-amber-300/80">
                                  Matches {row.duplicateMatches.slice(0, 2).map(match => match.name || match.facilityName || 'Existing contact').join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 12 && (
                  <p className="text-xs text-slate-500 mt-2 text-center">+{preview.rows.length - 12} more rows</p>
                )}
              </div>
            </div>
          </>
        )}

        {importResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <p className="text-sm font-black text-emerald-300 mb-2">Import complete: {importResult.listName}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {metric('Rows imported', importResult.count ?? 0, 'green')}
              {metric('Rows skipped', importResult.skipped ?? 0, (importResult.skipped ?? 0) ? 'amber' : 'slate')}
              {metric('Duplicates skipped', importResult.skippedDuplicates ?? 0, (importResult.skippedDuplicates ?? 0) ? 'amber' : 'slate')}
              {metric('Duplicates appended', importResult.mergedDuplicates ?? 0, (importResult.mergedDuplicates ?? 0) ? 'blue' : 'slate')}
              {metric('Needs phone', importResult.missingPhoneCount ?? 0, (importResult.missingPhoneCount ?? 0) ? 'amber' : 'slate')}
              {metric('Ready to work', importResult.readyToCallCount ?? 0, 'green')}
              {metric('Extra phones imported', importResult.additionalPhonesImported ?? 0, (importResult.additionalPhonesImported ?? 0) ? 'blue' : 'slate')}
            </div>
            <p className="mt-3 text-xs text-slate-400">Source applied: <span className="font-semibold text-emerald-300">{importResult.sourceApplied ?? importResult.source}</span></p>

            {/* Sprint 12 — post-import duplicate nudge into the Review Center */}
            {(() => {
              const dupTouched = (importResult.skippedDuplicates ?? 0) + (importResult.mergedDuplicates ?? 0);
              const dupSeen = Math.max(dupTouched, duplicateCount);
              if (dupSeen === 0 || !onOpenDuplicateReview) return null;
              return (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-300">
                    {dupSeen} possible duplicate{dupSeen === 1 ? '' : 's'} found in this import — review what's already in your database.
                  </p>
                  <button
                    onClick={onOpenDuplicateReview}
                    className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 px-3 py-1.5 rounded-lg transition-all"
                  >
                    Open Duplicate Review
                  </button>
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-2 mt-4">
              {importResult.list?.id && (
                <>
                  <button onClick={() => onOpenImportedList?.(importResult.list.id)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3 py-2 rounded-lg text-xs transition-all">
                    Open Imported List
                  </button>
                  <button onClick={() => onStartImportedCallSession?.(importResult.list.id)} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-black px-3 py-2 rounded-lg text-xs transition-all">
                    Start Call Session
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-all">
          {importResult ? 'Close' : 'Cancel'}
        </button>
        {!importResult && (
          <button
            onClick={handleImport}
            disabled={!preview || importing || (!intoFixed && !name.trim()) || actionableCount === 0}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              preview && !importing && (intoFixed || name.trim()) && actionableCount > 0
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {importing ? 'Importing...' : duplicateMode === 'append'
              ? `Import/Append ${actionableCount || ''} Rows`
              : `Import ${importableCount || ''} Rows`}
          </button>
        )}
      </div>
    </ModalLayout>
  );
}
