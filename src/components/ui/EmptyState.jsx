export default function EmptyState({ icon = '🔍', title, message, action }) {
  return (
    <div className="text-center py-8 text-slate-600">
      <div className="text-5xl mb-3">{icon}</div>
      {title && <p className="text-sm font-semibold text-slate-500">{title}</p>}
      {message && <p className="text-sm">{message}</p>}
      {action}
    </div>
  );
}
