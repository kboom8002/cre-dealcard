import { describe, it, expect } from 'vitest';
import { POSTURE_CONTRACTS, type PostureContract } from '@/domain/ontology/posture-contract';
import type { InvestmentPosture } from '@/domain/ontology/enums';

describe('Contract-based Invariants Generator (P3-3 / P2-5)', () => {
  const postures = Object.keys(POSTURE_CONTRACTS) as InvestmentPosture[];

  it('contains exactly 5 recognized investment postures', () => {
    expect(postures).toHaveLength(5);
    expect(postures).toContain('income');
    expect(postures).toContain('owner_occupied');
    expect(postures).toContain('development');
    expect(postures).toContain('operating');
    expect(postures).toContain('trading');

    // Negative pair: fake postures must not exist
    expect(postures).not.toContain('crypto_speculation' as any);
    expect(postures).not.toContain('residential_flip' as any);
  });

  postures.forEach((posture) => {
    const contract: PostureContract = POSTURE_CONTRACTS[posture];

    describe(`Posture contract invariant: ${posture}`, () => {
      it(`has at least 7 sections and no duplicates`, () => {
        expect(contract.sections.length).toBeGreaterThanOrEqual(7);

        // Negative pair: uniqueness check
        const uniqueSections = new Set(contract.sections);
        expect(uniqueSections.size).toBe(contract.sections.length);
      });

      it(`has at least 3 archetypes and no duplicates`, () => {
        expect(contract.archetypes.length).toBeGreaterThanOrEqual(3);

        // Negative pair: uniqueness check
        const uniqueArchetypes = new Set(contract.archetypes);
        expect(uniqueArchetypes.size).toBe(contract.archetypes.length);
      });

      it(`ensures all emphasisSections are present in sections`, () => {
        expect(contract.emphasisSections.length).toBeGreaterThanOrEqual(2);
        contract.emphasisSections.forEach((section) => {
          expect(contract.sections).toContain(section);
        });

        // Negative pair: random non-existent section is not in emphasisSections
        expect(contract.emphasisSections).not.toContain('fictional_crypto_yield');
      });

      it(`ensures requiredSlots and lAxisSlots are populated`, () => {
        expect(contract.requiredSlots.length).toBeGreaterThan(0);
        expect(contract.lAxisSlots.length).toBeGreaterThan(0);

        // Negative pair: must not contain empty string slots
        expect(contract.requiredSlots).not.toContain('');
        expect(contract.lAxisSlots).not.toContain('');
      });

      it(`contains valid layout rules, constraints, and nlgMasks`, () => {
        expect(contract.layoutRules.length).toBeGreaterThanOrEqual(1);
        expect(contract.constraints.length).toBeGreaterThanOrEqual(1);
        expect(contract.nlgMasks.length).toBeGreaterThanOrEqual(2);

        // Negative pair: must not be empty arrays
        expect(contract.layoutRules).not.toEqual([]);
        expect(contract.constraints).not.toEqual([]);
        expect(contract.nlgMasks).not.toEqual([]);
      });
    });
  });
});
