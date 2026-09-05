import { describe, it, expect } from 'vitest';
import {
  calculateUnitPriceMetrics,
  validateDenominatorIntegrity,
} from '@/domain/building/common-pipeline/area-calculator';

describe('4-Area Denominators & Unit Price Metrics (CIM-0403 / PR-M4-03)', () => {
  it('should accurately calculate land pyeong price and gross area pyeong price without confusion', () => {
    const metrics = calculateUnitPriceMetrics(
      12000000000, // 120억
      {
        landAreaSqm: 330.5785,       // 100평
        grossFloorAreaSqm: 1322.314, // 400평
        leasableAreaSqm: 991.7355,   // 300평
        exclusiveAreaSqm: 661.157,   // 200평
      },
      30000000 // 월 3,000만원
    );

    expect(metrics.pricePerPyeongLand).toBe(120000000); // 평당 1.2억 (대지 기준)
    expect(metrics.pricePerPyeongGross).toBe(30000000); // 평당 3,000만 (연면적 기준)
    expect(metrics.rentPerPyeongLeasable).toBe(100000); // 평당 10만 (임대면적 기준)
    expect(metrics.rentPerPyeongExclusive).toBe(150000); // 평당 15만 (전용면적 기준)
  });

  it('should enforce G37 denominator integrity and block mismatches', () => {
    expect(validateDenominatorIntegrity('대지 평당 매매가', 'land')).toBe(true);
    expect(validateDenominatorIntegrity('연면적 평당가', 'gross_floor')).toBe(true);
    expect(validateDenominatorIntegrity('대지 평당 매매가', 'gross_floor')).toBe(false); // G37 violation!
  });
});
