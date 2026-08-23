// src/domain/building/mobile-im/assumptions.ts
// 21종 가정값 레지스트리 (Assumption Registry)
// 하드코딩 상수 22종을 폐기(6종) 및 출처/근거가 명시된 21종 레지스트리로 교체
// Spec: ASSUMPTION_REGISTRY.md (D4)

export type AssumptionSource =
  | 'measured'        // 실측 — 공부·계약서
  | 'legal'           // 법정 — 기본값 없음
  | 'market_default'  // 시장 통상 — 연 1회 갱신
  | 'user_input';     // 사용자 입력 — null 허용

export interface Assumption<T> {
  key: string;
  value: T | null;
  unit: string;
  source: AssumptionSource;
  basis: string;                       // 화면 노출 문장
  confidence: 'high' | 'medium' | 'low';
  editable: boolean;                   // 중개인이 물건별로 바꿀 수 있는가
  reviewedAt: string;                  // YYYY-MM-DD
  impactIfWrong: string;               // 이 값이 틀리면 무엇이 어긋나는가
}

const TODAY = '2026-08-23';

/**
 * 전역 가정값 레지스트리 (21종)
 */
export const ASSUMPTIONS = {
  // ── 1. legal 계층 (7종) — 법정 기준 ──
  acquisitionTaxRate: {
    key: 'acquisitionTaxRate',
    value: 0.046,
    unit: '비율',
    source: 'legal',
    basis: '취득세 4.0% + 지방교육세 0.4% + 농특세 0.2% (상가·업무시설 표준세율)',
    confidence: 'high',
    editable: false,
    reviewedAt: TODAY,
    impactIfWrong: '총취득원가 및 실투자금(Equity) 산출 왜곡',
  } as Assumption<number>,

  brokerFeeRateMax: {
    key: 'brokerFeeRateMax',
    value: 0.009,
    unit: '비율',
    source: 'legal',
    basis: '공인중개사법 시행규칙 제20조 제4항 상업용 부동산 법정 상한 (협의 가능)',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '취득 부대비용 및 실투자금 오차',
  } as Assumption<number>,

  targetFarByZoning: {
    key: 'targetFarByZoning',
    value: null,
    unit: '%',
    source: 'legal',
    basis: '용도지역별 법정 용적률 상한 (토지이용계획 API 실측 필요)',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '신축 규모·분양수입·사업이익률이 전부 어긋납니다 (일괄 400% 적용 시 최대 60% 과대표기)',
  } as Assumption<number>,

  bcrByZoning: {
    key: 'bcrByZoning',
    value: null,
    unit: '%',
    source: 'legal',
    basis: '용도지역별 법정 건폐율 상한 (토지이용계획 API 실측 필요)',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '건축 바닥면적 및 배치 계획 오류',
  } as Assumption<number>,

  transferTaxRate: {
    key: 'transferTaxRate',
    value: 0.20,
    unit: '비율',
    source: 'legal',
    basis: '법인세율 통상 20% (개인 일반과세 6~45% 누진)',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '매매형 세후 차익 및 HPR 수익률 왜곡',
  } as Assumption<number>,

  regulationBasis: {
    key: 'regulationBasis',
    value: '서울시 소규모 건축물 한시적 용적률 완화 방안',
    unit: '텍스트',
    source: 'legal',
    basis: '2025-05-19 서울시 고시 소규모 정비 및 신축 용적률 완화',
    confidence: 'high',
    editable: false,
    reviewedAt: TODAY,
    impactIfWrong: '인허가 적용 근거 상실',
  } as Assumption<string>,

  regulationExpiry: {
    key: 'regulationExpiry',
    value: '2028-05-18',
    unit: '날짜',
    source: 'legal',
    basis: '한시적 완화 기한 3년 (2025-05-19 ~ 2028-05-18)',
    confidence: 'high',
    editable: false,
    reviewedAt: TODAY,
    impactIfWrong: '매수인의 사업 인허가 착공 골든타임 오판',
  } as Assumption<string>,

  // ── 2. market_default 계층 (8종) — 시장 통상 ──
  constructionCostPerPyeong: {
    key: 'constructionCostPerPyeong',
    value: 12_000_000,
    unit: '원/평',
    source: 'market_default',
    basis: '서울 소형 근생 신축 2026 통상 평당 공사비',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '총사업비 및 개발이익률이 직접 어긋남 (800만 적용 시 33% 과소평가)',
  } as Assumption<number>,

  devContingencyRate: {
    key: 'devContingencyRate',
    value: 0.05,
    unit: '비율',
    source: 'market_default',
    basis: '총사업비 대비 예비비 통상 3~7%',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '개발 리스크 버퍼 부족',
  } as Assumption<number>,

  loanRateDefault: {
    key: 'loanRateDefault',
    value: 0.045,
    unit: '비율/연',
    source: 'market_default',
    basis: '2026 1금융권 상업용 부동산 담보대출 통상 금리 4.5%',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '역레버리지 판정 및 순현금흐름 반전 (수익률 3%대 물건에서 결정적)',
  } as Assumption<number>,

  ltvScenarios: {
    key: 'ltvScenarios',
    value: [0, 0.4, 0.5],
    unit: '배열',
    source: 'market_default',
    basis: '표준 제시 3안 (전액현금, LTV 40%, LTV 50%)',
    confidence: 'high',
    editable: false,
    reviewedAt: TODAY,
    impactIfWrong: '차입 구조 시나리오 비교 불가',
  } as Assumption<number[]>,

  pfEquityRatioByYear: {
    key: 'pfEquityRatioByYear',
    value: { 2026: 0.10, 2027: 0.15, 2028: 0.20 },
    unit: '객체',
    source: 'market_default',
    basis: '정부 부동산 PF 자기자본비율 규제 강화 로드맵',
    confidence: 'high',
    editable: false,
    reviewedAt: TODAY,
    impactIfWrong: '개발형 필수 자기자본(에쿼티) 과소 추정',
  } as Assumption<Record<number, number>>,

  depreciationYears: {
    key: 'depreciationYears',
    value: 40,
    unit: '년',
    source: 'market_default',
    basis: '철근콘크리트 구조 법정 감가상각 내용연수 (세무 확인 필요)',
    confidence: 'low',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '사옥형 감가상각 절세 효과 오차',
  } as Assumption<number>,

  buildingValueRatio: {
    key: 'buildingValueRatio',
    value: 0.35,
    unit: '비율',
    source: 'market_default',
    basis: '매매가 중 건물분 안분 통상 비율 (20~50% 물건별 편차 큼)',
    confidence: 'low',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '건물 감가상각비 및 부가세 안분액 오류',
  } as Assumption<number>,

  seoulHotelRevPar: {
    key: 'seoulHotelRevPar',
    value: 207_345,
    unit: '원/실',
    source: 'market_default',
    basis: '서울 관광호텔 2025~2026 평균 RevPAR 통계',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '운영형 호텔 매출 역산 왜곡',
  } as Assumption<number>,

  // ── 3. user_input 계층 (6종) — 입력 없으면 null ──
  opexKrw: {
    key: 'opexKrw',
    value: null,
    unit: '원/년',
    source: 'user_input',
    basis: '소유자/임대인 실측 운영비 (미입력 시 NOI 산출 불가)',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: 'NOI 및 순수익률 산출 신뢰성 상실 (0.85 임의곱 적용 금지)',
  } as Assumption<number>,

  gopMarginPct: {
    key: 'gopMarginPct',
    value: null,
    unit: '%',
    source: 'user_input',
    basis: '호텔/직영시설 실측 GOP 마진율 (통상 30~40%)',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '운영형 실질 영업이익 및 GOP Cap Rate 왜곡',
  } as Assumption<number>,

  manualComps: {
    key: 'manualComps',
    value: null,
    unit: '배열',
    source: 'user_input',
    basis: '중개사 직접 선정 비교사례 (300억 초과 B4 대역 필수)',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '주력 상단(300~500억) 가격 검증 공백 발생',
  } as Assumption<unknown[]>,

  marketRentPerPyeong: {
    key: 'marketRentPerPyeong',
    value: null,
    unit: '원/평',
    source: 'user_input',
    basis: '인근 유사 빌딩 시장 임대료 (사옥형 임차료 절감액 산출용)',
    confidence: 'medium',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '사옥 매수 시 임차 대비 실익 계산 불가',
  } as Assumption<number>,

  appraisedValueKrw: {
    key: 'appraisedValueKrw',
    value: null,
    unit: '원',
    source: 'user_input',
    basis: '금융기관 정식 감정평가액',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '실제 차입 가능 한도 및 에쿼티 조달 계획 차질',
  } as Assumption<number>,

  firstContractDate: {
    key: 'firstContractDate',
    value: null,
    unit: '날짜',
    source: 'user_input',
    basis: '임차인 최초 입점 계약일',
    confidence: 'high',
    editable: true,
    reviewedAt: TODAY,
    impactIfWrong: '상임법 10년 갱신요구권 기산점 오류로 명도 시점 최대 수년 오판',
  } as Assumption<string>,
};

/**
 * 300억 초과(B4 대역) 또는 20억 미만 구간에서 수동 비교사례 필수 여부 판정
 */
export function requiresManualComps(priceKrw: number): boolean {
  return priceKrw < 2_000_000_000 || priceKrw > 30_000_000_000;
}

/**
 * 한시적 규제 완화 잔여 일수 계산
 */
export function getRegulationDaysLeft(asOf: Date = new Date()): number | null {
  const expiryStr = ASSUMPTIONS.regulationExpiry.value;
  if (!expiryStr) return null;
  const expiry = new Date(expiryStr);
  const diffTime = expiry.getTime() - asOf.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}
