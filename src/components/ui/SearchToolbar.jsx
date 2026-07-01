export function FilterPills({ options, value, onChange, colorFor }) {
  return (
    <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
      {options.map(opt => {
        const label = typeof opt === 'string' ? opt : opt.label;
        const val = typeof opt === 'string' ? opt : opt.value;
        const active = value === val;
        const activeClass = colorFor?.(val) ?? 'bg-slate-600 text-white';
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              active ? activeClass : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function SearchToolbar({ search, onSearchChange, placeholder = 'Search...', children, trailing }) {
  return (
    <div className="bg-slate-900/60 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center gap-3">
      {children}
      <input
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-[180px] max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
      />
      {trailing}
    </div>
  );
}
