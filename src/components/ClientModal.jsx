import { useState, useEffect } from 'react';
import { PIPELINE_STAGES, CLIENT_TYPES, PROPERTY_TYPES } from '../data/constants';
import { formatMoney, formatPercent, numberOrNull, projectedCommissionAmount } from '../lib/dealValue';
import ModalLayout from './ui/ModalLayout';
import { AddToMailerButton } from './MailerListPicker';
import MailingAddressList from './MailingAddressList';

const EMPTY = {
  name: '',
  type: 'Seller',
  propertyType: 'Self-Storage',
  facilityName: '',
  phone: '',
  email: '',
  age: '',
  address: '',
  mailingAddress: '',
  mailingAddresses: [],
  units: '',
  sqft: '',
  desiredSalePrice: '',
  projectedCommissionPct: '',
  notes: '',
  stageId: 1,
};

export default function ClientModal({ client, onSave, onClose, mailerApi }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
        age: client.age ?? '',
        address: client.address ?? '',
        mailingAddress: client.mailingAddress ?? '',
        mailingAddresses: client.mailingAddresses ?? [],
        units: client.units ?? '',
        sqft: client.sqft ?? '',
        desiredSalePrice: client.desiredSalePrice ?? '',
        projectedCommissionPct: client.projectedCommissionPct ?? '',
        notes: client.notes ?? '',
        stageId: client.stageId ?? 1,
      });
    }
  }, [client]);

  function handleChange(e) {
    const { name, value } = e.target;
    setError('');
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const result = await onSave({
      ...form,
      stageId: Number(form.stageId),
      units: form.units === '' ? null : Number(form.units),
      sqft: form.sqft === '' ? null : Number(form.sqft),
      age: numberOrNull(form.age),
      desiredSalePrice: numberOrNull(form.desiredSalePrice),
      projectedCommissionPct: numberOrNull(form.projectedCommissionPct),
      mailingAddresses: form.mailingAddresses,
    });
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-500 placeholder:text-slate-500';
  const labelCls = 'block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide';
  const projectedCommission = projectedCommissionAmount(form.desiredSalePrice, form.projectedCommissionPct);

  return (
    <ModalLayout onClose={onClose} className="max-h-[90vh] flex flex-col">
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

          {/* Phone + Email + Age */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px] gap-3">
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
            <div>
              <label className={labelCls}>Age</label>
              <input
                name="age"
                type="number"
                min="0"
                max="130"
                value={form.age}
                onChange={handleChange}
                placeholder="Age"
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

          {/* Mailing Address */}
          <div>
            <label className={labelCls}>Primary Mailing Address</label>
            <div className="flex items-center gap-2">
              <input
                name="mailingAddress"
                value={form.mailingAddress}
                onChange={handleChange}
                placeholder="Where they get mail — PO Box, home, office"
                className={inputCls}
              />
              {isEdit && mailerApi && form.mailingAddress.trim() && (
                <AddToMailerButton
                  mailerApi={mailerApi}
                  member={{ type: 'client', id: client.id, name: form.name || client.name, mailingAddress: form.mailingAddress, addressLabel: 'Primary' }}
                />
              )}
            </div>
            <div className="mt-2">
              <MailingAddressList
                addresses={form.mailingAddresses}
                onChange={(rows) => setForm(prev => ({ ...prev, mailingAddresses: rows }))}
                mailerApi={isEdit ? mailerApi : null}
                member={isEdit ? { type: 'client', id: client.id, name: form.name || client.name } : null}
                inputClassName={inputCls}
              />
            </div>
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

          {/* Deal Value */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div>
              <label className={labelCls}>Desired Sale Price</label>
              <input
                name="desiredSalePrice"
                type="number"
                min="0"
                step="1000"
                value={form.desiredSalePrice}
                onChange={handleChange}
                placeholder="e.g. 4500000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Commission %</label>
              <input
                name="projectedCommissionPct"
                type="number"
                min="0"
                step="0.01"
                value={form.projectedCommissionPct}
                onChange={handleChange}
                placeholder="e.g. 3"
                className={inputCls}
              />
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <p className={labelCls}>Projected Commission</p>
              <p className="text-lg font-black text-emerald-400 leading-tight">
                {projectedCommission ? formatMoney(projectedCommission) : '$0'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {form.desiredSalePrice && form.projectedCommissionPct
                  ? `${formatMoney(form.desiredSalePrice, { compact: true })} x ${formatPercent(form.projectedCommissionPct)}`
                  : 'Enter price and %'}
              </p>
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
          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold text-sm transition-all"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        </form>
    </ModalLayout>
  );
}
