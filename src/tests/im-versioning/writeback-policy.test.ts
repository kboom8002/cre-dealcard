/**
 * @file src/tests/im-versioning/writeback-policy.test.ts
 * @description WP-P4a1-08: Split Write-Back Policy Unit Test.
 *
 * Asserts:
 * 1. Physical building facts always partition into physicalFactsToSync.
 * 2. Deal terms (asking price, rent, deposit) remain isolated (null) by default.
 * 3. Deal terms partition into dealTermsToSync only when explicit opt-in syncDealTermsToSsot: true is given.
 * 4. Snapshot payload captures complete raw state for im_input_snapshots.
 */

import { describe, it, expect } from 'vitest';
import { partitionWriteBackPayload } from '@/domain/building/im-core/writeback-policy';

describe('WP-P4a1-08: Split Write-Back Policy Verification', () => {
  const sampleInput = {
    address: '서울특별시 강남구 테헤란로 152',
    road_address: '서울특별시 강남구 테헤란로 152 (역삼동)',
    pnu: '1168010100101520000',
    land_area_sqm: 450.2,
    total_gross_area_sqm: 2100.5,
    building_coverage_ratio_pct: 59.5,
    floor_area_ratio_pct: 420.0,
    structure: '철골철근콘크리트구조',
    main_usage: '업무시설',
    floors_above: 10,
    floors_below: 2,
    completion_date: '2019-11-20',
    parking_spaces: 15,
    elevators: 2,
    photos: [{ url: 'https://cdn.example.com/photo1.jpg', role: 'primary' }],
    // Deal terms
    asking_price_krw: 250_0000_0000, // 250억
    asking_price_manwon: 2500000,
    deposit_total_krw: 20_0000_0000, // 20억
    monthly_rent_total_krw: 7500_0000, // 7500만
    maintenance_fee_monthly_krw: 500_0000,
    rent_roll: [
      { floor: '1F', tenant: '은행', rent_krw: 2000_0000, deposit_krw: 5_0000_0000 },
    ],
    investment_posture: 'core_income',
  };

  it('Default (no opt-in): physical building facts auto-sync, deal terms remain null', () => {
    const result = partitionWriteBackPayload(sampleInput, { syncDealTermsToSsot: false });

    // Physical facts MUST be present
    expect(result.physicalFactsToSync.address).toBe('서울특별시 강남구 테헤란로 152');
    expect(result.physicalFactsToSync.pnu).toBe('1168010100101520000');
    expect(result.physicalFactsToSync.land_area_sqm).toBe(450.2);
    expect(result.physicalFactsToSync.gross_floor_area_sqm).toBe(2100.5);
    expect(result.physicalFactsToSync.building_coverage_ratio).toBe(59.5);
    expect(result.physicalFactsToSync.structure).toBe('철골철근콘크리트구조');
    expect(result.physicalFactsToSync.parking_spaces).toBe(15);
    expect(result.physicalFactsToSync.photos?.length).toBe(1);

    // Deal terms MUST be null (isolated to this version)
    expect(result.dealTermsToSync).toBeNull();

    // Snapshot payload preserves both
    expect(result.snapshotPayload.syncDealTermsToSsot).toBe(false);
    expect(result.snapshotPayload.dealTerms.asking_price).toBe(250_0000_0000);
    expect(result.snapshotPayload.dealTerms.monthly_rent_total_krw).toBe(7500_0000);
  });

  it('Explicit Opt-In (syncDealTermsToSsot: true): deal terms partition into dealTermsToSync', () => {
    const result = partitionWriteBackPayload(sampleInput, { syncDealTermsToSsot: true });

    // Physical facts present
    expect(result.physicalFactsToSync.address).toBe('서울특별시 강남구 테헤란로 152');

    // Deal terms MUST be populated
    expect(result.dealTermsToSync).not.toBeNull();
    expect(result.dealTermsToSync?.asking_price).toBe(250_0000_0000);
    expect(result.dealTermsToSync?.asking_price_manwon).toBe(2500000);
    expect(result.dealTermsToSync?.deposit_total_krw).toBe(20_0000_0000);
    expect(result.dealTermsToSync?.monthly_rent_total_krw).toBe(7500_0000);
    expect(result.dealTermsToSync?.rent_roll?.length).toBe(1);
    expect(result.dealTermsToSync?.investment_posture).toBe('core_income');

    expect(result.snapshotPayload.syncDealTermsToSsot).toBe(true);
  });
});
