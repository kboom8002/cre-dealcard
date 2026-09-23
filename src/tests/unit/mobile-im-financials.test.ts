import { describe, it, expect } from 'vitest';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import type { FinancialInputs } from '@/domain/building/mobile-im/financials';

describe('mobile-im-financials', () => {
  it('calculates NOI and Cap Rate for income posture', async () => {
    const inputs: FinancialInputs = {
      posture: 'income',
      purchasePriceKrw: 1000000000, // 10억
      monthlyRentKrw: 5000000,      // 500만
      assetType: '근린생활시설',
      totalAreaSqm: 500,
    };
    
    const res = calculateFinancials(inputs);
    expect(res.posture).toBe('income');
    expect(res.annualNoi.base).toBeGreaterThan(0);
    expect(res.capRate).not.toBeNull();
    if (res.capRate) {
      expect(res.capRate.base).toBeGreaterThan(0);
    }
  });

  it('handles edge cases: 0 price', async () => {
    const inputs: FinancialInputs = {
      posture: 'income',
      purchasePriceKrw: 0,
      monthlyRentKrw: 5000000,
      assetType: '근린생활시설',
    };
    const res = calculateFinancials(inputs);
    expect(res.capRate).toBeNull();
    expect(res.irr5Year).toBeNull();
    expect(res.pricePerPyeong).toBeNull();
  });

  it('tests 5 posture variations', async () => {
    const inputs: FinancialInputs = {
      purchasePriceKrw: 1000000000,
      monthlyRentKrw: 5000000,
    };
    
    const res1 = calculateFinancials({ ...inputs, posture: 'development' });
    expect(res1.posture).toBe('development');
    expect(res1.devProfitMarginPct).toBeDefined();

    const res2 = calculateFinancials({ ...inputs, posture: 'operating', annualRevenueKrw: 100000000 });
    expect(res2.posture).toBe('operating');
    expect(res2.annualGopBil).toBeDefined();

    const res3 = calculateFinancials({ ...inputs, posture: 'owner_occupied', selfUseAreaPyeong: 100 });
    expect(res3.posture).toBe('owner_occupied');
    expect(res3.ownVsLeaseSavingsBil).toBeDefined();

    const res4 = calculateFinancials({ ...inputs, posture: 'trading' });
    expect(res4.posture).toBe('trading');
    expect(res4.targetCapitalGainBil).toBeDefined();
  });
});
