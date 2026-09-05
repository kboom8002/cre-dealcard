import { describe, it, expect } from 'vitest';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import type { Parcel } from '@/domain/building/im-core/evidence/parcel-manager';

describe('EffectiveSnapshot Generator (PR-B1-02 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Multi-parcel all successful produces validated snapshot with 4-area denominators', () => {
    const parcels: Parcel[] = [
      { parcelId: 'p-1', address: '당산동 123-1', landAreaSqm: 200, status: 'SUCCESS' },
      { parcelId: 'p-2', address: '당산동 123-2', landAreaSqm: 300, status: 'SUCCESS' },
    ];

    const snapshot = buildEffectiveSnapshot({
      dealId: 'deal-snap-pos',
      parcels,
      grossFloorArea: 1200,
      buildingAreaTotal: 300,
      exclusiveLeaseArea: 900,
      pricing: {
        askingPriceKrw: 10000000000,
        monthlyRentKrw: 35000000,
        totalDepositKrw: 500000000,
      },
      asOf: '2026-09-01',
    });

    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.areas.landAreaTotal).toBe(500); // 200 + 300
    expect(snapshot.areas.grossFloorArea).toBe(1200);
    expect(snapshot.unitPrices.pricePerPyeongLand).toBeGreaterThan(0);
    expect(snapshot.unitPrices.pricePerPyeongGross).toBeGreaterThan(0);
  });

  it('Negative Pair: Partial parcel failure halts snapshot synthesis to prevent area distortion', () => {
    const parcels: Parcel[] = [
      { parcelId: 'p-1', address: '당산동 123-1', landAreaSqm: 200, status: 'SUCCESS' },
      {
        parcelId: 'p-2',
        address: '당산동 123-2',
        landAreaSqm: 0,
        status: 'FETCH_FAILED',
        errorMessage: '토지대장 API 타임아웃',
      },
    ];

    expect(() =>
      buildEffectiveSnapshot({
        dealId: 'deal-snap-neg',
        parcels,
        grossFloorArea: 1200,
        pricing: { askingPriceKrw: 10000000000 },
      })
    ).toThrowError(/PARTIAL_PARCEL_FAILURE/);
  });
});
