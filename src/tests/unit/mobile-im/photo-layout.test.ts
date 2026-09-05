import { describe, it, expect } from 'vitest';
import { determinePhotoLayoutMode } from '@/domain/building/mobile-im/presentation/adaptive-photo-layout';
import type { PhotoAsset } from '@/domain/building/im-core/proposals/photo-asset-manager';

describe('AdaptivePhotoLayout Mode Determination (PR-B2-03 / Negative-Pair Obligation)', () => {
  const dummyPhoto = (id: string): PhotoAsset => ({
    id,
    dealId: 'deal-1',
    category: 'facade',
    fileUrl: `https://example.com/photo-${id}.jpg`,
    rawHash: 'sha256:abc',
    widthPx: 1920,
    heightPx: 1080,
    effectiveDpi: 300,
    maskingApproved: true,
  });

  it('Positive Pair: Variable photo counts map to accurate layout modes', () => {
    expect(determinePhotoLayoutMode([dummyPhoto('1')])).toBe('single_hero');
    expect(determinePhotoLayoutMode([dummyPhoto('1'), dummyPhoto('2'), dummyPhoto('3')])).toBe(
      'tri_grid'
    );
    expect(
      determinePhotoLayoutMode(Array.from({ length: 12 }, (_, i) => dummyPhoto(`${i}`)))
    ).toBe('tabbed_gallery');
  });

  it('Negative Pair: Zero photos safely triggers no_photos fallback mode without errors', () => {
    expect(determinePhotoLayoutMode([])).toBe('no_photos');
  });
});
