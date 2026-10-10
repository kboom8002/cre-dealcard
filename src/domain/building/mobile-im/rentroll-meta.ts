/**
 * 렌트롤 v1.5 공유 계약 (타입 · 상수 · 순수 단위 헬퍼)
 *
 * 스펙: docs/RENTROLL_v1.3_to_v1.5.md (§5 필드명 확정, §9.1 표기 규칙)
 * 파서(src/lib/rentroll) · 라우트/핸들러 · 도메인(lease-math, rentroll-checks) · 렌더러가 모두 이 파일을 import 한다.
 * 이 파일은 의존성이 없어야 한다 (순수).
 */

/** 엑셀 G9 (v1.5) — 'sqm' = ㎡, 'pyeong' = 평 */
export type AreaInputUnit = 'sqm' | 'pyeong';

/** 평 → ㎡ 환산 계수 (엑셀 AE/AF 수식과 동일) */
export const PYEONG_TO_SQM_V15 = 3.305785;

export const EVIDENCE_LEVELS = ['계약서 원본', '매도인 렌트롤', '구두'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const PAYMENT_STATUSES = ['정상', '연체', '미확인'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** AC 열 — 만기 구간 */
export type ExpiryBucket =
  | '만료 경과'
  | '12개월 내'
  | '12개월 초과'
  | '공실'
  | '자가사용'
  | '만료일 없음'
  | '';

/** AD 열 — 금액 판정 */
export type AmountCheckResult = 'OK' | '월세 누락' | '관리비 누락' | '금액 중복' | '';

export type RentrollVersion = '1.3' | '1.4' | '1.5' | 'unknown';

/** 시장 임대료 (원/전용평·월, 단위 환산 금지) */
export interface RentRollMarketRent {
  /** J5 — 1층 */
  market_rent_1f?: number | null;
  market_rent_1f_source?: string | null;
  /** J6 — 지상층(2층 이상) */
  market_rent_upper?: number | null;
  market_rent_upper_source?: string | null;
  /** J7 — 지하층 */
  market_rent_basement?: number | null;
  market_rent_basement_source?: string | null;
}

/** 렌트롤 헤더 블록 + 물건 단위 메타 (doc.body.rent_roll_meta 로 저장) */
export interface RentRollMeta extends RentRollMarketRent {
  /** 감지된 양식 버전 (없으면 레거시 'unknown') */
  rentroll_version?: RentrollVersion;
  /** G9. 미지정/구버전은 'sqm' */
  area_input_unit: AreaInputUnit;
  /** C5 — 렌트롤 기준일 YYYY-MM-DD (비면 undefined → 평가일은 오늘) */
  rentroll_as_of?: string | null;
  /** J3 — 매각(희망)가 (원) */
  asking_price_krw?: number | null;
  /** J4 — 연면적 (㎡ 고정, 환산 금지) */
  gfa_sqm?: number | null;
  /** J8 — 기타수입 (원/월, VAT 별도) */
  other_income_krw?: number | null;
  /** M8 */
  other_income_note?: string | null;
  /** V12 해제 기록 (사유 필수). by/at 은 서버가 채운다 */
  area_unit_override?: { reason: string; by?: string; at?: string } | null;
}

/** 파서가 내는 구조화 이슈 (warnings 문자열 채널과 별도) */
export interface RentRollIssue {
  code:
    | 'AREA_UNIT_MISMATCH'
    | 'AREA_UNIT_UNCHECKED'
    | 'AREA_CACHE_DIFF'
    | 'AREA_UNIT_UNKNOWN'
    | 'AS_OF_MISSING'
    | 'VERSION_UNKNOWN'
    | 'HEADER_MISMATCH';
  level: 'blocking' | 'warning';
  message: string;
  ratio?: number;
  overridable?: boolean;
}

export const DEFAULT_RENT_ROLL_META: RentRollMeta = { area_input_unit: 'sqm' };

/** doc.body.rent_roll_meta 에서 입력 단위를 안전하게 꺼낸다 (없으면 'sqm') */
export function resolveAreaInputUnit(meta?: { area_input_unit?: unknown } | null): AreaInputUnit {
  return meta?.area_input_unit === 'pyeong' ? 'pyeong' : 'sqm';
}

/** 입력 단위 값 → ㎡ (엑셀 ROUND(…,2) 와 동일). 비유한 값은 null */
export function toSqmFromInput(raw: number | null | undefined, unit: AreaInputUnit): number | null {
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const sqm = unit === 'pyeong' ? raw * PYEONG_TO_SQM_V15 : raw;
  return Math.round(sqm * 100) / 100;
}

/** ㎡ 정본 → 입력 단위 표기값 (소수 2자리). 평 = sqm ÷ 3.305785 */
export function sqmToInputUnit(sqm: number | null | undefined, unit: AreaInputUnit): number | null {
  if (sqm == null || typeof sqm !== 'number' || !Number.isFinite(sqm)) return null;
  const v = unit === 'pyeong' ? sqm / PYEONG_TO_SQM_V15 : sqm;
  return Math.round(v * 100) / 100;
}

/** 머리글 단위 라벨: '㎡' | '평' */
export function areaUnitLabel(unit: AreaInputUnit): '㎡' | '평' {
  return unit === 'pyeong' ? '평' : '㎡';
}
