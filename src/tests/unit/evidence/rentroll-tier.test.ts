import { describe, it, expect } from 'vitest';
import { RentrollTierEngine } from '@/domain/building/im-core/evidence/rentroll-tier-engine';
import type { RentrollUnitRow } from '@/domain/building/common-pipeline/rentroll-classifier';

describe('RentrollTierEngine (PR-B1-03 / Negative-Pair Obligation)', () => {
  const engine = new RentrollTierEngine();

  it('Positive Pair: Standard rentroll with admin fee permits CapRate and NOI', () => {
    const rows: RentrollUnitRow[] = [
      {
        floor: '1F',
        unit: '101',
        occupancyType: 'leased',
        areaSqm: 100,
        depositKrw: 50000000,
        monthlyRentKrw: 4000000,
        adminFeeKrw: 500000,
      },
    ];

    const result = engine.classify(rows, undefined, { hasAdminFeeSpecified: true });
    expect(result.tier).toBe('standard');
    expect(result.allowedMetrics).toContain('cap_rate');
    expect(result.allowedMetrics).toContain('noi');

    expect(() => engine.assertMetricEligibility('cap_rate', result.tier)).not.toThrow();
  });

  it('Negative Pair: Missing rentroll (none) blocks CapRate and NOI calculations', () => {
    const result = engine.classify([], undefined);
    expect(result.tier).toBe('none');
    expect(result.allowedMetrics.length).toBe(0);

    expect(() => engine.assertMetricEligibility('cap_rate', result.tier)).toThrowError(
      /INSUFFICIENT_RENTROLL_TIER/
    );
  });
});
