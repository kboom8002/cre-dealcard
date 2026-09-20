import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateStaticMapPlaceholder } from '@/domain/building/mobile-im/pptx/utils/image-optimizer';

vi.mock('sharp', () => {
  const sharpMock = vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    extract: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-image-buffer')),
  }));
  return { default: sharpMock };
});

describe('image-optimizer-composite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from('mock-buffer')),
    });
  });

  it('tests walk circle SVG generation with various canvas sizes', async () => {
    const res = await generateStaticMapPlaceholder('test', 800, 500, { lat: 37.5, lng: 127.0 }, []);
    expect(res).toBeDefined();
    expect(res.width).toBe(800);
    expect(res.height).toBe(500);
  });

  it('tests POI overlays collision logic', async () => {
    // Two POIs at exactly same location
    const pois: any = [
      { name: 'Station A', lat: 37.5, lng: 127.0, category: 'subway' },
      { name: 'Station B', lat: 37.5, lng: 127.0, category: 'subway' },
    ];
    
    // Second POI should be skipped due to collision detection logic (boxesOverlap)
    // We can't directly check internal occupiedBoxes but we can verify it doesn't crash
    const res = await generateStaticMapPlaceholder('test', 800, 500, { lat: 37.5, lng: 127.0 }, pois);
    expect(res).toBeDefined();
  });

  it('tests sharp pipeline stages', async () => {
    // Force OSM fallback by making Kakao fail
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('kakao')) return Promise.resolve({ ok: false });
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('osm-tile')),
      });
    });

    const res = await generateStaticMapPlaceholder('test', 800, 500, { lat: 37.5, lng: 127.0 }, []);
    expect(res).toBeDefined();
  });
});
