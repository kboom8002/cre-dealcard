import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
  supaAuthGetUser: vi.fn(async () => ({ data: { user: null } })),
  buildingRow: null as Record<string, unknown> | null,
  workspaceItemRow: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: hoisted.supaAuthGetUser },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'building_ssot_lite') {
            return { data: hoisted.buildingRow, error: null };
          }
          if (table === 'workspace_items') {
            return { data: hoisted.workspaceItemRow, error: null };
          }
          return { data: null, error: null };
        },
        then: (
          onF?: (v: { data: unknown[]; error: null }) => unknown,
          onR?: (e: unknown) => unknown
        ) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      };
      return chain;
    },
  }),
}));

import { fetchKakaoMapImage } from '@/domain/building/mobile-im/pptx/utils/image-optimizer';
import {
  filterHiddenImSections,
  normalizeHiddenSectionSet,
} from '@/lib/im-lite/im-public-guard';
import { derivePriceBand } from '@/domain/building/cre-area-ontology';
import { GET as publicSnapshotGET } from '@/app/api/public/buildings/[id]/snapshot/route';

const BLD_UUID = '44444444-4444-4444-8444-444444444404';
const OWNER_ID = '11111111-4444-4444-8444-111111111101';

describe('PR-2C IM SSRF Lockdown, hiddenSections Filtering, Snapshot Gate, >=1조 Price Band & OG Masking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret-key';
    hoisted.buildingRow = { id: BLD_UUID, owner_id: OWNER_ID, status: 'draft' };
    hoisted.workspaceItemRow = null;
  });

  it('1) blocks cleartext http, localhost, and cloud metadata IMDS URLs in fetchKakaoMapImage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchKakaoMapImage('http://dapi.kakao.com/map.png')).toBeNull();
    expect(await fetchKakaoMapImage('https://localhost/map.png')).toBeNull();
    expect(await fetchKakaoMapImage('https://169.254.169.254/latest/meta-data')).toBeNull();
    expect(await fetchKakaoMapImage('https://127.0.0.1/secret.png')).toBeNull();
    expect(await fetchKakaoMapImage('https://10.0.0.5/internal.png')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('2) normalizes and filters hiddenSections server-side from IM section payloads', () => {
    const hidden = normalizeHiddenSectionSet({
      hidden_sections: ['06_rentroll', 'risk_check'],
      hiddenSections: ['income_analysis'],
    });
    const sections = [
      { sectionId: '01_cover', title: '표지' },
      { id: '06_rentroll', sectionType: 'rentroll', title: '렌트롤' },
      { section_type: 'income_analysis', title: '수익 분석' },
      { section_type: 'risk_check', title: '리스크 체크' },
      { sectionId: '04_location', title: '입지 분석' },
    ];
    const filtered = filterHiddenImSections(sections, hidden);
    expect(filtered.map((s) => s.title)).toEqual(['표지', '입지 분석']);
  });

  it('3) rejects non-UUID (400) and non-published draft buildings (404) on /api/public/buildings/[id]/snapshot', async () => {
    const badRes = await publicSnapshotGET(
      new NextRequest('https://www.credeal.net/api/public/buildings/invalid-id-999/snapshot'),
      { params: Promise.resolve({ id: 'invalid-id-999' }) }
    );
    expect(badRes.status).toBe(400);

    const draftRes = await publicSnapshotGET(
      new NextRequest(`https://www.credeal.net/api/public/buildings/${BLD_UUID}/snapshot`),
      { params: Promise.resolve({ id: BLD_UUID }) }
    );
    expect(draftRes.status).toBe(404);
  });

  it('4) formats >=1조 price bands cleanly with 조/억대 instead of >10,000억대', () => {
    expect(derivePriceBand(100_000_000)).toBe('1조대');
    expect(derivePriceBand(105_000_000)).toBe('1조 500억대');
    expect(derivePriceBand(200_000_000)).toBe('2조대');
    expect(derivePriceBand(12_000_000)).toBe('1,200억대');
    expect(derivePriceBand(850_000)).toBe('80억대');
  });

  it('5) wires maskNeedles + collectSensitiveNeedles into all 3 OG sub-routes and storage upload into map-upload', () => {
    for (const rel of [
      'src/app/api/og/deal/[id]/card/route.tsx',
      'src/app/api/og/deal/[id]/kakao/route.tsx',
      'src/app/api/og/deal/[id]/kakao-v2/route.tsx',
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
      expect(src).toContain('collectSensitiveNeedles');
      expect(src).toContain('maskNeedles');
    }

    const mapUploadSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/broker/basic-im-studio/[id]/map-upload/route.ts'),
      'utf-8'
    );
    expect(mapUploadSrc).toContain('svc.storage.from');
    expect(mapUploadSrc).toContain('STORAGE_UPLOAD_FAILED');
  });
});
