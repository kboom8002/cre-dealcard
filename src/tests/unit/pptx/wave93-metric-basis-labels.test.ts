import { describe, it, expect } from 'vitest';
import { normalizeSummaryLabel } from '@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid';
import { buildYieldFromHeroCard, yieldLabel, validateYield } from '@/domain/building/mobile-im/pptx/yield-object';
import { formatNetCashFlowMarkdown } from '@/domain/building/mobile-im/net-cash-flow-calculator';

// Wave 9.3 (b안): Basic IM 지표 라벨에 산출 기준 병기
describe('Wave 9.3 / D10 — A02 요약 라벨 기준 병기', () => {
  it('NOI 기반 yieldLabel → "Cap Rate (NOI 기준)"', () => {
    const y = buildYieldFromHeroCard({
      capRateBase: 1.98,
      yieldBasis: 'NOI',
      noiDeductions: [{ name: '공실·운영비', amount: 123_000_000 }],
    })!;
    expect(validateYield(y)).toBe(true); // G38 통과
    expect(normalizeSummaryLabel(yieldLabel(y))).toBe('Cap Rate (NOI 기준)');
  });

  it('yieldBasis 미지정·NOI 근거 없음(GPI) → Cap Rate로 부르지 않고 "임대수익률 (Gross, 매매가 대비)"', () => {
    const y = buildYieldFromHeroCard({ capRateBase: 4.2 })!;
    expect(normalizeSummaryLabel(yieldLabel(y))).toBe('임대수익률 (Gross, 매매가 대비)');
  });

  it('D10: yieldBasis 미기록 레거시 heroCard라도 NOI 근거(noiBaseBil·opexPct)가 있으면 NOI로 판정 (GPI 오라벨 방지)', () => {
    const y = buildYieldFromHeroCard({ capRateBase: 2.29, noiBaseBil: 1.2, opexPct: 20 })!;
    expect(y.basis).toBe('NOI');
    expect(validateYield(y)).toBe(true);
    expect(normalizeSummaryLabel(yieldLabel(y))).toBe('Cap Rate (NOI 기준)');
  });

  it('D10: 명시적 yieldBasis="GPI"는 NOI 근거가 있어도 GPI 유지, 명시 NOI+공제 없음은 G38 차단 유지', () => {
    expect(buildYieldFromHeroCard({ capRateBase: 3, yieldBasis: 'GPI', opexPct: 20 })!.basis).toBe('GPI');
    const y = buildYieldFromHeroCard({ capRateBase: 3, yieldBasis: 'NOI' })!;
    expect(validateYield(y)).toBe(false);
  });

  it('"연 수익률(Cap Rate, 기준: NOI)" → "Cap Rate (NOI 기준)"', () => {
    expect(normalizeSummaryLabel('연 수익률(Cap Rate, 기준: NOI)')).toBe('Cap Rate (NOI 기준)');
  });


  it('실투자금 / 필요 실투자금 → "실투자금 (취득비용 포함)"', () => {
    expect(normalizeSummaryLabel('실투자금')).toBe('실투자금 (취득비용 포함)');
    expect(normalizeSummaryLabel('필요 실투자금')).toBe('실투자금 (취득비용 포함)');
  });

  it('기타 라벨은 그대로', () => {
    expect(normalizeSummaryLabel('매매 희망가')).toBe('매매 희망가');
    expect(normalizeSummaryLabel('대지면적')).toBe('대지면적');
  });
});

describe('Wave 9.3 — NCF ③ 라벨은 분자(이자 차감 여부)와 일치', () => {
  const base = {
    askingPriceBil: 100, totalDepositBil: 10, netEquityBil: 50,
    monthlyRentManwon: 3000, monthlyInterestManwon: 1500, monthlyNetManwon: 1500,
    annualNetBil: 1.8, equityYieldPct: 3.6, interestRatePct: 4.5, landSafetyRatioPct: null,
  } as any;

  it('대출 없음 → "운영비 차감 전", 연 임대수입 ÷ 순투자금', () => {
    const md = formatNetCashFlowMarkdown({ ...base, estimatedLoanBil: 0 });
    expect(md).toContain('③ 임대수익률 (순투자금 대비·운영비 차감 전)');
    expect(md).toContain('연 임대수입(약 1.8억 원) ÷ 순투자금');
    expect(md).not.toContain('이자 차감 후');
  });

  it('대출 있음 → "이자 차감 후" 병기, 연 임대수입−이자 ÷ 순투자금', () => {
    const md = formatNetCashFlowMarkdown({ ...base, estimatedLoanBil: 40 });
    expect(md).toContain('③ 임대수익률 (순투자금 대비·이자 차감 후·운영비 차감 전)');
    expect(md).toContain('연 임대수입−이자(약 1.8억 원) ÷ 순투자금');
  });
});
