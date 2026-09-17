/**
 * pro-financial-model.ts
 *
 * Institutional Pro IM Quantitative Modeling Engine:
 * 1. Multi-Year Line-Item Cash Flow Projections (PGI, Vacancy, EGI, OPEX Breakdown, CapEx, NOI, Debt Service, BTCF, Terminal Proceeds)
 * 2. Newton-Raphson IRR Solver (Unlevered & Levered IRR)
 * 3. 2D Sensitivity Matrix (Exit Cap Rate vs Discount Rate) & Vacancy Stress Scenarios
 * 4. 5-Tier Development Feasibility Budget Engine
 * 5. SSoT Mathematical Consistency Gate (0.00% Discrepancy Validator)
 *
 * Compliant with AGENTS.md Rule 12 (pure domain logic, no React/Next/Supabase).
 */

// ============================================================================
// 1. Types & Interfaces: Multi-Year Cash Flow
// ============================================================================

export interface OpexBreakdownInput {
  managementFeeKrw?: number;
  propertyTaxKrw?: number;
  insuranceKrw?: number;
  maintenanceKrw?: number;
  totalOpexKrw?: number;
  opexGrowthRatePct?: number; // Annual growth rate % (default: 2.0%)
}

export interface DebtFinancingInput {
  loanAmountKrw: number;
  interestRatePct: number; // e.g. 4.5 for 4.5%
  amortizationYears?: number; // if amortizing
  isInterestOnly?: boolean; // bullet repayment (only interest payments during hold)
}

export interface MultiYearCashFlowInput {
  purchasePriceKrw: number;
  holdingPeriodYears?: number; // default: 10
  initialPgiKrw: number; // Year 1 Potential Gross Income
  rentGrowthRatePct?: number; // Annual rent escalation % (default: 2.0%)
  vacancyRatePct?: number; // Annual vacancy allowance % (default: 3.0%)
  opex?: OpexBreakdownInput;
  capexReserveRatePct?: number; // CapEx reserve as % of EGI (default: 1.0%)
  debtFinancing?: DebtFinancingInput;
  exitCapRatePct: number; // e.g. 4.5 for 4.5%
  dispositionCostRatePct?: number; // e.g. 1.5 for 1.5% (default: 1.5%)
  discountRatePct?: number; // for NPV / DCF hurdle rate (default: 6.0%)
}

export interface OpexSchedule {
  managementFee: number[];
  propertyTax: number[];
  insurance: number[];
  maintenance: number[];
  total: number[];
}

export interface DebtServiceSchedule {
  principal: number[];
  interest: number[];
  total: number[];
}

export interface ExitAssumptions {
  holdingPeriodYears: number;
  exitCapRatePct: number;
  grossSalePrice: number;
  dispositionCosts: number;
  netProceeds: number;
}

export interface CashFlowMetrics {
  unleveredIrrPct: number;
  leveredIrrPct?: number;
  initialCapRatePct: number;
  averageCashOnCashPct?: number;
  npvKrw: number;
}

export interface MultiYearCashFlow {
  years: number[];
  pgi: number[];
  vacancyAllowance: number[];
  egi: number[];
  opex: OpexSchedule;
  capexReserve: number[];
  noi: number[];
  debtService?: DebtServiceSchedule;
  btcf?: number[];
  exitAssumptions: ExitAssumptions;
  metrics: CashFlowMetrics;
}

// ============================================================================
// 2. Types & Interfaces: Sensitivity & Stress Testing
// ============================================================================

export interface SensitivityMatrix2D {
  exitCapRates: number[];
  discountRates: number[];
  unleveredIrrGrid: number[][]; // [exitCapIdx][discountIdx]
  npvGridKrw: number[][]; // [exitCapIdx][discountIdx]
}

export interface VacancyStressScenario {
  scenarioName: 'Base' | 'Moderate' | 'Severe' | string;
  vacancyRatePct: number;
  year1NoiKrw: number;
  noiDeltaPct: number;
  unleveredIrrPct: number;
  leveredIrrPct?: number;
  initialCapRatePct: number;
}

export interface SensitivityAnalysisResult {
  matrix2D: SensitivityMatrix2D;
  vacancyStressScenarios: VacancyStressScenario[];
}

export interface SensitivityOptions {
  exitCapRateSteps?: number[]; // custom steps or auto +/- 50bps
  discountRateSteps?: number[]; // custom steps or auto +/- 100bps
  stressTestRates?: {
    base?: number;
    moderate?: number;
    severe?: number;
  };
}

// ============================================================================
// 3. Types & Interfaces: 5-Tier Development Feasibility Budget
// ============================================================================

export interface DevelopmentBudgetTiers {
  tier1Land: {
    purchasePriceKrw: number;
    acquisitionTaxKrw: number;
    brokerageFeeKrw: number;
    evictionCompensationKrw: number;
    carryingCostKrw: number;
    total: number;
  };
  tier2HardCosts: {
    demolitionKrw: number;
    constructionCivilKrw: number;
    constructionMepFinishKrw: number;
    infrastructureHookupKrw: number;
    total: number;
  };
  tier3SoftCosts: {
    architecturalDesignKrw: number;
    supervisionKrw: number;
    permitsAndTaxesKrw: number;
    projectManagementKrw: number;
    total: number;
  };
  tier4FinancingPf: {
    bridgeInterestAndFeesKrw: number;
    pfInterestReserveKrw: number;
    pfArrangementFeesKrw: number;
    trustFeesKrw: number;
    total: number;
  };
  tier5Contingency: {
    contingencyRatePct: number;
    contingencyKrw: number;
    total: number;
  };
}

export interface DevelopmentFeasibilityBudget {
  landAcquisitionKrw: number;
  hardCostsKrw: number;
  softCostsKrw: number;
  financingPfKrw: number;
  contingencyKrw: number;
  totalDevelopmentCostKrw: number;
  projectedGrossRevenueKrw: number;
  projectIrrPct: number;
  equityIrrPct: number;
  tiers: DevelopmentBudgetTiers;
  netProfitKrw: number;
  profitMarginPct: number;
}

export interface DevelopmentFeasibilityInput {
  landPriceKrw: number;
  targetGfaPyeong: number;
  constructionCostPerPyeongKrw?: number; // default: 12,000,000 KRW
  projectedGrossRevenueKrw?: number; // default: derived from 120% of cost or sales comp
  contingencyRatePct?: number; // default: 5.0%
  developmentDurationMonths?: number; // default: 24 months
  equityContributionRatioPct?: number; // default: 20.0%
  // Optional explicit overrides
  customLandAcquisition?: Partial<DevelopmentBudgetTiers['tier1Land']>;
  customHardCosts?: Partial<DevelopmentBudgetTiers['tier2HardCosts']>;
  customSoftCosts?: Partial<DevelopmentBudgetTiers['tier3SoftCosts']>;
  customFinancingPf?: Partial<DevelopmentBudgetTiers['tier4FinancingPf']>;
}

// ============================================================================
// 4. Types & Interfaces: SSoT Mathematical Consistency Gate
// ============================================================================

export interface FinancialConsistencyCheckItem {
  checkName: string;
  executiveValue: number;
  detailValue: number;
  discrepancyKrwOrUnit: number;
  discrepancyPct: number;
  tolerancePct: number;
  passed: boolean;
  message?: string;
}

export interface FinancialConsistencyValidationResult {
  passed: boolean;
  discrepancyCount: number;
  checks: FinancialConsistencyCheckItem[];
  tolerancePct: number;
}

export interface ProImFinancialConsistencyInput {
  executiveSummary: {
    askingPriceKrw: number;
    year1NoiKrw: number;
    initialCapRatePct: number;
    totalAnnualRentKrw: number;
    totalDepositKrw: number;
    totalDevelopmentCostKrw?: number;
  };
  detailSchedule: {
    cashFlowYear1: {
      pgi: number;
      noi: number;
      purchasePrice: number;
    };
    tenantRosterTotal: {
      totalAnnualRent: number;
      totalDeposit: number;
    };
    developmentBudgetTotalKrw?: number;
  };
}

// ============================================================================
// 5. Newton-Raphson & Hybrid IRR Solver
// ============================================================================

/**
 * Normalizes a percentage rate to 2 decimal places and eliminates negative zero (-0).
 */
function formatIrrRate(rate: number): number {
  const rounded = Number((rate * 100).toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Robust Newton-Raphson IRR Solver with Bisection Fallback.
 * Returns percentage (e.g., 7.45 for 7.45%).
 */
export function calculateIrrNewtonRaphson(
  cashFlows: number[],
  options?: {
    guessRate?: number;
    maxIterations?: number;
    tolerance?: number;
  }
): number | null {
  if (!cashFlows || cashFlows.length < 2) return null;

  // Guard: strictly reject any non-finite values (NaN, Infinity, -Infinity)
  for (let i = 0; i < cashFlows.length; i++) {
    const cf = cashFlows[i];
    if (typeof cf !== 'number' || !Number.isFinite(cf)) {
      return null;
    }
  }

  // Verify there is at least one sign change
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf > 0) hasPositive = true;
    if (cf < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

  const guess = options?.guessRate ?? 0.08;
  const maxIter = options?.maxIterations ?? 200;
  const tol = options?.tolerance ?? 1e-6;

  let rate = guess;

  // Newton-Raphson Phase
  for (let iter = 0; iter < maxIter; iter++) {
    let npv = 0;
    let dnpv = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      const pv = cashFlows[t] / denom;
      npv += pv;
      if (t > 0) {
        dnpv -= (t * pv) / (1 + rate);
      }
    }

    if (Math.abs(npv) < tol) {
      return formatIrrRate(rate);
    }

    if (Math.abs(dnpv) < 1e-12) {
      break; // Derivative too small, switch to bisection
    }

    const nextRate = rate - npv / dnpv;

    // Divergence guard
    if (nextRate < -0.99 || nextRate > 20 || !Number.isFinite(nextRate)) {
      break;
    }

    if (Math.abs(nextRate - rate) < tol) {
      return formatIrrRate(nextRate);
    }

    rate = nextRate;
  }

  // Bisection Fallback Phase: search in [-0.5, 5.0]
  let low = -0.5;
  let high = 5.0;

  const calcNpv = (r: number) => {
    let sum = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      sum += cashFlows[t] / Math.pow(1 + r, t);
    }
    return sum;
  };

  let npvLow = calcNpv(low);
  let npvHigh = calcNpv(high);

  if (npvLow * npvHigh > 0) {
    // If not bracketed, widen range
    high = 20.0;
    npvHigh = calcNpv(high);
    if (npvLow * npvHigh > 0) return null;
  }

  for (let iter = 0; iter < 100; iter++) {
    const mid = (low + high) / 2;
    const npvMid = calcNpv(mid);

    if (Math.abs(npvMid) < tol || (high - low) / 2 < tol) {
      return formatIrrRate(mid);
    }

    if (npvMid * npvLow < 0) {
      high = mid;
      npvHigh = npvMid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return formatIrrRate((low + high) / 2);
}

// ============================================================================
// 6. Multi-Year Cash Flow Projection Generator
// ============================================================================

export function generateMultiYearCashFlow(input: MultiYearCashFlowInput): MultiYearCashFlow {
  const {
    purchasePriceKrw,
    holdingPeriodYears = 10,
    initialPgiKrw,
    rentGrowthRatePct = 2.0,
    vacancyRatePct = 3.0,
    capexReserveRatePct = 1.0,
    exitCapRatePct,
    dispositionCostRatePct = 1.5,
    discountRatePct = 6.0,
    debtFinancing,
  } = input;

  const rentGrowth = rentGrowthRatePct / 100;
  const vacancyRate = vacancyRatePct / 100;
  const capexReserveRate = capexReserveRatePct / 100;
  const exitCapRate = exitCapRatePct / 100;
  const dispCostRate = dispositionCostRatePct / 100;
  const discountRate = discountRatePct / 100;

  // OPEX defaults
  const opexInput = input.opex ?? {};
  const opexGrowth = (opexInput.opexGrowthRatePct ?? 2.0) / 100;

  // If specific items not provided, allocate from totalOpexKrw or standard 12% of PGI
  const sumExplicitOpex =
    (opexInput.managementFeeKrw ?? 0) +
    (opexInput.propertyTaxKrw ?? 0) +
    (opexInput.insuranceKrw ?? 0) +
    (opexInput.maintenanceKrw ?? 0);

  const baseTotalOpex =
    opexInput.totalOpexKrw ??
    (sumExplicitOpex > 0 ? sumExplicitOpex : Math.round(initialPgiKrw * 0.12));

  const baseMgmt = opexInput.managementFeeKrw ?? Math.round(baseTotalOpex * 0.30);
  const baseTax = opexInput.propertyTaxKrw ?? Math.round(baseTotalOpex * 0.35);
  const baseIns = opexInput.insuranceKrw ?? Math.round(baseTotalOpex * 0.10);
  const baseMaint = opexInput.maintenanceKrw ?? Math.round(baseTotalOpex * 0.25);

  const years: number[] = [];
  const pgi: number[] = [];
  const vacancyAllowance: number[] = [];
  const egi: number[] = [];
  const opex: OpexSchedule = {
    managementFee: [],
    propertyTax: [],
    insurance: [],
    maintenance: [],
    total: [],
  };
  const capexReserve: number[] = [];
  const noi: number[] = [];

  for (let y = 1; y <= holdingPeriodYears; y++) {
    years.push(y);

    const yearPgi = Math.round(initialPgiKrw * Math.pow(1 + rentGrowth, y - 1));
    const yearVacancy = Math.round(yearPgi * vacancyRate);
    const yearEgi = yearPgi - yearVacancy;

    const opexInflation = Math.pow(1 + opexGrowth, y - 1);
    const yearMgmt = Math.round(baseMgmt * opexInflation);
    const yearTax = Math.round(baseTax * opexInflation);
    const yearIns = Math.round(baseIns * opexInflation);
    const yearMaint = Math.round(baseMaint * opexInflation);
    const yearTotalOpex = yearMgmt + yearTax + yearIns + yearMaint;

    const yearCapex = Math.round(yearEgi * capexReserveRate);
    const yearNoi = yearEgi - yearTotalOpex - yearCapex;

    pgi.push(yearPgi);
    vacancyAllowance.push(yearVacancy);
    egi.push(yearEgi);
    opex.managementFee.push(yearMgmt);
    opex.propertyTax.push(yearTax);
    opex.insurance.push(yearIns);
    opex.maintenance.push(yearMaint);
    opex.total.push(yearTotalOpex);
    capexReserve.push(yearCapex);
    noi.push(yearNoi);
  }

  // Exit Valuation (Terminal Proceeds based on forward Year N+1 NOI)
  const forwardYearNoi = Math.round(noi[holdingPeriodYears - 1] * (1 + rentGrowth));
  const grossSalePrice = exitCapRate > 0 ? Math.round(forwardYearNoi / exitCapRate) : 0;
  const dispositionCosts = Math.round(grossSalePrice * dispCostRate);
  const netProceeds = grossSalePrice - dispositionCosts;

  const exitAssumptions: ExitAssumptions = {
    holdingPeriodYears,
    exitCapRatePct,
    grossSalePrice,
    dispositionCosts,
    netProceeds,
  };

  // Debt Service & BTCF Calculation (if debt financing present)
  let debtService: DebtServiceSchedule | undefined;
  let btcf: number[] | undefined;
  let remainingLoanBalance = 0;

  if (debtFinancing && debtFinancing.loanAmountKrw > 0) {
    const loanAmt = debtFinancing.loanAmountKrw;
    const iRate = debtFinancing.interestRatePct / 100;
    const isInterestOnly = debtFinancing.isInterestOnly ?? true;

    debtService = {
      principal: [],
      interest: [],
      total: [],
    };
    btcf = [];

    let currentBalance = loanAmt;

    if (isInterestOnly) {
      for (let y = 1; y <= holdingPeriodYears; y++) {
        const annualInterest = Math.round(loanAmt * iRate);
        debtService.principal.push(0);
        debtService.interest.push(annualInterest);
        debtService.total.push(annualInterest);
        btcf.push(noi[y - 1] - annualInterest);
      }
      remainingLoanBalance = loanAmt;
    } else {
      const amortYears = debtFinancing.amortizationYears ?? 25;
      const annualPmt = Math.round(
        (loanAmt * iRate) / (1 - Math.pow(1 + iRate, -amortYears))
      );

      for (let y = 1; y <= holdingPeriodYears; y++) {
        const interestPmt = Math.round(currentBalance * iRate);
        const principalPmt = Math.min(currentBalance, annualPmt - interestPmt);
        const totalPmt = interestPmt + principalPmt;

        debtService.principal.push(principalPmt);
        debtService.interest.push(interestPmt);
        debtService.total.push(totalPmt);
        btcf.push(noi[y - 1] - totalPmt);

        currentBalance -= principalPmt;
      }
      remainingLoanBalance = currentBalance;
    }
  }

  // Unlevered Cash Flows
  const unleveredCashFlows: number[] = [-purchasePriceKrw];
  for (let i = 0; i < holdingPeriodYears - 1; i++) {
    unleveredCashFlows.push(noi[i]);
  }
  unleveredCashFlows.push(noi[holdingPeriodYears - 1] + netProceeds);

  const unleveredIrrPct = calculateIrrNewtonRaphson(unleveredCashFlows) ?? 0;

  // NPV Calculation
  let npvKrw = -purchasePriceKrw;
  for (let t = 1; t <= holdingPeriodYears; t++) {
    const cf = unleveredCashFlows[t];
    npvKrw += cf / Math.pow(1 + discountRate, t);
  }
  npvKrw = Math.round(npvKrw);

  // Levered Cash Flows & IRR
  let leveredIrrPct: number | undefined;
  let averageCashOnCashPct: number | undefined;

  if (debtFinancing && debtFinancing.loanAmountKrw > 0 && btcf) {
    const equityInvested = purchasePriceKrw - debtFinancing.loanAmountKrw;
    const netEquityProceeds = netProceeds - remainingLoanBalance;

    const leveredCashFlows: number[] = [-equityInvested];
    for (let i = 0; i < holdingPeriodYears - 1; i++) {
      leveredCashFlows.push(btcf[i]);
    }
    leveredCashFlows.push(btcf[holdingPeriodYears - 1] + netEquityProceeds);

    leveredIrrPct = calculateIrrNewtonRaphson(leveredCashFlows) ?? 0;

    const totalBtcf = btcf.reduce((sum, val) => sum + val, 0);
    averageCashOnCashPct =
      equityInvested > 0
        ? Number((((totalBtcf / holdingPeriodYears) / equityInvested) * 100).toFixed(2))
        : 0.0;
  }

  const initialCapRatePct = Number(((noi[0] / purchasePriceKrw) * 100).toFixed(2));

  return {
    years,
    pgi,
    vacancyAllowance,
    egi,
    opex,
    capexReserve,
    noi,
    debtService,
    btcf,
    exitAssumptions,
    metrics: {
      unleveredIrrPct,
      leveredIrrPct,
      initialCapRatePct,
      averageCashOnCashPct,
      npvKrw,
    },
  };
}

// ============================================================================
// 7. 2D Sensitivity Matrix & Stress Test Engine
// ============================================================================

export function generate2DSensitivityMatrix(
  baseInput: MultiYearCashFlowInput,
  options?: SensitivityOptions
): SensitivityAnalysisResult {
  const baseExitCap = baseInput.exitCapRatePct;
  const baseDiscount = baseInput.discountRatePct ?? 6.0;

  // Standard 5-step grid: Base -50bps, -25bps, Base, +25bps, +50bps
  const exitCapRates =
    options?.exitCapRateSteps ??
    [
      Number((baseExitCap - 0.5).toFixed(2)),
      Number((baseExitCap - 0.25).toFixed(2)),
      Number(baseExitCap.toFixed(2)),
      Number((baseExitCap + 0.25).toFixed(2)),
      Number((baseExitCap + 0.5).toFixed(2)),
    ].filter((r) => r > 0);

  // Standard 5-step grid: Base -100bps, -50bps, Base, +50bps, +100bps
  const discountRates =
    options?.discountRateSteps ??
    [
      Number((baseDiscount - 1.0).toFixed(2)),
      Number((baseDiscount - 0.5).toFixed(2)),
      Number(baseDiscount.toFixed(2)),
      Number((baseDiscount + 0.5).toFixed(2)),
      Number((baseDiscount + 1.0).toFixed(2)),
    ].filter((r) => r > 0);

  const unleveredIrrGrid: number[][] = [];
  const npvGridKrw: number[][] = [];

  for (const capRate of exitCapRates) {
    const irrRow: number[] = [];
    const npvRow: number[] = [];

    for (const discRate of discountRates) {
      const scenario = generateMultiYearCashFlow({
        ...baseInput,
        exitCapRatePct: capRate,
        discountRatePct: discRate,
      });

      irrRow.push(scenario.metrics.unleveredIrrPct);
      npvRow.push(scenario.metrics.npvKrw);
    }

    unleveredIrrGrid.push(irrRow);
    npvGridKrw.push(npvRow);
  }

  const matrix2D: SensitivityMatrix2D = {
    exitCapRates,
    discountRates,
    unleveredIrrGrid,
    npvGridKrw,
  };

  // Vacancy Stress Testing Scenarios: Base, Moderate, Severe
  const baseVacancy = baseInput.vacancyRatePct ?? 3.0;
  const modVacancy = options?.stressTestRates?.moderate ?? Number((baseVacancy + 5.0).toFixed(1));
  const sevVacancy = options?.stressTestRates?.severe ?? Number((baseVacancy + 12.0).toFixed(1));

  const baseCf = generateMultiYearCashFlow({ ...baseInput, vacancyRatePct: baseVacancy });
  const modCf = generateMultiYearCashFlow({ ...baseInput, vacancyRatePct: modVacancy });
  const sevCf = generateMultiYearCashFlow({ ...baseInput, vacancyRatePct: sevVacancy });

  const baseY1Noi = baseCf.noi[0];

  const calcNoiDeltaPct = (stressedNoi: number, baseNoi: number): number => {
    const denom = Math.abs(baseNoi);
    if (denom === 0) return 0.0;
    const pct = Number((((stressedNoi - baseNoi) / denom) * 100).toFixed(2));
    return Object.is(pct, -0) ? 0.0 : pct;
  };

  const vacancyStressScenarios: VacancyStressScenario[] = [
    {
      scenarioName: 'Base',
      vacancyRatePct: baseVacancy,
      year1NoiKrw: baseY1Noi,
      noiDeltaPct: 0.0,
      unleveredIrrPct: baseCf.metrics.unleveredIrrPct,
      leveredIrrPct: baseCf.metrics.leveredIrrPct,
      initialCapRatePct: baseCf.metrics.initialCapRatePct,
    },
    {
      scenarioName: 'Moderate',
      vacancyRatePct: modVacancy,
      year1NoiKrw: modCf.noi[0],
      noiDeltaPct: calcNoiDeltaPct(modCf.noi[0], baseY1Noi),
      unleveredIrrPct: modCf.metrics.unleveredIrrPct,
      leveredIrrPct: modCf.metrics.leveredIrrPct,
      initialCapRatePct: modCf.metrics.initialCapRatePct,
    },
    {
      scenarioName: 'Severe',
      vacancyRatePct: sevVacancy,
      year1NoiKrw: sevCf.noi[0],
      noiDeltaPct: calcNoiDeltaPct(sevCf.noi[0], baseY1Noi),
      unleveredIrrPct: sevCf.metrics.unleveredIrrPct,
      leveredIrrPct: sevCf.metrics.leveredIrrPct,
      initialCapRatePct: sevCf.metrics.initialCapRatePct,
    },
  ];

  return {
    matrix2D,
    vacancyStressScenarios,
  };
}

// ============================================================================
// 8. 5-Tier Development Feasibility Budget Engine
// ============================================================================

export function generateDevelopmentFeasibilityBudget(
  input: DevelopmentFeasibilityInput
): DevelopmentFeasibilityBudget {
  const {
    landPriceKrw,
    targetGfaPyeong,
    constructionCostPerPyeongKrw = 12_000_000,
    contingencyRatePct = 5.0,
    developmentDurationMonths = 24,
    equityContributionRatioPct = 20.0,
  } = input;

  // Tier 1: Land Acquisition & Carrying
  const purchasePriceKrw = landPriceKrw;
  const acquisitionTaxKrw =
    input.customLandAcquisition?.acquisitionTaxKrw ?? Math.round(purchasePriceKrw * 0.046);
  const brokerageFeeKrw =
    input.customLandAcquisition?.brokerageFeeKrw ?? Math.round(purchasePriceKrw * 0.009);
  const evictionCompensationKrw =
    input.customLandAcquisition?.evictionCompensationKrw ??
    Math.round(purchasePriceKrw * 0.015);
  const carryingCostKrw =
    input.customLandAcquisition?.carryingCostKrw ?? Math.round(purchasePriceKrw * 0.03);

  const tier1Total =
    purchasePriceKrw +
    acquisitionTaxKrw +
    brokerageFeeKrw +
    evictionCompensationKrw +
    carryingCostKrw;

  // Tier 2: Direct Hard Construction Costs
  const baseHardCost = targetGfaPyeong * constructionCostPerPyeongKrw;
  const demolitionKrw =
    input.customHardCosts?.demolitionKrw ?? Math.round(baseHardCost * 0.03);
  const constructionCivilKrw =
    input.customHardCosts?.constructionCivilKrw ?? Math.round(baseHardCost * 0.62);
  const constructionMepFinishKrw =
    input.customHardCosts?.constructionMepFinishKrw ?? Math.round(baseHardCost * 0.30);
  const infrastructureHookupKrw =
    input.customHardCosts?.infrastructureHookupKrw ?? Math.round(baseHardCost * 0.05);

  const tier2Total =
    demolitionKrw +
    constructionCivilKrw +
    constructionMepFinishKrw +
    infrastructureHookupKrw;

  // Tier 3: Indirect Soft Costs
  const architecturalDesignKrw =
    input.customSoftCosts?.architecturalDesignKrw ?? Math.round(tier2Total * 0.04);
  const supervisionKrw =
    input.customSoftCosts?.supervisionKrw ?? Math.round(tier2Total * 0.025);
  const permitsAndTaxesKrw =
    input.customSoftCosts?.permitsAndTaxesKrw ?? Math.round(tier2Total * 0.02);
  const projectManagementKrw =
    input.customSoftCosts?.projectManagementKrw ?? Math.round(tier2Total * 0.025);

  const tier3Total =
    architecturalDesignKrw +
    supervisionKrw +
    permitsAndTaxesKrw +
    projectManagementKrw;

  // Tier 4: Financing / PF Costs
  const estimatedSubtotal = tier1Total + tier2Total + tier3Total;
  const pfLoanAmount = Math.round(estimatedSubtotal * (1 - equityContributionRatioPct / 100));

  const bridgeInterestAndFeesKrw =
    input.customFinancingPf?.bridgeInterestAndFeesKrw ??
    Math.round(tier1Total * 0.04);
  const pfInterestReserveKrw =
    input.customFinancingPf?.pfInterestReserveKrw ??
    Math.round(pfLoanAmount * 0.065 * (developmentDurationMonths / 24));
  const pfArrangementFeesKrw =
    input.customFinancingPf?.pfArrangementFeesKrw ?? Math.round(pfLoanAmount * 0.025);
  const trustFeesKrw =
    input.customFinancingPf?.trustFeesKrw ?? Math.round(estimatedSubtotal * 0.005);

  const tier4Total =
    bridgeInterestAndFeesKrw +
    pfInterestReserveKrw +
    pfArrangementFeesKrw +
    trustFeesKrw;

  // Tier 5: Contingency Reserve
  const subtotalBeforeContingency = tier1Total + tier2Total + tier3Total + tier4Total;
  const contingencyKrw = Math.round(
    subtotalBeforeContingency * (contingencyRatePct / 100)
  );
  const tier5Total = contingencyKrw;

  const totalDevelopmentCostKrw = subtotalBeforeContingency + tier5Total;

  // Projected Gross Revenue & Profit
  const projectedGrossRevenueKrw =
    input.projectedGrossRevenueKrw ?? Math.round(totalDevelopmentCostKrw * 1.25);

  const netProfitKrw = projectedGrossRevenueKrw - totalDevelopmentCostKrw;
  const profitMarginPct = Number(
    ((netProfitKrw / totalDevelopmentCostKrw) * 100).toFixed(2)
  );

  // IRR Modeling for Development Project
  // Standard 2-year timeline (Months 0, 12, 24)
  // Month 0: Land & Initial Costs (45%)
  // Month 12: Construction Ongoing (45%)
  // Month 24: Completion & Final Sale (10% cost + 100% revenue)
  const projectCashFlows = [
    -Math.round(totalDevelopmentCostKrw * 0.45),
    -Math.round(totalDevelopmentCostKrw * 0.45),
    projectedGrossRevenueKrw - Math.round(totalDevelopmentCostKrw * 0.10),
  ];
  const projectIrrPct = calculateIrrNewtonRaphson(projectCashFlows) ?? 0;

  // Equity IRR: Equity invested at Year 0 & Year 1
  const equityTotal = Math.round(
    totalDevelopmentCostKrw * (equityContributionRatioPct / 100)
  );
  const equityProceeds = netProfitKrw + equityTotal;
  const equityCashFlows = [
    -Math.round(equityTotal * 0.7),
    -Math.round(equityTotal * 0.3),
    equityProceeds,
  ];
  const equityIrrPct = calculateIrrNewtonRaphson(equityCashFlows) ?? 0;

  const tiers: DevelopmentBudgetTiers = {
    tier1Land: {
      purchasePriceKrw,
      acquisitionTaxKrw,
      brokerageFeeKrw,
      evictionCompensationKrw,
      carryingCostKrw,
      total: tier1Total,
    },
    tier2HardCosts: {
      demolitionKrw,
      constructionCivilKrw,
      constructionMepFinishKrw,
      infrastructureHookupKrw,
      total: tier2Total,
    },
    tier3SoftCosts: {
      architecturalDesignKrw,
      supervisionKrw,
      permitsAndTaxesKrw,
      projectManagementKrw,
      total: tier3Total,
    },
    tier4FinancingPf: {
      bridgeInterestAndFeesKrw,
      pfInterestReserveKrw,
      pfArrangementFeesKrw,
      trustFeesKrw,
      total: tier4Total,
    },
    tier5Contingency: {
      contingencyRatePct,
      contingencyKrw,
      total: tier5Total,
    },
  };

  return {
    landAcquisitionKrw: tier1Total,
    hardCostsKrw: tier2Total,
    softCostsKrw: tier3Total,
    financingPfKrw: tier4Total,
    contingencyKrw: tier5Total,
    totalDevelopmentCostKrw,
    projectedGrossRevenueKrw,
    projectIrrPct,
    equityIrrPct,
    tiers,
    netProfitKrw,
    profitMarginPct,
  };
}

// ============================================================================
// 9. SSoT Mathematical Consistency Validator Gate
// ============================================================================

export function validateProImFinancialConsistency(
  input: ProImFinancialConsistencyInput,
  tolerancePct: number = 0.00
): FinancialConsistencyValidationResult {
  const { executiveSummary, detailSchedule } = input;
  const checks: FinancialConsistencyCheckItem[] = [];

  // 1. Asking Price / Purchase Price Match
  const askingPriceDiff = Math.abs(
    executiveSummary.askingPriceKrw - detailSchedule.cashFlowYear1.purchasePrice
  );
  const askingPriceDenom = Math.abs(executiveSummary.askingPriceKrw);
  const askingPriceDiffPct =
    askingPriceDenom > 0 ? (askingPriceDiff / askingPriceDenom) * 100 : 0;
  const askingPricePassed =
    askingPriceDiff <= 1 || (tolerancePct > 0 && askingPriceDiffPct <= tolerancePct);
  checks.push({
    checkName: 'Asking Price Consistency',
    executiveValue: executiveSummary.askingPriceKrw,
    detailValue: detailSchedule.cashFlowYear1.purchasePrice,
    discrepancyKrwOrUnit: askingPriceDiff,
    discrepancyPct: Number(askingPriceDiffPct.toFixed(4)),
    tolerancePct,
    passed: askingPricePassed,
    message:
      askingPriceDiff <= 1
        ? 'Executive Asking Price exactly matches Cash Flow Purchase Price.'
        : askingPricePassed
          ? `Executive Asking Price matches Cash Flow Purchase Price within tolerance (${askingPriceDiff.toLocaleString()} KRW, ${askingPriceDiffPct.toFixed(4)}%).`
          : `Discrepancy detected: ${askingPriceDiff.toLocaleString()} KRW (${askingPriceDiffPct.toFixed(2)}%)`,
  });

  // 2. Year 1 NOI Match
  const noiDiff = Math.abs(
    executiveSummary.year1NoiKrw - detailSchedule.cashFlowYear1.noi
  );
  const noiDenom = Math.abs(executiveSummary.year1NoiKrw);
  const noiDiffPct = noiDenom > 0 ? (noiDiff / noiDenom) * 100 : 0;
  const noiPassed = noiDiff <= 1 || (tolerancePct > 0 && noiDiffPct <= tolerancePct);
  checks.push({
    checkName: 'Year 1 NOI Consistency',
    executiveValue: executiveSummary.year1NoiKrw,
    detailValue: detailSchedule.cashFlowYear1.noi,
    discrepancyKrwOrUnit: noiDiff,
    discrepancyPct: Number(noiDiffPct.toFixed(4)),
    tolerancePct,
    passed: noiPassed,
    message:
      noiDiff <= 1
        ? 'Executive Year 1 NOI exactly matches Cash Flow Schedule NOI.'
        : noiPassed
          ? `Executive Year 1 NOI matches Cash Flow Schedule NOI within tolerance (${noiDiff.toLocaleString()} KRW, ${noiDiffPct.toFixed(4)}%).`
          : `Discrepancy detected: ${noiDiff.toLocaleString()} KRW (${noiDiffPct.toFixed(2)}%)`,
  });

  // 3. Initial Cap Rate Consistency (within 0.01%p)
  const purchasePrice = detailSchedule.cashFlowYear1.purchasePrice;
  const derivedCapRatePct =
    purchasePrice > 0
      ? Number(
          ((detailSchedule.cashFlowYear1.noi / purchasePrice) * 100).toFixed(2)
        )
      : 0.0;
  const capRateDiffPp = Math.abs(
    executiveSummary.initialCapRatePct - derivedCapRatePct
  );
  const safeCapRateDiff = Object.is(capRateDiffPp, -0) ? 0.0 : capRateDiffPp;
  const capRatePassed = safeCapRateDiff <= 0.01;
  checks.push({
    checkName: 'Initial Cap Rate Formula Consistency',
    executiveValue: executiveSummary.initialCapRatePct,
    detailValue: derivedCapRatePct,
    discrepancyKrwOrUnit: Number(safeCapRateDiff.toFixed(4)),
    discrepancyPct: Number(safeCapRateDiff.toFixed(4)),
    tolerancePct: 0.01,
    passed: capRatePassed,
    message:
      capRatePassed
        ? 'Executive Initial Cap Rate matches derived (NOI / Purchase Price) formula.'
        : `Cap rate mismatch: ${executiveSummary.initialCapRatePct}% vs ${derivedCapRatePct}%`,
  });

  // 4. Total Rent Consistency: Tenant Roster Annual Rent vs Cash Flow Year 1 PGI
  const rentDiff = Math.abs(
    executiveSummary.totalAnnualRentKrw - detailSchedule.tenantRosterTotal.totalAnnualRent
  );
  const rentDenom = Math.abs(executiveSummary.totalAnnualRentKrw);
  const rentDiffPct = rentDenom > 0 ? (rentDiff / rentDenom) * 100 : 0;
  const rentPassed =
    rentDiff <= 1 || (tolerancePct > 0 && rentDiffPct <= tolerancePct);
  checks.push({
    checkName: 'Tenant Roster vs Executive Total Rent Consistency',
    executiveValue: executiveSummary.totalAnnualRentKrw,
    detailValue: detailSchedule.tenantRosterTotal.totalAnnualRent,
    discrepancyKrwOrUnit: rentDiff,
    discrepancyPct: Number(rentDiffPct.toFixed(4)),
    tolerancePct,
    passed: rentPassed,
    message:
      rentDiff <= 1
        ? 'Executive Total Rent exactly matches Tenant Roster Annual Rent sum.'
        : rentPassed
          ? `Executive Total Rent matches Tenant Roster Annual Rent sum within tolerance (${rentDiff.toLocaleString()} KRW, ${rentDiffPct.toFixed(4)}%).`
          : `Rent mismatch: ${rentDiff.toLocaleString()} KRW (${rentDiffPct.toFixed(2)}%)`,
  });

  // 5. Total Deposit Consistency
  const depositDiff = Math.abs(
    executiveSummary.totalDepositKrw - detailSchedule.tenantRosterTotal.totalDeposit
  );
  const depositDenom = Math.abs(executiveSummary.totalDepositKrw);
  const depositDiffPct = depositDenom > 0 ? (depositDiff / depositDenom) * 100 : 0;
  const depositPassed =
    depositDiff <= 1 || (tolerancePct > 0 && depositDiffPct <= tolerancePct);
  checks.push({
    checkName: 'Tenant Roster vs Executive Deposit Consistency',
    executiveValue: executiveSummary.totalDepositKrw,
    detailValue: detailSchedule.tenantRosterTotal.totalDeposit,
    discrepancyKrwOrUnit: depositDiff,
    discrepancyPct: Number(depositDiffPct.toFixed(4)),
    tolerancePct,
    passed: depositPassed,
    message:
      depositDiff <= 1
        ? 'Executive Deposit exactly matches Tenant Roster Deposit sum.'
        : depositPassed
          ? `Executive Deposit matches Tenant Roster Deposit sum within tolerance (${depositDiff.toLocaleString()} KRW, ${depositDiffPct.toFixed(4)}%).`
          : `Deposit mismatch: ${depositDiff.toLocaleString()} KRW (${depositDiffPct.toFixed(2)}%)`,
  });

  // 6. Optional: Development Budget Consistency
  if (
    executiveSummary.totalDevelopmentCostKrw !== undefined &&
    detailSchedule.developmentBudgetTotalKrw !== undefined
  ) {
    const devDiff = Math.abs(
      executiveSummary.totalDevelopmentCostKrw -
        detailSchedule.developmentBudgetTotalKrw
    );
    const devDenom = Math.abs(executiveSummary.totalDevelopmentCostKrw);
    const devDiffPct = devDenom > 0 ? (devDiff / devDenom) * 100 : 0;
    const devPassed =
      devDiff <= 1 || (tolerancePct > 0 && devDiffPct <= tolerancePct);
    checks.push({
      checkName: 'Development Feasibility Budget Total Consistency',
      executiveValue: executiveSummary.totalDevelopmentCostKrw,
      detailValue: detailSchedule.developmentBudgetTotalKrw,
      discrepancyKrwOrUnit: devDiff,
      discrepancyPct: Number(devDiffPct.toFixed(4)),
      tolerancePct,
      passed: devPassed,
      message:
        devDiff <= 1
          ? 'Executive Development Cost matches detailed 5-tier budget total.'
          : devPassed
            ? `Executive Development Cost matches detailed 5-tier budget total within tolerance (${devDiff.toLocaleString()} KRW, ${devDiffPct.toFixed(4)}%).`
            : `Development cost mismatch: ${devDiff.toLocaleString()} KRW`,
    });
  }

  const failedChecks = checks.filter((c) => !c.passed);

  return {
    passed: failedChecks.length === 0,
    discrepancyCount: failedChecks.length,
    checks,
    tolerancePct,
  };
}
