/**
 * parcel.ts — P 규칙군 (토지 유효 규모)
 * Spec: ONTOLOGY_V0.2_SPEC.md §5.4
 * 
 * P01: 유효 대지면적 = Σ(필지 면적 × 지분) − Σ(제척 면적 where affectsFAR)
 * P02: 유효 용적률 = 용적률 산정 연면적 ÷ 유효 대지면적
 * P03: 제척 영향도 = 제척 면적 ÷ 대장 대지면적 합계
 */

import type { ExclusionKind } from '../enums';

// ── 필지 입력 ────────────────────────────────────────────────────
export interface Parcel {
  /** 필지 PNU (19자리) */
  pnu: string;
  /** 대장 면적 (㎡) */
  areaM2: number;
  /** 지분 비율 (0~1, 단독소유 = 1.0) */
  ownershipRatio: number;
  /** 지목 */
  jimok?: string;
  /** 공시지가 (원/㎡) */
  officialLandPrice?: number;
  /** 제척 항목 */
  exclusions?: LandExclusion[];
}

export interface LandExclusion {
  /** 제척 사유 */
  kind: ExclusionKind;
  /** 제척 면적 (㎡) */
  areaM2: number;
  /** 용적률에 영향 여부 */
  affectsFAR: boolean;
  /** 비고 */
  note?: string;
}

// ── 건축물 단위 ──────────────────────────────────────────────────
export interface BuildingUnit {
  /** 건축물대장 번호 */
  ledgerId?: string;
  /** 주용도 */
  primaryUse: string;
  /** 건축년도 */
  buildYear: number;
  /** 연면적 (㎡) */
  totalFloorAreaM2: number;
  /** 용적률 산정 연면적 (㎡) */
  farCountedAreaM2: number;
  /** 층별 바닥면적 */
  floors: FloorArea[];
  /** 구조 */
  structure?: string;
}

export interface FloorArea {
  /** 층 표기 (B1, 1F, 2F...) */
  floor: string;
  /** 바닥면적 (㎡) */
  areaM2: number;
  /** 용적률 산입 여부 */
  countedInFAR: boolean;
}

// ── P 규칙 결과 ──────────────────────────────────────────────────
export interface ParcelRuleResult {
  /** P01: 유효 대지면적 (㎡) */
  effectiveLandAreaM2: number;
  /** 대장 대지면적 합계 (㎡) */
  ledgerLandAreaM2: number;
  /** P02: 유효 용적률 (%) */
  effectiveFARPct: number;
  /** P03: 제척 영향도 (0~1) */
  exclusionImpactRatio: number;
  /** 총 제척 면적 (㎡) */
  totalExclusionAreaM2: number;
  /** 제척 상세 */
  exclusionBreakdown: Array<{ kind: ExclusionKind; areaM2: number; affectsFAR: boolean }>;
}

/**
 * P01~P03을 일괄 산출합니다.
 * 
 * P01: 유효 대지면적 = Σ(필지 면적 × 지분) − Σ(제척 면적 where affectsFAR)
 * P02: 유효 용적률 = 용적률 산정 연면적 ÷ 유효 대지면적
 * P03: 제척 영향도 = 제척 면적 ÷ 대장 대지면적 합계
 */
export function evaluateParcelRules(
  parcels: Parcel[],
  buildings: BuildingUnit[],
): ParcelRuleResult {
  // P01: 유효 대지면적
  const ledgerLandAreaM2 = parcels.reduce(
    (sum, p) => sum + p.areaM2 * p.ownershipRatio,
    0,
  );

  // 제척 집계
  const allExclusions = parcels.flatMap(p => p.exclusions || []);
  const farAffectingExclusions = allExclusions.filter(e => e.affectsFAR);
  const totalExclusionAreaM2 = farAffectingExclusions.reduce(
    (sum, e) => sum + e.areaM2,
    0,
  );

  const effectiveLandAreaM2 = Math.max(0, ledgerLandAreaM2 - totalExclusionAreaM2);

  // P02: 유효 용적률
  const farCountedArea = buildings.reduce(
    (sum, b) => sum + b.farCountedAreaM2,
    0,
  );
  const effectiveFARPct = effectiveLandAreaM2 > 0
    ? parseFloat((farCountedArea / effectiveLandAreaM2 * 100).toFixed(2))
    : 0;

  // P03: 제척 영향도
  const totalAllExclusions = allExclusions.reduce((sum, e) => sum + e.areaM2, 0);
  const rawLedger = parcels.reduce((sum, p) => sum + p.areaM2, 0);
  const exclusionImpactRatio = rawLedger > 0
    ? parseFloat((totalAllExclusions / rawLedger).toFixed(4))
    : 0;

  // 제척 상세
  const exclusionBreakdown = allExclusions.map(e => ({
    kind: e.kind,
    areaM2: e.areaM2,
    affectsFAR: e.affectsFAR,
  }));

  return {
    effectiveLandAreaM2: parseFloat(effectiveLandAreaM2.toFixed(2)),
    ledgerLandAreaM2: parseFloat(ledgerLandAreaM2.toFixed(2)),
    effectiveFARPct,
    exclusionImpactRatio,
    totalExclusionAreaM2: parseFloat(totalExclusionAreaM2.toFixed(2)),
    exclusionBreakdown,
  };
}
