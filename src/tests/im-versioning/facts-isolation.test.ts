/**
 * @file src/tests/im-versioning/facts-isolation.test.ts
 * @description WP-P4a2-01: Static Boundary & Pure Domain Facts Extraction Tests.
 *
 * 1. AST Static Guard: Asserts ZERO imports of 'sharp', 'pptxgenjs', or 'fs'
 *    in any file under src/domain/building/im-core/facts/*.
 * 2. Pure Unit Tests: Verifies factual extraction of land, building, rent, transaction,
 *    and valuation modules with deterministic behavior.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractLandFacts,
  extractBuildingSpecs,
  extractRentFacts,
  extractTransactionFacts,
  extractValuationFacts,
  extractPureBuildingFacts,
} from '@/domain/building/im-core/facts';

describe('WP-P4a2-01: Pure Facts Layer Extraction & Import Isolation', () => {
  const factsDir = path.resolve(process.cwd(), 'src/domain/building/im-core/facts');

  it('AST Guard: src/domain/building/im-core/facts/* contains ZERO imports of sharp, pptxgenjs, or fs', () => {
    expect(fs.existsSync(factsDir)).toBe(true);

    const factFiles = fs
      .readdirSync(factsDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

    expect(factFiles.length).toBeGreaterThanOrEqual(5);

    const forbiddenImportPatterns = [
      /from\s+['"]sharp['"]/,
      /from\s+['"]pptxgenjs['"]/,
      /from\s+['"]fs(\/.*)?['"]/,
      /require\(['"]sharp['"]\)/,
      /require\(['"]pptxgenjs['"]\)/,
      /require\(['"]fs(\/.*)?['"]\)/,
      /import\(['"]sharp['"]\)/,
      /import\(['"]pptxgenjs['"]\)/,
      /import\(['"]fs(\/.*)?['"]\)/,
    ];

    for (const file of factFiles) {
      const fullPath = path.join(factsDir, file);
      const code = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of forbiddenImportPatterns) {
        expect(
          pattern.test(code),
          `Boundary Violation in ${file}: forbidden import pattern "${pattern.source}" found!`
        ).toBe(false);
      }
    }
  });

  it('pure land facts extractor calculates pyeong, total official price, and handles zoning', () => {
    const raw = {
      land_area_sqm: 330.58,
      official_land_price_won_sqm: 10_000_000,
      zoning: '일반상업지역',
      road_conditions: '20m 도로 접함',
      terrain_shape: '장방형 평지',
      usage_regulation: ['과밀억제권역'],
      pnu: '1168010100100010000',
    };

    const land = extractLandFacts(raw);
    expect(land.landAreaSqm).toBe(330.58);
    expect(land.landAreaPyeong).toBeCloseTo(100, 0);
    expect(land.officialLandPriceWonSqm).toBe(10_000_000);
    expect(land.officialTotalLandPriceWon).toBe(3_305_800_000);
    expect(land.zoning).toBe('일반상업지역');
    expect(land.pnu).toBe('1168010100100010000');
  });

  it('pure building specs extractor calculates GFA, BCR, FAR, structure, and floors', () => {
    const raw = {
      total_gross_area_sqm: 1652.89,
      building_coverage_ratio_pct: 59.8,
      floor_area_ratio_pct: 398.2,
      floors_above: 7,
      floors_below: 1,
      structure: '철근콘크리트구조',
      main_usage: '제1·2종 근린생활시설',
      parking_spaces: 8,
      elevators: 1,
      completion_date: '2020-03-15',
    };

    const specs = extractBuildingSpecs(raw);
    expect(specs.totalGrossAreaSqm).toBe(1652.89);
    expect(specs.totalGrossAreaPyeong).toBeCloseTo(500, 0);
    expect(specs.buildingCoverageRatioPct).toBe(59.8);
    expect(specs.floorAreaRatioPct).toBe(398.2);
    expect(specs.floorsAbove).toBe(7);
    expect(specs.floorsBelow).toBe(1);
    expect(specs.structure).toBe('철근콘크리트구조');
    expect(specs.elevators).toBe(1);
  });

  it('pure rent facts extractor aggregates floor units, rent, deposit, and occupancy', () => {
    const raw = {
      rent_roll: [
        { floor: 'B1', status: 'occupied', rent_manwon: 300, deposit_manwon: 5000, tenant_name: '피트니스' },
        { floor: '1F', status: 'occupied', rent_manwon: 800, deposit_manwon: 10000, tenant_name: '카페' },
        { floor: '2F', status: 'occupied', rent_manwon: 500, deposit_manwon: 5000, tenant_name: '병원' },
        { floor: '3F', status: 'vacant', rent_manwon: 0, deposit_manwon: 0 },
      ],
    };

    const rent = extractRentFacts(raw);
    expect(rent.unitCount).toBe(4);
    expect(rent.occupiedCount).toBe(3);
    expect(rent.vacantCount).toBe(1);
    expect(rent.occupancyRatePct).toBe(75.0);
    expect(rent.monthlyRentTotalManwon).toBe(1600); // 300 + 800 + 500
    expect(rent.depositTotalManwon).toBe(20000); // 5000 + 10000 + 5000
    expect(rent.annualRentKrw).toBe(1600 * 10000 * 12);
  });

  it('pure transaction facts extractor derives price per pyeong and equity', () => {
    const raw = {
      asking_price_manwon: 1000000, // 100억
      expected_loan_ratio: 0.6,
    };

    const landPyeong = 100;
    const gfaPyeong = 500;
    const depositKrw = 10_0000_0000; // 10억

    const tx = extractTransactionFacts(raw, landPyeong, gfaPyeong, depositKrw);
    expect(tx.askingPriceKrw).toBe(100_0000_0000);
    expect(tx.askingPriceManwon).toBe(1000000);
    expect(tx.pricePerPyeongLandWon).toBe(1_0000_0000); // 1억/평
    expect(tx.pricePerPyeongGfaWon).toBe(2000_0000); // 2000만/평
    expect(tx.expectedLoanKrw).toBe(60_0000_0000); // 60억
    expect(tx.estimatedEquityKrw).toBe(30_0000_0000); // 100억 - 10억 보증금 - 60억 대출 = 30억
    expect(tx.acquisitionTaxEstimateKrw).toBe(4_6000_0000); // 4.6%
  });

  it('pure valuation extractor computes gross yield, cap rate, and net yield without NaN', () => {
    const askingPriceKrw = 100_0000_0000; // 100억
    const depositKrw = 10_0000_0000; // 10억
    const monthlyRentKrw = 3000_0000; // 3000만원
    const maintenanceFeeKrw = 200_0000; // 200만원

    const val = extractValuationFacts(askingPriceKrw, depositKrw, monthlyRentKrw, maintenanceFeeKrw);
    // 연간 월세 = 3.6억
    // 실투자금 분모 = 100억 - 10억 = 90억
    // Gross Yield = 3.6억 / 90억 = 4.0%
    expect(val.grossYieldPct).toBeCloseTo(4.0, 1);
    expect(val.capRatePct).toBeGreaterThan(0);
    expect(val.netYieldPct).toBeGreaterThan(0);
    expect(Number.isFinite(val.grossYieldPct)).toBe(true);
    expect(Number.isFinite(val.capRatePct)).toBe(true);
  });

  it('extractPureBuildingFacts synthesizes entire facts object from minimal raw SSOT', () => {
    const raw = {
      title: '테스트 빌딩',
      address: '서울특별시 서초구 서초동',
      investment_posture: 'value_add',
      asking_price_manwon: 500000,
      total_gross_area_sqm: 1000,
      land_area_sqm: 250,
      monthly_rent_total_manwon: 1500,
      deposit_total_manwon: 10000,
    };

    const facts = extractPureBuildingFacts(raw);
    expect(facts.title).toBe('테스트 빌딩');
    expect(facts.address).toBe('서울특별시 서초구 서초동');
    expect(facts.posture).toBe('value_add');
    expect(facts.land.landAreaSqm).toBe(250);
    expect(facts.building.totalGrossAreaSqm).toBe(1000);
    expect(facts.rent.monthlyRentTotalManwon).toBe(1500);
    expect(facts.transaction.askingPriceManwon).toBe(500000);
    expect(facts.valuation.grossYieldPct).toBeGreaterThan(0);
  });
});
