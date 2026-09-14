export const PYEONG_RATIO = 0.3025;
export const SQM_RATIO = 3.305785; // 1 / 0.3025

export const MAX_FLOOR_AREA_PY = 3000;
export const MAX_BUILDING_AREA_PY = 30000;

export function sqmToPyeong(sqm: number): number {
  return sqm * PYEONG_RATIO;
}

export function pyeongToSqm(pyeong: number): number {
  return pyeong / PYEONG_RATIO;
}

export function formatPyeong(sqm: number, fractionDigits: number = 1): string {
  return (sqm * PYEONG_RATIO).toFixed(fractionDigits);
}

/**
 * Extracts Pyeong area from a mixed string like "96평(약 317.4㎡)" or "317.4㎡".
 * Follows Rule D40 #32: Dedicated Area Extractor
 */
export function extractAreaPyeong(text?: string, isTotalArea: boolean = false): number | undefined {
  if (!text) return undefined;
  
  let result: number | undefined;

  // 1. "N평" 우선 추출
  const pyMatch = text.match(/([\d,.]+)\s*평/);
  if (pyMatch) {
    const py = parseFloat(pyMatch[1].replace(/,/g, ''));
    if (!isNaN(py)) result = Math.round(py * 10) / 10;
  }
  
  // 2. "N㎡" 환산 (* 0.3025)
  if (result === undefined) {
    const m2Match = text.match(/([\d,.]+)\s*㎡/);
    if (m2Match) {
      const m2 = parseFloat(m2Match[1].replace(/,/g, ''));
      if (!isNaN(m2)) result = Math.round(m2 * PYEONG_RATIO * 10) / 10;
    }
  }
  
  // 3. 순수 숫자만 있는 경우 파싱
  if (result === undefined) {
    const numOnly = text.replace(/[^\d.]/g, '');
    if (numOnly) {
      const num = parseFloat(numOnly);
      if (!isNaN(num)) result = Math.round(num * 10) / 10;
    }
  }

  // 4. 상한 가드
  if (result !== undefined) {
    const limit = isTotalArea ? MAX_BUILDING_AREA_PY : MAX_FLOOR_AREA_PY;
    if (result > limit) {
      console.warn(`[Area Guard] Area ${result} exceeds limit ${limit}. Rejecting value.`);
      return undefined;
    }
    return result;
  }
  
  return undefined;
}
