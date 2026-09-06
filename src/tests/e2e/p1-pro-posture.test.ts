import { describe, test, expect } from 'vitest';
import { MobileImPptxRenderer, type MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, BUILDING_META, assertNoCorruptionStrings } from './pptx-test-helpers';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import type { InvestmentPosture } from '@/domain/ontology';

describe('MECE Phase 2 - Pro Posture & Income Variants Tests', () => {
  describe('T17: Income 4 Sub-Archetype Variants (Pro)', () => {
    test('T17-01: Income Pro with stability data (R-INC-01)', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-01',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T17-02: Income Pro with rent gap data (R-INC-04)', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-04',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T17-03: Income Pro with vacancy/leasing data (R-INC-05)', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-05',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T17-04: Income Pro with remodel data (R-INC-06)', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-06',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T17-05: Income Pro full render', async () => {
      const renderer = new MobileImPptxRenderer();
      const input: MobileImPptxInput = {
        posture: 'income',
        grade: 'A',
        building: BUILDING_META['income'],
        doc: buildMinimalDoc('income'),
        incomeArchetype: 'R-INC-01'
      };
      
      const { buffer, slideCount } = await renderer.render(input);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(5000);
      expect(slideCount).toBeGreaterThan(10); // Check for at least 11 slides for Pro render as mentioned
      
      await assertNoCorruptionStrings(buffer);
    }, 120_000);
  });

  describe('T18: Pro Sequencer All 5 Postures', () => {
    test('T18-01: operating Pro', () => {
      const sequence = buildDeckSequence({
        posture: 'operating',
        grade: 'A',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T18-02: development Pro', () => {
      const sequence = buildDeckSequence({
        posture: 'development',
        grade: 'A',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T18-03: owner_occupied Pro', () => {
      const sequence = buildDeckSequence({
        posture: 'owner_occupied',
        grade: 'A',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T18-04: trading Pro', () => {
      const sequence = buildDeckSequence({
        posture: 'trading',
        grade: 'A',
        hasPhotos: false,
        dataAvailability: { hasRentRoll: false, hasComparables: false, hasCommercialDistrict: false, hasRegistryData: false, hasBuildingRegister: false, hasCadastralMap: false, hasLandUsePlan: false, hasFloorPlan: false }
      });
      const dataKeys = sequence.map(s => s.dataKey);
      expect(dataKeys).toContain('summary');
    });

    test('T18-05: All 5 postures Pro render', async () => {
      const renderer = new MobileImPptxRenderer();
      const postures: InvestmentPosture[] = ['income', 'development', 'owner_occupied', 'operating', 'trading'];

      for (const posture of postures) {
        const input: MobileImPptxInput = {
          posture,
          grade: 'A',
          building: BUILDING_META[posture],
          doc: buildMinimalDoc(posture),
        };
        const { buffer } = await renderer.render(input);
        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(5000);
        await assertNoCorruptionStrings(buffer);
      }
    }, 120_000);
  });
});
