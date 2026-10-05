/**
 * D11a — 갤러리 칩/캡션 중복 제거
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeCaptionForCompare,
  isCaptionRedundantWithLabel,
  hasRealCaption,
} from '@/domain/building/mobile-im/pptx/archetypes/a14-gallery';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';

describe('a14 caption ↔ chip redundancy', () => {
  it('normalizes digits / spaces / parentheses / punctuation', () => {
    expect(normalizeCaptionForCompare('주변 도로/환경 2')).toBe('주변도로환경');
    expect(normalizeCaptionForCompare('건물 외관 (1)')).toBe('건물외관');
  });

  it('identical, contained, containing → redundant', () => {
    expect(isCaptionRedundantWithLabel('건물 외관', '건물 외관')).toBe(true);
    expect(isCaptionRedundantWithLabel('건물 외관 1', '건물 외관')).toBe(true); // 숫자 접미
    expect(isCaptionRedundantWithLabel('외관', '건물 외관')).toBe(true);        // 캡션 ⊂ 라벨
    expect(isCaptionRedundantWithLabel('건물 외관(정면)', '건물 외관')).toBe(true); // 라벨 ⊂ 캡션
  });

  it('informative captions are kept', () => {
    expect(isCaptionRedundantWithLabel('건물 정면 (B1~5F, 벽돌 구조)', '건물 외관')).toBe(false);
    expect(hasRealCaption('자주식 주차장 (8대)', '주차장')).toBe(false); // '주차장' ⊂ 캡션 → 칩과 중복 취급
    expect(hasRealCaption('옥상 테라스 조경 (야간 조명)', '건물 외관')).toBe(true);
  });

  it('empty caption / no label', () => {
    expect(hasRealCaption('', '건물 외관')).toBe(false);
    expect(hasRealCaption('   ', '건물 외관')).toBe(false);
    expect(hasRealCaption(undefined, undefined)).toBe(false);
    expect(hasRealCaption('현장 전경', undefined)).toBe(true);
    expect(isCaptionRedundantWithLabel('123', '건물 외관')).toBe(false);
  });
});

describe('resolvePhotos — 라벨→캡션 자동 복사 제거', () => {
  it('빈 캡션은 빈 채로 유지된다', () => {
    const out = resolvePhotos({
      photos_v2: [
        { url: 'https://x/a.jpg', category: 'exterior' },
        { url: 'https://x/b.jpg', category: 'lobby', caption: '' },
        { url: 'https://x/c.jpg', category: 'parking', caption: '지하 2층 자주식' },
      ],
    } as any);
    expect(out[0].caption || '').toBe('');
    expect(out[1].caption || '').toBe('');
    expect(out[2].caption).toBe('지하 2층 자주식');
  });

  it('v1 photo_urls 폴백도 라벨을 캡션으로 복사하지 않는다', () => {
    const out = resolvePhotos({ photo_urls: ['https://x/exterior.jpg', 'https://x/lobby.jpg'] } as any);
    expect(out.every(p => !p.caption)).toBe(true);
  });
});
