/**
 * D56 용어사전 기반 한국어 표시어 통합 모듈
 * SSoT: credeal/ssot/im.d56-lexicon.yaml
 * 
 * 모든 한국어 라벨은 이 모듈에서만 export 합니다.
 * data-binder, im-editor, magazine, PPTX 아키타입이 이 모듈을 import 합니다.
 */

// §14 표준 검토형 매각안내서 목차
export const CHAPTER_LABELS: Record<string, string> = {
  cover: '표지 및 핵심조건',
  decision_snapshot: '핵심 검토요약',
  evidence_status: '자료 확인현황',
  asset_scope: '매각대상 범위',
  location_market: '입지 및 시장',
  public_records: '공부 확인내용',
  stacking_use: '층별 구성 및 사용현황',
  rent_roll: '임대차 현황표',
  income_basis: '임대수입 산정기준',
  price_position: '가격 수준 검토',
  broker_lens: '중개인 검토의견',
  risks: '위험요인 및 반대근거',
  dd_loi: '실사사항 및 매입의향 조건',
  contact_disclosure: '담당자 및 자료 유의사항',
};

// §12 단계명
export const TIER_LABELS: Record<string, string> = {
  L1: '사실확인형 매각안내서',
  L2: '표준 검토형 매각안내서',
  L3: '중개분석형 투자검토서',
  L4: '전문가 협업형 투자검토서',
};

// §13 핵심 개념명 (내부→외부)
export const CONCEPT_LABELS: Record<string, string> = {
  Claim: '산출항목',
  Evidence: '근거자료',
  Conflict: '불일치',
  CorrectionEvent: '정정기록',
  EffectiveSnapshot: '유효기준본',
  Assumption: '분석가정',
  Gate: '발행검사',
  AssetForm: '자산형태',
  Lens: '검토관점',
};

// 기존 SECTION_LABELS 통합 (data-binder, im-editor, magazine 공용)
export const SECTION_LABELS: Record<string, string> = {
  // IM 섹션
  building: '자산 개요',
  property_overview: '자산 개요',
  location: '입지 및 시장',
  location_access: '입지 및 시장',
  rentRoll: '임대차 현황표',
  lease_status: '임대차 현황표',
  profit: '임대수입 산정기준',
  income_analysis: '임대수입 산정기준',
  risk: '위험요인',
  risk_check: '위험요인 및 반대근거',
  thesis: '중개인 검토의견',
  investment_thesis: '중개인 검토의견',
  process: '실사사항 및 매입의향 조건',
  checklist: '다음 확인사항',
  next_steps: '다음 확인사항',
  // 매거진 섹션
  cover: '커버 및 브리핑 요약',
  ai_briefing: 'AI 주간 브리핑',
  field_note: '현장 필드노트',
  theme_of_week: '금주의 핵심 테마',
  featured_deals: '추천 매물 하이라이트',
  market_data: '실거래 및 시장 데이터',
  news_curation: '주요 CRE 뉴스',
  tax_clinic: '세무 및 법률 클리닉',
  auction_picks: '경매 추천 픽',
  sentiment_index: '투자 심리 지수',
};

// §17 검색 동의어
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  '등기사항증명서': ['등기부', '등기부등본'],
  '토지이용계획확인서': ['토이계', '토지이용계획확인원'],
  '사용승인일': ['준공일'],
  '근린생활시설': ['근생'],
  '월 기본임대료': ['월세', '월차임'],
  '임대차 현황표': ['렌트롤'],
  '채권최고액': ['근저당 설정액'],
  '위반건축물': ['불법건축물'],
  '가치개선': ['밸류애드'],
  '임대차 재정비': ['리테넌팅'],
  '공실 해소': ['리스업'],
  '자본적 지출': ['캡엑스', 'CAPEX'],
  '실사': ['듀딜', 'DD'],
  '매입의향서': ['LOI'],
};
