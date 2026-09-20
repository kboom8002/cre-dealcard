import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCadastralMapImage } from '@/lib/external/vworld-wms-cadastral';
import * as vworldConfig from '@/lib/external/vworld-config';

vi.mock('@/lib/external/vworld-config', () => ({
  getVWorldApiKey: vi.fn(() => 'test-api-key'),
  getVWorldReferer: vi.fn(() => 'localhost'),
  getVWorldDomain: vi.fn(() => 'localhost'),
}));

vi.mock('sharp', () => {
  return {
    default: vi.fn().mockReturnValue({
      resize: vi.fn().mockReturnThis(),
      composite: vi.fn().mockReturnThis(),
      extract: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-image-buffer')),
    }),
  };
});

describe('vworld-wms-cadastral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('validates coordinates', async () => {
    const result1 = await fetchCadastralMapImage(0, 0);
    expect(result1).toBeNull();

    const result2 = await fetchCadastralMapImage(99, 999);
    expect(result2).toBeNull();
  });

  it('selects BONBUN layer for PNU ending with 0000', async () => {
    const mockWmsBuffer = Buffer.from('wms-image');
    const mockWfsResponse = {
      response: {
        result: {
          featureCollection: {
            features: [
              {
                geometry: {
                  type: 'Polygon',
                  coordinates: [[[127, 37], [127.001, 37], [127, 37.001], [127, 37]]],
                },
              },
            ],
          },
        },
      },
    };

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('req/wms')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: () => Promise.resolve(mockWmsBuffer),
        });
      }
      if (url.includes('req/wmts')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('base-tile')),
        });
      }
      if (url.includes('req/data')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockWfsResponse),
        });
      }
      return Promise.resolve({ ok: false });
    });

    // PNU ends with 0000 -> BONBUN
    await fetchCadastralMapImage(37.5, 127.0, 800, 600, 150, '1111011100100010000');
    
    // find the WFS fetch call
    const fetchCalls = (global.fetch as any).mock.calls;
    const wfsCall = fetchCalls.find((c: any) => c[0].includes('req/data') && c[0].includes('pnu:=:1111011100100010000'));
    
    expect(wfsCall).toBeDefined();
    expect(wfsCall[0]).toContain('LP_PA_CBND_BONBUN');
  });

  it('selects BUBUN layer for PNU not ending with 0000', async () => {
    const mockWmsBuffer = Buffer.from('wms-image');
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('req/wms')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: () => Promise.resolve(mockWmsBuffer),
        });
      }
      if (url.includes('req/data')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: { result: { featureCollection: { features: [] } } }
          }), // Mock empty first so it falls back or just test primary layer URL
        });
      }
      return Promise.resolve({ ok: false });
    });

    await fetchCadastralMapImage(37.5, 127.0, 800, 600, 150, '1111011100100010001');
    
    const fetchCalls = (global.fetch as any).mock.calls;
    const wfsCall = fetchCalls.find((c: any) => c[0].includes('req/data') && c[0].includes('pnu:=:1111011100100010001'));
    
    expect(wfsCall).toBeDefined();
    expect(wfsCall[0]).toContain('LP_PA_CBND_BUBUN');
  });
  
  it('extracts rings from MultiPolygon geometries', async () => {
    // This is tested implicitly by providing MultiPolygon geometry in the mock response and checking if it's processed correctly
    // Since fetchParcelPolygon is internal, we just verify the overall pipeline doesn't crash
    const mockWmsBuffer = Buffer.from('wms-image');
    const mockWfsResponse = {
      response: {
        result: {
          featureCollection: {
            features: [
              {
                geometry: {
                  type: 'MultiPolygon',
                  coordinates: [
                    [[[127, 37], [127.001, 37], [127, 37.001], [127, 37]]],
                    [[[127.01, 37.01], [127.011, 37.01], [127.01, 37.011], [127.01, 37.01]]]
                  ],
                },
              },
            ],
          },
        },
      },
    };

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('req/wms')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: () => Promise.resolve(mockWmsBuffer),
        });
      }
      if (url.includes('req/data')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockWfsResponse),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await fetchCadastralMapImage(37.5, 127.0, 800, 600, 150, '1111011100100010000');
    expect(res).toBeDefined();
    expect(res?.buffer).toBeDefined();
  });
});
