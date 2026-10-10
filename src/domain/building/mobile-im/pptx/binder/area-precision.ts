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

export interface RegisterAreas {
  totArea?: number | null;
  platArea?: number | null;
  archArea?: number | null;
  /** 대장이 신뢰 가능(display-areas.isRegisterTrustworthy)하면 연면적은 괴리 크기와 무관하게 대장값이 정본 */
  gfaAuthoritative?: boolean;
}

const SNAP_TOLERANCE = 0.01; // 중개인/환산 값이 대장값과 1% 이내면 같은 값으로 간주

/** 면적 라벨별 대장 기준값 (연면적 → totArea, 대지면적 → platArea, 건축면적 → archArea) */
function registerRefFor(label: string, reg: RegisterAreas): number | null {
  const pick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  if (/연면적/.test(label)) return pick(reg.totArea);
  if (/대지면적/.test(label)) return pick(reg.platArea);
  if (/건축면적/.test(label)) return pick(reg.archArea);
  return null;
}

/**
 * 표시용 스냅: "N㎡ (M평)" 의 N 이 대장 기준값과 1% 이내이고 정확히 같지 않으면 대장 정밀값으로 표기.
 * (예: 평→㎡ 환산 1,441.157 → 대장 1,441.15). 1% 초과 괴리는 중개인 값 그대로 둔다(충돌은 별도 경고 대상).
 */
function snapToRegister(value: string, ref: number, force = false): string {
  const m = /^\s*(\d[\d,]*(?:\.\d+)?)\s*㎡\s*\(\s*(?:약\s*)?\d[\d,.]*\s*평\s*\)\s*$/.exec(value);
  if (!m) return value;
  const v = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(v) || v <= 0) return value;
  if (Math.abs(v - ref) < 1e-9) return value;
  if (!force && Math.abs(v - ref) / ref > SNAP_TOLERANCE) return value;
  return `${formatSqm(ref)}㎡ (${formatPyeong(ref, 1)}평)`;
}

function normalizeRows(rows: unknown, reg?: RegisterAreas): void {
  if (!Array.isArray(rows)) return;
  for (const r of rows as Row[]) {
    if (Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && AREA_LABEL.test(r[0])) {
      const ref = reg ? registerRefFor(r[0], reg) : null;
      if (ref) r[1] = snapToRegister(r[1], ref, !!reg?.gfaAuthoritative && /연면적/.test(r[0]));
      r[1] = normalizeAreaValuePrecision(r[1]);
    }
  }
}

/** dataMap 의 물건 개요(building)·토지(land) 슬라이드 좌/우 행을 제자리 정규화 */
export function normalizeAreaRowsPrecision(dataMap: Record<string, any>, register?: RegisterAreas): void {
  for (const key of ['building', 'land']) {
    const d = dataMap?.[key];
    if (!d) continue;
    normalizeRows(d.left?.rows, register);
    normalizeRows(d.right?.rows, register);
  }
}
