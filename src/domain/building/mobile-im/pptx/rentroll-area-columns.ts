/**
 * Basic IM 렌트롤 표(10열)의 면적 열 선택 — "사용자가 기입한 면적만 표기"
 *
 * 표준 10열: 층 · 임차인 · 용도 · 임대면적 · 전용면적 · 보증금 · 월임대료 · 관리비 · 월합계 · 만기일  (rules/07 #65)
 *
 * 면적 열은 데이터가 정한다 (표 전체 기준, 호실별 아님):
 *  - 임대·전용 둘 다 기입된 호실이 하나라도 각각 있으면 → 10열 (임대면적 + 전용면적)
 *  - 임대면적만 기입 → 9열 (전용면적 열 제거, 임대면적 열 유지)
 *  - 전용면적만 기입 → 9열 (임대면적 열 제거, 전용면적 열 유지)
 *  - 둘 다 비어 있음 → 9열 (임대면적 열만 '-' 로 유지: 면적 미기재 사실을 표에 남긴다)
 *
 * 한 칸에 다른 면적을 대신 채워 넣지 않는다 (예전 폴백: 전용면적 칸에 임대면적 값 복사 → 오표기).
 * rules/07 #68(열 수 = 셀 수)을 지키기 위해 헤더·열폭·행 셀을 같은 keep 인덱스로 동시에 투영한다.
 */

export const BASIC_RENTROLL_HEADERS = [
  '층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일',
] as const;

/** 10열 기준 열폭(in) — 합계 8.39 ≤ 표 영역 8.393 */
export const BASIC_RENTROLL_COL_W = [0.48, 1.05, 0.88, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1.30] as const;

export const LEASE_AREA_COL = 3;
export const EXCLUSIVE_AREA_COL = 4;

export type AreaColumnMode = 'both' | 'lease' | 'exclusive';

export interface AreaColumnProjection {
  mode: AreaColumnMode;
  /** 원본 10열 행에서 유지할 열 인덱스 */
  keep: number[];
  headers: string[];
  colW: number[];
}

/**
 * 합계 행 라벨. 주의: JS 의 \b 는 ASCII 단어 경계라 합계처럼 한글로 끝나는 문자열 뒤에서는 절대 매치되지 않는다 → (?:\s|$) 로 판정.
 */
export const RENTROLL_SUMMARY_CELL = /^(?:합계|계|총합|총액)(?:\s|$)/;

export function isRentRollSummaryRow(row: unknown[]): boolean {
  return row.some((c) => RENTROLL_SUMMARY_CELL.test(String(c ?? '').trim()));
}

/** '-', '', '〃' 등은 미기입. 양수 숫자가 들어 있으면 기입으로 본다. */
function hasAreaValue(cell: unknown): boolean {
  const n = parseFloat(String(cell ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0;
}

export function detectAreaColumnMode(rows: unknown[][]): AreaColumnMode {
  const dataRows = rows.filter((r) => !isRentRollSummaryRow(r));
  const hasLease = dataRows.some((r) => hasAreaValue(r[LEASE_AREA_COL]));
  const hasExclusive = dataRows.some((r) => hasAreaValue(r[EXCLUSIVE_AREA_COL]));
  if (hasLease && hasExclusive) return 'both';
  if (hasExclusive) return 'exclusive';
  return 'lease';
}

export function projectBasicRentRollColumns(rows: unknown[][]): AreaColumnProjection {
  const mode = detectAreaColumnMode(rows);
  const all = BASIC_RENTROLL_HEADERS.map((_, i) => i);
  const dropIdx = mode === 'both' ? -1 : mode === 'lease' ? EXCLUSIVE_AREA_COL : LEASE_AREA_COL;
  const keep = all.filter((i) => i !== dropIdx);

  // 제거한 열의 폭은 텍스트가 긴 열(임차인·용도·만기일)에 되돌려 표 전체 폭을 유지한다
  const w: number[] = [...BASIC_RENTROLL_COL_W];
  if (dropIdx >= 0) {
    const freed = w[dropIdx];
    w[1] += freed * 0.46;
    w[2] += freed * 0.28;
    w[9] += freed * 0.26;
  }
  const colW = keep.map((i) => Math.round(w[i] * 100) / 100);

  return {
    mode,
    keep,
    headers: keep.map((i) => BASIC_RENTROLL_HEADERS[i]),
    colW,
  };
}

/** 숫자 열(우측 정렬) 판정 — 열 인덱스가 아니라 머리글 기준 (투영 후에도 정렬이 유지되도록) */
const NUMERIC_HEADERS = new Set(['임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계']);
export function isNumericRentRollHeader(header: string): boolean {
  return NUMERIC_HEADERS.has(header);
}
