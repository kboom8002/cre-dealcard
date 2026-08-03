/**
 * @module Ontology
 * @description CREDEAL 온톨로지 v0.2 통합 모듈
 * 
 * 온톨로지의 정본은 ONTOLOGY_V0.2_SPEC.md가 소유합니다.
 * 
 * 구조:
 * - provenance.ts: 5-tier provenance 시스템 + 파생값 합성
 * - enums.ts: 23계열 enum 카탈로그 (v0.1 14 + v0.2 9)
 * - slots.ts: 122 슬롯 카탈로그 (v0.1 70 + v0.2 52)
 * - rules/tenancy.ts: T 규칙군 (임대차 법적 지위, T01~T06)
 * - rules/parcel.ts: P 규칙군 (토지 유효 규모, P01~P03)
 * 
 * 규칙 코드는 재사용하지 않습니다. R10을 폐기했으므로 R10을
 * 다른 의미로 다시 쓰지 않습니다.
 * 
 * @see ONTOLOGY_V0.2_SPEC.md
 * @version 0.2.0
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

// ── Enums ──
export {
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
  isValidEnumValue,
  getEnumValues,
  getEnumFamilies,
} from './enums';

// ── Slots ──
export {
  type SlotType,
  type SlotCategory,
  type SlotDefinition,
  type AssetDocV2,
  type PublishRecord,
  SLOT_CATALOG,
  getSlotsByCategory,
  getNewSlots,
  getArrayifiedSlots,
  getRequiredSlots,
  getSlotCount,
} from './slots';

// ── Rules: Tenancy (T01~T06) ──
export {
  type LeaseUnitInput,
  type TenancyResult,
  type Region,
  evaluateTenancy,
  evaluateAllTenancy,
  getThreshold,
} from './rules/tenancy';

// ── Rules: Parcel (P01~P03) ──
export {
  type Parcel,
  type LandExclusion,
  type BuildingUnit,
  type FloorArea,
  type ParcelRuleResult,
  evaluateParcelRules,
} from './rules/parcel';

/** 현재 온톨로지 버전 */
export const ONTOLOGY_VERSION = 'v0.2.0';
