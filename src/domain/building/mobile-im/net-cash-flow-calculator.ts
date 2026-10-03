/**
 * @file net-cash-flow-calculator.ts
 * @description 전문 투자자를 위한 직관적인 실투자금 & 월 순현금흐름 계산기
 * 
 * 실투자금(자기자본) 및 월 순현금흐름 산출:
 * 1. 실투자금(자기자본) = 매매가 - 대출금 - 보증금
 * 2. 월 순현금흐름 = 월 임대료 - 월 대출이자
 * 3. 자기자본수익률 = (연 순수익 / 실투자금) × 100
 */

export interface NetCashFlowInput {
  purchasePriceKrw: number;         // 매매 희망가 (원)
  monthlyRentKrw: number;           // 월 임대료 합계 (원)
  totalDepositKrw?: number;         // 임대 보증금 합계 (원)
  loanAmountKrw?: number;           // 선순위 대출금 (원)
  interestRatePct?: number;         // 대출 금리 (%, 기본 4.5%)
  landPriceTotalKrw?: number;       // 토지 공시지가 총액 (원)
  defaultLtvPct?: number;           // 대출 미입력 시 가정 LTV (%, 기본 50%)
}

export interface NetCashFlowSummary {
  askingPriceBil: number;           // 매매가 (억원)
  estimatedLoanBil: number;         // 대출금 (억원)
  totalDepositBil: number;          // 보증금 (억원)
  netEquityBil: number;             // 실투자금(자기자본) (억원)

  monthlyRentManwon: number;        // 월 임대료 (만원)
  monthlyInterestManwon: number;    // 월 대출이자 (만원)
  monthlyNetManwon: number;         // 월 순수익 (만원)

  annualNetBil: number;             // 연간 순수익 (억원)
  equityYieldPct: number;           // 자기자본수익률 (%)
  grossYieldPct: number;            // 총 수익률(Cap Rate 기준) (%)

  landSafetyRatioPct: number | null;// 토지 지분 가치 비중(토지 평가액 비중) (%)
  interestRatePct: number;          // 적용 금리 (%)
  isLoanEstimated: boolean;         // 대출금이 AI 추정인지 여부
}

/**
 * 투자자를 위한 실투자금 및 월 순현금흐름 핵심 3줄 지표를 계산합니다.
 */
export function calculateNetCashFlow(input: NetCashFlowInput): NetCashFlowSummary | null {
  const {
    purchasePriceKrw,
    monthlyRentKrw,
    totalDepositKrw = 0,
    interestRatePct = 4.5,
    landPriceTotalKrw = 0,
    defaultLtvPct = 50,
  } = input;

  if (purchasePriceKrw <= 0 || monthlyRentKrw <= 0) {
    return null;
  }

  // 대출금 결정 (입력값 없을 시 0원 처리)
  let loanKrw = input.loanAmountKrw || 0;
  let isLoanEstimated = false;

  // 실투자금 (자기자본) = 매매가 - 대출금 - 보증금
  const netEquityKrw = Math.max(0, purchasePriceKrw - loanKrw - totalDepositKrw);

  // 월 대출이자 (만원) = 대출금 × (금리 / 12)
  const monthlyInterestKrw = Math.round(loanKrw * (interestRatePct / 100 / 12));
  // 월 순수익 (만원) = 월 임대료 - 월 대출이자
  const monthlyNetKrw = monthlyRentKrw - monthlyInterestKrw;

  // 연간 순수익 (원)
  const annualNetKrw = monthlyNetKrw * 12;

  // 자기자본수익률 (%)
  const equityYieldPct = netEquityKrw > 0
    ? parseFloat(((annualNetKrw / netEquityKrw) * 100).toFixed(2))
    : 0;

  // 총 수익률 (Gross Yield, %)
  const grossYieldPct = parseFloat(((monthlyRentKrw * 12 / purchasePriceKrw) * 100).toFixed(2));

  // 토지 평가액 비중 (공시지가 토지가치 / 매매가)
  const landSafetyRatioPct = (purchasePriceKrw > 0 && landPriceTotalKrw > 0)
    ? parseFloat(((landPriceTotalKrw / purchasePriceKrw) * 100).toFixed(1))
    : null;

  return {
    askingPriceBil: parseFloat((purchasePriceKrw / 1e8).toFixed(1)),
    estimatedLoanBil: parseFloat((loanKrw / 1e8).toFixed(1)),
    totalDepositBil: parseFloat((totalDepositKrw / 1e8).toFixed(1)),
    netEquityBil: parseFloat((netEquityKrw / 1e8).toFixed(1)),

    monthlyRentManwon: Math.round(monthlyRentKrw / 10000),
    monthlyInterestManwon: Math.round(monthlyInterestKrw / 10000),
    monthlyNetManwon: Math.round(monthlyNetKrw / 10000),

    annualNetBil: parseFloat((annualNetKrw / 1e8).toFixed(2)),
    equityYieldPct,
    grossYieldPct,

    landSafetyRatioPct,
    interestRatePct,
    isLoanEstimated,
  };
}

/**
 * 투자자를 위한 직관적 3줄 요약 마크다운 생성
 */
export function formatNetCashFlowMarkdown(s: NetCashFlowSummary): string {
  const hasLoan = s.estimatedLoanBil > 0;
  
  const loanNote = hasLoan ? ` (금리 ${s.interestRatePct}%)` : '';
  const landSafetyText = s.landSafetyRatioPct !== null 
    ? `\n> 🛡️ **하방 안정성(토지 평가액 비중)**: 토지 지분 가치 비중 **${s.landSafetyRatioPct}%**로 매입 원금의 하방 경직성을 강력하게 지지합니다.` 
    : '';

  // Wave 9.3 (b안): 같은 IM 안의 '실투자금(취득비용 포함)'·'자기자본수익률(NOI÷순투자금)'과 구분되도록
  // 이 표의 모든 지표는 산출 기준(순투자금 / 운영비 차감 전)을 이름에 병기한다. 수치 자체는 변경 없음.
  const equityLabel = '① 순투자금 (매매가−보증금−대출)';

  const monthlyLabel = hasLoan
    ? '② 월 임대수입 (이자 차감·운영비 차감 전)'
    : '② 월 임대수입 (운영비 차감 전)';
  const monthlyNetDescription = hasLoan
    ? `월 임대료(${s.monthlyRentManwon.toLocaleString()}만) - 월 이자(${s.monthlyInterestManwon.toLocaleString()}만)${loanNote}`
    : `월 임대료(${s.monthlyRentManwon.toLocaleString()}만)`;
  // ③ 분자 = annualNet (대출 시 이자 차감 후) — 라벨·산출 기준을 분자와 일치시킨다.
  const yieldLabel = hasLoan
    ? '③ 임대수익률 (순투자금 대비·이자 차감 후·운영비 차감 전)'
    : '③ 임대수익률 (순투자금 대비·운영비 차감 전)';
  const yieldBasis = hasLoan
    ? `연 임대수입−이자(약 ${s.annualNetBil}억 원) ÷ 순투자금`
    : `연 임대수입(약 ${s.annualNetBil}억 원) ÷ 순투자금`;

  return `### 💡 투자금 · 월 임대수입 3줄 요약 (순투자금 기준)

| 핵심 지표 | 금액 / 수익률 | 산출 기준 |
|:---|---:|:---|
| **${equityLabel}** | **약 ${s.netEquityBil}억 원** | 매매가(${s.askingPriceBil}억) - 보증금(${s.totalDepositBil}억) - 대출(${s.estimatedLoanBil}억), 취득비용 제외 |
| **${monthlyLabel}** | **월 약 ${s.monthlyNetManwon.toLocaleString()}만 원** | ${monthlyNetDescription} |
| **${yieldLabel}** | **연 ${s.equityYieldPct}%** | ${yieldBasis} |
${landSafetyText}`;
}
