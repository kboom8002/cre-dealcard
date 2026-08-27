/**
 * D37 P0-4/P0-5: DataAvailability 실값 검사 + 충돌 객체
 *
 * DA 플래그를 하드코딩하지 않고 실제 데이터 존재 여부에서 파생합니다.
 * 외부 데이터 덮어쓰기 시 기존 값과 다르면 Conflict를 생성합니다.
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-4, §P0-5
 */

import type { DataAvailability } from '../mobile-im/pptx/deck-sequencer';

// ── P0-4: DA 실값 검사 ──

/**
 * 외부 데이터 스냅샷에서 DataAvailability를 실값 기반으로 생성합니다.
 * 하드코딩 금지 (AGENTS.md §8).
 */
export function deriveDataAvailability(input: {
  externalData?: Record<string, unknown> | null;
  supplemental?: Record<string, unknown> | null;
  hasExpertReview?: boolean;
}): DataAvailability {
  const ext = input.externalData ?? {};
  const sup = input.supplemental ?? {};

  return {
    hasLandUsePlan:      hasValue(ext, 'landUsePlan'),
    hasLandPrice:        hasValue(ext, 'landPrice'),
    hasBuildingRegister: hasValue(ext, 'buildingRegister'),
    hasRegistryData:     hasValue(ext, 'registryData'),
    hasComparables:      hasValue(ext, 'comparables'),
    hasCommercialDistrict: hasValue(ext, 'commercialDistrict'),
    hasCadastralMap:     hasValue(ext, 'cadastralMap'),
    hasFloorPlan:        hasValue(ext, 'floorPlan'),
    hasRentRoll:         hasRentRollData(sup),
    hasOpex:             hasOpexData(sup),
    hasAsOf:             hasValue(ext, 'asOf') || hasValue(sup, 'asOf'),
    hasScenario:         false, // P1-4 Action Card에서 설정
    hasExpertReview:     input.hasExpertReview ?? false,
    hasPermitZone:       hasValue(ext, 'permitZone'),
    hasPhotos:           hasPhotosData(sup),
  };
}

function hasValue(obj: Record<string, unknown>, key: string): boolean {
  const val = obj[key];
  if (val === null || val === undefined) return false;
  if (typeof val === 'object' && !Array.isArray(val)) {
    return Object.keys(val as Record<string, unknown>).length > 0;
  }
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function hasRentRollData(sup: Record<string, unknown>): boolean {
  const fl = sup.floor_leases;
  if (Array.isArray(fl) && fl.length > 0) return true;
  const rent = sup.monthly_rent_total_krw;
  return typeof rent === 'number' && rent > 0;
}

function hasOpexData(sup: Record<string, unknown>): boolean {
  const opex = sup.opex_total_krw;
  if (typeof opex === 'number' && opex > 0) return true;
  const mgmt = sup.mgmt_fee_total_manwon;
  return typeof mgmt === 'number' && mgmt > 0;
}

function hasPhotosData(sup: Record<string, unknown>): boolean {
  const p2 = sup.photos_v2;
  if (Array.isArray(p2) && p2.length > 0) return true;
  const urls = sup.photo_urls;
  return Array.isArray(urls) && urls.length > 0;
}

// ── P0-5: 충돌 객체 ──

/** 07 §5.3 충돌 9종 */
export type ConflictSubject =
  | 'address'
  | 'area'
  | 'use'
  | 'rentroll_sum'
  | 'lease_terms'
  | 'occupancy_narrative'
  | 'unit_price'
  | 'comp_identity'
  | 'yield_basis';

/** 충돌 발생 시 생성되는 객체 — 해소 전까지 발행 차단 (G48) */
export interface Conflict {
  id: string;
  subject: ConflictSubject;
  /** 기존 값 (먼저 바인딩된 값) */
  existingValue: unknown;
  existingSource: string;
  /** 신규 값 (덮어쓰려는 값) */
  incomingValue: unknown;
  incomingSource: string;
  /** ISO 8601 */
  detectedAt: string;
  /** 해소 여부 */
  resolved: boolean;
  /** 해소 시 채택된 값 */
  resolvedValue?: unknown;
  resolvedBy?: string;
}

/**
 * 두 값을 비교하여 충돌 여부를 판정합니다.
 * 단순 동등 비교가 아니라 의미 동등 비교:
 * - 숫자: ±1% 이내이면 동일
 * - 문자열: trim 후 동일
 * - null/undefined: 기존 없으면 충돌 아님 (최초 바인딩)
 */
export function detectConflict(
  subject: ConflictSubject,
  existingValue: unknown,
  existingSource: string,
  incomingValue: unknown,
  incomingSource: string,
): Conflict | null {
  // 기존 값 없으면 최초 바인딩 — 충돌 아님
  if (existingValue === null || existingValue === undefined) return null;
  // 신규 값 없으면 무시
  if (incomingValue === null || incomingValue === undefined) return null;

  // 의미 동등 비교
  if (isSemanticEqual(existingValue, incomingValue)) return null;

  return {
    id: `conflict_${subject}_${Date.now()}`,
    subject,
    existingValue,
    existingSource,
    incomingValue,
    incomingSource,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };
}

function isSemanticEqual(a: unknown, b: unknown): boolean {
  // 숫자: ±1% 허용
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === 0 && b === 0) return true;
    const diff = Math.abs(a - b);
    const base = Math.max(Math.abs(a), Math.abs(b));
    return diff / base < 0.01;
  }

  // 문자열: trim 후 비교
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }

  // 나머지: JSON 비교
  return JSON.stringify(a) === JSON.stringify(b);
}
