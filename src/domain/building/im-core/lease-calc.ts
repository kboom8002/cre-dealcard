/**
 * D37 P1-3: 환산보증금 + 실효임대료 계산기
 *
 * 상가건물 임대차보호법 시행령 제2조에 따른 환산보증금 계산.
 * 지역별 보호 기준금액은 SSOT에서 관리 (AGENTS.md §8 임계값 하드코딩 금지).
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P1-3
 */

import type { ClaimRegistry, CreateClaimOptions } from './claim-registry';

// ── 지역별 보호 기준금액 (SSOT) ──
// credeal/ssot/im.legal-thresholds.yaml 대응
// TODO: YAML 로더 구현 후 파일에서 읽기. 현재는 코드 상수로 관리하되
// 임계값 변경 시 이 파일만 수정하면 됨.

export const COMMERCIAL_LEASE_ACT_THRESHOLDS: Record<string, number> = {
  '서울': 900_000_000,
  '수도권과밀억제': 690_000_000,
  '광역시': 540_000_000,
  '기타': 370_000_000,
};

export const CONVERTED_DEPOSIT_RATE = 0.12; // 연 12% (시행령 기준 환산율)
export const THRESHOLD_EFFECTIVE_DATE = '2024-01-01';

// ── 환산보증금 계산 ──

export interface ConvertedDepositInput {
  /** 보증금 (원) */
  deposit: number;
  /** 월 임대료 (원) */
  monthlyRent: number;
  /** 지역 분류 */
  region: '서울' | '수도권과밀억제' | '광역시' | '기타';
}

export interface ConvertedDepositResult {
  /** 환산보증금 (원) = 보증금 + (월 차임 × 100 / 연 환산율%) */
  convertedDeposit: number;
  /** 보호 기준금액 (원) */
  protectionThreshold: number;
  /** 보호 대상 여부 */
  isProtected: boolean;
  /** 계산 근거 */
  formula: string;
}

/**
 * 환산보증금을 계산합니다.
 *
 * 환산보증금 = 보증금 + (월 차임 × 100 / 연 환산율%)
 * = 보증금 + (월 차임 × 100 / 12)
 * = 보증금 + (월 차임 / 0.12 × 12)
 */
export function calculateConvertedDeposit(input: ConvertedDepositInput): ConvertedDepositResult {
  const { deposit, monthlyRent, region } = input;

  // 환산보증금 = 보증금 + (월 차임 / 월 환산율)
  // 월 환산율 = 연 환산율 / 12 = 0.12 / 12 = 0.01
  const convertedDeposit = deposit + (monthlyRent / (CONVERTED_DEPOSIT_RATE / 12));

  const protectionThreshold = COMMERCIAL_LEASE_ACT_THRESHOLDS[region] ?? COMMERCIAL_LEASE_ACT_THRESHOLDS['기타'];
  const isProtected = convertedDeposit <= protectionThreshold;

  return {
    convertedDeposit,
    protectionThreshold,
    isProtected,
    formula: `${deposit.toLocaleString('ko-KR')} + (${monthlyRent.toLocaleString('ko-KR')} / ${(CONVERTED_DEPOSIT_RATE / 12).toFixed(4)}) = ${convertedDeposit.toLocaleString('ko-KR')}원`,
  };
}

// ── 실효임대료 ──

export interface EffectiveRentInput {
  /** 보증금 (원) */
  deposit: number;
  /** 월 임대료 (원) */
  monthlyRent: number;
  /** 보증금 운용수익률 (연, 기본 3.5%) */
  depositYieldPct?: number;
  /** 전용면적 (㎡) */
  exclusiveAreaSqm?: number;
}

export interface EffectiveRentResult {
  /** 실효 월 임대료 = 월 임대료 + (보증금 × 기회비용률 / 12) */
  effectiveMonthlyRent: number;
  /** 보증금 기회비용 (월) */
  depositOpportunityCostMonthly: number;
  /** 실효 임대료 단가 (원/㎡/월) */
  effectiveRentPerSqm?: number;
  /** 계산 근거 */
  formula: string;
}

export function calculateEffectiveRent(input: EffectiveRentInput): EffectiveRentResult {
  const { deposit, monthlyRent } = input;
  const yieldRate = (input.depositYieldPct ?? 3.5) / 100;

  const depositOpportunityCostMonthly = deposit * yieldRate / 12;
  const effectiveMonthlyRent = monthlyRent + depositOpportunityCostMonthly;

  const effectiveRentPerSqm = input.exclusiveAreaSqm && input.exclusiveAreaSqm > 0
    ? effectiveMonthlyRent / input.exclusiveAreaSqm
    : undefined;

  return {
    effectiveMonthlyRent,
    depositOpportunityCostMonthly,
    effectiveRentPerSqm,
    formula: `${monthlyRent.toLocaleString('ko-KR')} + (${deposit.toLocaleString('ko-KR')} × ${(yieldRate * 100).toFixed(1)}% / 12) = ${Math.round(effectiveMonthlyRent).toLocaleString('ko-KR')}원/월`,
  };
}

// ── Claim 등록 어댑터 ──

/**
 * 환산보증금 + 실효임대료를 ClaimRegistry에 등록합니다.
 * FinancialCalculator에서 호출합니다.
 */
export function registerLeaseCalcClaims(
  registry: ClaimRegistry,
  converted: ConvertedDepositResult,
  effective: EffectiveRentResult,
  asOf: string,
): void {
  const base: Pick<CreateClaimOptions, 'provenance' | 'asOf' | 'status'> = {
    provenance: 'derived',
    asOf,
    status: 'reconciled',
  };

  registry.register({
    ...base,
    subject: 'converted_deposit',
    value: converted.convertedDeposit,
    unit: '원',
    evidence: [{ sourceId: 'derived', asOf, excerpt: converted.formula }],
  });

  registry.register({
    ...base,
    subject: 'lease_protection',
    value: converted.isProtected ? 1 : 0,
    unit: '',
    evidence: [{ sourceId: 'derived', asOf, excerpt: `환산보증금 ${converted.isProtected ? '≤' : '>'} 기준금액 ${converted.protectionThreshold.toLocaleString('ko-KR')}원` }],
  });

  registry.register({
    ...base,
    subject: 'effective_monthly_rent',
    value: effective.effectiveMonthlyRent,
    unit: '원/월',
    evidence: [{ sourceId: 'derived', asOf, excerpt: effective.formula }],
  });

  if (effective.effectiveRentPerSqm !== undefined) {
    registry.register({
      ...base,
      subject: 'effective_rent_per_sqm',
      value: effective.effectiveRentPerSqm,
      unit: '원/㎡/월',
      evidence: [{ sourceId: 'derived', asOf }],
    });
  }
}
