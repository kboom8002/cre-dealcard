import { describe, it, expect } from 'vitest';
import { ShadowDualRunner } from '@/platform/im-pipeline/shadow-runner';

describe('ShadowDualRunner Parallel Telemetry (PR-B5-01 / Negative-Pair Obligation)', () => {
  const runner = new ShadowDualRunner();

  it('Positive Pair: Consistent numbers between engines achieve 100% match rate', async () => {
    const legacy = {
      asking_price: 10000000000,
      total_area: 1200,
      land_area: 400,
      gross_yield: 4.8,
      vacancy_rate: 0,
    };
    const modern = {
      asking_price: 10000000000,
      total_area: 1200,
      land_area: 400,
      gross_yield: 4.8,
      vacancy_rate: 0,
    };

    const result = await runner.runDualComparison('deal-shadow-pos', legacy, modern);
    expect(result.isAcceptable).toBe(true);
    expect(result.comparison.allMatch).toBe(true);
    expect(result.comparison.unmatchedCount).toBe(0);
  });

  it('Negative Pair: Discrepancy > 0.1% is captured without crashing user-facing telemetry', async () => {
    const legacy = {
      asking_price: 10000000000,
      total_area: 1200,
    };
    const modern = {
      asking_price: 10500000000, // 5% divergence
      total_area: 1200,
    };

    const result = await runner.runDualComparison('deal-shadow-neg', legacy, modern);
    expect(result.isAcceptable).toBe(false);
    expect(result.comparison.allMatch).toBe(false);
    expect(result.comparison.unmatchedCount).toBe(1);
    expect(result.comparison.metrics.find((m) => m.metricName === 'asking_price')?.isMatch).toBe(
      false
    );
  });
});
