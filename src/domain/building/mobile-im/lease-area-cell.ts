/**
 * 렌트롤 v1.5 §9.1 — 임대/전용면적 셀 표기 (Pro·Premium·A22·뷰어 마크다운 공용, 순수 함수)
 *
 * - 계산 정본은 ㎡. 표기만 입력 단위(㎡|평)로 바꾼다.
 * - 평 = ㎡ ÷ 3.305785 (소수 2자리), ㎡ = 그대로 (소수 2자리). 단일 단위 — '(N평)' 병기 없음.
 * - 값이 없거나 0 이하이면 '-' (지어내지 않는다).
 * 파일명 lease-area-format.ts 는 P4a(Basic 경로) 소유 — 이 파일은 P4b 표면 전용 경량 헬퍼.
 */
import { areaUnitLabel, sqmToInputUnit, type AreaInputUnit } from './rentroll-meta';

export const AREA_CELL_MISSING = '-';

const fmt2 = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 표기용 숫자 (입력 단위, 소수 2자리 반올림). 없으면 null */
export function leaseAreaValue(sqm: number | null | undefined, unit: AreaInputUnit): number | null {
  if (typeof sqm !== 'number' || !Number.isFinite(sqm) || sqm <= 0) return null;
  return sqmToInputUnit(sqm, unit);
}

/** 셀 문자열: '317.22' (㎡) / '95.96' (평) / '-' */
export function formatLeaseAreaCell(sqm: number | null | undefined, unit: AreaInputUnit): string {
  const v = leaseAreaValue(sqm, unit);
  return v == null ? AREA_CELL_MISSING : fmt2(v);
}

/** 이미 입력 단위로 변환된 값들의 합 (행에 표시된 값의 합과 일치시키기 위해 행별 변환값을 합산) */
export function sumLeaseAreaInUnit(
  sqmList: Array<number | null | undefined>,
  unit: AreaInputUnit,
): number | null {
  let s = 0;
  let any = false;
  for (const m of sqmList) {
    const v = leaseAreaValue(m, unit);
    if (v != null) {
      s += v;
      any = true;
    }
  }
  return any ? Math.round(s * 100) / 100 : null;
}

export function formatAreaNumber(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? fmt2(v) : AREA_CELL_MISSING;
}

/** 머리글: kind '임대면적' | '전용면적' → '임대면적(㎡)' | '임대면적(평)' */
export function leaseAreaHeaderLabel(kind: '임대면적' | '전용면적', unit: AreaInputUnit): string {
  return `${kind}(${areaUnitLabel(unit)})`;
}
