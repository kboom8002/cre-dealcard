/**
 * parcel.ts — P 규칙군 (토지 유효 규모) + C19 제약
 * Spec: ONTOLOGY_V0.4_SPEC.md · CATALOG_SLOTS.md §2.2
 *
 * P01: 유효 대지면적 = Σ(필지 면적 × 지분) − Σ(제척 면적 where affectsFAR)
 * P02: 유효 용적률 = 용적률 산정 연면적 ÷ 유효 대지면적
 * P03: 제척 영향도 = 제척 면적 ÷ 대장 대지면적 합계
 * C19: Σ 층별 바닥면적 = 연면적 (±0.5%) — severity: warning
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

// ── 건축물 단위 ──────────────────────────────────────────────────────
export interface BuildingUnit {
  /** 건축물 명칭 (v0.4) — '주건축물 제1동' */
  name?: string;
  /** 주건축물 여부 (v0.4) */
  isPrimary?: boolean;
  /** 건축물대장 번호 */
  ledgerId?: string;
  /** 주용도 */
  primaryUse: string;
  /** 건축년도 */
  buildYear: number;
  /** 사용승인일 (v0.4) — YYYY-MM-DD */
  approvalDate?: string;
  /** 위반건축물 여부 (v0.4) — 대출 제약 */
  violationFlag?: boolean;
  /** 연면적 (㎡) */
  totalFloorAreaM2: number;
  /** 용적률 산정 연면적 (㎡) */
  farCountedAreaM2: number;
  /** 지상 연면적 (㎡) (v0.4) — 실질 용적률 기준 */
  aboveGroundAreaM2?: number;
  /** 층별 바닥면적 */
  floors: FloorArea[];
  /** 구조 */
  structure?: string;
}

export interface FloorArea {
  /** 층 표기 (B1, 1F, 2F...) */
  floor: string;
  /** 층 용도 (v0.4) */
  purpose?: string;
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

// ══════════════════════════════════════════════════════════════════════
// C19: Σ 층별 바닥면적 = 연면적 (±0.5%)
// Spec: ONTOLOGY_IMPLEMENTATION_GAP.md §7
// severity: warning — 층별 면적을 부분만 입력한 정상 케이스가 흔함
// ══════════════════════════════════════════════════════════════════════

export interface C19Result {
  ok: boolean;
  skipped: boolean;
  floorSum?: number;
  grossArea?: number;
  diffPct?: number;
  message?: string;
}

/**
 * C19 — 층별 바닥면적 합계가 연면적과 ±0.5% 이내인지 검증합니다.
 *
 * 역설계 5건 중 3건에서 층별 면적 합계가 연면적과 어긋났습니다.
 * 대부분 반올림이지만, 양평동에서는 관리비 배분에 20천원 오차가 났습니다.
 */
export function checkC19(building: BuildingUnit): C19Result {
  if (!building.floors?.length || !building.totalFloorAreaM2) {
    return { ok: true, skipped: true };
  }

  const floorSum = building.floors.reduce((acc, f) => acc + (f.areaM2 ?? 0), 0);
  const grossArea = building.totalFloorAreaM2;
  const diffPct = Math.abs(floorSum - grossArea) / grossArea;

  if (diffPct <= 0.005) {
    return { ok: true, skipped: false, floorSum, grossArea, diffPct };
  }

  return {
    ok: false,
    skipped: false,
    floorSum,
    grossArea,
    diffPct,
    message: `층별 바닥면적 합 ${floorSum.toFixed(1)}㎡가 연면적 ${grossArea}㎡와 ${(diffPct * 100).toFixed(2)}% 차이납니다.`,
  };
}

/** 전 건축물에 대해 C19를 일괄 검증합니다. */
export function checkC19All(buildings: BuildingUnit[]): {
  results: C19Result[];
  hasViolation: boolean;
} {
  const results = buildings.map(b => checkC19(b));
  return {
    results,
    hasViolation: results.some(r => !r.ok && !r.skipped),
  };
}

// ── X05: 다필지 합산 면적 교차검증 ── (B-3)
export interface X05Result {
  passed: boolean;
  deviation: number;
  sumParcelsM2: number;
  ledgerTotalM2: number;
  message?: string;
}

/**
 * X05: 다필지 합산 면적 교차검증
 * 필지별 (대장면적 × 지분율) 합 vs 건축물대장 표기 대지면적 ±0.5% 이내
 */
export function checkX05(
  parcels: Array<{ ledgerAreaM2: number; shareRatio: number }>,
  ledgerTotalM2: number,
): X05Result {
  if (parcels.length === 0 || ledgerTotalM2 <= 0) {
    return { passed: true, deviation: 0, sumParcelsM2: 0, ledgerTotalM2, message: '필지 데이터 부재 — 검증 생략' };
  }

  const sumParcels = parcels.reduce((s, p) => s + p.ledgerAreaM2 * p.shareRatio, 0);
  const deviation = Math.abs(sumParcels - ledgerTotalM2) / ledgerTotalM2;

  if (deviation > 0.005) {
    return {
      passed: false,
      deviation,
      sumParcelsM2: sumParcels,
      ledgerTotalM2,
      message: `필지 합산 면적(${sumParcels.toFixed(2)}㎡)과 대장 면적(${ledgerTotalM2.toFixed(2)}㎡)의 편차가 ${(deviation * 100).toFixed(2)}%로 허용 범위(±0.5%)를 초과합니다.`,
    };
  }

  return {
    passed: true,
    deviation,
    sumParcelsM2: sumParcels,
    ledgerTotalM2,
  };
}
