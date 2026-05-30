/**
 * Market Report Generator
 *
 * 특정 지역의 시장 리포트를 building_ssot_lite, match_results 데이터를 기반으로 생성합니다.
 * 외부 AI 호출 없이 집계 데이터만으로 요약, 하이라이트, FAQ를 구성합니다.
 */
import { createServiceClient } from "@/lib/supabase/service";

// ── Interfaces ──────────────────────────────────────────────────────

export interface MarketSummaryStats {
  /** 평균 가격대 (price_band 기준) */
  avgPrice: string;
  /** 해당 지역 딜카드 수 */
  dealCount: number;
  /** 매수 수요 건수 */
  matchDemand: number;
  /** 공실률 (플레이스홀더) */
  vacancyRate: string;
}

export interface MarketFaqItem {
  question: string;
  answer: string;
}

export interface MarketReport {
  region: string;
  period: string;
  summaryStats: MarketSummaryStats;
  highlights: string[];
  faq: MarketFaqItem[];
  generatedAt: string;
}

// ── Main Function ───────────────────────────────────────────────────

export async function generateMarketReport(
  region: string,
): Promise<MarketReport> {
  const supabase = createServiceClient();

  // 1. 해당 지역의 building_ssot_lite 조회
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .eq("area_signal", region);

  const allBuildings = buildings ?? [];
  const dealCount = allBuildings.length;

  // 가격대 집계
  const priceBandCounts: Record<string, number> = {};
  for (const b of allBuildings) {
    if (b.price_band) {
      priceBandCounts[b.price_band] = (priceBandCounts[b.price_band] ?? 0) + 1;
    }
  }
  const avgPrice = getMostFrequentPriceBand(priceBandCounts);

  // 자산유형 집계 (하이라이트용)
  const assetTypeCounts: Record<string, number> = {};
  for (const b of allBuildings) {
    if (b.asset_type) {
      assetTypeCounts[b.asset_type] =
        (assetTypeCounts[b.asset_type] ?? 0) + 1;
    }
  }

  // 2. match_results에서 수요 시그널
  const buildingIds = allBuildings.map((b) => b.id);
  let matchDemand = 0;
  if (buildingIds.length > 0) {
    const { count } = await supabase
      .from("match_results")
      .select("id", { count: "exact", head: true })
      .in("building_ssot_lite_id", buildingIds);
    matchDemand = count ?? 0;
  }

  // 3. 기간 계산
  const now = new Date();
  const period = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // 4. 하이라이트 생성
  const highlights = buildHighlights(
    region,
    dealCount,
    matchDemand,
    assetTypeCounts,
  );

  // 5. FAQ 생성
  const faq = buildFaq(region, dealCount, matchDemand, avgPrice);

  return {
    region,
    period,
    summaryStats: {
      avgPrice,
      dealCount,
      matchDemand,
      vacancyRate: "데이터 수집 중",
    },
    highlights,
    faq,
    generatedAt: new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function getMostFrequentPriceBand(
  counts: Record<string, number>,
): string {
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) return "데이터 없음";
  return sorted[0][0];
}

function topNKeys(
  counts: Record<string, number>,
  n: number,
): string[] {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key]) => key);
}

function buildHighlights(
  region: string,
  dealCount: number,
  matchDemand: number,
  assetTypeCounts: Record<string, number>,
): string[] {
  const highlights: string[] = [];

  if (dealCount > 0) {
    highlights.push(
      `${region} 지역에 현재 ${dealCount}건의 딜카드가 등록되어 있습니다.`,
    );
  } else {
    highlights.push(
      `${region} 지역에 아직 등록된 딜카드가 없습니다.`,
    );
  }

  if (matchDemand > 0) {
    highlights.push(
      `총 ${matchDemand}건의 매수 수요 매칭이 발생했습니다.`,
    );
  }

  const topAssets = topNKeys(assetTypeCounts, 2);
  if (topAssets.length > 0) {
    highlights.push(
      `주요 자산유형: ${topAssets.join(", ")}`,
    );
  }

  // 항상 최소 3개의 하이라이트를 반환
  while (highlights.length < 3) {
    highlights.push("추가 시장 데이터가 축적되면 더 자세한 분석을 제공합니다.");
  }

  return highlights.slice(0, 3);
}

function buildFaq(
  region: string,
  dealCount: number,
  matchDemand: number,
  avgPrice: string,
): MarketFaqItem[] {
  return [
    {
      question: `${region} 지역의 현재 매물 현황은?`,
      answer:
        dealCount > 0
          ? `현재 ${dealCount}건의 딜카드가 등록되어 있으며, 주요 가격대는 ${avgPrice}입니다.`
          : `아직 등록된 딜카드가 없습니다. 새로운 매물이 등록되면 업데이트됩니다.`,
    },
    {
      question: `${region} 지역의 매수 수요는 어떤가요?`,
      answer:
        matchDemand > 0
          ? `총 ${matchDemand}건의 매칭 수요가 확인되었으며 활발한 투자 관심이 있습니다.`
          : `현재 매칭된 매수 수요가 없습니다. 조건을 등록하면 자동 매칭됩니다.`,
    },
    {
      question: `${region} 지역 투자 시 유의할 점은?`,
      answer:
        "지역별 공시지가 변동, 개발 호재, 임대 수익률 등을 종합적으로 검토하시기 바랍니다. 상세 분석은 브로커 상담을 통해 확인할 수 있습니다.",
    },
  ];
}
