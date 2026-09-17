import { describe, it, expect } from 'vitest';
import {
  buildProDeckSequence,
  PRO_PAGE_HARD_LIMIT,
  PRO_PAGE_MIN_LIMIT,
  PRO_PAGE_TARGET,
} from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
  type DeckSequenceInput,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { bindProImChapterData } from '@/domain/building/mobile-im/pptx/data-binder';
import {
  chunkTenantRoster,
  type InstitutionalTenantRosterItem,
} from '@/domain/building/im-core';
import type { InvestmentPosture } from '@/domain/ontology';

describe('Adversarial Stress Test: Pro Deck Sequencer & Basic Deck Sequencer Invariants', () => {
  const ALL_POSTURES: InvestmentPosture[] = [
    'income',
    'owner_occupied',
    'development',
    'operating',
    'trading',
  ];

  const PRO_CHAPTER_DIVIDERS = [
    'ch1_divider',
    'ch2_divider',
    'ch3_divider',
    'ch4_divider',
    'ch5_divider',
  ];

  const PRO_FINANCIAL_SLIDES = [
    'dcf_schedule',
    'opex_breakdown',
    'dcf_valuation',
    'sensitivity_matrix',
    'vacancy_stress',
    'development_budget',
    'debt_financing',
  ];

  const PRO_EXCLUSIVE_SLIDES = [
    ...PRO_CHAPTER_DIVIDERS,
    ...PRO_FINANCIAL_SLIDES,
    'submarket_overview',
    'rental_trends',
    'transit_connectivity',
    'comp_benchmarking',
    'ownership',
    'code_compliance',
    'physical_dd',
    'next_steps',
  ];

  // ==========================================================================
  // Section 1: Posture Diversity Stress Test
  // ==========================================================================
  describe('1. Posture Diversity Stress Test', () => {
    it('produces >= 30 slides for EVERY posture in buildProDeckSequence', () => {
      for (const posture of ALL_POSTURES) {
        const seq = buildProDeckSequence({ posture, grade: 'B' });

        expect(seq.length, `Posture ${posture} slide count`).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
        expect(seq.length, `Posture ${posture} slide count`).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
        expect(seq.length, `Posture ${posture} slide count`).toBe(36);
      }
    });

    it('ensures development posture includes development feasibility budgeting', () => {
      const devSeq = buildProDeckSequence({ posture: 'development', grade: 'B' });
      const devKeys = devSeq.map(s => s.dataKey);

      // Development posture MUST include development_budget
      expect(devKeys).toContain('development_budget');
      const devSlide = devSeq.find(s => s.dataKey === 'development_budget');
      expect(devSlide?.archetype).toBe('A08');
      expect(devSlide?.title).toContain('5단계 개발 사업 수지');

      // Negative Pair: development posture MUST NOT include debt_financing
      expect(devKeys).not.toContain('debt_financing');
    });

    it('ensures non-development postures include debt financing and exclude development budget', () => {
      const nonDevPostures = ALL_POSTURES.filter(p => p !== 'development');

      for (const posture of nonDevPostures) {
        const seq = buildProDeckSequence({ posture, grade: 'B' });
        const keys = seq.map(s => s.dataKey);

        // Non-development postures include debt_financing
        expect(keys, `Posture ${posture} should include debt_financing`).toContain('debt_financing');
        const debtSlide = seq.find(s => s.dataKey === 'debt_financing');
        expect(debtSlide?.archetype).toBe('A16');

        // Negative Pair: non-development postures MUST NOT include development_budget
        expect(keys, `Posture ${posture} should not include development_budget`).not.toContain('development_budget');
      }
    });

    it('verifies all 5 core chapter dividers exist for EVERY posture', () => {
      for (const posture of ALL_POSTURES) {
        const seq = buildProDeckSequence({ posture, grade: 'B' });
        const dividers = seq.filter(s => s.archetype === 'A25');

        expect(dividers.length, `Posture ${posture} dividers count`).toBe(5);
        expect(dividers.map(d => d.dataKey)).toEqual(PRO_CHAPTER_DIVIDERS);
      }
    });

    it('verifies minimum slide counts per chapter for EVERY posture', () => {
      for (const posture of ALL_POSTURES) {
        const seq = buildProDeckSequence({ posture, grade: 'B' });
        const keys = seq.map(s => s.dataKey);

        const ch1 = keys.indexOf('ch1_divider');
        const ch2 = keys.indexOf('ch2_divider');
        const ch3 = keys.indexOf('ch3_divider');
        const ch4 = keys.indexOf('ch4_divider');
        const ch5 = keys.indexOf('ch5_divider');
        const closing = keys.indexOf('closing');

        const ch1Count = ch2 - ch1;
        const ch2Count = ch3 - ch2;
        const ch3Count = ch4 - ch3;
        const ch4Count = ch5 - ch4;
        const ch5Count = closing - ch5;

        expect(ch1Count, `${posture} Ch1`).toBeGreaterThanOrEqual(5); // Actual: 6
        expect(ch2Count, `${posture} Ch2`).toBeGreaterThanOrEqual(6); // Actual: 8
        expect(ch3Count, `${posture} Ch3`).toBeGreaterThanOrEqual(7); // Actual: 7
        expect(ch4Count, `${posture} Ch4`).toBeGreaterThanOrEqual(6); // Actual: 6
        expect(ch5Count, `${posture} Ch5`).toBeGreaterThanOrEqual(6); // Actual: 6
      }
    });
  });

  // ==========================================================================
  // Section 2: Strict Isolation Stress Test (Basic IM vs Pro IM)
  // ==========================================================================
  describe('2. Strict Isolation Stress Test (Basic IM)', () => {
    it('verifies buildDeckSequence with credeal_basic produces strictly <= 16 slides (8-10 slides)', () => {
      for (const posture of ALL_POSTURES) {
        const basicSeq = buildDeckSequence({
          posture,
          preset: 'credeal_basic',
          grade: 'B',
          dataAvailability: {
            hasRentRoll: true,
            hasStackingPlan: true,
            hasPhotos: true,
            hasCadastralMap: true,
          },
        });

        // Strict <= 16 slides requirement
        expect(basicSeq.length, `Basic IM ${posture} slide count`).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
        expect(PAGE_HARD_LIMIT).toBe(16);

        // Expected 8-10 slides
        expect(basicSeq.length, `Basic IM ${posture} slide count`).toBeGreaterThanOrEqual(8);
        expect(basicSeq.length, `Basic IM ${posture} slide count`).toBeLessThanOrEqual(10);
      }
    });

    it('ensures Basic IM NEVER leaks any Pro IM chapter dividers or exclusive slides', () => {
      for (const posture of ALL_POSTURES) {
        const basicSeq = buildDeckSequence({
          posture,
          preset: 'credeal_basic',
          grade: 'B',
          dataAvailability: {
            hasRentRoll: true,
            hasStackingPlan: true,
            hasPhotos: true,
            hasCadastralMap: true,
          },
        });

        const keys = basicSeq.map(s => s.dataKey);
        const archetypes = basicSeq.map(s => s.archetype);

        // Basic IM must NEVER contain A25 (Chapter Divider)
        expect(archetypes, `Basic IM ${posture} should not contain A25`).not.toContain('A25');

        // Basic IM must NEVER contain ANY Pro exclusive dataKeys
        for (const proKey of PRO_EXCLUSIVE_SLIDES) {
          expect(keys, `Basic IM ${posture} leaked Pro slide: ${proKey}`).not.toContain(proKey);
        }
      }
    });

    it('adversarial conflict test: preset credeal_basic takes absolute precedence over isPro/proMode', () => {
      const conflictingInput: DeckSequenceInput = {
        posture: 'income',
        preset: 'credeal_basic',
        isPro: true,
        grade: 'B',
        dataAvailability: {
          hasRentRoll: true,
          hasStackingPlan: true,
          hasPhotos: true,
          hasCadastralMap: true,
        },
      };

      const seq = buildDeckSequence(conflictingInput);

      // Must strictly resolve to Basic IM (10 slides), NOT Pro IM (36 slides)
      expect(seq.length).toBe(10);
      expect(seq.length).toBeLessThanOrEqual(PAGE_HARD_LIMIT);

      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('ch1_divider');
      expect(keys).not.toContain('dcf_schedule');
    });

    it('data availability exhaustion: Basic IM produces valid minimal sequence under zero data', () => {
      for (const posture of ALL_POSTURES) {
        const minimalSeq = buildDeckSequence({
          posture,
          preset: 'credeal_basic',
          grade: 'B',
          hasPhotos: false,
          dataAvailability: {
            hasRentRoll: false,
            hasStackingPlan: false,
            hasPhotos: false,
            hasCadastralMap: false,
            hasComparables: false,
            hasCommercialDistrict: false,
          },
        });

        // Without rentroll, cadastral, photos:
        // income has yieldFormula (7 slides), non-income has no yieldFormula (6 slides)
        expect(minimalSeq.length).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
        expect(minimalSeq.length).toBeGreaterThanOrEqual(6);
        expect(minimalSeq.length).toBeLessThanOrEqual(7);

        const keys = minimalSeq.map(s => s.dataKey);
        expect(keys).not.toContain('cadastralMap');
        expect(keys).not.toContain('gallery');
        expect(keys).not.toContain('rentRoll');
      }
    });
  });

  // ==========================================================================
  // Section 3: Boundary, Scalability & Defensive Stress Tests
  // ==========================================================================
  describe('3. Boundary, Scalability & Defensive Stress Tests', () => {
    it('Grade D rejection (Gate G30) strictly blocks both Basic and Pro IM', () => {
      // Basic IM with Grade D
      expect(() => {
        buildDeckSequence({
          posture: 'income',
          preset: 'credeal_basic',
          grade: 'D',
        });
      }).toThrow('[G30]');

      // Pro IM with Grade D
      expect(() => {
        buildProDeckSequence({
          posture: 'income',
          grade: 'D',
        });
      }).toThrow('[G30]');

      // Negative Pair: Grade A, B, C must NOT throw
      expect(() => buildProDeckSequence({ posture: 'income', grade: 'A' })).not.toThrow();
      expect(() => buildProDeckSequence({ posture: 'income', grade: 'B' })).not.toThrow();
      expect(() => buildProDeckSequence({ posture: 'income', grade: 'C' })).not.toThrow();
    });

    it('handles degenerate and empty inputs to buildProDeckSequence safely', () => {
      // No arguments
      const seqEmpty = buildProDeckSequence();
      expect(seqEmpty.length).toBe(36);
      expect(seqEmpty.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);

      // Empty object
      const seqObj = buildProDeckSequence({});
      expect(seqObj.length).toBe(36);

      // Null argument
      const seqNull = buildProDeckSequence(null as any);
      expect(seqNull.length).toBe(36);

      // Undefined posture & grade
      const seqUndef = buildProDeckSequence({ posture: undefined, grade: undefined });
      expect(seqUndef.length).toBe(36);
    });

    it('tenant roster chunking scalability stress test: never exceeds PRO_PAGE_HARD_LIMIT (40)', () => {
      const tenantCountsToTest = [0, 1, 10, 12, 13, 24, 30, 36, 48, 60, 72, 84, 120, 500];

      for (const count of tenantCountsToTest) {
        const dummyTenants: InstitutionalTenantRosterItem[] = Array.from({ length: count }, (_, i) => ({
          floor: `${i + 1}F`,
          unitNumber: `${i + 1}01`,
          tenantName: `Tenant ${i + 1}`,
          industry: 'Office',
          leasedAreaM2: 100,
          leasedAreaPyeong: 30.25,
          depositKrw: 50_000_000,
          monthlyRentKrw: 3_000_000,
          monthlyMaintenanceKrw: 500_000,
          leaseStartDate: '2024-01-01',
          leaseEndDate: '2026-12-31',
          statutoryProtection10Y: true,
        }));

        const seq = buildProDeckSequence({
          posture: 'income',
          grade: 'B',
          data: {
            floor_leases: dummyTenants,
          },
        });

        expect(seq.length, `Tenant count ${count} slide count min`).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
        expect(seq.length, `Tenant count ${count} slide count max`).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
      }
    });

    it('verifies bindProImChapterData across all 5 postures produces 0 poison tokens', () => {
      const mockDoc = {
        title: '신사동 프라임 빌딩',
        body: {
          asking_price_krw: 40_000_000_000,
          annual_rent_krw: 1_800_000_000,
          total_deposit_krw: 2_500_000_000,
          cap_rate_percent: 4.5,
          total_gross_area_py: 1200,
          land_area_py: 180,
        },
      };

      for (const posture of ALL_POSTURES) {
        const bound = bindProImChapterData(mockDoc, { posture }, {});
        const serialized = JSON.stringify(bound);

        // Zero poison tokens
        expect(serialized).not.toContain('"NaN"');
        expect(serialized).not.toContain(':NaN');
        expect(serialized).not.toContain('undefined');
        expect(serialized).not.toContain('[object Object]');
      }
    });
  });
});
