// src/domain/building/mobile-im/rentroll-meta-parse.ts
// 렌트롤 v1.5 supplemental.rent_roll_meta 서버 검증 (generate / generate-async 라우트 공용).
//
// 원칙
//  - 클라이언트가 보낸 값은 신뢰하지 않는다: enum·숫자·길이를 검증하고 문자열은 sanitize(제어문자·<> 제거).
//  - 실패 시 한국어 메시지(400). 통과한 값만 supplemental.rent_roll_meta 로 반영한다.
//  - area_unit_override.by / at 은 클라이언트 값을 무시한다 — 핸들러가 userId·현재 시각으로 채운다 (위조 방지).
//  - 환산 금지(스펙 §8): gfa_sqm(J4)·market_rent_*(J5~J7)는 입력값 그대로 보관한다.
// 계약 타입은 rentroll-meta.ts (공유 계약) — 여기서 재정의하지 않는다.

import type { AreaInputUnit, RentRollMeta, RentrollVersion } from './rentroll-meta';

export type RentRollMetaParseResult =
  | { ok: true; value: RentRollMeta | undefined }
  | { ok: false; error: string };

/** 클라이언트·서버 공용 한도 (단일 소스) */
export const RENTROLL_META_LIMITS = {
  sourceChars: 200,
  noteChars: 200,
  overrideReasonChars: 200,
  askingPriceMaxKrw: 1e14,
  gfaMaxSqm: 1e7,
  marketRentMaxKrw: 1e10,
  otherIncomeMaxKrw: 1e12,
} as const;

const PREFIX = '렌트롤 정보';
const AREA_UNITS: readonly AreaInputUnit[] = ['sqm', 'pyeong'];
const VERSIONS: readonly RentrollVersion[] = ['1.3', '1.4', '1.5', 'unknown'];
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class MetaError extends Error {}

/** 제어문자 → 공백, '<' '>' 제거, 연속 공백 정리, trim. 비문자열은 오류. 빈 문자열은 '' */
function cleanString(v: unknown, label: string): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new MetaError(`${PREFIX} — ${label} 형식이 올바르지 않습니다.`);
  return v.replace(CONTROL_CHARS, ' ').replace(/[<>]/g, '').replace(/ {2,}/g, ' ').trim();
}

function cleanText(v: unknown, label: string, max: number): string | undefined {
  const s = cleanString(v, label);
  if (!s) return undefined;
  if (s.length > max) throw new MetaError(`${PREFIX} — ${label}은(는) ${max}자 이하로 입력해주세요. (현재 ${s.length}자)`);
  return s;
}

/** 숫자 또는 숫자 문자열(쉼표 허용). 비어 있으면 undefined. 숫자가 아니면 오류 */
function rawNumber(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  let n: unknown = v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    n = Number(t.replace(/,/g, ''));
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new MetaError(`${PREFIX} — ${label}은(는) 숫자로 입력해주세요.`);
  }
  return n;
}

function positiveNumber(v: unknown, label: string, max: number): number | undefined {
  const n = rawNumber(v, label);
  if (n === undefined) return undefined;
  if (n <= 0 || n > max) throw new MetaError(`${PREFIX} — ${label}은(는) 0보다 크고 ${max.toLocaleString('en-US')} 이하인 숫자로 입력해주세요.`);
  return n;
}

/** 원 단위 양의 정수 (엑셀 부동소수 잡음은 반올림으로 정규화) */
function positiveInt(v: unknown, label: string, max: number): number | undefined {
  const n = positiveNumber(v, label, max);
  if (n === undefined) return undefined;
  const r = Math.round(n);
  if (r <= 0) throw new MetaError(`${PREFIX} — ${label}은(는) 1 이상의 정수로 입력해주세요.`);
  return r;
}

function nonNegativeInt(v: unknown, label: string, max: number): number | undefined {
  const n = rawNumber(v, label);
  if (n === undefined) return undefined;
  if (n < 0 || n > max) throw new MetaError(`${PREFIX} — ${label}은(는) 0 이상 ${max.toLocaleString('en-US')} 이하인 숫자로 입력해주세요.`);
  return Math.round(n);
}

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * body.rent_roll_meta 검증.
 * - 미전달(undefined/null) → ok:true, value: undefined (핸들러가 기본값 { area_input_unit: 'sqm' } 적용)
 * - 전달 시 area_input_unit 미지정은 'sqm'
 */
export function parseRentRollMeta(input: unknown): RentRollMetaParseResult {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  try {
    if (typeof input !== 'object' || Array.isArray(input)) {
      throw new MetaError(`${PREFIX} 형식이 올바르지 않습니다.`);
    }
    const raw = input as Record<string, unknown>;
    const out: RentRollMeta = { area_input_unit: 'sqm' };

    // G9 — 면적 입력 단위 (enum). 빈 값은 기본 ㎡, 알 수 없는 값은 거부 (추측해서 보정하지 않는다)
    if (raw.area_input_unit !== undefined && raw.area_input_unit !== null && raw.area_input_unit !== '') {
      if (typeof raw.area_input_unit !== 'string' || !(AREA_UNITS as readonly string[]).includes(raw.area_input_unit)) {
        throw new MetaError(`${PREFIX} — 면적 입력 단위(area_input_unit)는 sqm 또는 pyeong 이어야 합니다.`);
      }
      out.area_input_unit = raw.area_input_unit as AreaInputUnit;
    }

    if (raw.rentroll_version !== undefined && raw.rentroll_version !== null && raw.rentroll_version !== '') {
      if (typeof raw.rentroll_version !== 'string' || !(VERSIONS as readonly string[]).includes(raw.rentroll_version)) {
        throw new MetaError(`${PREFIX} — 양식 버전(rentroll_version)이 올바르지 않습니다.`);
      }
      out.rentroll_version = raw.rentroll_version as RentrollVersion;
    }

    // C5 — 렌트롤 기준일
    const asOf = cleanString(raw.rentroll_as_of, '기준일');
    if (asOf) {
      if (!isValidIsoDate(asOf)) throw new MetaError(`${PREFIX} — 기준일(rentroll_as_of)은 YYYY-MM-DD 형식이어야 합니다.`);
      out.rentroll_as_of = asOf;
    }

    // J3 — 매각(희망)가(원)
    const asking = positiveInt(raw.asking_price_krw, '매각가(J3)', RENTROLL_META_LIMITS.askingPriceMaxKrw);
    if (asking !== undefined) out.asking_price_krw = asking;

    // J4 — 연면적(㎡ 고정). 환산하지 않고 소수 2자리로만 정규화
    const gfa = positiveNumber(raw.gfa_sqm, '연면적(J4)', RENTROLL_META_LIMITS.gfaMaxSqm);
    if (gfa !== undefined) out.gfa_sqm = Math.round(gfa * 100) / 100;

    // J5~J7 + M5~M7 — 시장 임대료(원/전용평·월) 및 출처
    const marketKeys = [
      ['market_rent_1f', '시장 임대료 1층(J5)', '시장 임대료 1층 출처(M5)'],
      ['market_rent_upper', '시장 임대료 지상층(J6)', '시장 임대료 지상층 출처(M6)'],
      ['market_rent_basement', '시장 임대료 지하층(J7)', '시장 임대료 지하층 출처(M7)'],
    ] as const;
    for (const [key, label, srcLabel] of marketKeys) {
      const v = positiveInt(raw[key], label, RENTROLL_META_LIMITS.marketRentMaxKrw);
      if (v !== undefined) out[key] = v;
      const srcKey = `${key}_source` as const;
      const src = cleanText(raw[srcKey], srcLabel, RENTROLL_META_LIMITS.sourceChars);
      if (src !== undefined) out[srcKey] = src;
    }

    // J8 + M8 — 기타수입(원/월). 0 은 허용(없음), 음수는 거부
    const other = nonNegativeInt(raw.other_income_krw, '기타수입(J8)', RENTROLL_META_LIMITS.otherIncomeMaxKrw);
    if (other !== undefined) out.other_income_krw = other;
    const note = cleanText(raw.other_income_note, '기타수입 내역(M8)', RENTROLL_META_LIMITS.noteChars);
    if (note !== undefined) out.other_income_note = note;

    // V12 해제 — 사유 필수. by/at 은 무시 (서버가 채움)
    if (raw.area_unit_override !== undefined && raw.area_unit_override !== null) {
      const ov = raw.area_unit_override;
      if (typeof ov !== 'object' || Array.isArray(ov)) {
        throw new MetaError(`${PREFIX} — 면적 단위 혼동 해제 정보 형식이 올바르지 않습니다.`);
      }
      const reason = cleanText((ov as Record<string, unknown>).reason, '면적 단위 혼동 해제 사유', RENTROLL_META_LIMITS.overrideReasonChars);
      if (!reason) throw new MetaError(`${PREFIX} — 면적 단위 혼동을 해제하려면 사유를 입력해주세요.`);
      out.area_unit_override = { reason };
    }

    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof MetaError) return { ok: false, error: e.message };
    throw e;
  }
}
