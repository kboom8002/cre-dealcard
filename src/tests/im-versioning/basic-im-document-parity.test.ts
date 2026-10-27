/**
 * @file src/tests/im-versioning/basic-im-document-parity.test.ts
 * @description WP-P4a2-02 & WP-P4a2-05: Canonical BasicImDocument & 5-Posture Numeric Parity Test.
 *
 * Asserts:
 * 1. buildBasicImDocument() synthesizes all 10 standard Basic IM sections in order.
 * 2. Exact numerical parity across all 5 postures (core_income, value_add, development, owner_occupier, repositioning).
 * 3. Zero divergence in yield, price, land area, and GFA between facts and section presentation models.
 */

import { describe, it, expect } from 'vitest';
import {
  buildBasicImDocument,
  type BasicImDocument,
} from '@/domain/building/im-core/basic-im-document';
import {
  extractPureBuildingFacts,
  type PureBuildingFacts,
  type InvestmentPosture,
} from '@/domain/building/im-core/facts';

describe('WP-P4a2-02 & WP-P4a2-05: BasicImDocument SSOT & 5-Posture Parity Assertion', () => {
  const POSTURES: InvestmentPosture[] = [
    'core_income',
    'value_add',
    'development',
    'owner_occupier',
    'repositioning',
  ];

  it('generates all 10 canonical sections with valid archetypes and titles in order', () => {
    const rawFacts = {
      title: '영등포구 양평동 빌딩',
      address: '서울특별시 영등포구 양평동 11-47',
      posture: 'core_income',
      asking_price_manwon: 950000,
      total_gross_area_sqm: 1450.2,
      land_area_sqm: 420.5,
      monthly_rent_total_manwon: 3200,
      deposit_total_manwon: 30000,
    };

    const facts = extractPureBuildingFacts(rawFacts);
    const doc = buildBasicImDocument(facts);

    expect(doc.schemaVersion).toBe('3.0');
    expect(doc.builderVersion).toBe('2026.10');
    expect(doc.inputHash.startsWith('sha256:')).toBe(true);
    expect(doc.docHash.startsWith('sha256:')).toBe(true);

    const expectedSections = [
      { id: '01_cover', archetype: 'A01', type: 'cover' },
      { id: '02_summary', archetype: 'A02', type: 'summary' },
      { id: '03_overview', archetype: 'A04', type: 'overview' },
      { id: '04_location', archetype: 'A06', type: 'location' },
      { id: '05_land', archetype: 'A27', type: 'land' },
      { id: '06_rentroll', archetype: 'A24', type: 'rentroll' },
      { id: '07_yield', archetype: 'A23', type: 'yield' },
      { id: '08_comps', archetype: 'A26', type: 'comps' },
      { id: '09_photos', archetype: 'A14', type: 'photos' },
      { id: '10_contact', archetype: 'A10', type: 'contact' },
    ];

    expect(doc.sections.length).toBe(10);

    doc.sections.forEach((sec, idx) => {
      const exp = expectedSections[idx];
      expect(sec.id).toBe(exp.id);
      expect(sec.archetype).toBe(exp.archetype);
      expect(sec.sectionType).toBe(exp.type);
      expect(sec.order).toBe(idx + 1);
      expect(sec.title).toBeTruthy();
      expect(sec.data).toBeDefined();
    });
  });

  describe('Numeric Parity across 5 Postures', () => {
    POSTURES.forEach((posture) => {
      it(`asserts 100% numerical equality between facts and generated sections for [${posture}]`, () => {
        const raw = {
          title: `강남구 대치동 [${posture}] 매물`,
          address: '서울특별시 강남구 대치동 987-65',
          investment_posture: posture,
          asking_price_manwon: 1200000, // 120억
          total_gross_area_sqm: 1800.5,
          land_area_sqm: 450.3,
          monthly_rent_total_manwon: 4100, // 4100만
          deposit_total_manwon: 25000, // 25억
          building_coverage_ratio_pct: 58.4,
          floor_area_ratio_pct: 395.2,
          floors_above: 6,
          floors_below: 1,
          parking_spaces: 12,
          elevators: 1,
          structure: '철근콘크리트구조',
        };

        const facts = extractPureBuildingFacts(raw);
        const doc = buildBasicImDocument(facts);

        expect(doc.posture).toBe(posture);

        // 1. Cover Section Parity
        const cover = doc.sections.find((s) => s.sectionType === 'cover')!;
        expect(cover.data.askingPriceManwon).toBe(facts.transaction.askingPriceManwon);
        expect(cover.data.grossYieldPct).toBe(facts.valuation.grossYieldPct);
        expect(cover.data.totalGrossAreaPyeong).toBe(facts.building.totalGrossAreaPyeong);

        // 2. Overview Section Parity
        const overview = doc.sections.find((s) => s.sectionType === 'overview')!;
        expect(overview.data.landAreaSqm).toBe(facts.land.landAreaSqm);
        expect(overview.data.totalGrossAreaSqm).toBe(facts.building.totalGrossAreaSqm);
        expect(overview.data.buildingCoverageRatioPct).toBe(facts.building.buildingCoverageRatioPct);
        expect(overview.data.floorAreaRatioPct).toBe(facts.building.floorAreaRatioPct);
        expect(overview.data.parkingSpaces).toBe(facts.building.parkingSpaces);
        expect(overview.data.elevators).toBe(facts.building.elevators);

        // 3. Land Section Parity
        const land = doc.sections.find((s) => s.sectionType === 'land')!;
        expect(land.data.landAreaSqm).toBe(facts.land.landAreaSqm);
        expect(land.data.landAreaPyeong).toBe(facts.land.landAreaPyeong);
        expect(land.data.zoning).toBe(facts.land.zoning);

        // 4. Rent Roll Section Parity
        const rentroll = doc.sections.find((s) => s.sectionType === 'rentroll')!;
        expect(rentroll.data.depositTotalKrw).toBe(facts.rent.depositTotalKrw);
        expect(rentroll.data.monthlyRentTotalKrw).toBe(facts.rent.monthlyRentTotalKrw);
        expect(rentroll.data.annualRentKrw).toBe(facts.rent.annualRentKrw);
        expect(rentroll.data.occupancyRatePct).toBe(facts.rent.occupancyRatePct);

        // 5. Yield Section Parity
        const yieldSec = doc.sections.find((s) => s.sectionType === 'yield')!;
        expect(yieldSec.data.askingPriceKrw).toBe(facts.transaction.askingPriceKrw);
        expect(yieldSec.data.depositTotalKrw).toBe(facts.rent.depositTotalKrw);
        expect(yieldSec.data.grossYieldPct).toBe(facts.valuation.grossYieldPct);
        expect(yieldSec.data.capRatePct).toBe(facts.valuation.capRatePct);
        expect(yieldSec.data.pricePerPyeongLandWon).toBe(facts.transaction.pricePerPyeongLandWon);
        expect(yieldSec.data.pricePerPyeongGfaWon).toBe(facts.transaction.pricePerPyeongGfaWon);
      });
    });
  });
});
