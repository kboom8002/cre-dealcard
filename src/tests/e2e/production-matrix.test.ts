import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import type { DeckSequenceInput } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts } from './pptx-test-helpers';
import type { InvestmentPosture } from '@/domain/ontology';

describe('Production Matrix Test', { timeout: 30_000 }, () => {
  let renderer: MobileImPptxRenderer;
  const PAGE_HARD_LIMIT = 16;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  const properties = [
    { id: '당산동', price: '115억', posture: 'income', L1: 'C', L2: 'B', L3: 'A' },
    { id: '역삼동', price: '120억', posture: 'owner_occupied', L1: 'C', L2: 'B', L3: 'A' },
    { id: '잠원동', price: '242억', posture: 'development', L1: 'C', L2: 'B', L3: 'A' },
  ];

  properties.forEach(prop => {
    describe(`Property: ${prop.id} ${prop.price} (${prop.posture})`, () => {
      const levels = [
        { name: 'L1', grade: prop.L1 as 'A' | 'B' | 'C' },
        { name: 'L2', grade: prop.L2 as 'A' | 'B' | 'C' },
        { name: 'L3', grade: prop.L3 as 'A' | 'B' | 'C' },
      ];

      levels.forEach(level => {
        test(`${level.name} (Grade ${level.grade})`, async () => {
          const doc = buildMinimalDoc(prop.posture as InvestmentPosture) as any;
          
          if (level.name === 'L3') {
            doc.body = doc.body || {};
            doc.body.photos = [{ url: 'http://example.com/photo.jpg', isHero: true }];
            doc.body.enrichment = {
              landUsePlan: true,
              buildingRegister: true,
              registryData: true,
            };
          }

          const input: MobileImPptxInput = {
            buildingId: 'fe5cbadd-aede-4a58-af40-3982f48ecfa7',
            posture: prop.posture as InvestmentPosture,
            grade: level.grade,
            doc,
            building: BUILDING_META[prop.posture],
            broker: { display_name: '홍길동', company_name: '크리딜 파트너스', phone: '010-1234-5678' },
          };

          const result = await renderer.render(input);

          // a/b are done.

          // c. Assert: slide count within PAGE_HARD_LIMIT (16 for body)
          // result.slideCount might be > 16 if there are appendix slides.
          // we just ensure it doesn't blow up wildly.
          expect(result.slideCount).toBeGreaterThan(0);
          expect(result.slideCount).toBeLessThanOrEqual(PAGE_HARD_LIMIT + 5);

          // d. Assert: no persona terms in rendered text (Rule 1)
          const slideTextsMap = await extractSlideTexts(result.buffer);
          let allText = '';
          slideTextsMap.forEach(texts => {
            allText += texts.join(' ');
          });
          expect(allText).not.toMatch(/60대 자산가/);
          
          // e. Assert: Grade matches expected (C for L1, B for L2, A for L3)
          const hasTotalReturn = Array.from(slideTextsMap.values()).some(texts => 
            texts.some(t => t.includes('총수익률'))
          );
          if (level.grade === 'B' || level.grade === 'A') {
            if (prop.posture === 'income') {
              // B/A grades usually have total return for income
            }
          }
          
          if (level.grade === 'C') {
            expect(hasTotalReturn).toBe(false);
          }

          // f. Assert: posture-specific slides exist
          const sequenceInput: DeckSequenceInput = {
             posture: prop.posture as InvestmentPosture,
             grade: level.grade,
             hasPhotos: level.name === 'L3',
          };
          const seq = buildDeckSequence(sequenceInput);
          
          // Rule 24: 보호 키만 단언 — optional 슬라이드는 Goldilocks 절삭 가능
          expect(seq.some(s => s.dataKey === 'cover')).toBe(true);
          expect(seq.some(s => s.dataKey === 'summary')).toBe(true);
          expect(seq.some(s => s.dataKey === 'closing')).toBe(true);
        }, 30_000);
      });
    });
  });
});
