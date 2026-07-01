const VARIANTS = {
  primary:   'bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold shadow',
  secondary: 'border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white font-semibold',
  danger:    'bg-red-600 hover:bg-red-500 text-white font-bold',
  ghost:     'text-slate-500 hover:text-white font-semibold',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'py-2.5 text-sm rounded-lg',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button
      className={`transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size] ?? SIZES.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
