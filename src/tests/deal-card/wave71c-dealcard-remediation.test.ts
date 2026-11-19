// @vitest-environment node
/**
 * Wave 7.1 — WP-7.1C DealCard P0/P1 Remediation Regression Suite
 *
 * Covers:
 *  1. Standalone `workspace_items.id` UUID ownership resolution across
 *     GET/PATCH/DELETE `/api/broker/deal-card/[id]`,
 *     DELETE `/api/broker/deal-card/[id]/delete`,
 *     POST `/api/broker/dealcards/[id]/publish`,
 *     `createGateRequest()`, and POST `/api/public/gate/submit`
 *     (owner 200/201, cross-tenant 403, missing 404, DB failure honest 500).
 *  2. `/api/broker/deal-card/[id]/personas` (GET/POST/PATCH/DELETE):
 *     unauthenticated 401, cross-tenant 403 (both building & standalone workspace),
 *     missing 404, owner standalone roundtrip 200.
 *  3. OG Draft Leak & Visibility Prevention:
 *     `kakao-v2` never lets draft `document_objects` overwrite `ogGuard.snapshotCard4`;
 *     `kakao-v2`, `kakao`, and `card` block `building_signal_cards` with
 *     `visibility: 'internal_only'` or `status: 'archived'` (404).
 *  4. DB-verified statutory broker profile on publish/save (ignoring spoofed `body.brokerProfile`).
 *  5. Static / UI guards for `dc/[id]/page.tsx` (`broker_profiles` columns & 1200x630 OG metadata)
 *     and daylight + >=14px / >=16px + PIPA `privacyConsent` across UI components.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthGuardResult } from '@/lib/auth-guard';
import { computeCard4Hash } from '@/lib/deal-card/card4-schema';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';

const OWNER_A = '11111111-7100-4111-8111-111111111101';
const OTHER_B = '22222222-7100-4222-8222-222222222202';
const ADMIN_U = '33333333-7100-4333-8333-333333333303';

const WS_STANDALONE_DRAFT_ID = 'aaaa1111-7100-4111-8111-aaaaaaaa1101';
const WS_STANDALONE_PUB_ID = 'aaaa2222-7100-4222-8222-aaaaaaaa2202';
const BLD_OWNED_ID = 'bbbb1111-7100-4111-8111-bbbbbbbb1101';
const MISSING_UUID = '99999999-7100-4999-8999-999999999999';

type TableData = Record<string, Array<Record<string, any>>>;

function createInMemorySupabase(initial: TableData, opts: { failWriteTables?: Set<string> } = {}) {
  const db: TableData = structuredClone(initial);
  const failWriteTables = opts.failWriteTables ?? new Set<string>();

  const ensureTable = (table: string) => {
    if (!db[table]) db[table] = [];
    return db[table];
  };

  const applyFilter = (rows: Array<Record<string, any>>, filters: Array<(r: Record<string, any>) => boolean>) =>
    rows.filter((r) => filters.every((fn) => fn(r)));

  const from = vi.fn((table: string) => {
    const filters: Array<(r: Record<string, any>) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null;
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitCount: number | null = null;
    let wantSingle = false;
    let wantMaybeSingle = false;
    let executed = false;
    let cachedResult: { data: any; error: any } | null = null;

    const run = (): { data: any; error: any } => {
      if (executed && cachedResult) return cachedResult;
      executed = true;
      const rows = ensureTable(table);

      if (mode === 'select') {
        let matched = applyFilter(rows, filters).map((r) => ({ ...r }));
        if (orderCol) {
          const col = orderCol;
          matched.sort((a, b) => {
            const va = String(a[col] ?? '');
            const vb = String(b[col] ?? '');
            return orderAsc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        }
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        if (wantSingle || wantMaybeSingle) {
          cachedResult = { data: matched[0] ?? null, error: null };
        } else {
          cachedResult = { data: matched, error: null };
        }
        return cachedResult;
      }

      if (failWriteTables.has(table)) {
        cachedResult = {
          data: null,
          error: { code: '50000', message: `Simulated DB write failure on ${table}` },
        };
        return cachedResult;
      }

      if (mode === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((item, idx) => {
          const id = item?.id || `gen-${table}-${rows.length + idx + 1}`;
          const rec = {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
            id,
          };
          rows.push(rec);
          return { ...rec };
        });
        cachedResult = {
          data: wantSingle || wantMaybeSingle ? inserted[0] ?? null : inserted,
          error: null,
        };
        return cachedResult;
      }

      if (mode === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const upserted = list.map((item, idx) => {
          const existingIdx = rows.findIndex(
            (r) =>
              (item.id && r.id === item.id) ||
              (item.building_ssot_lite_id &&
                item.broker_id &&
                r.building_ssot_lite_id === item.building_ssot_lite_id &&
                r.broker_id === item.broker_id) ||
              (item.owner_broker_id && item.phone && r.owner_broker_id === item.owner_broker_id && r.phone === item.phone)
          );
          const now = new Date().toISOString();
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item, updated_at: now };
            return { ...rows[existingIdx] };
          }
          const rec = {
            id: item?.id || `ups-${table}-${rows.length + idx + 1}`,
            created_at: now,
            updated_at: now,
            ...item,
          };
          rows.push(rec);
          return { ...rec };
        });
        cachedResult = {
          data: wantSingle || wantMaybeSingle ? upserted[0] ?? null : upserted,
          error: null,
        };
        return cachedResult;
      }

      if (mode === 'update') {
        const matched = applyFilter(rows, filters);
        const updated: Array<Record<string, any>> = [];
        for (const r of matched) {
          Object.assign(r, payload);
          updated.push({ ...r });
        }
        cachedResult = {
          data: wantSingle || wantMaybeSingle ? updated[0] ?? null : updated,
          error: null,
        };
        return cachedResult;
      }

      if (mode === 'delete') {
        const remaining: Array<Record<string, any>> = [];
        const deleted: Array<Record<string, any>> = [];
        for (const r of rows) {
          if (filters.every((fn) => fn(r))) deleted.push(r);
          else remaining.push(r);
        }
        db[table] = remaining;
        cachedResult = {
          data: wantSingle || wantMaybeSingle ? deleted[0] ?? null : deleted,
          error: null,
        };
        return cachedResult;
      }

      return { data: null, error: null };
    };

    const q: any = {
      select: () => q,
      insert: (data: any) => {
        mode = 'insert';
        payload = data;
        return q;
      },
      update: (data: any) => {
        mode = 'update';
        payload = data;
        return q;
      },
      upsert: (data: any) => {
        mode = 'upsert';
        payload = data;
        return q;
      },
      delete: () => {
        mode = 'delete';
        return q;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
        return q;
      },
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => p.trim());
        filters.push((r) =>
          parts.some((p) => {
            const m = p.match(/^([^.]+)\.eq\.(.+)$/);
            if (!m) return false;
            return String(r[m[1]] ?? '') === m[2];
          })
        );
        return q;
      },
      contains: (col: string, obj: Record<string, unknown>) => {
        filters.push((r) => {
          const target = r[col];
          if (!target || typeof target !== 'object') return false;
          return Object.entries(obj).every(([k, v]) => target[k] === v);
        });
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return q;
      },
      limit: (n: number) => {
        limitCount = n;
        return q;
      },
      range: () => q,
      maybeSingle: () => {
        wantMaybeSingle = true;
        return Promise.resolve(run());
      },
      single: () => {
        wantSingle = true;
        return Promise.resolve(run());
      },
      then: (onFulfilled: (v: any) => any, onRejected?: (e: any) => any) =>
        Promise.resolve(run()).then(onFulfilled, onRejected),
    };
    return q;
  });

  return { db, client: { from } };
}

const h = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof createInMemorySupabase>['client'] | null,
  authResult: null as AuthGuardResult | null,
  readBuildingResult: null as Record<string, any> | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.supabase,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => h.authResult),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async () => h.readBuildingResult),
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

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  },
}));

vi.mock('@/domain/analytics/record-event', () => ({
  recordEvent: vi.fn(async () => undefined),
}));

vi.mock('@/domain/identity/party-service', async () => {
  const actual = await vi.importActual<typeof import('@/domain/identity/party-service')>(
    '@/domain/identity/party-service'
  );
  return {
    ...actual,
    findOrCreateParty: vi.fn(async (args: Record<string, unknown>) => ({
      id: '44444444-7100-4444-8444-444444444444',
      ...args,
    })),
    bindRecipientToParty: vi.fn(async () => undefined),
  };
});

vi.mock('@/domain/identity/condition-engine', async () => {
  const actual = await vi.importActual<typeof import('@/domain/identity/condition-engine')>(
    '@/domain/identity/condition-engine'
  );
  return {
    ...actual,
    insertCondition: vi.fn(async () => undefined),
  };
});

vi.mock('@/domain/identity/bind', () => ({
  bindViewerHistory: vi.fn(async () => undefined),
}));

function setActor(userId: string | null, role: 'broker' | 'admin' = 'broker') {
  if (!userId) {
    h.authResult = {
      user: null,
      role: null,
      profile: null,
      error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }) as any,
    };
    return;
  }
  h.authResult = {
    user: { id: userId, email: `${userId}@credeal.kr` },
    role,
    profile: { role, display_name: 'DB검증중개사' },
    error: null,
  };
}

function buildSeedTables(): TableData {
  const pubCard4 = {
    headline: '청담동 코너 우량 근생',
    posture: 'income',
    region: '강남구 청담동',
    use: '근린생활시설',
    area: '연면적 320평',
    priceBand: '140~160억',
    points: ['대로변 코너 각지', '전층 우량 임차인', '안정 임대 수익'],
    provenance: { points: ['broker', 'broker', 'broker'] },
    card4_version: 1,
  };
  const draftCard4 = {
    headline: '초안 미발행 제목',
    posture: 'income',
    region: '강남구 역삼동',
    use: '업무시설',
    area: '연면적 200평',
    priceBand: '90~100억',
    points: ['역세권 도보 2분', '신축급 외관 유지', '법인 사옥 추천'],
    provenance: { points: ['broker', 'broker', 'broker'] },
    card4_version: 1,
  };

  return {
    profiles: [
      {
        id: OWNER_A,
        display_name: '정실제',
        company: '정석공인중개사사무소',
        phone: '02-555-7788',
        photo_url: 'https://cdn.credeal.kr/owner-a.jpg',
        role: 'broker',
      },
      {
        id: OTHER_B,
        display_name: '박타인',
        company: '타인부동산중개법인',
        phone: '02-555-9999',
        photo_url: null,
        role: 'broker',
      },
    ],
    broker_profiles: [
      {
        user_id: OWNER_A,
        slug: 'jung-silje',
        card_name: '정실제 대표공인중개사',
        photo_url: 'https://cdn.credeal.kr/bp-owner-a.jpg',
        deal_specialty: ['강남구', '근린생활시설'],
        license_number: 'LIC-2023-7788',
        office_reg_number: '11680-2023-07788',
        office_address: '서울특별시 강남구 테헤란로 412',
        representative_name: '정실제',
      },
      {
        user_id: OTHER_B,
        slug: 'park-other',
        card_name: '박타인 공인중개사',
        photo_url: null,
        office_reg_number: '11710-2023-09999',
        office_address: '서울특별시 송파구 올림픽로 300',
        representative_name: '박타인',
      },
    ],
    building_ssot_lite: [
      {
        id: BLD_OWNED_ID,
        owner_id: OWNER_A,
        area_signal: '강남구 역삼동',
        asset_type: '업무시설',
        price_band: '120~140억',
        status: 'public_signal_ready',
      },
    ],
    workspace_items: [
      {
        id: WS_STANDALONE_DRAFT_ID,
        owner_id: OWNER_A,
        kind: 'dealcard',
        legacy_id: null,
        building_id: null,
        status: 'draft',
        title: draftCard4.headline,
        address: draftCard4.region,
        price_band: draftCard4.priceBand,
        draft_payload: { card4: draftCard4 },
        published_snapshot: null,
        version: 1,
        deleted_at: null,
        revoked_at: null,
        created_at: '2026-11-17T00:00:00.000Z',
        updated_at: '2026-11-17T00:00:00.000Z',
      },
      {
        id: WS_STANDALONE_PUB_ID,
        owner_id: OWNER_A,
        kind: 'dealcard',
        legacy_id: null,
        building_id: null,
        status: 'sent',
        title: pubCard4.headline,
        address: pubCard4.region,
        price_band: pubCard4.priceBand,
        draft_payload: { card4: pubCard4 },
        published_snapshot: { card4: pubCard4 },
        version: 2,
        deleted_at: null,
        revoked_at: null,
        published_at: '2026-11-17T01:00:00.000Z',
        created_at: '2026-11-17T00:00:00.000Z',
        updated_at: '2026-11-17T01:00:00.000Z',
      },
    ],
    document_objects: [],
    building_signal_cards: [],
    deal_card_personas: [],
    gate_requests: [],
    activity_events: [],
    track_event: [],
    deals: [],
  };
}

describe('Wave 7.1 — WP-7.1C DealCard P0/P1 Remediation', () => {
  beforeEach(() => {
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
    resetWorkspaceRepositoryCacheForTests();
    resetShareLinkTokenStoreForTests();
    h.readBuildingResult = null;
    const mem = createInMemorySupabase(buildSeedTables());
    h.supabase = mem.client;
    setActor(OWNER_A);
  });

  describe('1. Standalone workspace_items.id CRUD, Publish, Honest DB Failure & Gate Resolution', () => {
    it('allows owner GET/PATCH/publish/delete on standalone workspace_items.id and blocks cross-tenant with 403', async () => {
      const { GET, PATCH } = await import('@/app/api/broker/deal-card/[id]/route');
      const { POST: publishPOST } = await import('@/app/api/broker/dealcards/[id]/publish/route');
      const { DELETE: deleteHandler } = await import('@/app/api/broker/deal-card/[id]/delete/route');

      // Cross-tenant GET -> 403
      setActor(OTHER_B);
      const crossGet = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(crossGet.status).toBe(403);

      // Missing UUID GET -> 404
      const missingGet = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${MISSING_UUID}`),
        { params: Promise.resolve({ id: MISSING_UUID }) }
      );
      expect(missingGet.status).toBe(404);

      // Owner GET -> 200
      setActor(OWNER_A);
      const ownGet = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(ownGet.status).toBe(200);
      const ownGetJson = await ownGet.json();
      expect(ownGetJson.id).toBe(WS_STANDALONE_DRAFT_ID);
      expect(ownGetJson.card4.region).toBe('강남구 역삼동');

      // Cross-tenant PATCH -> 403
      setActor(OTHER_B);
      const crossPatch = await PATCH(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            card4: {
              region: '강남구 역삼동',
              use: '업무시설',
              priceBand: '90~100억',
              points: ['탈취 시도', '불법 접근', '차단 대상'],
            },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(crossPatch.status).toBe(403);

      // Owner PATCH -> 200
      setActor(OWNER_A);
      const ownPatch = await PATCH(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            card4: {
              headline: '역삼역 도보 2분 오피스',
              region: '강남구 역삼동',
              use: '업무시설',
              priceBand: '100~120억',
              points: ['역세권 도보 2분', '전층 임차 완료', '신축급 외관 유지'],
            },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(ownPatch.status).toBe(200);
      const ownPatchJson = await ownPatch.json();
      expect(ownPatchJson.card4.priceBand).toBe('100~120억');

      // Cross-tenant publish -> 403
      setActor(OTHER_B);
      const crossPub = await publishPOST(
        new NextRequest(`http://localhost/api/broker/dealcards/${WS_STANDALONE_DRAFT_ID}/publish`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(crossPub.status).toBe(403);

      // Owner publish -> 200
      setActor(OWNER_A);
      const ownPub = await publishPOST(
        new NextRequest(`http://localhost/api/broker/dealcards/${WS_STANDALONE_DRAFT_ID}/publish`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(ownPub.status).toBe(200);
      const ownPubJson = await ownPub.json();
      expect(ownPubJson.ok).toBe(true);
      expect(ownPubJson.status).toBe('PUBLISHED');

      // Cross-tenant delete -> 403
      setActor(OTHER_B);
      const crossDel = await deleteHandler(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/delete`, {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(crossDel.status).toBe(403);

      // Owner delete -> 200 & subsequent GET -> 404
      setActor(OWNER_A);
      const ownDel = await deleteHandler(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/delete`, {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(ownDel.status).toBe(200);

      const postDelGet = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(postDelGet.status).toBe(404);
    });

    it('publish returns honest 500 when workspace_items or building_ssot_lite DB write fails', async () => {
      const memFail = createInMemorySupabase(buildSeedTables(), {
        failWriteTables: new Set(['workspace_items']),
      });
      h.supabase = memFail.client;
      setActor(OWNER_A);

      const { POST: publishPOST } = await import('@/app/api/broker/dealcards/[id]/publish/route');
      const res = await publishPOST(
        new NextRequest(`http://localhost/api/broker/dealcards/${WS_STANDALONE_DRAFT_ID}/publish`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it('createGateRequest & POST /api/public/gate/submit resolve published standalone workspace_items.id and reject drafts/missing', async () => {
      const { createGateRequest } = await import('@/domain/gate/gate-request');
      const { POST: publicGateSubmitPOST } = await import('@/app/api/public/gate/submit/route');

      // Draft standalone workspace item -> rejected by createGateRequest
      await expect(
        createGateRequest(
          {
            buildingId: WS_STANDALONE_DRAFT_ID,
            requestedLevel: 'G1',
            requestedFields: ['broker_contact_request'],
          },
          null
        )
      ).rejects.toThrow();

      // Published standalone workspace item -> succeeds
      const gateRes = await createGateRequest(
        {
          buildingId: WS_STANDALONE_PUB_ID,
          requestedLevel: 'G1',
          requestedFields: ['broker_contact_request'],
          reason: '사옥 검토',
        },
        null
      );
      expect(gateRes.status).toBe('submitted');
      expect(gateRes.gateRequestId).toMatch(/^gr-/);

      // Public G2 submit on draft -> 404
      const draftSubmit = await publicGateSubmitPOST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          body: JSON.stringify({
            dealId: WS_STANDALONE_DRAFT_ID,
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '전액 자기자본',
              entityType: '법인',
              name: '김매수',
              phone: '010-1234-5678',
              consent: true,
            },
          }),
        })
      );
      expect(draftSubmit.status).toBe(404);

      // Public G2 submit on published standalone workspace_items.id -> 201 and bound to real OWNER_A (not spoofed brokerId)
      const { findOrCreateParty } = await import('@/domain/identity/party-service');
      const okSubmit = await publicGateSubmitPOST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          body: JSON.stringify({
            dealId: WS_STANDALONE_PUB_ID,
            brokerId: OTHER_B, // Spoofed brokerId must be ignored
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '전액 자기자본',
              entityType: '법인',
              name: '김매수',
              phone: '010-1234-5678',
              consent: true,
            },
          }),
        })
      );
      expect(okSubmit.status).toBe(201);
      const okJson = await okSubmit.json();
      expect(okJson.ok).toBe(true);
      expect(okJson.accessGranted).toBe(true);
      expect(findOrCreateParty).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerBrokerId: OWNER_A,
          tenantId: OWNER_A,
        })
      );
    });
  });

  describe('2. /api/broker/deal-card/[id]/personas AuthZ & Cross-Tenant 403 Blocking', () => {
    it('blocks unauthenticated (401), cross-tenant building (403), cross-tenant standalone workspace (403), and missing UUID (404)', async () => {
      const { GET, POST, PATCH, DELETE } = await import(
        '@/app/api/broker/deal-card/[id]/personas/route'
      );

      // Unauthenticated -> 401
      setActor(null);
      const unauthRes = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}/personas`),
        { params: Promise.resolve({ id: BLD_OWNED_ID }) }
      );
      expect(unauthRes.status).toBe(401);

      // Cross-tenant on building_ssot_lite UUID -> 403 across GET/POST/PATCH/DELETE
      setActor(OTHER_B);
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}/personas`),
            { params: Promise.resolve({ id: BLD_OWNED_ID }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await POST(
            new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}/personas`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: '타인시도', type: 'INCOME' }),
            }),
            { params: Promise.resolve({ id: BLD_OWNED_ID }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await PATCH(
            new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}/personas`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: '타인수정', type: 'INCOME' }),
            }),
            { params: Promise.resolve({ id: BLD_OWNED_ID }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await DELETE(
            new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}/personas`, {
              method: 'DELETE',
            }),
            { params: Promise.resolve({ id: BLD_OWNED_ID }) }
          )
        ).status
      ).toBe(403);

      // Cross-tenant on standalone workspace_items.id UUID -> 403
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas`),
            { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await POST(
            new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: '타인시도', type: 'INCOME' }),
            }),
            { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
          )
        ).status
      ).toBe(403);

      // Missing UUID -> 404
      setActor(OWNER_A);
      expect(
        (
          await GET(
            new NextRequest(`http://localhost/api/broker/deal-card/${MISSING_UUID}/personas`),
            { params: Promise.resolve({ id: MISSING_UUID }) }
          )
        ).status
      ).toBe(404);

      // Owner roundtrip on standalone workspace_items.id -> 200
      const postOk = await POST(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personasData: { personas: [{ id: 'p-1', name: '안정수익 법인', type: 'INCOME' }] },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(postOk.status).toBe(200);

      const getOk = await GET(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas`),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(getOk.status).toBe(200);
      const getOkJson = await getOk.json();
      expect(getOkJson.data.personas[0].name).toBe('안정수익 법인');
    });
  });

  describe('3. OG Draft Leak Prevention & internal_only/archived Signal Card Blocking', () => {
    it('kakao-v2 never lets draft document_objects overwrite published ogGuard.snapshotCard4', async () => {
      const seeds = buildSeedTables();
      const pubCard4 = seeds.workspace_items[1].published_snapshot.card4;
      const expectedPubHash = computeCard4Hash(pubCard4);

      // Inject a draft document_objects row with higher card4_version on the same ID
      seeds.document_objects.push({
        id: 'doc-draft-leak-1',
        building_id: WS_STANDALONE_PUB_ID,
        document_type: 'blind_teaser',
        status: 'draft',
        body: {
          card4: {
            region: '초안유출권역',
            use: '위험노출용도',
            priceBand: '999~1,100억',
            points: ['초안포인트1', '초안포인트2', '초안포인트3'],
            card4_version: 99,
          },
        },
        created_at: '2026-11-17T05:00:00.000Z',
      });

      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;

      const { GET: kakaoV2GET } = await import('@/app/api/og/deal/[id]/kakao-v2/route');
      const res = await kakaoV2GET(
        new NextRequest(`http://localhost/api/og/deal/${WS_STANDALONE_PUB_ID}/kakao-v2`),
        { params: Promise.resolve({ id: WS_STANDALONE_PUB_ID }) }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('x-card4-hash')).toBe(expectedPubHash);
    });

    it('blocks building_signal_cards with visibility=internal_only or status=archived across kakao-v2, kakao, and card routes (404)', async () => {
      const { GET: kakaoV2GET } = await import('@/app/api/og/deal/[id]/kakao-v2/route');
      const { GET: kakaoGET } = await import('@/app/api/og/deal/[id]/kakao/route');
      const { GET: cardGET } = await import('@/app/api/og/deal/[id]/card/route');

      for (const badSignal of [
        { visibility: 'internal_only', status: 'published' },
        { visibility: 'public_blind', status: 'archived' },
      ]) {
        const seeds = buildSeedTables();
        seeds.building_signal_cards.push({
          id: 'sig-1',
          building_id: BLD_OWNED_ID,
          area_signal: '강남구 역삼동',
          asset_type: '업무시설',
          price_band: '120~140억',
          title: '비공개 테스트',
          ...badSignal,
          created_at: '2026-11-17T02:00:00.000Z',
        });
        h.supabase = createInMemorySupabase(seeds).client;
        h.readBuildingResult = {
          id: BLD_OWNED_ID,
          area_signal: '강남구 역삼동',
          asset_type: '업무시설',
          price_band: '120~140억',
          status: 'public_signal_ready',
        };

        const r1 = await kakaoV2GET(
          new NextRequest(`http://localhost/api/og/deal/${BLD_OWNED_ID}/kakao-v2`),
          { params: Promise.resolve({ id: BLD_OWNED_ID }) }
        );
        const r2 = await kakaoGET(
          new NextRequest(`http://localhost/api/og/deal/${BLD_OWNED_ID}/kakao`),
          { params: Promise.resolve({ id: BLD_OWNED_ID }) }
        );
        const r3 = await cardGET(
          new NextRequest(`http://localhost/api/og/deal/${BLD_OWNED_ID}/card`),
          { params: Promise.resolve({ id: BLD_OWNED_ID }) }
        );

        expect(r1.status).toBe(404);
        expect(r2.status).toBe(404);
        expect(r3.status).toBe(404);
      }
    });
  });

  describe('4. DB-Verified Broker Statutory Profile (Spoofed body.brokerProfile Ignored)', () => {
    it('persists verified DB broker_profiles + profiles fields on publish/save and ignores spoofed request body.brokerProfile', async () => {
      const seeds = buildSeedTables();
      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;
      setActor(OWNER_A);

      const { PATCH } = await import('@/app/api/broker/deal-card/[id]/route');
      const { POST: publishPOST } = await import('@/app/api/broker/dealcards/[id]/publish/route');

      // 1) PATCH with status='sent' and spoofed brokerProfile
      const patchRes = await PATCH(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'sent',
            brokerProfile: {
              representativeName: '위조대표명',
              officeRegNumber: '99999-9999-99999',
              officeAddress: '위조주소 1번지',
              company: '위조중개법인',
              phone: '010-0000-0000',
            },
            card4: {
              region: '강남구 역삼동',
              use: '업무시설',
              priceBand: '100~120억',
              points: ['역세권 도보 2분', '전층 임차 완료', '신축급 외관 유지'],
            },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(patchRes.status).toBe(200);

      const rowAfterPatch = mem.db.workspace_items.find((r) => r.id === WS_STANDALONE_DRAFT_ID)!;
      const snapProfile1 = rowAfterPatch.published_snapshot?.brokerProfile;
      expect(snapProfile1).toBeDefined();
      expect(snapProfile1.representative_name).toBe('정실제');
      expect(snapProfile1.office_reg_number).toBe('11680-2023-07788');
      expect(snapProfile1.office_address).toBe('서울특별시 강남구 테헤란로 412');
      expect(snapProfile1.company).toBe('정석공인중개사사무소');
      expect(snapProfile1.avatar_url).toBe('https://cdn.credeal.kr/bp-owner-a.jpg');
      expect(snapProfile1.representative_name).not.toBe('위조대표명');
      expect(snapProfile1.office_reg_number).not.toBe('99999-9999-99999');

      // 2) Publish endpoint with spoofed brokerProfile
      const pubRes = await publishPOST(
        new NextRequest(`http://localhost/api/broker/dealcards/${WS_STANDALONE_PUB_ID}/publish`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brokerProfile: {
              representativeName: '위조발행자',
              officeRegNumber: '88888-8888-88888',
            },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_PUB_ID }) }
      );
      expect(pubRes.status).toBe(200);

      const rowAfterPub = mem.db.workspace_items.find((r) => r.id === WS_STANDALONE_PUB_ID)!;
      const snapProfile2 = rowAfterPub.published_snapshot?.brokerProfile;
      expect(snapProfile2).toBeDefined();
      expect(snapProfile2.representative_name).toBe('정실제');
      expect(snapProfile2.office_reg_number).toBe('11680-2023-07788');
      expect(snapProfile2.card_name).toBe('정실제 대표공인중개사');
      expect(snapProfile2.representative_name).not.toBe('위조발행자');
    });
  });

  describe('5. Public dc/[id]/page.tsx & UI Typography / Daylight / PIPA Guards', () => {
    it('dc/[id]/page.tsx uses valid broker_profiles columns, 1200x630 OG dimensions, and removes dead teaser imports', () => {
      const dcPage = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(public)/dc/[id]/page.tsx'),
        'utf8'
      );
      expect(dcPage).toContain('card_name');
      expect(dcPage).toContain('photo_url');
      expect(dcPage).toContain('width: 1200');
      expect(dcPage).toContain('height: 630');
      expect(dcPage).not.toContain('TeaserHeroHeader');
      expect(dcPage).not.toContain('PublicPolicyBlock');
      expect(dcPage).not.toMatch(/\.from\(["']broker_profiles["']\)\s*\.select\([^)]*\bname\b/);
      expect(dcPage).not.toMatch(/\.from\(["']broker_profiles["']\)\s*\.select\([^)]*\bavatar_url\b/);
    });

    it('enforces >=14px typography, daylight chrome, no "중개인", and PIPA privacyConsent across UI files', () => {
      const uiFiles = [
        'src/components/broker/deal-card/DealCardTabs.tsx',
        'src/app/(broker)/broker/deal-card/[id]/error.tsx',
        'src/app/(public)/dc/[id]/GateRequestForm.tsx',
        'src/components/broker/GateRequestForm.tsx',
        'src/components/gate/gate-request-form.tsx',
      ];
      const sub14Re = /\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/g;

      for (const rel of uiFiles) {
        const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        expect(src.match(sub14Re) || [], `${rel} contains sub-14px classes`).toEqual([]);
        expect(src, `${rel} contains banned dark chrome bg-[#0b0f19]`).not.toContain('bg-[#0b0f19]');
        expect(src, `${rel} uses non-statutory term 중개인`).not.toContain('중개인');
      }

      for (const gateForm of [
        'src/app/(public)/dc/[id]/GateRequestForm.tsx',
        'src/components/broker/GateRequestForm.tsx',
        'src/components/gate/gate-request-form.tsx',
      ]) {
        const src = fs.readFileSync(path.resolve(process.cwd(), gateForm), 'utf8');
        expect(src).toContain('privacyConsent');
        expect(src).toContain('type="checkbox"');
      }
    });
  });

  describe('6. Wave 7.2 — P0/P1 DealCard Hardening Regressions', () => {
    it('strips memoText/pairedMemoId/personas from published_snapshot on publish, persona upsert, persona delete, and teaser/publish while preserving draftPayload', async () => {
      const seeds = buildSeedTables();
      seeds.workspace_items[0].draft_payload = {
        ...seeds.workspace_items[0].draft_payload,
        memoText: '역삼동 737-1 김사장님 010-9999-8888 급매 메모',
        pairedMemoId: 'memo-secret-1',
        personas: {
          personas: [
            { id: 'p-1', name: '안정수익 법인', type: 'INCOME' },
            { id: 'p-2', name: '밸류애드 투자자', type: 'VALUE_ADD' },
          ],
        },
      };
      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;
      setActor(OWNER_A);

      const { POST: publishPOST } = await import('@/app/api/broker/dealcards/[id]/publish/route');
      const { POST: personasPOST } = await import('@/app/api/broker/deal-card/[id]/personas/route');
      const { DELETE: personaItemDELETE } = await import(
        '@/app/api/broker/deal-card/[id]/personas/[personaId]/route'
      );
      const { POST: teaserPublishPOST } = await import(
        '@/app/api/broker/deal/[id]/teaser/publish/route'
      );

      // 1) Publish standalone draft -> published_snapshot sanitized, draft_payload intact
      const pubRes = await publishPOST(
        new NextRequest(`http://localhost/api/broker/dealcards/${WS_STANDALONE_DRAFT_ID}/publish`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(pubRes.status).toBe(200);
      const itemAfterPub = mem.db.workspace_items.find((r) => r.id === WS_STANDALONE_DRAFT_ID)!;
      expect(itemAfterPub.published_snapshot).toBeTruthy();
      expect(itemAfterPub.published_snapshot.card4).toBeDefined();
      expect(itemAfterPub.published_snapshot.memoText).toBeUndefined();
      expect(itemAfterPub.published_snapshot.pairedMemoId).toBeUndefined();
      expect(itemAfterPub.published_snapshot.personas).toBeUndefined();
      expect(itemAfterPub.draft_payload.memoText).toContain('737-1');

      // 2) Update personas on published standalone DealCard -> published_snapshot never overwritten with draftPayload
      const personaUpsertRes = await personasPOST(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personasData: {
              personas: [
                { id: 'p-1', name: '안정수익 법인', type: 'INCOME' },
                { id: 'p-2', name: '밸류애드 투자자', type: 'VALUE_ADD' },
              ],
            },
          }),
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID }) }
      );
      expect(personaUpsertRes.status).toBe(200);
      const itemAfterPersona = mem.db.workspace_items.find((r) => r.id === WS_STANDALONE_DRAFT_ID)!;
      expect(itemAfterPersona.published_snapshot.memoText).toBeUndefined();
      expect(itemAfterPersona.published_snapshot.personas).toBeUndefined();
      expect(itemAfterPersona.published_snapshot.brokerProfile).toBeDefined();

      // 3) DELETE /personas/[personaId] blocks cross-tenant (403) and allows admin bypass + standalone update
      setActor(OTHER_B);
      const crossDel = await personaItemDELETE(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas/p-1`, {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID, personaId: 'p-1' }) }
      );
      expect(crossDel.status).toBe(403);

      setActor(ADMIN_U, 'admin');
      const adminDel = await personaItemDELETE(
        new NextRequest(`http://localhost/api/broker/deal-card/${WS_STANDALONE_DRAFT_ID}/personas/p-1`, {
          method: 'DELETE',
        }),
        { params: Promise.resolve({ id: WS_STANDALONE_DRAFT_ID, personaId: 'p-1' }) }
      );
      expect(adminDel.status).toBe(200);
      const itemAfterDel = mem.db.workspace_items.find((r) => r.id === WS_STANDALONE_DRAFT_ID)!;
      expect(itemAfterDel.draft_payload.personas.personas).toHaveLength(1);
      expect(itemAfterDel.draft_payload.personas.personas[0].id).toBe('p-2');
      expect(itemAfterDel.published_snapshot.personas).toBeUndefined();
      expect(itemAfterDel.published_snapshot.memoText).toBeUndefined();

      // 4) teaser/publish returns 404 when neither document_objects/building_signal_cards nor workspace_items exists
      setActor(OWNER_A);
      const missingTeaserRes = await teaserPublishPOST(
        new NextRequest('http://localhost/api/broker/deal/nonexistent-legacy-id/teaser/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'nonexistent-legacy-id' }) }
      );
      expect(missingTeaserRes.status).toBe(404);
    });

    it('POST /api/public/gate/submit rejects missing dealId (400) and never uses "default" UUID fallback', async () => {
      const { POST: publicGateSubmitPOST } = await import('@/app/api/public/gate/submit/route');
      const { findOrCreateParty } = await import('@/domain/identity/party-service');
      vi.mocked(findOrCreateParty).mockClear();

      // 1) Missing dealId with spoofed client brokerId/tenantId -> 400
      const noDealRes = await publicGateSubmitPOST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          body: JSON.stringify({
            brokerId: OTHER_B,
            tenantId: OTHER_B,
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '전액 자기자본',
              entityType: '법인',
              name: '김매수',
              phone: '010-1234-5678',
              consent: true,
            },
          }),
        })
      );
      expect(noDealRes.status).toBe(400);
      expect(findOrCreateParty).not.toHaveBeenCalled();

      // 2) Active deal with non-UUID broker ownerId -> 422 (no 'default' UUID crash)
      const seeds = buildSeedTables();
      seeds.workspace_items.push({
        id: 'aaaa3333-7100-4333-8333-aaaaaaaa3303',
        owner_id: 'non-uuid-broker-owner',
        kind: 'dealcard',
        legacy_id: 'legacy-nonuuid-owner-card',
        building_id: null,
        status: 'published',
        title: '테스트 딜카드',
        address: '강남구 역삼동',
        price_band: '100~120억',
        draft_payload: {},
        published_snapshot: { card4: { region: '강남구 역삼동', use: '업무시설', priceBand: '100~120억', points: ['A', 'B', 'C'] } },
        version: 1,
        deleted_at: null,
        revoked_at: null,
        created_at: '2026-11-17T00:00:00.000Z',
        updated_at: '2026-11-17T00:00:00.000Z',
      });
      h.supabase = createInMemorySupabase(seeds).client;

      const badOwnerRes = await publicGateSubmitPOST(
        new NextRequest('http://localhost/api/public/gate/submit', {
          method: 'POST',
          body: JSON.stringify({
            dealId: 'legacy-nonuuid-owner-card',
            formData: {
              budgetBand: '100~200억',
              purpose: '임대수익',
              financing: '전액 자기자본',
              entityType: '법인',
              name: '김매수',
              phone: '010-1234-5678',
              consent: true,
            },
          }),
        })
      );
      expect(badOwnerRes.status).toBe(422);
      expect(findOrCreateParty).not.toHaveBeenCalled();
    });

    it('getLatestCondition ranks confidence high > medium > low instead of alphabetical order', async () => {
      const seeds = buildSeedTables();
      const partyId = '55555555-7100-4555-8555-555555555501';
      seeds.buyer_condition = [
        {
          id: 'cond-medium-newest',
          party_id: partyId,
          source: 'slider',
          confidence: 'medium',
          budget_band: '50_100',
          observed_at: '2026-11-17T12:00:00.000Z',
        },
        {
          id: 'cond-low',
          party_id: partyId,
          source: 'broker_note',
          confidence: 'low',
          budget_band: 'under_50',
          observed_at: '2026-11-17T11:00:00.000Z',
        },
        {
          id: 'cond-high-older',
          party_id: partyId,
          source: 'gate_form',
          confidence: 'high',
          budget_band: '100_200',
          observed_at: '2026-11-17T10:00:00.000Z',
        },
      ];
      h.supabase = createInMemorySupabase(seeds).client;

      const { getLatestCondition } = await import('@/domain/identity/condition-engine');
      const latest = await getLatestCondition(partyId);
      expect(latest).not.toBeNull();
      expect(latest!.confidence).toBe('high');
      expect(latest!.id).toBe('cond-high-older');
      expect(latest!.budgetBand).toBe('100_200');
    });

    it('blocks draft document_objects across /api/og/deal/[id] and /api/og/deal/[id]/kakao (404)', async () => {
      const DRAFT_DOC_ID = 'dddd1111-7100-4111-8111-dddddddd1101';
      const seeds = buildSeedTables();
      seeds.document_objects.push({
        id: DRAFT_DOC_ID,
        building_id: BLD_OWNED_ID,
        document_type: 'blind_teaser',
        status: 'draft',
        visibility: 'public_blind',
        body: {
          ogTitle: '비공개초안제목',
          kakaoOgTitle: '비공개카카오초안',
          card4: {
            headline: '비공개초안헤드라인',
            region: '강남구 역삼동',
            use: '업무시설',
            priceBand: '120~140억',
            points: ['초안1', '초안2', '초안3'],
          },
        },
        created_at: '2026-11-17T03:00:00.000Z',
      });
      h.supabase = createInMemorySupabase(seeds).client;
      h.readBuildingResult = {
        id: BLD_OWNED_ID,
        area_signal: '강남구 역삼동',
        asset_type: '업무시설',
        price_band: '120~140억',
        status: 'public_signal_ready',
      };

      const { GET: ogDealGET } = await import('@/app/api/og/deal/[id]/route');
      const { GET: ogKakaoGET } = await import('@/app/api/og/deal/[id]/kakao/route');

      const rBld = await ogDealGET(
        new NextRequest(`http://localhost/api/og/deal/${BLD_OWNED_ID}`),
        { params: Promise.resolve({ id: BLD_OWNED_ID }) }
      );
      expect(rBld.status).toBe(404);

      const rDirectDoc = await ogDealGET(
        new NextRequest(`http://localhost/api/og/deal/${DRAFT_DOC_ID}`),
        { params: Promise.resolve({ id: DRAFT_DOC_ID }) }
      );
      expect(rDirectDoc.status).toBe(404);

      const rKakao = await ogKakaoGET(
        new NextRequest(`http://localhost/api/og/deal/${BLD_OWNED_ID}/kakao`),
        { params: Promise.resolve({ id: BLD_OWNED_ID }) }
      );
      expect(rKakao.status).toBe(404);
    });

    it('floors bandPriceDisplay single mode without upper-bias leak and strips PII in /api/public/teaser/event without privacyConsent', async () => {
      const { bandPriceDisplay } = await import('@/domain/ontology/price-banding');
      expect(bandPriceDisplay(950_000, 'single')).toBe('90억대');
      expect(bandPriceDisplay(950_000, 'single')).not.toBe('100억대');
      expect(bandPriceDisplay(9500000000, 'single')).not.toBe('100억대');
      expect(bandPriceDisplay(35_000, 'single')).toBe('1억대');
      expect(bandPriceDisplay(2_000_0000, 'range')).toBe('2,000~2,200억');

      const seeds = buildSeedTables();
      seeds.teaser_events = [];
      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;

      const { POST: teaserEventPOST } = await import('@/app/api/public/teaser/event/route');

      // Without privacyConsent=true -> raw PII keys stripped
      const noConsentRes = await teaserEventPOST(
        new NextRequest('http://localhost/api/public/teaser/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            buildingId: BLD_OWNED_ID,
            eventType: 'intent.pro_im_request',
            eventData: {
              name: '홍길동',
              phone: '010-1234-5678',
              email: 'hong@test.kr',
              company: '비밀법인',
              requester_name: '홍길동',
              requester_phone: '010-1234-5678',
              section: 'hero',
            },
          }),
        })
      );
      expect(noConsentRes.status).toBe(200);
      expect(mem.db.teaser_events[0].event_data).toEqual({ section: 'hero' });
      expect(mem.db.activity_events[0].metadata.name).toBeUndefined();
      expect(mem.db.activity_events[0].metadata.phone).toBeUndefined();
      expect(mem.db.activity_events[0].metadata.email).toBeUndefined();
      expect(mem.db.activity_events[0].metadata.company).toBeUndefined();
      expect(mem.db.activity_events[0].metadata.requester_name).toBeUndefined();
      expect(mem.db.activity_events[0].metadata.requester_phone).toBeUndefined();

      // Modal scroll & validation static checks
      const gateModalSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/teaser/ContactGateModal.tsx'),
        'utf8'
      );
      expect(gateModalSrc).toContain('max-h-[90dvh] overflow-y-auto');
      expect(gateModalSrc).not.toContain('!gateOk && !eventOk');

      const preSendSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/broker/deal-card/PreSendConfirmationSheet.tsx'),
        'utf8'
      );
      expect(preSendSrc).toContain('max-h-[90dvh] overflow-y-auto');

      const signalEditorSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/broker/deal-card/BuildingSignalEditor.tsx'),
        'utf8'
      );
      expect(signalEditorSrc).toContain('validateBlindPriceBand');
      expect(signalEditorSrc).toContain('asset_type');
    });

    it('validates extended PATCH blind-guard fields, deleteParty PIPA audit trail, and compactRentClause without decimal 억', async () => {
      const seeds = buildSeedTables();
      const PARTY_DEL_UUID = '66666666-7100-4666-8666-666666666601';
      seeds.party = [
        {
          id: PARTY_DEL_UUID,
          tenant_id: OWNER_A,
          owner_broker_id: OWNER_A,
          name: '삭제요청자',
          phone_e164: '+821011112222',
        },
      ];
      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;
      setActor(OWNER_A);

      // 1) PATCH extended blind-guard fields rejected with 422
      const { PATCH } = await import('@/app/api/broker/deal-card/[id]/route');
      for (const badBody of [
        { cautionPoints: ['역삼동 123-4번지 확인 필요'] },
        { structureChips: ['호산당빌딩'] },
        { vacancyLabel: '스타벅스 공실 없음' },
        { curiosityHook: '테헤란로 152 코너 매물' },
        { ssotUpdate: { current_use_signal: '호산당빌딩 사옥' } },
        { ssotUpdate: { asset_type: '역삼동 123-4 근생' } },
      ]) {
        const res = await PATCH(
          new NextRequest(`http://localhost/api/broker/deal-card/${BLD_OWNED_ID}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(badBody),
          }),
          { params: Promise.resolve({ id: BLD_OWNED_ID }) }
        );
        expect(res.status).toBe(422);
      }

      // 2) deleteParty deletes party and records both track_event + activity_events PIPA erasure audit
      const { deleteParty } = await import('@/domain/identity/party-service');
      await deleteParty(PARTY_DEL_UUID);
      expect(mem.db.party.some((p) => p.id === PARTY_DEL_UUID)).toBe(false);
      expect(mem.db.track_event.some((e) => e.kind === 'party.deleted')).toBe(true);
      expect(
        mem.db.activity_events.some(
          (e) => e.event_type === 'party_pipa_erased' && e.entity_id === PARTY_DEL_UUID
        )
      ).toBe(true);

      // 3) parseMemoIntoCard4 never emits decimal 억 in compactRentClause
      const { parseMemoIntoCard4 } = await import('@/lib/deal-card/memo-pairing');
      const card = parseMemoIntoCard4(
        '강남구 역삼동 근생빌딩 매매가 95억, 보증금 2억7,950만 월세 809만 임대수익'
      );
      expect(card.points.join(' ')).not.toMatch(/\d+\.\d+억/);
    });
  });
});
