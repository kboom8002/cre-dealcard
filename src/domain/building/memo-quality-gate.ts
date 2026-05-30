export interface MemoQualityResult {
  pass: boolean;
  score: number;               // 0~4 (detected fields count)
  detectedFields: string[];    // e.g. ["location", "asset_type"]
  missingFields: string[];     // e.g. ["price", "deal_type"]
  suggestion: string;          // 한국어 안내 메시지
}

const FIELD_LABELS: Record<string, string> = {
  location: '위치(지역명, 역명)',
  asset_type: '자산 유형(오피스, 빌딩 등)',
  numeric: '가격 또는 면적 수치',
  deal_type: '거래 유형(매각, 임대 등)',
};

// 정규식 기반 경량 탐지 (AI 호출 없이)
const FIELD_DETECTORS = {
  location: /(?:역삼|강남|서초|마포|여의도|종로|GBD|CBD|YBD|판교|분당|성수|을지로|광화문|송파|삼성|선릉|신사|청담|역|동|구|시|도로)/,
  asset_type: /(?:오피스|빌딩|상가|지식산업|지산|아파트|호텔|물류|공장|리테일|주상복합|생활숙박|꼬마빌딩|근생|업무시설)/,
  numeric: /\d+(?:\.\d+)?\s*(?:억|만|평|㎡|평방미터|원|층|호|평형)/,
  deal_type: /(?:매각|매매|임대|투자|펀딩|분양|리모델링|개발|매입|사옥|증여|수익형|임차|임대차)/,
};

export function validateMemoQuality(memo: string): MemoQualityResult {
  const detected: string[] = [];
  const missing: string[] = [];

  for (const [field, pattern] of Object.entries(FIELD_DETECTORS)) {
    if (pattern.test(memo)) {
      detected.push(field);
    } else {
      missing.push(field);
    }
  }

  const pass = detected.length >= 2;
  
  const suggestion = !pass
    ? `메모에 다음 정보 중 최소 1~2개를 추가해주세요: ${missing.map(f => FIELD_LABELS[f]).join(', ')}. 예시: "역삼역 근처 오피스빌딩 매각 300억"`
    : '';

  return { 
    pass, 
    score: detected.length, 
    detectedFields: detected, 
    missingFields: missing, 
    suggestion 
  };
}
