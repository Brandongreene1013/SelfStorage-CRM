const VARIANTS = {
  primary:   'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow-sm shadow-amber-500/25 ring-1 ring-inset ring-amber-300/40',
  secondary: 'bg-slate-800/40 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white font-semibold',
  danger:    'bg-red-600 hover:bg-red-500 text-white font-semibold shadow-sm shadow-red-600/25 ring-1 ring-inset ring-red-400/30',
  ghost:     'text-slate-400 hover:text-white hover:bg-white/[0.06] font-medium',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'py-2.5 text-sm rounded-lg',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button
      className={`transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 ${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size] ?? SIZES.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
