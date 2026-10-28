/**
 * @file src/domain/building/im-core/facts/area.ts
 * @description Pure domain SSOT for area conversion and pyeong calculations (Rule 75).
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export const PYEONG_RATIO = 0.3025;
export const SQM_RATIO = 3.305785; // 1 / 0.3025

/**
 * Converts square meters (㎡) to pyeong (평) using SSOT ratio 0.3025.
 */
export function m2ToPyeong(m2: number): number {
  return m2 * PYEONG_RATIO;
}

/**
 * Converts pyeong (평) to square meters (㎡).
 */
export function pyeongToM2(pyeong: number): number {
  return pyeong / PYEONG_RATIO;
}

/**
 * Formats square meters to pyeong string with specified fraction digits (default: 1).
 */
export function formatPyeong(m2: number, fractionDigits: number = 1): string {
  return (m2 * PYEONG_RATIO).toFixed(fractionDigits);
}
