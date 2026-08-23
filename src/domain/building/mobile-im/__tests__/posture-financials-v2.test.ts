// src/domain/building/mobile-im/__tests__/posture-financials-v2.test.ts
import { describe, it, expect } from 'vitest';
import { calculateFinancials, formatFinancialsMarkdown } from '../financials';

describe('Posture Financial Strategies v2 (Phase 3-2)', () => {
  describe('Income Strategy — Total Acquisition Cost & Negative Leverage', () => {
    it('PF2-01: calculates total acquisition cost with 4.6% tax and 0.9% broker fee', () => {
      const result = calculateFinancials({
        posture: 'income',
        purchasePriceKrw: 10_000_000_000, // 100억
        monthlyRentKrw: 35_000_000,        // 월 3,500만 (연 4.2억, 4.2%)
        totalDepositManwon: 50_000,        // 5억
        loanAmountManwon: 500_000,         // 50억 (50% LTV)
      });

      // 취득원가 = 100억 + 4.6억(취득세) + 0.9억(중개보수) = 105.5억
      expect(result.totalAcquisitionCostBil).toBe(105.5);
      expect(result.acquisitionTaxBil).toBe(4.6);
      expect(result.brokerFeeBil).toBe(0.9);
      // 실투자금 = 105.5억 - 5억 - 50억 = 50.5억
      expect(result.equityRequired).toBe(50.5);
    });

    it('PF2-02: detects negative leverage when yield (3.2%) < loan rate (4.5%)', () => {
      const result = calculateFinancials({
        posture: 'income',
        purchasePriceKrw: 10_000_000_000, // 100억
        monthlyRentKrw: 26_666_667,        // 연 3.2억 (3.2%)
        loanAmountManwon: 500_000,         // 50억 대출
      });

      expect(result.negativeLeverage).toBe(true);
      expect(result.negativeLeverageWarning).toContain('역레버리지');
    });

    it('PF2-03: no negative leverage when yield (5.0%) > loan rate (4.5%)', () => {
      const result = calculateFinancials({
        posture: 'income',
        purchasePriceKrw: 10_000_000_000, // 100억
        monthlyRentKrw: 41_666_667,        // 연 5.0억 (5.0%)
        loanAmountManwon: 500_000,         // 50억 대출
      });

      expect(result.negativeLeverage).toBe(false);
    });
  });

  describe('Development Strategy — 1,200만원/평 공사비 및 규제 완화 기한', () => {
    it('PF2-04: uses 1,200만원/평 construction cost and outputs regulation expiry', () => {
      const result = calculateFinancials({
        posture: 'development',
        purchasePriceKrw: 10_000_000_000, // 100억 토지
        platAreaSqm: 500,                  // 151.25평
        targetGrossAreaPyeong: 500,        // 500평 신축
      });

      // 공사비 = 500평 × 1,200만 = 60억
      // 예비비(5%) = (100억 + 60억) × 5% = 8억
      // 총사업비 = 100억 + 60억 + 8억 = 168억
      expect(result.totalProjectCostBil).toBe(168);
      expect(result.regulationExpiry).toBe('2028-05-18');
      expect(result.regulationDaysLeft).toBeGreaterThan(0);
    });
  });

  describe('OwnerOccupied Strategy — Occupancy Cost & Saved Rent', () => {
    it('PF2-05: calculates saved rent and monthly occupancy cost per pyeong', () => {
      const result = calculateFinancials({
        posture: 'owner_occupied',
        purchasePriceKrw: 10_000_000_000, // 100억
        totalAreaSqm: 1000,                // 302.5평
        selfUseAreaPyeong: 300,            // 300평 자가사용
        marketRentPerPyeongKrw: 80_000,    // 주변 임대료 8만원/평
        loanAmountManwon: 600_000,         // 60억 대출
        mgmtFeeTotalManwon: 300,           // 월 관리비 300만
      });

      // 가상 연 임대료 = 300평 × 8만원 × 12 = 2.88억
      // 금융이자(4.5%) = 60억 × 4.5% = 2.7억
      // 임차 대비 연 절감액 = 2.88억 - 2.7억 = 0.18억 = 0.2억
      expect(result.ownVsLeaseSavingsBil).toBe(0.2);
      expect(result.occupancyCostPerPyeongMonthly).toBeGreaterThan(0);
    });
  });

  describe('Operating Strategy — GOP & Margin', () => {
    it('PF2-06: calculates GOP and GOP Cap Rate accurately', () => {
      const result = calculateFinancials({
        posture: 'operating',
        purchasePriceKrw: 10_000_000_000, // 100억
        annualRevenueKrw: 1_500_000_000,   // 연매출 15억
        gopMarginPct: 35,                  // GOP 마진 35%
      });

      // GOP = 15억 × 35% = 5.25억 -> 5.2 or 5.3
      expect(result.annualGopBil).toBeCloseTo(5.25, 1);
      // GOP Cap Rate = 5.25억 / 100억 = 5.25%
      expect(result.gopCapRatePct).toBe(5.25);
    });
  });
});
