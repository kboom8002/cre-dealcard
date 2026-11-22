import { describe, it, expect } from 'vitest';
import { planGallerySlides, GALLERY_EXCLUDE_CATEGORIES } from '@/domain/building/mobile-im/pptx/gallery-planner';
import type { PhotoMeta } from '@/domain/building/mobile-im/pptx/gallery-planner';

describe('gallery-planner', () => {
  it('filters out GALLERY_EXCLUDE_CATEGORIES', async () => {
    const photos: PhotoMeta[] = [
      { url: '1.jpg', category: 'exterior' },
      { url: '2.jpg', category: 'floor_plan' as any },
      { url: '3.jpg', category: 'map' as any },
    ];
    
    const res = planGallerySlides(photos, 'income');
    expect(res.length).toBe(1);
    expect(res[0].photos.length).toBe(1);
    expect(res[0].photos[0].url).toBe('1.jpg');
  });

  it('tests 6-photo single slide and 10-photo balanced 2-slide limit (max 12) for credeal_basic preset', async () => {
    const photos6: PhotoMeta[] = Array.from({ length: 6 }, (_, i) => ({
      url: `${i}.jpg`,
      category: 'exterior',
    }));
    const res6 = planGallerySlides(photos6, 'income', 'credeal_basic');
    expect(res6.length).toBe(1);
    expect(res6[0].photos.length).toBe(6);

    const photos14: PhotoMeta[] = Array.from({ length: 14 }, (_, i) => ({
      url: `${i}.jpg`,
      category: 'exterior',
    }));
    const res14 = planGallerySlides(photos14, 'income', 'credeal_basic');
    expect(res14.length).toBe(2);
    expect(res14[0].photos.length + res14[1].photos.length).toBe(12);
  });

  it('tests empty input returns empty result', async () => {
    const res = planGallerySlides([], 'income');
    expect(res.length).toBe(0);
  });

  it('tests hero photo deduplication logic implicitly by checking proper groupings', async () => {
    const photos: PhotoMeta[] = [
      { url: 'hero.jpg', category: 'exterior', isHero: true },
      { url: '2.jpg', category: 'interior' },
    ];
    
    const res = planGallerySlides(photos, 'income');
    expect(res.length).toBe(1);
    expect(res[0].photos.length).toBe(2);
  });

  it('preserves all 9-12 photos without silent truncation even when exterior/interior counts are skewed (credeal_basic)', () => {
    // Case 1: 4 exterior + 6 interior = 10 photos -> pure 2-slide separation
    const photos10Balanced: PhotoMeta[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ url: `ext-${i}.jpg`, category: 'exterior' as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ url: `int-${i}.jpg`, category: 'interior' as const })),
    ];
    const resBalanced = planGallerySlides(photos10Balanced, 'owner_occupied', 'credeal_basic');
    expect(resBalanced).toHaveLength(2);
    expect(resBalanced[0].photos).toHaveLength(4);
    expect(resBalanced[1].photos).toHaveLength(6);
    expect(resBalanced[0].title).toBe('외부·전경 사진');
    expect(resBalanced[1].title).toBe('내부·층별 사진');

    // Case 2: 3 exterior + 7 interior = 10 photos -> rebalanced 4 + 6 = 10 (zero dropped!)
    const photos10IntSkewed: PhotoMeta[] = [
      ...Array.from({ length: 3 }, (_, i) => ({ url: `ext-${i}.jpg`, category: 'exterior' as const })),
      ...Array.from({ length: 7 }, (_, i) => ({ url: `int-${i}.jpg`, category: 'interior' as const })),
    ];
    const resIntSkewed = planGallerySlides(photos10IntSkewed, 'owner_occupied', 'credeal_basic');
    expect(resIntSkewed).toHaveLength(2);
    expect(resIntSkewed[0].photos.length + resIntSkewed[1].photos.length).toBe(10);
    expect(resIntSkewed[0].photos.length).toBeLessThanOrEqual(6);
    expect(resIntSkewed[1].photos.length).toBeLessThanOrEqual(6);

    // Case 3: 8 exterior + 3 interior = 11 photos -> rebalanced 6 + 5 = 11 (zero dropped!)
    const photos11ExtSkewed: PhotoMeta[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ url: `ext-${i}.jpg`, category: 'exterior' as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ url: `int-${i}.jpg`, category: 'interior' as const })),
    ];
    const resExtSkewed = planGallerySlides(photos11ExtSkewed, 'owner_occupied', 'credeal_basic');
    expect(resExtSkewed).toHaveLength(2);
    expect(resExtSkewed[0].photos.length + resExtSkewed[1].photos.length).toBe(11);
    expect(resExtSkewed[0].photos.length).toBe(6);
    expect(resExtSkewed[1].photos.length).toBe(5);
  });
});
