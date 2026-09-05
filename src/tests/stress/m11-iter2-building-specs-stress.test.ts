/**
 * @file m11-iter2-building-specs-stress.test.ts
 * @description Empirical Challenger 1 Stress & Mutation Test Harness for Milestone 1 Iteration 2:
 *              - validateBuildingSpecs boundary & mutation inputs
 *              - buildDocFromFixture strict mode throwing & missing section omissions
 *              - Combinatorial mutations across 4 mandatory specs & 3 Key Facts tiers & essential Korean labels
 *              - Clean fixtures acceptance oracle
 *              - Adversarial Edge Case Discovery (NaN bypass & malformed row null handling)
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  validateBuildingSpecs,
  type BuildingSpecsInput,
} from '../../domain/building/im-core/broker-input-validator';

// ── SSoT Standalone Fixtures ──
const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

/** Adapter replicated from real-broker-im-pipeline.test.ts for direct empirical testing */
function buildDocFromFixture(fixture: any, photoPath?: string, options?: { strict?: boolean }) {
  const specValidation = validateBuildingSpecs(fixture);
  if (options?.strict && !specValidation.isValid) {
    throw new Error(`[buildDocFromFixture] SSoT 건축 제원 정합성 오류: ${specValidation.errors.join('; ')}`);
  }

  const keyFacts = fixture.keyFacts3Tier;
  const keyFactsTableRows: string[] = [];
  if (keyFacts) {
    if (keyFacts.tier1_subject) {
      keyFacts.tier1_subject.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **대상지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier2_land) {
      keyFacts.tier2_land.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **토지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier3_building) {
      keyFacts.tier3_building.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **건물** | ${k} | ${v} | - |`);
      });
    }
  }

  const hasCompleteKeyFacts = Boolean(
    keyFacts?.tier1_subject?.length &&
    keyFacts?.tier2_land?.length &&
    keyFacts?.tier3_building?.length
  );

  const sections: any[] = [];
  if (hasCompleteKeyFacts && keyFactsTableRows.length > 0) {
    sections.push({
      section_type: 'property_overview',
      title: '토지 및 건물 제원',
      markdown: `### 건축물대장 및 3단 그룹 Key Facts 제원\n\n| 구분 | 주요 항목 | 상세 제원 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
    });
  }

  return {
    title: fixture.title,
    sections,
  };
}

describe('Empirical Challenger 1: validateBuildingSpecs & buildDocFromFixture Stress Harness', () => {

  // =========================================================================
  // 1. Clean Fixtures Acceptance Oracle
  // =========================================================================
  describe('1. Clean Fixtures Acceptance Oracle', () => {
    it('[Clean Oracle] sinsa-590-fixture is accepted without errors', () => {
      const res = validateBuildingSpecs(sinsaFixture);
      expect(res.isValid).toBe(true);
      expect(res.missingSpecs).toHaveLength(0);
      expect(res.missingTiers).toHaveLength(0);
      expect(res.missingLabels).toHaveLength(0);
      expect(res.errors).toHaveLength(0);

      const doc = buildDocFromFixture(sinsaFixture, undefined, { strict: true });
      expect(doc.sections.find(s => s.section_type === 'property_overview')).toBeDefined();
    });

    it('[Clean Oracle] seocho-1364-28-fixture is accepted without errors', () => {
      const res = validateBuildingSpecs(seochoFixture);
      expect(res.isValid).toBe(true);
      expect(res.missingSpecs).toHaveLength(0);
      expect(res.missingTiers).toHaveLength(0);
      expect(res.missingLabels).toHaveLength(0);
      expect(res.errors).toHaveLength(0);

      const doc = buildDocFromFixture(seochoFixture, undefined, { strict: true });
      expect(doc.sections.find(s => s.section_type === 'property_overview')).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Individual Missing Spec Mutations (4 Mandatory Specs)
  // =========================================================================
  describe('2. Individual Missing Spec Mutations', () => {
    it('[Mutation archAreaM2] rejects null, undefined, zero, negative, non-number string', () => {
      const testCases = [
        { val: undefined, reason: 'undefined' },
        { val: null, reason: 'null' },
        { val: 0, reason: 'zero area' },
        { val: -0.01, reason: 'negative fraction' },
        { val: -544.7, reason: 'negative area' },
        { val: '544.70', reason: 'string representation' },
      ];

      for (const tc of testCases) {
        const mutated = { ...sinsaFixture, archAreaM2: tc.val };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid, `archAreaM2=${tc.val} (${tc.reason}) should fail`).toBe(false);
        expect(res.missingSpecs).toContain('archAreaM2');
        expect(res.errors.some(e => e.includes('건축면적'))).toBe(true);

        // Strict mode throw check
        expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
          .toThrow(/\[buildDocFromFixture\] SSoT 건축 제원 정합성 오류/);
      }
    });

    it('[Mutation completionDate] rejects missing, empty, malformed, non-YYYY-MM-DD formats', () => {
      const testCases = [
        { val: undefined, reason: 'undefined' },
        { val: null, reason: 'null' },
        { val: '', reason: 'empty string' },
        { val: '   ', reason: 'whitespace string' },
        { val: '1998/05/15', reason: 'slash separated' },
        { val: '1998-5-15', reason: 'non-padded month' },
        { val: '1998-05-5', reason: 'non-padded day' },
        { val: '19980515', reason: 'no separators' },
        { val: '15-05-1998', reason: 'DD-MM-YYYY' },
        { val: 19980515, reason: 'numeric timestamp' },
      ];

      for (const tc of testCases) {
        const mutated = { ...sinsaFixture, completionDate: tc.val };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid, `completionDate=${tc.val} (${tc.reason}) should fail`).toBe(false);
        expect(res.missingSpecs).toContain('completionDate');
        expect(res.errors.some(e => e.includes('사용승인일'))).toBe(true);

        expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
          .toThrow(/\[buildDocFromFixture\] SSoT 건축 제원 정합성 오류/);
      }
    });

    it('[Mutation parkingCount] rejects null, undefined, negative counts, non-number string, accepts 0', () => {
      const rejectCases = [
        { val: undefined, reason: 'undefined' },
        { val: null, reason: 'null' },
        { val: -1, reason: '-1 parking' },
        { val: -0.0001, reason: 'negative fraction' },
        { val: -50, reason: '-50 parking' },
        { val: '26', reason: 'string representation' },
      ];

      for (const tc of rejectCases) {
        const mutated = { ...sinsaFixture, parkingCount: tc.val };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid, `parkingCount=${tc.val} (${tc.reason}) should fail`).toBe(false);
        expect(res.missingSpecs).toContain('parkingCount');
        expect(res.errors.some(e => e.includes('주차대수'))).toBe(true);

        expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
          .toThrow(/\[buildDocFromFixture\] SSoT 건축 제원 정합성 오류/);
      }

      // Boundary: parkingCount = 0 (valid for buildings without parking space)
      const validZero = { ...sinsaFixture, parkingCount: 0 };
      const resZero = validateBuildingSpecs(validZero);
      expect(resZero.isValid).toBe(true);
      expect(resZero.missingSpecs).not.toContain('parkingCount');
    });

    it('[Mutation elevatorCount] rejects null, undefined, negative counts, non-number string, accepts 0', () => {
      const rejectCases = [
        { val: undefined, reason: 'undefined' },
        { val: null, reason: 'null' },
        { val: -1, reason: '-1 elevator' },
        { val: -0.5, reason: 'negative fraction' },
        { val: -10, reason: '-10 elevator' },
        { val: '1', reason: 'string representation' },
      ];

      for (const tc of rejectCases) {
        const mutated = { ...seochoFixture, elevatorCount: tc.val };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid, `elevatorCount=${tc.val} (${tc.reason}) should fail`).toBe(false);
        expect(res.missingSpecs).toContain('elevatorCount');
        expect(res.errors.some(e => e.includes('승강기'))).toBe(true);

        expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
          .toThrow(/\[buildDocFromFixture\] SSoT 건축 제원 정합성 오류/);
      }

      // Boundary: elevatorCount = 0 (valid for walk-up buildings without elevators)
      const validZero = { ...seochoFixture, elevatorCount: 0 };
      const resZero = validateBuildingSpecs(validZero);
      expect(resZero.isValid).toBe(true);
      expect(resZero.missingSpecs).not.toContain('elevatorCount');
    });
  });

  // =========================================================================
  // 3. 3-Tier Key Facts Structural Mutations
  // =========================================================================
  describe('3. 3-Tier Key Facts Structural Mutations', () => {
    it('[Mutation missing tier3_building] detects missing tier3 and drops property_overview section', () => {
      const mutated = {
        ...sinsaFixture,
        keyFacts3Tier: {
          tier1_subject: sinsaFixture.keyFacts3Tier.tier1_subject,
          tier2_land: sinsaFixture.keyFacts3Tier.tier2_land,
        },
      };

      const res = validateBuildingSpecs(mutated);
      expect(res.isValid).toBe(false);
      expect(res.missingTiers).toContain('tier3_building');
      expect(res.errors.some(e => e.includes('tier3_building'))).toBe(true);

      // Section omission check
      const doc = buildDocFromFixture(mutated);
      expect(doc.sections.find(s => s.section_type === 'property_overview')).toBeUndefined();

      // Strict mode throws
      expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
        .toThrow(/Key Facts Tier 3/);
    });

    it('[Mutation empty tier3_building array] detects empty tier3', () => {
      const mutated = {
        ...sinsaFixture,
        keyFacts3Tier: {
          ...sinsaFixture.keyFacts3Tier,
          tier3_building: [],
        },
      };

      const res = validateBuildingSpecs(mutated);
      expect(res.isValid).toBe(false);
      expect(res.missingTiers).toContain('tier3_building');

      const doc = buildDocFromFixture(mutated);
      expect(doc.sections.find(s => s.section_type === 'property_overview')).toBeUndefined();
    });

    it('[Mutation missing tier1_subject or tier2_land] detects missing tier and drops section', () => {
      // Missing tier1
      const noTier1 = {
        ...sinsaFixture,
        keyFacts3Tier: {
          tier2_land: sinsaFixture.keyFacts3Tier.tier2_land,
          tier3_building: sinsaFixture.keyFacts3Tier.tier3_building,
        },
      };
      const res1 = validateBuildingSpecs(noTier1);
      expect(res1.isValid).toBe(false);
      expect(res1.missingTiers).toContain('tier1_subject');
      expect(buildDocFromFixture(noTier1).sections.find(s => s.section_type === 'property_overview')).toBeUndefined();

      // Missing tier2
      const noTier2 = {
        ...sinsaFixture,
        keyFacts3Tier: {
          tier1_subject: sinsaFixture.keyFacts3Tier.tier1_subject,
          tier3_building: sinsaFixture.keyFacts3Tier.tier3_building,
        },
      };
      const res2 = validateBuildingSpecs(noTier2);
      expect(res2.isValid).toBe(false);
      expect(res2.missingTiers).toContain('tier2_land');
      expect(buildDocFromFixture(noTier2).sections.find(s => s.section_type === 'property_overview')).toBeUndefined();

      // keyFacts3Tier missing entirely
      const noKeyFacts = { ...sinsaFixture, keyFacts3Tier: undefined };
      const res3 = validateBuildingSpecs(noKeyFacts);
      expect(res3.isValid).toBe(false);
      expect(res3.missingTiers).toEqual(['tier1_subject', 'tier2_land', 'tier3_building']);
      expect(buildDocFromFixture(noKeyFacts).sections.find(s => s.section_type === 'property_overview')).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Essential Korean Labels Verification
  // =========================================================================
  describe('4. Essential Korean Labels Mutation Verification', () => {
    const labelsTier3 = ['연면적', '건축면적', '사용승인일', '주차', '승강기'];

    labelsTier3.forEach((targetLabel) => {
      it(`[Mutation Tier 3 Label] missing '${targetLabel}' causes validation rejection`, () => {
        const mutated = {
          ...sinsaFixture,
          keyFacts3Tier: {
            ...sinsaFixture.keyFacts3Tier,
            tier3_building: sinsaFixture.keyFacts3Tier.tier3_building.filter(
              ([label]: [string, string]) => !label.includes(targetLabel)
            ),
          },
        };

        const res = validateBuildingSpecs(mutated);
        expect(res.isValid).toBe(false);
        expect(res.missingLabels.some(l => l.includes(targetLabel))).toBe(true);
        expect(res.errors.some(e => e.includes(targetLabel))).toBe(true);

        expect(() => buildDocFromFixture(mutated, undefined, { strict: true }))
          .toThrow(new RegExp(targetLabel));
      });
    });

    it('[Mutation Tier 1 Labels] missing 소재지 or 매각희망가 or Cap Rate causes rejection', () => {
      for (const t1Target of ['소재지', '매각희망가', '수익률']) {
        const mutated = {
          ...sinsaFixture,
          keyFacts3Tier: {
            ...sinsaFixture.keyFacts3Tier,
            tier1_subject: sinsaFixture.keyFacts3Tier.tier1_subject.filter(
              ([label]: [string, string]) => !label.includes(t1Target) && !label.includes('Cap Rate')
            ),
          },
        };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid).toBe(false);
        expect(res.missingLabels.length).toBeGreaterThan(0);
      }
    });

    it('[Mutation Tier 2 Labels] missing 대지면적 or 용도지역 causes rejection', () => {
      for (const t2Target of ['대지면적', '용도지역']) {
        const mutated = {
          ...sinsaFixture,
          keyFacts3Tier: {
            ...sinsaFixture.keyFacts3Tier,
            tier2_land: sinsaFixture.keyFacts3Tier.tier2_land.filter(
              ([label]: [string, string]) => !label.includes(t2Target)
            ),
          },
        };
        const res = validateBuildingSpecs(mutated);
        expect(res.isValid).toBe(false);
        expect(res.missingLabels.some(l => l.includes(t2Target))).toBe(true);
      }
    });
  });

  // =========================================================================
  // 5. Robustness against Malformed / Fuzzed Inputs
  // =========================================================================
  describe('5. Robustness against Malformed / Fuzzed Inputs', () => {
    it('handles null, undefined, primitive, and empty object inputs without throwing unhandled exceptions', () => {
      const malformedInputs = [
        null,
        undefined,
        {},
        'invalid string input',
        12345,
        [],
        true,
      ];

      for (const input of malformedInputs) {
        expect(() => validateBuildingSpecs(input as any)).not.toThrow();
        const res = validateBuildingSpecs(input as any);
        expect(res.isValid).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
      }
    });

    it('handles corrupted row entries in keyFacts3Tier without crashing', () => {
      const corruptedRowsInput = {
        ...sinsaFixture,
        keyFacts3Tier: {
          tier1_subject: [undefined, 123, 'not an array'] as any,
          tier2_land: [[]] as any,
          tier3_building: [['건축면적', '544.70㎡'], ['사용승인일', '1998-05-15']] as any,
        },
      };

      expect(() => validateBuildingSpecs(corruptedRowsInput)).not.toThrow();
      const res = validateBuildingSpecs(corruptedRowsInput);
      expect(res.isValid).toBe(false);
      // Missing labels in tier1 and tier2 and remaining tier3 labels detected
      expect(res.missingLabels.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 6. Combinatorial 2^4 = 16 Mutation Generator Harness
  // =========================================================================
  describe('6. Combinatorial 2^4 = 16 Mutation Generator Harness', () => {
    // Generate all 16 bitmasks
    for (let mask = 0; mask < 16; mask++) {
      const isClean = mask === 0;
      const mutatedKeys: string[] = [];
      const clone = { ...sinsaFixture };

      if (mask & 1) { delete clone.archAreaM2; mutatedKeys.push('archAreaM2'); }
      if (mask & 2) { delete clone.completionDate; mutatedKeys.push('completionDate'); }
      if (mask & 4) { delete clone.parkingCount; mutatedKeys.push('parkingCount'); }
      if (mask & 8) { delete clone.elevatorCount; mutatedKeys.push('elevatorCount'); }

      it(`Bitmask ${mask.toString(2).padStart(4, '0')} [${isClean ? 'CLEAN' : mutatedKeys.join('+')}]: correctly classified`, () => {
        const res = validateBuildingSpecs(clone);
        if (isClean) {
          expect(res.isValid).toBe(true);
          expect(res.missingSpecs).toHaveLength(0);
          expect(() => buildDocFromFixture(clone, undefined, { strict: true })).not.toThrow();
        } else {
          expect(res.isValid).toBe(false);
          for (const k of mutatedKeys) {
            expect(res.missingSpecs).toContain(k);
          }
          expect(() => buildDocFromFixture(clone, undefined, { strict: true }))
            .toThrow(/\[buildDocFromFixture\] SSoT 건축 제원 정합성 오류/);
        }
      });
    }
  });

  // =========================================================================
  // 7. Empirical Adversarial Challenge: IEEE 754 NaN & Unsafe Row Edge Cases
  // =========================================================================
  describe('7. Adversarial Challenge Findings (Bypass & Crash Risks)', () => {
    it('[VULNERABILITY FINDING 1] IEEE 754 NaN bypasses archAreaM2 check because (NaN <= 0) is false', () => {
      // In JS: typeof NaN === 'number', NaN == null is false, and (NaN <= 0) is false!
      // Therefore, validateBuildingSpecs evaluates archAreaM2: NaN as valid!
      const nanArch = { ...sinsaFixture, archAreaM2: NaN };
      const res = validateBuildingSpecs(nanArch);
      // We empirically verify that validateBuildingSpecs CURRENTLY fails to catch NaN:
      expect(res.missingSpecs).not.toContain('archAreaM2');
      expect(res.isValid).toBe(true); // Demonstrates the gap: should ideally be false
    });

    it('[VULNERABILITY FINDING 2] IEEE 754 NaN bypasses parkingCount & elevatorCount checks', () => {
      // Similarly, (NaN < 0) is false, so parkingCount: NaN and elevatorCount: NaN are not caught
      const nanParkingAndElevator = { ...sinsaFixture, parkingCount: NaN, elevatorCount: NaN };
      const res = validateBuildingSpecs(nanParkingAndElevator);
      expect(res.missingSpecs).not.toContain('parkingCount');
      expect(res.missingSpecs).not.toContain('elevatorCount');
      expect(res.isValid).toBe(true); // Demonstrates the gap: should ideally be false
    });

    it('[VULNERABILITY FINDING 3] Malformed row entry [null, ...] in tier1_subject throws unhandled TypeError on .includes', () => {
      // In tier1_subject:
      // if (!t1Labels.some((l: string) => l.includes('Cap Rate') || l.includes('수익률')))
      // If t1 contains [null, 'value'] as the FIRST or ONLY entry, l is null.
      // Calling null.includes('Cap Rate') throws TypeError: Cannot read properties of null (reading 'includes')
      const nullLabelRow = {
        ...sinsaFixture,
        keyFacts3Tier: {
          ...sinsaFixture.keyFacts3Tier,
          tier1_subject: [
            [null, 'malformed value'] as any,
          ],
        },
      };

      // Empirically reproduces the crash vulnerability:
      expect(() => validateBuildingSpecs(nullLabelRow)).toThrow(TypeError);
    });
  });
});
