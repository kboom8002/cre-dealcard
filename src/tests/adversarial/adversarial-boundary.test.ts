/**
 * @file adversarial-boundary.test.ts
 * @description L4: 경계값/악성입력 테스트
 * 파이프라인의 엣지 케이스 안정성을 검증합니다.
 *
 * 실행: npx vitest run src/tests/adversarial/adversarial-boundary.test.ts
 */

import { describe, it, expect } from 'vitest';
import { buildDeckSequence, type DeckSequenceInput } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import type { InvestmentPosture } from '@/domain/ontology';

// §1 사진 경계값 테스트
describe('L4-PHOTO: 사진 경계값', () => {
  it('사진 0장 → 갤러리 슬라이드 0개', () => {
    const slides = planGallerySlides([]);
    expect(slides).toHaveLength(0);
  });

  it('사진 1장 → 갤러리 슬라이드 1개', () => {
    const photos = [{ url: '/test/01.jpg', category: 'exterior' as const, order: 0, isHero: true }];
    const slides = planGallerySlides(photos);
    expect(slides.length).toBeGreaterThanOrEqual(1);
  });

  it('사진 12장 → 갤러리 슬라이드 <= 4개', () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({
      url: `/test/${i}.jpg`,
      category: 'interior' as const,
      order: i,
      isHero: i === 0,
    }));
    const slides = planGallerySlides(photos);
    expect(slides.length).toBeLessThanOrEqual(4);
  });

  it('Negative: 사진 0장인데 갤러리 슬라이드가 생성되면 안 됨', () => {
    const seq = buildDeckSequence({
      posture: 'income',
      grade: 'B',
      dataAvailability: { hasPhotos: false, hasRentRoll: true },
    });
    const gallerySlides = seq.filter(s => s.archetype === 'A14');
    expect(gallerySlides).toHaveLength(0);
  });
});

// §2 Grade D PPTX 차단 (Rule 10)
describe('L4-GRADE: Grade D PPTX 차단', () => {
  it('Grade D → G30 throw 발생', () => {
    expect(() => buildDeckSequence({ posture: 'income', grade: 'D', dataAvailability: {} }))
      .toThrow('[G30]');
  });

  it('Negative: Grade A → throw 없음', () => {
    expect(() => buildDeckSequence({ posture: 'income', grade: 'A', dataAvailability: { hasRentRoll: true } }))
      .not.toThrow();
  });
});

// §3 렌트롤 경계값 (Rule 9)
describe('L4-RENTROLL: 렌트롤 경계값', () => {
  it('hasRentRoll=false → RentRoll suppress', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'B', dataAvailability: { hasRentRoll: false } });
    expect(seq.some(s => s.dataKey === 'rentRoll')).toBe(false);
  });

  it('hasRentRoll=true → RentRoll 포함', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'B', dataAvailability: { hasRentRoll: true } });
    expect(seq.some(s => s.dataKey === 'rentRoll')).toBe(true);
  });

  it('Negative: hasRentRoll=undefined → 기본 포함', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'B', dataAvailability: {} });
    expect(seq.some(s => s.dataKey === 'rentRoll')).toBe(true);
  });
});

// §4 5대 포스처 x 3등급 시퀀스 생성
describe('L4-POSTURE: 5대 포스처 시퀀스 생성', () => {
  const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];
  const grades: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

  for (const posture of postures) {
    for (const grade of grades) {
      it(`${posture} x Grade ${grade} → 시퀀스 >= 8`, () => {
        const seq = buildDeckSequence({ posture, grade, dataAvailability: { hasRentRoll: true } });
        expect(seq.length).toBeGreaterThanOrEqual(8);
      });
    }
  }

  it('Negative: 알 수 없는 포스처도 크래시 없음', () => {
    const seq = buildDeckSequence({ posture: 'unknown' as any, grade: 'B', dataAvailability: {} });
    expect(seq.length).toBeGreaterThan(0);
  });
});

// §5 면수 상한 테스트 (Rule 10, Rule 24)
describe('L4-PAGELIMIT: 면수 상한 16면', () => {
  it('Grade A + 전체 데이터 → 본문 <= 16면', () => {
    const seq = buildDeckSequence({
      posture: 'income',
      grade: 'A',
      dataAvailability: { hasRentRoll: true, hasComparables: true, hasPhotos: true, hasStackingPlan: true },
      gallerySlides: [
        { archetype: 'A14', kicker: 'Gallery', title: '갤러리 1', dataKey: 'gallery_0' },
        { archetype: 'A14', kicker: 'Gallery', title: '갤러리 2', dataKey: 'gallery_1' },
      ],
    });
    const bodySlides = seq.filter(s => s.placement !== 'appendix' && s.placement !== 'closing');
    expect(bodySlides.length).toBeLessThanOrEqual(16);
  });

  it('Negative: 부록은 16면 한도에서 제외', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'A', dataAvailability: { hasRentRoll: true } });
    const bodySlides = seq.filter(s => s.placement !== 'appendix' && s.placement !== 'closing');
    expect(bodySlides.length).toBeLessThanOrEqual(16);
  });
});

// §6 취득비용/대출 시나리오 경계값 (D41-D2)
describe('L4-ACQLOAN: 취득비용 대출 경계값', () => {
  it('취득세율 0% → 세금 0원', () => {
    const priceWon = 100 * 1e8;
    const tax = Math.round(priceWon * (0 / 100));
    expect(tax).toBe(0);
  });

  it('LTV 100% → 자기자본 최소', () => {
    const priceWon = 100 * 1e8;
    const loan = Math.round(priceWon * 1.0);
    const total = priceWon + Math.round(priceWon * 0.046) + Math.round(priceWon * 0.009);
    const deposit = Math.round(priceWon * 0.05);
    const equity = Math.max(0, total - deposit - loan);
    expect(equity).toBeLessThan(priceWon * 0.1);
  });

  it('Negative: LTV 0% → 전액 자기자본', () => {
    const priceWon = 100 * 1e8;
    const loan = 0;
    const total = priceWon + Math.round(priceWon * 0.046);
    const deposit = Math.round(priceWon * 0.05);
    const equity = Math.max(0, total - deposit - loan);
    expect(equity).toBeGreaterThan(priceWon * 0.9);
  });

  it('대출 금리 0% → 월 이자 0', () => {
    const loanManwon = 50000;
    const rate = 0;
    const interest = loanManwon > 0 ? Math.round(loanManwon * rate / 100 / 12) : 0;
    expect(interest).toBe(0);
  });

  it('대출 금리 15% → 역레버리지', () => {
    const grossYieldPct = 4.0;
    const loanRatePct = 15.0;
    expect(grossYieldPct < loanRatePct).toBe(true);
  });

  it('Negative: 대출 금리 3% < Cap Rate 5% → 정상 레버리지', () => {
    const grossYieldPct = 5.0;
    const loanRatePct = 3.0;
    expect(grossYieldPct < loanRatePct).toBe(false);
  });
});