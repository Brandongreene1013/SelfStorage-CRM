export default function EmptyState({ icon = null, title, message, action }) {
  return (
    <div className="text-center py-16 text-slate-600">
      {icon && <div className="text-2xl mb-3 text-slate-500">{icon}</div>}
      {title && <p className="text-sm font-semibold text-slate-500">{title}</p>}
      {message && <p className="text-sm">{message}</p>}
      {action}
    </div>
  );
}
