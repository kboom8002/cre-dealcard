/**
 * D37 P0-1: Claim / Evidence 핵심 타입 정의
 *
 * 모든 외부 표시 항목은 Claim 객체를 통해서만 렌더러에 도달합니다.
 * 문자열이 직접 슬라이드에 가지 않습니다.
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-1
 * @see docs/impipe/IM_BROKER_SPEC_UPGRADE.md §1.2, §1.5
 */

import type { ProvenanceKind } from '../mobile-im/pptx/imlib';
import type { Calculation } from './calculation';

// ── Claim 상태 ──

/** Claim의 검증 상태. 렌더러는 이 상태를 보고 표시 방식을 결정합니다. */
export type ClaimStatus =
  | 'unverified'           // 아직 누구도 확인하지 않음
  | 'broker_checked'       // 중개인이 확인함
  | 'reconciled'           // 교차검증 통과
  | 'conflicted'           // 충돌 발생 — 해결 전 렌더 차단
  | 'stale'                // 기준일 90일 초과
  | 'not_available';       // 데이터 없음 — 빈 면 금지 트리거

// ── 증거 참조 ──

/** 하나의 Claim을 뒷받침하는 증거. 최소 1개 필수 (B04 차단). */
export interface EvidenceRef {
  /** 출처 식별자 — ProvenanceKind 9종(+1) 중 하나 */
  sourceId: ProvenanceKind;
  /** 공부 번호, API 응답 ID, 계약서 번호 등 */
  documentRef?: string;
  /** ISO 8601 — 증거의 기준일 */
  asOf: string;
  /** 발췌 (max 200자) */
  excerpt?: string;
}

// ── 07 §2.4 8종 책임 표시 ──

/** 외부 표기용 displayLabel — D36 §4.3 */
export const DISPLAY_LABELS: Record<string, string> = {
  registry:               '✓ 공부 확인',
  public_api:             '✓ 공부 확인',
  public_api_identified:  '✓ 공부 확인 · 중개인 식별',
  ledger:                 '✓ 계약서 확인',
  seller:                 '▲ 매도인 고지',
  broker:                 '● 중개인 현장확인',
  broker_aug:             '● 중개인 현장확인',
  expert:                 '★ 전문가 검증',
  derived:                '= 계산값',
  assumed:                '◇ 분석가정',
  not_available:          '? 미확인',
};

// ── Claim ──

/**
 * 외부에 표시되는 모든 사실·수치의 최소 단위.
 *
 * 🔴 불변조건:
 * - evidence.length >= 1 (0이면 B04 차단)
 * - value === null 이면 문장으로 메우지 않음
 * - status === 'conflicted' 이면 렌더 거부
 * - status === 'not_available' 이면 사유를 구체적으로 표시 (D36 §1.5)
 *   좋은 예: "정상화 순수익은 운영비 내역 미제출로 확정하지 않았습니다"
 *   나쁜 예: "자세한 내용은 추후 확인이 필요합니다" ← 금지
 */
export interface Claim {
  /** UUID v4 — 역추적 키. 슬라이드의 모든 수치가 이 ID로 추적됩니다. */
  id: string;
  /** 주장의 대상 (예: 'monthly_rent_total', 'noi_base', 'land_sqm') */
  subject: string;
  /** 확정된 값. null = 미확정 — 문장으로 메우지 않습니다 (07 §15.3) */
  value: number | string | null;
  /** 단위: '원', '㎡', '%', '개월' 등 */
  unit?: string;
  /** 🔴 최소 1개. 0개면 B04(G49) 차단 */
  evidence: EvidenceRef[];
  /** 내부 저장용 출처 (ProvenanceKind 9종 + 1) */
  provenance: ProvenanceKind;
  /** 외부 표기용 책임 표시 (07 §2.4 8종) */
  displayLabel: string;
  /** ISO 8601 — 기준일 필수 */
  asOf: string;
  /** 검증 상태 */
  status: ClaimStatus;
  /** 전문가 판단이 필요한 항목인지 */
  expertRequired: boolean;
  /** 중개인 승인자 (없으면 Draft) */
  approvedBy?: string;
  /** 계산으로 파생된 경우의 계산 정보 */
  calculation?: Calculation;
}

// ── 도우미 함수 ──

/**
 * D36 §1.5: Claim.value=null일 때 사유를 구체적으로 생성합니다.
 * "추후 확인이 필요합니다" 류의 일반 문구 생성을 구조적으로 방지합니다.
 */
export function formatNotAvailableReason(claim: Claim): string {
  const reason = claim.evidence[0]?.excerpt ?? '자료 미제출';
  const subjectLabel = claim.subject.replace(/_/g, ' ');
  return `${subjectLabel}은(는) ${reason}(으)로 확정하지 않았습니다`;
}

/**
 * Claim의 불변조건을 검사합니다.
 * @returns 위반 사유 배열 (빈 배열이면 정상)
 */
export function validateClaim(claim: Claim): string[] {
  const violations: string[] = [];

  if (claim.evidence.length === 0) {
    violations.push(`[B04/G49] Claim '${claim.subject}' (${claim.id})에 증거가 없습니다`);
  }

  if (claim.status === 'conflicted') {
    violations.push(`[B03/G48] Claim '${claim.subject}' (${claim.id})가 충돌 상태입니다`);
  }

  if (claim.value === null && claim.status !== 'not_available') {
    violations.push(`Claim '${claim.subject}' (${claim.id}): value=null인데 status가 'not_available'이 아닙니다`);
  }

  if (!claim.asOf) {
    violations.push(`[B09/G50] Claim '${claim.subject}' (${claim.id})에 기준일이 없습니다`);
  }

  return violations;
}
