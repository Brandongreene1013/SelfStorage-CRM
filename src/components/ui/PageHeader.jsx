export default function PageHeader({ title, subtitle, badge, actions }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-white">{title}</h2>
        {badge && (
          <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-500 w-full -mt-2">{subtitle}</p>}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
