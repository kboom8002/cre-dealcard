import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { InvestmentPosture } from '@/domain/ontology';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts } from './pptx-test-helpers';

describe('T13/T14: Basic vs Pro + Grade Gate', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  describe('T13: Basic vs Pro Slide Count & Composition', () => {
    const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];

    postures.forEach(posture => {
      test(`T13-01 & T13-04: Compare Basic vs Pro slide counts for ${posture}`, async () => {
        const inputBasic: MobileImPptxInput = {
          buildingId: `t13-basic-${posture}`,
          tier: 'basic',
          posture,
          grade: 'A',
          doc: buildMinimalDoc(posture) as any,
          building: BUILDING_META[posture],
        };

        const inputPro: MobileImPptxInput = {
          ...inputBasic,
          buildingId: `t13-pro-${posture}`,
          tier: 'pro',
        };

        const resBasic = await renderer.render(inputBasic);
        const resPro = await renderer.render(inputPro);

        // T13-01: Basic count bounds
        expect(resBasic.slideCount).toBeGreaterThanOrEqual(7);
        expect(resBasic.slideCount).toBeLessThanOrEqual(13);
        
        // T13-01: Pro should have more slides than Basic (at least 1 more)
        // Some postures (owner_occupied, trading) have fewer Pro body sections
        expect(resPro.slideCount).toBeGreaterThanOrEqual(resBasic.slideCount + 1);

        // T13-04: Basic deck should have fewer or equal slides than Pro
        expect(resBasic.slideCount).toBeLessThanOrEqual(resPro.slideCount);
      });
    });

    test('T13-02: Pro-exclusive slides should NOT appear in Basic deck', async () => {
      const input: MobileImPptxInput = {
        buildingId: `t13-02-basic`,
        tier: 'basic',
        posture: 'income',
        grade: 'A',
        doc: buildMinimalDoc('income') as any,
        building: BUILDING_META['income'],
      };

      const res = await renderer.render(input);
      const textMap = await extractSlideTexts(res.buffer);
      const allText = Array.from(textMap.values()).flat().join(' ');

      expect(allText).not.toContain('DCF 분석');
      expect(allText).not.toContain('민감도 분석');
      expect(allText).not.toContain('총수익률');
      expect(allText).not.toContain('대출시나리오');
      expect(allText).not.toContain('세금시나리오');
    });

    test('T13-03: Pro deck should contain keywords related to DCF, Tax in Grade A', async () => {
      const input: MobileImPptxInput = {
        buildingId: `t13-03-pro`,
        tier: 'pro',
        posture: 'income',
        grade: 'A',
        doc: buildMinimalDoc('income') as any,
        building: BUILDING_META['income'],
      };

      const res = await renderer.render(input);
      const textMap = await extractSlideTexts(res.buffer);
      const allText = Array.from(textMap.values()).flat().join(' ');

      expect(allText).toContain('DCF');
      expect(allText).toContain('세금');
    });
  });

  describe('T14: Grade D/C/B/A Gate Logic', () => {
    test('T14-01: Grade D + Pro tier → throws error (deck-sequencer returns empty)', async () => {
      // Unit test
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'D',
      });
      expect(seq.length).toBe(0);

      // Render test
      const input: MobileImPptxInput = {
        buildingId: `t14-01`,
        tier: 'pro',
        posture: 'income',
        grade: 'D',
        doc: buildMinimalDoc('income') as any,
        building: BUILDING_META['income'],
      };
      
      await expect(renderer.render(input)).rejects.toThrow();
    });

    test('T14-02: Grade D + Basic tier → minimal deck (3-5 slides: cover, summary, closing)', async () => {
      const input: MobileImPptxInput = {
        buildingId: `t14-02`,
        tier: 'basic',
        posture: 'income',
        grade: 'D',
        doc: buildMinimalDoc('income') as any,
        building: BUILDING_META['income'],
      };
      const res = await renderer.render(input);
      
      expect(res.slideCount).toBeGreaterThanOrEqual(3);
      expect(res.slideCount).toBeLessThanOrEqual(5);
    });

    test('T14-03: Grade C + Pro → DCF and TotalReturn suppressed', async () => {
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'C',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('dcf');
      expect(keys).not.toContain('sensitivity');
      expect(keys).not.toContain('totalReturn');

      const input: MobileImPptxInput = {
        buildingId: `t14-03`,
        tier: 'pro',
        posture: 'income',
        grade: 'C',
        doc: buildMinimalDoc('income') as any,
        building: BUILDING_META['income'],
      };
      const res = await renderer.render(input);
      const textMap = await extractSlideTexts(res.buffer);
      const allText = Array.from(textMap.values()).flat().join(' ');
      
      expect(allText).not.toContain('DCF 분석');
      expect(allText).not.toContain('총수익률');
    });

    test('T14-04: Grade B + Pro → DCF suppressed, but TotalReturn NOT suppressed', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'B',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('dcf');
      expect(keys).not.toContain('sensitivity');
      expect(keys).toContain('totalReturn');
    });

    test('T14-05: Grade A + Pro → all financial slides present', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'A',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('dcf');
      expect(keys).toContain('sensitivity');
      expect(keys).toContain('totalReturn');
      expect(keys).toContain('tax');
    });

    test('T14-06: hasViolation=true → Loan slide suppressed in Pro deck', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'A',
        hasViolation: true,
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('loan');
    });

    test('T14-07: hasViolation=false → Loan slide present in Pro deck', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        tier: 'pro',
        grade: 'A',
        hasViolation: false,
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('loan');
    });
  });
});
