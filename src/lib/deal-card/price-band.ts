/**
 * Price Band & Korean Currency SSOT (WP-P1-01)
 *
 * Rules:
 * 1. Unified formatPriceRange(priceKrw, bandType), parseLegacyBand(raw), formatKrw(val).
 * 2. Senior-friendly Korean currency formatting: 억 / 만 units, zero omission.
 * 3. Strict ban on decimal eok (e.g., 1.5억 -> 1억 5,000만).
 * 4. Exact asking price 95억 KRW -> strictly "90~100억" ([lower, lower + unit)); tooltip reads "90억 이상 100억 미만".
 * 5. parseLegacyBand() handles "90억대", "50~60억원대", "100억 이상", etc. and NEVER throws.
 */

export type PriceBandType = 'standard' | 'coarse';

export interface ParsedPriceBand {
  minKrw: number;
  maxKrw: number;
  label: string;
}

const EOK = 1_0000_0000; // 100,000,000
const MAN = 1_0000;       // 10,000

/**
 * Returns band width (in KRW) based on price and band type.
 */
function getBandWidth(priceKrw: number, bandType: PriceBandType = 'standard'): number {
  if (bandType === 'coarse') {
    if (priceKrw < 50 * EOK) return 10 * EOK;
    if (priceKrw < 100 * EOK) return 20 * EOK;
    if (priceKrw < 300 * EOK) return 50 * EOK;
    return 100 * EOK;
  }

  // Standard band widths:
  if (priceKrw < 1 * EOK) return 1000 * MAN; // 1,000만
  if (priceKrw < 30 * EOK) return 5 * EOK;    // 5억 (<30억)
  if (priceKrw < 100 * EOK) return 10 * EOK;  // 10억 (30~100억)
  if (priceKrw < 300 * EOK) return 20 * EOK;  // 20억 (100~300억)
  return 50 * EOK;                           // 50억 (300억+)
}

/**
 * Helper to format a single amount in clean Korean without "원" suffix for ranges.
 * E.g., 90_0000_0000 -> "90", 100_0000_0000 -> "100" (if unit is 억).
 */
function formatAmountWithoutWon(val: number): string {
  if (val === 0) return '0';
  const eokPart = Math.floor(val / EOK);
  const remainder = val % EOK;
  const manPart = Math.floor(remainder / MAN);
  const rest = remainder % MAN;

  if (eokPart > 0 && manPart > 0) {
    return `${eokPart}억 ${manPart.toLocaleString('ko-KR')}만`;
  }
  if (eokPart > 0) {
    if (rest > 0) return `${eokPart}억 ${rest.toLocaleString('ko-KR')}`;
    return `${eokPart}억`;
  }
  if (manPart > 0) {
    if (rest > 0) return `${manPart.toLocaleString('ko-KR')}만 ${rest.toLocaleString('ko-KR')}`;
    return `${manPart.toLocaleString('ko-KR')}만`;
  }
  return rest.toLocaleString('ko-KR');
}

/**
 * Formats an exact price into a senior-friendly price band string.
 * Strict ban on decimal eok (never "1.5억" -> "1억 5,000만").
 * E.g., 95억 KRW -> "90~100억".
 */
export function formatPriceRange(priceKrw: number, bandType: PriceBandType = 'standard'): string {
  if (!priceKrw || typeof priceKrw !== 'number' || isNaN(priceKrw) || priceKrw <= 0) {
    return '가격 협의';
  }

  const width = getBandWidth(priceKrw, bandType);
  const lower = Math.floor(priceKrw / width) * width;
  const upper = lower + width;

  const lowerEok = Math.floor(lower / EOK);
  const upperEok = Math.floor(upper / EOK);

  // If both lower and upper are whole 억 (and lower > 0):
  if (lower % EOK === 0 && upper % EOK === 0 && lower > 0) {
    return `${lowerEok}~${upperEok}억`;
  }

  // If lower is 0 and upper is eok:
  if (lower === 0 && upper % EOK === 0) {
    return `${upperEok}억 미만`;
  }

  // Under 1억: both are whole 만
  if (lower < EOK && upper <= EOK && lower % MAN === 0 && upper % MAN === 0) {
    const lowerMan = Math.floor(lower / MAN);
    const upperMan = Math.floor(upper / MAN);
    return `${lowerMan.toLocaleString('ko-KR')}~${upperMan.toLocaleString('ko-KR')}만`;
  }

  // General format: lower~upper
  const lowerStr = formatAmountWithoutWon(lower);
  const upperStr = formatAmountWithoutWon(upper);
  return `${lowerStr}~${upperStr}`;
}

/**
 * Tooltip explanation for the price band range.
 * E.g., 95억 KRW -> "90억 이상 100억 미만".
 */
export function formatPriceRangeTooltip(priceKrw: number, bandType: PriceBandType = 'standard'): string {
  if (!priceKrw || typeof priceKrw !== 'number' || isNaN(priceKrw) || priceKrw <= 0) {
    return '매도인과 가격 협의 필요';
  }

  const width = getBandWidth(priceKrw, bandType);
  const lower = Math.floor(priceKrw / width) * width;
  const upper = lower + width;

  if (lower === 0) {
    return `${formatKrw(upper)} 미만`;
  }

  return `${formatKrw(lower)} 이상 ${formatKrw(upper)} 미만`;
}

/**
 * Formats a KRW amount into senior-friendly Korean string.
 * Strictly bans decimal eok (1.5억 -> 1억 5,000만).
 * Zero-omission rules: 100억 (not 100억 0만).
 */
export function formatKrw(val: number): string {
  if (typeof val !== 'number' || isNaN(val)) {
    return '가격 미정';
  }
  if (val === 0) return '0원';
  if (val < 0) return `-${formatKrw(Math.abs(val))}`;

  const eokPart = Math.floor(val / EOK);
  const remainder = val % EOK;
  const manPart = Math.floor(remainder / MAN);
  const rest = Math.round(remainder % MAN);

  const parts: string[] = [];

  if (eokPart > 0) {
    parts.push(`${eokPart}억`);
  }
  if (manPart > 0) {
    parts.push(`${manPart.toLocaleString('ko-KR')}만`);
  }
  if (rest > 0) {
    parts.push(`${rest.toLocaleString('ko-KR')}원`);
  } else if (parts.length > 0) {
    // End with Korean unit (e.g. 100억 or 1억 5,000만)
  }

  return parts.length > 0 ? parts.join(' ') : '0원';
}

/**
 * Parses legacy band string safely into numeric range and normalized label.
 * NEVER throws runtime errors.
 * Examples:
 * - "90억대" -> { minKrw: 9000000000, maxKrw: 10000000000, label: "90~100억" }
 * - "50~60억원대", "50~60억" -> { minKrw: 5000000000, maxKrw: 6000000000, label: "50~60억" }
 * - "100억 이상" -> { minKrw: 10000000000, maxKrw: 15000000000, label: "100억 이상" }
 * - "30억 미만" -> { minKrw: 0, maxKrw: 3000000000, label: "30억 미만" }
 * - "가격 협의", null, "" -> { minKrw: 0, maxKrw: 0, label: "가격 협의" }
 */
export function parseLegacyBand(raw?: string | null): ParsedPriceBand {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { minKrw: 0, maxKrw: 0, label: '가격 협의' };
  }

  const text = raw.trim();

  if (text.includes('협의') || text.includes('미정')) {
    return { minKrw: 0, maxKrw: 0, label: '가격 협의' };
  }

  // Pattern 1: Range like "50~60억", "50~60억원대", "50-60억"
  const rangeMatch = text.match(/(\d+)\s*(?:억)?\s*[~-]\s*(\d+)\s*억/);
  if (rangeMatch) {
    const minEok = parseInt(rangeMatch[1], 10);
    const maxEok = parseInt(rangeMatch[2], 10);
    return {
      minKrw: minEok * EOK,
      maxKrw: maxEok * EOK,
      label: `${minEok}~${maxEok}억`,
    };
  }

  // Pattern 2: Single unit "90억대", "90억원대"
  const daeMatch = text.match(/(\d+)\s*억(?:원)?대/);
  if (daeMatch) {
    const baseEok = parseInt(daeMatch[1], 10);
    const widthEok = baseEok < 30 ? 5 : 10;
    const lower = Math.floor(baseEok / widthEok) * widthEok;
    const upper = lower + widthEok;
    return {
      minKrw: lower * EOK,
      maxKrw: upper * EOK,
      label: `${lower}~${upper}억`,
    };
  }

  // Pattern 3: "100억 이상"
  const aboveMatch = text.match(/(\d+)\s*억(?:원)?\s*이상/);
  if (aboveMatch) {
    const minEok = parseInt(aboveMatch[1], 10);
    return {
      minKrw: minEok * EOK,
      maxKrw: Math.round(minEok * 1.5) * EOK,
      label: `${minEok}억 이상`,
    };
  }

  // Pattern 4: "30억 미만"
  const underMatch = text.match(/(\d+)\s*억(?:원)?\s*미만/);
  if (underMatch) {
    const maxEok = parseInt(underMatch[1], 10);
    return {
      minKrw: 0,
      maxKrw: maxEok * EOK,
      label: `${maxEok}억 미만`,
    };
  }

  // Pattern 5: Plain number like "9500000000" or "95억"
  const singleEokMatch = text.match(/^(\d+)\s*억$/);
  if (singleEokMatch) {
    const priceEok = parseInt(singleEokMatch[1], 10);
    const priceKrw = priceEok * EOK;
    const width = getBandWidth(priceKrw, 'standard');
    const lower = Math.floor(priceKrw / width) * width;
    const upper = lower + width;
    return {
      minKrw: lower,
      maxKrw: upper,
      label: formatPriceRange(priceKrw, 'standard'),
    };
  }

  // Numeric fallback
  const numericOnly = text.replace(/[^0-9]/g, '');
  if (numericOnly.length >= 8) {
    const parsed = parseInt(numericOnly, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const width = getBandWidth(parsed, 'standard');
      const lower = Math.floor(parsed / width) * width;
      const upper = lower + width;
      return {
        minKrw: lower,
        maxKrw: upper,
        label: formatPriceRange(parsed, 'standard'),
      };
    }
  }

  return { minKrw: 0, maxKrw: 0, label: text };
}
