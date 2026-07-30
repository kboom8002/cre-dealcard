/**
 * @module OwnerReportGenerator
 * @description Generates quarterly owner reports for property owners.
 * Includes market trends, comparable transactions, and asset valuation updates.
 * @see docs/credal_v3/SDD-magazine.md MG-C2
 */

export interface OwnerReport {
  assetId: string;
  ownerName: string;
  reportPeriod: string;
  marketSummary: string;
  comparableTransactions: ComparableTx[];
  valuationChange: { previous: number; current: number; changePct: number };
  sellSignals: SellSignal[];
  recommendations: string[];
  generatedAt: string;
}

interface ComparableTx {
  address: string;
  transactionDate: string;
  priceKrw: number;
  areaPyung: number;
  pricePyung: number;
}

interface SellSignal {
  type: string;
  description: string;
  confidence: number;
}

/**
 * Generates a quarterly owner report for a given asset.
 */
export async function generateOwnerReport(
  assetId: string,
  ownerName: string,
  assetData: Record<string, unknown>,
  comparables: ComparableTx[] = []
): Promise<OwnerReport> {
  const askingPrice = Number(assetData.askingPriceKrw || 0);
  const area = Number(assetData.totalFloorAreaPyung || 0);

  // Calculate valuation change based on comparables
  const avgComparablePrice = comparables.length > 0
    ? comparables.reduce((sum, c) => sum + c.pricePyung, 0) / comparables.length
    : 0;
  const currentPricePyung = area > 0 ? askingPrice / area : 0;
  const changePct = avgComparablePrice > 0
    ? ((currentPricePyung - avgComparablePrice) / avgComparablePrice) * 100
    : 0;

  // Detect sell signals
  const sellSignals: SellSignal[] = [];
  if (comparables.length >= 3) {
    const recentPrices = comparables.slice(-3).map(c => c.pricePyung);
    const trend = recentPrices[2] - recentPrices[0];
    if (trend > 0) {
      sellSignals.push({
        type: 'price_uptrend',
        description: '주변 거래가가 상승 추세입니다.',
        confidence: 0.7,
      });
    }
  }

  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  return {
    assetId,
    ownerName,
    reportPeriod: quarter,
    marketSummary: `${quarter} 분기 ${String(assetData.zoningRegion || '해당 지역')} 부동산 시장 동향 보고서입니다.`,
    comparableTransactions: comparables,
    valuationChange: {
      previous: avgComparablePrice,
      current: currentPricePyung,
      changePct: Math.round(changePct * 10) / 10,
    },
    sellSignals,
    recommendations: generateRecommendations(changePct, sellSignals),
    generatedAt: now.toISOString(),
  };
}

function generateRecommendations(changePct: number, signals: SellSignal[]): string[] {
  const recs: string[] = [];
  if (changePct > 5) {
    recs.push('주변 시세 대비 보유 자산 가치가 상승하고 있습니다. 매각 타이밍을 검토해 보세요.');
  }
  if (changePct < -5) {
    recs.push('주변 시세가 소폭 하락세입니다. 장기 보유 전략을 재점검해 보세요.');
  }
  if (signals.length > 0) {
    recs.push('시장 시그널이 감지되었습니다. 상세 분석을 위해 담당 중개인에게 문의하세요.');
  }
  if (recs.length === 0) {
    recs.push('현재 시장 상황은 안정적입니다. 다음 분기 보고서를 확인해 주세요.');
  }
  return recs;
}
