export function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function projectedCommissionAmount(salePrice, commissionPct) {
  const price = numberOrNull(salePrice);
  const pct = numberOrNull(commissionPct);
  if (price === null || pct === null) return null;
  return price * (pct / 100);
}

export function formatMoney(value, { compact = false } = {}) {
  const n = numberOrNull(value);
  if (n === null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(n);
}

export function formatPercent(value) {
  const n = numberOrNull(value);
  if (n === null) return '';
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}
