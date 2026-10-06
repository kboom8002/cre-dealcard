/**
 * 면적 행 표기 정밀도 정규화 (표시 전용 — 값은 바꾸지 않는다).
 *
 * LLM/뷰어 표에서 넘어온 '3,842.644㎡ (1162평)' / '486.281㎡' 처럼 평→㎡ 환산 잔여 소수가 3자리로 남은 값을
 * 소수 1자리('3,842.6㎡ (1162.4평)' / '486.3㎡')로 통일한다. 면적 라벨(대지면적·연면적·건축면적 등) 행만 대상.
 * 소수 3자리 이상인 값만 대상 — 대장 원천값(1,441.15 / 263.01 등 2자리 이하)은 건드리지 않는다.
 */
import { formatPyeong, formatSqm } from '@/lib/utils/area-conversion';

const AREA_LABEL = /면적/;
const FULL_AREA_VALUE = /^\s*(\d[\d,]*\.\d{3,})\s*㎡\s*\(\s*(?:약\s*)?\d[\d,.]*\s*평\s*\)\s*$/;
const LONG_DECIMAL_SQM = /(\d[\d,]*\.\d{3,})\s*㎡/g;

export function normalizeAreaValuePrecision(value: string): string {
  const full = FULL_AREA_VALUE.exec(value);
  if (full) {
    const v = Number(full[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) return `${formatSqm(v)}㎡ (${formatPyeong(v, 1)}평)`;
  }
  return value.replace(LONG_DECIMAL_SQM, (_m, num: string) => {
    const v = Number(num.replace(/,/g, ''));
    return Number.isFinite(v) ? `${formatSqm(v)}㎡` : _m;
  });
}

type Row = [string, string, ...unknown[]];

function normalizeRows(rows: unknown): void {
  if (!Array.isArray(rows)) return;
  for (const r of rows as Row[]) {
    if (Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && AREA_LABEL.test(r[0])) {
      r[1] = normalizeAreaValuePrecision(r[1]);
    }
  }
}

/** dataMap 의 물건 개요(building)·토지(land) 슬라이드 좌/우 행을 제자리 정규화 */
export function normalizeAreaRowsPrecision(dataMap: Record<string, any>): void {
  for (const key of ['building', 'land']) {
    const d = dataMap?.[key];
    if (!d) continue;
    normalizeRows(d.left?.rows);
    normalizeRows(d.right?.rows);
  }
}
