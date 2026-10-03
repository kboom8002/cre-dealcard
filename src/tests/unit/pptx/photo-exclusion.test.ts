/**
 * 중개인 사진 태깅 — 'IM 제외'(excluded) / 유형(category) 반영 검증
 */
import { describe, it, expect } from 'vitest';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';

const ext = { url: 'https://x/ext.jpg', category: 'exterior', role: 'cover', isHero: true };
const doc1 = { url: 'https://x/rentroll.png', caption: '렌트롤 표 (서류)', excluded: true };
const doc2 = { url: 'https://x/floors.png', caption: '층별 현황표', excluded: true };
const lobby = { url: 'https://x/lobby.jpg', category: 'lobby' };

describe('resolvePhotos — excluded 자산 제거', () => {
  it('photos_v2의 excluded 항목은 결과에 포함되지 않는다', () => {
    const out = resolvePhotos({ photos_v2: [ext, doc1, lobby, doc2] } as any);
    expect(out.map(p => p.url)).toEqual([ext.url, lobby.url]);
  });

  it('photos 배열 경로에서도 동일하게 제거', () => {
    const out = resolvePhotos({ photos: [doc1, ext] } as any);
    expect(out.map(p => p.url)).toEqual([ext.url]);
    // 제외 자산이 첫 번째였어도 대표 사진은 실사진
    expect(out[0].isHero).toBe(true);
  });

  it('중개인 지정 category가 보존된다', () => {
    const out = resolvePhotos({ photos_v2: [ext, lobby] } as any);
    expect(out.find(p => p.url === lobby.url)?.category).toBe('lobby');
  });
});

describe('planGallerySlides — Basic 갤러리에 서류/제외 자산 미노출', () => {
  it('excluded 서류는 갤러리에 들어가지 않는다', () => {
    const photos = resolvePhotos({ photos_v2: [ext, doc1, doc2] } as any);
    const specs = planGallerySlides(photos, 'income', 'credeal_basic');
    const urls = specs.flatMap(s => s.photos.map(p => p.url));
    expect(urls).toEqual([ext.url]);
  });

  it('floor_plan 등 비사진 카테고리는 갤러리 제외', () => {
    const photos = resolvePhotos({ photos_v2: [ext, { url: 'https://x/plan.png', category: 'floor_plan' }] } as any);
    const specs = planGallerySlides(photos, 'income', 'credeal_basic');
    expect(specs.flatMap(s => s.photos.map(p => p.url))).toEqual([ext.url]);
  });
});
