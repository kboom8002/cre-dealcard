/**
 * @file src/tests/unit/wave3a-cre-math-occupancy-parcel-ssot.test.ts
 * @description Wave 3 Track 3A — Canonical CRE Math, Occupancy Denominator,
 *              Multi-Parcel shareRatio & Commercial Lease Act SSOT Verification Suite.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractValuationFacts } from '@/domain/building/im-core/facts/valuation';
import { extractRentFacts } from '@/domain/building/im-core/facts/rent';
import { extractBuildingSpecs } from '@/domain/building/im-core/facts/building';
import { extractLandFacts } from '@/domain/building/im-core/facts/land';
import { m2ToPyeong, pyeongToM2 } from '@/domain/building/im-core/facts/area';
import { summarizeParcels } from '@/domain/building/mobile-im/parcel-input';
import { calculateConvertedDeposit } from '@/domain/building/im-core/lease-calc';
import {
  evaluateTenancy,
  getThreshold,
  resolveLeaseActRegionFromAddress,
} from '@/domain/ontology/rules/tenancy';
import {
  computeNoiCapRatePct,
  computeGrossYieldPct,
} from '@/lib/workspace/summary/patch-upsert-im';
import { mapDocumentRowToImSummary } from '@/lib/workspace/summary/get-summary-mergers';
import { computeRoi } from '@/components/magazine/roi-calc';

describe('Wave 3 Track 3A: Canonical CRE Math, Occupancy Denominator, Multi-Parcel shareRatio & Lease-Act SSOT', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Zero Save-Induced Cap Rate Drift & Valuation Zero-NOI Guard
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Zero Save-Induced Cap Rate Drift & Valuation Zero-NOI Guard', () => {
    it('[Positive] extractValuationFacts and computeNoiCapRatePct produce identical 3.42% Cap Rate (5% OPEX SSoT)', () => {
      // 매매가 100억 (1,000,000만), 보증금 10억 (100,000만), 월세 3,000만 -> 연 임대료 3.6억, 5% OPEX 차감 NOI 3.42억 -> Cap Rate 3.42%
      const askingPriceManwon = 1_000_000;
      const depositManwon = 100_000;
      const monthlyRentManwon = 3_000;

      const quickGenVal = extractValuationFacts(
        askingPriceManwon * 10_000,
        depositManwon * 10_000,
        monthlyRentManwon * 10_000,
        0
      );
      const savedCapRatePct = computeNoiCapRatePct(monthlyRentManwon, askingPriceManwon);
      const savedGrossYieldPct = computeGrossYieldPct(
        monthlyRentManwon,
        askingPriceManwon,
        depositManwon
      );

      expect(quickGenVal.capRatePct).toBe(3.42);
      expect(savedCapRatePct).toBe(3.42);
      expect(savedCapRatePct).toBe(quickGenVal.capRatePct);
      expect(savedGrossYieldPct).toBe(quickGenVal.grossYieldPct);
      expect(savedGrossYieldPct).toBe(4.0);
    });

    it('[Positive] callers explicitly passing opexRate (e.g. 0.10) still receive custom OPEX Cap Rate', () => {
      expect(computeNoiCapRatePct(3_000, 1_000_000, 0.1)).toBe(3.24);
    });

    it('[Negative Pair] when NOI === 0 despite positive monthlyRentKrw, computedCapRatePct and computedNetYieldPct are 0 (never silently substituting grossYieldPct)', () => {
      // Case A: explicit noiBaseKrw: 0 override (e.g. operating expenses consume 100% of gross revenue)
      const zeroNoiOverride = extractValuationFacts(
        5_000_000_000,
        500_000_000,
        20_000_000,
        0,
        undefined,
        4.5,
        { noiBaseKrw: 0 }
      );
      expect(zeroNoiOverride.grossYieldPct).toBe(5.33);
      expect(zeroNoiOverride.netAnnualOperatingIncomeKrw).toBe(0);
      expect(zeroNoiOverride.capRatePct).toBe(0);
      expect(zeroNoiOverride.netYieldPct).toBe(0);

      // Case B: askingPriceKrw <= 0 with grossYieldPct override -> computedCapRatePct stays 0
      const zeroPriceVal = extractValuationFacts(0, 0, 0, 0, undefined, 4.5, {
        grossYieldPct: 4.5,
      });
      expect(zeroPriceVal.capRatePct).toBe(0);
      expect(zeroPriceVal.netYieldPct).toBe(0);
    });

    it('[Negative Pair] computeRoi clamps out-of-bounds vacancyFloors > totalFloors so effectiveDeposit never turns negative', () => {
      const res = computeRoi({
        purchasePrice: 5_000_000_000,
        ltvRatio: 50,
        interestRate: 4.5,
        deposit: 500_000_000,
        monthlyRent: 25_000_000,
        vacancyFloors: 8,
        totalFloors: 5,
      });
      expect(res.occupancyRate).toBe(0);
      expect(res.annualRent).toBe(0);
      // Without clamping, effectiveDeposit was -3억 and equity inflated to 28억 instead of 25억
      expect(res.equity).toBe(2_500_000_000);
    });

    it('RentRollGrid UI distinguishes 임대수익률(실투자금 기준) vs NOI Cap Rate with explicit tooltips', () => {
      const gridPath = path.resolve(process.cwd(), 'src/components/workspace/RentRollGrid.tsx');
      const gridSrc = fs.readFileSync(gridPath, 'utf-8');
      expect(gridSrc).toContain('임대수익률(실투자금 기준)');
      expect(gridSrc).toContain('Gross Yield');
      expect(gridSrc).toContain('NOI Cap Rate');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Multi-Parcel Co-Ownership (shareRatio / 지분율) Summation & Weighted Price
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Multi-Parcel Co-Ownership (shareRatio / 지분율) Summation Fix', () => {
    const P_MAIN = '1168010100107360001';
    const P_ROAD = '1168010100107360002';

    it('[Positive] summarizeParcels weights shared road parcel (200㎡ × 0.25 = 50㎡) in totalAreaM2, partialAreaM2, and weightedOfficialPricePerM2', () => {
      const summary = summarizeParcels([
        {
          pnu: P_MAIN,
          landCategory: '대',
          areaM2: 300,
          shareRatio: 1,
          officialPricePerM2: 10_000_000,
        },
        {
          pnu: P_ROAD,
          landCategory: '도로',
          areaM2: 200,
          shareRatio: 0.25,
          officialPricePerM2: 4_000_000,
        },
      ]);

      expect(summary.count).toBe(2);
      expect(summary.isMulti).toBe(true);
      // 300 * 1 + 200 * 0.25 = 350㎡ (NOT 500㎡)
      expect(summary.partialAreaM2).toBe(350);
      expect(summary.totalAreaM2).toBe(350);
      // Weighted official land price = (300*10,000,000 + 50*4,000,000) / 350 = 3,200,000,000 / 350 = 9,142,857원/㎡
      expect(summary.weightedOfficialPricePerM2).toBe(Math.round(3_200_000_000 / 350));
    });

    it('[Negative Pair] partial parcel missing area keeps totalAreaM2 undefined while still applying shareRatio to partialAreaM2', () => {
      const summary = summarizeParcels([
        { pnu: P_MAIN, landCategory: '대' },
        { pnu: P_ROAD, landCategory: '도로', areaM2: 200, shareRatio: 0.25 },
      ]);
      expect(summary.totalAreaM2).toBeUndefined();
      expect(summary.partialAreaM2).toBe(50);
      expect(summary.weightedOfficialPricePerM2).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Exact Invertible Area Math (0.3025) & 4-Region Commercial Lease Act SSOT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Exact Invertible Area Math & 900,000,000 Boundary + 4-Region Lease Act SSOT', () => {
    it('[Positive] extractBuildingSpecs and extractLandFacts use exact 0.3025 statutory ratio (400㎡ === 121평 exact)', () => {
      const bldg = extractBuildingSpecs({
        total_gross_area_sqm: 400,
        exclusive_area_sqm: 100,
      });
      const land = extractLandFacts({
        land_area_sqm: 400,
      });

      expect(bldg.totalGrossAreaPyeong).toBe(121);
      expect(bldg.exclusiveAreaPyeong).toBe(30.25);
      expect(land.landAreaPyeong).toBe(121);
      expect(pyeongToM2(m2ToPyeong(400))).toBe(400);
    });

    it('[Positive] exact 900,000,000 KRW Seoul boundary (4억 + 500만×100 = 9억) has zero IEEE-754 float drift and isProtected === true', () => {
      const converted = calculateConvertedDeposit({
        deposit: 400_000_000,
        monthlyRent: 5_000_000,
        region: '서울',
      });
      expect(converted.convertedDeposit).toBe(900_000_000);
      expect(Number.isInteger(converted.convertedDeposit)).toBe(true);
      expect(converted.protectionThreshold).toBe(900_000_000);
      expect(converted.isProtected).toBe(true);

      const tenancy = evaluateTenancy(
        { floor: '1F', depositKrw: 400_000_000, monthlyRentKrw: 5_000_000 },
        'seoul'
      );
      expect(tenancy.convertedDeposit).toBe(900_000_000);
      expect(tenancy.isProtected).toBe(true);
    });

    it('[Negative Pair] 1 KRW above Seoul 9억 threshold (400,000,001 + 500만×100) is unprotected', () => {
      const converted = calculateConvertedDeposit({
        deposit: 400_000_001,
        monthlyRent: 5_000_000,
        region: '서울',
      });
      expect(converted.convertedDeposit).toBe(900_000_001);
      expect(converted.isProtected).toBe(false);
    });

    it('[Positive] resolveLeaseActRegionFromAddress accurately resolves all 4 statutory tiers including non_metro (3.7억)', () => {
      expect(resolveLeaseActRegionFromAddress('서울특별시 강남구 역삼동 736-1')).toBe('seoul');
      expect(getThreshold('seoul')).toBe(900_000_000);

      expect(resolveLeaseActRegionFromAddress('경기도 성남시 분당구 정자동')).toBe('metro');
      expect(resolveLeaseActRegionFromAddress('부산광역시 해운대구 우동')).toBe('metro');
      expect(getThreshold('metro')).toBe(690_000_000);

      expect(resolveLeaseActRegionFromAddress('대전광역시 서구 둔산동')).toBe('metro_city');
      expect(resolveLeaseActRegionFromAddress('세종특별자치시 나성동')).toBe('metro_city');
      expect(resolveLeaseActRegionFromAddress('경기도 화성시 동탄대로')).toBe('metro_city');
      expect(getThreshold('metro_city')).toBe(540_000_000);
      // Legacy 'other' preserved at 5.4억
      expect(getThreshold('other')).toBe(540_000_000);

      // Provincial non-metro cities -> 'non_metro' (3.7억)
      for (const addr of ['전북 전주시 완산구 효자동', '강원 춘천시 퇴계동', '제주 제주시 연동']) {
        const region = resolveLeaseActRegionFromAddress(addr);
        expect(region, `Expected non_metro for ${addr}`).toBe('non_metro');
        expect(getThreshold(region)).toBe(370_000_000);
      }

      // 4억 환산보증금 in 전주시 -> exceeds 3.7억 -> unprotected!
      const jeonjuTenancy = evaluateTenancy(
        { floor: '1F', depositKrw: 100_000_000, monthlyRentKrw: 3_000_000 },
        resolveLeaseActRegionFromAddress('전북 전주시')
      );
      expect(jeonjuTenancy.convertedDeposit).toBe(400_000_000);
      expect(jeonjuTenancy.isProtected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Occupancy & Vacancy Denominator SSOT (Rule 76)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. extractRentFacts Non-Leasable Utility Exclusion & Multi-Floor Contract Trace', () => {
    it('[Positive] excludes 0-rent 기계실/전기실/주차장 from leasable unit denominator and keeps multi-floor 0-rent trailing row occupied', () => {
      const facts = extractRentFacts({
        rent_roll: [
          // 1F+2F multi-floor contract where rent is recorded on 1F and 2F had LLM is_vacant: true
          {
            floor: '1F',
            tenant_name: '스타벅스',
            deposit_manwon: 10_000,
            rent_manwon: 800,
            lease_end: '2028-12-31',
            contract_group: '스타벅스통합',
          },
          {
            floor: '2F',
            tenant_name: '스타벅스',
            deposit_manwon: 0,
            rent_manwon: 0,
            is_vacant: true,
            lease_end: '2028-12-31',
            contract_group: '스타벅스통합',
          },
          // 3F genuine vacant unit
          {
            floor: '3F',
            lease_state: '공실',
            is_vacant: true,
            deposit_manwon: 0,
            rent_manwon: 0,
          },
          // B1 0-rent mechanical room (non-leasable utility space)
          {
            floor: 'B1',
            tenant_name: '기계실',
            use: '기계실',
            is_vacant: true,
            deposit_manwon: 0,
            rent_manwon: 0,
          },
        ],
      });

      // Table preserves all 4 rows, but leasable denominator is 3 (1F, 2F, 3F — excluding B1 기계실)
      expect(facts.units).toHaveLength(4);
      expect(facts.unitCount).toBe(3);
      expect(facts.occupiedCount).toBe(2); // 1F + 2F (multi-floor contract trace)
      expect(facts.vacantCount).toBe(1); // 3F only
      expect(facts.occupancyRatePct).toBe(66.7); // 2 / 3 = 66.7%
      expect(facts.monthlyRentTotalManwon).toBe(800);
      expect(facts.depositTotalManwon).toBe(10_000);
    });

    it('[Negative Pair] paid parking operator (주차장 with positive rent) IS counted as a leasable occupied unit', () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: '1F', tenant_name: '편의점', deposit_manwon: 5_000, rent_manwon: 300 },
          { floor: 'B1', tenant_name: '주차장', deposit_manwon: 2_000, rent_manwon: 150 },
        ],
      });
      expect(facts.unitCount).toBe(2);
      expect(facts.occupiedCount).toBe(2);
      expect(facts.vacantCount).toBe(0);
      expect(facts.occupancyRatePct).toBe(100);
      expect(facts.monthlyRentTotalManwon).toBe(450);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. get-summary-mergers Preserving gross_yield_pct 2-Decimal Precision Over cap_rate_pct
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. mapDocumentRowToImSummary Gross Yield Priority & 2-Decimal Precision', () => {
    it('[Positive] prioritizes ssot_summary.gross_yield_pct (2-decimal) before cap_rate_pct without 1-decimal truncation', () => {
      const summary = mapDocumentRowToImSummary(
        {
          id: 'doc-yield-ssot',
          building_id: 'bld-yield-ssot',
          status: 'published',
          ssot_summary: {
            investment_posture: 'core_income',
            asking_price_manwon: 1_000_000,
            gross_yield_pct: 4.38,
            cap_rate_pct: 3.42,
          },
        },
        [{ id: 'bld-yield-ssot', layers: {} }],
        new Map()
      );

      // Must preserve 4.38 (gross_yield_pct with 2 decimals), NOT 3.4 (1-decimal cap_rate_pct)
      expect(summary.grossYieldPct).toBe(4.38);
    });

    it('[Negative Pair] falls back to 2-decimal cap_rate_pct only when gross_yield_pct is absent/0, and 0 for owner_occupied', () => {
      const fallbackSummary = mapDocumentRowToImSummary(
        {
          id: 'doc-cap-fallback',
          building_id: 'bld-cap-fallback',
          status: 'published',
          ssot_summary: {
            investment_posture: 'core_income',
            asking_price_manwon: 1_000_000,
            cap_rate_pct: 3.42,
          },
        },
        [{ id: 'bld-cap-fallback', layers: {} }],
        new Map()
      );
      expect(fallbackSummary.grossYieldPct).toBe(3.42);

      const ownerSummary = mapDocumentRowToImSummary(
        {
          id: 'doc-owner',
          building_id: 'bld-owner',
          status: 'published',
          ssot_summary: {
            investment_posture: 'owner_occupied',
            asking_price_manwon: 1_000_000,
            gross_yield_pct: 4.38,
            cap_rate_pct: 3.42,
          },
        },
        [{ id: 'bld-owner', layers: {} }],
        new Map()
      );
      expect(ownerSummary.grossYieldPct).toBe(0);
    });
  });
});
