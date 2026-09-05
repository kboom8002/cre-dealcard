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

// 토지거래허가구역 (P1-2)
export { parsePermitZoneResponse, registerPermitZoneClaim } from './permit-zone';
export type { PermitZoneResult, PermitZoneSource } from './permit-zone';

// 책임 표시 displayLabel (P1-5)
export { getDisplayLabel, getTrustWeight, DISPLAY_LABEL_MAP } from './display-label';
export type { DisplayLabelConfig } from './display-label';

// Action Card (P1-4)
export { validateActionCard, registerActionCardClaims } from './action-card';
export type { ActionCard, ActionItem, Scenario, ScenarioType, ActionCardValidation } from './action-card';

// 승인 게이트 (P1-6)
export { runApprovalGate } from './approval-gate';
export type { ApprovalLevel, ApprovalGateResult, ApprovalBlocker } from './approval-gate';

// 한국법 필드 (P2-7)
export { registerKoreanLegalClaims } from './korean-legal';
export type { KoreanLegalFields, TransactionStructure, MgmtFeeStructure } from './korean-legal';

// 타깃 해시 (Target Hash)
export { computeTargetHash, canonicalizeJson, computeDeterministicClaimsHash } from './target-hash';
export type { CanonicalClaimEntry } from './target-hash';

// 크로스 채널 정합성 검증기 (Cross-Channel Consistency Checker)
export { verifyCrossChannelConsistency } from './cross-channel-checker';
export type { CrossChannelAuditReport, DiscrepancyItem } from './cross-channel-checker';

// 중개인 원본 입력치 검증 및 이상치 감지기 (Broker Input Validator)
export { validateBrokerInput, validateBuildingSpecs, registerProFormaClaims } from './broker-input-validator';
export type {
  BrokerInputDiscrepancy,
  BrokerInputValidationResult,
  BrokerPropertyInput,
  ProFormaClaimRegistrationInput,
  BuildingSpecsInput,
  BuildingSpecsValidationResult,
} from './broker-input-validator';

// 승인 원장 포트 및 서비스 (Approval Ledger Port & Service)
export type {
  ApprovalEvent,
  ApprovalEventType,
  ReleaseChannel,
  ReleaseStatus,
  ReleaseRecord,
  ApprovalLedgerPort,
  ReleaseRecordUpdates,
} from './approval/ledger-port';
export { ApprovalLedgerService, approvalLedgerService } from './approval/ledger-service';


