export default function SectionCard({ title, subtitle, actions, className = '', bodyClassName = '', children }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-5 ${className}`}>
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
