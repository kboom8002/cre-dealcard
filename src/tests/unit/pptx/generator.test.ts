import { describe, it, expect } from 'vitest';
import { buildEffectiveBaseline } from '@/domain/building/common-pipeline/baseline-builder';
import { CorePackageAssembler } from '@/domain/building/common-pipeline/core-assembler';
import { generateStructuredPPTXDeck } from '@/domain/building/pptx-publication/generator';

describe('Structured PPTX Deck Generator (CIM-0601 / PR-M6-01)', () => {
  it('should generate structured slides obeying 16-page body limit and non-duplication split layout', async () => {
    const baseline = buildEffectiveBaseline({
      dealId: 'deal-pptx-001',
      physical: { landAreaSqm: 400, grossFloorAreaSqm: 1600 },
      commercial: { askingPriceKrw: 14000000000, monthlyRentKrw: 35000000 },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-pptx-001');

    const deck = generateStructuredPPTXDeck(corePackage);

    expect(deck.bodySlideCount).toBeLessThanOrEqual(16);
    expect(deck.deckHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Verify A04 non-duplication: left narrative vs right cards
    const a04 = deck.slides.find((s) => s.archetype === 'A04');
    expect(a04).toBeDefined();
    expect(a04?.leftContent?.leadText).toContain('가치 제안');
    expect(a04?.rightContent?.cards.length).toBeGreaterThanOrEqual(3);

    // Verify Korean CRE Lexicon standard: "사옥 단독 명칭 표기(간판 설치권)", "기업 단독 브랜딩"
    const brandingCard = a04?.rightContent?.cards.find((c) => c.label === '사옥 활용도');
    expect(brandingCard?.value).toBe('기업 단독 브랜딩');
    expect(brandingCard?.detail).toContain('사옥 단독 명칭 표기(간판 설치권)');
  });
});
