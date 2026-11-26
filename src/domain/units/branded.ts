/**
 * @file src/domain/units/branded.ts
 * @description Compile-time branded numeric unit types and deterministic CRE unit converters.
 *
 * Prevents silent dimensional bugs across the CRE IM pipeline such as:
 * - Mixing `Manwon` (만원) and `Krw` (원)
 * - Mixing `Sqm` (㎡) and `Pyeong` (평)
 * - Double-multiplying percentage Cap Rates (`3.42 * 100 = 342%`)
 */

declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** 대한민국 원화 (KRW, 1원 단위) */
export type Krw = Brand<number, 'Krw'>;

/** 만원 단위 (1 Manwon = 10,000 KRW) */
export type Manwon = Brand<number, 'Manwon'>;

/** 억원 단위 (1 Eok = 100,000,000 KRW = 10,000 Manwon) */
export type Eok = Brand<number, 'Eok'>;

/** 제곱미터 (㎡) */
export type Sqm = Brand<number, 'Sqm'>;

/** 평 (1 ㎡ = 0.3025 평, 즉 1 평 = 400/121 ㎡) */
export type Pyeong = Brand<number, 'Pyeong'>;

/** 백분율 포인트 수치 (예: 3.42 === 3.42%) */
export type Pct = Brand<number, 'Pct'>;

/** 소수 비율 수치 (예: 0.0342 === 3.42%) */
export type Ratio = Brand<number, 'Ratio'>;

export const MANWON_IN_KRW = 10_000;
export const EOK_IN_KRW = 100_000_000;
export const SQM_TO_PYEONG_FACTOR = 0.3025;

// ──────────────────────────────────────────────────────────────────
// Constructors
// ──────────────────────────────────────────────────────────────────

export function asKrw(value: number): Krw {
  return value as Krw;
}

export function asManwon(value: number): Manwon {
  return value as Manwon;
}

export function asEok(value: number): Eok {
  return value as Eok;
}

export function asSqm(value: number): Sqm {
  return value as Sqm;
}

export function asPyeong(value: number): Pyeong {
  return value as Pyeong;
}

export function asPct(value: number): Pct {
  return value as Pct;
}

export function asRatio(value: number): Ratio {
  return value as Ratio;
}

// ──────────────────────────────────────────────────────────────────
// Pure Deterministic Unit Converters
// ──────────────────────────────────────────────────────────────────

export function manwonToKrw(m: Manwon | number): Krw {
  return asKrw(Number(m) * MANWON_IN_KRW);
}

export function krwToManwon(k: Krw | number): Manwon {
  return asManwon(Number(k) / MANWON_IN_KRW);
}

export function sqmToPyeong(sqm: Sqm | number): Pyeong {
  return asPyeong(Number(sqm) * SQM_TO_PYEONG_FACTOR);
}

export function pyeongToSqm(py: Pyeong | number): Sqm {
  return asSqm(Number(py) / SQM_TO_PYEONG_FACTOR);
}

/**
 * Normalizes a raw Cap Rate / yield input into a percentage `Pct` value:
 * - Decimal ratios `< 0.5` (e.g. `0.0342`) are scaled via `* 100` -> `3.42`
 * - Already-percentage inputs `>= 0.5` (e.g. `3.42`) are preserved as `3.42`
 * - Non-finite or non-positive inputs return `0` as `Pct`
 */
export function normalizeCapRatePct(raw: number): Pct {
  if (!Number.isFinite(raw) || raw <= 0) {
    return asPct(0);
  }
  if (raw < 0.5) {
    return asPct(Number((raw * 100).toPrecision(12)));
  }
  return asPct(raw);
}
