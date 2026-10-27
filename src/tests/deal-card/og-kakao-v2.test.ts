import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeCard4Hash } from '@/lib/deal-card/card4-schema';

const mockBuilding = {
  id: 'bldg-og-1',
  address: '서울특별시 서초구 반포동 123-45',
  area_signal: '서초구 반포동',
  asset_type: '근린생활시설',
  asking_price_krw: 120 * 1_0000_0000,
  total_floor_area_pyung: 400,
  road_contact: 'WIDE_ONE',
  completion_year: 2021,
};

const expectedHash = computeCard4Hash({
  region: '서초구 반포동',
  use: '근린생활시설',
  priceBand: '120~140억',
  points: [
    '대로변 위치 접근성 우수',
    '연면적 약 400평 규모',
    '2021년 준공 관리 상태 양호',
  ],
});

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async (id: string) => {
    if (id === 'bldg-og-1') return mockBuilding;
    return null;
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
      })),
    })),
  })),
}));

// Mock loadOgFonts to return mock ArrayBuffer for local font
vi.mock('@/lib/magazine/og-fonts', () => ({
  loadOgFonts: vi.fn(async () => ({
    fonts: [
      {
        name: 'Noto Sans KR',
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        weight: 700 as const,
        style: 'normal' as const,
      },
    ],
    hasKorean: true,
    glyphs: null,
    source: 'public' as const,
  })),
}));

import { GET } from '@/app/api/og/deal/[id]/kakao-v2/route';

describe('WP-P1-06 & WP-P1-07: KakaoTalk OG v2 & Cache Versioning', () => {
  it('redirects 302 to URL with ?v={card4_hash} when ?v is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/og/deal/bldg-og-1/kakao-v2');
    const res = await GET(req, { params: Promise.resolve({ id: 'bldg-og-1' }) });

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toBeDefined();
    expect(location).toContain(`?v=${expectedHash}`);
  });

  it('redirects 302 to URL with ?v={card4_hash} when ?v is mismatched', async () => {
    const req = new NextRequest('http://localhost:3000/api/og/deal/bldg-og-1/kakao-v2?v=stale_old_hash');
    const res = await GET(req, { params: Promise.resolve({ id: 'bldg-og-1' }) });

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain(`?v=${expectedHash}`);
  });

  it('responds with immutable cache header when ?v={card4_hash} matches', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/og/deal/bldg-og-1/kakao-v2?v=${expectedHash}`
    );
    const res = await GET(req, { params: Promise.resolve({ id: 'bldg-og-1' }) });

    expect(res.status).toBe(200);
    const cacheControl = res.headers.get('cache-control');
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age=31536000');
    expect(cacheControl).toContain('immutable');
  });

  it('returns 404 if building does not exist', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/og/deal/nonexistent-id/kakao-v2'
    );
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent-id' }) });
    expect(res.status).toBe(404);
  });

  describe('Static Architecture & Boundary Security Guard', () => {
    const fs = require('fs');
    const path = require('path');
    const routePath = path.resolve(
      process.cwd(),
      'src/app/api/og/deal/[id]/kakao-v2/route.tsx'
    );

    it('uses pure readBuilding and never imports readWithMigration', () => {
      const code = fs.readFileSync(routePath, 'utf8');
      expect(code).toContain('readBuilding');
      expect(code).not.toContain('readWithMigration');
    });

    it('configures standard 1200x630 canvas dimension', () => {
      const code = fs.readFileSync(routePath, 'utf8');
      expect(code).toContain('width: 1200');
      expect(code).toContain('height: 630');
    });

    it('renders large typography with 용도 · 권역 · 금액구간 headline', () => {
      const code = fs.readFileSync(routePath, 'utf8');
      expect(code).toContain('${use} · ${region} · ${priceBand}');
      expect(code).toContain('fontSize: \'56px\'');
    });

    it('contains zero DB write mutations (insert/update/delete/upsert) on GET path', () => {
      const code = fs.readFileSync(routePath, 'utf8');
      expect(code).not.toMatch(/\.from\([^)]+\)\.insert/);
      expect(code).not.toMatch(/\.from\([^)]+\)\.update/);
      expect(code).not.toMatch(/\.from\([^)]+\)\.delete/);
      expect(code).not.toMatch(/\.from\([^)]+\)\.upsert/);
    });
  });
});

