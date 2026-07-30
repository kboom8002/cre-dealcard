/**
 * @module MemoSlotMapper
 * @description Extracts structured ontology slots from free-text broker memos.
 * Uses pattern matching to parse Korean CRE broker shorthand into typed data.
 * @see SDD §7 S2-T3
 */

export interface MappedSlot {
  key: string;
  value: string | number;
  confidence: number; // 0-1
  source: 'memo_extraction';
}

export interface MemoSlotResult {
  slots: MappedSlot[];
  unmatchedText: string;
  extractionRate: number; // % of memo text that was matched
}

const PATTERNS: { key: string; regex: RegExp; type: 'number' | 'string' }[] = [
  { key: 'askingPriceKrw', regex: /(?:매매가|매각가|희망가|매가)[:\s]*([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'monthlyRentKrw', regex: /(?:월세|월임대료|월차임)[:\s]*([\d,.]+)\s*(?:만|원)/i, type: 'number' },
  { key: 'totalDepositKrw', regex: /(?:보증금|전세금)[:\s]*([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'totalFloorAreaPyung', regex: /(?:연면적|전용면적|면적)[:\s]*([\d,.]+)\s*(?:평|㎡|py)/i, type: 'number' },
  { key: 'buildYear', regex: /(?:준공|건축|신축|완공)[:\s]*(\d{4})\s*(?:년)?/i, type: 'number' },
  { key: 'floorsAboveGround', regex: /(?:지상|지상층|층수)[:\s]*(\d+)\s*(?:층)/i, type: 'number' },
  { key: 'floorsUnderGround', regex: /(?:지하)[:\s]*(\d+)\s*(?:층)/i, type: 'number' },
  { key: 'loanAmountKrw', regex: /(?:대출|근저당|융자)[:\s]*([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'address', regex: /(?:주소|소재지|위치)[:\s]*([가-힣\d\s-]+(?:동|로|길)[^\n]*)/i, type: 'string' },
  { key: 'assetType', regex: /(?:용도|건물유형|자산유형)[:\s]*([가-힣]+(?:시설|빌딩|상가|오피스|물류|창고|공장))/i, type: 'string' },
  { key: 'vacancyRatePct', regex: /(?:공실률|공실)[:\s]*([\d.]+)\s*%/i, type: 'number' },
  { key: 'capRatePct', regex: /(?:수익률|캡레이트|cap\s*rate)[:\s]*([\d.]+)\s*%/i, type: 'number' },
];

function parseKoreanNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function applyUnit(value: number, unit: string): number {
  if (unit.includes('억')) return value * 100_000_000;
  if (unit.includes('만')) return value * 10_000;
  return value;
}

/**
 * Extracts structured slots from a free-text Korean CRE broker memo.
 * @param memoText - The raw broker memo text
 * @returns Extracted slots with confidence scores and unmatched remainder
 */
export function extractSlotsFromMemo(memoText: string): MemoSlotResult {
  const slots: MappedSlot[] = [];
  let remaining = memoText;
  let matchedLength = 0;

  for (const pattern of PATTERNS) {
    const match = memoText.match(pattern.regex);
    if (match) {
      const rawValue = match[1];
      let value: string | number;
      let confidence = 0.85;

      if (pattern.type === 'number') {
        const numVal = parseKoreanNumber(rawValue);
        // Check for unit in the full match
        const fullMatch = match[0];
        value = applyUnit(numVal, fullMatch);
        // Higher confidence for exact pattern matches
        confidence = fullMatch.length > 5 ? 0.9 : 0.8;
      } else {
        value = rawValue.trim();
        confidence = 0.75;
      }

      slots.push({
        key: pattern.key,
        value,
        confidence,
        source: 'memo_extraction',
      });

      matchedLength += match[0].length;
      remaining = remaining.replace(match[0], '');
    }
  }

  return {
    slots,
    unmatchedText: remaining.trim(),
    extractionRate: memoText.length > 0 ? Math.round((matchedLength / memoText.length) * 100) : 0,
  };
}
