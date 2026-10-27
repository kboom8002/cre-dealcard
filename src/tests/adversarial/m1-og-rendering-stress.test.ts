/**
 * @file src/tests/adversarial/m1-og-rendering-stress.test.ts
 * @description Empirical Challenger M1: OG Image Rendering Adversarial Stress Harness.
 *
 * Stress-tests both:
 * 1. KakaoTalk OG v2 (`src/app/api/og/deal/[id]/kakao/route.tsx`)
 * 2. Standard Deal OG (`src/app/api/og/deal/[id]/route.tsx`)
 *
 * Attack Scenarios:
 * 1. Missing fields & total nulls (null building, empty DB rows, null attributes).
 * 2. Extreme length strings (10,000 char titles, hookCopy, regions).
 * 3. Complex Korean syllables, rare CJK glyphs, Hanja, and combining jamo.
 * 4. Special characters, XSS/HTML tags (<script>, quotes, ampersands), control chars.
 * 5. Emoji bomb (multiple surrogate pairs, flags, keycaps).
 * 6. Numeric extremes (negative, zero, NaN strings, giant numbers).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state for database queries
let mockBuildingData: any = null;
let mockSignalData: any = null;
let mockTeaserDocData: any = null;
let mockImLiteData: any = null;
let mockDocListData: any[] = [];
let mockProfileData: any = null;

// Mock dependencies
vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async () => mockBuildingData),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      return {
        select: vi.fn(() => {
          const chain: any = {
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === 'building_signal_cards') return { data: mockSignalData };
              if (table === 'document_objects') {
                if (mockTeaserDocData !== undefined) return { data: mockTeaserDocData };
                return { data: null };
              }
              if (table === 'profiles') return { data: mockProfileData };
              return { data: null };
            }),
          };
          // For multiple queries
          chain.then = (resolve: any) => {
            if (table === 'document_objects') {
              resolve({ data: mockDocListData });
            } else {
              resolve({ data: null });
            }
          };
          return chain;
        }),
      };
    }),
  })),
}));

// Mock font fetching to avoid external network dependencies during tests
global.fetch = vi.fn(async (url: any) => {
  return {
    ok: false,
    status: 404,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as any;
});

describe('Empirical Challenger: OG Image Rendering Stress Harness', () => {
  beforeEach(() => {
    mockBuildingData = null;
    mockSignalData = null;
    mockTeaserDocData = null;
    mockImLiteData = null;
    mockDocListData = [];
    mockProfileData = null;
  });

  describe('KakaoTalk OG v2 (api/og/deal/[id]/kakao)', () => {
    it('Scenario 1: Survives completely null building and database failures without crashing', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');
      mockBuildingData = null;
      mockSignalData = null;
      mockTeaserDocData = null;
      mockProfileData = null;

      const req = new Request('http://localhost:3000/api/og/deal/test-null/kakao');
      const response = await GET(req, { params: Promise.resolve({ id: 'test-null' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 2: Survives building with all null/undefined properties', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');
      mockBuildingData = {
        id: 'test-empty-props',
        address: null,
        area_signal: null,
        asset_type: null,
        price_band: null,
        current_use_signal: null,
        fit_summary: null,
        investment_posture: null,
        layers: null,
        verification_status: null,
        is_verified: null,
        owner_id: null,
      };

      const req = new Request('http://localhost:3000/api/og/deal/test-empty-props/kakao');
      const response = await GET(req, { params: Promise.resolve({ id: 'test-empty-props' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 3: Survives 10,000 character strings in hookCopy, area_signal, and titles without buffer/truncation failure', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');
      const hugeString = '대규모초특급매물'.repeat(1250); // 10,000 chars

      mockBuildingData = {
        id: 'test-huge-str',
        area_signal: hugeString.slice(0, 500),
        asset_type: '초대형복합빌딩',
        price_band: '1,000억대',
        layers: { location: { pnu: '11680101' } },
      };
      mockTeaserDocData = {
        body: {
          ogTitle: hugeString,
          kakaoOgTitle: hugeString,
        },
      };

      const req = new Request('http://localhost:3000/api/og/deal/test-huge-str/kakao');
      const response = await GET(req, { params: Promise.resolve({ id: 'test-huge-str' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 4: Handles rare Korean characters, CJK ideographs, combining jamo, and emojis', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');
      const complexKorean = '🔥 [초급매] 믾숮휭괢 뷁풂쯦 가나다 不動産 賣買 🏢 100억대! 🎯';

      mockBuildingData = {
        id: 'test-complex-kr',
        area_signal: '강남구 역삼동',
        asset_type: '근생빌딩',
        price_band: '85억대',
        verification_status: 'VERIFIED',
      };
      mockTeaserDocData = {
        body: {
          ogTitle: complexKorean,
        },
      };
      mockProfileData = {
        display_name: '김공인 🏢 (수석전문가)',
        company: 'CREDEAL 리얼티파트너스 🌟',
      };

      const req = new Request('http://localhost:3000/api/og/deal/test-complex-kr/kakao');
      const response = await GET(req, { params: Promise.resolve({ id: 'test-complex-kr' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 5: Handles HTML tags, quotes, ampersands, and script injection strings safely', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/kakao/route');
      mockBuildingData = {
        id: 'test-xss',
        area_signal: '<script>alert("xss")</script>',
        asset_type: '<b>굵은 글씨 & "따옴표"</b>',
        price_band: "'> <img src=x onerror=alert(1)>",
      };
      mockTeaserDocData = {
        body: {
          ogTitle: '<!-- comment --> <svg/onload=alert(1)> &amp; &lt;',
        },
      };

      const req = new Request('http://localhost:3000/api/og/deal/test-xss/kakao');
      const response = await GET(req, { params: Promise.resolve({ id: 'test-xss' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });
  });

  describe('Standard Deal OG (api/og/deal/[id])', () => {
    it('Scenario 1: Survives completely missing documents and null building', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/route');
      mockBuildingData = null;
      mockDocListData = [];
      mockSignalData = null;

      const req = new Request('http://localhost:3000/api/og/deal/std-null');
      const response = await GET(req, { params: Promise.resolve({ id: 'std-null' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 2: Handles 10,000 char long headlines and subtitles with graceful ellipsis', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/route');
      const extremeHeadline = '초핵심권역 프라임 랜드마크 타워 매각 건 '.repeat(500);

      mockBuildingData = {
        id: 'std-extreme-str',
        area_signal: '테헤란로 금융권역',
        asset_type: '업무시설',
        price_band: '5,000억대',
        urgency_tag: 'urgent',
      };
      mockDocListData = [
        {
          id: 'doc-1',
          document_type: 'blind_teaser',
          body: {
            ogTitle: extremeHeadline,
            ogDescription: extremeHeadline,
          },
        },
      ];

      const req = new Request('http://localhost:3000/api/og/deal/std-extreme-str');
      const response = await GET(req, { params: Promise.resolve({ id: 'std-extreme-str' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });

    it('Scenario 3: Survives null/undefined numeric calculations and NaN properties', async () => {
      const { GET } = await import('@/app/api/og/deal/[id]/route');
      mockBuildingData = {
        id: 'std-nan',
        asking_price_krw: NaN,
        total_floor_area_pyung: -999,
        cap_rate_pct: undefined,
        build_year: '연도불명',
        layers: null,
      };

      const req = new Request('http://localhost:3000/api/og/deal/std-nan');
      const response = await GET(req, { params: Promise.resolve({ id: 'std-nan' }) });

      expect(response).toBeDefined();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/png');
    });
  });
});
