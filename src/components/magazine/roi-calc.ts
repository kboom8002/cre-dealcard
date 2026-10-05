/**
 * src/components/magazine/roi-calc.ts — 수지분석 계산기 엔진 (순수 함수)
 *
 * ⚠️ 계산식은 `RoiCalculator.tsx` 인라인 로직을 **그대로** 옮긴 것이다 (E-03 회귀 보호, 변경 금지).
 * 회귀 수치(단위테스트로 고정):
 *  - 양호: 50억 / LTV 50 / 4.5% / 보증금 5억 / 월 2,500만 / 공실 0 / 5층 → Cap 5.70%, CoC 8.63%, 월 CF +1,438만
 *  - 위험: 50억 / LTV 70 / 6.0% / 보증금 2억 / 월 1,500만 / 공실 3층 / 5층 → Cap 1.34%, CoC −10.06%, 월 CF −1,190만
 */

/** 핵심 가정 (면책에 그대로 노출한다, T3-27). */
export const ROI_ASSUMPTIONS = {
  /** 관리비 = 유효 임대수입의 10% */
  managementCostRate: 0.1,
  /** 보증금 운용이자 연 3% */
  depositReturnRate: 0.03,
} as const;

export interface RoiInputs {
  /** 매입가 (원) */
  purchasePrice: number;
  /** 대출비율 % */
  ltvRatio: number;
  /** 대출금리 % */
  interestRate: number;
  /** 보증금 합계 (원) */
  deposit: number;
  /** 월세 합계 (원) */
  monthlyRent: number;
  /** 공실 층수 */
  vacancyFloors: number;
  /** 전체 층수 */
  totalFloors: number;
}

export interface RoiResult {
  loanAmount: number;
  equity: number;
  annualRent: number;
  annualInterest: number;
  noi: number;
  capRate: number;
  cashOnCash: number;
  monthlyCashFlow: number;
  occupancyRate: number;
}

export function computeRoi(i: RoiInputs): RoiResult {
  const { purchasePrice, ltvRatio, interestRate, deposit, monthlyRent, vacancyFloors, totalFloors } = i;

  const loanAmount = purchasePrice * (ltvRatio / 100);
  const annualRent = monthlyRent * 12;
  const annualInterest = loanAmount * (interestRate / 100);
  const depositReturn = deposit * ROI_ASSUMPTIONS.depositReturnRate; // 보증금 운용이자 (3% 가정)

  // 공실 반영
  const occupancyRate = totalFloors > 0 ? (totalFloors - vacancyFloors) / totalFloors : 1;
  const effectiveRent = annualRent * occupancyRate;
  const effectiveDeposit = deposit * occupancyRate;

  // NOI (순영업소득)
  const managementCost = effectiveRent * ROI_ASSUMPTIONS.managementCostRate; // 관리비 10% 가정
  const noi = effectiveRent + depositReturn * occupancyRate - managementCost;

  // Cap Rate
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

  // Cash-on-Cash Return (자기자본수익률)
  const netCashFlow = noi - annualInterest;
  const actualEquity = Math.max(purchasePrice - loanAmount - effectiveDeposit, 1);
  const cashOnCash = (netCashFlow / actualEquity) * 100;

  // 월 순현금흐름
  const monthlyCashFlow = netCashFlow / 12;

  return {
    loanAmount,
    equity: actualEquity,
    annualRent: effectiveRent,
    annualInterest,
    noi,
    capRate,
    cashOnCash,
    monthlyCashFlow,
    occupancyRate: occupancyRate * 100,
  };
}

/** 입력 범위 보정(직접 입력용). 숫자가 아니면 null. */
export function clampInput(raw: number, min: number, max: number): number | null {
  if (!Number.isFinite(raw)) return null;
  return Math.min(max, Math.max(min, raw));
}

/** 총 층수 입력 범위 (T3-46: 직접 입력 가능) */
export const TOTAL_FLOORS_MIN = 1;
export const TOTAL_FLOORS_MAX = 60;

export const ROI_DEFAULTS: RoiInputs = {
  purchasePrice: 3_000_000_000,
  ltvRatio: 60,
  interestRate: 4.5,
  deposit: 500_000_000,
  monthlyRent: 15_000_000,
  vacancyFloors: 0,
  totalFloors: 5,
};
