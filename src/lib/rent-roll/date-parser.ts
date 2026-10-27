/**
 * @file src/lib/rent-roll/date-parser.ts
 * @description WP-P3-06: Flexible lease-expiry date parser for CRE Rent Roll inputs.
 *
 * Supported formats:
 * - Full ISO / dot / slash: '2027.05', '2027-05-31', '2027/05/31', '2027-05', '2027.5'
 * - Two-digit year: '27.05', '27/05/31', '27.3', '27-3'
 * - Korean text: '2027년 5월', '27년 5월', '27년3월', '27년 05월 31일'
 * - Compact digits: '2705', '202705', '273' (interpreted as 2027년 3월)
 * - Relative offset: '만기 2년', '2년', '만기 6개월', '6개월'
 */

export interface ParsedExpiryDate {
  raw: string;
  normalized: string; // e.g. "2027년 05월"
  shortFormat: string; // e.g. "27.05"
  isoDate?: string; // YYYY-MM-DD
  year: number | null;
  month: number | null;
  day?: number | null;
  isExpired: boolean;
  warning?: string;
}

/**
 * Parses flexible lease expiry date strings into a normalized structure.
 */
export function parseLeaseExpiryDate(input: string | number | null | undefined, referenceDate: Date = new Date()): ParsedExpiryDate {
  if (input === null || input === undefined) {
    return {
      raw: '',
      normalized: '',
      shortFormat: '',
      year: null,
      month: null,
      isExpired: false,
    };
  }

  const raw = String(input).trim();
  if (!raw) {
    return {
      raw: '',
      normalized: '',
      shortFormat: '',
      year: null,
      month: null,
      isExpired: false,
    };
  }

  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  // 1. Relative offset: '만기 2년', '2년', '만기 6개월', '6개월'
  const relativeYearMatch = raw.match(/^(?:만기\s*)?(\d+)\s*년(?:차)?$/);
  const relativeMonthMatch = raw.match(/^(?:만기\s*)?(\d+)\s*개?월$/);

  if (relativeYearMatch) {
    const yearsToAdd = parseInt(relativeYearMatch[1], 10);
    year = currentYear + yearsToAdd;
    month = currentMonth;
  } else if (relativeMonthMatch) {
    const monthsToAdd = parseInt(relativeMonthMatch[1], 10);
    const targetMonthIndex = (currentMonth - 1) + monthsToAdd;
    year = currentYear + Math.floor(targetMonthIndex / 12);
    month = (targetMonthIndex % 12) + 1;
  }

  // 2. Korean year/month text: '2027년 5월', '27년 5월', '27년3월'
  if (year === null) {
    const koreanMatch = raw.match(/^(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/);
    if (koreanMatch) {
      if (koreanMatch[1]) {
        year = parseYear(koreanMatch[1], currentYear);
      } else {
        year = currentYear;
      }
      month = parseInt(koreanMatch[2], 10);
      if (koreanMatch[3]) {
        day = parseInt(koreanMatch[3], 10);
      }
    }
  }

  // 3. Dot, hyphen, slash delimiter: '2027.05', '27-5-31', '2027/5', '27.3'
  if (year === null) {
    const delimMatch = raw.match(/^(\d{2,4})[./\-](\d{1,2})(?:[./\-](\d{1,2}))?$/);
    if (delimMatch) {
      year = parseYear(delimMatch[1], currentYear);
      month = parseInt(delimMatch[2], 10);
      if (delimMatch[3]) {
        day = parseInt(delimMatch[3], 10);
      }
    }
  }

  // 4. Compact digits: '2705' -> 2027년 5월, '202705' -> 2027년 5월, '273' -> 2027년 3월
  if (year === null) {
    const compactMatch = raw.match(/^(\d{3,6})$/);
    if (compactMatch) {
      const digits = compactMatch[1];
      if (digits.length === 3) {
        // e.g. '273' -> 27년 3월
        year = parseYear(digits.slice(0, 2), currentYear);
        month = parseInt(digits.slice(2), 10);
      } else if (digits.length === 4) {
        // e.g. '2705' -> 27년 5월
        year = parseYear(digits.slice(0, 2), currentYear);
        month = parseInt(digits.slice(2), 10);
      } else if (digits.length === 6) {
        // e.g. '202705' -> 2027년 5월
        year = parseInt(digits.slice(0, 4), 10);
        month = parseInt(digits.slice(4), 10);
      }
    }
  }

  // Fallback check: valid month range
  if (year === null || month === null || month < 1 || month > 12) {
    return {
      raw,
      normalized: raw,
      shortFormat: raw,
      year: null,
      month: null,
      isExpired: false,
      warning: '날짜 형식을 확인해주세요',
    };
  }

  // Validate day if present
  if (day !== null && (day < 1 || day > 31)) {
    day = null;
  }

  const mm = String(month).padStart(2, '0');
  const yy = String(year).slice(-2);
  const normalized = `${year}년 ${mm}월${day ? ` ${String(day).padStart(2, '0')}일` : ''}`;
  const shortFormat = `${yy}.${mm}`;
  const isoDate = `${year}-${mm}-${day ? String(day).padStart(2, '0') : '01'}`;

  // Expiration check: before reference date
  let isExpired = false;
  if (year < currentYear) {
    isExpired = true;
  } else if (year === currentYear) {
    if (month < currentMonth) {
      isExpired = true;
    } else if (month === currentMonth && day !== null && day < currentDay) {
      isExpired = true;
    }
  }

  return {
    raw,
    normalized,
    shortFormat,
    isoDate,
    year,
    month,
    day,
    isExpired,
    warning: isExpired ? '만기 지남, 연장 확인' : undefined,
  };
}

/**
 * Converts 2-digit or 4-digit year string to full 4-digit number.
 * e.g. '27' -> 2027, '99' -> 1999
 */
function parseYear(yearStr: string, currentYear: number): number {
  if (yearStr.length === 4) {
    return parseInt(yearStr, 10);
  }
  const yy = parseInt(yearStr, 10);
  const currentCentury = Math.floor(currentYear / 100) * 100;
  // If yy is > 70, assume previous century (1900s), otherwise current century (2000s)
  return yy > 70 ? 1900 + yy : currentCentury + yy;
}
