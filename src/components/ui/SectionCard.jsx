export default function SectionCard({ title, subtitle, actions, className = '', bodyClassName = '', children }) {
  return (
    <div className={`bg-slate-900 border border-slate-800/90 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/[0.03] ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
          {title && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h2>
              {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
