import { FinancialInputs, calculateNOI, calculateAcquisitionCost } from '../financials';

export interface ValueGrowthInput {
  annualGrowthRatePct: number;
  holdingPeriodYears: number;
}

export interface TotalReturnResult {
  scenarioName: string;
  totalReturnKrw: number;
  irrPct: number;
  equityMultiple: number;
  isDownside: boolean;
}

export interface LoanScenario {
  amountKrw: number;
  interestRatePct: number;
}

export function calculateTotalReturn(
  financials: FinancialInputs,
  valueGrowth: ValueGrowthInput,
  loanScenarios?: LoanScenario[]
): TotalReturnResult[] {
  const noi = calculateNOI(
    financials.grossAnnualIncomeKrw,
    financials.opexRatioPct,
    financials.vacancyReservePct,
    financials.ancillaryIncomeKrw
  ).value;
  
  const initialCost = calculateAcquisitionCost(financials.askingPriceKrw).totalCostKrw;
  const holdYears = valueGrowth.holdingPeriodYears;

  const results: TotalReturnResult[] = [];

  const addScenario = (scenarioName: string, growthPct: number, isDownside: boolean) => {
    const loan = loanScenarios && loanScenarios.length > 0 ? loanScenarios[0] : { amountKrw: 0, interestRatePct: 0 };
    const equity = Math.max(0, initialCost - loan.amountKrw);
    if (equity <= 0) return;

    let totalCashFlow = 0;
    const annualInterest = loan.amountKrw * (loan.interestRatePct / 100);
    
    for (let i = 0; i < holdYears; i++) {
      totalCashFlow += (noi - annualInterest);
    }

    const exitValue = financials.askingPriceKrw * Math.pow(1 + growthPct / 100, holdYears);
    const exitCost = exitValue * 0.01; // Assume 1% exit cost
    const exitProceeds = exitValue - exitCost - loan.amountKrw;
    
    const totalReturnKrw = totalCashFlow + (exitProceeds - equity);
    const equityMultiple = (totalCashFlow + exitProceeds) / equity;
    
    // Very simple IRR approximation for the sake of the exercise
    const irrPct = (Math.pow(equityMultiple, 1 / holdYears) - 1) * 100;

    results.push({
      scenarioName,
      totalReturnKrw,
      irrPct,
      equityMultiple,
      isDownside
    });
  };

  addScenario('Base Case', valueGrowth.annualGrowthRatePct, false);
  addScenario('Downside (-2% Growth)', valueGrowth.annualGrowthRatePct - 2, true);
  
  const hasDownside = results.some(r => r.isDownside);
  if (!hasDownside) {
    addScenario('Forced Downside (-5% Growth)', -5, true);
  }

  return results;
}
