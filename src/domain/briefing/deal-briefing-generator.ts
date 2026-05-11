/**
 * Deal Briefing Generator — Phase 3 ⑩
 * Generates cross-system AI briefing for a building:
 * - Similar deal patterns from deal_casepacks
 * - Buyer purpose distribution from match_results
 * - Vacancy status from leasing data
 * - Pipeline hold warnings from deal_pipeline_states
 * - Recommended next actions
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

export interface DealBriefing {
  buildingId: string;
  // Similar deals
  similarDealCount: number;
  dominantPurpose: string | null;       // e.g. "사옥 수요 68%"
  avgMatchScore: number | null;
  // Pipeline
  currentStage: string | null;
  holdDays: number;
  holdWarning: string | null;
  // Vacancy
  vacancyStatus: {
    inquiryCount: number;
    avgFitScore: number | null;
    demandVerified: boolean;
  };
  // Actions
  recommendedActions: RecommendedAction[];
  generatedAt: string;
}

export interface RecommendedAction {
  label: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export async function generateDealBriefing(
  buildingId: string,
  brokerId: string,
): Promise<DealBriefing> {
  const supabase = getServiceClient();

  // Fetch building base data
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('area_signal, asset_type, price_band, vacancy_inquiry_count, vacancy_avg_fit_score, vacancy_demand_verified')
    .eq('id', buildingId)
    .single();

  // ── Similar deals from deal_casepacks ────────────────────────────
  const { data: casepacks } = await supabase
    .from('deal_casepacks')
    .select('task, knowledge, warning, situation')
    .eq('broker_id', brokerId)
    .neq('building_ssot_lite_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(20);

  const similarDeals = (casepacks ?? []).filter((cp) => {
    if (!building) return false;
    return (
      cp.knowledge?.includes(building.area_signal) ||
      cp.knowledge?.includes(building.asset_type)
    );
  });

  // ── Buyer purpose distribution from match_results ────────────────
  const { data: matches } = await supabase
    .from('match_results')
    .select('purpose_weight_profile, score')
    .eq('building_ssot_lite_id', buildingId)
    .in('grade', ['S', 'A', 'B']);

  const purposeCounts: Record<string, number> = {};
  let totalMatchScore = 0;
  for (const m of matches ?? []) {
    const p = m.purpose_weight_profile ?? 'default';
    purposeCounts[p] = (purposeCounts[p] ?? 0) + 1;
    totalMatchScore += m.score ?? 0;
  }
  const matchCount = matches?.length ?? 0;
  const dominantPurpose = matchCount > 0
    ? getDominantPurpose(purposeCounts, matchCount)
    : null;
  const avgMatchScore = matchCount > 0
    ? Math.round((totalMatchScore / matchCount) * 10) / 10
    : null;

  // ── Pipeline state ───────────────────────────────────────────────
  const { data: pipelineRows } = await supabase
    .from('deal_pipeline_states')
    .select('stage, entered_at')
    .eq('building_ssot_lite_id', buildingId)
    .order('entered_at', { ascending: false })
    .limit(1);

  const pipeline = pipelineRows?.[0] ?? null;
  let holdDays = 0;
  let holdWarning: string | null = null;
  let currentStage: string | null = null;

  if (pipeline) {
    currentStage = pipeline.stage;
    holdDays = Math.floor(
      (Date.now() - new Date(pipeline.entered_at).getTime()) / 86_400_000,
    );
    if (holdDays >= 14) {
      holdWarning = `현재 단계(${pipeline.stage}) 진입 후 ${holdDays}일 경과 — 다음 단계를 진행해보세요`;
    }
  }

  // ── Build recommended actions ────────────────────────────────────
  const actions = buildRecommendedActions({
    matchCount,
    inquiryCount: building?.vacancy_inquiry_count ?? 0,
    demandVerified: building?.vacancy_demand_verified ?? false,
    currentStage,
    holdDays,
  });

  return {
    buildingId,
    similarDealCount: similarDeals.length,
    dominantPurpose,
    avgMatchScore,
    currentStage,
    holdDays,
    holdWarning,
    vacancyStatus: {
      inquiryCount: building?.vacancy_inquiry_count ?? 0,
      avgFitScore: building?.vacancy_avg_fit_score ?? null,
      demandVerified: building?.vacancy_demand_verified ?? false,
    },
    recommendedActions: actions,
    generatedAt: new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function getDominantPurpose(
  counts: Record<string, number>,
  total: number,
): string {
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (!sorted.length) return '매수 목적 분석 중';
  const [top, count] = sorted[0];
  const pct = Math.round((count / total) * 100);
  return `${top} 수요 ${pct}%`;
}

function buildRecommendedActions(ctx: {
  matchCount: number;
  inquiryCount: number;
  demandVerified: boolean;
  currentStage: string | null;
  holdDays: number;
}): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (ctx.matchCount === 0) {
    actions.push({
      label: '매수자 조건 등록하기',
      action: 'create_buyer_intent',
      priority: 'high',
    });
  }

  if (ctx.inquiryCount === 0) {
    actions.push({
      label: 'AI 임대 홈페이지 만들기',
      action: 'trigger_space_ai',
      priority: 'high',
    });
  }

  if (ctx.demandVerified) {
    actions.push({
      label: '임대 수요 검증됨 — 모바일 투자설명서 만들기',
      action: 'create_mobile_im',
      priority: 'high',
    });
  }

  if (ctx.holdDays >= 14 && ctx.currentStage) {
    actions.push({
      label: '딜 진행 상황 업데이트',
      action: 'update_pipeline',
      priority: 'medium',
    });
  }

  if (ctx.matchCount > 0 && ctx.matchCount < 3) {
    actions.push({
      label: '매수자 매칭 더 찾아보기',
      action: 'find_more_buyers',
      priority: 'medium',
    });
  }

  return actions;
}
