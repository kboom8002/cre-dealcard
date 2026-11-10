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
  '역세권',
  '초역세권',
  '코너',
  '대로변',
  '상가',
  '사옥',
  '코너사옥',
  '단독사옥',
  '오피스',
  '메디컬',
  '임대',
  '만실',
  '단독',
  '중소형',
  '물류',
  '지식산업',
  '데이터',
  '비즈니스',
  '복합',
  '유통',
  '쇼핑',
  '상업',
  '업무',
  '주민',
  '문화',
  '고객',
  'OO',
  '○○',
  'XX',
  '해당',
]);

// Generic road terms that should not be flagged as road-name addresses
const GENERIC_ROAD_TERMS = new Set([
  '도로',
  '차로',
  '통로',
  '경로',
  '진로',
  '선로',
  '수로',
  '교차로',
  '고속도로',
  '보행로',
  '진입로',
  '출입로',
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
  // Safe floor/metric ranges like B1-5F, 지하1층-지상5층, 1-2층, 3-5분, 4-5%, 80-90억, 100-200평
  const escaped = matchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (
    new RegExp(`(?:지하|지상|B|F|층|도보|수익률|연)\\s*${escaped}`, 'i').test(fullText) ||
    new RegExp(`${escaped}\\s*(?:층|F|분|%|년|억(?:대)?|만(?:원)?|평(?:대)?|개월|호|대)(?![가-힣])`, 'i').test(fullText)
  ) {
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

  // 1. Explicit parcel numbers: e.g. "117-3번지", "산 12-3", "45번지", "117-3번지의"
  const jibunMatch = text.match(
    /(?:산\s*)?(?:\b|^)\d{1,5}(?:-\d{1,5})?\s*번지(?=(?:에서|으로|부터|까지|[은는이가을를의에로과와도만])|[^\w가-힣]|$)/,
  );
  if (jibunMatch) {
    violations.push({
      pointIndex,
      pointText: text,
      reason: '상세 지번(번지)은 건물 위치 보호를 위해 적을 수 없어요.',
      keyword: jibunMatch[0],
      severity: 'error',
    });
  }

  // 2. Standalone hyphenated parcel: e.g. "11-47 (호산당빌딩)", "지하 1-2층, 역삼동 147-8"
  const hyphenNumbers = text.match(/\b\d{1,5}-\d{1,5}\b/g);
  if (hyphenNumbers) {
    for (const num of hyphenNumbers) {
      const alreadyInJibun = jibunMatch ? jibunMatch[0].includes(num) : false;
      if (isForbiddenParcelNumber(num, text) && !alreadyInJibun) {
        violations.push({
          pointIndex,
          pointText: text,
          reason: '지번 형식의 숫자는 건물 위치가 드러날 수 있어 적을 수 없어요.',
          keyword: num,
          severity: 'error',
        });
      }
    }
  }

  // 2b. Road-name addresses with specific building numbers: e.g. "테헤란로 152", "양화로 161", "도산대로45길 18"
  const roadAddressRegex =
    /([가-힣]{2,10}(?:대로|로|길)(?:\s*\d{1,4}(?:번)?길)?)\s+(\d{1,5}(?:-\d{1,5})?)(?![0-9-]|\s*(?:(?:번)?길|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|차선|차로|인|개|호|실)(?![가-힣]))/g;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = roadAddressRegex.exec(text)) !== null) {
    const roadPart = rMatch[1].trim();
    const baseRoad = roadPart.replace(/\s*\d{1,4}(?:번)?길$/, '').trim();
    if (!GENERIC_ROAD_TERMS.has(baseRoad)) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `도로명 상세 건물번호(${rMatch[0]})는 건물 위치가 드러날 수 있어 적을 수 없어요. (address_number)`,
        keyword: rMatch[0],
        severity: 'error',
      });
    }
  }

  // 2c. Dong + parcel number: e.g. "역삼동 823", "역삼동 147-8"
  const dongParcelRegex =
    /([가-힣]{1,10}(?:\d+가)?(?:동|읍|면|리)|[가-힣]{1,10}\d+가)\s+(?:산\s*)?(\d{1,5}(?:-\d{1,5})?)(?![0-9-]|\s*(?:번지|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|호|실|번\s*출구|출구|차선|차로|인|개|곳|건)(?![가-힣]))/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = dongParcelRegex.exec(text)) !== null) {
    const parcelNum = dMatch[2];
    const alreadyCaught = violations.some(
      (v) => v.keyword && (v.keyword.includes(parcelNum) || dMatch![0].includes(v.keyword)),
    );
    if (!alreadyCaught) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `동·지번 상세 주소(${dMatch[0]})는 건물 위치 보호를 위해 적을 수 없어요. (address_number)`,
        keyword: dMatch[0],
        severity: 'error',
      });
    }
  }

  // 3. Building names: e.g. "호산당빌딩", "삼원타워", "대성스퀘어", "파이낸스센터"
  // Look for words ending in 빌딩, 타워, 스퀘어, 펠리스, 팰리스, 프라자, 플라자, 센터, 캐슬, 하우스, 맨션
  const buildingNameRegex =
    /([가-힣A-Za-z0-9]{2,15})(빌딩|타워|스퀘어|펠리스|팰리스|프라자|플라자|센터|캐슬|하우스|맨션)(?=(?:에서|으로|부터|까지|[은는이가을를의에로과와도만])|[^\w가-힣]|$)/g;
  let bMatch: RegExpExecArray | null;
  while ((bMatch = buildingNameRegex.exec(text)) !== null) {
    const prefix = bMatch[1];
    const fullWord = bMatch[0];

    // Check if the prefix is generic (e.g. "올근생", "꼬마", "신축", "근생")
    if (!GENERIC_BUILDING_TERMS.has(prefix)) {
      violations.push({
        pointIndex,
        pointText: text,
        reason: `건물 고유 명칭(${fullWord})은 위치가 드러나므로 적을 수 없어요.`,
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
        reason: `특정 브랜드 이름(${brand})은 위치가 드러날 수 있어 일반 업종(예: 유명 카페)으로 적어 주세요.`,
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
        reason: `소유권 관련 식별 정보(${pii})는 적을 수 없어요.`,
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

  // Pattern: "서울특별시 강남구 신사동", "서울시 강남구 역삼동", or "강남구 신사동"
  const match = trimmed.match(
    /^((?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|시|도)\s*)*[가-힣]+(?:구|군|시))\s+[가-힣0-9]+(?:동|읍|면|가|리)/,
  );
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
      notice: `희소 용도(${assetType || '특수용도'})는 동 단위로 적으면 건물이 특정될 수 있어 구 단위(${suggestedRegion}) 표기를 권장합니다.`,
    };
  }

  if (isLowDensity) {
    return {
      shouldFallback: true,
      suggestedRegion,
      notice: `해당 지역 내 동일 용도 매물이 5건 미만이어서, 상세 동 대신 구 단위(${suggestedRegion}) 표기를 권장합니다.`,
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
    cleaned = cleaned.replace(
      /(?:산\s*)?(?:\b|^)\d{1,5}(?:-\d{1,5})?\s*번지(?=(?:에서|으로|부터|까지|[은는이가을를의에로과와도만])|[^\w가-힣]|$)/g,
      'OO번지',
    );

    // Mask road-name addresses with building numbers: e.g. "테헤란로 152" -> "테헤란로 인근"
    cleaned = cleaned.replace(
      /([가-힣]{2,10}(?:대로|로|길)(?:\s*\d{1,4}(?:번)?길)?)\s+(\d{1,5}(?:-\d{1,5})?)(?![0-9-]|\s*(?:(?:번)?길|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|차선|차로|인|개|호|실)(?![가-힣]))(\s*인근)?/g,
      (match, roadPart: string) => {
        const baseRoad = roadPart.replace(/\s*\d{1,4}(?:번)?길$/, '').trim();
        return GENERIC_ROAD_TERMS.has(baseRoad) ? match : `${roadPart.trim()} 인근`;
      },
    );

    cleaned = cleaned.replace(/\b\d{1,5}-\d{1,5}\b/g, (match) => {
      return isForbiddenParcelNumber(match, text) ? 'OO-OO' : match;
    });

    // Mask dong + single parcel number: e.g. "역삼동 823" -> "역삼동 인근"
    cleaned = cleaned.replace(
      /([가-힣]{1,10}(?:\d+가)?(?:동|읍|면|리)|[가-힣]{1,10}\d+가)\s+(?:산\s*)?(\d{1,5}(?:-\d{1,5})?)(?![0-9-]|\s*(?:번지|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|호|실|번\s*출구|출구|차선|차로|인|개|곳|건)(?![가-힣]))(\s*인근)?/g,
      (_match, dongPart: string) => `${dongPart.trim()} 인근`,
    );

    // Mask building names
    cleaned = cleaned.replace(
      /([가-힣A-Za-z0-9]{2,15})(빌딩|타워|스퀘어|펠리스|팰리스|프라자|플라자|센터|캐슬|하우스|맨션)(?=(?:에서|으로|부터|까지|[은는이가을를의에로과와도만])|[^\w가-힣]|$)/g,
      (match, prefix, suffix) => {
        return GENERIC_BUILDING_TERMS.has(prefix) ? match : `OO${suffix}`;
      },
    );

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
