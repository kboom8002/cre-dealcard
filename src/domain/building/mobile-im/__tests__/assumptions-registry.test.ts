// src/domain/building/mobile-im/__tests__/assumptions-registry.test.ts
import { describe, it, expect } from 'vitest';
import { ASSUMPTIONS, requiresManualComps, getRegulationDaysLeft } from '../assumptions';

describe('Assumption Registry (Phase 3-1)', () => {
  describe('Registry structure and 21 keys verification', () => {
    it('AR-01: legal layer has 7 keys with non-empty basis and impactIfWrong', () => {
      const legalKeys = [
        'acquisitionTaxRate', 'brokerFeeRateMax', 'targetFarByZoning',
        'bcrByZoning', 'transferTaxRate', 'regulationBasis', 'regulationExpiry',
      ] as const;

      for (const k of legalKeys) {
        const item = ASSUMPTIONS[k];
        expect(item).toBeDefined();
        expect(item.source).toBe('legal');
        expect(item.basis.length).toBeGreaterThan(0);
        expect(item.impactIfWrong.length).toBeGreaterThan(0);
      }
    });

    it('AR-02: targetFarByZoning defaults to null (조회 실패 시 산출 거부)', () => {
      expect(ASSUMPTIONS.targetFarByZoning.value).toBeNull();
    });

    it('AR-03: market_default layer constructionCostPerPyeong is 12,000,000 (1,200만원/평)', () => {
      expect(ASSUMPTIONS.constructionCostPerPyeong.value).toBe(12_000_000);
      expect(ASSUMPTIONS.constructionCostPerPyeong.unit).toBe('원/평');
    });

    it('AR-04: market_default layer loanRateDefault is 0.045 (4.5%)', () => {
      expect(ASSUMPTIONS.loanRateDefault.value).toBe(0.045);
    });

    it('AR-05: user_input layer defaults to null for unentered values', () => {
      expect(ASSUMPTIONS.opexKrw.value).toBeNull();
      expect(ASSUMPTIONS.gopMarginPct.value).toBeNull();
      expect(ASSUMPTIONS.manualComps.value).toBeNull();
      expect(ASSUMPTIONS.marketRentPerPyeong.value).toBeNull();
      expect(ASSUMPTIONS.firstContractDate.value).toBeNull();
    });
  });

  describe('requiresManualComps (300억 초과 B4 대역 검증)', () => {
    it('AR-06: 300억 초과 물건은 수동 비교사례 필수', () => {
      expect(requiresManualComps(35_000_000_000)).toBe(true);
      expect(requiresManualComps(45_000_000_000)).toBe(true);
    });

    it('AR-07: 30억~300억(B1~B3) 주력 구간은 자동 comps 지원', () => {
      expect(requiresManualComps(5_000_000_000)).toBe(false);
      expect(requiresManualComps(12_000_000_000)).toBe(false);
      expect(requiresManualComps(25_000_000_000)).toBe(false);
    });
  });

  describe('getRegulationDaysLeft (한시적 완화 기한 계산)', () => {
    it('AR-08: returns positive remaining days until 2028-05-18', () => {
      const testDate = new Date('2026-08-23');
      const days = getRegulationDaysLeft(testDate);
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThan(600); // 2026-08 ~ 2028-05 is ~630 days
    });
  });
});
