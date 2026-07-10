import { AddToMailerButton } from './MailerListPicker';
import { newMailingAddress } from '../lib/mailingAddresses';

export default function MailingAddressList({
  addresses = [],
  onChange,
  mailerApi,
  member,
  inputClassName = '',
  compact = false,
}) {
  const rows = (Array.isArray(addresses) ? addresses : []).map((row, idx) => ({
    id: row.id || `addr-${idx}`,
    label: row.label || '',
    address: row.address || '',
  }));

  function updateRow(id, fields) {
    onChange(rows.map(row => row.id === id ? { ...row, ...fields } : row));
  }

  function removeRow(id) {
    onChange(rows.filter(row => row.id !== id));
  }

  function addRow() {
    onChange([...rows, newMailingAddress()]);
  }

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 items-center">
          <input
            value={row.label}
            onChange={e => updateRow(row.id, { label: e.target.value })}
            placeholder="Label"
            className={inputClassName}
          />
          <input
            value={row.address}
            onChange={e => updateRow(row.id, { address: e.target.value })}
            placeholder="Affiliated mailing address"
            className={inputClassName}
          />
          <div className="flex items-center gap-2">
            {mailerApi && member?.id && row.address.trim() && (
              <AddToMailerButton
                mailerApi={mailerApi}
                member={{
                  ...member,
                  mailingAddress: row.address,
                  addressLabel: row.label || 'Affiliated',
                }}
                className={compact ? 'px-2 py-1' : ''}
              />
            )}
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="text-xs font-semibold text-slate-500 hover:text-red-400 px-1"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-xs font-bold text-amber-400 border border-dashed border-amber-500/35 hover:bg-amber-500/10 rounded-lg px-3 py-1.5 transition-all"
      >
        + Add affiliated mailing address
      </button>
    </div>
  );
}
