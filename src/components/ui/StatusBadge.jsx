// Shared pill-badge palette. `variant` picks a preset; `className` can extend/override.
// Refined pill palette: soft tinted fill + crisp inset ring (reads cleaner and
// less saturated than solid borders). `variant` picks a preset.
const VARIANTS = {
  slate:   'bg-slate-500/10 text-slate-300 ring-1 ring-inset ring-slate-400/20',
  blue:    'bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-400/25',
  amber:   'bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-400/25',
  green:   'bg-green-500/10 text-green-300 ring-1 ring-inset ring-green-400/25',
  red:     'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-400/25',
  yellow:  'bg-yellow-500/10 text-yellow-300 ring-1 ring-inset ring-yellow-400/25',
  purple:  'bg-purple-500/10 text-purple-300 ring-1 ring-inset ring-purple-400/25',
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25',
  // Pipeline entity type pills (slightly stronger presence on client/pipeline cards)
  buyer:   'bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-400/30',
  seller:  'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30',
};

export default function StatusBadge({ variant = 'slate', icon, children, className = '', pill = true, dashed = false }) {
  const base = dashed
    ? 'border border-dashed border-slate-600 text-slate-600 hover:text-slate-400 hover:border-slate-500'
    : (VARIANTS[variant] ?? VARIANTS.slate);
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 ${pill ? 'rounded-full' : 'rounded'} ${base} ${className}`}>
      {icon && <span className="mr-1">{icon}</span>}
      {children}
    </span>
  );
}
