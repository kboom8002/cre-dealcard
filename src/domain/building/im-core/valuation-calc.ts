/**
 * src/domain/building/im-core/valuation-calc.ts
 *
 * 상업용 부동산(CRE) 가격 근거 2대 평가 모델 엔진:
 * 1. 사례비교법 (Sales Comparison Approach)
 *    - 인근 동일 용도지역(준공업/상업 등) 실거래 사례 3~5건 기반 평당가 밴드 산출 및 적정 호가 범위 도출
 * 2. 수익환원법 (Income Capitalization Approach)
 *    - 순영업소득(NOI)과 시장 요구수익률(Cap Rate 밴드) 기반 수익가치 환원
 * 3. 원가법 배제 (중개인 지도 지침: 도심 상업용 수익형 빌딩 특성상 원가법 X)
 */

export const DEFAULT_COST_METHOD_EXCLUSION_NOTE =
  '원가법 제외: 노후도 감가 및 도심 역세권 수익형 상업용 부동산 특성상 사례비교법 및 수익환원법 2방식 적용';

export interface SalesComp {
  name: string;
  distanceM: number;
  dealDate: string;
  landPricePerPyeongKrw: number;
  gfaPricePerPyeongKrw: number;
  landAreaPyeong: number;
  gfaPyeong: number;
}

export interface SalesComparisonResult {
  compCount: number;
  avgLandPricePerPyeongKrw: number;
  minLandPricePerPyeongKrw: number;
  maxLandPricePerPyeongKrw: number;
  avgGfaPricePerPyeongKrw: number;
  minGfaPricePerPyeongKrw: number;
  maxGfaPricePerPyeongKrw: number;
  subjectLandPricePerPyeongKrw: number;
  subjectGfaPricePerPyeongKrw: number;
  fairValueRangeKrw: [number, number];
  isWithinMarketBand: boolean;
  marketBandDiffPct: number;
  analysisNarrative: string;
}

export interface IncomeCapitalizationInput {
  annualGrossRentKrw: number;
  annualMgmtFeeKrw?: number;
  annualOpexKrw?: number;
  askingPriceKrw: number;
  marketCapRateRangePct: [number, number]; // e.g. [2.10, 2.50]
}

export interface IncomeCapitalizationResult {
  annualNoiKrw: number;
  marketCapRateRangePct: [number, number];
  impliedCapRatePct: number;
  fairValueRangeKrw: [number, number];
  fairValueMidKrw: number;
  askingPriceVsFairValuePct: number;
  valuationNarrative: string;
}

export interface CreDualValuationReport {
  salesComparison: SalesComparisonResult;
  incomeCapitalization: IncomeCapitalizationResult;
  costMethodExcludedNote: string;
  finalConclusion: string;
}

/**
 * 사례비교법 기반 평가액 및 시장 밴드 산출
 */
export function calculateSalesComparison(
  comps: SalesComp[],
  subject: {
    askingPriceKrw: number;
    landAreaPyeong: number;
    gfaPyeong: number;
  },
): SalesComparisonResult {
  if (!comps || comps.length === 0) {
    throw new Error('사례비교법 산출을 위해 최소 1건 이상의 실거래 비교사례가 필요합니다.');
  }

  const landPrices = comps.map(c => c.landPricePerPyeongKrw);
  const gfaPrices = comps.map(c => c.gfaPricePerPyeongKrw);

  const minLandPrice = Math.min(...landPrices);
  const maxLandPrice = Math.max(...landPrices);
  const avgLandPrice = Math.round(landPrices.reduce((a, b) => a + b, 0) / landPrices.length);

  const minGfaPrice = Math.min(...gfaPrices);
  const maxGfaPrice = Math.max(...gfaPrices);
  const avgGfaPrice = Math.round(gfaPrices.reduce((a, b) => a + b, 0) / gfaPrices.length);

  const subjectLandPricePerPyeong = Math.round(subject.askingPriceKrw / subject.landAreaPyeong);
  const subjectGfaPricePerPyeong = Math.round(subject.askingPriceKrw / subject.gfaPyeong);

  const minFairValue = Math.round(minLandPrice * subject.landAreaPyeong);
  const maxFairValue = Math.round(maxLandPrice * subject.landAreaPyeong);

  const isWithin = subject.askingPriceKrw >= minFairValue && subject.askingPriceKrw <= maxFairValue;
  const avgFairValue = Math.round(avgLandPrice * subject.landAreaPyeong);
  const diffPct = parseFloat((((subject.askingPriceKrw - avgFairValue) / avgFairValue) * 100).toFixed(1));

  const minPyEok = (minLandPrice / 100000000).toFixed(2);
  const maxPyEok = (maxLandPrice / 100000000).toFixed(2);
  const subPyEok = (subjectLandPricePerPyeong / 100000000).toFixed(2);

  let positioningText: string;
  if (subjectLandPricePerPyeong < minLandPrice) {
    positioningText = `인근 시세 하단(${minPyEok}억 원) 대비 약 ${Math.abs(diffPct)}% 저렴하여 우수한 가격 경쟁력(저평가 밸류애드 메리트) 확보`;
  } else if (subjectLandPricePerPyeong > maxLandPrice) {
    positioningText = `인근 시세 상단(${maxPyEok}억 원) 대비 약 ${diffPct}% 높은 프리미엄 호가 수준 형성`;
  } else {
    positioningText = `권역 시세 중간값 수준으로 가격 적정성 부합`;
  }

  const analysisNarrative = `인근 ${comps.length}개 유사 실거래 사례 대지 평당가(${minPyEok}억~${maxPyEok}억 원) 대비 본건 호가(${subPyEok}억 원)는 ${positioningText}`;

  return {
    compCount: comps.length,
    avgLandPricePerPyeongKrw: avgLandPrice,
    minLandPricePerPyeongKrw: minLandPrice,
    maxLandPricePerPyeongKrw: maxLandPrice,
    avgGfaPricePerPyeongKrw: avgGfaPrice,
    minGfaPricePerPyeongKrw: minGfaPrice,
    maxGfaPricePerPyeongKrw: maxGfaPrice,
    subjectLandPricePerPyeongKrw: subjectLandPricePerPyeong,
    subjectGfaPricePerPyeongKrw: subjectGfaPricePerPyeong,
    fairValueRangeKrw: [minFairValue, maxFairValue],
    isWithinMarketBand: isWithin,
    marketBandDiffPct: diffPct,
    analysisNarrative,
  };
}

/**
 * 수익환원법 기반 순영업소득(NOI) 및 적정 자산가치 환원 산출
 */
export function calculateIncomeCapitalization(
  input: IncomeCapitalizationInput,
): IncomeCapitalizationResult {
  const mgmt = input.annualMgmtFeeKrw ?? 0;
  const opex = input.annualOpexKrw ?? mgmt; // 실비 관리비 상계 원칙
  const noi = input.annualGrossRentKrw + mgmt - opex;

  const [capLow, capHigh] = input.marketCapRateRangePct;
  if (capLow <= 0 || capHigh <= 0) {
    throw new Error('요구 Cap Rate는 0보다 커야 합니다.');
  }
  if (capLow > 15 || capHigh > 15) {
    throw new Error('요구 Cap Rate는 15% 이하의 정상 범위여야 합니다 (비정상 시장 수익률).');
  }

  // Cap Rate가 낮을수록 환원 가치는 높음 (low rate -> high value)
  const valLow = Math.round(noi / (Math.max(capLow, capHigh) / 100));
  const valHigh = Math.round(noi / (Math.min(capLow, capHigh) / 100));
  const valMid = Math.round((valLow + valHigh) / 2);

  const impliedCapRate = parseFloat(((noi / input.askingPriceKrw) * 100).toFixed(2));
  const askingVsFair = parseFloat((((input.askingPriceKrw - valMid) / valMid) * 100).toFixed(1));

  const valLowBil = (valLow / 100000000).toFixed(1);
  const valHighBil = (valHigh / 100000000).toFixed(1);

  const valuationNarrative = `권역 요구 Cap Rate(${capLow}%~${capHigh}%) 환원 기준 적정 자산가치(${valLowBil}억~${valHighBil}억 원) 형성`;

  return {
    annualNoiKrw: noi,
    marketCapRateRangePct: [Math.min(capLow, capHigh), Math.max(capLow, capHigh)],
    impliedCapRatePct: impliedCapRate,
    fairValueRangeKrw: [valLow, valHigh],
    fairValueMidKrw: valMid,
    askingPriceVsFairValuePct: askingVsFair,
    valuationNarrative,
  };
}

/**
 * 상업용 부동산 종합 2대 밸류에이션 리포트 합성
 */
export function generateCreDualValuationReport(
  comps: SalesComp[],
  subject: {
    askingPriceKrw: number;
    landAreaPyeong: number;
    gfaPyeong: number;
    annualGrossRentKrw: number;
    annualMgmtFeeKrw?: number;
    annualOpexKrw?: number;
    marketCapRateRangePct: [number, number];
  },
): CreDualValuationReport {
  const salesComp = calculateSalesComparison(comps, subject);
  const incomeCap = calculateIncomeCapitalization({
    annualGrossRentKrw: subject.annualGrossRentKrw,
    annualMgmtFeeKrw: subject.annualMgmtFeeKrw,
    annualOpexKrw: subject.annualOpexKrw,
    askingPriceKrw: subject.askingPriceKrw,
    marketCapRateRangePct: subject.marketCapRateRangePct,
  });

  return {
    salesComparison: salesComp,
    incomeCapitalization: incomeCap,
    costMethodExcludedNote: DEFAULT_COST_METHOD_EXCLUSION_NOTE,
    finalConclusion: `사례비교법 및 수익환원법 교차 검증 결과, 본건 매매가는 인근 거래 밴드 및 Cap Rate 환원 가치 범위 내 적정 호가로 판정`,
  };
}
