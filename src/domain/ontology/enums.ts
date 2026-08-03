/**
 * enums.ts — 온톨로지 v0.2 Enum 카탈로그 (9계열 추가)
 * Spec: ONTOLOGY_V0.2_SPEC.md §3
 * 
 * v0.1의 14계열에 9계열을 추가하여 23계열.
 * 자유문자열로 두면 매칭·필터·집계가 전부 불가능합니다.
 */

// ── 1. 지목 (28종 법정) ──────────────────────────────────────────
export const JIMOK = [
  '전', '답', '과수원', '목장용지', '임야', '광천지', '염전',
  '대', '공장용지', '학교용지', '주차장', '주유소용지',
  '창고용지', '도로', '철도용지', '제방', '하천', '구거',
  '유지', '양어장', '수도용지', '공원', '체육용지', '유원지',
  '종교용지', '사적지', '묘지', '잡종지',
] as const;
export type Jimok = typeof JIMOK[number];

// ── 2. 용도지역 (21종) ───────────────────────────────────────────
export const USE_AREA = [
  '제1종전용주거지역', '제2종전용주거지역',
  '제1종일반주거지역', '제2종일반주거지역', '제3종일반주거지역',
  '준주거지역',
  '중심상업지역', '일반상업지역', '근린상업지역', '유통상업지역',
  '전용공업지역', '일반공업지역', '준공업지역',
  '보전녹지지역', '생산녹지지역', '자연녹지지역',
  '보전관리지역', '생산관리지역', '계획관리지역',
  '농림지역', '자연환경보전지역',
] as const;
export type UseArea = typeof USE_AREA[number];

// ── 3. 용도지구 (10+종) ──────────────────────────────────────────
export const USE_DISTRICT = [
  '경관지구', '고도지구', '방화지구', '방재지구', '보존지구',
  '시설보호지구', '취락지구', '개발진흥지구', '특정용도제한지구',
  '복합용도지구', '미관지구',
] as const;
export type UseDistrict = typeof USE_DISTRICT[number];

// ── 4. 용도구역 (6종) ────────────────────────────────────────────
export const USE_ZONE = [
  '개발제한구역', '도시자연공원구역', '시가화조정구역',
  '수산자원보호구역', '입지규제최소구역', '복합용도구역',
] as const;
export type UseZone = typeof USE_ZONE[number];

// ── 5. 제척 사유 (7종) ───────────────────────────────────────────
export const EXCLUSION_KIND = [
  'road_setback',          // 도로 후퇴
  'green_buffer',          // 녹지 완충
  'utility_easement',      // 공익사업 지역권
  'slope_exclusion',       // 경사지 제외
  'river_setback',         // 하천 제방
  'heritage_buffer',       // 문화재 보호
  'other',                 // 기타
] as const;
export type ExclusionKind = typeof EXCLUSION_KIND[number];

// ── 6. 명도 조건 (3종) ───────────────────────────────────────────
export const HANDOVER_CONDITION = [
  'succession',            // 승계 (임차인 유지)
  'eviction',              // 명도 (비워서 인수)
  'negotiable',            // 협의
] as const;
export type HandoverCondition = typeof HANDOVER_CONDITION[number];

// ── 7. 관리비 유형 (2종) ─────────────────────────────────────────
export const MANAGEMENT_FEE_TYPE = [
  'fixed',                 // 정액
  'actual_cost',           // 실비
] as const;
export type ManagementFeeType = typeof MANAGEMENT_FEE_TYPE[number];

// ── 8. Cap Rate 기준 (4종) ───────────────────────────────────────
export const CAP_RATE_BASIS = [
  'noi_price',             // NOI / 매각희망가
  'noi_price_deposit',     // NOI / (매각가 - 보증금승계)
  'noi_equity',            // NOI / 자기자본
  'gross_price',           // 총수입 / 매각가 (Gross Yield)
] as const;
export type CapRateBasis = typeof CAP_RATE_BASIS[number];

// ── 9. 상임법 적용 범위 (2종) ────────────────────────────────────
export const LEASE_ACT_APPLICATION = [
  'full',                  // 전면 적용
  'partial',               // 일부 적용 (환산보증금 초과 호실 존재)
] as const;
export type LeaseActApplication = typeof LEASE_ACT_APPLICATION[number];

// ── 통합 검증 함수 ──────────────────────────────────────────────

const ENUM_REGISTRY: Record<string, readonly string[]> = {
  jimok: JIMOK,
  use_area: USE_AREA,
  use_district: USE_DISTRICT,
  use_zone: USE_ZONE,
  exclusion_kind: EXCLUSION_KIND,
  handover_condition: HANDOVER_CONDITION,
  management_fee_type: MANAGEMENT_FEE_TYPE,
  cap_rate_basis: CAP_RATE_BASIS,
  lease_act_application: LEASE_ACT_APPLICATION,
};

/**
 * enum 계열과 값의 유효성을 검증합니다.
 * @returns true if valid
 */
export function isValidEnumValue(family: string, value: string): boolean {
  const values = ENUM_REGISTRY[family];
  if (!values) return false;
  return values.includes(value as any);
}

/**
 * 지정 enum 계열의 전체 값 목록을 반환합니다.
 */
export function getEnumValues(family: string): readonly string[] {
  return ENUM_REGISTRY[family] || [];
}

/**
 * 전체 enum 계열 목록을 반환합니다.
 */
export function getEnumFamilies(): string[] {
  return Object.keys(ENUM_REGISTRY);
}
