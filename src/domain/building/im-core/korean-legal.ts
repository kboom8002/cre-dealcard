/**
 * D37 P2-7: 한국법 필드 — D36 §3.4~§3.7 전량 반영
 *
 * v1 7개 + v2 5개 = 12개 필드.
 * Claim으로 등록하여 PPTX 면에 구조적으로 바인딩합니다.
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P2-7
 */

import type { ClaimRegistry } from './claim-registry';

// ── 타입 ──

export type TransactionStructure = '일반과세' | '포괄양수도' | '미정';
export type MgmtFeeStructure = '실비정산' | '정액' | '혼합';
export type VatStructure = '과세' | '면세' | '포괄양수도' | '미정';

export interface KoreanLegalFields {
  // v1 (D36 §3.4~§3.6)
  /** 위반건축물 등재 여부 */
  violation_registered: boolean;
  /** 위반 내용 상세 */
  violation_detail: string | null;
  /** 거래구조 */
  transaction_structure: TransactionStructure;
  /** 관리비 구조 */
  mgmt_fee_structure: MgmtFeeStructure;
  /** 정비구역 지정 여부 */
  redevelopment_zone: boolean;
  /** 자금조달계획서 제출 대상 */
  fund_source_report_required: boolean;
  /** 중개보수 요율 (%) */
  brokerage_fee_rate: number;

  // v2 (D36 §3.7)
  /** 제소전화해 조서 */
  pretrial_reconciliation: boolean | null;
  /** 소방 완비증명 */
  fire_safety_certificate: string | null;
  /** 정화조 용량 (근생 업종 변경 범위) */
  septic_tank_capacity: string | null;

  // v3 (D41 S8: 권리금 · VAT 축)
  /** 권리금 존재 여부 */
  premium_exists: boolean | null;
  /** 권리금 추정액 (원) */
  premium_estimated_krw: number | null;
  /** VAT 과세 구조 */
  vat_structure: VatStructure;
}

// ── Claim 등록 ──

/**
 * 한국법 필드를 ClaimRegistry에 등록합니다.
 * 각 필드가 별개의 Claim이 되어 면별 참조 + 교차 검증이 가능합니다.
 */
export function registerKoreanLegalClaims(
  registry: ClaimRegistry,
  fields: Partial<KoreanLegalFields>,
  asOf: string,
): void {
  const base = { provenance: 'broker' as const, asOf };

  if (fields.violation_registered !== undefined) {
    registry.register({
      ...base,
      subject: 'violation_registered',
      value: fields.violation_registered ? 1 : 0,
      evidence: [{ sourceId: 'registry', asOf, excerpt: fields.violation_detail ?? '위반건축물 여부' }],
      status: 'broker_checked',
    });
  }

  if (fields.transaction_structure !== undefined) {
    registry.register({
      ...base,
      subject: 'transaction_structure',
      value: fields.transaction_structure,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.mgmt_fee_structure !== undefined) {
    registry.register({
      ...base,
      subject: 'mgmt_fee_structure',
      value: fields.mgmt_fee_structure,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.redevelopment_zone !== undefined) {
    registry.register({
      ...base,
      provenance: 'public_api',
      subject: 'redevelopment_zone',
      value: fields.redevelopment_zone ? 1 : 0,
      evidence: [{ sourceId: 'public_api', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.brokerage_fee_rate !== undefined) {
    registry.register({
      ...base,
      subject: 'brokerage_fee_rate',
      value: fields.brokerage_fee_rate,
      unit: '%',
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.fund_source_report_required !== undefined) {
    registry.register({
      ...base,
      subject: 'fund_source_report_required',
      value: fields.fund_source_report_required ? 1 : 0,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  // v2 필드
  if (fields.pretrial_reconciliation !== undefined && fields.pretrial_reconciliation !== null) {
    registry.register({
      ...base,
      subject: 'pretrial_reconciliation',
      value: fields.pretrial_reconciliation ? 1 : 0,
      evidence: [{ sourceId: 'broker', asOf, excerpt: '제소전화해 조서 확인' }],
      status: 'broker_checked',
    });
  }

  if (fields.fire_safety_certificate !== undefined && fields.fire_safety_certificate !== null) {
    registry.register({
      ...base,
      subject: 'fire_safety_certificate',
      value: fields.fire_safety_certificate,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.septic_tank_capacity !== undefined && fields.septic_tank_capacity !== null) {
    registry.register({
      ...base,
      subject: 'septic_tank_capacity',
      value: fields.septic_tank_capacity,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  // v3 필드
  if (fields.premium_exists !== undefined && fields.premium_exists !== null) {
    registry.register({
      ...base,
      subject: 'premium_exists',
      value: fields.premium_exists ? 1 : 0,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.premium_estimated_krw !== undefined && fields.premium_estimated_krw !== null) {
    registry.register({
      ...base,
      subject: 'premium_estimated_krw',
      value: fields.premium_estimated_krw,
      unit: 'KRW',
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }

  if (fields.vat_structure !== undefined) {
    registry.register({
      ...base,
      subject: 'vat_structure',
      value: fields.vat_structure,
      evidence: [{ sourceId: 'broker', asOf }],
      status: 'broker_checked',
    });
  }
}
