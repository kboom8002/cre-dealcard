import { FinancialInputs, calculateNOI, calculateAcquisitionCost } from '../financials';

export interface ValueGrowthInput {
  landRatio: number;                   // 토지 가치 비중 (0~1)
  scenarios: {
    downside: number;                  // 기본 -2.0%
    base: number;                      // 동 단위 공시지가 3년 평균
    upside: number;                    // 5년 최고
  };
  source: 'gongsi_dong_3y' | 'gongsi_dong_5y' | 'transaction_based' | 'manual';
  buildingDepreciation: number | null;
}

export interface TotalReturnResult {
  label: string;                       // '하락', '보수', '기준', '낙관'
  landGrowthPct: number;
  cocPct: number;                      // Cash on Cash
  capitalGainPct: number;
  totalReturnPct: number;
  leveragedTotalReturnPct: number | null;
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

  const results: TotalReturnResult[] = [];

  const addScenario = (label: string, landGrowthPct: number) => {
    const loan = loanScenarios && loanScenarios.length > 0 ? loanScenarios[0] : { amountKrw: 0, interestRatePct: 0 };
    const equity = Math.max(0, initialCost - loan.amountKrw);
    
    const landValue = financials.askingPriceKrw * valueGrowth.landRatio;
    const buildingValue = financials.askingPriceKrw * (1 - valueGrowth.landRatio);
    const depreciation = valueGrowth.buildingDepreciation ?? 0;
    
    const newLandValue = landValue * (1 + landGrowthPct / 100);
    const newBuildingValue = buildingValue * (1 - depreciation / 100);
    
    const capitalGain = (newLandValue + newBuildingValue) - financials.askingPriceKrw;
    
    const annualInterest = loan.amountKrw * (loan.interestRatePct / 100);
    
    const coc = equity > 0 ? ((noi - annualInterest) / equity) * 100 : 0;
    const capitalGainPct = initialCost > 0 ? (capitalGain / initialCost) * 100 : 0;
    const totalReturnPct = initialCost > 0 ? ((noi + capitalGain) / initialCost) * 100 : 0;
    
    const leveragedTotalReturnPct = equity > 0 ? ((noi - annualInterest + capitalGain) / equity) * 100 : null;

    results.push({
      label,
      landGrowthPct,
      cocPct: coc,
      capitalGainPct,
      totalReturnPct,
      leveragedTotalReturnPct
    });
  };

  addScenario('하락', valueGrowth.scenarios.downside);
  addScenario('기준', valueGrowth.scenarios.base);
  addScenario('낙관', valueGrowth.scenarios.upside);

  return results;
}
