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

export function buildCommissionSummary(clients = []) {
  const summary = {
    grossPipelineCommission: 0,
    grossOnMarketCommission: 0,
    grossClosedCommission: 0,
    grossAllCommission: 0,
    pipelineSaleValue: 0,
    onMarketSaleValue: 0,
    pricedPipelineDeals: 0,
    pricedOnMarketDeals: 0,
    pricedAllDeals: 0,
    missingCommissionDeals: 0,
  };

  clients.forEach(client => {
    const salePrice = numberOrNull(client.desiredSalePrice);
    const commission = projectedCommissionAmount(client.desiredSalePrice, client.projectedCommissionPct);
    const hasSalePrice = salePrice !== null && salePrice > 0;
    const hasCommission = commission !== null && commission > 0;
    const isPipeline = client.stageId >= 2 && client.stageId <= 9;
    const isOnMarket = client.stageId >= 5 && client.stageId <= 9;
    const isClosed = client.stageId === 9 || client.stageId === 10;

    if (hasCommission) {
      summary.grossAllCommission += commission;
      summary.pricedAllDeals += 1;
      if (isPipeline) {
        summary.grossPipelineCommission += commission;
        summary.pricedPipelineDeals += 1;
      }
      if (isOnMarket) {
        summary.grossOnMarketCommission += commission;
        summary.pricedOnMarketDeals += 1;
      }
      if (isClosed) summary.grossClosedCommission += commission;
    } else if (isPipeline) {
      summary.missingCommissionDeals += 1;
    }

    if (isPipeline && hasSalePrice) summary.pipelineSaleValue += salePrice;
    if (isOnMarket && hasSalePrice) summary.onMarketSaleValue += salePrice;
  });

  return summary;
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
