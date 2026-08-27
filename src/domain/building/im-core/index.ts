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
