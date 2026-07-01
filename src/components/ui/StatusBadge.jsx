// Shared pill-badge palette. `variant` picks a preset; `className` can extend/override.
const VARIANTS = {
  slate:   'bg-slate-700 text-slate-300',
  blue:    'bg-blue-600/20 text-blue-400 border border-blue-600/40',
  amber:   'bg-amber-600/20 text-amber-400 border border-amber-600/40',
  green:   'bg-green-600/20 text-green-400 border border-green-600/40',
  red:     'bg-red-600/20 text-red-400 border border-red-600/40',
  yellow:  'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40',
  purple:  'bg-purple-600/20 text-purple-400 border border-purple-600/40',
  emerald: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  // Pipeline entity type pills (slightly bolder fill, used on client/pipeline cards)
  buyer:   'bg-blue-900/50 border border-blue-700 text-blue-300',
  seller:  'bg-amber-900/50 border border-amber-700 text-amber-300',
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
