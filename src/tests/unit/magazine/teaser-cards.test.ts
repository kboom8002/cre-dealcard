/**
 * M2-22 teaser cards: 빈 데이터·null 안전·이스케이프·가짜 STABLE_INCOME 제거 / export 시그니처 불변
 */
import { describe, it, expect } from 'vitest';
import { generateMagazineTeaserCards, type MagazineTeaserCard } from '@/domain/magazine/magazine-teaser-cards';

describe('generateMagazineTeaserCards', () => {
  it('빈 attrs / null attrs / 빈 목록은 throw 없이 카드 0개 (가짜 기본 카드 금지)', () => {
    expect(generateMagazineTeaserCards([])).toEqual([]);
    expect(generateMagazineTeaserCards([{ id: 'a', attrs: {} }])).toEqual([]);
    expect(generateMagazineTeaserCards([{ id: 'b', attrs: null as unknown as Record<string, unknown> }])).toEqual([]);
    expect(generateMagazineTeaserCards(undefined as unknown as [])).toEqual([]);
    expect(generateMagazineTeaserCards([{ id: 'c', attrs: { vacancyPct: null, memo: '무관' } }])).toEqual([]);
  });

  it('공실률 근거가 없으면 STABLE_INCOME / "공실률 5% 이하" 0.85 분류를 노출하지 않는다', () => {
    const cards = generateMagazineTeaserCards([
      { id: 'd1', attrs: { askingPriceKrw: 5_000_000_000, assetType: '근린생활시설', regionLabel: '성수' } },
    ]);
    expect(cards).toHaveLength(1);
    const tv = cards[0].teaserView;
    expect(tv.archetype).toBe('');
    expect(tv.archetypeResult).toBeUndefined();
    expect(JSON.stringify(tv)).not.toContain('공실률 5% 이하');
  });

  it('공실률 데이터가 실제로 있으면 분류를 유지한다 (양성 대조)', () => {
    const cards = generateMagazineTeaserCards([
      { id: 'd2', attrs: { askingPriceKrw: 5_000_000_000, assetType: '근린생활시설', regionLabel: '성수', vacancyPct: 2 } },
    ]);
    expect(cards[0].teaserView.archetypeResult?.primaryArchetype).toBe('STABLE_INCOME');
    expect(cards[0].teaserView.archetype).toBe('STABLE_INCOME');
  });

  it('명시적 archetype 은 그대로 유지', () => {
    const cards = generateMagazineTeaserCards([
      { id: 'd3', attrs: { archetype: 'VALUE_ADD', askingPriceKrw: 3_000_000_000, assetType: '빌딩', regionLabel: '강남' } },
    ]);
    expect(cards[0].teaserView.archetype).toBe('VALUE_ADD');
  });

  it('cardHtml 의 모든 텍스트는 HTML 이스케이프된다', () => {
    const cards = generateMagazineTeaserCards([
      {
        id: 'x1',
        attrs: {
          assetType: '<script>alert(1)</script>',
          regionLabel: '"><img src=x onerror=alert(2)>',
          askingPriceKrw: 1_000_000_000,
          roadContactType: '<b>코너</b>',
        },
      },
    ]);
    const html = cards[0].cardHtml;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('maxCards 와 position/dealId 규약 유지, 근거 없는 딜은 건너뛰고 position 은 연속', () => {
    const deals = [
      { id: 'n0', attrs: {} },
      { id: 'n1', attrs: { askingPriceKrw: 1e9, assetType: '빌딩' } },
      { id: 'n2', attrs: { askingPriceKrw: 2e9, assetType: '빌딩' } },
      { id: 'n3', attrs: { askingPriceKrw: 3e9, assetType: '빌딩' } },
    ];
    const cards: MagazineTeaserCard[] = generateMagazineTeaserCards(deals, 2);
    expect(cards.map((c) => [c.dealId, c.position])).toEqual([['n1', 1], ['n2', 2]]);
  });
});
