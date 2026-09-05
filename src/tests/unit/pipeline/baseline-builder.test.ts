import { describe, it, expect } from 'vitest';
import { buildEffectiveBaseline } from '@/domain/building/common-pipeline/baseline-builder';

describe('Effective Baseline Builder (CIM-0402 / PR-M4-02)', () => {
  it('should build deterministic baseline with SHA-256 baselineHash', () => {
    const baseline = buildEffectiveBaseline({
      dealId: 'deal-baseline-001',
      physical: {
        landAreaSqm: 495.8,
        grossFloorAreaSqm: 1850.2,
        buildingCoveragePct: 58.2,
        floorAreaRatioPct: 249.5,
        floorsAbove: 6,
        floorsBelow: 1,
      },
      commercial: {
        askingPriceKrw: 16500000000,
        totalDepositKrw: 650000000,
        monthlyRentKrw: 52000000,
      },
      zoning: {
        useDistrict: '제3종일반주거지역',
        mainUsage: '제2종근린생활시설',
      },
    });

    expect(baseline.baselineHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(baseline.physical.grossFloorAreaSqm).toBe(1850.2);
    expect(baseline.commercial.askingPriceKrw).toBe(16500000000);
  });
});
