import { describe, it, expect } from 'vitest';
import { compareShadowOutputs } from '@/platform/im-pipeline/shadow-comparator';

describe('Shadow Run Canary Comparator (CIM-0702 / PR-M7-02)', () => {
  it('should report allMatch true when legacy and modern metrics align within 0.1% tolerance', () => {
    const legacy = {
      asking_price: 12500000000,
      total_area: 1380.2,
      land_area: 420.5,
      gross_yield: 4.2,
      vacancy_rate: 0,
    };

    const modern = {
      asking_price: 12500000000,
      total_area: 1380.2,
      land_area: 420.5,
      gross_yield: 4.201, // 0.02% difference (within 0.1% tolerance)
      vacancy_rate: 0,
    };

    const comparison = compareShadowOutputs('deal-shadow-01', legacy, modern);
    expect(comparison.allMatch).toBe(true);
    expect(comparison.unmatchedCount).toBe(0);
  });

  it('should detect numerical drift when difference exceeds tolerance', () => {
    const legacy = {
      asking_price: 12500000000,
      gross_yield: 4.2,
    };

    const modernDrift = {
      asking_price: 12500000000,
      gross_yield: 5.5, // 30% difference!
    };

    const comparison = compareShadowOutputs('deal-drift-01', legacy, modernDrift);
    expect(comparison.allMatch).toBe(false);
    expect(comparison.unmatchedCount).toBe(1);
    const yieldMetric = comparison.metrics.find((m) => m.metricName === 'gross_yield');
    expect(yieldMetric?.isMatch).toBe(false);
  });
});
