// Lightweight inline SVG sparkline — no charting library. Bounded points.
export default function MarketSparkline({ points = [], width = 56, height = 16, color = '#f59e0b' }) {
  const vals = (points ?? []).map(Number).filter(Number.isFinite).slice(-24);
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = width / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 2) - 1).toFixed(1)}`)
    .join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" opacity={up ? 0.95 : 0.7} />
    </svg>
  );
}
