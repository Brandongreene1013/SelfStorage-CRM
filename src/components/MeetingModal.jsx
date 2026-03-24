import { useState, useEffect } from 'react';

const EMPTY = {
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  clientId: '',
  notes: '',
};

export default function MeetingModal({ meeting, defaultDate, clients, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY, date: defaultDate ?? '' });
  const isEdit = Boolean(meeting);

  useEffect(() => {
    if (meeting) {
      setForm({
        title: meeting.title ?? '',
        date: meeting.date ?? defaultDate ?? '',
        startTime: meeting.startTime ?? '',
        endTime: meeting.endTime ?? '',
        location: meeting.location ?? '',
        clientId: meeting.clientId ?? '',
        notes: meeting.notes ?? '',
      });
    }
  }, [meeting]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.date) return;
    onSave(form);
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500';
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Meeting' : 'Schedule Meeting'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className={labelCls}>Meeting Title *</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Property Walk-Through"
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Date *</label>
              <input name="date" type="date" value={form.date} onChange={handleChange} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start Time</label>
              <input name="startTime" type="time" value={form.startTime} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Time</label>
              <input name="endTime" type="time" value={form.endTime} onChange={handleChange} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Location</label>
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="Address or video call link"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Link to Client</label>
            <select name="clientId" value={form.clientId} onChange={handleChange} className={inputCls}>
              <option value="">— None —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.facilityName ? ` · ${c.facilityName}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Agenda, prep notes, talking points..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
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
              {isEdit ? 'Save Changes' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
