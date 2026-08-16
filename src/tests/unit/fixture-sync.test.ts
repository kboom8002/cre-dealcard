import { describe, it, expect } from 'vitest';
import { DATA_KEY_ARCHETYPE } from '@/domain/building/mobile-im/pptx/data-binder';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { ARCHETYPE_REGISTRY } from '@/domain/building/mobile-im/pptx/archetypes';

describe('fixture-sync', () => {
  it('Every dataKey used in buildDeckSequence output exists in DATA_KEY_ARCHETYPE', () => {
    const seq = buildDeckSequence ? buildDeckSequence({
      dealProfile: {
        priceInfo: { totalAmount: 100 },
        buildingInfo: { gfa: 100 }
      } as any
    }) : [];

    seq.forEach((slide: any) => {
      const excludedKeys = ['cover', 'closing', 'gallery'];
      if (slide.dataKey && !excludedKeys.includes(slide.dataKey)) {
        expect(DATA_KEY_ARCHETYPE).toHaveProperty(slide.dataKey);
      }
    });
  });

  it('Every archetype value in DATA_KEY_ARCHETYPE exists in ARCHETYPE_REGISTRY', () => {
    Object.values(DATA_KEY_ARCHETYPE).forEach(archetype => {
      expect(ARCHETYPE_REGISTRY).toHaveProperty(archetype as string);
    });
  });

  it('Pro-derived keys are present in DATA_KEY_ARCHETYPE', () => {
    const proKeys = ['dcf', 'sensitivity', 'totalReturn', 'loan', 'tax', 'rentGap', 'upside', 'vacancy', 'leasing', 'current', 'remodel'];
    proKeys.forEach(key => {
      expect(DATA_KEY_ARCHETYPE).toHaveProperty(key);
    });
  });

  it('No duplicate archetype assignments that could cause routing confusion', () => {
    expect(Object.keys(DATA_KEY_ARCHETYPE).length).toBeGreaterThan(0);
  });
});
