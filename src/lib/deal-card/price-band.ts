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
const JO = 1_0000 * EOK; // 1,000,000,000,000 (1조)
const MAN = 1_0000;       // 10,000

/**
 * Returns band width (in KRW) based on price and band type.
 * Guarantees >= 5% blind width for all standard tiers >= 1억 (and >= 10% for coarse).
 */
export function getBandWidth(priceKrw: number, bandType: PriceBandType = 'standard'): number {
  if (bandType === 'coarse') {
    if (priceKrw < 50 * EOK) return 10 * EOK;
    if (priceKrw < 100 * EOK) return 20 * EOK;
    if (priceKrw < 300 * EOK) return 50 * EOK;
    if (priceKrw < 1000 * EOK) return 100 * EOK;
    if (priceKrw < 2000 * EOK) return 200 * EOK;
    const minCoarse = Math.ceil((priceKrw * 0.1) / (100 * EOK)) * (100 * EOK);
    return Math.max(200 * EOK, minCoarse);
  }

  // Standard band widths (guaranteed >= 5% width of asking price):
  if (priceKrw < 1 * EOK) return 1000 * MAN;     // 1,000만
  if (priceKrw < 30 * EOK) return 5 * EOK;       // 5억 (>= 16.7%)
  if (priceKrw < 100 * EOK) return 10 * EOK;     // 10억 (>= 10.0%)
  if (priceKrw < 300 * EOK) return 20 * EOK;     // 20억 (>= 6.7%)
  if (priceKrw < 1000 * EOK) return 50 * EOK;    // 50억 (>= 5.0%)
  if (priceKrw < 2000 * EOK) return 100 * EOK;   // 100억 (>= 5.0%)
  if (priceKrw < 4000 * EOK) return 200 * EOK;   // 200억 (>= 5.0%)
  if (priceKrw < 1 * JO) return 500 * EOK;       // 500억 (>= 5.0%)
  const minJoStep = Math.ceil((priceKrw * 0.05) / (1000 * EOK)) * (1000 * EOK);
  return Math.max(1000 * EOK, minJoStep);
}

function fmtInt(val: number): string {
  return Math.trunc(val).toLocaleString('ko-KR');
}

/**
 * Helper to format a single amount in clean Korean without "원" suffix for ranges.
 * E.g., 90_0000_0000 -> "90억", 2000_0000_0000 -> "2,000억", 1_2000_0000_0000 -> "1조 2,000억".
 */
function formatAmountWithoutWon(val: number): string {
  if (val === 0) return '0';
  const joPart = Math.floor(val / JO);
  const afterJo = val % JO;
  const eokPart = Math.floor(afterJo / EOK);
  const remainder = afterJo % EOK;
  const manPart = Math.floor(remainder / MAN);
  const rest = remainder % MAN;

  if (joPart > 0) {
    const parts = [`${fmtInt(joPart)}조`];
    if (eokPart > 0) parts.push(`${fmtInt(eokPart)}억`);
    else if (manPart > 0) parts.push(`${fmtInt(manPart)}만`);
    return parts.join(' ');
  }
  if (eokPart > 0 && manPart > 0) {
    return `${fmtInt(eokPart)}억 ${fmtInt(manPart)}만`;
  }
  if (eokPart > 0) {
    if (rest > 0) return `${fmtInt(eokPart)}억 ${fmtInt(rest)}`;
    return `${fmtInt(eokPart)}억`;
  }
  if (manPart > 0) {
    if (rest > 0) return `${fmtInt(manPart)}만 ${fmtInt(rest)}`;
    return `${fmtInt(manPart)}만`;
  }
  return fmtInt(rest);
}

/**
 * Parses Korean price expressions including 조, 억, 천, 만 and commas into exact KRW.
 * Returns null if no positive price can be parsed.
 */
export function parseKoreanPriceKrw(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.replace(/,/g, '').trim();
  if (!text) return null;

  let total = 0;
  let matched = false;

  const joMatch = text.match(/(\d+(?:\.\d+)?)\s*조(?:\s*(\d+(?:\.\d+)?)\s*억)?/);
  if (joMatch) {
    matched = true;
    total += parseFloat(joMatch[1]) * JO;
    if (joMatch[2]) total += parseFloat(joMatch[2]) * EOK;
  } else {
    const eokMatch = text.match(/(\d+(?:\.\d+)?)\s*억(?:\s*(\d+(?:\.\d+)?)\s*천)?(?:\s*(\d+(?:\.\d+)?)\s*만)?/);
    if (eokMatch) {
      matched = true;
      total += parseFloat(eokMatch[1]) * EOK;
      if (eokMatch[2]) total += parseFloat(eokMatch[2]) * 1000 * MAN;
      if (eokMatch[3]) total += parseFloat(eokMatch[3]) * MAN;
    } else {
      const manMatch = text.match(/(\d+(?:\.\d+)?)\s*만/);
      if (manMatch) {
        matched = true;
        total += parseFloat(manMatch[1]) * MAN;
      }
    }
  }

  return matched && Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

/**
 * Formats an exact price into a senior-friendly price band string (>= 5% width).
 * Strict ban on decimal eok (never "1.5억" -> "1억 5,000만").
 * E.g., 95억 KRW -> "90~100억", 2,000억 -> "2,000~2,200억", 1조 2,000억 -> "1조 2,000억~1조 3,000억".
 */
export function formatPriceRange(priceKrw: number, bandType: PriceBandType = 'standard'): string {
  if (!priceKrw || typeof priceKrw !== 'number' || !Number.isFinite(priceKrw) || priceKrw <= 0) {
    return '가격 협의';
  }

  const width = getBandWidth(priceKrw, bandType);
  const lower = Math.floor(priceKrw / width) * width;
  const upper = lower + width;

  // For 조+ amounts, use full readable formatAmountWithoutWon on both sides
  if (lower >= JO || upper > JO) {
    return `${formatAmountWithoutWon(lower)}~${formatAmountWithoutWon(upper)}`;
  }

  const lowerEok = Math.floor(lower / EOK);
  const upperEok = Math.floor(upper / EOK);

  // If both lower and upper are whole 억 (and lower > 0):
  if (lower % EOK === 0 && upper % EOK === 0 && lower > 0) {
    return `${lowerEok.toLocaleString('ko-KR')}~${upperEok.toLocaleString('ko-KR')}억`;
  }

  // If lower is 0 and upper is eok:
  if (lower === 0 && upper % EOK === 0) {
    return `${upperEok.toLocaleString('ko-KR')}억 미만`;
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
  if (!priceKrw || typeof priceKrw !== 'number' || !Number.isFinite(priceKrw) || priceKrw <= 0) {
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
 * Strictly bans decimal eok (1.5억 -> 1억 5,000만) and supports 조/억/만 units.
 * Zero-omission rules: 100억 (not 100억 0만), 1조 (not 1조 0억).
 */
export function formatKrw(val: number): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return '가격 미정';
  }
  if (val === 0) return '0원';
  if (val < 0) return `-${formatKrw(Math.abs(val))}`;

  const joPart = Math.floor(val / JO);
  const afterJo = val % JO;
  const eokPart = Math.floor(afterJo / EOK);
  const remainder = afterJo % EOK;
  const manPart = Math.floor(remainder / MAN);
  const rest = Math.round(remainder % MAN);

  const parts: string[] = [];

  if (joPart > 0) {
    parts.push(`${fmtInt(joPart)}조`);
  }
  if (eokPart > 0) {
    parts.push(`${fmtInt(eokPart)}억`);
  }
  if (manPart > 0) {
    parts.push(`${fmtInt(manPart)}만`);
  }
  if (rest > 0) {
    parts.push(`${fmtInt(rest)}원`);
  }

  return parts.length > 0 ? parts.join(' ') : '0원';
}

/**
 * Normalizes a manual price-band string (e.g. "2000~2010억" -> "2,000~2,010억",
 * "1500억" -> "1,500억", "1500억 이상" -> "1,500억 이상") without changing
 * the user's intended range or wording.
 */
export function normalizePriceBandInput(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('협의') || trimmed.includes('미정')) return trimmed;

  const stripped = trimmed.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');

  const rangeMatch = stripped.match(/^(\d+)\s*(?:억)?\s*([~-])\s*(\d+)\s*억(.*)$/);
  if (rangeMatch) {
    const minNum = parseInt(rangeMatch[1], 10);
    const sep = rangeMatch[2];
    const maxNum = parseInt(rangeMatch[3], 10);
    const tail = rangeMatch[4] ?? '';
    return `${fmtInt(minNum)}${sep}${fmtInt(maxNum)}억${tail}`;
  }

  const singleSuffixMatch = stripped.match(/^(\d+)\s*억(.*)$/);
  if (singleSuffixMatch) {
    const num = parseInt(singleSuffixMatch[1], 10);
    const tail = singleSuffixMatch[2] ?? '';
    return `${fmtInt(num)}억${tail}`;
  }

  return trimmed;
}

/**
 * Parses legacy band string safely into numeric range and normalized label.
 * NEVER throws runtime errors.
 * Examples:
 * - "90억대" -> { minKrw: 9000000000, maxKrw: 10000000000, label: "90~100억" }
 * - "50~60억원대", "50~60억" -> { minKrw: 5000000000, maxKrw: 6000000000, label: "50~60억" }
 * - "2000~2010억" -> { minKrw: 200000000000, maxKrw: 201000000000, label: "2,000~2,010억" }
 * - "100억 이상" -> { minKrw: 10000000000, maxKrw: 15000000000, label: "100억 이상" }
 * - "30억 미만" -> { minKrw: 0, maxKrw: 3000000000, label: "30억 미만" }
 * - "가격 협의", null, "" -> { minKrw: 0, maxKrw: 0, label: "가격 협의" }
 */
export function parseLegacyBand(raw?: string | null): ParsedPriceBand {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { minKrw: 0, maxKrw: 0, label: '가격 협의' };
  }

  const originalText = raw.trim();
  const text = originalText.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');

  if (text.includes('협의') || text.includes('미정')) {
    return { minKrw: 0, maxKrw: 0, label: '가격 협의' };
  }

  // Pattern 1: Range like "50~60억", "50~60억원대", "50-60억", "2000~2010억", "1조 2,000억~1조 3,000억"
  const rangeMatch = text.match(/(\d+)\s*(?:억)?\s*[~-]\s*(\d+)\s*억/);
  if (rangeMatch && !text.includes('조')) {
    const minEok = parseInt(rangeMatch[1], 10);
    const maxEok = parseInt(rangeMatch[2], 10);
    return {
      minKrw: minEok * EOK,
      maxKrw: maxEok * EOK,
      label: `${fmtInt(minEok)}~${fmtInt(maxEok)}억`,
    };
  }
  const rangeParts = text.split(/[~-]/);
  if (rangeParts.length === 2) {
    const cleanedRight = rangeParts[1].replace(/(?:원)?대$/, '').trim();
    const tailUnitMatch = cleanedRight.match(/(조|억|만)/);
    const leftTrimmed = rangeParts[0].trim();
    const rawMin = /(조|억|만)/.test(leftTrimmed)
      ? leftTrimmed
      : `${leftTrimmed}${tailUnitMatch ? tailUnitMatch[1] : '억'}`;
    const minKrw = parseKoreanPriceKrw(rawMin);
    const maxKrw = parseKoreanPriceKrw(cleanedRight);
    if (minKrw !== null && maxKrw !== null && maxKrw > minKrw) {
      return {
        minKrw,
        maxKrw,
        label: `${formatAmountWithoutWon(minKrw)}~${formatAmountWithoutWon(maxKrw)}`,
      };
    }
  }

  // Pattern 2: Single unit "90억대", "90억원대", "1,200억대"
  const daeMatch = text.match(/(\d+)\s*억\s*(?:원)?대/);
  if (daeMatch) {
    const baseEok = parseInt(daeMatch[1], 10);
    const baseKrw = baseEok * EOK;
    const width = getBandWidth(baseKrw, 'standard');
    const lower = Math.floor(baseKrw / width) * width;
    const upper = lower + width;
    return {
      minKrw: lower,
      maxKrw: upper,
      label: formatPriceRange(baseKrw, 'standard'),
    };
  }

  // Pattern 3: "100억 이상", "2000억 이상"
  const aboveMatch = text.match(/(\d+)\s*억(?:원)?\s*이상/);
  if (aboveMatch) {
    const minEok = parseInt(aboveMatch[1], 10);
    return {
      minKrw: minEok * EOK,
      maxKrw: Math.round(minEok * 1.5) * EOK,
      label: `${fmtInt(minEok)}억 이상`,
    };
  }

  // Pattern 4: "30억 미만", "2000억 미만"
  const underMatch = text.match(/(\d+)\s*억(?:원)?\s*미만/);
  if (underMatch) {
    const maxEok = parseInt(underMatch[1], 10);
    return {
      minKrw: 0,
      maxKrw: maxEok * EOK,
      label: `${fmtInt(maxEok)}억 미만`,
    };
  }

  // Pattern 5: Plain number like "9500000000" or "95억" or "1조 2,000억"
  const joSingleKrw = text.includes('조') ? parseKoreanPriceKrw(text) : null;
  if (joSingleKrw && !/[~-]/.test(text)) {
    const width = getBandWidth(joSingleKrw, 'standard');
    const lower = Math.floor(joSingleKrw / width) * width;
    const upper = lower + width;
    return {
      minKrw: lower,
      maxKrw: upper,
      label: formatPriceRange(joSingleKrw, 'standard'),
    };
  }

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

  return { minKrw: 0, maxKrw: 0, label: originalText };
}

function getTrailingStepKrw(krw: number): number {
  if (krw >= EOK && krw % EOK === 0) {
    const eok = Math.round(krw / EOK);
    let unitEok = 1;
    while (eok % (unitEok * 10) === 0) {
      unitEok *= 10;
    }
    return unitEok * EOK;
  }
  if (krw < EOK && krw % MAN === 0) {
    const man = Math.round(krw / MAN);
    let unitMan = 1;
    while (man % (unitMan * 10) === 0) {
      unitMan *= 10;
    }
    return unitMan * MAN;
  }
  return 0;
}

/**
 * Validates that a public blind price-band string neither reveals an exact price
 * nor uses a band narrower than 5% of the price.
 */
export function validateBlindPriceBand(
  label: string | null | undefined,
  exactPriceKrw?: number | null,
): { valid: boolean; reason?: string } {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    return { valid: true };
  }
  // WP-7.3C P1-2: "협의"/"미정" must not short-circuit the exact-price checks.
  // A bare negotiation label ("가격 협의", "미정") stays valid, and an allowed band
  // plus "협의" ("100~120억 협의 가능") is valid, but a precise price plus "협의"
  // ("115억 협의") is rejected exactly like the bare precise price would be.
  if (trimmed.includes('협의') || trimmed.includes('미정')) {
    const remainder = trimmed
      .replace(/협의\s*(?:가능|예정|필요)?|미정/g, ' ')
      .replace(/[()[\]{}·/|]/g, ' ')
      .replace(/(?:매매\s*)?(?:희망\s*)?(?:가격|매매가|금액|가)\s*(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/\d/.test(remainder)) {
      return { valid: true };
    }
    return validateBlindPriceBand(remainder, exactPriceKrw);
  }
  if (
    /^\d+(?:,\d{3})*(?:\.\d+)?\s*(?:조(?:\s*\d+(?:,\d{3})*(?:\.\d+)?\s*억)?|억)(?:\s*\d+(?:,\d{3})*[천만]?)?(?:\s*원)?$/.test(trimmed) ||
    /^\d+(?:,\d{3})*\s*천?만(?:\s*원)?$/.test(trimmed)
  ) {
    return { valid: false, reason: '정확한 단일 매매가를 직접 노출할 수 없습니다. 블라인드 가격 구간을 사용해 주세요.' };
  }

  const parts = trimmed.split(/[~-]/);
  if (parts.length === 2) {
    const tailUnitMatch = parts[1].match(/(조|억|만)/);
    const rawMin = /(조|억|만)/.test(parts[0])
      ? parts[0]
      : `${parts[0]}${tailUnitMatch ? tailUnitMatch[1] : '억'}`;
    const minKrw = parseKoreanPriceKrw(rawMin);
    const maxKrw = parseKoreanPriceKrw(parts[1]);
    if (minKrw === null || maxKrw === null) {
      return { valid: false, reason: '블라인드 가격대 형식을 확인해 주세요.' };
    }
    if (maxKrw <= minKrw) {
      return { valid: false, reason: '유효하지 않은 가격 구간입니다.' };
    }
    const denom = exactPriceKrw && exactPriceKrw > 0 ? exactPriceKrw : minKrw;
    if ((maxKrw - minKrw) / denom < 0.05) {
      return { valid: false, reason: '블라인드 가격 구간 폭은 최소 5% 이상이어야 합니다.' };
    }
    return { valid: true };
  }

  const dualBoundMatch = trimmed.match(/^(.+?)\s*이상\s*(.+?)\s*미만$/);
  if (dualBoundMatch) {
    const minKrw = parseKoreanPriceKrw(dualBoundMatch[1]);
    const maxKrw = parseKoreanPriceKrw(dualBoundMatch[2]);
    if (minKrw === null || maxKrw === null || maxKrw <= minKrw) {
      return { valid: false, reason: '유효하지 않은 가격 구간입니다.' };
    }
    const denom = exactPriceKrw && exactPriceKrw > 0 ? exactPriceKrw : minKrw;
    if ((maxKrw - minKrw) / denom < 0.05) {
      return { valid: false, reason: '블라인드 가격 구간 폭은 최소 5% 이상이어야 합니다.' };
    }
    return { valid: true };
  }

  const suffixMatch = trimmed.match(/^(.+?)(?:\s*원)?\s*(대|이상|미만)$/);
  if (suffixMatch) {
    const amountRaw = suffixMatch[1].trim();
    const validGrammar = /^\d+(?:,\d{3})*(?:\s*조(?:\s*\d+(?:,\d{3})*\s*억)?|\s*억(?:\s*\d+(?:,\d{3})*\s*만)?|\s*천?\s*만)$/;
    if (!validGrammar.test(amountRaw)) {
      return { valid: false, reason: '블라인드 가격대 형식을 확인해 주세요.' };
    }
    const parsed = parseKoreanPriceKrw(amountRaw);
    if (!parsed || parsed <= 0) {
      return { valid: false, reason: '블라인드 가격대 형식을 확인해 주세요.' };
    }
    if ((parsed >= EOK && parsed % EOK !== 0) || (parsed < EOK && parsed % (1000 * MAN) !== 0)) {
      return { valid: false, reason: '블라인드 가격 구간은 최소 5% 이상 폭의 반올림 단위를 사용해 주세요.' };
    }
    const denom = exactPriceKrw && exactPriceKrw > 0 ? Math.max(parsed, exactPriceKrw) : parsed;
    const trailingStep = getTrailingStepKrw(parsed);
    const bandWidth = getBandWidth(parsed, 'standard');
    const passesTrailingStep = trailingStep > 0 && trailingStep / denom >= 0.05;
    const passesBandStep = bandWidth > 0 && parsed % bandWidth === 0 && bandWidth / denom >= 0.05;
    if (!passesTrailingStep && !passesBandStep) {
      return { valid: false, reason: '블라인드 가격 구간 폭은 최소 5% 이상이어야 합니다.' };
    }
    return { valid: true };
  }

  return { valid: false, reason: '블라인드 가격대 형식을 확인해 주세요.' };
}
