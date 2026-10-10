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
 * 관리비가 모든 호실에서 미기입이면 관리비 열과 월합계 열(= 월임대료와 동일)을 함께 생략한다.
 *
 * 한 칸에 다른 면적을 대신 채워 넣지 않는다 (예전 폴백: 전용면적 칸에 임대면적 값 복사 → 오표기).
 * rules/07 #68(열 수 = 셀 수)을 지키기 위해 헤더·열폭·행 셀을 같은 keep 인덱스로 동시에 투영한다.
 */

export const BASIC_RENTROLL_HEADERS = [
  '층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일',
] as const;

/** D6: 입력(비고/임대상태/갱신요구권)이 있을 때만 붙는 11번째 열 */
export const RENTROLL_NOTE_HEADER = '비고';
export const NOTE_COL = 10;
/** 용도 열 인덱스 — 모든 행이 '-'/빈 값이면 투영에서 생략 */
export const USE_COL = 2;
/** 관리비·월합계 열 인덱스 — 관리비가 전 행 미기입이면 두 열을 함께 생략 (월합계 = 월임대료로 중복) */
export const MGMT_COL = 7;
export const MONTHLY_TOTAL_COL = 8;
/** 만기일 열 인덱스 — 전 행 미기입이면 생략 */
export const EXPIRY_COL = 9;
/** 비고 열 기준 폭(in) — 11열 투영 시에만 사용 */
export const RENTROLL_NOTE_COL_W = 1.0;

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

/** '-', '', '〃' 등은 미기입. 양수 숫자가 들어 있으면 기입으로 본다. ('209.6 (63.4평)' → 첫 숫자 토큰 209.6) */
function hasAreaValue(cell: unknown): boolean {
  const m = String(cell ?? '').match(/\d[\d,]*(?:\.\d+)?/);
  const n = m ? parseFloat(m[0].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0;
}

/** 비고 셀에 실제 내용이 있는지 ('-', '', '〃' 제외) */
function hasNoteValue(cell: unknown): boolean {
  const s = String(cell ?? '').trim();
  return s !== '' && s !== '-' && s !== '〃';
}

/** 관리비 셀 기입 여부 — '별도'·'실비' 같은 비숫자 표기도 기입, 순수 0(원/만원)은 미기입 */
function hasMgmtValue(cell: unknown): boolean {
  if (!hasNoteValue(cell)) return false;
  return !/^0(?:\.0+)?\s*(?:만원|원)?$/.test(String(cell).trim());
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
  const dataRows = rows.filter((r) => !isRentRollSummaryRow(r));
  // 용도 열 — 모든 데이터 행이 '-'/빈 값이면 열 자체를 생략 (상호=업종 단일 입력처럼 구분되는 용도가 없을 때)
  const hasUse = dataRows.some((r) => hasNoteValue(r[USE_COL]));
  const dropUse = dataRows.length > 0 && !hasUse;
  // 관리비 열 — 모든 데이터 행이 미기입('-'/빈 값/0)이면 관리비 열과, 월임대료와 같아지는 월합계 열을 함께 생략
  const hasMgmt = dataRows.some((r) => hasMgmtValue(r[MGMT_COL]));
  const dropMgmt = dataRows.length > 0 && !hasMgmt;
  // 만기일 열 — 전 행 미기입('-'/빈 값/미기재류)이면 정보가 없는 열이므로 생략 (P3 지면 지표: 전부 '-' 열 금지)
  const hasExpiry = dataRows.some((r) => hasNoteValue(r[EXPIRY_COL]) && !/^(?:미기재|미상|확인\s*필요|N\/?A)$/i.test(String(r[EXPIRY_COL]).trim()));
  const dropExpiry = dataRows.length > 0 && !hasExpiry;
  const keep = all.filter((i) => i !== dropIdx
    && !(dropUse && i === USE_COL)
    && !(dropExpiry && i === EXPIRY_COL)
    && !(dropMgmt && (i === MGMT_COL || i === MONTHLY_TOTAL_COL)));
  // D6: 비고 열 — 데이터 행 중 하나라도 비고가 있을 때만 (헤더·열폭·셀을 같은 keep 으로 투영해 열 수 = 셀 수 유지)
  const hasNote = dataRows.some((r) => hasNoteValue(r[NOTE_COL]));
  if (hasNote) keep.push(NOTE_COL);

  // 제거한 열의 폭은 텍스트가 긴 열(임차인·용도·만기일)에 되돌려 표 전체 폭을 유지한다
  const w: number[] = [...BASIC_RENTROLL_COL_W, RENTROLL_NOTE_COL_W];
  if (dropIdx >= 0) {
    const freed = w[dropIdx];
    w[1] += freed * 0.46;
    w[2] += freed * 0.28;
    w[9] += freed * 0.26;
  }
  if (dropUse) {
    const freedUse = w[USE_COL];
    w[1] += freedUse * 0.5;
    if (hasNote) w[NOTE_COL] += freedUse * 0.5;
    else w[9] += freedUse * 0.5;
  }
  if (dropMgmt) {
    const freedMgmt = w[MGMT_COL] + w[MONTHLY_TOTAL_COL];
    w[1] += freedMgmt * 0.5;
    if (!dropUse) w[USE_COL] += freedMgmt * 0.25;
    else w[1] += freedMgmt * 0.25;
    if (hasNote) w[NOTE_COL] += freedMgmt * 0.25;
    else w[9] += freedMgmt * 0.25;
  }
  if (dropExpiry) {
    // 만기일 열(및 앞 단계에서 만기일로 돌려준 폭)을 임차인·용도·비고 열로 재분배 — 표 전체 폭 유지
    const freedExp = w[EXPIRY_COL];
    w[EXPIRY_COL] = 0;
    w[1] += freedExp * 0.5;
    if (!dropUse) w[USE_COL] += freedExp * 0.25;
    else w[1] += freedExp * 0.25;
    if (hasNote) w[NOTE_COL] += freedExp * 0.25;
    else w[1] += freedExp * 0.25;
  }
  const colW = keep.map((i) => Math.round(w[i] * 100) / 100);
  const headerAt = (i: number): string => (i === NOTE_COL ? RENTROLL_NOTE_HEADER : BASIC_RENTROLL_HEADERS[i]);

  return {
    mode,
    keep,
    headers: keep.map(headerAt),
    colW,
  };
}

/** 숫자 열(우측 정렬) 판정 — 열 인덱스가 아니라 머리글 기준 (투영 후에도 정렬이 유지되도록) */
const NUMERIC_HEADERS = new Set(['임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계']);
export function isNumericRentRollHeader(header: string): boolean {
  return NUMERIC_HEADERS.has(header);
}
