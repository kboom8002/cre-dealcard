/**
 * D37 P0-1: im-core 모듈 진입점
 *
 * Claim 기반 데이터 흐름의 핵심 타입과 유틸리티를 re-export합니다.
 */

// 핵심 타입
export type { Claim, ClaimStatus, EvidenceRef } from './claim';
export { validateClaim, formatNotAvailableReason, DISPLAY_LABELS } from './claim';

// 계산
export type { Calculation, YieldBasis, Deduction } from './calculation';
export { validateCalculation, YIELD_BASIS_LABEL } from './calculation';

// 레지스트리
export { ClaimRegistry } from './claim-registry';
export type { CreateClaimOptions } from './claim-registry';

// 계산 엔진 (P0-2)
export { FinancialCalculator } from './financial-calculator';

// 발행 등급 (P0-3)
export type { ReleaseTier } from './release-tier';
export {
  resolveTier,
  getTierAllowedSections,
  TIER_DISPLAY_NAME,
  TIER_MIN_GRADE,
  TIER_EXTERNAL_ALLOWED,
} from './release-tier';
export type { ResolveTierInput } from './release-tier';

// DA 실값 검사 + 충돌 객체 (P0-4/P0-5)
export { deriveDataAvailability, detectConflict } from './data-availability';
export type { ConflictSubject, Conflict } from './data-availability';

// 환산보증금 + 실효임대료 (P1-3)
export {
  calculateConvertedDeposit,
  calculateEffectiveRent,
  registerLeaseCalcClaims,
  COMMERCIAL_LEASE_ACT_THRESHOLDS,
  CONVERTED_DEPOSIT_RATE,
} from './lease-calc';
export type {
  ConvertedDepositInput,
  ConvertedDepositResult,
  EffectiveRentInput,
  EffectiveRentResult,
} from './lease-calc';
