/**
 * @module MemoSlotMapper
 * @description Extracts structured ontology slots from free-text broker memos.
 * Uses 2-layer hierarchical extraction:
 *   1순위: [수익분석]/총액/합계 블록의 총괄 지표
 *   2순위: 개별 호실/라인의 단순 첫 매칭
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

// ── 1순위: 총괄 지표 패턴 (총액/합계 블록 — 개별 호실보다 먼저 매칭) ──
const SUMMARY_PATTERNS: { key: string; regex: RegExp; type: 'number' | 'string' }[] = [
  // 보증금 총액 (다양한 한국 실무 표기 수용)
  { key: 'totalDepositKrw', regex: /(?:보증금\s*총액|총\s*보증금|보증금\s*합계|전세금\s*총액)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  // 월 임대수입/월세 총액
  { key: 'monthlyRentKrw', regex: /(?:월\s*임대수입\s*총액|월\s*임대료\s*총액|월세\s*총액|총\s*월세|월\s*차임\s*합계|월\s*임대수입|임대수입\s*총액)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  // 매매가 (총액/합계 블록에도 가끔 등장)
  { key: 'askingPriceKrw', regex: /(?:매매가|매각가|희망가|매가)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
];

// ── 2순위: 개별 항목 패턴 (일반 매칭 — 총괄 지표 부재 시 폴백) ──
const FALLBACK_PATTERNS: { key: string; regex: RegExp; type: 'number' | 'string' }[] = [
  { key: 'monthlyRentKrw', regex: /(?:월세|월임대료|월차임)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:만|원)/i, type: 'number' },
  { key: 'totalDepositKrw', regex: /(?:보증금|전세금)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
];

// ── 공통 패턴 (총괄/개별 구분 불필요한 일반 슬롯) ──
const GENERAL_PATTERNS: { key: string; regex: RegExp; type: 'number' | 'string' }[] = [
  { key: 'askingPriceKrw', regex: /(?:매매가|매각가|희망가|매가)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'totalFloorAreaPyung', regex: /(?:연면적|전용면적|면적)[:\s]*(?:약\s*)?([\d,.]+)\s*(평|㎡|py)/i, type: 'number' },
  { key: 'buildYear', regex: /(?:준공|건축|신축|완공)[:\s]*(\d{4})\s*(?:년)?/i, type: 'number' },
  { key: 'floorsAboveGround', regex: /(?:지상|지상층|층수)[:\s]*(\d+)\s*(?:층)/i, type: 'number' },
  { key: 'floorsUnderGround', regex: /(?:지하)[:\s]*(\d+)\s*(?:층)/i, type: 'number' },
  { key: 'loanAmountKrw', regex: /(?:대출|근저당|융자)[:\s]*(?:약\s*)?([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'address', regex: /(?:주소|소재지|위치)[:\s]*([가-힣\d\s-]+(?:동|로|길)[^\n]*)/i, type: 'string' },
  { key: 'assetType', regex: /(?:용도|건물유형|자산유형)[:\s]*([가-힣]+(?:시설|빌딩|상가|오피스|물류|창고|공장))/i, type: 'string' },
  { key: 'vacancyRatePct', regex: /(?:공실률|공실)[:\s]*(?:약\s*)?([\d.]+)\s*%/i, type: 'number' },
  { key: 'capRatePct', regex: /(?:수익률|캡레이트|cap\s*rate)[:\s]*(?:약\s*)?([\d.]+)\s*%/i, type: 'number' },
  { key: 'roomCount', regex: /(?:객실|룸|실수)[:\s]*(\d+)\s*(?:실|룸|개)/i, type: 'number' },
  { key: 'adrManwon', regex: /(?:ADR|객단가|일평균)[:\s]*([\d,.]+)\s*(?:만|원)/i, type: 'number' },
  { key: 'occupancyRatePct', regex: /(?:OCC|점유율|가동률)[:\s]*([\d.]+)\s*%/i, type: 'number' },
  { key: 'gopMarginPct', regex: /(?:GOP|영업이익률)[:\s]*([\d.]+)\s*%/i, type: 'number' },
  // 개발형/매매형 포스처 추가 패턴
  { key: 'landAreaPyung', regex: /(?:대지면적|토지면적|대지|부지)[:\s]*(?:약\s*)?([\d,.]+)\s*(평|㎡|py)/i, type: 'number' },
  { key: 'farPct', regex: /(?:용적률)[:\s]*([\d.]+)\s*%/i, type: 'number' },
  { key: 'bcrPct', regex: /(?:건폐율)[:\s]*([\d.]+)\s*%/i, type: 'number' },
  { key: 'pricePerPyeongManwon', regex: /(?:평당가|평단가|평당)[:\s]*([\d,.]+)\s*(?:만|원)/i, type: 'number' },
  { key: 'constructionCostManwon', regex: /(?:공사비|건축비|시공비)[:\s]*([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'monthlyRevenueKrw', regex: /(?:월매출|월 매출|매출)[:\s]*([\d,.]+)\s*(?:억|만|원)/i, type: 'number' },
  { key: 'holdingPeriodYears', regex: /(?:보유기간|보유\s*기간|보유)[:\s]*([\d.]+)\s*(?:년|개월)/i, type: 'number' },
];

function parseKoreanNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function applyUnit(value: number, unit: string): number {
  if (unit.includes('억')) return value * 100_000_000;
  if (unit.includes('만')) return value * 10_000;
  if (unit.includes('㎡')) return Math.round(value * 0.3025 * 100) / 100; // ㎡→평
  return value;
}

/**
 * 단일 패턴을 메모 텍스트에 매칭하여 슬롯을 추출합니다.
 */
function matchPattern(
  text: string,
  pattern: { key: string; regex: RegExp; type: 'number' | 'string' },
): { slot: MappedSlot; fullMatch: string } | null {
  const match = text.match(pattern.regex);
  if (!match) return null;

  const rawValue = match[1];
  let value: string | number;
  let confidence = 0.85;

  if (pattern.type === 'number') {
    const numVal = parseKoreanNumber(rawValue);
    value = applyUnit(numVal, match[0]);
    confidence = match[0].length > 5 ? 0.9 : 0.8;
  } else {
    value = rawValue.trim();
    confidence = 0.75;
  }

  return {
    slot: { key: pattern.key, value, confidence, source: 'memo_extraction' },
    fullMatch: match[0],
  };
}

/**
 * Extracts structured slots from a free-text Korean CRE broker memo.
 * 
 * 2계층 계층적 추출 (Hierarchical Extraction):
 *   Layer 1: [수익분석]/총액/합계 블록에서 총괄 지표를 우선 추출
 *   Layer 2: 총괄 지표가 없는 키만 개별 호실 패턴으로 폴백
 *   Layer 3: 나머지 일반 패턴 매칭
 * 
 * 이를 통해 "스타벅스 보증금 5억"(개별 호실)이 "보증금 총액 18억"(건물 전체)을
 * 덮어쓰는 문제를 원천 방지합니다.
 * 
 * @param memoText - The raw broker memo text
 * @returns Extracted slots with confidence scores and unmatched remainder
 */
export function extractSlotsFromMemo(memoText: string): MemoSlotResult {
  const slots: MappedSlot[] = [];
  const extractedKeys = new Set<string>();
  let remaining = memoText;
  let matchedLength = 0;

  // ── Layer 1: 총괄 지표 우선 추출 (confidence 0.95) ──
  for (const pattern of SUMMARY_PATTERNS) {
    if (extractedKeys.has(pattern.key)) continue;
    const result = matchPattern(memoText, pattern);
    if (result) {
      result.slot.confidence = 0.95; // 총괄 지표는 높은 신뢰도
      slots.push(result.slot);
      extractedKeys.add(pattern.key);
      matchedLength += result.fullMatch.length;
      remaining = remaining.replace(result.fullMatch, '');
    }
  }

  // ── Layer 2: 총괄 지표가 없는 키만 개별 호실 폴백 ──
  for (const pattern of FALLBACK_PATTERNS) {
    if (extractedKeys.has(pattern.key)) continue;
    const result = matchPattern(memoText, pattern);
    if (result) {
      slots.push(result.slot);
      extractedKeys.add(pattern.key);
      matchedLength += result.fullMatch.length;
      remaining = remaining.replace(result.fullMatch, '');
    }
  }

  // ── Layer 3: 일반 패턴 매칭 ──
  for (const pattern of GENERAL_PATTERNS) {
    if (extractedKeys.has(pattern.key)) continue;
    const result = matchPattern(memoText, pattern);
    if (result) {
      slots.push(result.slot);
      extractedKeys.add(pattern.key);
      matchedLength += result.fullMatch.length;
      remaining = remaining.replace(result.fullMatch, '');
    }
  }

  return {
    slots,
    unmatchedText: remaining.trim(),
    extractionRate: memoText.length > 0 ? Math.round((matchedLength / memoText.length) * 100) : 0,
  };
}

import type { InvestmentPosture } from '@/domain/ontology';
import type { PostureProposal } from './broker-deal-card';

const POSTURE_KEYWORDS: Record<InvestmentPosture, string[]> = {
  income: ['임대', '월세', '렌트', '수익률', '공실', '임차인', '보증금', '전월세', '수익형'],
  development: ['개발', '용적률', '인허가', '명도', '철거', '신축', '건축', '분양', '재건축'],
  operating: ['운영', 'GOP', 'RevPAR', 'ADR', '객실', '매출', '호텔', '리조트', '숙박'],
  owner_occupied: ['사옥', '자가', '이전', '통근', '본사', '사무실', '입주', '자사'],
  trading: ['급매', '시세차익', '단기', '갭투자', '전매', '매도', '시세', '환차익', '저가'],
};

export function extractPostureProposal(memo: string): PostureProposal {
  const normalizedMemo = memo.toLowerCase();
  const scores: Record<string, number> = {};
  
  for (const [posture, keywords] of Object.entries(POSTURE_KEYWORDS)) {
    const matchCount = keywords.filter(kw => normalizedMemo.includes(kw.toLowerCase())).length;
    scores[posture] = matchCount;
  }
  
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topPosture, topScore] = entries[0];
  const [, secondScore] = entries[1] || [null, 0];
  
  if (topScore === 0) {
    return { value: null, confidence: 0, reason: '포스처 관련 키워드를 감지하지 못했습니다.', confirmedBy: null, confirmedAt: null };
  }
  
  // 신뢰도 산출: 매칭 수 + 1위와 2위 차이 반영
  const gap = topScore - secondScore;
  const confidence = Math.min(0.95, (topScore * 0.15) + (gap * 0.1) + 0.3);
  
  const matchedKeywords = POSTURE_KEYWORDS[topPosture as InvestmentPosture]
    .filter(kw => normalizedMemo.includes(kw.toLowerCase()));
  
  return {
    value: topPosture as InvestmentPosture,
    confidence: Math.round(confidence * 100) / 100,
    reason: `키워드 감지: ${matchedKeywords.join(', ')}`,
    confirmedBy: null,
    confirmedAt: null,
  };
}
