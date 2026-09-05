export interface MetricComparisonResult {
  metricName: string;
  legacyValue: number | string | null | undefined;
  modernValue: number | string | null | undefined;
  isMatch: boolean;
  discrepancyRatePct?: number;
}

export interface ShadowRunComparison {
  dealId: string;
  allMatch: boolean;
  metrics: MetricComparisonResult[];
  unmatchedCount: number;
}

export function compareShadowOutputs(
  dealId: string,
  legacy: Record<string, any>,
  modern: Record<string, any>
): ShadowRunComparison {
  const metrics: MetricComparisonResult[] = [];

  const keysToCompare = [
    'asking_price',
    'total_area',
    'land_area',
    'gross_yield',
    'vacancy_rate',
  ];

  for (const key of keysToCompare) {
    const legVal = legacy[key];
    const modVal = modern[key];

    if (typeof legVal === 'number' && typeof modVal === 'number') {
      const diff = Math.abs(legVal - modVal);
      const diffRate = legVal > 0 ? (diff / legVal) * 100 : 0;
      const isMatch = diffRate <= 0.1; // 0.1% tolerance
      metrics.push({
        metricName: key,
        legacyValue: legVal,
        modernValue: modVal,
        isMatch,
        discrepancyRatePct: Math.round(diffRate * 100) / 100,
      });
    } else {
      const isMatch = legVal === modVal;
      metrics.push({
        metricName: key,
        legacyValue: legVal,
        modernValue: modVal,
        isMatch,
      });
    }
  }

  const unmatchedCount = metrics.filter((m) => !m.isMatch).length;

  return {
    dealId,
    allMatch: unmatchedCount === 0,
    metrics,
    unmatchedCount,
  };
}
