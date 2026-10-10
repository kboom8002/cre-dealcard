/**
 * 렌트롤 v1.5 §9.1 — Basic IM 임대면적 표기 SSOT (순수 함수)
 *
 * - 계산 정본은 항상 ㎡ (`area_sqm`, `exclusive_area_sqm`). 표기만 입력 단위(G9: ㎡ | 평)로 바꾼다.
 * - 'sqm'   : 값 = area_sqm, 소수 2자리, 단일 단위 ('(63.4평)' 병기 없음).
 * - 'pyeong': 값 = area_sqm ÷ 3.305785 (소수 2자리) — 중개인이 적은 원래 숫자와 같아진다.
 * - 합계는 **행에 표기된 값(입력 단위, 소수 2자리)의 합** — 표를 눈으로 더해도 맞는다.
 * - 값이 없거나 0 이하이면 '-' (날조 금지).
 * - 전용평당 임대료·토지평당가처럼 원래 평 기준인 지표와 개요의 공부 면적(㎡ (평))은 이 모듈을 쓰지 않는다.
 *
 * 렌더 경로: doc.body.rent_roll_meta.area_input_unit → resolveAreaInputUnit → dataMap.rentRoll.areaInputUnit.
 * (P4b 표면용 경량 헬퍼는 ../../lease-area-cell.ts — 같은 계약을 따른다.)
 */
import {
  areaUnitLabel,
  PYEONG_TO_SQM_V15,
  type AreaInputUnit,
} from '../../rentroll-meta';
import {
  leaseAreaValue,
  leaseAreaHeaderLabel,
  sumLeaseAreaInUnit as sumLeaseAreaInUnitCell,
} from '../../lease-area-cell';

export type { AreaInputUnit };

export const LEASE_AREA_MISSING = '-';

export type LeaseAreaKind = 'lease' | 'exclusive';

const KIND_STEM: Record<LeaseAreaKind, '임대면적' | '전용면적'> = {
  lease: '임대면적',
  exclusive: '전용면적',
};

export interface LeaseAreaFormatOptions {
  /** 소수 자리수 (기본 2) */
  decimals?: number;
}

const fmt = (v: number, decimals: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const isPosFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 입력 단위 표기 숫자 (소수 2자리 반올림). 값이 없거나 0 이하이면 null — lease-area-cell.ts(P4b)와 같은 계약이라 위임한다 */
export function leaseAreaInUnit(sqm: number | null | undefined, unit: AreaInputUnit): number | null {
  return leaseAreaValue(sqm, unit);
}

/** 셀 문자열: '317.22' (㎡) / '95.96' (평) / '-' — 천 단위 구분 */
export function formatLeaseArea(
  sqm: number | null | undefined,
  unit: AreaInputUnit,
  opts: LeaseAreaFormatOptions = {},
): string {
  const v = leaseAreaInUnit(sqm, unit);
  if (v == null) return LEASE_AREA_MISSING;
  return fmt(v, opts.decimals ?? 2);
}

/** 이미 입력 단위로 표기된 숫자를 셀 문자열로 (합계 등). 비유한 값 → '-' */
export function formatLeaseAreaValue(value: number | null | undefined, opts: LeaseAreaFormatOptions = {}): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? fmt(value, opts.decimals ?? 2)
    : LEASE_AREA_MISSING;
}

/** 머리글: kind 'lease' | 'exclusive' → '임대면적(㎡)' | '임대면적(평)' | '전용면적(㎡)' | '전용면적(평)' */
export function leaseAreaHeader(kind: LeaseAreaKind, unit: AreaInputUnit): string {
  return leaseAreaHeaderLabel(KIND_STEM[kind], unit);
}

/** 머리글 판정 — 접두어 매칭 ('임대면적', '임대면적(㎡)', '임대면적(평)' 모두 true). 완전 일치 금지(§6.2) */
export function isLeaseAreaHeader(header: unknown, kind?: LeaseAreaKind): boolean {
  const h = String(header ?? '').trim();
  const stems = kind ? [KIND_STEM[kind]] : [KIND_STEM.lease, KIND_STEM.exclusive];
  return stems.some((s) => h === s || h.startsWith(`${s}(`));
}

/** 머리글에서 단위 꼬리표 '(㎡)'/'(평)' 제거 → '임대면적' (정렬·투영 키) */
export function stripAreaUnitFromHeader(header: unknown): string {
  return String(header ?? '').trim().replace(/\((?:㎡|평)\)$/, '');
}

/** 머리글에 표기된 단위 ('임대면적(평)' → 'pyeong'). 단위 꼬리표가 없으면 null */
export function areaUnitFromHeader(header: unknown): AreaInputUnit | null {
  const m = String(header ?? '').match(/\((㎡|평)\)\s*$/);
  if (!m) return null;
  return m[1] === '평' ? 'pyeong' : 'sqm';
}

/** 행별 입력 단위 값 합계 (각 행을 먼저 소수 2자리로 환산한 값의 합 — 표시값의 합) */
export function sumLeaseAreaInUnit(
  sqmList: ReadonlyArray<number | null | undefined>,
  unit: AreaInputUnit,
): number | null {
  return sumLeaseAreaInUnitCell([...sqmList], unit);
}

/** 합계 셀 문자열 (행 표기값의 합) */
export function formatLeaseAreaTotal(
  sqmList: ReadonlyArray<number | null | undefined>,
  unit: AreaInputUnit,
  opts: LeaseAreaFormatOptions = {},
): string {
  return formatLeaseAreaValue(sumLeaseAreaInUnit(sqmList, unit), opts);
}

/**
 * 행 객체 → 면적 셀. ㎡ 정본(sqm) 우선, 없으면 레거시 평 입력(pyeong)을 쓴다.
 * 평 모드에서 평 입력만 있으면 환산 왕복 없이 그 숫자를 그대로 표기한다.
 */
export function formatLeaseAreaFromRow(
  row: { sqm?: unknown; pyeong?: unknown },
  unit: AreaInputUnit,
  opts: LeaseAreaFormatOptions = {},
): string {
  const sqm = Number(row.sqm);
  if (isPosFinite(sqm)) return formatLeaseArea(sqm, unit, opts);
  const py = Number(row.pyeong);
  if (isPosFinite(py)) {
    return unit === 'pyeong'
      ? formatLeaseAreaValue(Math.round(py * 100) / 100, opts)
      : formatLeaseArea(py * PYEONG_TO_SQM_V15, 'sqm', opts);
  }
  return LEASE_AREA_MISSING;
}

/** 스태킹 도식 헤더 띠 — '층별 스태킹 플랜 (㎡)' / '(평)' */
export function stackingStripTitle(unit: AreaInputUnit): string {
  return `층별 스태킹 플랜 (${areaUnitLabel(unit)})`;
}

/** 렌트롤 표 우상단 단위 캡션 — '면적 ㎡ · 금액 만원' / '면적 평 · 금액 만원' */
export function rentRollUnitCaption(unit: AreaInputUnit): string {
  return `면적 ${areaUnitLabel(unit)} · 금액 만원`;
}

/** 스태킹 라벨의 면적 꼬리표 ('209.60' + '㎡' / '평') */
export function stackingAreaSuffix(unit: AreaInputUnit): '㎡' | '평' {
  return areaUnitLabel(unit);
}

/** 공실 카드 등 압축 표기용 — 정수 반올림 + 단위 ('523㎡' / '158평'). 면적이 없으면 null */
export function formatLeaseAreaCompact(sqm: number | null | undefined, unit: AreaInputUnit): string | null {
  const v = leaseAreaInUnit(sqm, unit);
  if (v == null) return null;
  return `${Math.round(v).toLocaleString('en-US')}${areaUnitLabel(unit)}`;
}
