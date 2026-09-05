import { describe, it, expect } from 'vitest';
import {
  calculateSalesComparison,
  calculateIncomeCapitalization,
  generateCreDualValuationReport,
  type SalesComp,
} from '@/domain/building/im-core/valuation-calc';

const MOCK_COMPS: SalesComp[] = [
  {
    name: '양평동4가 업무시설 A',
    distanceM: 280,
    dealDate: '2024-03',
    landPricePerPyeongKrw: 162000000,
    gfaPricePerPyeongKrw: 34500000,
    landAreaPyeong: 142.5,
    gfaPyeong: 680.0,
  },
  {
    name: '양평동5가 근생/업무 B',
    distanceM: 450,
    dealDate: '2023-11',
    landPricePerPyeongKrw: 158000000,
    gfaPricePerPyeongKrw: 32800000,
    landAreaPyeong: 165.0,
    gfaPyeong: 790.0,
  },
  {
    name: '당산동 근생빌딩 C',
    distanceM: 850,
    dealDate: '2024-01',
    landPricePerPyeongKrw: 168000000,
    gfaPricePerPyeongKrw: 35200000,
    landAreaPyeong: 180.2,
    gfaPyeong: 890.0,
  },
];

describe('CRE 2대 밸류에이션 엔진 (valuation-calc.ts)', () => {
  const subject = {
    askingPriceKrw: 25000000000,
    landAreaPyeong: 156.9,
    gfaPyeong: 753.5,
    annualGrossRentKrw: 558840000,
    annualMgmtFeeKrw: 69120000,
    annualOpexKrw: 69120000,
    marketCapRateRangePct: [2.10, 2.50] as [number, number],
  };

  describe('1. 사례비교법 (Sales Comparison)', () => {
    it('[Positive] 인근 3개 실거래 비교사례 기반 적정 밴드 및 중간값 산출 단언', () => {
      const res = calculateSalesComparison(MOCK_COMPS, subject);

      expect(res.compCount).toBe(3);
      expect(res.minLandPricePerPyeongKrw).toBe(158000000);
      expect(res.maxLandPricePerPyeongKrw).toBe(168000000);
      expect(res.avgLandPricePerPyeongKrw).toBe(162666667);
      expect(res.isWithinMarketBand).toBe(true);
      expect(res.fairValueRangeKrw[0]).toBe(Math.round(158000000 * 156.9));
      expect(res.fairValueRangeKrw[1]).toBe(Math.round(168000000 * 156.9));
      expect(res.analysisNarrative).toContain('인근 3개 유사 실거래 사례');
    });

    it('[Negative Pair] 비교사례가 0건이면 명시적 예외 발생 단언 (도피형 텍스트 방지)', () => {
      expect(() => {
        calculateSalesComparison([], subject);
      }).toThrowError('최소 1건 이상의 실거래 비교사례가 필요합니다');
    });
  });

  describe('2. 수익환원법 (Income Capitalization)', () => {
    it('[Positive] 연 순영업소득(NOI)과 Cap Rate 밴드 기준 적정 자산가치 역산 단언', () => {
      const res = calculateIncomeCapitalization({
        annualGrossRentKrw: subject.annualGrossRentKrw,
        annualMgmtFeeKrw: subject.annualMgmtFeeKrw,
        annualOpexKrw: subject.annualOpexKrw,
        askingPriceKrw: subject.askingPriceKrw,
        marketCapRateRangePct: subject.marketCapRateRangePct,
      });

      // NOI = 558,840,000 (관리비와 운영비 실비 상계)
      expect(res.annualNoiKrw).toBe(558840000);
      expect(res.impliedCapRatePct).toBe(2.24); // 5.5884억 / 250억 = 2.24%
      // 2.50% -> 22,353,600,000 원, 2.10% -> 26,611,428,571 원
      expect(res.fairValueRangeKrw[0]).toBe(22353600000);
      expect(res.fairValueRangeKrw[1]).toBe(26611428571);
      expect(res.valuationNarrative).toContain('권역 요구 Cap Rate(2.1%~2.5%) 환원 기준');
    });

    it('[Negative Pair] 유효하지 않은 Cap Rate (0 이하) 전달 시 예외 발생 단언', () => {
      expect(() => {
        calculateIncomeCapitalization({
          annualGrossRentKrw: 500000000,
          askingPriceKrw: 25000000000,
          marketCapRateRangePct: [0, -1],
        });
      }).toThrowError('요구 Cap Rate는 0보다 커야 합니다');
    });
  });

  describe('3. 종합 2대 밸류에이션 리포트 합성 (원가법 배제)', () => {
    it('[Positive] 2대 방식 리포트 합성 및 원가법 배제 사유 명기 단언', () => {
      const report = generateCreDualValuationReport(MOCK_COMPS, subject);

      expect(report.salesComparison.isWithinMarketBand).toBe(true);
      expect(report.incomeCapitalization.impliedCapRatePct).toBe(2.24);
      expect(report.costMethodExcludedNote).toContain('원가법 제외');
      expect(report.finalConclusion).toContain('적정 호가로 판정');
    });
  });
});
