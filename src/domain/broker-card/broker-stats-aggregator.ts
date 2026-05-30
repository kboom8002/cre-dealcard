/**
 * Broker Stats Aggregator
 *
 * 브로커의 종합 실적 데이터를 여러 테이블에서 집계합니다:
 * - building_ssot_lite  → 총 딜카드 수, 지역/자산유형 분포
 * - match_results       → S/A 등급 매칭률
 * - deal_pipeline_states → 평균 딜 소요일
 * - deal_casepacks      → 총 케이스팩 수
 * - activity_events     → 최근 활동
 */
import { createServiceClient } from "@/lib/supabase/service";

// ── Interfaces ──────────────────────────────────────────────────────

export interface RecentDeal {
  buildingId: string;
  areaSignal: string | null;
  assetType: string | null;
  priceBand: string | null;
  createdAt: string;
}

export interface BrokerStats {
  /** 총 등록 딜카드 수 */
  totalDealCards: number;
  /** S/A 등급 매칭률 (0–1) */
  sGradeMatchRate: number;
  /** 평균 딜 소요일 */
  avgDealDays: number;
  /** 총 케이스팩 수 */
  totalCasePacks: number;
  /** 전문 지역 (상위 3) */
  specialtyRegions: string[];
  /** 전문 자산유형 (상위 2) */
  specialtyAssetTypes: string[];
  /** 현재 활성 딜 수 */
  activeDealCount: number;
  /** 최근 딜 (최대 3건) */
  recentDeals: RecentDeal[];
}

// ── Main Function ───────────────────────────────────────────────────

export async function aggregateBrokerStats(
  brokerId: string,
): Promise<BrokerStats> {
  const supabase = createServiceClient();

  // 1. 총 딜카드 + 지역/자산유형 분포
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status, created_at")
    .eq("owner_id", brokerId);

  const allBuildings = buildings ?? [];
  const totalDealCards = allBuildings.length;

  // 지역 빈도 카운트 → 상위 3
  const regionCounts: Record<string, number> = {};
  const assetTypeCounts: Record<string, number> = {};

  for (const b of allBuildings) {
    if (b.area_signal) {
      regionCounts[b.area_signal] = (regionCounts[b.area_signal] ?? 0) + 1;
    }
    if (b.asset_type) {
      assetTypeCounts[b.asset_type] = (assetTypeCounts[b.asset_type] ?? 0) + 1;
    }
  }

  const specialtyRegions = topN(regionCounts, 3);
  const specialtyAssetTypes = topN(assetTypeCounts, 2);

  // 활성 딜 수 (status가 closed/cancelled 아닌 것)
  const activeDealCount = allBuildings.filter(
    (b) => b.status !== "closed" && b.status !== "cancelled",
  ).length;

  // 최근 딜 3건
  const recentDeals: RecentDeal[] = allBuildings
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 3)
    .map((b) => ({
      buildingId: b.id,
      areaSignal: b.area_signal,
      assetType: b.asset_type,
      priceBand: b.price_band,
      createdAt: b.created_at,
    }));

  // 2. S/A 등급 매칭률
  const { data: matches } = await supabase
    .from("match_results")
    .select("grade")
    .eq("broker_id", brokerId);

  const allMatches = matches ?? [];
  const totalMatches = allMatches.length;
  const saCount = allMatches.filter(
    (m) => m.grade === "S" || m.grade === "A",
  ).length;
  const sGradeMatchRate =
    totalMatches > 0 ? Math.round((saCount / totalMatches) * 100) / 100 : 0;

  // 3. 평균 딜 소요일
  const { data: pipelineRows } = await supabase
    .from("deal_pipeline_states")
    .select("building_ssot_lite_id, stage, entered_at")
    .eq("broker_id", brokerId)
    .order("entered_at", { ascending: true });

  const avgDealDays = computeAvgDealDays(pipelineRows ?? []);

  // 4. 총 케이스팩 수
  const { count: casepackCount } = await supabase
    .from("deal_casepacks")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", brokerId);

  const totalCasePacks = casepackCount ?? 0;

  return {
    totalDealCards,
    sGradeMatchRate,
    avgDealDays,
    totalCasePacks,
    specialtyRegions,
    specialtyAssetTypes,
    activeDealCount,
    recentDeals,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** 빈도 맵에서 상위 N개 키를 반환합니다. */
function topN(counts: Record<string, number>, n: number): string[] {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key]) => key);
}

interface PipelineRow {
  building_ssot_lite_id: string;
  stage: string;
  entered_at: string;
}

/**
 * 딜별 첫 파이프라인 진입 ~ 마지막 진입 간 일수 평균을 계산합니다.
 * 단일 stage만 있는 딜은 0일로 처리합니다.
 */
function computeAvgDealDays(rows: PipelineRow[]): number {
  if (rows.length === 0) return 0;

  // 딜(building_ssot_lite_id)별로 그룹핑
  const dealMap: Record<string, number[]> = {};
  for (const row of rows) {
    const key = row.building_ssot_lite_id;
    if (!dealMap[key]) dealMap[key] = [];
    dealMap[key].push(new Date(row.entered_at).getTime());
  }

  let totalDays = 0;
  let dealCount = 0;

  for (const timestamps of Object.values(dealMap)) {
    if (timestamps.length < 2) continue;
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    totalDays += (maxT - minT) / 86_400_000;
    dealCount++;
  }

  if (dealCount === 0) return 0;
  return Math.round(totalDays / dealCount);
}
