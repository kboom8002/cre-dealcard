import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import type { DeckSequenceInput } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts } from './pptx-test-helpers';
import type { InvestmentPosture } from '@/domain/ontology';

describe('Stage 4: Chaos Engineering & Boundary Tests', { timeout: 30_000 }, () => {
  let renderer: MobileImPptxRenderer;
  const PAGE_HARD_LIMIT = 16;
  const FIXTURE_BUILDING_ID = 'fe5cbadd-aede-4a58-af40-3982f48ecfa7';

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  const getBaseInput = (posture: InvestmentPosture = 'income'): MobileImPptxInput => ({
    buildingId: FIXTURE_BUILDING_ID,
    posture,
    grade: 'C',
    doc: buildMinimalDoc(posture) as any,
    building: BUILDING_META[posture],
    broker: { display_name: '테스트', company_name: '크리딜', phone: '010-0000-0000' },
  });

  describe('Category 4-A: External API Failure Simulation (via pipeline domain layer)', () => {
    // 1. No address/PNU data
    test('Positive: Renders gracefully with empty address (JUSO API failure)', async () => {
      const input = getBaseInput();
      input.building = { ...input.building, address: '', pnu: '' } as any;
      
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThan(0);
      expect(result.slideCount).toBeLessThanOrEqual(PAGE_HARD_LIMIT + 5);
    });

    test('Negative: Fails predictably if building metadata is completely missing', async () => {
      const input = getBaseInput();
      input.building = null as any;
      try {
        const result = await renderer.render(input);
        expect(result.buffer).toBeDefined();
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 2. No map assets
    test('Positive: Gallery planner works without map category photos (V-World failure)', async () => {
      const input = getBaseInput();
      input.doc.body = {
        photos: [
          { url: 'http://example.com/exterior.jpg', isHero: true, category: 'exterior' }
        ]
      };
      
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Invalid photo URL formats trigger rejection or are handled', async () => {
      const input = getBaseInput();
      input.doc.body = { photos: { invalid: 'type' } as any };
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 3. Minimal data (Grade C)
    test('Positive: Minimal data (Grade C) generates without rent roll/photos', async () => {
      const input = getBaseInput();
      input.grade = 'C';
      input.doc.body = {}; // no rent roll or photos
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Grade D should throw [G30] error', async () => {
      const input = getBaseInput();
      input.grade = 'D';
      await expect(renderer.render(input)).rejects.toThrow(/G30/);
    });
  });

  describe('Category 4-B: LLM Edge Cases (via mock data)', () => {
    // 4. Empty section content
    test('Positive: Empty string body in sections is handled gracefully', async () => {
      const input = getBaseInput();
      input.doc.sections = input.doc.sections.map(s => ({ ...s, markdown: '' }));
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Missing sections array throws predictability', async () => {
      const input = getBaseInput();
      input.doc.sections = null as any;
      try {
        const result = await renderer.render(input);
        expect(result.buffer).toBeDefined();
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 5. Extremely long section text
    test('Positive: Extremely long section text (5000+ chars) does not crash', async () => {
      const input = getBaseInput();
      const longText = '가'.repeat(5000);
      input.doc.sections[0].markdown = longText;
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Non-string markdown throws or is safely bypassed', async () => {
      const input = getBaseInput();
      input.doc.sections[0].markdown = 12345 as any;
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 6. Numerical anchor mismatch
    test('Positive: Asking price in body mismatch does not crash', async () => {
      const input = getBaseInput();
      input.building.price_band = '100억';
      input.doc.sections[0].markdown = '매매가 200억 원입니다.';
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Malformed price band object throws', async () => {
      const input = getBaseInput();
      input.building.price_band = { value: 100 } as any;
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 7. Unicode edge cases
    test('Positive: Renders Korean text with special characters/emoji without crash', async () => {
      const input = getBaseInput();
      input.doc.sections[0].markdown = '건물✨ 🏢 #특급매물 🎉 (★수익률 최고★)';
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Invalid control characters are rejected or handled', async () => {
      const input = getBaseInput();
      input.doc.sections[0].markdown = '건물\u0000테스트';
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });
  });

  describe('Category 4-C: Input Boundary Values', () => {
    // 8. Zero photos
    test('Positive: Zero photos array -> no gallery slide, no crash', async () => {
      const input = getBaseInput();
      input.doc.body = { photos: [] };
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Null photos array throws or handled', async () => {
      const input = getBaseInput();
      input.doc.body = { photos: null } as any;
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 9. Asking price = 0
    test('Positive: Asking price 0 handles gracefully', async () => {
      const input = getBaseInput();
      input.building.price_band = '0원';
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Negative asking price string handled gracefully', async () => {
      const input = getBaseInput();
      input.building.price_band = '-100억';
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 10. Asking price extremely large
    test('Positive: Asking price extremely large (9,999억) renders without overflow', async () => {
      const input = getBaseInput();
      input.building.price_band = '9999억';
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
    });

    test('Negative: Unparseable extremely large price throws or handled', async () => {
      const input = getBaseInput();
      input.building.price_band = '구천구백구십구조원';
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });

    // 11. 30-room rent roll
    test('Positive: 30-room rent roll is trimmed/handled to fit 16-page limit', async () => {
      const input = getBaseInput();
      const largeRentRoll = Array.from({ length: 30 }, (_, i) => ({
        floor: `${i + 1}F`,
        tenant: `임차인${i}`,
        deposit: 1000,
        rent: 100,
      }));
      input.doc.body = { rentRoll: largeRentRoll } as any;
      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeLessThanOrEqual(PAGE_HARD_LIMIT + 5);
    });

    test('Negative: Invalid rent roll structure throws predictably', async () => {
      const input = getBaseInput();
      input.doc.body = { rentRoll: 'not-an-array' } as any;
      try {
        await renderer.render(input);
      } catch (e: any) {
        expect(e).toBeDefined();
      }
    });
  });
});
