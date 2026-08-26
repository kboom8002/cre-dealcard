import { describe, it, expect } from 'vitest';
import {
  resolveP,
  resolveL,
  gradeMatrix,
  computeDataGrade,
  getDerivedCoeff,
} from '@/domain/asset/grade-engine';
import { computeInputHash, computeIdempotencyKey } from '@/domain/building/mobile-im/idempotency';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { YANGPYEONG_FIXTURE } from './fixtures/yangpyeong';

describe('L1: Pure Calculation Functions (14 cases)', () => {
  // ─── 1. resolveP (Property Resolution) ───
  describe('resolveP', () => {
    it('L1-GRADE-01: resolveP with all 5 property slots filled -> P3', () => {
      const filled = {
        land_parcel: true,
        building_basic: true,
        zoning: true,
        road_access: true,
        title_encumbrance: true,
      };
      expect(resolveP(filled)).toBe('P3');
    });

    it('L1-GRADE-02: resolveP with 0 slots filled -> P0', () => {
      const filled = {};
      expect(resolveP(filled)).toBe('P0');
    });

    it('L1-GRADE-02b: resolveP with partial slots (3/5 = 60%) -> P2', () => {
      const filled = {
        land_parcel: true,
        building_basic: true,
        zoning: true,
      };
      expect(resolveP(filled)).toBe('P2');
    });
  });

  // ─── 2. resolveL (Lead Resolution) ───
  describe('resolveL', () => {
    it('L1-GRADE-03: resolveL for income posture with high fill rate (>=80%) -> R3', () => {
      const filled = {
        lease_roll: true,
        financial_input: true,
      };
      expect(resolveL(filled, 'income')).toBe('R3');
    });

    it('L1-GRADE-04: resolveL for income posture with 0 slots filled -> R0', () => {
      const filled = {};
      expect(resolveL(filled, 'income')).toBe('R0');
    });

    it('L1-GRADE-04b: resolveL for development posture with vacate_plan -> R2 or R3', () => {
      const filled = {
        development_plan: true,
        vacate_plan: true,
        permit_risk: true,
      };
      const result = resolveL(filled, 'development');
      expect(result).toBe('R3');
    });
  });

  // ─── 3. gradeMatrix (L × P Matrix) ───
  describe('gradeMatrix', () => {
    it('L1-GRADE-05: gradeMatrix with R2 x P2 -> A', () => {
      expect(gradeMatrix('R2', 'P2')).toBe('A');
    });

    it('L1-GRADE-06: gradeMatrix with R0 x P0 -> D', () => {
      expect(gradeMatrix('R0', 'P0')).toBe('D');
    });

    it('L1-GRADE-07: gradeMatrix with R1 x P1 -> C', () => {
      expect(gradeMatrix('R1', 'P1')).toBe('C');
    });

    it('L1-GRADE-07b: gradeMatrix with R1 x P2 -> B', () => {
      expect(gradeMatrix('R1', 'P2')).toBe('B');
    });

    it('L1-GRADE-07c: gradeMatrix with R0 x P3 -> D (R0 always forces D)', () => {
      expect(gradeMatrix('R0', 'P3')).toBe('D');
    });
  });

  // ─── 4. computeDataGrade ───
  describe('computeDataGrade', () => {
    it('L1-GRADE-08: computeDataGrade for yangpyeong full dataset -> A grade', () => {
      const result = computeDataGrade(
        {
          building_basic: 'filled',
          land_parcel: 'filled',
          zoning: 'filled',
          road_access: 'filled',
          title_encumbrance: 'filled',
          lease_roll: 'filled',
          financial_input: 'filled',
          leaseUnits: YANGPYEONG_FIXTURE.ledger.rows,
        },
        { investmentPosture: 'income', assetType: 'office' }
      );
      expect(result.grade).toBe('A');
    });
  });

  // ─── 5. Provenance Coefficients (M-1, M-2, M-3) ───
  describe('Source Coefficients', () => {
    it('L1-COEFF-01: getDerivedCoeff with broker_aug -> 0.80', () => {
      expect(getDerivedCoeff(['broker_aug'])).toBe(0.80);
    });

    it('L1-COEFF-02: getDerivedCoeff with expert (0.95) and ledger (0.70) returns min (0.70)', () => {
      expect(getDerivedCoeff(['expert'])).toBe(0.95);
      expect(getDerivedCoeff(['ledger'])).toBe(0.70);
      expect(getDerivedCoeff(['expert', 'ledger'])).toBe(0.70);
    });

    it('L1-COEFF-03: getDerivedCoeff returns the weakest link (min)', () => {
      expect(getDerivedCoeff(['broker_aug', 'ledger'])).toBe(0.70);
      expect(getDerivedCoeff(['public_api', 'broker_aug', 'expert'])).toBe(0.80);
      expect(getDerivedCoeff([])).toBe(0.30); // fallback
    });
  });

  // ─── 6. Idempotency & Hash (BL-7, M-8) ───
  describe('Idempotency & Hash', () => {
    it('L1-HASH-01: computeInputHash produces identical hash for same payload', () => {
      const body1 = { dealId: 'deal-1', price: 1000000000 };
      const body2 = { dealId: 'deal-1', price: 1000000000 };
      expect(computeInputHash(body1)).toBe(computeInputHash(body2));
    });

    it('L1-HASH-02: computeIdempotencyKey produces consistent 64-char sha256 key', () => {
      const params = {
        dealId: 'deal-100',
        inputHash: 'hash-abc-123',
        posture: 'income',
        rendererVersion: '1.0.0',
        
      };
      const key1 = computeIdempotencyKey(params);
      const key2 = computeIdempotencyKey(params);
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64);
    });
  });

  // ─── 7. Data Quality Badge ───
  describe('Data Quality Badge', () => {
    it('L1-BADGE-01: computeDataQualityBadge with all fields returns score and badge', () => {
      const badge = computeDataQualityBadge(
        {
          hasAddress: true,
          hasPublicData: true,
          hasMonthlyRent: true,
          hasVacancy: true,
          hasPhotos: true,
          hasAskingPrice: true,
          hasLandArea: true,
          hasZoning: true,
          hasTotalGrossArea: true,
        },
        'income'
      );
      expect(['verified', 'partial']).toContain(badge.tier);
      expect(badge.score).toBeGreaterThanOrEqual(70);
    });
  });
});
