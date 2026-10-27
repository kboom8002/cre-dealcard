/**
 * Blind-Guard & k-Anonymity Validation SSOT (WP-P1-02)
 *
 * Rules:
 * 1. Reject forbidden identifiers:
 *    - Exact parcel/street numbers (e.g. "11-47", "117-3번지", "산 12-3")
 *    - Building names (e.g. "호산당빌딩", "삼원타워", "대성스퀘어")
 *    - Owner names / PII (e.g. "소유주", "대표자", "홍길동")
 *    - Specific identifying tenant brands (e.g. "스타벅스", "맥도날드", "올리브영")
 * 2. Negative whitelist preservation:
 *    - DO NOT falsely flag numbers like "역 도보 3분", "수익률 3.1%", "대지 120평",
 *      "지하 1층 ~ 지상 5층", "보증금 3억 / 월세 1,500만", "2018년 준공", "올근생", "꼬마빌딩".
 * 3. Auto dong -> gu fallback notice when k-anonymity < 5 or for rare asset types
 *    (hotel, hospital, logistics, knowledge industry center).
 */

export interface BlindViolation {
  pointIndex: number;
  pointText: string;
  reason: string;
  keyword?: string;
  severity: 'error' | 'warning';
}

export interface BlindGuardOptions {
  region?: string;
  assetType?: string;
  buildingCountInRegion?: number;
}

export interface BlindValidationResult {
  isValid: boolean;
  cleanedPoints: string[];
  violations: BlindViolation[];
  requiresDongToGuFallback: boolean;
  fallbackRegionNotice?: string;
  suggestedRegion?: string;
}

// Rare asset types that have high re-identification risk at the Dong level
const RARE_ASSET_TYPES = new Set([
  '호텔',
  '모텔',
  '숙박시설',
  '병원',
  '메디컬빌딩',
  '물류센터',
  '창고',
  '지식산업센터',
  '공장',
  'hotel',
  'hospital',
  'logistics',
  'knowledge_industry',
]);

// Generic terms that are SAFE even if they end in 빌딩/타워
const GENERIC_BUILDING_TERMS = new Set([
  '올근생',
  '근생',
  '꼬마',
  '신축',
  '수익형',
  '구축',
  '리모델링',
  '상업용',
  '업무용',
  '통',
]);

// Sensitive tenant brand names that can uniquely pinpoint a commercial property
const SENSITIVE_BRANDS = [
  '스타벅스',
  '맥도날드',
  '버거킹',
  '올리브영',
  '다이소',
  '투썸플레이스',
  '이디야',
  '블루보틀',
  '서브웨이',
  '할리스',
  '파리바게뜨',
  '뚜레쥬르',
];

// PII and ownership keywords
const PII_KEYWORDS = [
  '소유주',
  '소유자',
  '대표자',
  '명의자',
  '실소유',
  '법인소유',
  '개인소유',
  '임대인성함',
  '건물주성함',
];

/**
 * Checks if a hyphenated number like "11-47" or "117-3" is a parcel number vs safe floor/metric.
 */
function isForbiddenParcelNumber(matchStr: string, fullText: string): boolean {
  // Safe floor ranges like B1-5F or 지하1층-지상5층 or 1-2층
  if (/(?:지하|지상|B|F|층)\s*\d+-\d+/i.test(fullText) || /\d+-\d+\s*(?:층|F)/i.test(fullText)) {
    return false;
  }
  // Safe date ranges like 2024-2025
  if (/20\d{2}-20\d{2}/.test(matchStr)) {
    return false;
  }
  // Explicit parcel pattern like "11-47번지" or standalone "11-47"
  if (/\b\d{1,5}-\d{1,5}(?:번지)?\b/.test(matchStr)) {
    return true;
  }
  return false;
}

/**
 * Detects sensitive parcel numbers, building names, PII, or unique brands in text.
 */
export function checkSensitivePoint(text: string, pointIndex: number): BlindViolation[] {
  const violations: BlindViolation[] = [];
  if (!text || typeof text !== 'string') return violations;

  // 1. Explicit parcel numbers: e.g. "117-3번지", "산 12-3", "45번지"
  const jibunMatch = text.match(/(?:산\s*)?(?:\b|^)\d{1,5}(?:-\d{1,5})?\s*번지(?=[^\w가-힣]|$)/);
  if (jibunMatch) {
    violations.push({
      pointIndex,
      pointText: text,
      reason: '상세 지번(번지)은 블라인드 보안을 위해 기재할 수 없습니다.',
      keyword: jibunMatch[0],
      severity: 'error',
    });
  }

  // 2. Standalone hyphenated parcel: e.g. "11-47 (호산당빌딩)"
  const hyphenNumbers = text.match(/\b\d{1,5}-\d{1,5}\b/g);
  if (hyphenNumbers) {
    for (const num of hyphenNumbers) {
      if (isForbiddenParcelNumber(num, text) && !jibunMatch) {
        violations.push({
          pointIndex,
          pointText: text,
          reason: '필지 번호 형식의 숫자는 매물 재식별 위험으로 기재할 수 없습니다.',
          keyword: num,
          severity: 'error',
        });
      }
    }
  }

  // 3. Building names: e.g. "호산당빌딩", "삼원타워", "대성스퀘어"
  // Look for words ending in 빌딩, 타워, 스퀘어, 펠리스, 팰리스, 프라자
  const buildingNameRegex = /([가-힣A-Za-z0-9]{2,15})(빌딩|타워|스퀘어|펠리스|팰리스|프라자)(?=[^\w가-힣]|$)/g;
  let bMatch: RegExpExecArray | null;
  while ((bMatch = buildingNameRegex.exec(text)) !== null) {
    const prefix = bMatch[1];
    const suffix = bMatch[2];
    const fullWord = bMatch[0];

    // Check if the prefix is generic (e.g. "올근생", "꼬마", "신축", "근생")
    if (!GENERIC_BUILDING_TERMS.has(prefix)) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `건물 고유 명칭(${fullWord})은 블라인드 원칙에 위배됩니다.`,
        keyword: fullWord,
        severity: 'error',
      });
    }
  }

  // 4. Sensitive tenant brand names
  for (const brand of SENSITIVE_BRANDS) {
    if (text.includes(brand)) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `특정 임차 브랜드(${brand})는 위치 재식별 위험이 있어 일반 업종(예: 유명 커피 프랜차이즈)으로 표기해주세요.`,
        keyword: brand,
        severity: 'error',
      });
    }
  }

  // 5. PII and owner names
  for (const pii of PII_KEYWORDS) {
    if (text.includes(pii)) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `소유권 관련 식별 정보(${pii})는 기재할 수 없습니다.`,
        keyword: pii,
        severity: 'error',
      });
    }
  }

  return violations;
}

/**
 * Suggests fallback region from Dong level to Gu level (e.g. "영등포구 양평동" -> "영등포구").
 */
export function suggestFallbackRegion(region?: string): string {
  if (!region || typeof region !== 'string') return '서울시';
  const trimmed = region.trim();

  // Pattern: "서울특별시 강남구 신사동" or "강남구 신사동"
  const match = trimmed.match(/^((?:[가-힣]+(?:특별시|광역시|도)\s*)?[가-힣]+(?:구|군|시))\s+[가-힣0-9]+(?:동|읍|면|가)/);
  if (match) {
    return match[1];
  }

  // If already at Gu level or cannot parse dong
  return trimmed;
}

/**
 * Checks area k-anonymity based on region density and asset type rarity.
 */
export function checkAreaKAnonymity(
  region?: string,
  assetType?: string,
  buildingCountInRegion?: number,
): { shouldFallback: boolean; suggestedRegion: string; notice?: string } {
  const suggestedRegion = suggestFallbackRegion(region);
  const normalizedAsset = (assetType || '').toLowerCase().trim();

  const isRareAsset = RARE_ASSET_TYPES.has(normalizedAsset);
  const isLowDensity = typeof buildingCountInRegion === 'number' && buildingCountInRegion < 5;

  if (isRareAsset) {
    return {
      shouldFallback: true,
      suggestedRegion,
      notice: `희소 용도(${assetType || '특수용도'})는 동 단위 표기 시 매물 식별 가능성이 높아 구 단위(${suggestedRegion}) 표기로 자동 권장됩니다.`,
    };
  }

  if (isLowDensity) {
    return {
      shouldFallback: true,
      suggestedRegion,
      notice: `해당 권역 내 동일 용도 매물이 5건 미만(k-익명성 기준)이므로, 상세 동 대신 구 단위(${suggestedRegion})로 자동 전환을 권장합니다.`,
    };
  }

  return {
    shouldFallback: false,
    suggestedRegion: region || '권역 미정',
  };
}

/**
 * Validates a list of 3 deal points against strict blind-guard rules.
 */
export function validateBlindPoints(
  points: string[],
  options?: BlindGuardOptions,
): BlindValidationResult {
  const violations: BlindViolation[] = [];
  const cleanedPoints: string[] = [];

  points.forEach((pt, idx) => {
    const ptClean = (pt || '').trim();
    cleanedPoints.push(ptClean);
    const pointViolations = checkSensitivePoint(ptClean, idx);
    violations.push(...pointViolations);
  });

  const kAnon = checkAreaKAnonymity(options?.region, options?.assetType, options?.buildingCountInRegion);

  return {
    isValid: violations.length === 0,
    cleanedPoints,
    violations,
    requiresDongToGuFallback: kAnon.shouldFallback,
    fallbackRegionNotice: kAnon.notice,
    suggestedRegion: kAnon.suggestedRegion,
  };
}

/**
 * Cleans blind points by replacing or masking detected sensitive terms.
 */
export function cleanBlindPoints(points: string[]): string[] {
  return points.map((text) => {
    let cleaned = text;

    // Mask parcel numbers: e.g. "11-47번지" -> "OO번지"
    cleaned = cleaned.replace(/(?:산\s*)?(?:\b|^)\d{1,5}(?:-\d{1,5})?\s*번지(?=[^\w가-힣]|$)/g, 'OO번지');
    cleaned = cleaned.replace(/\b\d{1,5}-\d{1,5}\b/g, (match) => {
      return isForbiddenParcelNumber(match, text) ? 'OO-OO' : match;
    });

    // Mask building names
    cleaned = cleaned.replace(/([가-힣A-Za-z0-9]{2,15})(빌딩|타워|스퀘어|펠리스|팰리스|프라자)(?=[^\w가-힣]|$)/g, (match, prefix, suffix) => {
      return GENERIC_BUILDING_TERMS.has(prefix) ? match : `OO${suffix}`;
    });

    // Replace sensitive brands
    for (const brand of SENSITIVE_BRANDS) {
      cleaned = cleaned.replace(new RegExp(brand, 'g'), '대형 프랜차이즈');
    }

    // Mask PII
    for (const pii of PII_KEYWORDS) {
      cleaned = cleaned.replace(new RegExp(pii, 'g'), '관계자');
    }

    return cleaned;
  });
}
