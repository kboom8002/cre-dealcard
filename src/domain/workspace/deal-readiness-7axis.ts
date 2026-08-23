/**
 * deal-readiness-7axis.ts — 중개인 워크스페이스 딜 준비도 7축 산정 엔진
 * Spec: docs/imup/04_screen/BROKER_WORKSPACE_SPEC.md (§2, §3, §4, §5)
 * 
 * 자료등급(A~D 문자)과 딜 준비도(상태어: 준비완료/보완필요/위험/정체)를 명확히 분리하여 산정합니다.
 */

export type ReadinessState = '준비완료' | '보완필요' | '위험' | '정체';

export interface AxisScore {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: 'good' | 'warn' | 'bad';
  reasoning: string;
}

export interface NextBestAction {
  axisKey: string;
  title: string;
  description: string;
  potentialPointGain: number;
}

export interface DealReadinessInput {
  // 1. 자료 완비도 (20점)
  hasBuildingRegister?: boolean;  // 5점
  hasTitleRegistry?: boolean;     // 5점
  hasLandUsePlan?: boolean;       // 4점
  hasRentRoll?: boolean;          // 4점
  hasPhotos?: boolean;            // 2점

  // 2. 가격 합리성 (20점)
  hasAskingPrice?: boolean;       // 10점
  isMarketComparableAligned?: boolean; // 10점 (시세 대비 괴리 15% 이내)

  // 3. 매도 의사 (15점)
  hasExclusiveContract?: boolean; // 8점 (전속/독점 중개권)
  sellerMeetingConfirmed?: boolean; // 7점 (매도자 직접 미팅/의사 확인)

  // 4. 권리 / 명도 (15점)
  hasCleanTitle?: boolean;        // 8점 (제한물권/가압류 없음)
  vacatePlanEstablished?: boolean; // 7점 (명도 계획 수립 또는 안정 임차)

  // 5. 규제 / 공법 (10점)
  noIllegalBuilding?: boolean;    // 5점 (위반건축물 부존재)
  isZoningPermissible?: boolean;  // 5점 (토허/공법 제한 저촉 없음)

  // 6. 금융 타당성 (10점)
  isLeverageViable?: boolean;     // 6점 (역레버리지 미발생 또는 LTV 타당)
  hasAppraisalValue?: boolean;    // 4점 (탁상감정/감정평가서 확보)

  // 7. 시장 수요 (10점)
  buyerInquiryCount?: number;     // 1~5회(5점), 6회 이상(10점)

  // 부가 정보
  staleDays?: number;             // 마지막 갱신 후 경과 일수
}

export interface DealReadinessReport {
  totalScore: number;
  state: ReadinessState;
  staleDays: number;
  isStalled: boolean;
  axes: AxisScore[];
  nextBestActions: NextBestAction[];
  summary: string;
}

/**
 * 7축 딜 준비도 산정
 */
export function calculate7AxisReadiness(input: DealReadinessInput): DealReadinessReport {
  const staleDays = input.staleDays ?? 0;
  const actions: NextBestAction[] = [];

  // Axis 1: 자료 완비도 (20점)
  let score1 = 0;
  if (input.hasBuildingRegister) score1 += 5;
  else actions.push({ axisKey: 'data_completeness', title: '건축물대장 확보', description: '건축물대장 발급으로 기본 건축 정보를 확정하세요.', potentialPointGain: 5 });

  if (input.hasTitleRegistry) score1 += 5;
  else actions.push({ axisKey: 'data_completeness', title: '등기부등본 확보', description: '소유권 및 권리제한 사항을 확인하세요.', potentialPointGain: 5 });

  if (input.hasLandUsePlan) score1 += 4;
  else actions.push({ axisKey: 'data_completeness', title: '토지이용계획원 확보', description: '용도지역 및 공법 규제를 파악하세요.', potentialPointGain: 4 });

  if (input.hasRentRoll) score1 += 4;
  else actions.push({ axisKey: 'data_completeness', title: '임대차 현황(렌트롤) 입력', description: '호실별 보증금 및 월세를 정확히 기재하세요.', potentialPointGain: 4 });

  if (input.hasPhotos) score1 += 2;
  else actions.push({ axisKey: 'data_completeness', title: '현장 사진 등록', description: '외관 및 도로 접면 사진을 첨부하세요.', potentialPointGain: 2 });

  const axis1: AxisScore = {
    key: 'data_completeness',
    label: '자료 완비도',
    score: score1,
    maxScore: 20,
    status: score1 >= 16 ? 'good' : score1 >= 10 ? 'warn' : 'bad',
    reasoning: `공부 및 필수자료 5종 중 ${score1}/20점 충족`,
  };

  // Axis 2: 가격 합리성 (20점)
  let score2 = 0;
  if (input.hasAskingPrice) score2 += 10;
  else actions.push({ axisKey: 'price_rationality', title: '매각 희망가 확정', description: '매도자와 협의된 매각 금액을 확정하세요.', potentialPointGain: 10 });

  if (input.isMarketComparableAligned) score2 += 10;
  else if (input.hasAskingPrice) actions.push({ axisKey: 'price_rationality', title: '시세 비교사례 정합성 보완', description: '인근 실거래가 대비 적정성을 검증하세요.', potentialPointGain: 10 });

  const axis2: AxisScore = {
    key: 'price_rationality',
    label: '가격 합리성',
    score: score2,
    maxScore: 20,
    status: score2 >= 16 ? 'good' : score2 >= 10 ? 'warn' : 'bad',
    reasoning: score2 === 20 ? '희망가 확정 및 인근 시세 정합성 우수' : score2 >= 10 ? '희망가 확정 완료, 시세 검증 필요' : '희망가 미확정 상태',
  };

  // Axis 3: 매도 의사 (15점)
  let score3 = 0;
  if (input.hasExclusiveContract) score3 += 8;
  else actions.push({ axisKey: 'seller_intent', title: '전속/단독 중개권 확보', description: '매도인과의 전속 중개 계약을 체결하세요.', potentialPointGain: 8 });

  if (input.sellerMeetingConfirmed) score3 += 7;
  else actions.push({ axisKey: 'seller_intent', title: '매도인 의사 직접 확인', description: '매도 의사 및 매각 조건을 직접 대면 확인하세요.', potentialPointGain: 7 });

  const axis3: AxisScore = {
    key: 'seller_intent',
    label: '매도 의사',
    score: score3,
    maxScore: 15,
    status: score3 >= 12 ? 'good' : score3 >= 7 ? 'warn' : 'bad',
    reasoning: score3 >= 12 ? '매도 의사 명확 및 전속권 확보' : score3 >= 7 ? '매도 의사 확인 완료, 전속 미확보' : '매도자 직접 의사 미확인',
  };

  // Axis 4: 권리 / 명도 (15점)
  let score4 = 0;
  if (input.hasCleanTitle) score4 += 8;
  else actions.push({ axisKey: 'legal_tenancy', title: '권리제한사항 확인/해소', description: '신탁, 가압류 등 제한물권 해소 방안을 마련하세요.', potentialPointGain: 8 });

  if (input.vacatePlanEstablished) score4 += 7;
  else actions.push({ axisKey: 'legal_tenancy', title: '명도 계획 수립', description: '임차인 만기일 및 갱신요구권 실사를 완료하세요.', potentialPointGain: 7 });

  const axis4: AxisScore = {
    key: 'legal_tenancy',
    label: '권리/명도',
    score: score4,
    maxScore: 15,
    status: score4 >= 12 ? 'good' : score4 >= 7 ? 'warn' : 'bad',
    reasoning: score4 >= 12 ? '권리관계 깨끗하며 명도/임대차 계획 확정' : score4 >= 7 ? '권리/명도 일부 점검 필요' : '권리관계 및 명도 리스크 미실사',
  };

  // Axis 5: 규제 / 공법 (10점)
  let score5 = 0;
  if (input.noIllegalBuilding) score5 += 5;
  else actions.push({ axisKey: 'zoning_regulation', title: '위반건축물 점검/해소', description: '건축물대장 상 위반사항 유무를 확인하세요.', potentialPointGain: 5 });

  if (input.isZoningPermissible) score5 += 5;
  else actions.push({ axisKey: 'zoning_regulation', title: '토허제/공법 제한 확인', description: '토지거래허가구역 및 용도제한을 검토하세요.', potentialPointGain: 5 });

  const axis5: AxisScore = {
    key: 'zoning_regulation',
    label: '규제/공법',
    score: score5,
    maxScore: 10,
    status: score5 >= 8 ? 'good' : score5 >= 5 ? 'warn' : 'bad',
    reasoning: score5 === 10 ? '위반건축물 없음 및 공법 규제 클리어' : score5 >= 5 ? '일부 규제 확인 필요' : '공법/위반건축물 미점검',
  };

  // Axis 6: 금융 타당성 (10점)
  let score6 = 0;
  if (input.isLeverageViable) score6 += 6;
  else actions.push({ axisKey: 'financial_viability', title: '금융 조달/수익률 구조 점검', description: '금리 대비 Cap Rate 및 역레버리지 유무를 검토하세요.', potentialPointGain: 6 });

  if (input.hasAppraisalValue) score6 += 4;
  else actions.push({ axisKey: 'financial_viability', title: '탁상감정서 확보', description: '금융기관 대출 가능액 산정을 위해 탁상감정을 의뢰하세요.', potentialPointGain: 4 });

  const axis6: AxisScore = {
    key: 'financial_viability',
    label: '금융 타당성',
    score: score6,
    maxScore: 10,
    status: score6 >= 8 ? 'good' : score6 >= 5 ? 'warn' : 'bad',
    reasoning: score6 === 10 ? '대출 조달성 및 금융 구조 우수' : score6 >= 5 ? '레버리지 구조 확인 완료' : '금융 타당성 미검토',
  };

  // Axis 7: 시장 수요 (10점)
  let score7 = 0;
  const inq = input.buyerInquiryCount ?? 0;
  if (inq >= 6) score7 = 10;
  else if (inq >= 1) score7 = 5;
  else actions.push({ axisKey: 'market_demand', title: '매수자 사전 태핑/마케팅', description: '타깃 매수자군에 티저를 발송하여 시장 반응을 수집하세요.', potentialPointGain: 5 });

  const axis7: AxisScore = {
    key: 'market_demand',
    label: '시장 수요',
    score: score7,
    maxScore: 10,
    status: score7 >= 8 ? 'good' : score7 >= 5 ? 'warn' : 'bad',
    reasoning: score7 === 10 ? `매수자 관심도 높음 (문의 ${inq}건)` : score7 >= 5 ? `초기 관심 형성 (문의 ${inq}건)` : '매수자 문의 이력 없음',
  };

  const totalScore = score1 + score2 + score3 + score4 + score5 + score6 + score7;
  const isStalled = totalScore < 40 || staleDays > 60;

  let state: ReadinessState;
  if (isStalled) {
    state = '정체';
  } else if (totalScore >= 80) {
    state = '준비완료';
  } else if (totalScore >= 60) {
    state = '보완필요';
  } else {
    state = '위험';
  }

  // 행동 우선순위 정렬 (포인트 획득량이 큰 순서 상위 3개)
  const nextBestActions = actions
    .sort((a, b) => b.potentialPointGain - a.potentialPointGain)
    .slice(0, 3);

  let summary = '';
  switch (state) {
    case '준비완료':
      summary = '매수자 미팅 및 계약 체결을 즉시 추진할 수 있는 최적의 상태입니다.';
      break;
    case '보완필요':
      summary = '기본 뼈대는 갖추어졌으나 1~2개 핵심 축 보완 시 성사 확률이 크게 상승합니다.';
      break;
    case '위험':
      summary = '주요 권리/자료 결손으로 인해 거래 진행 시 무산 위험이 높습니다.';
      break;
    case '정체':
      summary = staleDays > 60 
        ? `장기 미갱신(${staleDays}일 경과)으로 딜이 정체되었습니다. 최신화가 필요합니다.`
        : '자료 및 거래 조건 미흡으로 전면 재검토가 필요합니다.';
      break;
  }

  return {
    totalScore,
    state,
    staleDays,
    isStalled,
    axes: [axis1, axis2, axis3, axis4, axis5, axis6, axis7],
    nextBestActions,
    summary,
  };
}
