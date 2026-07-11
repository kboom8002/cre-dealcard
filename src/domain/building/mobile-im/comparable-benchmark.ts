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

/**
 * [E1] 벤치마킹 지표를 모바일 IM용 마크다운 테이블로 포맷팅합니다.
 */
export function formatBenchmarkMarkdown(metrics: BenchmarkMetrics, compsCount: number): string {
  const statusEmoji =
    metrics.competitivenessStatus === "Highly Competitive" ? "🟢"
    : metrics.competitivenessStatus === "Overpriced" ? "🔴"
    : "🟡";
  const premiumLabel = metrics.premiumPct > 0
    ? `+${metrics.premiumPct.toFixed(1)}% 프리미엄`
    : `${metrics.premiumPct.toFixed(1)}% 디스카운트`;

  return `### 권역 시세 벤치마킹 (실거래 분석)
| 항목 | 수치 |
|------|------|
| **본 자산 ㎡당 단가** | ${Math.round(metrics.targetPricePerSqm).toLocaleString()}원/㎡ |
| **권역 평균 ㎡당 단가** | ${Math.round(metrics.avgComparablePricePerSqm).toLocaleString()}원/㎡ |
| **시세 대비 포지션** | ${statusEmoji} **${premiumLabel}** |
| **경쟁력 판정** | ${metrics.competitivenessStatus === "Highly Competitive" ? "**저평가 — 매력적 진입 가격**" : metrics.competitivenessStatus === "Overpriced" ? "**고평가 — 협상 여지 검토**" : "**시세 적정 수준**"} |
| **비교 사례 수** | ${compsCount}건 |

> 최근 인근 실거래 기준. 개별 물건 조건(층수, 임차인, 리모델링 이력)에 따라 차이가 있습니다.`;
}

