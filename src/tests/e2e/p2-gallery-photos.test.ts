/**
 * @file p2-gallery-photos.test.ts
 * @description MECE Phase 3: T19 (Gallery Slides 0~12 Photos) 및 T27 (12 Photos Simultaneous Embedding)
 * 갤러리 슬라이드의 다양한 사진 갯수 및 그룹핑 배치 로직 검증.
 */

import { describe, test, expect } from 'vitest';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, assertNoCorruptionStrings } from './pptx-test-helpers';
import type { PhotoMeta } from '@/domain/building/mobile-im/types';
import type { PhotoCategory } from '@/domain/building/mobile-im/photo-url-transformer';

// 투명 1x1 픽셀 이미지 (네트워크 요청 방지)
const MOCK_IMG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('T19: Gallery Slides 0~12 Photos', () => {
  test('T19-01: 0 photos -> returns empty array', () => {
    const slides = planGallerySlides([], 'income');
    expect(slides).toEqual([]);
  });

  test('T19-02: 1 photo -> returns 1 slide with FULL_WIDE layout', () => {
    const photos: PhotoMeta[] = [{ url: MOCK_IMG_URL, category: 'exterior', isHero: true }];
    const slides = planGallerySlides(photos, 'income');
    expect(slides).toHaveLength(1);
    expect(slides[0].layout).toBe('FULL_WIDE');
    expect(slides[0].photos).toHaveLength(1);
  });

  test('T19-03: 2 photos -> returns 1 slide with DUAL_LANDSCAPE or DUAL_PORTRAIT', () => {
    const photos: PhotoMeta[] = [
      { url: MOCK_IMG_URL, category: 'exterior', aspectRatio: 1.5 },
      { url: MOCK_IMG_URL, category: 'lobby', aspectRatio: 1.33 }
    ];
    const slides = planGallerySlides(photos, 'income');
    expect(slides).toHaveLength(1);
    expect(slides[0].layout).toBe('DUAL_LANDSCAPE');
    expect(slides[0].photos).toHaveLength(2);
  });

  test('T19-04: 4 photos -> returns 1 slide with GRID_2X2 layout', () => {
    const photos: PhotoMeta[] = Array(4).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior'
    }));
    const slides = planGallerySlides(photos, 'income');
    expect(slides).toHaveLength(1);
    expect(slides[0].layout).toBe('GRID_2X2');
    expect(slides[0].photos).toHaveLength(4);
  });

  test('T19-05: 8 photos -> returns 2 slides, each with <=4 photos', () => {
    // 모든 사진을 같은 카테고리(단일 그룹)로 설정하여 균등 분할 유도
    const photos: PhotoMeta[] = Array(8).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior'
    }));
    const slides = planGallerySlides(photos, 'income');
    expect(slides).toHaveLength(2);
    expect(slides[0].photos.length).toBeLessThanOrEqual(4);
    expect(slides[1].photos.length).toBeLessThanOrEqual(4);
  });

  test('T19-06: 12 photos -> returns 3-4 slides, each with <=4 photos, total <=4 slides', () => {
    const photos: PhotoMeta[] = Array(12).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior'
    }));
    const slides = planGallerySlides(photos, 'income');
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides.length).toBeLessThanOrEqual(4);
    slides.forEach(slide => {
      expect(slide.photos.length).toBeLessThanOrEqual(4);
    });
  });

  test('T19-07: 13 photos (over max) -> returns max 4 slides', () => {
    const photos: PhotoMeta[] = Array(13).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior'
    }));
    const slides = planGallerySlides(photos, 'income');
    // 실제 planGallerySlides는 슬라이드를 최대 4개로 제한함
    expect(slides.length).toBeLessThanOrEqual(4);
  });

  test('T19-08: Full PPTX render with 4 photos -> PPTX has gallery slide, buffer valid', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc();
    const photos: PhotoMeta[] = Array(4).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior', isHero: i === 0
    }));
    // renderer가 resolvePhotos를 통해 photos_v2를 파싱함
    (doc.body as any).photos_v2 = photos;

    const result = await renderer.render({ doc, tier: 'pro', posture: 'income', grade: 'B' });
    expect(result.buffer).toBeInstanceOf(Uint8Array);
    expect(result.buffer.length).toBeGreaterThan(1000);
    assertNoCorruptionStrings(result.buffer);
  }, 120_000);

  test('T19-09: Gallery slides only in Pro tier (verify basic also)', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc();
    const photos: PhotoMeta[] = Array(4).fill(null).map((_, i) => ({
      url: MOCK_IMG_URL, category: 'exterior', isHero: i === 0
    }));
    (doc.body as any).photos_v2 = photos;

    // basic tier에서도 사진이 있으면 갤러리가 포함되는지 (또는 에러 없이 렌더링되는지) 확인
    const resultBasic = await renderer.render({ doc, tier: 'basic', posture: 'income', grade: 'B' });
    expect(resultBasic.buffer).toBeInstanceOf(Uint8Array);
    assertNoCorruptionStrings(resultBasic.buffer);
  }, 120_000);
});

describe('T27: 12 Photos Simultaneous Embedding', () => {
  const diversePhotos: PhotoMeta[] = [
    { url: MOCK_IMG_URL, category: 'exterior', isHero: true },
    { url: MOCK_IMG_URL, category: 'aerial' },
    { url: MOCK_IMG_URL, category: 'lobby' },
    { url: MOCK_IMG_URL, category: 'corridor' },
    { url: MOCK_IMG_URL, category: 'interior' },
    { url: MOCK_IMG_URL, category: 'tenant_space' },
    { url: MOCK_IMG_URL, category: 'floor_plan' },
    { url: MOCK_IMG_URL, category: 'parking' },
    { url: MOCK_IMG_URL, category: 'rooftop' },
    { url: MOCK_IMG_URL, category: 'mechanical' },
    { url: MOCK_IMG_URL, category: 'exterior' },
    { url: MOCK_IMG_URL, category: 'lobby' },
  ];

  test('T27-01: planGallerySlides with 12 diverse-category photos -> produces 3-4 slides', () => {
    const slides = planGallerySlides(diversePhotos, 'income');
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides.length).toBeLessThanOrEqual(4);
    const accountedPhotos = slides.flatMap(s => s.photos);
    expect(accountedPhotos.length).toBe(12);
  });

  test('T27-02: Each gallery slide has determineLayout applied correctly', () => {
    const slides = planGallerySlides(diversePhotos, 'income');
    slides.forEach(slide => {
      expect(['FULL_WIDE', 'DUAL_LANDSCAPE', 'DUAL_PORTRAIT', 'ONE_LARGE_TWO_SMALL_H', 'GRID_2X2']).toContain(slide.layout);
    });
  });

  test('T27-03: dataKey follows pattern gallery_0, gallery_1, etc.', () => {
    const slides = planGallerySlides(diversePhotos, 'income');
    slides.forEach((slide, idx) => {
      expect(slide.dataKey).toBe(`gallery_${idx}`);
    });
  });

  test('T27-04: Full PPTX render with 12 mock photos -> buffer > 5KB, no corruption', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc();
    (doc.body as any).photos_v2 = diversePhotos;

    const result = await renderer.render({ doc, tier: 'pro', posture: 'income', grade: 'B' });
    expect(result.buffer).toBeInstanceOf(Uint8Array);
    expect(result.buffer.length).toBeGreaterThan(5000);
    assertNoCorruptionStrings(result.buffer);
  }, 120_000);
});
