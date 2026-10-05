/**
 * @file yield-object.ts
 * @description D33 BL-C — 수익률 값·라벨 단일 객체
 *
 * 전 슬라이드가 **같은 Yield 인스턴스**를 참조합니다.
 * 라벨은 값에서 파생됩니다. 문자열 교정은 하지 않습니다.
 */

import { summaryCapRateSub } from '../yield-set';
import { fmtFixed } from '@/lib/format/safe-number';

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
  /** D10: NOI 근거 (있으면 yieldBasis 미기록 레거시 heroCard도 NOI로 판정) */
  noiBaseBil?: number | null;
  opexPct?: number | null;
  vacancyReservePct?: number | null;
}): Yield | null {
  if (!heroCard.capRateBase) return null;

  // D10: capRateBase = NOI(base) ÷ 매매가 (FinancialCalculator). 명시적 'GPI'가 아니고 NOI 근거(NOI 금액·운영비율)가
  // 있으면 NOI로 본다 — 값은 NOI인데 '총임대료' 라벨이 붙는 오라벨 방지.
  const hasNoiEvidence = (heroCard.noiBaseBil != null && Number(heroCard.noiBaseBil) > 0)
    || (heroCard.opexPct != null && Number.isFinite(Number(heroCard.opexPct)));
  const isNoi = heroCard.yieldBasis === 'NOI' || (heroCard.yieldBasis !== 'GPI' && hasNoiEvidence);
  // 공제 금액을 기록하지 않은 레거시 heroCard: 항목명만 남기고 금액은 0(미기록)으로 둔다 — G38은 공제 '항목' 존재를 요구.
  const deductions = isNoi
    ? (heroCard.noiDeductions && heroCard.noiDeductions.length > 0
      ? heroCard.noiDeductions
      : (heroCard.yieldBasis === undefined ? [{ name: '운영비·공실충당', amount: 0 }] : []))
    : [];
  return {
    value: heroCard.capRateBase,
    basis: isNoi ? 'NOI' : 'GPI',
    deductions,
    denominator: (heroCard.denominator as YieldDenominator) ?? 'asking_price',
  };
}

/**
 * D10: 요약 슬라이드의 수익률 카드 1장 (라벨·값·부제). 수익률 슬라이드(A23)와 같은 YieldSet 정의를 따른다.
 *  - NOI 기준: 부제에 운영비율(가정/제공)·공실충당 명시
 *  - 총임대료 기준: Cap Rate로 부르지 않고 '임대수익률 (Gross)' + '운영비 차감 전'
 */
export function yieldSummaryMetric(
  y: Yield,
  assumptions: { opexPct?: number | null; opexSource?: 'user' | 'assumed'; vacancyReservePct?: number | null },
): { label: string; value: string; sub: string } {
  return {
    label: yieldLabel(y),
    value: fmtFixed(y.value, 2, '%'),
    sub: y.basis === 'NOI' ? summaryCapRateSub(assumptions) : '운영비 차감 전',
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
