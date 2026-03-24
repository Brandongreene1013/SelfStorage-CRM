import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PIPELINE_STAGES, CLIENT_TYPES, PROPERTY_TYPES } from '../data/constants';
import { useFileStorage } from '../hooks/useFileStorage';

const EMPTY = {
  name: '',
  type: 'Seller',
  propertyType: 'Self-Storage',
  facilityName: '',
  phone: '',
  email: '',
  address: '',
  units: '',
  sqft: '',
  notes: '',
  stageId: 1,
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);
  const [docsToDelete, setDocsToDelete] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const { saveFile, openFile, deleteFile } = useFileStorage();
  const isEdit = Boolean(client);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name ?? '',
        type: client.type ?? 'Seller',
        propertyType: client.propertyType ?? 'Self-Storage',
        facilityName: client.facilityName ?? '',
        phone: client.phone ?? '',
        email: client.email ?? '',
        address: client.address ?? '',
        units: client.units ?? '',
        sqft: client.sqft ?? '',
        notes: client.notes ?? '',
        stageId: client.stageId ?? 1,
      });
      setExistingDocs(client.documents ?? []);
    }
  }, [client]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    const newPending = files.map(file => ({ localId: uuidv4(), file }));
    setPendingFiles(prev => [...prev, ...newPending]);
    e.target.value = '';
  }

  function removePendingFile(localId) {
    setPendingFiles(prev => prev.filter(f => f.localId !== localId));
  }

  function removeExistingDoc(id) {
    setDocsToDelete(prev => [...prev, id]);
    setExistingDocs(prev => prev.filter(d => d.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setUploading(true);
    try {
      const newDocs = await Promise.all(pendingFiles.map(async ({ file }) => {
        const id = uuidv4();
        await saveFile(id, file);
        return { id, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString() };
      }));

      await Promise.all(docsToDelete.map(id => deleteFile(id)));

      onSave({
        ...form,
        stageId: Number(form.stageId),
        units: form.units === '' ? null : Number(form.units),
        sqft: form.sqft === '' ? null : Number(form.sqft),
        documents: [...existingDocs, ...newDocs],
      });
      onClose();
    } finally {
      setUploading(false);
    }
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500';
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'Edit Client' : 'Add New Client'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Client Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Full Name"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Client Type</label>
              <div className="flex gap-2">
                {CLIENT_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      form.type === t
                        ? t === 'Buyer'
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-amber-600 border-amber-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Property Type */}
          <div>
            <label className={labelCls}>Property Type</label>
            <div className="flex gap-2 flex-wrap">
              {PROPERTY_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, propertyType: pt.value }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                    form.propertyType === pt.value
                      ? 'bg-emerald-700 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {pt.icon} {pt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Facility Name */}
          <div>
            <label className={labelCls}>Facility Name</label>
            <input
              name="facilityName"
              value={form.facilityName}
              onChange={handleChange}
              placeholder="e.g. Sunbelt Storage LLC"
              className={inputCls}
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="(555) 000-0000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="name@example.com"
                className={inputCls}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>Address</label>
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Street, City, State ZIP"
              className={inputCls}
            />
            {form.address.trim() && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-500 hover:text-amber-400 mt-1 inline-flex items-center gap-1 transition-colors"
              >
                📍 View on Google Maps ↗
              </a>
            )}
          </div>

          {/* Units + Sqft */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Total Units</label>
              <input
                name="units"
                type="number"
                min="0"
                value={form.units}
                onChange={handleChange}
                placeholder="e.g. 300"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Total Sq Ft</label>
              <input
                name="sqft"
                type="number"
                min="0"
                value={form.sqft}
                onChange={handleChange}
                placeholder="e.g. 38000"
                className={inputCls}
              />
            </div>
          </div>

          {/* Pipeline Stage */}
          <div>
            <label className={labelCls}>Pipeline Stage</label>
            <select
              name="stageId"
              value={form.stageId}
              onChange={handleChange}
              className={inputCls}
            >
              {PIPELINE_STAGES.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id}. {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Deal notes, follow-ups, context..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Documents */}
          <div>
            <label className={labelCls}>Documents & BOV Files</label>
            <div
              className="border-2 border-dashed border-slate-700 rounded-lg p-4 text-center cursor-pointer hover:border-amber-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-2xl mb-1">📄</div>
              <p className="text-xs text-slate-400">Click to upload PDF, DOC, XLS files</p>
              <p className="text-xs text-slate-600 mt-0.5">BOV reports, appraisals, financials</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Existing saved docs */}
            {existingDocs.length > 0 && (
              <div className="mt-2 space-y-1">
                {existingDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-sm">📎</span>
                    <button
                      type="button"
                      onClick={() => openFile(doc.id)}
                      className="flex-1 text-xs text-slate-300 hover:text-amber-400 text-left truncate transition-colors"
                      title="Click to open"
                    >
                      {doc.name}
                    </button>
                    <span className="text-xs text-slate-600 flex-shrink-0">{formatSize(doc.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeExistingDoc(doc.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending (not yet saved) files */}
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {pendingFiles.map(({ localId, file }) => (
                  <div key={localId} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="text-sm">🆕</span>
                    <span className="flex-1 text-xs text-slate-400 truncate">{file.name}</span>
                    <span className="text-xs text-slate-600 flex-shrink-0">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(localId)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all disabled:opacity-60"
            >
              {uploading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
