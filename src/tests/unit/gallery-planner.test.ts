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
});
