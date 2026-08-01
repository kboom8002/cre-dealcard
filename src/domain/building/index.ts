/**
 * @module building
 * @description CREDEAL v3 Building Domain — Public API barrel export.
 *
 * All domain modules are re-exported from this single entry point,
 * organized by functional category. Import from here instead of
 * individual module files.
 *
 * @example
 * ```ts
 * import { calculateNOI, computeDataGrade, validateAssetConstraints } from '@/domain/building';
 * ```
 */

// ─── L1: Financial Calculations (재무 중앙 계산) ────────────────────────
export {
  calculateNOI,
  calculateCapRate,
  calculateEquityRequired,
  computeFinancialSummary,
} from './financials';
export type { FinancialInputs, CalculationResult, FinancialSummary } from './financials';

// ─── L1: Data Grading & Validation (등급 평가 · 제약 검증) ──────────────
export { computeDataGrade } from '../asset/grade-engine';
export type { DataGrade, DataGradeResult } from '../asset/grade-engine';

export { validateAssetConstraints } from '../asset/constraint-validator';
export type { ConstraintViolation, ConstraintValidationResult } from '../asset/constraint-validator';

export { computeLayerScore, getEligibleOutputs, LAYER_WEIGHTS } from './layer-score-engine';
export type { ChecklistInput } from './layer-score-engine';

// ─── L1: Deal Classification (딜 아키타입 분류) ─────────────────────────
export { classifyDealArchetype } from '../deal/archetype-classifier';
export type { DealArchetype, ArchetypeClassificationResult } from '../deal/archetype-classifier';

// ─── L1: Legal Guardrails (법적 가드레일) ───────────────────────────────
export { validateColdModePitchGuard, sanitizeComplianceText } from './guardrails';
export type { PitchGenerationContext, GuardrailCheckResult } from './guardrails';

// ─── L2: Tacit Knowledge Capture (암묵지 수집) ──────────────────────────
export { recordTacitLabel } from '../tacit/tacit-label-service';
export type { TacitLabelCategory, TacitLabelEntry } from '../tacit/tacit-label-service';

export { computeEditDiff } from './edit-diff-collector';
export type { EditDiffPayload, EditDiffRecord } from './edit-diff-collector';

// ─── L2: Document Parsing (문서 파싱) ───────────────────────────────────
export { parseDocumentOCR, confirmOCRResult } from './ocr-parser';
export type { ParsedOCRSlot, OCRParseResult } from './ocr-parser';

// ─── L3: IM Generation (IM 생성) ────────────────────────────────────────
export { renderHeroMask, renderIncomeMask } from './nlg-mask-engine';
export type { NLGMaskPayload, RenderedNLGSection } from './nlg-mask-engine';

export { getIMRenderPolicy } from './im-render-policy';
export type { IMTier, IMRenderPolicy } from './im-render-policy';

// ─── L3: Privacy & Security (프라이버시 · 보안) ─────────────────────────
export { getMapTierCoordinates } from './map-tier';
export type { LatLng, MapTierResult } from './map-tier';

export { classifyAssetPhoto, filterPhotosForTier } from './photo-classifier';
export type { PhotoCategory, PhotoClassificationResult } from './photo-classifier';

// ─── L3: Disclosure Guard (정보 공개 가드) ──────────────────────────────
export { validateDisclosurePrefs } from './disclosure-guard';
export type { DisclosureValidationResult } from './disclosure-guard';

// ─── Legacy Domain Services ─────────────────────────────────────────────
export { brokerDealCardFromMemo } from './broker-deal-card';
export type { BrokerDealCardFromMemoInput, BrokerDealCardFromMemoResult } from './broker-deal-card';

export { generateBuildingRadar } from './building-radar';
export type { BuildingRadarGenerateResult } from './building-radar';

export { planImLiteSections, validateImLiteOutput } from './im-lite-engine';
export type { ImLiteSection, ImLitePlanResult } from './im-lite-engine';

export { computeWALT, buildLeaseSummaryFromInput } from './lease-normalizer';
export type { LeaseSummaryOutput } from './lease-normalizer';

export { computeCompletenessAfterUpload } from './evidence-upload';
export { validateSnapshotOutput } from './snapshot-generator';
export type { SnapshotValidationResult } from './snapshot-generator';
