/**
 * D37 P0-2: FinancialCalculator — 계산 엔진을 LLM 밖으로
 *
 * 기존 financials.ts의 결정론적 Strategy 계산을 Claim 기반으로 감싸는 어댑터.
 * 모든 계산 결과가 ClaimRegistry에 등록되므로:
 * - 전 면이 같은 Claim 참조 → V4 4면/10면 모순 불가
 * - LLM은 Claim 참조 설명만 → 새 숫자 생성 불가
 * - basis='NOI' + deductions=0 → G38 구조적 차단
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-2
 */

import { randomUUID } from 'crypto';
import type { InvestmentPosture } from '@/domain/ontology/enums';
import { sqmToPyeong, pyeongToSqm, SQM_RATIO } from '@/lib/utils/area-conversion';
import { getAssumptions } from '../assumptions';
import { ClaimRegistry, type CreateClaimOptions } from './claim-registry';
import { validateCalculation, type Calculation, type Deduction, type YieldBasis } from './calculation';
import type { Claim } from './claim';

// ── Occupancy & Financial Types ──

export interface OccupancySpec {
  headcount?: number;
  targetHeadcount?: number;
  areaPerHeadPyung?: number;
  desiredFloors?: string;
  currentRentManwon?: number;
  currentRentMonthlyManwon?: number;
  monthly_revenue_manwon?: number;
}

export interface FinancialInputs {
  posture?: InvestmentPosture;
  monthlyRentKrw?: number;
  purchasePriceKrw: number;
  askingPriceManwon?: number;
  annualRentManwon?: number;
  annualNoiManwon?: number;
  gopKrw?: number;
  landPricePerPyeong?: number;
  devProfitMarginPct?: number;
  marketDiscountPct?: number;
  /** 운영비율 (%) — 미입력 시 자산 유형별 자동 산출 */
  opexRatioPct?: number;
  /** 보유 기간 (년) — 기본 5년 */
  holdYears?: number;
  /** 공실률 (%) — 기본 5% */
  vacancyRatePct?: number;
  /** 연 임대료 상승률 (%) — 기본 2% */
  rentGrowthPctPerYear?: number;
  /** ㎡당 개별공시지가 (원) */
  landPricePerSqm?: number;
  /** 건물 연면적 (㎡) */
  totalAreaSqm?: number;
  /** 대지면적 (㎡) — 대지 가치 비중 계산용 */
  platAreaSqm?: number;
  /** 자산 유형 — 한국어 포함 */
  assetType?: string;
  totalDepositManwon?: number;
  mgmtFeeTotalManwon?: number;
  loanAmountManwon?: number;

  // ── Development 전용 파라미터 ──
  constructionCostPerPyeong?: number;
  targetGrossAreaPyeong?: number;
  expectedSalesPricePerPyeong?: number;
  devHoldMonthlyRentManwon?: number;

  // ── Operating 전용 파라미터 ──
  annualRevenueKrw?: number;
  gopMarginPct?: number;
  adrKrw?: number;
  occPct?: number;

  // ── OwnerOccupied 전용 파라미터 ──
  marketRentPerPyeongKrw?: number;
  selfUseAreaPyeong?: number;
  currentRentManwon?: number;
  currentRentMonthlyManwon?: number;
  occupancySpec?: OccupancySpec;

  // ── Trading 전용 파라미터 ──
  comparablePricePerPyeongKrw?: number;
  targetExitPriceKrw?: number;
  isBasicMode?: boolean;
}

export interface DCFInputs {
  purchasePriceKrw: number;
  initialNoiKrw: number;
  holdYears?: number;
  exitCapRate: number;
  discountRate: number;
  rentGrowthRate: number;
}

export interface SensitivityMatrixCell {
  rentGrowthRate: number;
  discountRate: number;
  npv: number;
  irr: number | null;
}

export interface DCFOutputs {
  npvBase: number;
  irrBase: number | null;
  cashFlows: number[];
  sensitivityMatrix: SensitivityMatrixCell[];
}

export interface FinancialOutputs {
  annualNoi: { best: number; base: number; worst: number };
  capRate: { best: number; base: number; worst: number } | null;
  irr5Year: { best: number; base: number; worst: number } | null;
  pricePerSqm: number | null;
  pricePerPyeong: number | null;
  landValueRatio: number | null;
  landValueRatioNote: string | null;
  yieldOnCost: number | null;
  totalDepositBil: number | null;
  loanAmountBil: number | null;
  equityRequired: number | null;
  leveragedYield: number | null;
  dcf10Year: DCFOutputs | null;
  wacc: number | null;
  disclaimer: string;

  // Phase 3 취득원가 4줄 내역 & 역레버리지
  totalAcquisitionCostBil?: number | null;
  acquisitionTaxBil?: number | null;
  brokerFeeBil?: number | null;
  negativeLeverage?: boolean | null;
  negativeLeverageWarning?: string | null;
  opexSource?: 'user' | 'assumed';
  regulationExpiry?: string | null;
  regulationDaysLeft?: number | null;

  // 포스처 확장 필드
  posture?: InvestmentPosture;
  estConstructionCostBil?: number | null;
  constructionCostBil?: number | null;
  totalProjectCostBil?: number | null;
  expectedSalesRevenueBil?: number | null;
  devProfitMarginPct?: number | null;
  landPricePerPyeong?: number | null;
  landCostRatioPct?: number | null;
  devHoldYieldPct?: number | null;

  annualGopBil?: number | null;
  gopMarginPct?: number | null;
  adrKrw?: number | null;
  occPct?: number | null;
  revparKrw?: number | null;
  gopCapRatePct?: number | null;

  ownVsLeaseSavingsBil?: number | null;
  breakevenYears?: number | null;
  occupancyCostPerPyeongMonthly?: number | null;

  marketDiscountPct?: number | null;
  targetHprPct?: number | null;
  targetCapitalGainBil?: number | null;
  isBasicMode?: boolean;

  grossYieldOnEquity: number | null;
  grossYieldStabilized: number | null;
  annualRentBil: number | null;
}

// ── Pure Math / DCF Calculations ──

export function calculateIRR(cashFlows: number[]): number | null {
  if (!cashFlows || cashFlows.length < 2) return null;
  let rate = 0.08;
  for (let iter = 0; iter < 150; iter++) {
    if (rate <= -0.99) return null;
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const pv = cashFlows[t] / Math.pow(1 + rate, t);
      npv += pv;
      dnpv -= (t * pv) / (1 + rate);
    }
    if (Math.abs(npv) < 1) {
      return Math.round(rate * 1000) / 10;
    }
    if (Math.abs(dnpv) < 0.001) break;
    const next = rate - npv / dnpv;
    if (!Number.isFinite(next) || next < -0.99 || next > 20) return null;
    rate = next;
  }
  return null;
}

export function calculateDCFScenario(inputs: DCFInputs): { npv: number; irr: number | null; cashFlows: number[] } {
  const { purchasePriceKrw, initialNoiKrw, holdYears = 10, exitCapRate, discountRate, rentGrowthRate } = inputs;
  const cashFlows = [-purchasePriceKrw];
  let npv = -purchasePriceKrw;

  const safeExitCapRate = exitCapRate > 0 ? exitCapRate : 0.05;
  const safeDiscountRate = discountRate > -0.99 ? discountRate : 0.08;

  for (let y = 1; y <= holdYears; y++) {
    const periodNoi = initialNoiKrw * Math.pow(1 + rentGrowthRate, y - 1);
    let cashFlow = periodNoi;
    if (y === holdYears) {
      const exitValue = safeExitCapRate > 0 ? periodNoi / safeExitCapRate : 0;
      cashFlow += exitValue;
    }
    cashFlows.push(cashFlow);
    const denom = Math.pow(1 + safeDiscountRate, y);
    npv += denom !== 0 ? cashFlow / denom : 0;
  }

  const irr = calculateIRR(cashFlows);
  return { npv: Number.isFinite(npv) ? npv : 0, irr, cashFlows };
}

export function generateDCFSensitivity(inputs: Omit<DCFInputs, 'exitCapRate' | 'discountRate'> & { baseExitCapRate: number; baseDiscountRate: number }): DCFOutputs {
  const { purchasePriceKrw, initialNoiKrw, holdYears = 10, rentGrowthRate, baseExitCapRate, baseDiscountRate } = inputs;

  const baseScenario = calculateDCFScenario({
    purchasePriceKrw,
    initialNoiKrw,
    holdYears,
    exitCapRate: baseExitCapRate,
    discountRate: baseDiscountRate,
    rentGrowthRate,
  });

  const matrix: SensitivityMatrixCell[] = [];
  const growthRateOffsets = [-0.01, 0, 0.01];
  const discountRateOffsets = [-0.01, 0, 0.01];

  for (const drOffset of discountRateOffsets) {
    for (const growthOffset of growthRateOffsets) {
      const currentGrowth = rentGrowthRate + growthOffset;
      const currentDR = baseDiscountRate + drOffset;
      const scenario = calculateDCFScenario({
        purchasePriceKrw,
        initialNoiKrw,
        holdYears,
        exitCapRate: baseExitCapRate,
        discountRate: currentDR,
        rentGrowthRate: currentGrowth,
      });
      matrix.push({
        rentGrowthRate: currentGrowth,
        discountRate: currentDR,
        npv: scenario.npv,
        irr: scenario.irr,
      });
    }
  }

  return {
    npvBase: baseScenario.npv,
    irrBase: baseScenario.irr,
    cashFlows: baseScenario.cashFlows,
    sensitivityMatrix: matrix,
  };
}

export function calculateWACC(equityRatio: number, costOfEquity: number, debtRatio: number, costOfDebt: number, taxRate: number = 0.22): number {
  const afterTaxCostOfDebt = costOfDebt * (1 - taxRate);
  return (equityRatio * costOfEquity) + (debtRatio * afterTaxCostOfDebt);
}

function getOpexRatio(assetType?: string): number {
  if (!assetType) return 0.18;
  const t = assetType.toLowerCase();
  if (t.includes('오피스') || t.includes('office') || t.includes('업무')) return 0.15;
  if (t.includes('상가') || t.includes('근린') || t.includes('리테일')) return 0.20;
  if (t.includes('지식산업') || t.includes('지산')) return 0.22;
  if (t.includes('물류') || t.includes('창고') || t.includes('데이터센터')) return 0.12;
  if (t.includes('꼬마') || t.includes('빌딩') || t.includes('주상복합')) return 0.18;
  if (t.includes('호텔') || t.includes('숙박') || t.includes('생활형숙박') || t.includes('레지던스')) return 0.25;
  if (t.includes('원룸') || t.includes('다세대') || t.includes('다가구') || t.includes('오피스텔')) return 0.15;
  if (t.includes('병원') || t.includes('의료') || t.includes('요양')) return 0.22;
  if (t.includes('주유소') || t.includes('세차')) return 0.10;
  if (t.includes('교육') || t.includes('학원')) return 0.20;
  return 0.18;
}

// ── Posture Calculation Engines ──

function calculateIncomePosture(inputs: FinancialInputs): FinancialOutputs {
  const {
    monthlyRentKrw = 0,
    purchasePriceKrw,
    holdYears = 5,
    vacancyRatePct = getAssumptions(inputs.assetType).vacancyReservePct,
    rentGrowthPctPerYear = getAssumptions(inputs.assetType).annualRentGrowthPct,
    landPricePerSqm,
    totalAreaSqm,
    platAreaSqm,
    assetType,
    totalDepositManwon,
    mgmtFeeTotalManwon,
    loanAmountManwon,
  } = inputs;

  const opexRatio = inputs.opexRatioPct != null
    ? inputs.opexRatioPct / 100
    : getOpexRatio(assetType);
  const vacancyRate = vacancyRatePct / 100;
  const rentGrowth = rentGrowthPctPerYear / 100;

  const annualMgmtFee = (mgmtFeeTotalManwon ?? 0) * 10000 * 12;
  const annualGross = monthlyRentKrw * 12;

  const effectiveOpex = annualMgmtFee > 0
    ? annualMgmtFee
    : annualGross * opexRatio;
  const effectiveOpexHigh = annualMgmtFee > 0
    ? annualMgmtFee * 1.15
    : annualGross * (opexRatio + 0.03);

  const noiBest  = annualGross - (annualMgmtFee > 0 ? annualMgmtFee * 0.9 : annualGross * Math.max(0, opexRatio - 0.02));
  const noiBase  = annualGross * (1 - vacancyRate) - effectiveOpex;
  const noiWorst = annualGross * (1 - Math.min(0.20, vacancyRate * 2)) - effectiveOpexHigh;

  let capRate: { best: number; base: number; worst: number } | null = null;
  if (purchasePriceKrw > 0 && noiBase > 0) {
    capRate = {
      best:  parseFloat(((noiBest  / purchasePriceKrw) * 100).toFixed(2)),
      base:  parseFloat(((noiBase  / purchasePriceKrw) * 100).toFixed(2)),
      worst: parseFloat(((noiWorst / purchasePriceKrw) * 100).toFixed(2)),
    };
  }

  let irr5Year: { best: number; base: number; worst: number } | null = null;
  if (purchasePriceKrw > 0 && noiBase > 0) {
    const entryCapBase = capRate ? capRate.base / 100 : getAssumptions(assetType).entryCapBase;
    const exitCapBest  = entryCapBase + 0.0025;
    const exitCapBase  = entryCapBase + 0.005;
    const exitCapWorst = entryCapBase + 0.01;

    const buildCFs = (startNoi: number, growth: number, exitCap: number): number[] => {
      const cfs = [-purchasePriceKrw];
      for (let y = 1; y <= holdYears; y++) {
        const periodNoi = startNoi * Math.pow(1 + growth, y - 1);
        const exitValue = y === holdYears ? periodNoi / exitCap : 0;
        cfs.push(periodNoi + exitValue);
      }
      return cfs;
    };

    const irrBase  = calculateIRR(buildCFs(noiBase,  rentGrowth,          exitCapBase));
    const irrBest  = calculateIRR(buildCFs(noiBest,  rentGrowth + 0.01,   exitCapBest));
    const irrWorst = calculateIRR(buildCFs(noiWorst, Math.max(0, rentGrowth - 0.01), exitCapWorst));

    if (irrBase !== null) {
      irr5Year = {
        best:  irrBest  ?? irrBase + 1.5,
        base:  irrBase,
        worst: irrWorst ?? Math.max(0, irrBase - 2.0),
      };
    }
  }

  const pricePerSqm = (purchasePriceKrw > 0 && totalAreaSqm && totalAreaSqm > 0)
    ? Math.round(purchasePriceKrw / totalAreaSqm) : null;
  const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * SQM_RATIO) : null;

  const landPriceTotal = platAreaSqm && landPricePerSqm ? platAreaSqm * landPricePerSqm : 0;
  const landValueRatio = (purchasePriceKrw > 0 && landPriceTotal > 0 && platAreaSqm)
    ? parseFloat(((landPriceTotal / purchasePriceKrw) * 100).toFixed(1))
    : null;
  const landValueRatioNote: string | null = landValueRatio === null
    ? !platAreaSqm ? "대지가치 미산출 — 대지면적(공부 확인 필요)" : !landPricePerSqm ? "대지가치 미산출 — 공시지가 데이터 확인 필요" : null
    : null;

  const yieldOnCost = (purchasePriceKrw > 0 && monthlyRentKrw > 0)
    ? parseFloat(((annualGross / purchasePriceKrw) * 100).toFixed(2))
    : null;

  const depositKrw = (totalDepositManwon ?? 0) * 10000;
  const loanKrw = (loanAmountManwon ?? 0) * 10000;
  const totalDepositBil = depositKrw > 0 ? parseFloat((depositKrw / 1e8).toFixed(1)) : null;
  const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;

  const taxRate = 0.046;
  const brokerRate = 0.009;
  const acquisitionTaxKrw = purchasePriceKrw * taxRate;
  const brokerFeeKrw = purchasePriceKrw * brokerRate;
  const totalAcquisitionCostKrw = purchasePriceKrw + acquisitionTaxKrw + brokerFeeKrw;

  const totalAcquisitionCostBil = purchasePriceKrw > 0 ? parseFloat((totalAcquisitionCostKrw / 1e8).toFixed(1)) : null;
  const acquisitionTaxBil = purchasePriceKrw > 0 ? parseFloat((acquisitionTaxKrw / 1e8).toFixed(2)) : null;
  const brokerFeeBil = purchasePriceKrw > 0 ? parseFloat((brokerFeeKrw / 1e8).toFixed(2)) : null;

  const pureEquityKrw = purchasePriceKrw - depositKrw - loanKrw;
  const defaultLoanRatePct = 4.5;
  const annualInterestKrw = loanKrw > 0 ? loanKrw * (defaultLoanRatePct / 100) : 0;
  const netCashFlowKrw = noiBase - annualInterestKrw;
  const leveragedYield = (pureEquityKrw > 0 && noiBase > 0)
    ? parseFloat(((netCashFlowKrw / pureEquityKrw) * 100).toFixed(2))
    : null;

  // 취득 부대비용 포함 총 필요 실투자금
  const equityKrw = totalAcquisitionCostKrw - depositKrw - loanKrw;
  const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : (pureEquityKrw > 0 ? parseFloat((pureEquityKrw / 1e8).toFixed(1)) : null);

  // Phase 3: 역레버리지 검사 (대출금리 > 총수익률)
  // loanKrw가 0이더라도, 총수익률이 시장 대출금리보다 낮으면 잠재적 역레버리지 경고
  const isExplicitNegativeLeverage = !!(yieldOnCost !== null && yieldOnCost < defaultLoanRatePct && loanKrw > 0);
  const isPotentialNegativeLeverage = !!(yieldOnCost !== null && yieldOnCost < defaultLoanRatePct && loanKrw === 0);
  const isNegativeLeverage = isExplicitNegativeLeverage || isPotentialNegativeLeverage;
  const negativeLeverageWarning = isExplicitNegativeLeverage
    ? `대출금리(연 ${defaultLoanRatePct}%)가 총수익률(${yieldOnCost}%)보다 높아 대출 실행 시 자기자본수익률이 하락하는 역레버리지 구간입니다.`
    : isPotentialNegativeLeverage
    ? `총수익률(${yieldOnCost}%)이 통상 대출금리(연 ${defaultLoanRatePct}%)보다 낮아, 대출 활용 시 역레버리지가 발생합니다. 무차입 기준 수익률을 표기합니다.`
    : null;

  let wacc: number | null = null;
  const rawDebtRatio = purchasePriceKrw > 0 ? (loanKrw + depositKrw) / purchasePriceKrw : 0;
  const debtRatio = Math.min(Math.max(rawDebtRatio, 0), 1);
  const equityRatio = Math.max(1 - debtRatio, 0);
  if (purchasePriceKrw > 0) {
    wacc = calculateWACC(equityRatio, 0.08, debtRatio, 0.05, 0.22);
  }

  let dcf10Year: DCFOutputs | null = null;
  if (purchasePriceKrw > 0 && noiBase > 0 && wacc !== null) {
    const exitCapRate = capRate ? (capRate.base + 0.5) / 100 : 0.045;
    dcf10Year = generateDCFSensitivity({
      purchasePriceKrw,
      initialNoiKrw: noiBase,
      holdYears: 10,
      rentGrowthRate: rentGrowth,
      baseExitCapRate: exitCapRate,
      baseDiscountRate: wacc,
    });
  }

  // PPTX A23 전용: 한국식 표면 임대수익률
  const denominatorForYield = purchasePriceKrw - depositKrw;
  const grossYieldOnEquity = (denominatorForYield > 0 && annualGross > 0)
    ? parseFloat(((annualGross / denominatorForYield) * 100).toFixed(2))
    : null;
  const stabilizedAnnualGross = vacancyRate > 0 && vacancyRate < 1
    ? annualGross / (1 - vacancyRate)
    : annualGross;
  const grossYieldStabilized = (denominatorForYield > 0 && stabilizedAnnualGross > 0 && vacancyRate > 0)
    ? parseFloat(((stabilizedAnnualGross / denominatorForYield) * 100).toFixed(2))
    : null;
  const annualRentBil = annualGross / 1e8;

  return {
    posture: 'income',
    annualNoi: {
      best: Math.round(noiBest),
      base: Math.round(noiBase),
      worst: Math.round(noiWorst),
    },
    capRate,
    irr5Year,
    pricePerSqm,
    pricePerPyeong,
    landValueRatio,
    landValueRatioNote,
    yieldOnCost,
    totalDepositBil,
    loanAmountBil,
    equityRequired,
    leveragedYield,
    dcf10Year,
    wacc,
    disclaimer: 'AI 추정값 (참고용). 실제 수익은 임대차 조건·공실률·세금에 따라 상이합니다.',
    totalAcquisitionCostBil,
    acquisitionTaxBil,
    brokerFeeBil,
    negativeLeverage: isNegativeLeverage,
    negativeLeverageWarning,
    opexSource: inputs.opexRatioPct != null || (inputs.mgmtFeeTotalManwon ?? 0) > 0 ? 'user' : 'assumed',
    isBasicMode: inputs.isBasicMode,
    grossYieldOnEquity,
    grossYieldStabilized,
    annualRentBil,
  };

}

function calculateDevelopmentPosture(inputs: FinancialInputs): FinancialOutputs {
  const purchasePrice = inputs.purchasePriceKrw || 0;
  const platArea = inputs.platAreaSqm || 0;
  const platPyeong = sqmToPyeong(platArea);

  const landPricePerPyeong = (purchasePrice > 0 && platPyeong > 0)
    ? Math.round((purchasePrice / 10000) / platPyeong)
    : null;

  const constCostPerPyeong = inputs.constructionCostPerPyeong
    ?? (12_000_000 / 10000); 
  const targetGrossPyeong = inputs.targetGrossAreaPyeong ?? (platPyeong > 0 ? platPyeong * 4 : 500); 
  const estConstructionCostKrw = targetGrossPyeong * constCostPerPyeong * 10000;
  const contingencyRate = 0.05;
  const otherProjectCostKrw = (purchasePrice + estConstructionCostKrw) * contingencyRate; 
  const totalProjectCostKrw = purchasePrice + estConstructionCostKrw + otherProjectCostKrw;
  const totalProjectCostBil = totalProjectCostKrw > 0 ? parseFloat((totalProjectCostKrw / 1e8).toFixed(1)) : null;

  const salesPricePerPyeong = inputs.expectedSalesPricePerPyeong ?? (landPricePerPyeong ? landPricePerPyeong * 1.4 : 3500);
  const expectedSalesRevenueKrw = targetGrossPyeong * salesPricePerPyeong * 10000;
  const expectedSalesRevenueBil = expectedSalesRevenueKrw > 0 ? parseFloat((expectedSalesRevenueKrw / 1e8).toFixed(1)) : null;

  const holdMonthlyRentManwon = inputs.devHoldMonthlyRentManwon ?? 0;
  const holdAnnualRentKrw = holdMonthlyRentManwon * 12 * 10000;
  const devHoldYieldPct = (holdAnnualRentKrw > 0 && totalProjectCostKrw > 0)
    ? parseFloat(((holdAnnualRentKrw / totalProjectCostKrw) * 100).toFixed(2))
    : null;

  const devProfitKrw = expectedSalesRevenueKrw - totalProjectCostKrw;
  const devProfitMarginPct = totalProjectCostKrw > 0
    ? parseFloat(((devProfitKrw / totalProjectCostKrw) * 100).toFixed(1))
    : null;

  const landCostRatioPct = totalProjectCostKrw > 0
    ? parseFloat(((purchasePrice / totalProjectCostKrw) * 100).toFixed(1))
    : null;

  const equityRequired = parseFloat((purchasePrice / 1e8).toFixed(1)); 

  const regulationExpiry = '2028-05-18';
  const expiryDate = new Date(regulationExpiry);
  const today = new Date();
  const regulationDaysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    posture: 'development',
    annualNoi: { best: 0, base: 0, worst: 0 },
    capRate: null,
    irr5Year: null,
    pricePerSqm: (purchasePrice > 0 && platArea > 0) ? Math.round(purchasePrice / platArea) : null,
    pricePerPyeong: landPricePerPyeong ? landPricePerPyeong * 10000 : null,
    landValueRatio: 100,
    landValueRatioNote: "신축/개발 부지 — 토지 매입가 100% 반영",
    yieldOnCost: devProfitMarginPct,
    totalDepositBil: null,
    loanAmountBil: null,
    equityRequired,
    leveragedYield: null,
    dcf10Year: null,
    wacc: null,
    estConstructionCostBil: parseFloat((estConstructionCostKrw / 1e8).toFixed(1)),
    constructionCostBil: parseFloat((estConstructionCostKrw / 1e8).toFixed(1)),
    totalProjectCostBil,
    expectedSalesRevenueBil,
    devProfitMarginPct,
    landPricePerPyeong,
    landCostRatioPct,
    devHoldYieldPct,
    regulationExpiry,
    regulationDaysLeft,
    disclaimer: 'AI 건축 규모 검토 및 사업수지 추정값 (참고용). 인허가 및 시공 조건에 따라 변동될 수 있습니다.',
    grossYieldOnEquity: null,
    grossYieldStabilized: null,
    annualRentBil: null,
  };
}

function calculateOperatingPosture(inputs: FinancialInputs): FinancialOutputs {
  const purchasePrice = inputs.purchasePriceKrw || 0;
  const annualRevenue = inputs.annualRevenueKrw ?? ((inputs.monthlyRentKrw ?? 0) * 12);
  const gopMargin = (inputs.gopMarginPct ?? 35) / 100;

  const annualGopKrw = annualRevenue * gopMargin;
  const annualGopBil = annualGopKrw > 0 ? parseFloat((annualGopKrw / 1e8).toFixed(1)) : null;
  const gopMarginPct = inputs.gopMarginPct ?? 35;

  const gopCapRatePct = (purchasePrice > 0 && annualGopKrw > 0)
    ? parseFloat(((annualGopKrw / purchasePrice) * 100).toFixed(2))
    : null;

  const adrKrw = inputs.adrKrw ?? null;
  const occPct = inputs.occPct ?? null;
  const revparKrw = (adrKrw && occPct) ? Math.round(adrKrw * (occPct / 100)) : null;

  const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
    ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
  const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * SQM_RATIO) : null;

  const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
  const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
  const equityKrw = purchasePrice - loanKrw;
  const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;

  return {
    posture: 'operating',
    annualNoi: { best: Math.round(annualGopKrw * 1.1), base: Math.round(annualGopKrw), worst: Math.round(annualGopKrw * 0.9) },
    capRate: gopCapRatePct ? { best: gopCapRatePct * 1.1, base: gopCapRatePct, worst: gopCapRatePct * 0.9 } : null,
    irr5Year: null,
    pricePerSqm,
    pricePerPyeong,
    landValueRatio: null,
    landValueRatioNote: "운영형 자산 — GOP 및 객단가/가동률 분석 적용",
    yieldOnCost: null,
    totalDepositBil: null,
    loanAmountBil,
    equityRequired,
    leveragedYield: null,
    dcf10Year: null,
    wacc: null,
    annualGopBil,
    gopMarginPct,
    adrKrw,
    occPct,
    revparKrw,
    gopCapRatePct,
    disclaimer: 'AI 직영 운영 지표 추정값 (참고용). 매출·가동률·운영비에 따라 변동될 수 있습니다.',
    grossYieldOnEquity: null,
    grossYieldStabilized: null,
    annualRentBil: null,
  };
}

function calculateOwnerOccupiedPosture(inputs: FinancialInputs): FinancialOutputs {
  const purchasePrice = inputs.purchasePriceKrw || 0;
  const totalAreaPyeong = sqmToPyeong(inputs.totalAreaSqm || 0);
  const selfUseAreaPyeong = inputs.selfUseAreaPyeong ?? (totalAreaPyeong > 0 ? totalAreaPyeong : 100);

  const currentRentManwon = inputs.currentRentMonthlyManwon
    ?? inputs.currentRentManwon
    ?? inputs.occupancySpec?.currentRentManwon
    ?? inputs.occupancySpec?.currentRentMonthlyManwon;
  const currentRentMonthlyKrw = currentRentManwon ? currentRentManwon * 10000 : null;

  const marketRentPerPyeong = inputs.marketRentPerPyeongKrw ?? 70000;
  const virtualAnnualRentKrw = currentRentMonthlyKrw
    ? currentRentMonthlyKrw * 12
    : marketRentPerPyeong * selfUseAreaPyeong * 12;
  const annualRentalIncomeKrw = (inputs.monthlyRentKrw ?? 0) * 12;

  const loanKrw = inputs.loanAmountManwon ? inputs.loanAmountManwon * 10000 : 0;
  const loanRate = 0.045;
  const annualDebtServiceKrw = loanKrw * loanRate;
  const ownVsLeaseSavingsKrw = (virtualAnnualRentKrw + annualRentalIncomeKrw) - annualDebtServiceKrw;
  const ownVsLeaseSavingsBil = parseFloat((ownVsLeaseSavingsKrw / 1e8).toFixed(1));

  const equityKrw = purchasePrice - loanKrw;
  const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;
  const breakevenYears = (equityKrw > 0 && ownVsLeaseSavingsKrw > 0)
    ? parseFloat((equityKrw / ownVsLeaseSavingsKrw).toFixed(1))
    : null;

  const monthlyMgmtFeeKrw = (inputs.mgmtFeeTotalManwon ?? 0) * 10000;
  const occupancyCostPerPyeongMonthly = selfUseAreaPyeong > 0
    ? Math.round((annualDebtServiceKrw / 12 + monthlyMgmtFeeKrw) / selfUseAreaPyeong)
    : null;

  const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
    ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
  const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * SQM_RATIO) : null;

  const acqTaxRate = 0.046;
  const brokerFeeRate = 0.009;
  const acquisitionTaxKrw = purchasePrice * acqTaxRate;
  const brokerFeeKrw = purchasePrice * brokerFeeRate;
  const totalAcquisitionCostKrw = purchasePrice + acquisitionTaxKrw + brokerFeeKrw;
  const totalAcquisitionCostBil = parseFloat((totalAcquisitionCostKrw / 1e8).toFixed(2));
  const acquisitionTaxBil = parseFloat((acquisitionTaxKrw / 1e8).toFixed(2));
  const brokerFeeBil = parseFloat((brokerFeeKrw / 1e8).toFixed(2));
  const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;

  return {
    posture: 'owner_occupied',
    annualNoi: { best: 0, base: 0, worst: 0 },
    capRate: null,
    irr5Year: null,
    pricePerSqm,
    pricePerPyeong,
    landValueRatio: null,
    landValueRatioNote: "자가사용형 자산 — 사옥 실입주 임차 대비 절감액 분석 적용",
    yieldOnCost: null,
    totalDepositBil: null,
    totalAcquisitionCostBil,
    acquisitionTaxBil,
    brokerFeeBil,
    loanAmountBil,
    equityRequired,
    leveragedYield: null,
    dcf10Year: null,
    wacc: null,
    ownVsLeaseSavingsBil,
    breakevenYears,
    occupancyCostPerPyeongMonthly,
    disclaimer: 'AI 사옥용 비용비교 추정값 (참고용). 시장 임대료 및 금융 조건에 따라 상이할 수 있습니다.',
    grossYieldOnEquity: null,
    grossYieldStabilized: null,
    annualRentBil: null,
  };
}

function calculateTradingPosture(inputs: FinancialInputs): FinancialOutputs {
  const purchasePrice = inputs.purchasePriceKrw || 0;

  const pricePerSqm = (purchasePrice > 0 && inputs.totalAreaSqm && inputs.totalAreaSqm > 0)
    ? Math.round(purchasePrice / inputs.totalAreaSqm) : null;
  const pricePerPyeong = pricePerSqm ? Math.round(pricePerSqm * SQM_RATIO) : null;

  const comparablePricePerPyeong = inputs.comparablePricePerPyeongKrw
    ? Math.round(inputs.comparablePricePerPyeongKrw / 10000)
    : (pricePerPyeong ? Math.round((pricePerPyeong / 10000) * 1.15) : null);

  const marketDiscountPct = (pricePerPyeong && comparablePricePerPyeong && comparablePricePerPyeong > 0)
    ? parseFloat((((comparablePricePerPyeong * 10000 - pricePerPyeong) / (comparablePricePerPyeong * 10000)) * 100).toFixed(1))
    : null;

  const targetExitPrice = inputs.targetExitPriceKrw ?? (purchasePrice > 0 ? purchasePrice * 1.2 : 0);
  const targetCapitalGainKrw = targetExitPrice - purchasePrice;
  const targetCapitalGainBil = targetCapitalGainKrw > 0 ? parseFloat((targetCapitalGainKrw / 1e8).toFixed(1)) : null;

  const loanKrw = (inputs.loanAmountManwon ?? 0) * 10000;
  const equityKrw = purchasePrice - loanKrw;
  const targetHprPct = (equityKrw > 0 && targetCapitalGainKrw > 0)
    ? parseFloat(((targetCapitalGainKrw / equityKrw) * 100).toFixed(1))
    : null;

  const loanAmountBil = loanKrw > 0 ? parseFloat((loanKrw / 1e8).toFixed(1)) : null;
  const equityRequired = equityKrw > 0 ? parseFloat((equityKrw / 1e8).toFixed(1)) : null;

  return {
    posture: 'trading',
    annualNoi: { best: 0, base: 0, worst: 0 },
    capRate: null,
    irr5Year: null,
    pricePerSqm,
    pricePerPyeong,
    landValueRatio: null,
    landValueRatioNote: "단기매매형 자산 — 비교사례 및 마켓 갭(할인율) 분석 적용",
    yieldOnCost: null,
    totalDepositBil: null,
    loanAmountBil,
    equityRequired,
    leveragedYield: null,
    dcf10Year: null,
    wacc: null,
    marketDiscountPct,
    targetHprPct,
    targetCapitalGainBil,
    disclaimer: 'AI 매매 시세차익 추정값 (참고용). 부동산 시장 주기 및 거래 시점에 따라 상이할 수 있습니다.',
    grossYieldOnEquity: null,
    grossYieldStabilized: null,
    annualRentBil: null,
  };
}

/**
 * 포스처별 고급 재무 지표를 순수 계산합니다.
 */
export function calculateFinancials(inputs: FinancialInputs): FinancialOutputs {
  const normalizedInputs: FinancialInputs = {
    ...inputs,
    purchasePriceKrw: inputs.purchasePriceKrw ?? (inputs.askingPriceManwon ? inputs.askingPriceManwon * 10000 : 0),
  };
  const posture = normalizedInputs.posture ?? 'income';
  switch (posture) {
    case 'development':
      return calculateDevelopmentPosture(normalizedInputs);
    case 'operating':
      return calculateOperatingPosture(normalizedInputs);
    case 'owner_occupied':
      return calculateOwnerOccupiedPosture(normalizedInputs);
    case 'trading':
      return calculateTradingPosture(normalizedInputs);
    case 'income':
    default:
      return calculateIncomePosture(normalizedInputs);
  }
}


// ── 계산 결과를 Claim으로 변환하는 매핑 ──

interface FinancialClaimSpec {
  subject: string;
  unit: string;
  extract: (out: FinancialOutputs) => number | null;
  /** 이 Claim이 계산 파생이면 수식 정보 */
  formula?: string;
  basis?: YieldBasis;
  /** NOI 기반 계산이면 deductions 추출 함수 */
  deductionsExtract?: (out: FinancialOutputs, inputs: FinancialInputs) => Deduction[];
}

const INCOME_CLAIM_SPECS: FinancialClaimSpec[] = [
  { subject: 'noi_base', unit: '원', extract: o => o.annualNoi?.base ?? null, formula: 'annual_gross * (1 - vacancy) - opex', basis: 'NOI',
    deductionsExtract: (o, i) => {
      const deductions: Deduction[] = [];
      if (i.mgmtFeeTotalManwon && i.mgmtFeeTotalManwon > 0) {
        deductions.push({ name: '관리비', amount: i.mgmtFeeTotalManwon * 10000 * 12 });
      }
      if (i.opexRatioPct != null) {
        const annualGross = (i.monthlyRentKrw ?? 0) * 12;
        deductions.push({ name: '운영비 (비율)', amount: annualGross * (i.opexRatioPct / 100) });
      }
      return deductions;
    },
  },
  { subject: 'noi_best', unit: '원', extract: o => o.annualNoi?.best ?? null, formula: 'annual_gross - opex_low', basis: 'NOI' },
  { subject: 'noi_worst', unit: '원', extract: o => o.annualNoi?.worst ?? null, formula: 'annual_gross * (1 - vacancy_high) - opex_high', basis: 'NOI' },
  { subject: 'cap_rate_base', unit: '%', extract: o => o.capRate?.base ?? null, formula: 'noi_base / asking_price * 100', basis: 'NOI' },
  { subject: 'cap_rate_best', unit: '%', extract: o => o.capRate?.best ?? null, formula: 'noi_best / asking_price * 100', basis: 'NOI' },
  { subject: 'cap_rate_worst', unit: '%', extract: o => o.capRate?.worst ?? null, formula: 'noi_worst / asking_price * 100', basis: 'NOI' },
  { subject: 'irr_5y_base', unit: '%', extract: o => o.irr5Year?.base ?? null, formula: 'irr(cfs, hold=5)' },
  { subject: 'irr_5y_best', unit: '%', extract: o => o.irr5Year?.best ?? null, formula: 'irr(cfs_best, hold=5)' },
  { subject: 'irr_5y_worst', unit: '%', extract: o => o.irr5Year?.worst ?? null, formula: 'irr(cfs_worst, hold=5)' },
  { subject: 'yield_on_cost', unit: '%', extract: o => o.yieldOnCost ?? null, formula: 'annual_gross / asking_price * 100', basis: 'GPI' },
  { subject: 'price_per_sqm', unit: '원/㎡', extract: o => o.pricePerSqm ?? null, formula: 'asking_price / total_area' },
  { subject: 'price_per_pyeong', unit: '원/평', extract: o => o.pricePerPyeong ?? null, formula: 'price_per_sqm * 3.30578' },
  { subject: 'equity_required', unit: '억원', extract: o => o.equityRequired ?? null, formula: 'total_cost - deposit - loan' },
  { subject: 'leveraged_yield', unit: '%', extract: o => o.leveragedYield ?? null, formula: '(noi - interest) / equity * 100' },
  { subject: 'land_value_ratio', unit: '%', extract: o => o.landValueRatio ?? null, formula: 'land_price_total / asking_price * 100' },
  { subject: 'total_acquisition_cost', unit: '억원', extract: o => o.totalAcquisitionCostBil ?? null, formula: 'asking + tax + broker_fee' },
  { subject: 'negative_leverage', unit: '', extract: o => o.negativeLeverage === true ? 1 : o.negativeLeverage === false ? 0 : null },
];

const DEVELOPMENT_CLAIM_SPECS: FinancialClaimSpec[] = [];
const OWNER_OCCUPIED_CLAIM_SPECS: FinancialClaimSpec[] = INCOME_CLAIM_SPECS.filter(s => ['price_per_sqm', 'price_per_pyeong'].includes(s.subject));
const OPERATING_CLAIM_SPECS: FinancialClaimSpec[] = [];
const TRADING_CLAIM_SPECS: FinancialClaimSpec[] = INCOME_CLAIM_SPECS.filter(s => ['price_per_sqm', 'price_per_pyeong'].includes(s.subject));

const FORMULA_VERSION = 'v1.0.0';

export interface FinancialCalcOutput {
  claims: Claim[];
  outputs: FinancialOutputs;
  violations: string[];
}

// ── FinancialCalculator ──

export class FinancialCalculator {
  private registry: ClaimRegistry;
  private asOfDate: string;

  constructor(registry: ClaimRegistry, asOfDate?: string) {
    this.registry = registry;
    this.asOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  }

  /**
   * financials.ts의 결정론적 계산을 실행하고, 결과를 Claim으로 등록합니다.
   *
   * @returns 등록된 Claim 배열 + 원본 FinancialOutputs + 위반 목록
   */
  calculate(inputs: FinancialInputs): FinancialCalcOutput {
    // 1. 기존 결정론적 계산 실행
    const outputs = calculateFinancials(inputs);
    const posture = inputs.posture ?? 'income';

    // 2. 결과를 Claim으로 변환·등록
    const specs = this.getSpecsForPosture(posture);
    const claims: Claim[] = [];
    const allViolations: string[] = [];

    // 입력값도 Claim으로 등록 (역추적 가능하게)
    const inputClaims = this.registerInputClaims(inputs);
    claims.push(...inputClaims);

    for (const spec of specs) {
      const value = spec.extract(outputs);
      if (value === null) continue;

      const inputClaimIds: Record<string, string> = {};
      // 입력 Claim 중 관련 항목 연결
      for (const ic of inputClaims) {
        inputClaimIds[ic.subject] = ic.id;
      }

      const deductions = spec.deductionsExtract?.(outputs, inputs);

      const calc: Calculation | undefined = spec.formula ? {
        id: randomUUID(),
        formula: spec.formula,
        formulaVersion: FORMULA_VERSION,
        inputs: inputClaimIds,
        result: value,
        basis: spec.basis,
        deductions: deductions,
      } : undefined;

      if (calc) {
        const calcViolations = validateCalculation(calc);
        allViolations.push(...calcViolations);
      }

      const hasUserOpex = inputs.opexRatioPct != null || (inputs.mgmtFeeTotalManwon ?? 0) > 0;

      const claimOpts: CreateClaimOptions = {
        subject: spec.subject,
        value: value,
        unit: spec.unit,
        evidence: [{
          sourceId: 'derived',
          asOf: this.asOfDate,
          excerpt: `${spec.formula ?? spec.subject} = ${value}`,
        }],
        provenance: 'derived',
        asOf: this.asOfDate,
        status: 'reconciled', // 결정론적 계산 → 자동 reconciled
        calculation: calc,
      };

      // G38 & CIM-0103: NOI 기반인데 운영비 없으면 차단 (운영비 없는 NOI 확정 발행 방지)
      if (spec.basis === 'NOI' && !hasUserOpex && spec.subject.startsWith('cap_rate')) {
        claimOpts.status = 'unverified';
        claimOpts.evidence[0].excerpt = '운영비 미입력 — 실질 NOI 산출 불가';
        allViolations.push(`G38_NOI_MISSING_OPEX: ${spec.subject} requires evidenced operating expenses`);
      }

      const { claim, violations } = this.registry.register(claimOpts);
      claims.push(claim);
      allViolations.push(...violations);
    }

    // 3. 공실률(>0%)인 경우 pro_forma 클레임 자동 등록 (만실 정상화 시나리오)
    if (
      inputs.vacancyRatePct != null &&
      inputs.vacancyRatePct > 0 &&
      inputs.purchasePriceKrw > 0 &&
      inputs.monthlyRentKrw
    ) {
      const currentAnnualRent = inputs.monthlyRentKrw * 12;
      const currentCapRate = (currentAnnualRent / inputs.purchasePriceKrw) * 100;
      const occupancyRate = (100 - inputs.vacancyRatePct) / 100;
      const fullOccupancyAnnualRent = occupancyRate > 0 ? currentAnnualRent / occupancyRate : currentAnnualRent;
      const proFormaCapRate = (fullOccupancyAnnualRent / inputs.purchasePriceKrw) * 100;
      const upsidePp = Math.max(0, proFormaCapRate - currentCapRate);

      const { claim: proCapClaim } = this.registry.register({
        subject: 'pro_forma_cap_rate',
        value: Math.round(proFormaCapRate * 100) / 100,
        unit: '%',
        evidence: [{ sourceId: 'derived', asOf: this.asOfDate, excerpt: '만실 정상화 시 연 순수익률 예상' }],
        provenance: 'derived',
        asOf: this.asOfDate,
        status: 'reconciled',
        calculation: {
          id: randomUUID(),
          formula: 'full_occupancy_annual_rent / purchase_price * 100',
          formulaVersion: FORMULA_VERSION,
          inputs: {},
          result: Math.round(proFormaCapRate * 100) / 100,
          basis: 'NOI',
        },
      });
      claims.push(proCapClaim);

      const { claim: upsideClaim } = this.registry.register({
        subject: 'pro_forma_upside_cap_rate_pp',
        value: Math.round(upsidePp * 100) / 100,
        unit: '%p',
        evidence: [{ sourceId: 'derived', asOf: this.asOfDate, excerpt: `공실 해소 시 연 순수익률 +${upsidePp.toFixed(2)}%p 개선` }],
        provenance: 'derived',
        asOf: this.asOfDate,
        status: 'reconciled',
      });
      claims.push(upsideClaim);
    }

    return { claims, outputs, violations: allViolations };
  }

  /** 입력값을 Claim으로 등록 — 역추적 기반 */
  private registerInputClaims(inputs: FinancialInputs): Claim[] {
    const claims: Claim[] = [];
    const register = (subject: string, value: number | null, unit: string, provenance: 'broker' | 'public_api' | 'assumed') => {
      if (value === null || value === undefined) return;
      const { claim } = this.registry.register({
        subject,
        value,
        unit,
        evidence: [{ sourceId: provenance, asOf: this.asOfDate }],
        provenance,
        asOf: this.asOfDate,
        status: provenance === 'assumed' ? 'unverified' : 'reconciled',
      });
      claims.push(claim);
    };

    register('asking_price', inputs.purchasePriceKrw, '원', 'broker');
    register('monthly_rent_total', inputs.monthlyRentKrw ?? null, '원/월', 'broker');
    register('total_area_sqm', inputs.totalAreaSqm ?? null, '㎡', 'public_api');
    register('land_area_sqm', inputs.platAreaSqm ?? null, '㎡', 'public_api');
    register('opex_ratio_pct', inputs.opexRatioPct ?? null, '%', inputs.opexRatioPct != null ? 'broker' : 'assumed');
    register('vacancy_rate_pct', inputs.vacancyRatePct ?? null, '%', 'assumed');
    register('total_deposit', inputs.totalDepositManwon ? inputs.totalDepositManwon * 10000 : null, '원', 'broker');
    register('loan_amount', inputs.loanAmountManwon ? inputs.loanAmountManwon * 10000 : null, '원', 'broker');

    return claims;
  }

  /** 포스처별 Claim 스펙 반환 */
  private getSpecsForPosture(posture: string): FinancialClaimSpec[] {
    switch (posture) {
      case 'development':
        return DEVELOPMENT_CLAIM_SPECS;
      case 'owner_occupied':
        return OWNER_OCCUPIED_CLAIM_SPECS;
      case 'operating':
        return OPERATING_CLAIM_SPECS;
      case 'trading':
        return TRADING_CLAIM_SPECS;
      case 'income':
      default:
        return INCOME_CLAIM_SPECS;
    }
  }
}
