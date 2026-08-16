/**
 * @file investor-copywriting.ts
 * @description 60대 매수자 페르소나 맞춤형 포스처별 투자 포인트 및 카피라이팅 블록 생성기
 */

import type { InvestmentPosture } from "@/domain/ontology";
import type { FinancialOutputs } from "./financials";

export interface InvestorCopyBlock {
  /** 한줄 헤드라인 (예: "강남 이면 역세권, 주변 대비 평당 2천만원 저평가 메디컬빌딩") */
  headline: string;
  /** 3대 투자 포인트 — 불릿 3줄 */
  investmentPoints: [string, string, string];
  /** 핵심 리스크 및 대응 방안 1줄 (60대 관심사: 명도, 공실, 노후도) */
  keyRisk: string;
  /** 실투자금 & 월 순수익 요약 */
  cashFlowSummary?: {
    totalInvestment: string;  // "실투자금 약 30억"
    monthlyCashFlow: string;  // "월 순수익 약 1,070만원"
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
 * 딜 데이터 및 포스처를 기반으로 60대 투자자 관점의 맞춤형 카피라이팅 블록을 생성합니다.
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
      const landRatio = landValueRatio ?? financials?.landValueRatio ?? 65;
      const leveragedYield = financials?.leveragedYield ?? 4.5;
      const equityReq = financials?.equityRequired ? `약 ${financials.equityRequired}억 원` : '대출 조건 연동';
      const monthlyNet = financials?.annualNoi?.base 
        ? `월 약 ${Math.round(financials.annualNoi.base / 12 / 10000).toLocaleString()}만원` 
        : '안정적 월세';

      return {
        headline: `${areaSignal} 안정 임대수익형 핵심 자산 (매매가 ${priceBand})`,
        investmentPoints: [
          `토지 지분 가치 비중 ${landRatio}% 수준으로 원금 하방 경직성 및 자산 안전성 확보`,
          `우량 임차인 기반 공실 리스크 최소화 및 ${monthlyNet} 수준의 예측 가능한 월 현금흐름`,
          `선순위 대출 및 보증금 레버리지 활용 시 자기자본수익률(내 돈 대비 연 수익률) ${leveragedYield}% 추정`,
        ],
        keyRisk: vacancyPct && vacancyPct > 10 
          ? `일부 공실(${vacancyPct}%) 발생 → 전속 MD 개편 및 렌트프리 협의를 통해 조기 만실화 추진` 
          : '향후 금리 변동 리스크 → 고정금리 대출 승계 및 임대료 물가연동 인상 조항 검토 권장',
        cashFlowSummary: {
          totalInvestment: `실투자금(내 돈) ${equityReq}`,
          monthlyCashFlow: `월 순수익 ${monthlyNet}`,
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
        : '약 7~8년';

      return {
        headline: `${areaSignal} 법인 본사 사옥 실입주 최적화 자산 (기업 위상 제고)`,
        investmentPoints: [
          `임차료 지출 소멸 및 자가 전환을 통해 ${savings}의 실질 비용 절감 효과`,
          `감가상각비 손비 인정 및 대출 이자비용 처리를 통한 법인세 절세 혜택 극대화`,
          `사옥 매입을 통한 기업 신용도 제고 및 자녀 세대 가업승계용 핵심 부동산 자산 확보`,
        ],
        keyRisk: buildingAge && buildingAge > 15 
          ? `건물 노후화(${buildingAge}년 경과) → 입주 전 파사드 개선 및 인테리어 리모델링 설계 병행 권장` 
          : '기존 임차인 명도 일정 → 매매계약 특약에 잔금 전 명도 완료 조건 명기 권장',
      };
    }

    case 'trading': {
      const discount = financials?.marketDiscountPct 
        ? `${financials.marketDiscountPct}% 저평가` 
        : '시세 대비 우량 단가';
      const targetGain = financials?.targetCapitalGainBil 
        ? `약 ${financials.targetCapitalGainBil}억 원` 
        : '수십억 원 대 차익';
      const hpr = financials?.targetHprPct ? `${financials.targetHprPct}%` : '25~35%';

      return {
        headline: `${areaSignal} 권역 실거래 대비 ${discount} 밸류업 매각 대상 자산`,
        investmentPoints: [
          `인근 유사 매물 거래사례 대비 평당 단가 ${discount} 구간으로 매입 안전 마진 확보`,
          `외관 파사드 개선 및 우량 테넌트 유치를 통한 단기 자산 가치 극대화 가능`,
          `2~3년 단기 보유 후 목표 매각 시 ${targetGain} 수준의 매매차익(HPR ${hpr}) 기대`,
        ],
        keyRisk: '단기 시장 사이클 변동 리스크 → 매입 즉시 밸류업 착수 및 매각 주관사 조기 선정을 통한 엑시트 안전판 구축',
      };
    }

    case 'development': {
      const devProfit = financials?.devProfitMarginPct ? `${financials.devProfitMarginPct}%` : '18~25%';
      const landPyeong = financials?.landPricePerPyeong 
        ? `평당 ${financials.landPricePerPyeong.toLocaleString()}만원` 
        : '경쟁력 있는 평당 토지가';

      return {
        headline: `${areaSignal} 신축 개발 및 용적률 극대화 부지 (${zoningDistrict || '용도지역 우수'})`,
        investmentPoints: [
          `대지 가치 중심 평가 기준 ${landPyeong}으로 신축 개발 사업성 우수`,
          `법정 용적률 상한을 활용한 연면적 극대화 기획으로 개발 후 자산 가치 대폭 증대`,
          `신축 후 분양 또는 통매각 시 예상 개발 이익률 ${devProfit} 수준의 고수익 창출`,
        ],
        keyRisk: '인허가 지연 및 건축 공사비 변동 리스크 → 책임준공 확약 시공사 매칭 및 확정공사비 계약 체결 권장',
      };
    }

    case 'operating': {
      const gopMargin = financials?.gopMarginPct ? `${financials.gopMarginPct}%` : '35%';
      const annualGop = financials?.annualGopBil ? `약 ${financials.annualGopBil}억 원` : '연간 우량 영업이익';
      const revpar = financials?.revparKrw 
        ? `RevPAR ${(financials.revparKrw / 10000).toFixed(1)}만원` 
        : '안정적 객실/영업 수입';

      return {
        headline: `${areaSignal} 직영 운영 및 현금창출형 특화 자산 (${revpar})`,
        investmentPoints: [
          `영업 총매출 대비 GOP 마진율 ${gopMargin} 달성으로 ${annualGop} 수준의 실질 영업이익 확보`,
          `전문 위탁 운영사 매칭 또는 직영 운영 효율화를 통한 고수익 환원율(GOP Cap Rate) 달성`,
          `상권 및 계절 수요 방어를 위한 차별화된 F&B/부대시설 운영을 통한 복합 수익 창출`,
        ],
        keyRisk: '운영비(인건비/관리비) 상승 리스크 → 스마트 무인 운영 시스템 도입 및 운영 경비 표준화 관리 권장',
      };
    }
  }
}
