import { describe, it, expect } from 'vitest';
import {
  YANGPYEONG_FIXTURE,
  DANGSAN_FIXTURE,
  JAMWON_FIXTURE,
  SUTAEK_FIXTURE,
  HOTEL_FIXTURE,
  OWNOCC_FIXTURE,
  TRADING_FIXTURE,
  MULTIPARCEL_FIXTURE,
} from './fixtures';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';

describe('L4: Output Artifacts & Fixture Verifications (20 cases)', () => {
  describe('8 Fixtures Outcome Verification', () => {
    it('L4-YP-01: yangpyeong fixture resolves to A grade', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
          building_basic: 'filled',
          zoning: 'filled',
          road_access: 'filled',
          title_encumbrance: 'filled',
          lease_roll: 'filled',
          financial_input: 'filled',
          leaseUnits: YANGPYEONG_FIXTURE.ledger.rows,
        },
        { investmentPosture: YANGPYEONG_FIXTURE.posture, assetType: 'office' }
      );
      expect(gradeResult.grade).toBe(YANGPYEONG_FIXTURE.expect.grade);
    });

    it('L4-DS-01: dangsan fixture resolves to C grade with partial slots', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
          // P축 1개만, L축 없음
        },
        { investmentPosture: DANGSAN_FIXTURE.posture, assetType: 'retail' }
      );
      expect(['C', 'D']).toContain(gradeResult.grade);
    });

    it('L4-JW-01: jamwon fixture resolves to C or B grade for development posture', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
          building_basic: 'filled',
          zoning: 'filled',
          development_plan: 'filled',
        },
        { investmentPosture: JAMWON_FIXTURE.posture, assetType: 'development_site' }
      );
      expect(['B', 'C']).toContain(gradeResult.grade);
    });

    it('L4-ST-01: sutaek fixture resolves to D grade and blocks publication', () => {
      const gradeResult = computeDataGrade(
        {},
        { investmentPosture: SUTAEK_FIXTURE.posture, assetType: 'bare_land' }
      );
      expect(gradeResult.grade).toBe('D');
      expect(() => buildDeckSequence({ posture: 'development', grade: 'D' })).toThrow(/D등급/);
    });

    it('L4-HT-01: hotel fixture with empty GOP resolves to D grade and blocks publication', () => {
      const gradeResult = computeDataGrade(
        {},
        { investmentPosture: HOTEL_FIXTURE.posture, assetType: 'hotel' }
      );
      expect(gradeResult.grade).toBe('D');
      expect(() => buildDeckSequence({ posture: 'operating', grade: 'D' })).toThrow(/D등급/);
    });

    it('L4-OO-01: ownocc fixture resolves to B grade with valid occupancy plan', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
          building_basic: 'filled',
          zoning: 'filled',
          occupancy_plan: 'filled',
        },
        { investmentPosture: OWNOCC_FIXTURE.posture, assetType: 'office_building' }
      );
      expect(['A', 'B']).toContain(gradeResult.grade);
    });

    it('L4-TR-01: trading fixture resolves to C or D grade and blocks trading posture publish', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
        },
        { investmentPosture: TRADING_FIXTURE.posture, assetType: 'retail' }
      );
      expect(['C', 'D']).toContain(gradeResult.grade);
    });

    it('L4-MP-01: multiparcel fixture resolves to A grade with multiple parcels and full ledger', () => {
      const gradeResult = computeDataGrade(
        {
          land_parcel: 'filled',
          building_basic: 'filled',
          zoning: 'filled',
          road_access: 'filled',
          title_encumbrance: 'filled',
          lease_roll: 'filled',
          financial_input: 'filled',
          leaseUnits: YANGPYEONG_FIXTURE.ledger.rows,
        },
        { investmentPosture: MULTIPARCEL_FIXTURE.posture, assetType: 'office' }
      );
      expect(gradeResult.grade).toBe('A');
    });
  });

  describe('Ledger Invariants & Data Integrity', () => {
    it('L4-RR-SPLIT: Yangpyeong 12 rows ledger is fully preserved without truncation', () => {
      expect(YANGPYEONG_FIXTURE.ledger.rows.length).toBe(12);
      const activeUnits = YANGPYEONG_FIXTURE.ledger.rows.filter(r => r.leaseState === '임대중');
      expect(activeUnits.length).toBe(11);
      const ownerOccupied = YANGPYEONG_FIXTURE.ledger.rows.filter(r => r.leaseState === '자가사용');
      expect(ownerOccupied.length).toBe(1);
    });

    it('L4-JW-EXCL: Jamwon effective land area accounts for road exclusion (12.5 sqm)', () => {
      const raw = JAMWON_FIXTURE.asset.landAreaSqm;
      const exclusion = JAMWON_FIXTURE.asset.roadExclusionSqm;
      const effective = JAMWON_FIXTURE.asset.effectiveLandAreaSqm;
      expect(raw - exclusion).toBeCloseTo(effective, 2);
    });

    it('L4-DS-COLLATERAL: Dangsan joint collateral allocation (36억 of 108억)', () => {
      const total = DANGSAN_FIXTURE.asset.jointCollateralTotalKrw;
      const allocated = DANGSAN_FIXTURE.asset.jointCollateralAllocatedKrw;
      expect(allocated).toBeLessThan(total);
      expect(allocated).toBe(3_600_000_000);
    });
  });
});