import { describe, test, expect, beforeAll } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { IncomeArchetype } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildMinimalDoc, BUILDING_META, assertNoCorruptionStrings, extractSlideTexts } from './pptx-test-helpers';

describe('Axis 5: Income Posture Archetype Branching (Pro Tier)', { timeout: 30_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  const archetypes: Array<{
    id: IncomeArchetype;
    name: string;
    expectedDataKeys: string[];
    expectedKeywords: string[];
  }> = [
    {
      id: 'R-INC-01',
      name: '초안정형',
      expectedDataKeys: ['rentRoll', 'stability', 'profit', 'capital', 'comps'],
      expectedKeywords: ['Rent Roll', '임대안정성'],
    },
    {
      id: 'R-INC-02',
      name: '임대료 정상화형',
      expectedDataKeys: ['rentRoll', 'rentGap', 'upside', 'capital', 'comps'],
      expectedKeywords: ['Rent Roll', '임대료 갭', '인상 경로'],
    },
    {
      id: 'R-INC-03',
      name: '공실 해소형',
      expectedDataKeys: ['rentRoll', 'vacancy', 'leasing', 'capital', 'comps'],
      expectedKeywords: ['Rent Roll', '공실 분석', '임차 유치'],
    },
    {
      id: 'R-INC-04',
      name: '리모델링형',
      expectedDataKeys: ['rentRoll', 'current', 'remodel', 'capital', 'comps'],
      expectedKeywords: ['Rent Roll', '현황 분석', '리모델링'],
    },
  ];

  archetypes.forEach(({ id, name, expectedDataKeys, expectedKeywords }) => {
    test(`A${id}: ${name} (${id}) sequence and PPTX rendering`, async () => {
      // 1. Deck sequencer sequence verification
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: id,
      });
      const dataKeysInSequence = sequence.map(s => s.dataKey);

      for (const expectedKey of expectedDataKeys) {
        expect(
          dataKeysInSequence,
          `[${id}] dataKey "${expectedKey}" must be present in Pro sequence`
        ).toContain(expectedKey);
      }

      // 2. Full In-Memory PPTX Rendering verification
      const input: MobileImPptxInput = {
        buildingId: `income-arch-${id.toLowerCase()}`,
        posture: 'income',
        grade: 'A',
        incomeArchetype: id,
        doc: buildMinimalDoc('income'),
        building: BUILDING_META.income,
        broker: { display_name: '박민호', company_name: '리얼티코리아' },
      };

      const result = await renderer.render(input);
      expect(result.buffer.length).toBeGreaterThan(10_000);
      expect(result.slideCount).toBeGreaterThanOrEqual(10);
      expect(result.slideCount).toBeLessThanOrEqual(24);

      await assertNoCorruptionStrings(result.buffer);

      // 3. Extracted slide text verification
      const slideTextsMap = await extractSlideTexts(result.buffer);
      const allText = Array.from(slideTextsMap.values()).flat().join(' ');

      // Check for presence of key titles
      for (const kw of expectedKeywords) {
        expect(
          allText,
          `[${id}] Keyword "${kw}" expected in rendered PPTX content`
        ).toContain(kw);
      }
    });
  });
});
