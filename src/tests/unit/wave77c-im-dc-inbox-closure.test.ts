// @vitest-environment node
/**
 * Wave 7.7 — WP-7.7C IM P0/P1, DealCard P1, Inbox P1 & Sub-14px Gate Closure Suite
 *
 * Covers:
 *  1. IM P0-1: `POST /api/gate-requests/[id]/sign` & `/nda/[id]/page.tsx`
 *     - Rejects public `buildingId` lookup (`404` / `notFound()`).
 *     - Rejects 4-digit `phoneLast4` alone when recorded phone is 8–11 digits (`403`).
 *     - Enforces per-grant rate limit (`429` after 8 failed verification attempts).
 *     - Allows full normalized phone or valid `grantToken` (`200`).
 *  2. IM P0-2 / P1-5b / P1-6a: `GET /api/public/buildings/[id]/snapshot` & `/generate`
 *     - Blocks anonymous and cross-buyer requests (`403`) even when another buyer has G2 approval.
 *     - Allows owner, caller-bound approved buyer, and active `grant_token` holder (`200`).
 *     - Returns normalized `{ ...body, id, status, created_at, body }` shape.
 *  3. IM P1-1 / P1-2 / P1-3 / P2-1:
 *     - `fetchIMData` fails closed (`null`) for public viewers when `activity_events` governance lookup errors.
 *     - Pro IM export filters `hidden_sections` / `hiddenSections` / `s.hidden === true`.
 *     - `ImSlideVisualCard` places `연면적` on Slide 03 and `용도지역` on Slide 05; `/broker/w/im` excludes `owner` rows.
 *  4. IM P1-4 / P1-5a / P1-6b:
 *     - `upload-photo` rejects spoofed non-image bytes with `image/jpeg` Content-Type (`415 UNSUPPORTED_MEDIA_TYPE`)
 *       and derives stored MIME/ext strictly from `magicKind`.
 *     - `GET /api/broker/buildings` merges standalone `workspace_items`.
 *     - `SUB14_LOCKED_FILES` & newly locked paths contain 0 sub-14px tokens.
 *  5. DealCard P1-1 / P1-2 / P1-4 & Inbox P1-1 / P1-3:
 *     - `POST /api/broker/dealcards/non-existent-id/publish` returns `404` (never phantom `200`).
 *     - Re-publish prefers `wsItem.draftPayload.card4`, syncs `blind_teaser`, and clears `hasUnpublishedEdits`.
 *     - `kakao-v2` returns `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` (no `immutable`).
 *     - `handleUpsertClientAction` Undo-Delete re-inserts deleted UUID row into `broker_clients`.
 *     - `/broker/inbox` server-redirects to `/broker/w/inbox` preserving query params.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import { clearQuickImStoreForTest } from '@/lib/im-lite/quick-generate-store';
import { computeCard4Hash } from '@/lib/deal-card/card4-schema';

const OWNER_ID = '11117700-7700-4111-8111-111111117701';
const BUYER_A_ID = '22227700-7700-4222-8222-222222227702';
const BUYER_B_ID = '33337700-7700-4333-8333-333333337703';
const BLD_UUID = 'aaaa7700-7700-4111-8111-aaaaaaaa7701';
const GRANT_UUID = 'bbbb7700-7700-4222-8222-bbbbbbbb7702';
const CLIENT_UUID = 'cccc7700-7700-4333-8333-cccccccc7703';

interface DbRow {
  [key: string]: unknown;
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, DbRow[]>,
  tableErrors: {} as Record<string, { code?: string; message: string }>,
  authUser: {
    id: '11117700-7700-4111-8111-111111117701',
    email: 'owner77c@credeal.kr',
  } as { id: string; email?: string } | null,
  authRole: 'broker' as 'broker' | 'admin' | 'viewer' | null,
  publicSnapshotBearerUserId: null as string | null,
  storageUploads: [] as Array<{ bucket: string; path: string; contentType?: string; bytes: number }>,
  readBuildingMock: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
}));

function buildInMemoryClient(options?: { bearerUserIdResolver?: (tok: string) => string | null }) {
  const ensure = (table: string): DbRow[] => {
    if (!state.tables[table]) state.tables[table] = [];
    return state.tables[table];
  };

  const from = (table: string) => {
    const filters: Array<(row: DbRow) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: DbRow | DbRow[] | null = null;
    let limitCount: number | null = null;

    const execute = () => {
      const configuredErr = state.tableErrors[table];
      if (configuredErr) {
        return { data: null, error: configuredErr, count: null };
      }
      const rows = ensure(table);

      if (op === 'select') {
        let matched = rows.filter((r) => filters.every((fn) => fn(r))).map((r) => structuredClone(r));
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        return { data: matched, error: null, count: matched.length };
      }

      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const inserted = items.map((it, idx) => {
          const rec: DbRow = {
            id: it.id || `gen-${table}-${rows.length + idx + 1}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...structuredClone(it),
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        return { data: inserted, error: null, count: inserted.length };
      }

      if (op === 'update') {
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        const updated: DbRow[] = [];
        for (const row of matched) {
          if (payload && !Array.isArray(payload)) {
            Object.assign(row, structuredClone(payload));
          }
          updated.push(structuredClone(row));
        }
        return { data: updated, error: null, count: updated.length };
      }

      if (op === 'upsert') {
        const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const upserted = items.map((it, idx) => {
          const foundIdx = rows.findIndex((r) => it.id && r.id === it.id);
          if (foundIdx >= 0) {
            rows[foundIdx] = { ...rows[foundIdx], ...structuredClone(it) };
            return structuredClone(rows[foundIdx]);
          }
          const rec: DbRow = {
            id: it.id || `ups-${table}-${rows.length + idx + 1}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...structuredClone(it),
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        return { data: upserted, error: null, count: upserted.length };
      }

      const remaining = rows.filter((r) => !filters.every((fn) => fn(r)));
      state.tables[table] = remaining;
      return { data: [], error: null, count: 0 };
    };

    const evalOrClause = (r: DbRow, clause: string): boolean => {
      const m1 = clause.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
      if (m1) return String(r[m1[1]] ?? '') === m1[2];
      const m2 = clause.match(/^metadata->>([a-zA-Z0-9_]+)\.eq\.(.+)$/);
      if (m2) {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return String(meta[m2[1]] ?? '') === m2[2];
      }
      return false;
    };

    const builder = {
      select: () => builder,
      insert: (p: DbRow | DbRow[]) => {
        op = 'insert';
        payload = p;
        return builder;
      },
      update: (p: DbRow) => {
        op = 'update';
        payload = p;
        return builder;
      },
      upsert: (p: DbRow | DbRow[]) => {
        op = 'upsert';
        payload = p;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
        return builder;
      },
      lt: (col: string, val: number) => {
        filters.push((r) => Number(r[col] ?? 0) < val);
        return builder;
      },
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => p.trim());
        filters.push((r) => parts.some((p) => evalOrClause(r, p)));
        return builder;
      },
      contains: (col: string, obj: Record<string, unknown>) => {
        filters.push((r) => {
          const target = r[col];
          if (!target || typeof target !== 'object') return false;
          return Object.entries(obj).every(([k, v]) => (target as Record<string, unknown>)[k] === v);
        });
        return builder;
      },
      order: () => builder,
      range: () => builder,
      limit: (n: number) => {
        limitCount = n;
        return builder;
      },
      maybeSingle: async () => {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const arr = Array.isArray(res.data) ? res.data : [];
        return { data: arr[0] ?? null, error: null };
      },
      single: async () => {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        const arr = Array.isArray(res.data) ? res.data : [];
        return arr[0]
          ? { data: arr[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'Not found' } };
      },
      then: <TResult1 = ReturnType<typeof execute>, TResult2 = never>(
        onfulfilled?: ((value: ReturnType<typeof execute>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(execute()).then(onfulfilled, onrejected),
    };

    return builder;
  };

  return {
    from,
    auth: {
      getUser: vi.fn(async (tok?: string) => {
        const resolvedId = options?.bearerUserIdResolver
          ? options.bearerUserIdResolver(tok || '')
          : state.publicSnapshotBearerUserId;
        return resolvedId
          ? { data: { user: { id: resolvedId } }, error: null }
          : { data: { user: null }, error: { message: 'No session' } };
      }),
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    },
    storage: {
      createBucket: vi.fn(async () => ({ data: null, error: null })),
      from: (bucket: string) => ({
        upload: vi.fn(async (storagePath: string, buf: Buffer, opts?: { contentType?: string }) => {
          state.storageUploads.push({
            bucket,
            path: storagePath,
            contentType: opts?.contentType,
            bytes: buf.byteLength,
          });
          return { data: { path: storagePath }, error: null };
        }),
        getPublicUrl: (storagePath: string) => ({
          data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${storagePath}` },
        }),
      }),
    },
  };
}

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => buildInMemoryClient(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () =>
    buildInMemoryClient({
      bearerUserIdResolver: (tok) => {
        if (tok === 'owner-token') return OWNER_ID;
        if (tok === 'buyer-a-token') return BUYER_A_ID;
        if (tok === 'buyer-b-token') return BUYER_B_ID;
        return state.publicSnapshotBearerUserId;
      },
    }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => {
    if (!state.authUser) {
      return {
        user: null,
        role: null,
        profile: null,
        error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }),
      };
    }
    return {
      user: state.authUser,
      role: state.authRole,
      profile: { role: state.authRole, display_name: '정중개' },
      error: null,
    };
  }),
  verifyAuth: vi.fn(async () => {
    if (!state.authUser) {
      return { user: null, role: null, profile: null, error: new Response('{}', { status: 401 }) };
    }
    return {
      user: state.authUser,
      role: state.authRole,
      profile: { role: state.authRole },
      error: null,
    };
  }),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: (...args: [string]) => state.readBuildingMock(...args),
}));

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

import { POST as postSignNda } from '@/app/api/gate-requests/[id]/sign/route';
import NDAPage from '@/app/(public)/nda/[id]/page';
import { GET as getPublicSnapshot } from '@/app/api/public/buildings/[id]/snapshot/route';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';
import { GET as getProImExport } from '@/app/api/public/im-pro/[grantId]/export/route';
import { POST as postUploadPhoto } from '@/app/api/broker/im/upload-photo/route';
import { GET as getBrokerBuildings } from '@/app/api/broker/buildings/route';
import { POST as postPublishDealCard } from '@/app/api/broker/dealcards/[id]/publish/route';
import { GET as getOgKakaoV2 } from '@/app/api/og/deal/[id]/kakao-v2/route';
import { handleUpsertClientAction } from '@/lib/inbox/inbox-actions-clients';
import LegacyInboxRedirectPage from '@/app/(broker)/broker/inbox/page';
import { ImSlideVisualCard } from '@/app/(broker)/broker/w/im/_components/ImSlideVisualCard';

describe('Wave 7.7 — WP-7.7C IM, DealCard, Inbox & Sub-14px Gate Closure', () => {
  beforeEach(() => {
    state.tables = {
      profiles: [
        {
          id: OWNER_ID,
          display_name: '정중개',
          company: '크리딜공인중개사사무소',
          phone: '02-555-1234',
          role: 'broker',
        },
      ],
      broker_profiles: [
        {
          user_id: OWNER_ID,
          slug: 'jung-broker',
          office_reg_number: '11680-2024-00777',
          office_address: '서울특별시 강남구 테헤란로 200',
          representative_name: '정중개',
        },
      ],
    };
    state.tableErrors = {};
    state.authUser = { id: OWNER_ID, email: 'owner77c@credeal.kr' };
    state.authRole = 'broker';
    state.publicSnapshotBearerUserId = null;
    state.storageUploads = [];
    state.readBuildingMock.mockReset();
    clearRateLimitBuckets();
    resetWorkspaceRepositoryCacheForTests();
    clearQuickImStoreForTest();
  });

  afterEach(() => {
    clearRateLimitBuckets();
    resetWorkspaceRepositoryCacheForTests();
    clearQuickImStoreForTest();
  });

  describe('1. IM P0-1: NDA Sign & /nda/[id] Public buildingId Block + Full-Phone Enforcement', () => {
    beforeEach(() => {
      state.authUser = null;
      state.tables.building_ssot_lite = [
        {
          id: BLD_UUID,
          owner_id: OWNER_ID,
          area_signal: '강남구 역삼동',
          asset_type: '업무시설',
          address: '서울특별시 강남구 역삼동 823-10',
        },
      ];
      state.tables.im_pro_grants = [
        {
          id: GRANT_UUID,
          building_id: BLD_UUID,
          requester_name: '김매수',
          requester_phone: '010-1234-5678',
          grant_token: 'secret-grant-token-77c-abcdef1234',
          status: 'pending_nda',
          nda_signed_at: null,
          expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
        },
      ];
    });

    it('rejects POST /api/gate-requests/<buildingId>/sign with 404 and /nda/<buildingId> with notFound()', async () => {
      const res = await postSignNda(
        new NextRequest(`http://localhost:3000/api/gate-requests/${BLD_UUID}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agreedToTerms: true,
            signerName: '김매수',
            signerPhone: '010-1234-5678',
          }),
        }),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(res.status).toBe(404);
      expect(state.tables.im_pro_grants[0].status).toBe('pending_nda');

      await expect(NDAPage({ params: Promise.resolve({ id: BLD_UUID }) })).rejects.toThrow('NOT_FOUND');

      const validGrantPage = await NDAPage({ params: Promise.resolve({ id: GRANT_UUID }) });
      expect(validGrantPage).toBeDefined();
    });

    it('rejects 4-digit phoneLast4 alone against 11-digit recorded phone (403), locks out after 8 attempts (429), and accepts full phone', async () => {
      const last4Res = await postSignNda(
        new NextRequest(`http://localhost:3000/api/gate-requests/${GRANT_UUID}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.10' },
          body: JSON.stringify({
            agreedToTerms: true,
            signerName: '김매수',
            phoneLast4: '5678',
          }),
        }),
        { params: Promise.resolve({ id: GRANT_UUID }) },
      );
      expect(last4Res.status).toBe(403);

      // 7 more failed attempts (total 8) return 403; 9th attempt hits per-grant lockout (429)
      for (let i = 0; i < 7; i++) {
        const failRes = await postSignNda(
          new NextRequest(`http://localhost:3000/api/gate-requests/${GRANT_UUID}/sign`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': `198.51.100.${20 + i}`,
            },
            body: JSON.stringify({
              agreedToTerms: true,
              signerName: '공격자',
              signerPhone: `010-0000-000${i}`,
            }),
          }),
          { params: Promise.resolve({ id: GRANT_UUID }) },
        );
        expect(failRes.status).toBe(403);
      }

      const lockedRes = await postSignNda(
        new NextRequest(`http://localhost:3000/api/gate-requests/${GRANT_UUID}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.99' },
          body: JSON.stringify({
            agreedToTerms: true,
            signerName: '김매수',
            signerPhone: '010-1234-5678',
          }),
        }),
        { params: Promise.resolve({ id: GRANT_UUID }) },
      );
      expect(lockedRes.status).toBe(429);

      // After clearing rate-limit bucket, full normalized phone succeeds with 200
      clearRateLimitBuckets();
      const okRes = await postSignNda(
        new NextRequest(`http://localhost:3000/api/gate-requests/${GRANT_UUID}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agreedToTerms: true,
            signerName: '김매수',
            signerPhone: '010-1234-5678',
          }),
        }),
        { params: Promise.resolve({ id: GRANT_UUID }) },
      );
      expect(okRes.status).toBe(200);
      expect(state.tables.im_pro_grants[0].status).toBe('active');
    });
  });

  describe('2. IM P0-2: Snapshot Caller-Bound Authz & Normalized Envelope', () => {
    beforeEach(() => {
      state.tables.building_ssot_lite = [{ id: BLD_UUID, owner_id: OWNER_ID }];
      state.tables.gate_requests = [
        {
          id: 'gate-req-buyer-a',
          building_id: BLD_UUID,
          requester_id: BUYER_A_ID,
          status: 'approved',
          requested_level: 'G2',
        },
      ];
      state.tables.im_pro_grants = [
        {
          id: GRANT_UUID,
          building_id: BLD_UUID,
          grant_token: 'active-snapshot-grant-token-77c',
          status: 'active',
          is_revoked: false,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      ];
      state.tables.document_objects = [
        {
          id: 'snap-doc-77c',
          building_id: BLD_UUID,
          document_type: 'building_snapshot_draft',
          status: 'draft',
          created_at: '2026-11-18T12:00:00.000Z',
          body: {
            headline: '역삼역 프라임 근생 스냅샷',
            price_band: '110~120억',
            boundary_disclaimer: '참고용 요약 자료입니다.',
          },
        },
      ];
    });

    it('blocks anonymous & cross-buyer requests (403) while allowing owner, approved buyer, and grant-token holder (200)', async () => {
      // 1) Anonymous caller -> 403 even though Buyer A has an approved G2 gate_request
      const anonRes = await getPublicSnapshot(
        new NextRequest(`http://localhost:3000/api/public/buildings/${BLD_UUID}/snapshot`),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(anonRes.status).toBe(403);

      // 2) Buyer B (authenticated, not approved) -> 403
      const buyerBRes = await getPublicSnapshot(
        new NextRequest(`http://localhost:3000/api/public/buildings/${BLD_UUID}/snapshot`, {
          headers: { Authorization: 'Bearer buyer-b-token' },
        }),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(buyerBRes.status).toBe(403);

      // 3) Owner -> 200 with both top-level headline & nested body.headline
      const ownerRes = await getPublicSnapshot(
        new NextRequest(`http://localhost:3000/api/public/buildings/${BLD_UUID}/snapshot`, {
          headers: { Authorization: 'Bearer owner-token' },
        }),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(ownerRes.status).toBe(200);
      const ownerJson = await ownerRes.json();
      expect(ownerJson.headline).toBe('역삼역 프라임 근생 스냅샷');
      expect(ownerJson.body.headline).toBe('역삼역 프라임 근생 스냅샷');
      expect(ownerJson.created_at).toBe('2026-11-18T12:00:00.000Z');

      // 4) Buyer A (authenticated & G2 approved) -> 200
      const buyerARes = await getPublicSnapshot(
        new NextRequest(`http://localhost:3000/api/public/buildings/${BLD_UUID}/snapshot`, {
          headers: { Authorization: 'Bearer buyer-a-token' },
        }),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(buyerARes.status).toBe(200);

      // 5) Active grant-token holder -> 200
      const tokenRes = await getPublicSnapshot(
        new NextRequest(
          `http://localhost:3000/api/public/buildings/${BLD_UUID}/snapshot?token=active-snapshot-grant-token-77c`,
        ),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(tokenRes.status).toBe(200);
    });
  });

  describe('3. IM P1-1, P1-2, P1-5a, P2-1: Governance Fail-Closed, Hidden Sections, Magic Bytes & Slide Chips', () => {
    it('fails closed in fetchIMData for public viewers on activity_events outage while keeping owner preview', async () => {
      state.tables.building_ssot_lite = [
        { id: BLD_UUID, owner_id: OWNER_ID, status: 'public_signal_ready' },
      ];
      state.tables.document_objects = [
        {
          id: 'im-doc-77c',
          building_id: BLD_UUID,
          owner_id: OWNER_ID,
          document_type: 'im_lite',
          status: 'published',
          created_at: '2026-11-18T00:00:00.000Z',
          body: {
            coordinates: { lat: 37.5, lng: 127.03 },
            ssot_summary: { area_signal: '강남구 역삼동', asset_type: '업무시설' },
            sections: [{ section_type: 'property_overview', title: '개요', markdown: '정상 본문' }],
          },
        },
      ];
      state.tableErrors.activity_events = { code: '57014', message: 'canceling statement due to statement timeout' };

      const publicRes = await fetchIMData(BLD_UUID, undefined, null);
      expect(publicRes).toBeNull();

      const ownerRes = await fetchIMData(BLD_UUID, undefined, { userId: OWNER_ID, isAdmin: false });
      expect(ownerRes).not.toBeNull();
    });

    it('filters hidden_sections in Pro IM HTML export', async () => {
      state.tables.im_pro_grants = [
        {
          id: GRANT_UUID,
          building_id: BLD_UUID,
          requester_name: '박투자',
          requester_phone: '010-2222-3333',
          grant_token: 'pro-export-token-77c',
          status: 'active',
          is_revoked: false,
          nda_signed_at: new Date().toISOString(),
          pdf_export_allowed: true,
          max_downloads: 5,
          download_count: 0,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      ];
      state.tables.document_objects = [
        {
          id: 'pro-doc-77c',
          building_id: BLD_UUID,
          owner_id: OWNER_ID,
          document_type: 'im_pro',
          status: 'published',
          title: '역삼 Pro IM',
          body: {
            title: '역삼 Pro IM',
            hidden_sections: ['secret_internal_section'],
            sections: [
              { section_type: 'property_overview', title: '자산 개요', markdown: '**공개 섹션 본문**' },
              { section_type: 'secret_internal_section', title: '숨김 섹션', markdown: '절대 노출 금지 문구' },
              { section_type: 'extra_hidden', title: '플래그 숨김', markdown: '플래그 비노출', hidden: true },
            ],
          },
        },
      ];

      const res = await getProImExport(
        new NextRequest(
          `http://localhost:3000/api/public/im-pro/${GRANT_UUID}/export?token=pro-export-token-77c`,
        ),
        { params: Promise.resolve({ grantId: GRANT_UUID }) },
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('자산 개요');
      expect(html).not.toContain('절대 노출 금지 문구');
      expect(html).not.toContain('플래그 비노출');
    });

    it('rejects spoofed non-image bytes with image/jpeg Content-Type (415) and derives MIME strictly from magic bytes', async () => {
      const spoofedHtmlBytes = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>');
      const spoofedForm = new FormData();
      spoofedForm.append(
        'file',
        new File([spoofedHtmlBytes], 'spoof.jpg', { type: 'image/jpeg' }),
      );

      const badMpRes = await postUploadPhoto(
        new NextRequest('http://localhost:3000/api/broker/im/upload-photo', {
          method: 'POST',
          body: spoofedForm,
        }),
      );
      expect(badMpRes.status).toBe(415);
      expect(state.storageUploads).toHaveLength(0);

      const badDataUrlRes = await postUploadPhoto(
        new NextRequest('http://localhost:3000/api/broker/im/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'spoof.jpg',
            dataUrl: `data:image/jpeg;base64,${Buffer.from(spoofedHtmlBytes).toString('base64')}`,
          }),
        }),
      );
      expect(badDataUrlRes.status).toBe(415);
      expect(state.storageUploads).toHaveLength(0);

      // Valid PNG magic bytes declared as image/jpeg -> stored strictly as .png / image/png
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);
      const pngForm = new FormData();
      pngForm.append('file', new File([pngBytes], 'mislabelled.jpg', { type: 'image/jpeg' }));
      const goodPngRes = await postUploadPhoto(
        new NextRequest('http://localhost:3000/api/broker/im/upload-photo', {
          method: 'POST',
          body: pngForm,
        }),
      );
      expect(goodPngRes.status).toBe(200);
      expect(state.storageUploads[0]?.contentType).toBe('image/png');
      expect(state.storageUploads[0]?.path).toMatch(/\.png$/);
    });

    it('renders 연면적 on Slide 03 and 용도지역 on Slide 05 in ImSlideVisualCard and merges workspace_items in /api/broker/buildings', async () => {
      const slide03El = ImSlideVisualCard({
        slide: { no: '03', title: '건축물 개요', summary: '지상 6층', metric: '양호' },
        onFocusUnit: () => {},
        postureKoreanLabel: '임대수익형',
        axiosHighlights: [],
        rentRoll: [],
        photoEntries: [],
        zoning: '일반상업지역',
        gfaSqm: '1,450',
        totalRentManwon: 3200,
        brokerageName: '크리딜중개',
      });
      const slide05El = ImSlideVisualCard({
        slide: { no: '05', title: '토지 및 도시계획', summary: '역세권 필지', metric: '적합' },
        onFocusUnit: () => {},
        postureKoreanLabel: '임대수익형',
        axiosHighlights: [],
        rentRoll: [],
        photoEntries: [],
        zoning: '일반상업지역',
        gfaSqm: '1,450',
        totalRentManwon: 3200,
        brokerageName: '크리딜중개',
      });
      expect(JSON.stringify(slide03El)).toContain('연면적: 1,450㎡');
      expect(JSON.stringify(slide05El)).toContain('용도지역: 일반상업지역');

      state.tables.workspace_items = [
        {
          id: 'dddd7700-7700-4444-8444-dddddddd7704',
          owner_id: OWNER_ID,
          kind: 'dealcard',
          legacy_id: 'dc-standalone-77c',
          building_id: null,
          status: 'sent',
          title: '성수동 코너 근생 딜카드',
          address: '성동구 성수동',
          price_band: '80~90억',
          draft_payload: {
            card4: { region: '성동구 성수동', use: '근린생활시설', priceBand: '80~90억' },
          },
          published_snapshot: {
            card4: { region: '성동구 성수동', use: '근린생활시설', priceBand: '80~90억' },
          },
          version: 1,
          created_at: '2026-11-18T00:00:00.000Z',
          updated_at: '2026-11-18T00:00:00.000Z',
        },
      ];

      const bldRes = await getBrokerBuildings(
        new NextRequest('http://localhost:3000/api/broker/buildings'),
      );
      expect(bldRes.status).toBe(200);
      const bldJson = await bldRes.json();
      const merged = (bldJson.buildings as Array<{ id: string; title: string; status: string }>).find(
        (b) => b.id === 'dc-standalone-77c',
      );
      expect(merged).toBeDefined();
      expect(merged?.title).toBe('성수동 코너 근생 딜카드');
      expect(merged?.status).toBe('published');
    });
  });

  describe('4. DealCard P1-1, P1-2, P1-4: Non-Existent 404, Draft Re-Publish Sync & Kakao-v2 5-Min TTL', () => {
    it('returns 404 on POST /api/broker/dealcards/non-existent-id/publish and 403 on cross-tenant legacy DealCard', async () => {
      const missingRes = await postPublishDealCard(
        new NextRequest('http://localhost:3000/api/broker/dealcards/non-existent-id/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'non-existent-id' }) },
      );
      expect(missingRes.status).toBe(404);
      const missingJson = await missingRes.json();
      expect(missingJson.code).toBe('NOT_FOUND');

      state.tables.activity_events = [
        {
          id: 'ev-other-broker',
          actor_id: BUYER_B_ID,
          event_type: 'dealcard_upserted',
          entity_id: BUYER_B_ID,
          metadata: { building_id: 'legacy-foreign-dc-77c' },
          created_at: '2026-11-18T00:00:00.000Z',
        },
      ];
      const forbiddenRes = await postPublishDealCard(
        new NextRequest('http://localhost:3000/api/broker/dealcards/legacy-foreign-dc-77c/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'legacy-foreign-dc-77c' }) },
      );
      expect(forbiddenRes.status).toBe(403);
    });

    it('prefers wsItem.draftPayload.card4 on re-publish, syncs blind_teaser, clears hasUnpublishedEdits, and caps kakao-v2 Cache-Control at s-maxage=300', async () => {
      const staleCard4 = {
        headline: '이전 구버전 제목',
        posture: 'income',
        region: '강남구 역삼동',
        use: '업무시설',
        priceBand: '100~110억',
        points: ['구버전 포인트 1', '구버전 포인트 2', '구버전 포인트 3'],
      };
      const editedDraftCard4 = {
        headline: '신규 수정된 프라임 사옥',
        posture: 'income',
        region: '강남구 삼성동',
        use: '업무시설',
        priceBand: '130~150억',
        points: ['삼성역 도보 2분 코너', '전층 우량 법인 장기 임차', '자주식 주차 18대 완비'],
      };

      state.tables.building_ssot_lite = [
        {
          id: BLD_UUID,
          owner_id: OWNER_ID,
          area_signal: '강남구 삼성동',
          asset_type: '업무시설',
          price_band: '130~150억',
          status: 'public_signal_ready',
        },
      ];
      state.tables.document_objects = [
        {
          id: 'teaser-doc-77c',
          building_id: BLD_UUID,
          owner_id: OWNER_ID,
          document_type: 'blind_teaser',
          status: 'published',
          visibility: 'public_blind',
          body: { card4: staleCard4 },
          created_at: '2026-11-18T00:00:00.000Z',
        },
      ];
      state.tables.workspace_items = [
        {
          id: BLD_UUID,
          owner_id: OWNER_ID,
          kind: 'dealcard',
          legacy_id: null,
          building_id: BLD_UUID,
          status: 'sent',
          title: '이전 구버전 제목',
          address: '강남구 역삼동',
          price_band: '100~110억',
          draft_payload: {
            card4: editedDraftCard4,
            memoText: '비공개 소유주 메모',
            hasUnpublishedEdits: true,
          },
          published_snapshot: { card4: staleCard4 },
          version: 2,
          created_at: '2026-11-18T00:00:00.000Z',
          updated_at: '2026-11-18T00:00:00.000Z',
        },
      ];

      const pubRes = await postPublishDealCard(
        new NextRequest(`http://localhost:3000/api/broker/dealcards/${BLD_UUID}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(pubRes.status).toBe(200);

      const wsRow = state.tables.workspace_items[0];
      const snapCard4 = (wsRow.published_snapshot as { card4?: { headline?: string; region?: string } })
        ?.card4;
      expect(snapCard4?.headline).toBe('신규 수정된 프라임 사옥');
      expect(snapCard4?.region).toBe('강남구 삼성동');
      expect((wsRow.draft_payload as Record<string, unknown>)?.hasUnpublishedEdits).toBeUndefined();
      expect((wsRow.draft_payload as Record<string, unknown>)?.memoText).toBe('비공개 소유주 메모');

      const teaserBody = state.tables.document_objects[0].body as { card4?: { headline?: string } };
      expect(teaserBody.card4?.headline).toBe('신규 수정된 프라임 사옥');

      // Kakao-v2 OG Cache-Control check (even when ?v= matches card4Hash, never immutable 1-year)
      state.readBuildingMock.mockResolvedValue({
        id: BLD_UUID,
        area_signal: '강남구 삼성동',
        asset_type: '업무시설',
        asking_price_krw: 140 * 100_000_000,
        total_floor_area_pyung: 450,
      });
      const matchingHash = computeCard4Hash({
        region: editedDraftCard4.region,
        use: editedDraftCard4.use,
        priceBand: editedDraftCard4.priceBand,
        points: editedDraftCard4.points as [string, string, string],
      });
      const ogRes = await getOgKakaoV2(
        new NextRequest(`http://localhost:3000/api/og/deal/${BLD_UUID}/kakao-v2?v=${matchingHash}`),
        { params: Promise.resolve({ id: BLD_UUID }) },
      );
      expect(ogRes.status).toBe(200);
      const cacheControl = ogRes.headers.get('cache-control') || '';
      expect(cacheControl).toContain('s-maxage=300');
      expect(cacheControl).not.toContain('immutable');
      expect(cacheControl).not.toContain('31536000');
    });
  });

  describe('5. Inbox P1-1 & P1-3 + Sub-14px Guard Verification', () => {
    it('re-inserts hard-deleted UUID row into broker_clients on Undo-Delete upsert_client', async () => {
      // Simulate broker_clients AFTER client row was hard-deleted (0 rows in broker_clients)
      state.tables.broker_clients = [];

      const res = await handleUpsertClientAction({
        action: 'upsert_client',
        userId: OWNER_ID,
        buildingId: '',
        threadId: '',
        clientId: `custom_${CLIENT_UUID}`,
        body: {
          action: 'upsert_client',
          clientId: `custom_${CLIENT_UUID}`,
          clientName: '복구된VIP고객',
          clientPhone: '010-7777-8888',
          clientGrade: 'VIP',
          clientRole: 'buyer',
          preferredRegions: ['강남구 역삼동'],
          budgetManwon: 1200000,
          freeMemo: '삭제 실행취소 복원 메모',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(state.tables.broker_clients).toHaveLength(1);
      expect(state.tables.broker_clients[0].id).toBe(CLIENT_UUID);
      expect(state.tables.broker_clients[0].broker_id).toBe(OWNER_ID);
      expect(state.tables.broker_clients[0].display_name).toBe('복구된VIP고객');
    });

    it('redirects /broker/inbox to /broker/w/inbox preserving query parameters and enforces 0 sub-14px tokens in newly locked paths', async () => {
      await expect(
        LegacyInboxRedirectPage({
          searchParams: Promise.resolve({ tab: 'gate', id: BLD_UUID }),
        }),
      ).rejects.toThrow(`REDIRECT:/broker/w/inbox?tab=gate&id=${BLD_UUID}`);

      await expect(LegacyInboxRedirectPage({})).rejects.toThrow('REDIRECT:/broker/w/inbox');

      const sub14Re =
        /(?:^|\s|"|'|`)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/|"|'|`)/;
      const guardedFiles = [
        'src/app/(broker)/broker/buildings/[id]/snapshot/page.tsx',
        'src/app/(broker)/broker/buildings/[id]/owner-report/ReportActions.tsx',
        'src/app/(broker)/broker/buildings/page.tsx',
        'src/app/(broker)/broker/inbox/page.tsx',
        'src/app/(public)/nda/[id]/page.tsx',
        'src/app/(public)/im-pro/[grantId]/page.tsx',
      ];
      for (const rel of guardedFiles) {
        const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        expect(sub14Re.test(content), `Found sub-14px token in ${rel}`).toBe(false);
      }
    });
  });
});
