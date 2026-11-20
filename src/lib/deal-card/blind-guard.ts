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
  floorCount?: number;
  areaPyung?: number;
  areaBand?: string;
}

export interface BlindValidationResult {
  isValid: boolean;
  cleanedPoints: string[];
  violations: BlindViolation[];
  requiresDongToGuFallback: boolean;
  fallbackRegionNotice?: string;
  suggestedRegion?: string;
}

// Rare asset types that have high single-building identification risk at the Dong level
export const RARE_ASSET_TYPES = new Set([
  '호텔',
  '모텔',
  '숙박시설',
  '의료시설',
  '병원',
  '의원',
  '메디컬빌딩',
  '종교시설',
  '주유소',
  '자동차관련시설',
  '물류센터',
  '창고',
  '지식산업센터',
  '공장',
  'hotel',
  'hospital',
  'clinic',
  'medical',
  'religious',
  'gas_station',
  'auto_facility',
  'logistics',
  'knowledge_industry',
]);

const RARE_ASSET_SUBSTRINGS = [
  '의료시설',
  '병원',
  '의원',
  '메디컬빌딩',
  '종교시설',
  '주유소',
  '자동차관련시설',
  '호텔',
  '모텔',
  '숙박시설',
  '물류센터',
  '창고',
  '지식산업센터',
  '공장',
];

const STANDALONE_DONG_TO_GU: Readonly<Record<string, string>> = {
  신사동: '강남구',
  역삼동: '강남구',
  논현동: '강남구',
  청담동: '강남구',
  삼성동: '강남구',
  대치동: '강남구',
  도곡동: '강남구',
  서초동: '서초구',
  반포동: '서초구',
  잠원동: '서초구',
  방배동: '서초구',
  양재동: '서초구',
  성수동: '성동구',
  성수동1가: '성동구',
  성수동2가: '성동구',
  왕십리동: '성동구',
  자양동: '광진구',
  화양동: '광진구',
  당산동: '영등포구',
  당산동1가: '영등포구',
  당산동2가: '영등포구',
  당산동3가: '영등포구',
  당산동4가: '영등포구',
  당산동5가: '영등포구',
  당산동6가: '영등포구',
  양평동: '영등포구',
  양평동1가: '영등포구',
  양평동2가: '영등포구',
  양평동3가: '영등포구',
  양평동4가: '영등포구',
  양평동5가: '영등포구',
  양평동6가: '영등포구',
  여의도동: '영등포구',
  문래동: '영등포구',
  서교동: '마포구',
  동교동: '마포구',
  합정동: '마포구',
  연남동: '마포구',
  공덕동: '마포구',
  한남동: '용산구',
  이태원동: '용산구',
  갈월동: '용산구',
  을지로동: '중구',
  명동: '중구',
  종로1가: '종로구',
};

export function isRareAssetType(assetType?: string | null): boolean {
  if (!assetType || typeof assetType !== 'string') return false;
  const normalized = assetType.toLowerCase().trim();
  if (!normalized) return false;
  if (RARE_ASSET_TYPES.has(normalized)) return true;
  return RARE_ASSET_SUBSTRINGS.some((kw) => normalized.includes(kw));
}

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

  // 2c. Dong + single or multi-parcel numbers: e.g. "역삼동 823", "성수동2가 315-4, 315-3, 315-7", "양평동4가 117, 134 외 1필지"
  const dongParcelRegex =
    /([가-힣]{1,10}(?:\d+가)?(?:동|읍|면|리)|[가-힣]{1,10}\d+가)\s+(?:산\s*)?(\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?:\s*[,/·]\s*(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?)*)(?:\s*외\s*\d*\s*필지(?:\s*\((?:\s*(?:산\s*)?\d{1,5}(?:-\d{1,5})?\s*[,/·]?\s*)+\))?)?(?![0-9-]|\s*(?:층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|호|실|번\s*출구|출구|차선|차로|인|개|곳|건)(?![가-힣]))/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = dongParcelRegex.exec(text)) !== null) {
    const parcelNum = dMatch[2];
    const hasSecondaryLots = /[,/·]|\s외\s*\d*\s*필지/.test(dMatch[0]);
    const alreadyCaught =
      !hasSecondaryLots &&
      violations.some(
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

  // Pattern: "서울특별시 강남구 신사동", "서울 강남구 신사동", "서울시 강남구 역삼동", or "강남구 신사동"
  const match = trimmed.match(
    /^((?:(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|시|도))\s+)*[가-힣]+(?:구|군|시))\s+[가-힣0-9]+(?:동(?:\d+가)?|읍|면|가|리)/,
  );
  if (match) {
    return match[1];
  }

  // Standalone Dong fallback (e.g. "신사동" -> "강남구", "당산동" -> "영등포구")
  const cleanToken = trimmed.replace(/\s*인근$/, '').trim();
  if (STANDALONE_DONG_TO_GU[cleanToken]) {
    return STANDALONE_DONG_TO_GU[cleanToken];
  }
  if (/^[가-힣0-9]{2,8}(?:동(?:\d+가)?|읍|면|리)$/.test(cleanToken)) {
    return '서울시';
  }

  // If already at Gu level or cannot parse dong
  return trimmed;
}

function hasExactFloorOrNarrowAreaSpec(
  points: readonly string[],
  options?: BlindGuardOptions,
): boolean {
  if (typeof options?.floorCount === 'number' && options.floorCount > 0) return true;
  if (typeof options?.areaPyung === 'number' && options.areaPyung > 0) return true;
  if (typeof options?.areaBand === 'string' && options.areaBand.trim()) {
    const bandMatch = options.areaBand.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)/);
    if (bandMatch) {
      const span = Math.abs(parseFloat(bandMatch[2]) - parseFloat(bandMatch[1]));
      if (span <= 50) return true;
    } else if (/\d+(?:\.\d+)?\s*(?:평|㎡)/.test(options.areaBand)) {
      return true;
    }
  }

  const joined = points.join(' ');
  const hasExactFloor = /(?:지상|지하|B\d+\s*[~-]\s*|\b)\d{1,2}\s*(?:층|F)(?![가-힣])/i.test(joined);
  if (hasExactFloor) return true;

  const bandInText = joined.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)\s*평/);
  if (bandInText) {
    const span = Math.abs(parseFloat(bandInText[2]) - parseFloat(bandInText[1]));
    if (span <= 50) return true;
  }
  const hasExactArea = /(?:대지|연면적|전용)?\s*(?:약\s*)?\d{2,5}(?:\.\d+)?\s*(?:평|㎡)(?![가-힣~-])/.test(joined);
  return hasExactArea;
}

/**
 * Checks area k-anonymity based on region density and asset type rarity.
 */
export function checkAreaKAnonymity(
  region?: string,
  assetType?: string,
  buildingCountInRegion?: number,
  hasSpecificScale?: boolean,
): { shouldFallback: boolean; suggestedRegion: string; notice?: string } {
  const suggestedRegion = suggestFallbackRegion(region);
  const isRareAsset = isRareAssetType(assetType);
  const isLowDensity = typeof buildingCountInRegion === 'number' && buildingCountInRegion < 5;

  if (isRareAsset) {
    const scaleDetail = hasSpecificScale ? ' (층수·면적 병기 시 단일 건물 특정 우려)' : '';
    return {
      shouldFallback: true,
      suggestedRegion,
      notice: `희소 용도(${assetType || '특수용도'})${scaleDetail}는 동 단위로 적으면 건물이 특정될 수 있어 구 단위(${suggestedRegion}) 표기를 권장합니다.`,
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
  const trimmedPoints = points.map((pt) => (pt || '').trim());

  trimmedPoints.forEach((ptClean, idx) => {
    const pointViolations = checkSensitivePoint(ptClean, idx);
    violations.push(...pointViolations);
  });

  const joinedText = trimmedPoints.join(' ');
  const detectedRareInPoints = RARE_ASSET_SUBSTRINGS.find((kw) => joinedText.includes(kw));
  const hasSpecificScale = hasExactFloorOrNarrowAreaSpec(trimmedPoints, options);
  const effectiveAssetType =
    options?.assetType && isRareAssetType(options.assetType)
      ? options.assetType
      : detectedRareInPoints && hasSpecificScale
        ? detectedRareInPoints
        : options?.assetType;

  const kAnon = checkAreaKAnonymity(
    options?.region,
    effectiveAssetType,
    options?.buildingCountInRegion,
    hasSpecificScale,
  );

  let cleanedPoints = cleanBlindPoints(trimmedPoints);
  if (kAnon.shouldFallback && hasSpecificScale && isRareAssetType(effectiveAssetType)) {
    const guOnly = kAnon.suggestedRegion.replace(/^.*?\s+([가-힣]+(?:구|군|시))$/, '$1');
    cleanedPoints = cleanedPoints.map((pt) =>
      pt.replace(
        /([가-힣0-9]{2,8}(?:동(?:\d+가)?|읍|면|리))(?=\s|$|[·,])/g,
        (dongToken) => (dongToken.endsWith('구') ? dongToken : guOnly),
      ),
    );
  }

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

    // Mask dong + single or multi-parcel numbers FIRST so secondary comma-separated jibuns
    // (including integer-only jibuns like "양평동4가 117, 134 외 1필지" or "성수동2가 315-4, 315-3, 315-7")
    // collapse cleanly into "${dong} 인근" without leaving dangling OO-OO or unmasked secondary lots
    cleaned = cleaned.replace(
      /([가-힣]{1,10}(?:\d+가)?(?:동|읍|면|리)|[가-힣]{1,10}\d+가)\s+(?:산\s*)?(\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?:\s*[,/·]\s*(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?)*)(?:\s*외\s*\d*\s*필지(?:\s*\((?:\s*(?:산\s*)?\d{1,5}(?:-\d{1,5})?\s*[,/·]?\s*)+\))?)?(?![0-9-]|\s*(?:층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|호|실|번\s*출구|출구|차선|차로|인|개|곳|건)(?![가-힣]))(\s*인근)?/g,
      (_match, dongPart: string) => `${dongPart.trim()} 인근`,
    );

    // Mask parcel numbers: e.g. "11-47번지" -> "OO번지"
    cleaned = cleaned.replace(
      /(?:산\s*)?(?:\b|^)\d{1,5}(?:-\d{1,5})?\s*번지(?:\s*외\s*\d*\s*필지)?(?=(?:에서|으로|부터|까지|[은는이가을를의에로과와도만])|[^\w가-힣]|$)/g,
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
      return isForbiddenParcelNumber(match, cleaned) ? 'OO-OO' : match;
    });

    // Clean parenthesized lot-number lists after "외 N필지": e.g. "외 2필지 (315-3, 315-7)" -> "다필지"
    cleaned = cleaned.replace(
      /외\s*\d+\s*필지\s*\((?:\s*(?:산\s*)?(?:OO-OO|\d{1,5}(?:-\d{1,5})?)\s*[,/·]?\s*)+\)/g,
      '다필지',
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

/**
 * Sanitizes broker phone numbers for public/preview rendering.
 * Rejects corrupted email-shaped auth placeholders (e.g. `01092423438@credeal.local`).
 */
export function sanitizeBrokerPhone(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('@')) return '';
  const cleaned = trimmed.replace(/[^0-9+\-\s()]/g, '').replace(/\s+/g, ' ').trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return cleaned;
}

export interface SubjectiveNumericWarning {
  pointIndex: number;
  pointText: string;
  keyword: string;
  reason: string;
}

/**
 * Q5-1 중개인 원칙:
 * 수익률·면적 등 정량 숫자에 대한 주관적·정성적 수식어("양호한 수익률", "넓은 대지" 등) 금지.
 */
export const SUBJECTIVE_NUMERIC_PHRASE_RULES: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  reason: string;
}> = [
  {
    pattern: /(?:양호한?|높은|우수한?|우량한?|뛰어난?|매력적인?|좋은|괜찮은|준수한?|탁월한?|안정적(?:인)?)\s*(?:임대\s*)?(?:수익률|연\s*수익률|배당|금리)/g,
    label: '주관적 수익률 수식어',
    reason: '수익률에 "양호한/높은" 같은 주관적 평가를 붙이지 말고, 수치 팩트나 현장 장점으로 적어 주세요.',
  },
  {
    pattern: /(?:수익률|연\s*수익률)(?:이|가)?\s*(?:양호|우수|높음|높은|탁월|매력)/g,
    label: '주관적 수익률 수식어',
    reason: '수익률 평가는 매수자마다 다르므로 주관적 판단 표현 대신 객관 팩트만 적어 주세요.',
  },
  {
    pattern: /(?:넓은|넉넉한?|알찬|풍부한?|우수한?|적정한?|쾌적한?|큰|거대한?)\s*(?:대지(?:면적)?|토지(?:면적)?|연면적|전용면적|면적|평수|규모)/g,
    label: '주관적 면적 수식어',
    reason: '면적·평수에 주관적 수식어("넓은/알찬" 등)를 붙이지 말고 현장 특장점을 적어 주세요.',
  },
];

const PURE_AREA_REPETITION_RE =
  /^(?:대지|토지|연면적|연|건축면적)\s*\d+(?:\.\d+)?\s*(?:평|㎡)(?:\s*[·,/]?\s*(?:대지|토지|연면적|연|건축면적)?\s*\d+(?:\.\d+)?\s*(?:평|㎡))+\s*$/;

export function isPureAreaRepetitionPoint(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  return PURE_AREA_REPETITION_RE.test(trimmed);
}

/**
 * 딜카드 장점 3줄에서 수익률/면적의 주관적 수식어 또는 단순 면적 반복을 탐지한다.
 */
export function detectSubjectiveNumericPhrases(
  points: readonly string[],
): SubjectiveNumericWarning[] {
  const out: SubjectiveNumericWarning[] = [];
  points.forEach((raw, pointIndex) => {
    const pointText = String(raw || '').trim();
    if (!pointText) return;

    if (isPureAreaRepetitionPoint(pointText)) {
      out.push({
        pointIndex,
        pointText,
        keyword: pointText,
        reason: '상단 썸네일에 이미 표시된 면적 숫자만 반복되었습니다. 입지·외관·임차 장점을 적어 주세요.',
      });
      return;
    }

    for (const rule of SUBJECTIVE_NUMERIC_PHRASE_RULES) {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      const match = re.exec(pointText);
      if (match) {
        out.push({
          pointIndex,
          pointText,
          keyword: match[0],
          reason: rule.reason,
        });
        break;
      }
    }
  });
  return out;
}

/**
 * AI 생성/후처리 시 수익률·면적의 주관적 형용사를 제거한다.
 */
export function stripSubjectiveNumericSpin(text: string): string {
  let next = String(text || '').trim();
  if (!next) return '';
  if (isPureAreaRepetitionPoint(next)) return '';

  next = next
    .replace(
      /(?:양호한?|높은|우수한?|우량한?|뛰어난?|매력적인?|좋은|괜찮은|준수한?|탁월한?|안정적(?:인)?)\s*((?:임대\s*)?(?:수익률|연\s*수익률))/g,
      '$1',
    )
    .replace(
      /(?:넓은|넉넉한?|알찬|풍부한?|우수한?|적정한?|쾌적한?|큰|거대한?)\s*(대지(?:면적)?|토지(?:면적)?|연면적|전용면적|면적|평수|규모)/g,
      '$1',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  return next;
}
