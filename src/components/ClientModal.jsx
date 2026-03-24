import { useState, useEffect } from 'react';
import { PIPELINE_STAGES, CLIENT_TYPES } from '../data/constants';

const EMPTY = {
  name: '',
  type: 'Seller',
  facilityName: '',
  address: '',
  units: '',
  sqft: '',
  notes: '',
  stageId: 1,
};

export default function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const isEdit = Boolean(client);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name ?? '',
        type: client.type ?? 'Seller',
        facilityName: client.facilityName ?? '',
        address: client.address ?? '',
        units: client.units ?? '',
        sqft: client.sqft ?? '',
        notes: client.notes ?? '',
        stageId: client.stageId ?? 1,
      });
    }
  }, [client]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      stageId: Number(form.stageId),
      units: form.units === '' ? null : Number(form.units),
      sqft: form.sqft === '' ? null : Number(form.sqft),
    });
    onClose();
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500';
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'Edit Client' : 'Add New Client'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all"
            >
              {isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
