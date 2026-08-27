/**
 * D37 P0-3: ReleaseTier — 발행 등급 2축 (tier × grade)
 *
 * grade(L×P)는 자료의 두께를, tier는 결론의 깊이를 나타냅니다.
 * D등급은 종류와 무관하게 외부 배포 금지 (CF2 유지).
 *
 * D36 §4.1 + 07 §1.1:
 * - internal_only: 주소·가격만 → 내부 초안
 * - fact_om: 공부+사진+현장 → 사실형 OM
 * - analysis_im: +렌트롤 또는 비교사례 → 분석형 IM
 * - decision_im: +핵심증거+시나리오+기준일 → 매수의사결정지원 IM
 * - expert_required: 핵심 결론이 전문가 판단 → 제한 배포
 *
 * D36 §1.9: development는 Feasibility가 아니라 Screening.
 * 전문가 검토 없이 decision_im 불가.
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-3
 * @see docs/impipe/IM_BROKER_SPEC_UPGRADE.md §4.1
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { DataAvailability, Grade } from '../mobile-im/pptx/deck-sequencer';

// ── ReleaseTier 정의 ──

export type ReleaseTier =
  | 'internal_only'    // B0: 주소·가격 → 내부 초안. 외부 배포 금지
  | 'fact_om'          // B1: 공부+사진+현장 → 사실형 OM
  | 'analysis_im'      // B2: +렌트롤 또는 비교사례 → 분석형 IM
  | 'decision_im'      // BG: +핵심증거+시나리오+기준일 → 의사결정 지원 IM
  | 'expert_required'; // EX: 핵심 결론이 전문가 판단 → 제한 배포

/** tier별 외부 표기 명칭 */
export const TIER_DISPLAY_NAME: Record<ReleaseTier, string> = {
  internal_only:   '내부 초안 (Draft)',
  fact_om:         '사실형 매물소개서 (Fact OM)',
  analysis_im:     '분석형 투자보고서 (Analysis IM)',
  decision_im:     '매수검토 의사결정보고서 (Decision IM)',
  expert_required: '전문가 검토 필요 (Expert Required)',
};

/** tier별 등급 하한 */
export const TIER_MIN_GRADE: Record<ReleaseTier, Grade | null> = {
  internal_only:   'D',
  fact_om:         'C',
  analysis_im:     'C',
  decision_im:     'B',
  expert_required: null, // 등급 무관
};

/** tier별 외부 배포 가능 여부 */
export const TIER_EXTERNAL_ALLOWED: Record<ReleaseTier, boolean> = {
  internal_only:   false,
  fact_om:         true,
  analysis_im:     true,
  decision_im:     true,
  expert_required: false, // 제한 배포
};

// ── Tier 해석 ──

export interface ResolveTierInput {
  grade: Grade;
  posture: InvestmentPosture;
  dataAvailability: DataAvailability;
  /** 전문가 검토 완료 여부 */
  hasExpertReview?: boolean;
  /** 시나리오(Base/Upside/Downside) 존재 */
  hasScenario?: boolean;
  /** 기준일 존재 */
  hasAsOf?: boolean;
}

/**
 * 자료 가용성과 등급에 기반하여 ReleaseTier를 결정합니다.
 *
 * 🔴 설계 원칙:
 * - 자료 부족 시 등급이 아니라 산출물 종류를 바꿈
 * - hasRentRoll=false인 income → fact_om (analysis_im 발행 불가)
 * - development → 전문가 없으면 analysis_im까지만 (D36 §1.9 Screening)
 * - 기준일+시나리오 없으면 decision_im 불가
 */
export function resolveTier(input: ResolveTierInput): ReleaseTier {
  const { grade, posture, dataAvailability: da } = input;

  // D등급 → 무조건 internal_only (CF2)
  if (grade === 'D') {
    return 'internal_only';
  }

  // 공부+사진 기본 자료 부족 → internal_only
  const hasBasicData = da.hasBuildingRegister !== false && da.hasLandUsePlan !== false;
  if (!hasBasicData) {
    return 'internal_only';
  }

  // 렌트롤/비교사례 부족 → fact_om
  const hasAnalysisData = da.hasRentRoll === true || da.hasComparables === true;
  if (!hasAnalysisData) {
    return 'fact_om';
  }

  // 🔴 D36 §1.9: development는 전문가 없으면 analysis_im까지만 (Screening)
  if (posture === 'development' && !input.hasExpertReview) {
    return 'analysis_im';
  }

  // 기준일+시나리오 부족 → analysis_im
  if (!input.hasAsOf || !input.hasScenario) {
    return 'analysis_im';
  }

  // 등급 B 이상 + 전부 충족 → decision_im
  if (grade === 'A' || grade === 'B') {
    return 'decision_im';
  }

  // C등급은 analysis_im까지
  return 'analysis_im';
}

// ── Tier별 면 구성 가이드 ──

/**
 * tier에 따라 개방 가능한 면 카테고리를 반환합니다.
 * deck-sequencer에서 면 구성 시 이 정보를 사용합니다.
 */
export function getTierAllowedSections(tier: ReleaseTier): {
  allowFinancials: boolean;
  allowScenario: boolean;
  allowValueAdd: boolean;
  allowRentGap: boolean;
  maxBodyPages: number;
} {
  switch (tier) {
    case 'internal_only':
      return { allowFinancials: false, allowScenario: false, allowValueAdd: false, allowRentGap: false, maxBodyPages: 8 };
    case 'fact_om':
      return { allowFinancials: false, allowScenario: false, allowValueAdd: false, allowRentGap: false, maxBodyPages: 12 };
    case 'analysis_im':
      return { allowFinancials: true, allowScenario: false, allowValueAdd: true, allowRentGap: true, maxBodyPages: 15 };
    case 'decision_im':
      return { allowFinancials: true, allowScenario: true, allowValueAdd: true, allowRentGap: true, maxBodyPages: 16 };
    case 'expert_required':
      return { allowFinancials: false, allowScenario: false, allowValueAdd: false, allowRentGap: false, maxBodyPages: 10 };
  }
}
