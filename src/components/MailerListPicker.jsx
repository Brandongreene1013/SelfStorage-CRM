import { useState } from 'react';
import ModalLayout from './ui/ModalLayout';

// Popup for putting a contact/client onto mailer lists: toggle existing lists
// or create a new one inline. `member` = { type: 'contact'|'client', id, name,
// mailingAddress }. Rendered by AddToMailerButton below, which is the little
// "✉️ Mailer" button that sits next to every mailing-address field.
export function MailerListPicker({ member, mailerApi, onClose }) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const selectedAddress = (member.mailingAddress ?? '').trim();
  const selectedLabel = (member.addressLabel ?? '').trim();
  const onLists = mailerApi.membershipFor(member.type, member.id, selectedAddress);

  async function toggle(list) {
    if (onLists.has(list.id)) {
      await mailerApi.removeMember(list.id, member.type, member.id, { mailingAddress: selectedAddress });
    } else {
      await mailerApi.addMember(list.id, member.type, member.id, { mailingAddress: selectedAddress, addressLabel: selectedLabel });
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const list = await mailerApi.createList(name);
    if (list) {
      await mailerApi.addMember(list.id, member.type, member.id, { mailingAddress: selectedAddress, addressLabel: selectedLabel });
      setNewName('');
    }
    setCreating(false);
  }

  return (
    <ModalLayout onClose={onClose} size="sm" className="flex flex-col max-h-[80vh]">
      <div className="flex items-start justify-between p-5 border-b border-slate-800">
        <div className="min-w-0 pr-3">
          <h2 className="text-base font-bold text-white">✉️ Add to Mailer List</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{member.name}</p>
          {member.mailingAddress && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{selectedLabel ? `${selectedLabel}: ` : ''}{selectedAddress}</p>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none p-1">✕</button>
      </div>

      <div className="p-5 space-y-4 flex-1 overflow-y-auto min-h-0">
        {mailerApi.tablesMissing ? (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-blue-300">
              💾 One-time setup: run{' '}
              <span className="font-mono text-blue-200">sql/mailer_lists_migration.sql</span> in the
              Supabase SQL Editor, then refresh to start building mailer lists.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Add to list</p>
              {mailerApi.mailerLists.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No mailer lists yet — create your first one below.</p>
              ) : (
                <div className="space-y-1.5">
                  {mailerApi.mailerLists.map(list => {
                    const on = onLists.has(list.id);
                    return (
                      <button
                        key={list.id}
                        onClick={() => toggle(list)}
                        className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                          on
                            ? 'bg-emerald-600/15 border-emerald-600/40 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{list.name}</span>
                        <span className="text-xs flex-shrink-0">
                          {on ? '✓ On list' : `${mailerApi.memberCounts[list.id] ?? 0} on list`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Create new list</p>
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createAndAdd(); }}
                  placeholder='e.g. "Texas Owners Q3 Mailer"'
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={createAndAdd}
                  disabled={!newName.trim() || creating}
                  className={`flex-shrink-0 text-sm font-bold px-3 py-2 rounded-lg border transition-all ${
                    newName.trim() && !creating
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                      : 'border-slate-700 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {creating ? 'Adding...' : '+ Create & Add'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold"
        >
          Done
        </button>
      </div>
    </ModalLayout>
  );
}

// The little button that lives next to mailing-address fields everywhere.
// Shows how many lists the person is already on; opens the picker on click.
export function AddToMailerButton({ member, mailerApi, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!mailerApi) return null;
  const count = mailerApi.membershipFor(member.type, member.id, member.mailingAddress).size;
  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="Add to mailer list"
        className={`flex-shrink-0 text-xs font-bold rounded-lg px-2.5 py-1.5 border transition-all ${
          count > 0
            ? 'bg-emerald-600/15 border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/25'
            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/40'
        } ${className}`}
      >
        ✉️ {count > 0 ? `On ${count} mailer${count === 1 ? '' : 's'}` : 'Add to mailer list'}
      </button>
      {open && <MailerListPicker member={member} mailerApi={mailerApi} onClose={() => setOpen(false)} />}
    </>
  );
}
