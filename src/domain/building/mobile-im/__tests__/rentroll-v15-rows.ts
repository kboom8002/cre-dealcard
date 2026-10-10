/**
 * 렌트롤 v1.5 도메인 테스트 공용 데이터 (floor_leases 형태: snake_case, 금액 만원, 면적 ㎡).
 *
 * 스펙 §7 의 '당산동 가상 물건' 오라클(기준일 2025-05-15, 매각가 11,500,000,000, 연면적 1,441.15㎡)을 재현하는 합성 행이다.
 * 원본 xlsx 의 면적 분배는 문서에 없으므로, 문서에 명시된 합계·개별 오라클을 만족하도록 구성했다:
 *   Σ임대면적 1,441.15 · Σ전용면적 1,175.00 · Σ월세 19,460,000 · Σ보증금 290,000,000
 *   1F 약국 NOC 108,238 (월세 183만 + 관리비 20만 ÷ 전용 62.00㎡)
 *   내과 통합계약 A NOC 111,299 (월세 883만 + 관리비 90만 ÷ 그룹 전용합 289.00㎡), v1.3 식(대표 행 전용 84㎡만)이면 382,920
 *   B1 임대면적 입력값: ㎡ 317.22 / 평 95.96
 */
import { toSqmFromInput } from '../rentroll-meta';

export type Row = Record<string, any>;

export const DANGSAN_AS_OF = '2025-05-15';
export const DANGSAN_ASKING_KRW = 11_500_000_000;
export const DANGSAN_GFA_SQM = 1441.15;

const common = { legal_basis: '상가', opposing_power: '사업자등록', first_contract_date: '2021-03-01' };

/** R3 표준형 (G9=㎡) — 9행: 자가사용 2, 통합계약 A(1F 대표 + 2F + 2F-B), 나머지 단독 */
export function dangsanR3Rows(): Row[] {
  return [
    { floor: 'B1', tenant_type: '카페', lease_state: '자가사용', area_sqm: 317.22, exclusive_area_sqm: 260.0, legal_basis: '상가' },
    {
      ...common, floor: '1F', tenant_type: '약국', lease_state: '임대중', area_sqm: 75.0, exclusive_area_sqm: 62.0,
      deposit_manwon: 6000, rent_manwon: 183, mgmt_fee_manwon: 20, lease_end: '2026-08-31', evidence_level: '계약서 원본', payment_status: '정상',
    },
    {
      ...common, floor: '1F', tenant_type: '내과의원', contract_group: 'A', lease_state: '임대중', area_sqm: 105.0, exclusive_area_sqm: 84.0,
      deposit_manwon: 14000, rent_manwon: 883, mgmt_fee_manwon: 90, lease_end: '2026-08-31', evidence_level: '계약서 원본', payment_status: '정상',
    },
    // 통합계약 비대표 행 — 금액은 빈 칸(null), 면적·법령·최초계약일·대항력·근거는 행마다
    {
      ...common, floor: '2F', tenant_type: '내과의원', contract_group: 'A', lease_state: '임대중', area_sqm: 125.0, exclusive_area_sqm: 102.5,
      lease_end: '2026-08-31', evidence_level: '계약서 원본',
    },
    {
      ...common, floor: '2F-B', tenant_type: '내과의원', contract_group: 'A', lease_state: '임대중', area_sqm: 125.0, exclusive_area_sqm: 102.5,
      lease_end: '2026-08-31', evidence_level: '계약서 원본',
    },
    {
      ...common, floor: '3F', tenant_type: '헬스장', lease_state: '임대중', area_sqm: 230.0, exclusive_area_sqm: 190.0,
      deposit_manwon: 5000, rent_manwon: 455, mgmt_fee_manwon: 40, lease_end: '2026-04-17', evidence_level: '매도인 렌트롤', payment_status: '연체',
    },
    {
      ...common, floor: '4F(1)', tenant_type: '와인숍', lease_state: '임대중', area_sqm: 122.0, exclusive_area_sqm: 100.0,
      deposit_manwon: 3000, rent_manwon: 260, mgmt_fee_manwon: 25, lease_end: '2025-04-30', evidence_level: '구두', payment_status: '미확인',
    },
    { floor: '4F(2)', tenant_type: '사무실', lease_state: '자가사용', area_sqm: 150.0, exclusive_area_sqm: 124.0, legal_basis: '상가' },
    {
      ...common, floor: '5F', tenant_type: '내과의원', lease_state: '임대중', area_sqm: 191.93, exclusive_area_sqm: 150.0,
      deposit_manwon: 1000, rent_manwon: 165, mgmt_fee_manwon: 15, lease_end: '2026-08-31', evidence_level: '계약서 원본', payment_status: '정상', rent_free_months: 2,
    },
  ];
}

/** G9=평 입력으로 다시 쓴 면적 (입력 단위 값 → toSqmFromInput 으로 ㎡ 정본). 지정한 행만 평 입력값으로 교체 */
export function withPyeongInputs(rows: Row[], pyeongByFloorIdx: Record<number, { area?: number; excl?: number }>): Row[] {
  return rows.map((r, i) => {
    const o = pyeongByFloorIdx[i];
    if (!o) return r;
    return {
      ...r,
      ...(o.area != null ? { area_sqm: toSqmFromInput(o.area, 'pyeong') } : {}),
      ...(o.excl != null ? { exclusive_area_sqm: toSqmFromInput(o.excl, 'pyeong') } : {}),
    };
  });
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
