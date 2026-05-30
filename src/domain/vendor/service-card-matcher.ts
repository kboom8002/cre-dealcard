/**
 * Service Card Matcher — 서비스 카드 ↔ 매물/아고라 자동 매칭 엔진
 *
 * 매칭 트리거:
 *  - deal_completion:  거래 성사 → 인테리어, PM, 보험
 *  - vacancy_signal:   공실률 상승 → PM, 인테리어
 *  - readiness_check:  매각 준비 → 감정, 법률, 세무
 *  - gate_approval:    Gate G2 승인 → 법률, 금융
 *  - agora_question:   아고라 질문 → 카테고리 매칭
 *  - ai_recommendation: AI 자동 추천
 */

import type { VendorCategory } from "./vendor-tier";
import type { AgoraCategory } from "@/domain/agora/qis-seed-generator";

// ── 매칭 트리거 ────────────────────────────────────────────────
export type MatchTrigger =
  | "deal_completion"
  | "vacancy_signal"
  | "readiness_check"
  | "gate_approval"
  | "agora_question"
  | "manual"
  | "ai_recommendation";

// ── 매칭 결과 ────────────────────────────────────────────────
export interface ServiceMatchResult {
  serviceCardId: string;
  vendorCategory: VendorCategory;
  matchTrigger: MatchTrigger;
  matchScore: number; // 0~100
  reason: string;
}

// ── 거래 단계별 → 서비스 카테고리 매핑 ────────────────────────
const DEAL_STAGE_TO_SERVICES: Record<string, VendorCategory[]> = {
  // 매각 준비
  readiness_check:   ["appraisal", "legal", "tax"],
  // Gate 승인 (본격 거래)
  gate_approval:     ["legal", "finance", "insurance"],
  // 거래 완료 (매매)
  deal_completion_sale: ["interior", "pm_fm", "insurance"],
  // 거래 완료 (임대)
  deal_completion_lease: ["interior", "pm_fm"],
  // 공실 시그널
  vacancy_signal:    ["pm_fm", "interior"],
};

// ── 아고라 카테고리 → 서비스 카테고리 매핑 ─────────────────────
const AGORA_TO_SERVICE: Record<AgoraCategory, VendorCategory[]> = {
  sale:    ["legal", "tax", "appraisal"],
  lease:   ["legal", "interior", "pm_fm"],
  invest:  ["finance", "appraisal", "tax"],
  legal:   ["legal", "tax"],
  market:  ["appraisal", "finance"],
  manage:  ["pm_fm", "interior", "insurance"],
  finance: ["finance", "insurance"],
};

// ── Public API ─────────────────────────────────────────────────

/**
 * 거래 단계 기반 서비스 매칭
 */
export function matchByDealStage(
  stage: string,
  buildingRegion: string | null,
): VendorCategory[] {
  return DEAL_STAGE_TO_SERVICES[stage] ?? [];
}

/**
 * 아고라 질문 기반 서비스 매칭
 */
export function matchByAgoraCategory(
  category: AgoraCategory,
): VendorCategory[] {
  return AGORA_TO_SERVICE[category] ?? [];
}

/**
 * Supabase 쿼리 조건 생성
 * 서비스 카드를 region + category로 필터링
 */
export function buildServiceMatchQuery(opts: {
  vendorCategories: VendorCategory[];
  region?: string | null;
  limit?: number;
}) {
  return {
    categories: opts.vendorCategories,
    region: opts.region ?? null,
    limit: opts.limit ?? 2,
  };
}

/**
 * 매칭 점수 계산 (간단한 점수 로직)
 */
export function calculateMatchScore(opts: {
  regionMatch: boolean;
  categoryMatch: boolean;
  vendorTier: string;
  avgRating: number | null;
  completionCount: number;
}): number {
  let score = 0;

  // 카테고리 매칭 (필수)
  if (opts.categoryMatch) score += 30;

  // 지역 매칭
  if (opts.regionMatch) score += 25;

  // 평점 가산
  if (opts.avgRating) score += Math.min(opts.avgRating * 5, 20);

  // 실적 가산
  score += Math.min(opts.completionCount * 0.5, 15);

  // 프리미엄 파트너 가산
  if (opts.vendorTier === "premium") score += 10;
  else if (opts.vendorTier === "pro") score += 5;

  return Math.min(score, 100);
}
