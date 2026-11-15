import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as ogFontsModule from '@/lib/magazine/og-fonts';
import { normalizeKakaoShareUrl, shareKakaoFeed } from '@/lib/kakao/share';

let mockBrokerProfileRow: Record<string, unknown> | null = null;
let mockProfileRow: Record<string, unknown> | null = null;
let mockBuildingCount = 0;
let mockBuildingData: Record<string, unknown> | null = null;

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async () => mockBuildingData),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        const chain: Record<string, unknown> = {};
        chain.eq = vi.fn(() => chain);
        chain.neq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        chain.or = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => {
          if (table === 'broker_profiles') {
            return { data: mockBrokerProfileRow, error: null };
          }
          return { data: null, error: null };
        });
        chain.single = vi.fn(async () => {
          if (table === 'profiles') {
            return { data: mockProfileRow, error: null };
          }
          if (table === 'broker_profiles') {
            return { data: mockBrokerProfileRow, error: null };
          }
          return { data: null, error: null };
        });
        chain.then = (resolve: (val: unknown) => void) => {
          if (table === 'building_ssot_lite' && opts?.head) {
            resolve({ count: mockBuildingCount, data: null, error: null });
            return;
          }
          resolve({ data: [], error: null });
        };
        return chain;
      }),
    })),
  })),
}));

const OG_ROUTES = [
  'src/app/api/og/broker/[slug]/route.tsx',
  'src/app/api/og/deal/[id]/route.tsx',
  'src/app/api/og/deal/[id]/kakao/route.tsx',
  'src/app/api/og/deal/[id]/card/route.tsx',
  'src/app/api/og/deal/[id]/kakao-v2/route.tsx',
] as const;

function readPngDimensions(bytes: ArrayBuffer): { width: number; height: number } {
  const buf = Buffer.from(bytes);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  // IHDR width at offset 16 (4B BE), height at offset 20 (4B BE)
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('Wave 4 — WP-14: Local Korean Font (loadOgFonts) Unification & Kakao Share Normalization', () => {
  describe('Static Guard: All 5 /api/og/** Routes', () => {
    for (const relPath of OG_ROUTES) {
      it(`${relPath} declares nodejs runtime, uses loadOgFonts, passes fonts to ImageResponse, and has zero remote CDN font URLs`, () => {
        const absPath = path.resolve(process.cwd(), relPath);
        expect(fs.existsSync(absPath)).toBe(true);
        const code = fs.readFileSync(absPath, 'utf8');

        // 1. Node.js runtime (required for local fs.readFile in loadOgFonts)
        expect(code).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
        expect(code).not.toMatch(/export\s+const\s+runtime\s*=\s*['"]edge['"]/);

        // 2. Uses bundled local Korean font loader
        expect(code).toContain('loadOgFonts');
        expect(code).toContain('@/lib/magazine/og-fonts');
        expect(code).toContain('Noto Sans KR');

        // 3. Passes fonts & Cache-Control into ImageResponse
        expect(code).toMatch(/new\s+ImageResponse\s*\([\s\S]*?fonts\s*:/);
        expect(code).toContain('Cache-Control');

        // 4. Zero remote font CDN downloads
        expect(code).not.toContain('cdn.jsdelivr.net');
        expect(code).not.toContain('fonts.gstatic.com');
        expect(code).not.toContain('googleapis.com');
      });
    }

    it('broker/[slug]/route.tsx aligns brand text to CREDEAL · 크리딜', () => {
      const absPath = path.resolve(process.cwd(), 'src/app/api/og/broker/[slug]/route.tsx');
      const code = fs.readFileSync(absPath, 'utf8');
      expect(code).toContain('CREDEAL · 크리딜');
    });
  });

  describe('Dynamic Runtime: /api/og/broker/[slug] and /api/og/deal/[id]', () => {
    const originalFetch = global.fetch;
    let networkCalls: string[] = [];

    beforeEach(() => {
      networkCalls = [];
      mockBrokerProfileRow = {
        user_id: '11111111-1111-4111-8111-111111111111',
        specialty_regions: ['강남구', '서초구'],
      };
      mockProfileRow = {
        id: '11111111-1111-4111-8111-111111111111',
        display_name: '김크리 대표중개사',
        company: '크리딜 부동산중개법인',
      };
      mockBuildingCount = 12;
      mockBuildingData = {
        id: 'deal-wp14-test',
        area_signal: '강남구 역삼동',
        asset_type: '업무시설',
        price_band: '120~140억',
        asking_price_krw: 130 * 1_0000_0000,
        investment_posture: 'income',
      };

      // Allow inline data: URIs (next/og embedded WASM init) while rejecting any external HTTP(S) network fetch
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (urlStr.startsWith('data:')) {
          return originalFetch(input, init);
        }
        networkCalls.push(urlStr);
        throw new Error(`Unexpected external HTTP fetch during OG render: ${urlStr}`);
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('GET /api/og/broker/[slug] invokes loadOgFonts() and renders 1200x630 PNG with zero external fetches', async () => {
      const spy = vi.spyOn(ogFontsModule, 'loadOgFonts');
      const { GET } = await import('@/app/api/og/broker/[slug]/route');

      const req = new Request('http://localhost:3000/api/og/broker/kim-cre');
      const res = await GET(req, { params: Promise.resolve({ slug: 'kim-cre' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
      expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
      expect(spy).toHaveBeenCalled();

      const pngBytes = await res.arrayBuffer();
      expect(pngBytes.byteLength).toBeGreaterThan(1000);
      expect(readPngDimensions(pngBytes)).toEqual({ width: 1200, height: 630 });
      expect(networkCalls).toEqual([]);
    }, 30_000);

    it('GET /api/og/deal/[id] invokes loadOgFonts() and renders 1200x630 PNG with zero external fetches', async () => {
      const spy = vi.spyOn(ogFontsModule, 'loadOgFonts');
      const { GET } = await import('@/app/api/og/deal/[id]/route');

      const req = new Request('http://localhost:3000/api/og/deal/deal-wp14-test');
      const res = await GET(req, { params: Promise.resolve({ id: 'deal-wp14-test' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
      expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
      expect(spy).toHaveBeenCalled();

      const pngBytes = await res.arrayBuffer();
      expect(pngBytes.byteLength).toBeGreaterThan(1000);
      expect(readPngDimensions(pngBytes)).toEqual({ width: 1200, height: 630 });
      expect(networkCalls).toEqual([]);
    }, 30_000);

    it('GET /api/og/deal/[id]/kakao invokes loadOgFonts() and renders 1200x630 PNG with zero external fetches', async () => {
      const spy = vi.spyOn(ogFontsModule, 'loadOgFonts');
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');

      const req = new Request('http://localhost:3000/api/og/deal/deal-wp14-test/kakao');
      const res = await GET(req, { params: Promise.resolve({ id: 'deal-wp14-test' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
      expect(spy).toHaveBeenCalled();

      const pngBytes = await res.arrayBuffer();
      expect(pngBytes.byteLength).toBeGreaterThan(1000);
      expect(readPngDimensions(pngBytes)).toEqual({ width: 1200, height: 630 });
      expect(networkCalls).toEqual([]);
    }, 30_000);
  });

  describe('shareKakaoFeed: 1200x630 Dimensions & Absolute URL Normalization', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it('normalizes relative imageUrl and url against window.location.origin and defaults to 1200x630', async () => {
      vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', 'kakao-test-key');
      const sendDefault = vi.fn();
      vi.stubGlobal('window', {
        location: { origin: 'https://credeal.net' },
        Kakao: {
          isInitialized: () => true,
          init: vi.fn(),
          Share: { sendDefault },
        },
      });

      const outcome = await shareKakaoFeed({
        title: '강남구 역삼동 프라임 오피스',
        imageUrl: '/api/og/deal/bldg-1/kakao-v2',
        url: '/dc/bldg-1',
      });

      expect(outcome).toBe('kakao');
      expect(sendDefault).toHaveBeenCalledTimes(1);
      const payload = sendDefault.mock.calls[0][0];
      expect(payload.content.imageUrl).toBe('https://credeal.net/api/og/deal/bldg-1/kakao-v2');
      expect(payload.content.imageWidth).toBe(1200);
      expect(payload.content.imageHeight).toBe(630);
      expect(payload.content.link).toEqual({
        webUrl: 'https://credeal.net/dc/bldg-1',
        mobileWebUrl: 'https://credeal.net/dc/bldg-1',
      });
      expect(payload.buttons[0].link).toEqual({
        webUrl: 'https://credeal.net/dc/bldg-1',
        mobileWebUrl: 'https://credeal.net/dc/bldg-1',
      });
    });

    it('normalizes protocol-relative // URLs to https:// and preserves explicit https:// URLs', () => {
      vi.stubGlobal('window', {
        location: { origin: 'https://app.credeal.net' },
      });

      expect(normalizeKakaoShareUrl('//cdn.credeal.net/og/card.png')).toBe(
        'https://cdn.credeal.net/og/card.png',
      );
      expect(normalizeKakaoShareUrl('/api/og/broker/kim')).toBe(
        'https://app.credeal.net/api/og/broker/kim',
      );
      expect(normalizeKakaoShareUrl('https://credeal.net/dc/abc')).toBe(
        'https://credeal.net/dc/abc',
      );
    });
  });
});
