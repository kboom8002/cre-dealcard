/**
 * @module DerivedEnricher
 * @description Computes derived fields from raw asset ontology slots.
 * Automatically calculates secondary data that can be inferred from primary inputs.
 * @see SDD §6 S1-T6
 */

export interface DerivedFields {
  noiKrw: number;
  capRatePct: number;
  pricePyung: number;
  buildingAgeYears: number;
  leverageRatio: number;
  netYieldPct: number;
  monthlyNoi: number;
  annualDebtService: number;
  dscr: number; // Debt Service Coverage Ratio
}

/**
 * Computes derived financial and physical fields from raw asset data.
 * @param attrs - Raw asset attributes from the ontology
 * @returns Computed derived fields
 */
export function computeDerivedFields(attrs: Record<string, unknown>): DerivedFields {
  const askingPrice = Number(attrs.askingPriceKrw || 0);
  const grossIncome = Number(attrs.grossAnnualIncomeKrw || 0);
  const opexRatio = Number(attrs.opexRatioPct || 10) / 100;
  const vacancyRate = Number(attrs.vacancyReservePct || 5) / 100;
  const totalDeposit = Number(attrs.totalDepositKrw || 0);
  const loanAmount = Number(attrs.loanAmountKrw || 0);
  const loanRate = Number(attrs.loanInterestRatePct || 4.5) / 100;
  const floorArea = Number(attrs.totalFloorAreaPyung || 0);
  const buildYear = Number(attrs.buildYear || 0);
  const currentYear = new Date().getFullYear();

  const effectiveIncome = grossIncome * (1 - vacancyRate);
  const opex = effectiveIncome * opexRatio;
  const noi = effectiveIncome - opex;
  const capRate = askingPrice > 0 ? (noi / askingPrice) * 100 : 0;
  const pricePyung = floorArea > 0 ? Math.round(askingPrice / floorArea) : 0;
  const buildingAge = buildYear > 0 ? currentYear - buildYear : 0;
  const leverageRatio = askingPrice > 0 ? ((loanAmount + totalDeposit) / askingPrice) * 100 : 0;
  const netYield = askingPrice > 0 ? ((noi - (loanAmount * loanRate)) / (askingPrice - loanAmount)) * 100 : 0;
  const monthlyNoi = Math.round(noi / 12);
  const annualDebtService = loanAmount * loanRate;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

  return {
    noiKrw: Math.round(noi),
    capRatePct: Math.round(capRate * 100) / 100,
    pricePyung,
    buildingAgeYears: buildingAge,
    leverageRatio: Math.round(leverageRatio * 10) / 10,
    netYieldPct: Math.round(netYield * 100) / 100,
    monthlyNoi,
    annualDebtService: Math.round(annualDebtService),
    dscr: Math.round(dscr * 100) / 100,
  };
}
