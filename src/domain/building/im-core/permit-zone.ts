/**
 * D37 P1-2: 토지거래허가구역 조회 모듈
 *
 * D36 §3.1: 토지거래허가 가능 여부를 단정하지 마십시오 — 해당 여부와 기준면적만 표시.
 * permitRequired는 null로 둡니다 (가능 여부 판정은 전문가 영역).
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P1-2
 */

import type { ClaimRegistry } from './claim-registry';

// ── 타입 ──

export type PermitZoneSource = 'seoul_land_portal' | 'eum_gosi';

export interface PermitZoneResult {
  /** 토지거래허가구역 해당 여부 */
  isPermitZone: boolean;
  /** 허가 기준면적 (㎡). null=미확인 */
  thresholdSqm: number | null;
  /** 대상 토지면적 (㎡) */
  landSqm: number;
  /** 허가 필요 여부. 🔴 null = 단정 금지 (D36 §3.1) */
  permitRequired: boolean | null;
  /** 지정 해제 예정일 */
  designatedUntil: string | null;
  /** 이용의무기간·허가 목적 (v2 신설) */
  permitUseObligation: string | null;
  /** 출처 */
  source: PermitZoneSource;
  /** 기준일 */
  asOf: string;
}

// ── 조회 함수 ──

/**
 * PNU 기반 토지거래허가구역 조회.
 *
 * 실제 API 연동은 external/ 모듈에서 수행.
 * 이 함수는 외부 API 결과를 PermitZoneResult로 정규화합니다.
 */
export function parsePermitZoneResponse(
  raw: Record<string, unknown>,
  landSqm: number,
): PermitZoneResult {
  const isPermitZone = raw.isPermitZone === true || raw.is_permit_zone === true;

  return {
    isPermitZone,
    thresholdSqm: typeof raw.threshold_sqm === 'number' ? raw.threshold_sqm : null,
    landSqm,
    // 🔴 D36 §3.1: 가능 여부를 단정하지 않음
    permitRequired: null,
    designatedUntil: typeof raw.designated_until === 'string' ? raw.designated_until : null,
    permitUseObligation: typeof raw.permit_use_obligation === 'string' ? raw.permit_use_obligation : null,
    source: (raw.source as PermitZoneSource) ?? 'eum_gosi',
    asOf: typeof raw.as_of === 'string' ? raw.as_of : new Date().toISOString().slice(0, 10),
  };
}

// ── Claim 등록 ──

const STALE_DAYS = 90;

/**
 * PermitZoneResult를 ClaimRegistry에 등록합니다.
 */
export function registerPermitZoneClaim(
  registry: ClaimRegistry,
  result: PermitZoneResult,
): void {
  const daysSinceAsOf = Math.floor(
    (Date.now() - new Date(result.asOf).getTime()) / (1000 * 60 * 60 * 24),
  );
  const isStale = daysSinceAsOf > STALE_DAYS;

  registry.register({
    subject: 'land_transaction_permit',
    value: result.isPermitZone ? 1 : 0,
    unit: '',
    evidence: [{
      sourceId: 'public_api',
      asOf: result.asOf,
      excerpt: result.isPermitZone
        ? `토지거래허가구역 해당${result.thresholdSqm ? ` (기준면적 ${result.thresholdSqm}㎡)` : ''}`
        : '토지거래허가구역 비해당',
    }],
    provenance: 'public_api',
    asOf: result.asOf,
    status: isStale ? 'stale' : 'broker_checked',
  });

  if (result.thresholdSqm !== null) {
    registry.register({
      subject: 'permit_threshold_sqm',
      value: result.thresholdSqm,
      unit: '㎡',
      evidence: [{ sourceId: 'public_api', asOf: result.asOf }],
      provenance: 'public_api',
      asOf: result.asOf,
      status: isStale ? 'stale' : 'broker_checked',
    });
  }
}
