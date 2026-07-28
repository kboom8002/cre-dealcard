/**
 * @module Financials
 * @description Centralized Financial Calculations Engine for CREDEAL v3.
 * Computes all financial math including NOI (순영업소득), Cap Rate, and Equity.
 * Rule S0-T2: ALL financial math (NOI, Cap Rate, DCF, Equity) MUST route
 * strictly through this module. Direct calculation in UI components or LLM prompts is strictly forbidden.
 * @see SDD §5 S0-T2
 */

/**
 * Inputs for financial calculations.
 */
export interface FinancialInputs {
  /** Asking price in KRW (매매가) */
  askingPriceKrw: number;
  /** Gross annual income in KRW (연 총수입) */
  grossAnnualIncomeKrw: number;
  /** Operating expense ratio percentage (운영비용 비율). Default 10% */
  opexRatioPct?: number;       // default 10%
  /** Vacancy reserve percentage (공실률). Default 5% */
  vacancyReservePct?: number; // default 5%
  /** Total deposit in KRW (총 보증금) */
  totalDepositKrw?: number;
  /** Loan amount in KRW (대출금) */
  loanAmountKrw?: number;
  /** Data grade of the asset */
  dataGrade?: 'A' | 'B' | 'C' | 'D';
}

/**
 * Result of a financial calculation including provenance.
 */
export interface CalculationResult<T> {
  /** The calculated value */
  value: T;
  /** Whether the value was computed using assumptions */
  isAssumption: boolean;
  /** Provenance tier indicating the source reliability */
  provenanceTier: 'public_data' | 'expert_verified' | 'broker_input' | 'ai_inferred';
  /** Human-readable text for UI badges */
  badgeText: string;
}

/**
 * Summary of all financial calculations for an asset.
 */
export interface FinancialSummary {
  /** Effective Gross Income (유효총소득) in KRW */
  effectiveGrossIncomeKrw: CalculationResult<number>;
  /** Operating Expenses (운영비용) in KRW */
  opexKrw: CalculationResult<number>;
  /** Net Operating Income (순영업소득) in KRW */
  noiKrw: CalculationResult<number>;
  /** Capitalization Rate (캡레이트) percentage */
  capRatePct: CalculationResult<number | null>;
  /** Required Equity (실투자금) in KRW */
  equityRequiredKrw: CalculationResult<number>;
  /** Whether the asset is eligible for DCF analysis (requires Grade A) */
  dcfEligible: boolean;
  /** Reason string explaining DCF eligibility status */
  dcfReason?: string;
}

/**
 * Calculates Net Operating Income (NOI 순영업소득)
 * Formula: EGI (Gross Income * (1 - Vacancy%)) - OPEX (EGI * OPEX%)
 * 
 * @param grossAnnualIncomeKrw - Gross annual income in KRW
 * @param opexRatioPct - Operating expense ratio percentage (default: 10)
 * @param vacancyReservePct - Vacancy reserve percentage (default: 5)
 * @returns Calculation result containing the NOI value and provenance
 * @see SDD §5 S0-T2
 */
export function calculateNOI(
  grossAnnualIncomeKrw: number,
  opexRatioPct: number = 10,
  vacancyReservePct: number = 5
): CalculationResult<number> {
  const egi = grossAnnualIncomeKrw * (1 - vacancyReservePct / 100);
  const opex = egi * (opexRatioPct / 100);
  const noi = Math.max(0, egi - opex);

  const isAssumption = opexRatioPct === 10 || vacancyReservePct === 5;
  return {
    value: Math.round(noi),
    isAssumption,
    provenanceTier: isAssumption ? 'ai_inferred' : 'broker_input',
    badgeText: isAssumption ? '가정 (표준 OPEX 10% / 공실 5% 적용)' : '확인됨',
  };
}

/**
 * Calculates Cap Rate (%) (캡레이트)
 * Formula: (NOI / Asking Price) * 100
 * 
 * @param noiKrw - Net Operating Income in KRW
 * @param askingPriceKrw - Asking price in KRW
 * @returns Calculation result containing the Cap Rate percentage
 * @see SDD §5 S0-T2
 */
export function calculateCapRate(
  noiKrw: number,
  askingPriceKrw: number
): CalculationResult<number | null> {
  if (!askingPriceKrw || askingPriceKrw <= 0) {
    return {
      value: null,
      isAssumption: false,
      provenanceTier: 'ai_inferred',
      badgeText: '매매가 필요',
    };
  }

  const capRate = (noiKrw / askingPriceKrw) * 100;
  return {
    value: parseFloat(capRate.toFixed(2)),
    isAssumption: false,
    provenanceTier: 'broker_input',
    badgeText: '산출됨',
  };
}

/**
 * Calculates Required Equity (실투자금)
 * Formula: Asking Price - Loan Amount - Deposit Total
 * 
 * @param askingPriceKrw - Asking price in KRW
 * @param loanAmountKrw - Loan amount in KRW (default: 0)
 * @param totalDepositKrw - Total deposit in KRW (default: 0)
 * @returns Calculation result containing the required equity
 * @see SDD §5 S0-T2
 */
export function calculateEquityRequired(
  askingPriceKrw: number,
  loanAmountKrw: number = 0,
  totalDepositKrw: number = 0
): CalculationResult<number> {
  const equity = Math.max(0, askingPriceKrw - loanAmountKrw - totalDepositKrw);
  const isAssumption = loanAmountKrw === 0 && totalDepositKrw === 0;

  return {
    value: Math.round(equity),
    isAssumption,
    provenanceTier: isAssumption ? 'ai_inferred' : 'broker_input',
    badgeText: isAssumption ? '가정 (보증금/대출 미입력)' : '확인됨',
  };
}

/**
 * Full Financial Summary computation gate
 * Rule S0-T6: DCF is gated strictly by Data Grade A
 * 
 * @param inputs - Financial inputs for the asset
 * @returns Complete financial summary
 * @see SDD §5 S0-T6
 */
export function computeFinancialSummary(inputs: FinancialInputs): FinancialSummary {
  const opexPct = inputs.opexRatioPct ?? 10;
  const vacancyPct = inputs.vacancyReservePct ?? 5;

  const noiResult = calculateNOI(inputs.grossAnnualIncomeKrw, opexPct, vacancyPct);
  const egi = inputs.grossAnnualIncomeKrw * (1 - vacancyPct / 100);
  const opex = egi * (opexPct / 100);

  const capRateResult = calculateCapRate(noiResult.value, inputs.askingPriceKrw);
  const equityResult = calculateEquityRequired(
    inputs.askingPriceKrw,
    inputs.loanAmountKrw ?? 0,
    inputs.totalDepositKrw ?? 0
  );

  const isGradeA = inputs.dataGrade === 'A';

  return {
    effectiveGrossIncomeKrw: {
      value: Math.round(egi),
      isAssumption: vacancyPct === 5,
      provenanceTier: vacancyPct === 5 ? 'ai_inferred' : 'broker_input',
      badgeText: vacancyPct === 5 ? '가정 (공실 5%)' : '확인됨',
    },
    opexKrw: {
      value: Math.round(opex),
      isAssumption: opexPct === 10,
      provenanceTier: opexPct === 10 ? 'ai_inferred' : 'broker_input',
      badgeText: opexPct === 10 ? '가정 (OPEX 10%)' : '확인됨',
    },
    noiKrw: noiResult,
    capRatePct: capRateResult,
    equityRequiredKrw: equityResult,
    dcfEligible: isGradeA,
    dcfReason: isGradeA
      ? 'Grade A 검증 완료 — DCF 분석 가용'
      : `Grade ${inputs.dataGrade || 'Unset'} 자산 — DCF 비활성화 (Grade A 필수)`,
  };
}
