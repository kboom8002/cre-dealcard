export interface MemoQualityResult {
  pass: boolean;
  score: number;               // 0~4 (detected fields count)
  detectedFields: string[];    // e.g. ["location", "asset_type"]
  missingFields: string[];     // e.g. ["price", "deal_type"]
  suggestion: string;          // 한국어 안내 메시지
}

const FIELD_LABELS: Record<string, string> = {
  location: '위치(지역명, 역명, 주소)',
  asset_type: '자산 유형(오피스, 빌딩, 상가 등)',
  numeric: '가격 또는 면적 수치',
  deal_type: '거래 유형(매각, 임대 등)',
};

// 정규식 기반 경량 탐지 (AI 호출 없이)
const FIELD_DETECTORS: Record<string, RegExp> = {
  // 지역명/주소: 서울 주요 상권 + 전국 광역시/시/구/동/읍/면/리 + 도로명 패턴
  location: /(?:역삼|강남|서초|마포|여의도|종로|GBD|CBD|YBD|판교|분당|성수|을지로|광화문|송파|삼성|선릉|신사|청담|잠실|영등포|용산|동대문|서대문|관악|구로|금천|노원|도봉|동작|성동|성북|양천|중랑|광진|강서|강동|강북|천안|수원|대전|대구|부산|인천|광주|울산|세종|창원|전주|청주|제주|평택|화성|고양|성남|의정부|안양|파주|김포|포항|원주|춘천|안산|시흥|양산|구미|진주)|\b\S+[시군구동읍면리로길]\b/,

  // 자산 유형: 상업용 부동산 전반 포괄
  asset_type: /(?:오피스|빌딩|상가|지식산업|지산|아파트|호텔|물류|공장|리테일|주상복합|생활숙박|꼬마빌딩|근생|업무시설|건물|사옥|주차장|소극장|약국|병원|정형외과|의원|클리닉|학원|어린이집|음식점|카페|편의점|마트|은행|상업|주거|숙박|창고|연구소|데이터센터|지하\d+층|지상\d+층|B\d+|복합)/,

  // 숫자+단위: 가격/면적/층/대수 등 부동산 관련 수치
  numeric: /\d+(?:\.\d+)?\s*(?:억|만|평|㎡|평방미터|원|층|호|평형|대|세대|실|개)/,

  // 거래 유형: 매각/매매/임대/투자 관련 키워드
  deal_type: /(?:매각|매매|임대|투자|펀딩|분양|리모델링|개발|매입|사옥|증여|수익형|임차|임대차|공실|만실|월세|보증금|전세|관리비|수익률|매도|매수)/,
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

  // 1개 이상 탐지되면 통과 (이전: 2개 이상)
  // 브로커 메모는 대부분 최소 주소나 면적 정도는 포함하므로 1개면 충분
  const pass = detected.length >= 1;
  
  const suggestion = !pass
    ? `딜카드 생성을 위해 다음 정보 중 최소 1가지를 포함해주세요:\n${missing.map(f => `• ${FIELD_LABELS[f]}`).join('\n')}\n\n예시: "천안 동남구 근생빌딩 지하2층~지상4층 임대 중"`
    : '';

  return { 
    pass, 
    score: detected.length, 
    detectedFields: detected, 
    missingFields: missing, 
    suggestion 
  };
}
