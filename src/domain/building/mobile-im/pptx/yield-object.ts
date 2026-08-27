/**
 * @file yield-object.ts
 * @description D33 BL-C — 수익률 값·라벨 단일 객체
 *
 * 전 슬라이드가 **같은 Yield 인스턴스**를 참조합니다.
 * 라벨은 값에서 파생됩니다. 문자열 교정은 하지 않습니다.
 */

export type YieldBasis = 'GPI' | 'EGI' | 'NOI';
export type YieldDenominator = 'asking_price' | 'net_of_deposit';

export interface Yield {
  /** 수익률 % 값 */
  value: number;
  /** 산출 기준 (총임대료 / 유효총소득 / 순영업소득) */
  basis: YieldBasis;
  /** NOI 기준일 때 공제 항목 목록 (basis='NOI'이면 1건 이상 필수) */
  deductions: Array<{ name: string; amount: number }>;
  /** 분모 기준 */
  denominator: YieldDenominator;
}

const BASIS_KR: Record<YieldBasis, string> = {
  GPI: '총임대료',
  EGI: '유효총소득',
  NOI: '순영업소득',
};

const DENOM_KR: Record<YieldDenominator, string> = {
  asking_price: '매매가격',
  net_of_deposit: '보증금 차감 순투자금',
};

/**
 * Yield 객체로부터 한국어 라벨을 파생합니다.
 * 라벨은 계산 결과이지 교정 대상이 아닙니다.
 */
export function yieldLabel(y: Yield): string {
  const basisName = y.basis === 'NOI' ? '순수익률' : '수익률';
  return `연 ${basisName}(Cap Rate, 기준: ${BASIS_KR[y.basis]} ÷ ${DENOM_KR[y.denominator]})`;
}

/**
 * G38: basis='NOI'인데 deductions가 비어있으면 차단.
 * NOI를 주장하면서 공제 항목이 없으면 총임대료와 구분 불가.
 */
export function validateYield(y: Yield): boolean {
  if (y.basis === 'NOI' && y.deductions.length === 0) return false;
  return true;
}

/**
 * heroCard 또는 IMCore에서 Yield 단일 객체를 구성합니다.
 */
export function buildYieldFromHeroCard(heroCard: {
  yieldBasis?: string;
  capRateBase?: number;
  noiDeductions?: Array<{ name: string; amount: number }>;
  denominator?: string;
}): Yield | null {
  if (!heroCard.capRateBase) return null;

  const isNoi = heroCard.yieldBasis === 'NOI';
  return {
    value: heroCard.capRateBase,
    basis: isNoi ? 'NOI' : 'GPI',
    deductions: isNoi ? (heroCard.noiDeductions ?? []) : [],
    denominator: (heroCard.denominator as YieldDenominator) ?? 'asking_price',
  };
}

/**
 * IMCore yields 구조에서 Yield 단일 객체를 구성합니다.
 */
export function buildYieldFromIMCore(yields: {
  gross_price?: { value: number; basis?: string };
}, noiDeductions?: Array<{ name: string; amount: number }>): Yield | null {
  const grossYield = yields.gross_price;
  if (!grossYield) return null;

  const noiBases = ['noi_price', 'noi_price_deposit', 'noi_equity', 'noi_total_cost'];
  const isNoi = grossYield.basis ? noiBases.includes(grossYield.basis) : false;

  return {
    value: grossYield.value,
    basis: isNoi ? 'NOI' : 'GPI',
    deductions: isNoi ? (noiDeductions ?? []) : [],
    denominator: 'asking_price',
  };
}
