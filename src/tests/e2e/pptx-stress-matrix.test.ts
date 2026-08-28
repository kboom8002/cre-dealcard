import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { InvestmentPosture } from '@/domain/ontology';
import type { Grade } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts, assertNoCorruptionStrings } from './pptx-test-helpers';

describe('Axis 1: PPTX 40-Cell Posture × Grade × Tier Stress Matrix', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];
  const grades: Grade[] = ['A', 'B', 'C', 'D'];
  const tiers: ('basic' | 'pro')[] = ['basic', 'pro'];

  postures.forEach(posture => {
    describe(`Posture: ${posture}`, () => {
      grades.forEach(grade => {
        tiers.forEach(tier => {
          const testName = `[${posture}] Grade ${grade} × ${tier} tier`;

          test(testName, async () => {
            const input: MobileImPptxInput = {
              buildingId: `stress-${posture}-${grade}-${tier}`,
              posture,
              grade,
              doc: buildMinimalDoc(posture) as any,
              building: BUILDING_META[posture],
              broker: { display_name: '홍길동', company_name: '크리딜 파트너스', phone: '010-1234-5678' },
            };

            // Grade D × Pro must be rejected (cannot generate Pro deck for D grade)
            if (grade === 'D' && tier === 'pro') {
              await expect(renderer.render(input)).rejects.toThrow();
              return;
            }

            const result = await renderer.render(input);

            // 1. Buffer validity
            expect(result.buffer).toBeDefined();
            expect(result.buffer.length).toBeGreaterThan(5_000);

            // 2. Slide count bounds
            if (grade === 'D' && tier === 'basic') {
              // Minimal D-grade basic deck (cover + summary + closing)
              expect(result.slideCount).toBeGreaterThanOrEqual(3);
              expect(result.slideCount).toBeLessThanOrEqual(5);
            } else if (tier === 'basic') {
              // Standard Basic deck: cover + summary + location + 3 posture body + risk + thesis + process + closing = ~10
              expect(result.slideCount).toBeGreaterThanOrEqual(7);
              expect(result.slideCount).toBeLessThanOrEqual(13);
            } else if (tier === 'pro') {
              // Pro deck
              expect(result.slideCount).toBeGreaterThanOrEqual(8);
              expect(result.slideCount).toBeLessThanOrEqual(24);

              // Slide suppressions by grade
              if (grade === 'C') {
                // DCF, Sensitivity, TotalReturn suppressed
                expect(result.slideCount).toBeLessThanOrEqual(18);
              }
            }

            // 3. XML corruption check (no NaN, undefined, null, [object Object])
            await assertNoCorruptionStrings(result.buffer);

            // 4. Slide content verification: every non-cover, non-closing slide must have text
            const slideTextsMap = await extractSlideTexts(result.buffer);
            const slideNumbers = Array.from(slideTextsMap.keys());
            const maxSlide = Math.max(...slideNumbers);

            for (let i = 2; i < maxSlide; i++) {
              const texts = slideTextsMap.get(i) || [];
              expect(
                texts.length,
                `[${posture}/${grade}/${tier}] Slide ${i} is empty (no text extracted)`
              ).toBeGreaterThan(0);
            }
          });
        });
      });
    });
  });
});
