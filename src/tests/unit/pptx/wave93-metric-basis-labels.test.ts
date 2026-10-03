import { describe, it, expect } from 'vitest';
import { normalizeSummaryLabel } from '@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid';
import { buildYieldFromHeroCard, yieldLabel, validateYield } from '@/domain/building/mobile-im/pptx/yield-object';
import { formatNetCashFlowMarkdown } from '@/domain/building/mobile-im/net-cash-flow-calculator';

// Wave 9.3 (b안): Basic IM 지표 라벨에 산출 기준 병기
describe('Wave 9.3 — A02 요약 라벨 기준 병기', () => {
  it('NOI 기반 yieldLabel → "Cap Rate (NOI÷매매가)"', () => {
    const y = buildYieldFromHeroCard({
      capRateBase: 1.98,
      yieldBasis: 'NOI',
      noiDeductions: [{ name: '공실·운영비', amount: 123_000_000 }],
    })!;
    expect(validateYield(y)).toBe(true); // G38 통과
    expect(normalizeSummaryLabel(yieldLabel(y))).toBe('Cap Rate (NOI÷매매가)');
  });

  it('yieldBasis 미지정(GPI) → "Cap Rate (총임대료÷매매가)" — 닫는 괄호 유실 없음', () => {
    const y = buildYieldFromHeroCard({ capRateBase: 4.2 })!;
    expect(normalizeSummaryLabel(yieldLabel(y))).toBe('Cap Rate (총임대료÷매매가)');
  });

  it('"연 수익률(Cap Rate, 기준: NOI)" → "Cap Rate (NOI÷매매가)"', () => {
    expect(normalizeSummaryLabel('연 수익률(Cap Rate, 기준: NOI)')).toBe('Cap Rate (NOI÷매매가)');
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
