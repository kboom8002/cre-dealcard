/**
 * P0-SEC — /im-lite/[buildingId] fetchIMData status filtering.
 *  - ?doc=<draft|archived|revision_needed...> is owner/admin-only; others fall back to the
 *    public default document (graceful degradation for previously shared links).
 *  - archived (soft-deleted) buildings return null for non-owners.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/lib/demo/mobile-im-demo-data', () => ({ getDemoMobileIM: vi.fn().mockReturnValue(null) }));
vi.mock('@/lib/external/kakao-static-map', () => ({ buildKakaoStaticMapUrl: vi.fn().mockReturnValue('https://mock-map.url') }));
vi.mock('@/lib/ssot-adapter', () => ({ readWithMigration: vi.fn().mockResolvedValue({ data: null }) }));

import { createServiceClient } from '@/lib/supabase/service';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';

const doc = (status: string, marker: string) => ({
  status,
  owner_id: 'owner-1',
  created_at: '2026-10-01T00:00:00Z',
  body: {
    coordinates: { lat: 37.5, lng: 126.9 },
    ssot_summary: { area_signal: '당산역 권역', asset_type: '근린생활시설' },
    sections: [{ section_type: 'property_overview', title: '개요', markdown: `${marker} 본문`, confidence: 'measured' }],
  },
});

function setup(opts: { building?: Record<string, unknown> | null; byId?: unknown; publicDefault?: unknown }) {
  const mock = {
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null } }) } },
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        update: vi.fn(() => Promise.resolve({ data: null, error: null })),
        single: vi.fn(async () => {
          if (table === 'document_objects') return { data: opts.byId ?? null, error: opts.byId ? null : { message: 'not found' } };
          return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'building_ssot_lite') return { data: opts.building ?? null, error: null };
          if (table === 'document_objects') return { data: opts.publicDefault ?? null, error: null };
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  };
  (createServiceClient as any).mockReturnValue(mock);
}

const contentOf = (r: Awaited<ReturnType<typeof fetchIMData>>) => JSON.stringify(r?.sections ?? []);
const OWNER = { userId: 'owner-1', isAdmin: false };
const OTHER = { userId: 'other-2', isAdmin: false };
const ADMIN = { userId: 'admin-9', isAdmin: true };

describe('P0-SEC: fetchIMData ?doc= status filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['draft', 'generating', 'generated', 'pending_approval', 'revision_needed', 'archived'])(
    'non-public status %s: anonymous/other users get the public default, owner/admin get the draft',
    async (status) => {
      setup({
        building: { owner_id: 'owner-1', status: 'public_signal_ready' },
        byId: doc(status, 'PRIVATE_DRAFT'),
        publicDefault: doc('published', 'PUBLIC_VERSION'),
      });

      for (const viewer of [undefined, null, OTHER]) {
        const r = await fetchIMData('bldg-1', 'doc-1', viewer as any);
        expect(contentOf(r)).toContain('PUBLIC_VERSION');
        expect(contentOf(r)).not.toContain('PRIVATE_DRAFT');
      }
      for (const viewer of [OWNER, ADMIN]) {
        const r = await fetchIMData('bldg-1', 'doc-1', viewer);
        expect(contentOf(r)).toContain('PRIVATE_DRAFT');
      }
    },
  );

  it('non-public ?doc= with no public default → no draft content (SSoT fallback / null)', async () => {
    setup({ building: { owner_id: 'owner-1', status: 'public_signal_ready' }, byId: doc('draft', 'PRIVATE_DRAFT') });
    const r = await fetchIMData('bldg-1', 'doc-1', null);
    expect(contentOf(r)).not.toContain('PRIVATE_DRAFT');
  });

  it.each(['published', 'broker_reviewed', 'shared_external'])('public status %s via ?doc= is visible to anyone', async (status) => {
    setup({ building: { owner_id: 'owner-1', status: 'public_signal_ready' }, byId: doc(status, 'SHARED_DOC') });
    const r = await fetchIMData('bldg-1', 'doc-1', null);
    expect(contentOf(r)).toContain('SHARED_DOC');
  });

  it('archived building → null for non-owners, still visible to owner', async () => {
    setup({ building: { owner_id: 'owner-1', status: 'archived' }, publicDefault: doc('published', 'PUBLIC_VERSION') });
    expect(await fetchIMData('bldg-1', undefined, null)).toBeNull();
    expect(await fetchIMData('bldg-1', undefined, OTHER)).toBeNull();
    expect(contentOf(await fetchIMData('bldg-1', undefined, OWNER))).toContain('PUBLIC_VERSION');
  });

  it('draft building (shared links) is not blocked', async () => {
    setup({ building: { owner_id: 'owner-1', status: 'draft' }, publicDefault: doc('published', 'PUBLIC_VERSION') });
    expect(contentOf(await fetchIMData('bldg-1', undefined, null))).toContain('PUBLIC_VERSION');
  });
});
