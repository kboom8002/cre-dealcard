import { describe, it, expect } from 'vitest';
import { calculateFinancials, formatFinancialsMarkdown } from '../financials';
import { simulateLoanScenarios } from '../loan-simulation';
import { compareTaxScenarios } from '../tax-scenarios';
import { analyzeEviction, formatEvictionMarkdown } from '../lease-adapter';

describe('Financials Strategy Pattern — 5 Postures', () => {
  const baseInput = {
    purchasePriceKrw: 10_000_000_000, // 100억 원
    totalAreaSqm: 1000,
    platAreaSqm: 300,
    landPricePerSqm: 10_000_000,
    monthlyRentKrw: 40_000_000,
  };

  it('income: should calculate Cap Rate and 5-Year IRR', () => {
    const res = calculateFinancials({ ...baseInput, posture: 'income' });
    expect(res.posture).toBe('income');
    expect(res.capRate).not.toBeNull();
    expect(res.capRate!.base).toBeGreaterThan(0);
    expect(res.irr5Year).not.toBeNull();

    const md = formatFinancialsMarkdown(res);
    expect(md).toContain('Cap Rate');
    expect(md).toContain('연 순영업소득');
  });

  it('development: should calculate project feasibility metrics instead of Cap Rate', () => {
    const res = calculateFinancials({
      ...baseInput,
      posture: 'development',
      constructionCostPerPyeong: 800,
      targetGrossAreaPyeong: 1200,
      expectedSalesPricePerPyeong: 4000,
    });
    expect(res.posture).toBe('development');
    expect(res.capRate).toBeNull();
    expect(res.devProfitMarginPct).not.toBeNull();
    expect(res.totalProjectCostBil).not.toBeNull();
    expect(res.landPricePerPyeong).not.toBeNull();

    const md = formatFinancialsMarkdown(res);
    expect(md).toContain('개발 사업수지 지표');
    expect(md).toContain('개발 이익률 추정');
  });

  it('operating: should calculate GOP and GOP Cap Rate', () => {
    const res = calculateFinancials({
      ...baseInput,
      posture: 'operating',
      annualRevenueKrw: 3_000_000_000, // 30억
      gopMarginPct: 35,
      adrKrw: 200_000,
      occPct: 80,
    });
    expect(res.posture).toBe('operating');
    expect(res.annualGopBil).not.toBeNull();
    expect(res.gopCapRatePct).not.toBeNull();
    expect(res.revparKrw).toBe(160_000);

    const md = formatFinancialsMarkdown(res);
    expect(md).toContain('운영 재무 지표 (GOP 기반)');
    expect(md).toContain('GOP 마진율');
  });

  it('owner_occupied: should calculate own vs lease annual savings', () => {
    const res = calculateFinancials({
      ...baseInput,
      posture: 'owner_occupied',
      marketRentPerPyeongKrw: 80_000,
      selfUseAreaPyeong: 300,
      loanAmountManwon: 500_000, // 50억 대출
    });
    expect(res.posture).toBe('owner_occupied');
    expect(res.ownVsLeaseSavingsBil).not.toBeNull();
    expect(res.breakevenYears).not.toBeNull();

    const md = formatFinancialsMarkdown(res);
    expect(md).toContain('자가사용 비용 비교 지표');
    expect(md).toContain('임차 대비 연 절감액');
  });

  it('trading: should calculate market discount and target HPR', () => {
    const res = calculateFinancials({
      ...baseInput,
      posture: 'trading',
      comparablePricePerPyeongKrw: 40_000_000,
      targetExitPriceKrw: 12_500_000_000, // 125억 매각
    });
    expect(res.posture).toBe('trading');
    expect(res.marketDiscountPct).not.toBeNull();
    expect(res.targetCapitalGainBil).toBe(25);
    expect(res.targetHprPct).not.toBeNull();

    const md = formatFinancialsMarkdown(res);
    expect(md).toContain('매매 시세 분석 지표');
    expect(md).toContain('목표 시세차익');
  });
});

describe('Loan Simulation — 2-Stage PF & Mortgage', () => {
  it('income: should produce mortgage scenarios with LTV range', () => {
    const res = simulateLoanScenarios({
      posture: 'income',
      askingPriceManwon: 1_000_000, // 100억
      annualNoiKrw: 400_000_000,
    });
    expect(res.scenarios).toHaveLength(5);
    expect(res.recommendedLtv).toBeGreaterThanOrEqual(30);
    expect(res.markdownTable).toContain('대출 시나리오 비교');
  });

  it('development: should produce 2-stage PF scenarios (Bridge + Main PF)', () => {
    const res = simulateLoanScenarios({
      posture: 'development',
      askingPriceManwon: 1_000_000, // 100억
      annualNoiKrw: 0,
      totalProjectCostManwon: 1_800_000, // 180억
    });
    expect(res.scenarios).toHaveLength(2);
    expect(res.scenarios[0].stageName).toContain('브릿지론');
    expect(res.scenarios[1].stageName).toContain('본 PF');
    expect(res.markdownTable).toContain('신축 개발 PF');
  });
});

describe('Tax Scenarios — Corporate & Development Charges', () => {
  it('should differentiate individual vs corporate acquisition tax in metropolitan area', () => {
    const res = compareTaxScenarios({
      askingPriceManwon: 1_000_000,
      annualNoiKrw: 400_000_000,
      isMetropolitanArea: true,
    });
    const individual = res.scenarios.find(s => s.type === '개인');
    const corporate = res.scenarios.find(s => s.type === '법인');
    expect(individual!.acquisitionTaxRatePct).toBe(4.6);
    expect(corporate!.acquisitionTaxRatePct).toBe(9.2); // 과밀억제 중과세
  });

  it('development: should calculate farmland and development charges', () => {
    const res = compareTaxScenarios({
      posture: 'development',
      askingPriceManwon: 1_000_000,
      annualNoiKrw: 0,
      officialLandPricePerSqm: 5_000_000,
      platAreaSqm: 500,
      farmlandAreaSqm: 300,
    });
    const devCharge = res.scenarios.find(s => s.type === '개발부담금');
    expect(devCharge).toBeDefined();
    expect(devCharge!.notes.length).toBeGreaterThan(0);
  });

  it('trading: 1-year holding period should apply short-term capital gains tax', () => {
    const res = compareTaxScenarios({
      posture: 'trading',
      askingPriceManwon: 1_000_000,
      annualNoiKrw: 0,
      holdingPeriodYears: 0.8, // 1년 미만
      annualAppreciationPct: 20, // 20% 상승
    });
    const seller = res.scenarios.find(s => s.type === '매도자');
    expect(seller!.notes[0]).toContain('1년 미만');
  });
});

describe('Lease Adapter — Development Eviction Analysis', () => {
  it('should calculate eviction costs, deposits, and timeline for active tenants', () => {
    const leases = [
      { floor: '1F', tenantType: 'retail', areaSqm: 100, depositKrw: 50_000_000, monthlyRentKrw: 3_000_000, mgmtFeeKrw: 300_000, leaseStart: '2023-01-01', leaseEnd: '2027-01-01', isVacant: false },
      { floor: '2F', tenantType: 'office', areaSqm: 150, depositKrw: 100_000_000, monthlyRentKrw: 5_000_000, mgmtFeeKrw: 500_000, leaseStart: '2023-01-01', leaseEnd: '2026-06-01', isVacant: false },
    ];
    const eviction = analyzeEviction(leases);
    expect(eviction.totalTenants).toBe(2);
    expect(eviction.depositRefundKrw).toBe(150_000_000);
    expect(eviction.estimatedEvictionCostKrw).toBeGreaterThan(0);

    const md = formatEvictionMarkdown(eviction);
    expect(md).toContain('명도 및 철거 준비 현황');
    expect(md).toContain('2세대');
  });
});
