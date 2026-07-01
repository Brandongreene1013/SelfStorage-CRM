export default function LoadingSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-lg bg-slate-800/60 border border-slate-700/50 animate-pulse" />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse ${className}`}>
      <div className="h-3 w-24 bg-slate-800 rounded mb-4" />
      <div className="h-8 w-full bg-slate-800/70 rounded" />
    </div>
  );
}
