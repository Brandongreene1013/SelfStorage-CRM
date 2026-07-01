import { useState, useRef, useEffect } from 'react';

// Small dropdown for moving a record to another section/list.
// options: [{ label, onClick }]. Stops pointer/drag events so it works on draggable cards.
export default function MoveMenu({ options = [], label = 'Move ▾', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-1 transition-all"
      >
        {label}
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 max-h-64 overflow-auto`}>
          {options.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-slate-500">Nowhere to move.</p>
          ) : options.map((o, i) => (
            <button
              key={i}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); o.onClick(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-all truncate"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
