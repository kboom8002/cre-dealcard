/**
 * D37 P1-5: 책임 표시 displayLabel — 07 §2.4 8종 매핑
 *
 * ProvenanceKind → 외부 노출 문자열로 변환합니다.
 * 내부는 ProvenanceKind 유지, 외부(PPTX/웹)에서는 displayLabel 사용.
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P1-5
 */

import type { ProvenanceKind } from '../mobile-im/pptx/imlib';
import type { ClaimStatus } from './claim';

// ── 8종 책임 표시 매핑 (07 §2.4) ──

export interface DisplayLabelConfig {
  /** 외부 노출 문자열 */
  label: string;
  /** 아이콘/기호 */
  icon: string;
  /** 신뢰도 가중치 (높을수록 신뢰) */
  trustWeight: number;
}

export const DISPLAY_LABEL_MAP: Record<string, DisplayLabelConfig> = {
  // S1: 공적 장부
  registry:              { label: '공부 확인',         icon: '✓', trustWeight: 5 },
  public_api:            { label: '공부 확인',         icon: '✓', trustWeight: 5 },
  public_api_identified: { label: '공부 확인',         icon: '✓', trustWeight: 5 },

  // S2: 계약서
  ledger:                { label: '계약서 확인',       icon: '✓', trustWeight: 4 },

  // S3: 매도인 고지
  seller:                { label: '매도인 고지',       icon: '▲', trustWeight: 3 },

  // S4: 중개인 현장확인
  broker:                { label: '중개인 현장확인',   icon: '●', trustWeight: 3 },
  broker_opinion:        { label: '중개인 시장의견',   icon: '●', trustWeight: 2 },

  // S5: 계산값
  derived:               { label: '계산값',            icon: '=', trustWeight: 4 },

  // S6: 분석가정
  assumed:               { label: '분석가정',          icon: '◇', trustWeight: 1 },

  // S7: 미확인
  not_available:         { label: '미확인',            icon: '?', trustWeight: 0 },
};

/**
 * ProvenanceKind를 외부 표기 문자열로 변환합니다.
 * Claim.status가 'not_available'이면 무조건 '미확인'을 반환합니다.
 */
export function getDisplayLabel(
  provenance: ProvenanceKind | string,
  claimStatus?: ClaimStatus,
): string {
  // status가 not_available이면 출처와 무관하게 미확인
  if (claimStatus === 'not_available') {
    return `${DISPLAY_LABEL_MAP.not_available.icon} ${DISPLAY_LABEL_MAP.not_available.label}`;
  }

  const config = DISPLAY_LABEL_MAP[provenance];
  if (!config) {
    return `? ${provenance}`;
  }

  return `${config.icon} ${config.label}`;
}

/**
 * 신뢰도 가중치를 반환합니다.
 * grade-engine 등에서 사용합니다.
 */
export function getTrustWeight(provenance: ProvenanceKind | string): number {
  return DISPLAY_LABEL_MAP[provenance]?.trustWeight ?? 1;
}
