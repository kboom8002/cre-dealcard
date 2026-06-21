// src/domain/building/mobile-im/dcf-sensitivity.ts

export interface DCFInputs {
  purchasePriceKrw: number;
  initialNoiKrw: number;
  holdYears?: number; // default 10
  exitCapRate: number; // e.g. 0.045
  discountRate: number; // WACC (e.g. 0.06)
  rentGrowthRate: number; // e.g. 0.02
}

export interface SensitivityMatrixCell {
  exitCapRate: number;
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

/**
 * Newton-Raphson 반복법으로 IRR 근사 계산
 */
export function calculateIRR(cashFlows: number[]): number | null {
  let rate = 0.08;
  for (let iter = 0; iter < 150; iter++) {
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
    if (next < -0.99 || next > 20) return null;
    rate = next;
  }
  return null;
}

/**
 * 특정 Exit Cap Rate와 수익률(Discount Rate)에 따른 NPV/IRR 산출
 */
export function calculateDCFScenario(inputs: DCFInputs): { npv: number; irr: number | null; cashFlows: number[] } {
  const { purchasePriceKrw, initialNoiKrw, holdYears = 10, exitCapRate, discountRate, rentGrowthRate } = inputs;
  const cashFlows = [-purchasePriceKrw];
  let npv = -purchasePriceKrw;

  for (let y = 1; y <= holdYears; y++) {
    const periodNoi = initialNoiKrw * Math.pow(1 + rentGrowthRate, y - 1);
    let cashFlow = periodNoi;
    
    // 마지막 해에는 매각 대금(Terminal Value) 추가
    if (y === holdYears) {
      const exitValue = periodNoi / exitCapRate;
      cashFlow += exitValue;
    }
    
    cashFlows.push(cashFlow);
    npv += cashFlow / Math.pow(1 + discountRate, y);
  }

  const irr = calculateIRR(cashFlows);
  return { npv, irr, cashFlows };
}

/**
 * 10년 DCF 모델과 3x3 민감도 분석(Sensitivity Analysis) 매트릭스 계산
 */
export function generateDCFSensitivity(inputs: Omit<DCFInputs, 'exitCapRate' | 'discountRate'> & { baseExitCapRate: number; baseDiscountRate: number }): DCFOutputs {
  const { purchasePriceKrw, initialNoiKrw, holdYears = 10, rentGrowthRate, baseExitCapRate, baseDiscountRate } = inputs;

  const baseScenario = calculateDCFScenario({
    purchasePriceKrw,
    initialNoiKrw,
    holdYears,
    exitCapRate: baseExitCapRate,
    discountRate: baseDiscountRate,
    rentGrowthRate
  });

  const matrix: SensitivityMatrixCell[] = [];
  const capRateOffsets = [-0.005, 0, 0.005]; // -50bp, Base, +50bp
  const discountRateOffsets = [-0.01, 0, 0.01]; // -1%, Base, +1%

  for (const drOffset of discountRateOffsets) {
    for (const capOffset of capRateOffsets) {
      const currentExitCap = baseExitCapRate + capOffset;
      const currentDR = baseDiscountRate + drOffset;
      const scenario = calculateDCFScenario({
        purchasePriceKrw,
        initialNoiKrw,
        holdYears,
        exitCapRate: currentExitCap,
        discountRate: currentDR,
        rentGrowthRate
      });
      matrix.push({
        exitCapRate: currentExitCap,
        discountRate: currentDR,
        npv: scenario.npv,
        irr: scenario.irr
      });
    }
  }

  return {
    npvBase: baseScenario.npv,
    irrBase: baseScenario.irr,
    cashFlows: baseScenario.cashFlows,
    sensitivityMatrix: matrix
  };
}

/**
 * WACC(가중평균자본비용) 계산 - 레버리지 DCF 적용 시
 */
export function calculateWACC(equityRatio: number, costOfEquity: number, debtRatio: number, costOfDebt: number, taxRate: number = 0.22): number {
  const afterTaxCostOfDebt = costOfDebt * (1 - taxRate);
  return (equityRatio * costOfEquity) + (debtRatio * afterTaxCostOfDebt);
}
