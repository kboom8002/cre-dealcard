/**
 * @file investor-copywriting.ts
 * @description 기관 및 전문 투자자 표준 포스처별 투자 포인트 및 카피라이팅 블록 생성기
 */

import type { InvestmentPosture } from "@/domain/ontology";
import type { FinancialOutputs } from "./financials";

export interface InvestorCopyBlock {
  /** 한줄 헤드라인 (예: "강남 이면 역세권, 인근 대비 가격 경쟁력 확보 메디컬빌딩") */
  headline: string;
  /** 3대 투자 포인트 — 불릿 3줄 */
  investmentPoints: [string, string, string];
  /** 핵심 리스크 및 대응 방안 1줄 (주요 검토사항: 명도, 공실, 노후도) */
  keyRisk: string;
  /** 실투자금 & 월 순수익 요약 */
  cashFlowSummary?: {
    totalInvestment: string;  // "실투자금(자기자본) 약 30억"
    monthlyCashFlow: string;  // "월 순수입 약 1,070만원"
    annualReturn: string;     // "자기자본수익률 4.28%"
  };
}

export interface InvestorCopyParams {
  posture: InvestmentPosture;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  financials?: FinancialOutputs | null;
  buildingAge?: number;
  vacancyPct?: number;
  zoningDistrict?: string;
  landValueRatio?: number | null;
}

/**
 * D56 표준 기관용 섹션 타이틀 매핑 (Rule 1 & Rule 2 준수)
 */
export const D56_INSTITUTIONAL_SECTION_TITLES: Record<string, string> = {
  property_overview: '부동산 개요 및 물리적 현황',
  location_access: '입지 여건 및 상권 분석',
  lease_status: '임대차 현황 및 현금흐름 분석',
  income_analysis: '투자 구조 및 밸류에이션',
  risk_check: '위험요인 및 반대근거',
  investment_thesis: '투자 핵심 가치제안(Value Proposition)',
  next_steps: '실사사항 및 매입의향 조건',
  // Non-income / 확장 섹션
  occupancy_fit: '사옥 입주 적합성 분석',
  cost_comparison: '자가 사용 vs 임차 비용 비교 분석',
  site_analysis: '개발 부지 조건 및 공법 분석',
  development_feasibility: '개발 사업수지 및 수지분석',
  operation_overview: '운영 자산 현황 및 실적 분석',
  gop_analysis: '실질 영업이익(GOP) 및 손익 분석',
  market_position: '시장 내 자산 위치 및 가격 경쟁력',
  comparable_analysis: '유사 거래사례 및 비교 분석',
  title_rights: '등기사항증명서 권리관계 및 소유구조',
  land_detail: '토지 현황 및 공법상 이용제한',
  comparables: '인근 유사 거래사례 비교',
  decision_snapshot: '핵심 검토요약',
  market_rent_gap: '시장 임대료 격차 분석',
  value_add_plan: '가치개선(Value-add) 계획 및 기대효과',
  stabilized_scenario: '안정화 후 예상 현금흐름 시나리오',
  evidence_status: '자료 확인현황 및 근거',
  checklist: '실사 체크리스트 및 다음 확인사항',
  closing: '면책조항 및 자료 유의사항',
};

/**
 * 섹션 타입 또는 비표준 타이틀을 D56 기관용 표준 타이틀로 변환합니다.
 */
export function getD56InstitutionalSectionTitle(sectionTypeOrTitle: string): string {
  const legacyToD56Map: Record<string, string> = {
    '물건 개요': '부동산 개요 및 물리적 현황',
    '물건개요': '부동산 개요 및 물리적 현황',
    '자산 개요': '부동산 개요 및 물리적 현황',
    '입지 및 상권 분석': '입지 여건 및 상권 분석',
    '입지 및 상권': '입지 여건 및 상권 분석',
    '임대차 및 캐시플로우': '임대차 현황 및 현금흐름 분석',
    '임대 현황': '임대차 현황 및 현금흐름 분석',
    '투자 가치 및 밸류에이션': '투자 구조 및 밸류에이션',
    '수익 분석': '투자 구조 및 밸류에이션',
  };
  return legacyToD56Map[sectionTypeOrTitle] ?? D56_INSTITUTIONAL_SECTION_TITLES[sectionTypeOrTitle] ?? sectionTypeOrTitle;
}

/**
 * 투자 데이터 및 포스처를 기반으로 전문 투자자 관점의 카피라이팅 블록을 생성합니다.
 */
export function generateInvestorCopyBlock(params: InvestorCopyParams): InvestorCopyBlock {
  const {
    posture = 'income',
    areaSignal = '핵심 권역',
    assetType = '상업용 빌딩',
    priceBand = '매각가 협의',
    financials,
    buildingAge,
    vacancyPct,
    zoningDistrict,
    landValueRatio,
  } = params;

  switch (posture) {
    case 'income': {
      const landRatio = landValueRatio ?? financials?.landValueRatio ?? null;
      const leveragedYield = financials?.leveragedYield ?? null;
      const equityReq = financials?.equityRequired ? `약 ${financials.equityRequired}억 원` : '대출 조건 연동';
      const monthlyNet = financials?.annualNoi?.base 
        ? `월 약 ${Math.round(financials.annualNoi.base / 12 / 10000).toLocaleString()}만원` 
        : '안정적 월 임대료';

      return {
        headline: `${areaSignal} 안정 임대수익형 자산 (매도 희망가 ${priceBand})`,
        investmentPoints: [
          landRatio !== null ? `토지 평가액 비중 ${landRatio}% 수준으로 토지 평가액 기반 하방 안정성 확보` : null,
          `임차인(Tenant) 분산 기반 공실 위험 완화 및 ${monthlyNet} 수준의 안정적 월 현금흐름`,
          leveragedYield !== null ? `선순위 대출 및 임대보증금 레버리지 활용 시 자기자본수익률(자기자본 대비 연 수익률) ${leveragedYield}% 추정` : null,
        ].filter(Boolean) as [string, string, string],
        keyRisk: vacancyPct && vacancyPct > 10 
          ? `일부 공실(${vacancyPct}%) 발생 → 전속 MD 개편 및 렌트프리(무상임대) 협의를 통해 임대 안정화 추진` 
          : '향후 금리 변동 위험 → 고정금리 대출 승계 및 임대료 물가연동 인상 조항 검토 권장',
        cashFlowSummary: {
          totalInvestment: `실투자금(자기자본) ${equityReq}`,
          monthlyCashFlow: `월 순수입 ${monthlyNet}`,
          annualReturn: `자기자본수익률 ${leveragedYield}%`,
        },
      };
    }

    case 'owner_occupied': {
      const savings = financials?.ownVsLeaseSavingsBil 
        ? `연간 약 ${financials.ownVsLeaseSavingsBil}억 원` 
        : '연간 수억 원 수준';
      const breakeven = financials?.breakevenYears 
        ? `약 ${financials.breakevenYears}년` 
        : '산출 불가 (데이터 부족)';

      return {
        headline: `${areaSignal} 법인 본사 사옥 실입주 최적화 자산 (기업 위상 제고)`,
        investmentPoints: [
          `임차료 지출 소멸 및 자가 전환을 통해 ${savings}의 실질 비용 절감 효과`,
          `감가상각비 손비 인정 및 대출 이자비용 처리를 통한 법인세 절세 효과 기대`,
          `사옥 매입을 통한 기업 신용도 제고 및 중장기 사업 기반 자산 확보`,
        ],
        keyRisk: buildingAge && buildingAge > 15 
          ? `건물 연식(${buildingAge}년 경과) → 입주 전 파사드 개선 및 인테리어 리모델링 설계 병행 권장` 
          : '기존 임차인 명도 일정 → 매매계약 특약에 잔금 전 명도 완료 조건 명기 권장',
      };
    }

    case 'trading': {
      const discount = financials?.marketDiscountPct 
        ? `인근 대비 ${financials.marketDiscountPct}% 가격 경쟁력` 
        : '시세 대비 가격 경쟁력';
      const targetGain = financials?.targetCapitalGainBil 
        ? `약 ${financials.targetCapitalGainBil}억 원` 
        : '목표 자본이득 기대';
      const hpr = financials?.targetHprPct ? `${financials.targetHprPct}%` : '산출 불가';

      return {
        headline: `${areaSignal} 권역 실거래 대비 ${discount} 가치개선(Value-add) 매각 대상 자산`,
        investmentPoints: [
          `인근 유사 거래사례 대비 3.3㎡당 단가 ${discount} 구간으로 매입 완충 여력 확보`,
          `외관 파사드 개선 및 임차인(Tenant) 재구성을 통한 단기 자산가치 제고 도모 가능`,
          `2~3년 보유 후 목표 매각 시 ${targetGain} 수준의 매각차익(HPR ${hpr}) 기대`,
        ],
        keyRisk: '단기 시장 경기 주기 변동 위험 → 매입 즉시 가치개선 착수 및 매각 주관사 조기 선정을 통한 자본회수 구조 구축',
      };
    }

    case 'development': {
      const devProfit = financials?.devProfitMarginPct ? `${financials.devProfitMarginPct}%` : '산출 불가';
      const landPyeong = financials?.landPricePerPyeong 
        ? `3.3㎡당 ${financials.landPricePerPyeong.toLocaleString()}만원` 
        : '경쟁력 있는 3.3㎡당 토지가';

      return {
        headline: `${areaSignal} 신축 개발 및 용적률 활용 부지 (${zoningDistrict || '용도지역 양호'})`,
        investmentPoints: [
          `대지 가치 중심 평가 기준 ${landPyeong}으로 신축 개발 사업성 양호`,
          `법정 용적률 상한을 활용한 연면적 최적화 기획으로 개발 후 자산가치 제고 도모`,
          `신축 후 분양 또는 통매각 시 예상 개발 이익률 ${devProfit} 수준의 개발 사업수지 목표`,
        ],
        keyRisk: '인허가 지연 및 건축 공사비 변동 위험 → 책임준공 확약 시공사 매칭 및 확정공사비 계약 체결 권장',
      };
    }

    case 'operating': {
      const gopMargin = financials?.gopMarginPct ? `${financials.gopMarginPct}%` : '산출 불가';
      const annualGop = financials?.annualGopBil ? `약 ${financials.annualGopBil}억 원` : '연간 안정적 영업이익';
      const revpar = financials?.revparKrw 
        ? `RevPAR ${(financials.revparKrw / 10000).toFixed(1)}만원` 
        : '안정적 객실/영업 수입';

      return {
        headline: `${areaSignal} 직영 운영 및 현금창출형 특화 자산 (${revpar})`,
        investmentPoints: [
          `영업 총매출 대비 GOP 마진율 ${gopMargin} 달성으로 ${annualGop} 수준의 실질 영업이익 확보`,
          `전문 위탁 운영사 매칭 또는 직영 운영 효율화를 통한 연 순수익률(GOP Cap Rate) 제고`,
          `상권 및 계절 수요 방어를 위한 차별화된 F&B/부대시설 운영을 통한 복합 수익 창출`,
        ],
        keyRisk: '운영비(인건비/관리비) 상승 위험 → 무인 자동화 시스템 도입 및 운영 경비 표준화 관리 권장',
      };
    }
  }
}

