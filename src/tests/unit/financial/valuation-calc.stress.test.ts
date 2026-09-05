import { describe, it, expect } from 'vitest';
import {
  calculateSalesComparison,
  calculateIncomeCapitalization,
  generateCreDualValuationReport,
  DEFAULT_COST_METHOD_EXCLUSION_NOTE,
  type SalesComp,
} from '@/domain/building/im-core/valuation-calc';

import sinsaFixture from '../../../../docs/test/real-broker-im/sinsa-590-fixture.json';
import seochoFixture from '../../../../docs/test/real-broker-im/seocho-1364-28-fixture.json';

describe('CRE Valuation Engine Mathematical Robustness & Boundary Stress Suite', () => {
  // Standard subject baseline for boundary tests
  const baseSubject = {
    askingPriceKrw: 25000000000,
    landAreaPyeong: 156.9,
    gfaPyeong: 753.5,
    annualGrossRentKrw: 558840000,
    annualMgmtFeeKrw: 69120000,
    annualOpexKrw: 69120000,
  };

  const sampleComp: SalesComp = {
    name: '기준 사례 빌딩 A',
    distanceM: 200,
    dealDate: '2024-01',
    landPricePerPyeongKrw: 160000000,
    gfaPricePerPyeongKrw: 33000000,
    landAreaPyeong: 150.0,
    gfaPyeong: 700.0,
  };

  // =========================================================================
  // Category A: Boundary Cap Rates Stress Testing
  // =========================================================================
  describe('A. Boundary Cap Rates Stress (cap <= 0, cap = 0.001, cap = 15, cap = 15.001, cap > 15)', () => {
    describe('A1. Non-positive Cap Rates (cap <= 0)', () => {
      it('should throw when capLow is 0', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [0, 3.0],
          });
        }).toThrowError('요구 Cap Rate는 0보다 커야 합니다.');
      });

      it('should throw when capHigh is 0', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [2.5, 0],
          });
        }).toThrowError('요구 Cap Rate는 0보다 커야 합니다.');
      });

      it('should throw when capLow is negative (-0.001)', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [-0.001, 3.0],
          });
        }).toThrowError('요구 Cap Rate는 0보다 커야 합니다.');
      });

      it('should throw when both cap rates are negative (-2.0, -1.0)', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [-2.0, -1.0],
          });
        }).toThrowError('요구 Cap Rate는 0보다 커야 합니다.');
      });

      it('should throw when capLow is Number.MIN_SAFE_INTEGER', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [Number.MIN_SAFE_INTEGER, 3.0],
          });
        }).toThrowError('요구 Cap Rate는 0보다 커야 합니다.');
      });
    });

    describe('A2. Micro-positive boundary (cap = 0.001)', () => {
      it('should successfully compute fair values for extreme low cap rate 0.001%', () => {
        const res = calculateIncomeCapitalization({
          ...baseSubject,
          marketCapRateRangePct: [0.001, 0.002],
        });

        expect(res.annualNoiKrw).toBe(558840000);
        expect(Number.isFinite(res.fairValueRangeKrw[0])).toBe(true);
        expect(Number.isFinite(res.fairValueRangeKrw[1])).toBe(true);
        // At 0.001% (0.00001), 5.5884억 / 0.00001 = 55.884조 원
        expect(res.fairValueRangeKrw[1]).toBe(55884000000000);
        // At 0.002% (0.00002), 5.5884억 / 0.00002 = 27.942조 원
        expect(res.fairValueRangeKrw[0]).toBe(27942000000000);
        expect(res.fairValueMidKrw).toBe(Math.round((27942000000000 + 55884000000000) / 2));
        expect(res.fairValueRangeKrw[0]).toBeLessThan(res.fairValueRangeKrw[1]);
      });
    });

    describe('A3. Exact upper boundary (cap = 15.0)', () => {
      it('should pass cleanly when cap is exactly 15.0%', () => {
        const res = calculateIncomeCapitalization({
          ...baseSubject,
          marketCapRateRangePct: [14.0, 15.0],
        });

        expect(Number.isFinite(res.fairValueRangeKrw[0])).toBe(true);
        // At 15.0% (0.15), 558,840,000 / 0.15 = 3,725,600,000 원
        expect(res.fairValueRangeKrw[0]).toBe(3725600000);
        expect(res.marketCapRateRangePct).toEqual([14.0, 15.0]);
      });

      it('should pass cleanly when both caps are exactly 15.0%', () => {
        const res = calculateIncomeCapitalization({
          ...baseSubject,
          marketCapRateRangePct: [15.0, 15.0],
        });

        expect(res.fairValueRangeKrw[0]).toBe(3725600000);
        expect(res.fairValueRangeKrw[1]).toBe(3725600000);
        expect(res.fairValueMidKrw).toBe(3725600000);
      });
    });

    describe('A4. Exceeding upper boundary (cap = 15.001 and cap > 15)', () => {
      it('should throw when capLow is 15.001', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [15.001, 16.0],
          });
        }).toThrowError('요구 Cap Rate는 15% 이하의 정상 범위여야 합니다 (비정상 시장 수익률).');
      });

      it('should throw when capHigh is 15.001 while capLow is valid', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [10.0, 15.001],
          });
        }).toThrowError('요구 Cap Rate는 15% 이하의 정상 범위여야 합니다 (비정상 시장 수익률).');
      });

      it('should throw when cap is greatly above 15% (e.g. 25%, 50%)', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [20.0, 25.0],
          });
        }).toThrowError('요구 Cap Rate는 15% 이하의 정상 범위여야 합니다 (비정상 시장 수익률).');
      });

      it('should throw when cap is Number.MAX_VALUE', () => {
        expect(() => {
          calculateIncomeCapitalization({
            ...baseSubject,
            marketCapRateRangePct: [10.0, Number.MAX_VALUE],
          });
        }).toThrowError('요구 Cap Rate는 15% 이하의 정상 범위여야 합니다 (비정상 시장 수익률).');
      });
    });

    describe('A5. Inverted Cap Rate pair normalization and extreme inputs', () => {
      it('should correctly normalize inverted cap range [3.5, 2.5] without arithmetic failure', () => {
        const res = calculateIncomeCapitalization({
          ...baseSubject,
          marketCapRateRangePct: [3.5, 2.5],
        });

        // Min cap rate gives highest value
        expect(res.marketCapRateRangePct).toEqual([2.5, 3.5]);
        expect(res.fairValueRangeKrw[0]).toBeLessThan(res.fairValueRangeKrw[1]);
        // 558,840,000 / 0.035 = 15,966,857,143
        expect(res.fairValueRangeKrw[0]).toBe(15966857143);
        // 558,840,000 / 0.025 = 22,353,600,000
        expect(res.fairValueRangeKrw[1]).toBe(22353600000);
        // Note: valuationNarrative uses input capLow and capHigh directly
        expect(res.valuationNarrative).toContain('3.5%~2.5%');
      });

      it('[Adversarial Edge Case] should analyze behavior when NOI is zero', () => {
        // When gross rent equals 0 or OPEX offsets all rent
        const zeroNoiInput = {
          annualGrossRentKrw: 0,
          annualMgmtFeeKrw: 0,
          annualOpexKrw: 0,
          askingPriceKrw: 25000000000,
          marketCapRateRangePct: [2.5, 3.5] as [number, number],
        };

        const res = calculateIncomeCapitalization(zeroNoiInput);
        expect(res.annualNoiKrw).toBe(0);
        expect(res.impliedCapRatePct).toBe(0);
        expect(res.fairValueRangeKrw).toEqual([0, 0]);
        expect(res.fairValueMidKrw).toBe(0);
        // Notice: when valMid is 0, askingPriceVsFairValuePct becomes Infinity due to division by zero
        expect(Number.isFinite(res.askingPriceVsFairValuePct)).toBe(false);
      });

      it('[Adversarial Edge Case] should analyze behavior when asking price is zero', () => {
        const zeroAskingInput = {
          ...baseSubject,
          askingPriceKrw: 0,
          marketCapRateRangePct: [2.5, 3.5] as [number, number],
        };

        const res = calculateIncomeCapitalization(zeroAskingInput);
        // When asking price is 0, impliedCapRate is Infinity
        expect(Number.isFinite(res.impliedCapRatePct)).toBe(false);
      });

      it('should handle institutional 1 trillion KRW mega-deal without overflow or precision loss', () => {
        const megaDealInput = {
          annualGrossRentKrw: 35000000000, // 350억
          annualMgmtFeeKrw: 5000000000,   // 50억
          annualOpexKrw: 5000000000,      // 50억
          askingPriceKrw: 1000000000000,  // 1조 원
          marketCapRateRangePct: [3.0, 4.0] as [number, number],
        };

        const res = calculateIncomeCapitalization(megaDealInput);
        expect(res.annualNoiKrw).toBe(35000000000);
        expect(res.impliedCapRatePct).toBe(3.5);
        expect(res.fairValueRangeKrw[0]).toBe(875000000000);  // 8,750억 (at 4%)
        expect(res.fairValueRangeKrw[1]).toBe(1166666666667); // 1.166조 (at 3%)
      });
    });
  });

  // =========================================================================
  // Category B: Comps Array Cardinality & Integrity Stress Testing
  // =========================================================================
  describe('B. Comps Array Cardinality & Integrity Stress (empty [], single-comp, massive)', () => {
    describe('B1. Empty comps array [] and falsy inputs', () => {
      it('should throw explicit Korean domain error when comps array is empty []', () => {
        expect(() => {
          calculateSalesComparison([], {
            askingPriceKrw: baseSubject.askingPriceKrw,
            landAreaPyeong: baseSubject.landAreaPyeong,
            gfaPyeong: baseSubject.gfaPyeong,
          });
        }).toThrowError('사례비교법 산출을 위해 최소 1건 이상의 실거래 비교사례가 필요합니다.');
      });

      it('should throw explicit Korean domain error when comps is null or undefined', () => {
        expect(() => {
          calculateSalesComparison(null as any, {
            askingPriceKrw: baseSubject.askingPriceKrw,
            landAreaPyeong: baseSubject.landAreaPyeong,
            gfaPyeong: baseSubject.gfaPyeong,
          });
        }).toThrowError('사례비교법 산출을 위해 최소 1건 이상의 실거래 비교사례가 필요합니다.');

        expect(() => {
          calculateSalesComparison(undefined as any, {
            askingPriceKrw: baseSubject.askingPriceKrw,
            landAreaPyeong: baseSubject.landAreaPyeong,
            gfaPyeong: baseSubject.gfaPyeong,
          });
        }).toThrowError('사례비교법 산출을 위해 최소 1건 이상의 실거래 비교사례가 필요합니다.');
      });
    });

    describe('B2. Single-comp array handling (compCount = 1)', () => {
      it('should compute valid single-point market band without division-by-zero or NaN', () => {
        const singleCompSubject = {
          askingPriceKrw: 24000000000,
          landAreaPyeong: 150.0,
          gfaPyeong: 700.0,
        };

        const res = calculateSalesComparison([sampleComp], singleCompSubject);

        expect(res.compCount).toBe(1);
        expect(res.minLandPricePerPyeongKrw).toBe(160000000);
        expect(res.maxLandPricePerPyeongKrw).toBe(160000000);
        expect(res.avgLandPricePerPyeongKrw).toBe(160000000);
        expect(res.minGfaPricePerPyeongKrw).toBe(33000000);
        expect(res.maxGfaPricePerPyeongKrw).toBe(33000000);
        expect(res.avgGfaPricePerPyeongKrw).toBe(33000000);

        // Subject asking 240억 / 150평 = 1.6억/평 (exact match with comp)
        expect(res.subjectLandPricePerPyeongKrw).toBe(160000000);
        expect(res.fairValueRangeKrw[0]).toBe(24000000000);
        expect(res.fairValueRangeKrw[1]).toBe(24000000000);
        expect(res.isWithinMarketBand).toBe(true);
        expect(res.marketBandDiffPct).toBe(0);

        expect(res.analysisNarrative).toContain('인근 1개 유사 실거래 사례');
        expect(res.analysisNarrative).toContain('권역 시세 중간값 수준으로 가격 적정성 부합');
      });

      it('should compute correct single-comp discount narrative when subject is below single comp', () => {
        const discountedSubject = {
          askingPriceKrw: 21000000000, // 210억 / 150평 = 1.4억/평 < 1.6억
          landAreaPyeong: 150.0,
          gfaPyeong: 700.0,
        };

        const res = calculateSalesComparison([sampleComp], discountedSubject);
        expect(res.isWithinMarketBand).toBe(false);
        expect(res.marketBandDiffPct).toBe(-12.5); // (210 - 240) / 240 = -12.5%
        expect(res.analysisNarrative).toContain('인근 시세 하단(1.60억 원) 대비 약 12.5% 저렴하여 우수한 가격 경쟁력(저평가 밸류애드 메리트) 확보');
      });

      it('should compute correct single-comp premium narrative when subject is above single comp', () => {
        const premiumSubject = {
          askingPriceKrw: 27000000000, // 270억 / 150평 = 1.8억/평 > 1.6억
          landAreaPyeong: 150.0,
          gfaPyeong: 700.0,
        };

        const res = calculateSalesComparison([sampleComp], premiumSubject);
        expect(res.isWithinMarketBand).toBe(false);
        expect(res.marketBandDiffPct).toBe(12.5); // (270 - 240) / 240 = +12.5%
        expect(res.analysisNarrative).toContain('인근 시세 상단(1.60억 원) 대비 약 12.5% 높은 프리미엄 호가 수준 형성');
      });
    });

    describe('B3. Stress with massive comps (1,000 comps) and identical comps', () => {
      it('should process 1,000 comps efficiently without precision loss', () => {
        const massiveComps: SalesComp[] = [];
        for (let i = 0; i < 1000; i++) {
          massiveComps.push({
            name: `테스트 사례 ${i}`,
            distanceM: 100 + i,
            dealDate: '2024-01',
            landPricePerPyeongKrw: 100000000 + i * 100000, // 1.0억 ~ 2.0억
            gfaPricePerPyeongKrw: 30000000 + i * 10000,
            landAreaPyeong: 100,
            gfaPyeong: 400,
          });
        }

        const start = performance.now();
        const res = calculateSalesComparison(massiveComps, {
          askingPriceKrw: 15000000000,
          landAreaPyeong: 100,
          gfaPyeong: 400,
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(100); // Must be sub-100ms
        expect(res.compCount).toBe(1000);
        expect(res.minLandPricePerPyeongKrw).toBe(100000000);
        expect(res.maxLandPricePerPyeongKrw).toBe(199900000);
        expect(res.isWithinMarketBand).toBe(true);
      });

      it('should handle multiple identical comps correctly', () => {
        const identicalComps: SalesComp[] = Array(5).fill({
          name: '동일 사례',
          distanceM: 100,
          dealDate: '2024-02',
          landPricePerPyeongKrw: 200000000,
          gfaPricePerPyeongKrw: 50000000,
          landAreaPyeong: 100,
          gfaPyeong: 400,
        });

        const res = calculateSalesComparison(identicalComps, {
          askingPriceKrw: 20000000000,
          landAreaPyeong: 100,
          gfaPyeong: 400,
        });

        expect(res.minLandPricePerPyeongKrw).toBe(200000000);
        expect(res.maxLandPricePerPyeongKrw).toBe(200000000);
        expect(res.avgLandPricePerPyeongKrw).toBe(200000000);
        expect(res.marketBandDiffPct).toBe(0);
        expect(res.fairValueRangeKrw[0]).toBe(res.fairValueRangeKrw[1]);
      });
    });
  });

  // =========================================================================
  // Category C: Narrative Positioning Branches Stress Testing
  // =========================================================================
  describe('C. Narrative Positioning Branches (discount, premium, fair value, exact boundaries)', () => {
    const marketComps: SalesComp[] = [
      {
        name: '비교 1',
        distanceM: 100,
        dealDate: '2024-01',
        landPricePerPyeongKrw: 130000000, // 1.30억
        gfaPricePerPyeongKrw: 30000000,
        landAreaPyeong: 100,
        gfaPyeong: 400,
      },
      {
        name: '비교 2',
        distanceM: 200,
        dealDate: '2024-02',
        landPricePerPyeongKrw: 140000000, // 1.40억
        gfaPricePerPyeongKrw: 32000000,
        landAreaPyeong: 100,
        gfaPyeong: 400,
      },
    ];

    describe('C1. Discount / Value-add branch (< minLandPrice)', () => {
      it('should trigger discount value-add text when subject price is strictly below minLandPrice', () => {
        const subject = {
          askingPriceKrw: 12000000000, // 1.20억/평 < 1.30억/평
          landAreaPyeong: 100,
          gfaPyeong: 400,
        };

        const res = calculateSalesComparison(marketComps, subject);
        expect(res.subjectLandPricePerPyeongKrw).toBeLessThan(res.minLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(false);
        expect(res.analysisNarrative).toContain('인근 시세 하단(1.30억 원) 대비 약');
        expect(res.analysisNarrative).toContain('저렴하여 우수한 가격 경쟁력(저평가 밸류애드 메리트) 확보');
      });

      it('should verify real Seocho 1364-28 SSoT fixture triggers discount value-add narrative', () => {
        const comps = seochoFixture.salesComparisonComps;
        const subject = {
          askingPriceKrw: seochoFixture.askingPriceKrw,
          landAreaPyeong: seochoFixture.landAreaM2 / 3.305785,
          gfaPyeong: seochoFixture.grossFloorAreaM2 / 3.305785,
        };

        const res = calculateSalesComparison(comps, subject);
        expect(res.compCount).toBe(4);
        expect(res.minLandPricePerPyeongKrw).toBe(130300000); // 1.30억
        expect(res.maxLandPricePerPyeongKrw).toBe(140000000); // 1.40억
        // Subject asking 230억 / 180.29평 = ~1.2757억/평 < 1.303억
        expect(res.subjectLandPricePerPyeongKrw).toBeLessThan(res.minLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(false);
        expect(res.analysisNarrative).toContain(
          '인근 시세 하단(1.30억 원) 대비 약 4.7% 저렴하여 우수한 가격 경쟁력(저평가 밸류애드 메리트) 확보'
        );
      });
    });

    describe('C2. Premium pricing branch (> maxLandPrice)', () => {
      it('should trigger premium text when subject price is strictly above maxLandPrice', () => {
        const subject = {
          askingPriceKrw: 15500000000, // 1.55억/평 > 1.40억/평
          landAreaPyeong: 100,
          gfaPyeong: 400,
        };

        const res = calculateSalesComparison(marketComps, subject);
        expect(res.subjectLandPricePerPyeongKrw).toBeGreaterThan(res.maxLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(false);
        expect(res.analysisNarrative).toContain('인근 시세 상단(1.40억 원) 대비 약');
        expect(res.analysisNarrative).toContain('높은 프리미엄 호가 수준 형성');
      });
    });

    describe('C3. Fair value / middle branch (between min and max)', () => {
      it('should trigger fair value text when subject price is inside the band', () => {
        const subject = {
          askingPriceKrw: 13500000000, // 1.35억/평 (midpoint)
          landAreaPyeong: 100,
          gfaPyeong: 400,
        };

        const res = calculateSalesComparison(marketComps, subject);
        expect(res.isWithinMarketBand).toBe(true);
        expect(res.analysisNarrative).toContain('권역 시세 중간값 수준으로 가격 적정성 부합');
      });

      it('should verify real Sinsa 590 SSoT fixture triggers fair value narrative', () => {
        const comps = sinsaFixture.salesComparisonComps;
        const subject = {
          askingPriceKrw: sinsaFixture.askingPriceKrw,
          landAreaPyeong: sinsaFixture.landAreaM2 / 3.305785,
          gfaPyeong: sinsaFixture.grossFloorAreaM2 / 3.305785,
        };

        const res = calculateSalesComparison(comps, subject);
        expect(res.compCount).toBe(5);
        expect(res.minLandPricePerPyeongKrw).toBe(200310000); // 2.00억
        expect(res.maxLandPricePerPyeongKrw).toBe(317600000); // 3.18억
        // Subject 760억 / 321.22평 = 2.366억/평 (inside 2.00억 ~ 3.18억 band)
        expect(res.subjectLandPricePerPyeongKrw).toBeGreaterThanOrEqual(res.minLandPricePerPyeongKrw);
        expect(res.subjectLandPricePerPyeongKrw).toBeLessThanOrEqual(res.maxLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(true);
        expect(res.analysisNarrative).toContain('권역 시세 중간값 수준으로 가격 적정성 부합');
      });
    });

    describe('C4. Exact boundary equality behavior', () => {
      it('should classify exact minLandPrice boundary equality as fair value (in-band)', () => {
        const subjectAtMin = {
          askingPriceKrw: 13000000000, // Exactly 1.30억/평
          landAreaPyeong: 100,
          gfaPyeong: 400,
        };

        const res = calculateSalesComparison(marketComps, subjectAtMin);
        expect(res.subjectLandPricePerPyeongKrw).toBe(res.minLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(true);
        expect(res.analysisNarrative).toContain('권역 시세 중간값 수준으로 가격 적정성 부합');
      });

      it('should classify exact maxLandPrice boundary equality as fair value (in-band)', () => {
        const subjectAtMax = {
          askingPriceKrw: 14000000000, // Exactly 1.40억/평
          landAreaPyeong: 100,
          gfaPyeong: 400,
        };

        const res = calculateSalesComparison(marketComps, subjectAtMax);
        expect(res.subjectLandPricePerPyeongKrw).toBe(res.maxLandPricePerPyeongKrw);
        expect(res.isWithinMarketBand).toBe(true);
        expect(res.analysisNarrative).toContain('권역 시세 중간값 수준으로 가격 적정성 부합');
      });
    });
  });

  // =========================================================================
  // Category D: Cost Method Exclusion Note & Dual Report Synthesis Integrity
  // =========================================================================
  describe('D. Cost Method Exclusion Note Integrity & Dual Report Synthesis', () => {
    it('should always bind DEFAULT_COST_METHOD_EXCLUSION_NOTE verbatim in generateCreDualValuationReport', () => {
      const report = generateCreDualValuationReport([sampleComp], {
        ...baseSubject,
        marketCapRateRangePct: [2.5, 3.5],
      });

      expect(report.costMethodExcludedNote).toBe(DEFAULT_COST_METHOD_EXCLUSION_NOTE);
      expect(report.costMethodExcludedNote).toBe(
        '원가법 제외: 노후도 감가 및 도심 역세권 수익형 상업용 부동산 특성상 사례비교법 및 수익환원법 2방식 적용'
      );
    });

    it('should strictly satisfy G54~G56 text governance standards on the cost exclusion note', () => {
      const note = DEFAULT_COST_METHOD_EXCLUSION_NOTE;

      // G54: No defect excuse phrases
      const defectExcuseRegex = /산출\s*불가|미확보|확인되지\s*않음|비워\s*둡니다|비워둠|자료\s*없음/;
      expect(defectExcuseRegex.test(note)).toBe(false);

      // G55: No preachy AI lecture tone
      const preachyRegex = /판단하지\s*마십시오|주의하십시오|유의하시기\s*바랍니다/;
      expect(preachyRegex.test(note)).toBe(false);

      // G56: No internal system rule leakage
      const internalRuleRegex = /Rule\s*\d+|P-PPTX|SSoT|타깃\s*해시|시스템\s*규칙/;
      expect(internalRuleRegex.test(note)).toBe(false);

      // Rule 1: No persona leakage
      const personaRegex = /자산가|대표|디벨로퍼|맞춤형/;
      expect(personaRegex.test(note)).toBe(false);

      // Rule 2: Valid CRE standard terminology
      expect(note).toContain('사례비교법');
      expect(note).toContain('수익환원법');
      expect(note).toContain('원가법 제외');
    });

    it('[Negative Pair] should fail governance validation if cost method exclusion note is empty or corrupted', () => {
      // Simulate corrupted note cases
      const corruptedNotes = [
        '',
        '   ',
        '원가법 미적용', // missing mandatory rationale
        '자료 미확보로 산출불가', // defect excuse violation
      ];

      for (const corrupted of corruptedNotes) {
        const isValid =
          corrupted.trim().length > 0 &&
          corrupted.includes('원가법 제외') &&
          corrupted.includes('사례비교법') &&
          corrupted.includes('수익환원법') &&
          !/산출\s*불가|미확보/.test(corrupted);

        expect(isValid).toBe(false);
      }
    });

    it('should integrate end-to-end with real Sinsa 590 fixture data', () => {
      const report = generateCreDualValuationReport(
        sinsaFixture.salesComparisonComps,
        {
          askingPriceKrw: sinsaFixture.askingPriceKrw,
          landAreaPyeong: sinsaFixture.landAreaM2 / 3.305785,
          gfaPyeong: sinsaFixture.grossFloorAreaM2 / 3.305785,
          annualGrossRentKrw: sinsaFixture.statedMonthlyRentKrw * 12,
          marketCapRateRangePct: sinsaFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
        }
      );

      expect(report.salesComparison.compCount).toBe(5);
      expect(report.salesComparison.isWithinMarketBand).toBe(true);
      expect(report.incomeCapitalization.impliedCapRatePct).toBe(1.02);
      expect(report.costMethodExcludedNote).toBe(DEFAULT_COST_METHOD_EXCLUSION_NOTE);
      expect(report.finalConclusion).toContain('적정 호가로 판정');
    });

    it('should integrate end-to-end with real Seocho 1364-28 fixture data', () => {
      const report = generateCreDualValuationReport(
        seochoFixture.salesComparisonComps,
        {
          askingPriceKrw: seochoFixture.askingPriceKrw,
          landAreaPyeong: seochoFixture.landAreaM2 / 3.305785,
          gfaPyeong: seochoFixture.grossFloorAreaM2 / 3.305785,
          annualGrossRentKrw: seochoFixture.statedMonthlyRentKrw * 12,
          marketCapRateRangePct: seochoFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
        }
      );

      expect(report.salesComparison.compCount).toBe(4);
      expect(report.salesComparison.isWithinMarketBand).toBe(false); // Discounted value-add
      expect(report.salesComparison.analysisNarrative).toContain('저평가 밸류애드 메리트');
      expect(report.incomeCapitalization.impliedCapRatePct).toBe(1.15);
      expect(report.costMethodExcludedNote).toBe(DEFAULT_COST_METHOD_EXCLUSION_NOTE);
    });
  });
});
