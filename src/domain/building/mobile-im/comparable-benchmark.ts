import { ComparableListing } from "../../../lib/external/naver-realestate-api";

export interface BenchmarkMetrics {
  targetPriceKrw: number;
  targetPricePerSqm: number;
  avgComparablePricePerSqm: number;
  premiumPct: number; // 대상 물건이 주변 시세 대비 얼마나 프리미엄/디스카운트가 있는지 (%)
  competitivenessStatus: "Highly Competitive" | "Market Rate" | "Overpriced";
}

/**
 * 대상 물건의 가격을 주변 유사 매물(호가/실거래가)과 비교하여 벤치마킹 지표를 산출합니다.
 */
export function calculateBenchmarkMetrics(
  targetPriceKrw: number,
  targetAreaSqm: number,
  comparables: ComparableListing[]
): BenchmarkMetrics {
  const targetPricePerSqm = targetAreaSqm > 0 ? targetPriceKrw / targetAreaSqm : 0;
  
  if (comparables.length === 0 || targetPricePerSqm === 0) {
    return {
      targetPriceKrw,
      targetPricePerSqm,
      avgComparablePricePerSqm: 0,
      premiumPct: 0,
      competitivenessStatus: "Market Rate"
    };
  }

  // 평균 ㎡당 단가 산출
  const totalSqmPrice = comparables.reduce((acc, curr) => acc + curr.pricePerSqmKrw, 0);
  const avgComparablePricePerSqm = totalSqmPrice / comparables.length;

  // 프리미엄 = (타겟 단가 - 평균 단가) / 평균 단가 * 100
  // 음수면 디스카운트(저렴), 양수면 프리미엄(비쌈)
  const premiumPct = ((targetPricePerSqm - avgComparablePricePerSqm) / avgComparablePricePerSqm) * 100;

  let competitivenessStatus: "Highly Competitive" | "Market Rate" | "Overpriced" = "Market Rate";
  if (premiumPct < -5) {
    competitivenessStatus = "Highly Competitive";
  } else if (premiumPct > 10) {
    competitivenessStatus = "Overpriced";
  }

  return {
    targetPriceKrw,
    targetPricePerSqm,
    avgComparablePricePerSqm,
    premiumPct,
    competitivenessStatus
  };
}
