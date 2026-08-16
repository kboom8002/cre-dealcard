/**
 * @module Ontology
 * @description CREDEAL 온톨로지 v0.4 통합 모듈
 *
 * 온톨로지의 정본은 ONTOLOGY_V0.4_SPEC.md가 소유합니다.
 *
 * v0.4 핵심 변경:
 * - 3축 모델: buildingUse(29) × assetType(17) × investmentPosture(5)
 * - 임대차 법령 분기: 상가(T-C) / 주택(T-R) 규칙군 분리
 * - 등급 2단 구조: assetType 기본 프로파일 × posture 보정 × N/A 재배분
 * - 가치 지표 다형화: investmentPosture별 전략
 *
 * 구조:
 * - provenance.ts: 5-tier provenance 시스템 + 파생값 합성
 * - enums.ts: 26계열 enum 카탈로그
 * - slots.ts: Core 슬롯 + Pack 슬롯군 8종 인터페이스
 * - asset-identity.ts: 3축 모델 + 조합 매트릭스 + 마이그레이션
 * - grade-profiles.ts: 2단 등급 프로파일 + N/A 재배분
 * - value-metrics.ts: 다형 가치 지표 전략
 * - rules/tenancy.ts: T-C 규칙군 (상가, T-C-01~06)
 * - rules/tenancy-residential.ts: T-R 규칙군 (주택, T-R-01~07)
 * - rules/tenancy-dispatch.ts: 법령 분기 디스패처
 * - rules/parcel.ts: P 규칙군 (P01~P03) + C19
 *
 * 규칙 코드는 재사용하지 않습니다.
 *
 * @see ONTOLOGY_V0.4_SPEC.md
 * @see CATALOG_SLOTS.md
 * @see CATALOG_ASSET_TYPES.md
 * @see ONTOLOGY_IMPLEMENTATION_GAP.md
 * @version 0.4.0
 */

// ── Provenance ──
export {
  type ProvenanceTier,
  type ProvenanceMeta,
  type CompositionKind,
  type ProvenanceInput,
  type ComposedProvenance,
  PROVENANCE_REGISTRY,
  scoreToTier,
  formatBadge,
  composeAdditive,
  composeRatio,
  composeScenario,
  SCENARIO_SCORE,
  SELLER_CANDIDATE_SLOTS,
  migrateProvenanceTier,
} from './provenance';

// ── Enums (30계열 — v0.5) ──
export {
  // v0.2 기존 9계열
  type Jimok,
  type UseArea,
  type UseDistrict,
  type UseZone,
  type ExclusionKind,
  type HandoverCondition,
  type ManagementFeeType,
  type CapRateBasis,
  type LeaseActApplication,
  JIMOK,
  USE_AREA,
  USE_DISTRICT,
  USE_ZONE,
  EXCLUSION_KIND,
  HANDOVER_CONDITION,
  MANAGEMENT_FEE_TYPE,
  CAP_RATE_BASIS,
  LEASE_ACT_APPLICATION,
  // v0.4 3축 분류
  type BuildingUse,
  type AssetType,
  type InvestmentPosture,
  BUILDING_USE,
  ASSET_TYPE,
  INVESTMENT_POSTURE,
  // v0.4 Core 지원
  type RoadAccessGrade,
  type LandShape,
  type Terrain,
  type BuyerPurpose,
  type LeaseUnitLegalBasis,
  ROAD_ACCESS_GRADE,
  LAND_SHAPE,
  TERRAIN,
  BUYER_PURPOSE,
  LEASE_UNIT_LEGAL_BASIS,
  // v0.4 Pack 지원
  type RampType,
  type TemperatureZone,
  type PermitKind,
  type VacateResponsibility,
  RAMP_TYPE,
  TEMPERATURE_ZONE,
  PERMIT_KIND,
  VACATE_RESPONSIBILITY,
  // v0.5 리스크·입지·폴백
  type RiskCategory,
  type RiskSeverityLevel,
  type LocationCategory,
  type FallbackStrategy,
  RISK_CATEGORY,
  RISK_SEVERITY,
  LOCATION_CATEGORY,
  FALLBACK_STRATEGY,
  // v0.5.1 PPTX 렌더링 SSoT
  type PptxThemePreset,
  type PptxArchetypeCode,
  PPTX_THEME_PRESET,
  PPTX_ARCHETYPE,
  // v0.6.0 사진/갤러리 SSoT
  type PhotoCategory,
  type GalleryGroup,
  PHOTO_CATEGORY,
  GALLERY_GROUP,
  // 시스템
  type SlotState,
  type Grade,
  type Tier,
  type Impact,
  type MetricDisclosure,
  SLOT_STATE,
  GRADE,
  TIER,
  IMPACT,
  METRIC_DISCLOSURE,
  // 유틸리티
  ENUM_REGISTRY,
  isValidEnumValue,
  getEnumValues,
  getEnumFamilies,
  getEnumFamilyCount,
} from './enums';

// ── Slots ──
export {
  type SlotType,
  type SlotCategory,
  type SlotKind,
  type SlotDefinition,
  type AssetDocV2,
  type AssetDocV4,
  type PublishRecord,
  // Pack 인터페이스 8종
  type PhysicalSpec,
  type DevelopmentPlan,
  type StackingPlanUnit,
  type VacatePlan,
  type VacateCriticalUnit,
  type OccupancyPlan,
  type PermitRisk,
  type PermitRiskItem,
  type ResidentialSpec,
  type SectionalSpec,
  type SectionalUnit,
  type HospitalitySpec,
  // v0.5 구조화 타입
  type RiskItem,
  type LocationAspectItem,
  type SlotFallbackMeta,
  // 유틸리티
  SLOT_CATALOG,
  getSlotsByCategory,
  getNewSlots,
  getV4NewSlots,
  getArrayifiedSlots,
  getRequiredSlots,
  getSlotCount,
} from './slots';

// ── Asset Identity (3축 모델) ──
export {
  type AssetIdentity,
  type ValidationStatus,
  type CombinationResult,
  legalBasisOf,
  validateCombination,
  ASSET_TYPE_MIGRATION,
  REQUIRED_PACKS,
} from './asset-identity';

// ── Grade Profiles (2단 등급) ──
export {
  type SlotGroupNeed,
  type PostureAdjustment,
  BASE_PROFILE,
  POSTURE_ADJUSTMENT,
  gradeProfile,
  effectiveWeights,
  getSlotGroupNeeds,
  GRADE_THRESHOLDS,
  scoreToGrade,
} from './grade-profiles';

// ── Value Metrics (다형 가치 지표) ──
export {
  type ValueMetricStrategy,
  VALUE_METRICS,
  getValueMetrics,
  getScenarioRequiredMetrics,
  CAP_RATE_DISPLAY_LABELS,
} from './value-metrics';

// ── Rules: Tenancy Commercial (T-C-01~06) ──
export {
  type LeaseUnitInput,
  type TenancyResult,
  type Region,
  evaluateTenancy,
  evaluateAllTenancy,
  getThreshold,
} from './rules/tenancy';

// ── Rules: Tenancy Residential (T-R-01~07) ──
export {
  type ResidentialLeaseInput,
  type ResidentialTenancyResult,
  evaluateResidentialTenancy,
  evaluateAllResidentialTenancy,
  getSmallTenantThreshold,
} from './rules/tenancy-residential';

// ── Rules: Tenancy Dispatch ──
export {
  type LegalBasis,
  type DispatchedTenancyResult,
  legalBasisOf as getLegalBasis,
  dispatchTenancy,
  dispatchAllTenancy,
} from './rules/tenancy-dispatch';

// ── Rules: Parcel (P01~P03) + C19 ──
export {
  type Parcel,
  type LandExclusion,
  type BuildingUnit,
  type FloorArea,
  type ParcelRuleResult,
  type C19Result,
  evaluateParcelRules,
  checkC19,
  checkC19All,
} from './rules/parcel';

/** 현재 온톨로지 버전 */
export const ONTOLOGY_VERSION = 'v0.5.0';

