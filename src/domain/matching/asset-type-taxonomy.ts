/**
 * Asset Type Taxonomy & Normalization (P0-2)
 *
 * Implements mapping for standard Korean commercial real estate
 * asset types and their synonyms/abbreviations.
 */

export const ASSET_CATEGORIES: Record<string, string[]> = {
  '꼬마빌딩': [
    '꼬마빌딩',
    '근생',
    '근생건물',
    '근생빌딩',
    '근린생활시설',
    '상가주택',
    '상가건물',
    '다가구',
    '다가구주택',
    '단독주택',
    '중소형빌딩'
  ],
  '오피스': [
    '오피스',
    '오피스빌딩',
    '사무실',
    '업무시설',
    '업무용빌딩',
    '사옥'
  ],
  '상가': [
    '상가',
    '구분상가',
    '점포',
    '상업시설',
    '상업용'
  ],
  '공장/창고': [
    '공장',
    '창고',
    '지식산업센터',
    '지산',
    '물류창고',
    '제조공장'
  ],
  '토지': [
    '토지',
    '부지',
    '나대지',
    '개발부지',
    '대지'
  ],
  '주택': [
    '주택',
    '단독주택',
    '빌라',
    '아파트',
    '공동주택',
    '다세대',
    '다세대주택'
  ]
};

/**
 * 목적 기반 용어 → 복수 카테고리 매핑
 * 매수자의 의도/목적 키워드가 여러 자산 유형과 매칭될 수 있도록 허용
 */
export const PURPOSE_CROSS_CATEGORIES: Record<string, string[]> = {
  '사옥':     ['오피스', '꼬마빌딩'],
  '임대':     ['꼬마빌딩', '오피스', '상가'],
  '임대수익': ['꼬마빌딩', '오피스', '상가'],
  '수익형':   ['꼬마빌딩', '오피스', '상가'],
  '상업용':   ['꼬마빌딩', '오피스', '상가'],
  '투자':     ['꼬마빌딩', '오피스', '상가', '공장/창고'],
};

// PURPOSE_CROSS_CATEGORIES 를 정규화 키로 변환
const NORMALIZED_PURPOSE_MAP: Record<string, string[]> = {};
for (const [term, categories] of Object.entries(PURPOSE_CROSS_CATEGORIES)) {
  NORMALIZED_PURPOSE_MAP[normalizeAssetType(term)] = categories.map(normalizeAssetType);
}

// Normalized lookup dictionary mapping each clean synonym to its canonical category
const CANONICAL_MAP: Record<string, string> = {};

for (const [category, terms] of Object.entries(ASSET_CATEGORIES)) {
  const normCategory = normalizeAssetType(category);
  for (const term of terms) {
    CANONICAL_MAP[normalizeAssetType(term)] = normCategory;
  }
}

/**
 * Clean and normalize asset type string by removing whitespaces.
 */
export function normalizeAssetType(type: string): string {
  if (!type) return '';
  return type.replace(/\s+/g, '').trim();
}

/**
 * Robust asset type matching considering taxonomy hierarchy and synonyms.
 */
export function matchAssetType(propertyType: string, buyerTypes: string[]): boolean {
  if (!propertyType || !buyerTypes || buyerTypes.length === 0) {
    return false;
  }

  const normProp = normalizeAssetType(propertyType);
  const propCategory = CANONICAL_MAP[normProp] || normProp;

  for (const buyerType of buyerTypes) {
    const normBuyer = normalizeAssetType(buyerType);
    if (!normBuyer) continue;

    const buyerCategory = CANONICAL_MAP[normBuyer] || normBuyer;

    // 1. Check if canonical categories match
    if (propCategory === buyerCategory) {
      return true;
    }

    // 2. 목적 기반 크로스 카테고리 매칭
    const crossCategories = NORMALIZED_PURPOSE_MAP[normBuyer];
    if (crossCategories && crossCategories.includes(propCategory)) {
      return true;
    }

    // 3. Direct string equality of normalized names
    if (normProp === normBuyer) {
      return true;
    }

    // 4. Substring fallback match for robust custom variations
    if (
      normProp.length >= 2 &&
      normBuyer.length >= 2 &&
      (normProp.includes(normBuyer) || normBuyer.includes(normProp))
    ) {
      return true;
    }
  }

  return false;
}
