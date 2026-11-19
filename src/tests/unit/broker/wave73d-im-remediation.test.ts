import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeContentHash } from '@/domain/building/im-core/hashes';
import { checkRateLimit, clearRateLimitBuckets } from '@/lib/rate-limiter';
import type { WorkspaceItemRecord } from '@/lib/workspace/workspace-repository';

const mocks = vi.hoisted(() => ({
  requireBroker: vi.fn(),
  createServiceClient: vi.fn(),
  markAsGoldenIM: vi.fn(),
  getWorkspaceItemByAnyId: vi.fn(),
  upsertWorkspaceItem: vi.fn(),
  getPublicWorkspaceProjection: vi.fn(),
  getServerViewer: vi.fn(),
  verifyShareLinkToken: vi.fn(),
  isBuildingShareLinkRevoked: vi.fn(),
  isBuildingShareLinkRevokedAsync: vi.fn(),
  fetchIMData: vi.fn(),
  resolveOrSynthesizeQuickImRecord: vi.fn(),
  saveQuickImRecord: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mocks.requireBroker(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mocks.createServiceClient(),
}));

vi.mock('@/domain/building/mobile-im/golden-im-manager', () => ({
  markAsGoldenIM: (...args: unknown[]) => mocks.markAsGoldenIM(...args),
}));

vi.mock('@/lib/workspace/workspace-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/workspace-repository')>();
  return {
    ...actual,
    getWorkspaceItemByAnyId: (...args: unknown[]) => mocks.getWorkspaceItemByAnyId(...args),
    upsertWorkspaceItem: (...args: unknown[]) => mocks.upsertWorkspaceItem(...args),
    getPublicWorkspaceProjection: (...args: unknown[]) =>
      mocks.getPublicWorkspaceProjection(...args),
  };
});

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: () => mocks.getServerViewer(),
}));

vi.mock('@/lib/security/share-link-tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/share-link-tokens')>();
  return {
    ...actual,
    verifyShareLinkToken: (...args: unknown[]) => mocks.verifyShareLinkToken(...args),
    isBuildingShareLinkRevoked: (...args: unknown[]) =>
      mocks.isBuildingShareLinkRevoked(...args),
    isBuildingShareLinkRevokedAsync: (...args: unknown[]) =>
      mocks.isBuildingShareLinkRevokedAsync(...args),
  };
});

vi.mock('@/app/(public)/im-lite/[buildingId]/fetch-im-data', () => ({
  fetchIMData: (...args: unknown[]) => mocks.fetchIMData(...args),
}));

vi.mock('@/lib/im-lite/quick-generate-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/im-lite/quick-generate-store')>();
  return {
    ...actual,
    resolveOrSynthesizeQuickImRecord: (...args: unknown[]) =>
      mocks.resolveOrSynthesizeQuickImRecord(...args),
    saveQuickImRecord: (...args: unknown[]) => mocks.saveQuickImRecord(...args),
  };
});

import { POST as approvePost } from '@/app/api/broker/im-lite/[id]/approve/route';
import { POST as approveOverridePost } from '@/app/api/broker/im-lite/[id]/approve-override/route';
import { POST as quickGeneratePost } from '@/app/api/broker/im-lite/quick-generate/route';
import { GET as publicImGet } from '@/app/api/public/im-lite/[buildingId]/route';
import { GET as publicMapStaticGet } from '@/app/api/public/map/static/route';
import { GET as publicImExportGet } from '@/app/api/public/im-lite/[buildingId]/export/route';

interface DbErrorShape {
  code?: string;
  message?: string;
}

interface DbQueryResult {
  data: unknown;
  error: DbErrorShape | null;
}

interface QueryState {
  table: string;
  operation: 'select' | 'update' | 'insert' | 'upsert';
  selectCols: string;
  filters: Record<string, unknown>;
  orExpr: string | null;
  payload: unknown;
  terminal: 'many' | 'single' | 'maybeSingle';
}

interface RecordedWrite {
  table: string;
  operation: 'update' | 'insert' | 'upsert';
  payload: unknown;
  filters: Record<string, unknown>;
}

function createMockSupabase(handler: (q: QueryState) => DbQueryResult | Promise<DbQueryResult>) {
  const writes: RecordedWrite[] = [];

  const from = (table: string) => {
    const state: QueryState = {
      table,
      operation: 'select',
      selectCols: '*',
      filters: {},
      orExpr: null,
      payload: null,
      terminal: 'many',
    };

    const execute = (terminal: QueryState['terminal']): Promise<DbQueryResult> => {
      state.terminal = terminal;
      if (state.operation !== 'select') {
        writes.push({
          table: state.table,
          operation: state.operation,
          payload: state.payload,
          filters: { ...state.filters },
        });
      }
      return Promise.resolve().then(() => handler({ ...state, filters: { ...state.filters } }));
    };

    const builder = {
      select(cols = '*') {
        state.selectCols = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        state.filters[col] = vals;
        return builder;
      },
      or(expr: string) {
        state.orExpr = expr;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.operation = 'update';
        state.payload = payload;
        return builder;
      },
      insert(payload: unknown) {
        state.operation = 'insert';
        state.payload = payload;
        return builder;
      },
      upsert(payload: unknown) {
        state.operation = 'upsert';
        state.payload = payload;
        return builder;
      },
      maybeSingle() {
        return execute('maybeSingle');
      },
      single() {
        return execute('single');
      },
      then<TResult1 = DbQueryResult, TResult2 = never>(
        onfulfilled?: ((value: DbQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return execute('many').then(onfulfilled, onrejected);
      },
    };

    return builder;
  };

  return {
    client: { from },
    writes,
  };
}

const BROKER_ID = '11111111-1111-4111-8111-111111111111';
const BUILDING_ID = '22222222-2222-4222-8222-222222222222';
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const GATE_UPDATED_AT = '2026-11-18T06:00:00.000Z';

function buildValidApproveBody(): Record<string, unknown> {
  return {
    releaseTier: 'fact_om',
    im_type: 'mobile_im_lite',
    buildingName: '역삼 프라임 타워',
    address: '서울특별시 강남구 역삼동 823-10',
    askingPriceManwon: 1_200_000,
    gfaSqm: 1_650,
    landAreaSqm: 420,
    zoning: '일반상업지역',
    floorsAbove: 7,
    floorsBelow: 2,
    completionDate: '2019-06-15',
    privateMemo: '매도인 급매 내부 메모 — 비공개',
    ownerPhone: '010-9999-8888',
    rent_roll: [{ floor: '2F', tenant: '테크코퍼레이션', monthly_rent_manwon: 1_800 }],
    ssot_summary: {
      investment_posture: 'income',
      address: '서울특별시 강남구 역삼동 823-10',
      asking_price: 12_000_000_000,
      asking_price_manwon: 1_200_000,
      total_gross_area_sqm: 1_650,
      land_area_sqm: 420,
      gross_yield: 4.8,
      zoning: '일반상업지역',
      floors_above: 7,
      completion_date: '2019-06-15',
    },
    sections: [
      {
        sectionId: '01_overview',
        title: '물건 개요',
        content: '역삼역 도보 4분 핵심 입지 오피스 자산입니다.',
      },
    ],
  };
}

function buildCompleteStatutoryRows() {
  return {
    profile: {
      display_name: '박준호',
      company: '강남프라임공인중개사사무소',
      phone: '02-555-7890',
    },
    brokerProfile: {
      office_address: '서울특별시 강남구 테헤란로 152, 4층',
      office_reg_number: '11680-2024-00456',
      representative_name: '박준호',
      card_name: '박준호',
    },
  };
}

function buildDraftWorkspaceItem(draftPayload: Record<string, unknown>): WorkspaceItemRecord {
  return {
    id: DOC_ID,
    ownerId: BROKER_ID,
    kind: 'im',
    legacyId: null,
    buildingId: BUILDING_ID,
    status: 'draft',
    title: '역삼 프라임 타워',
    address: '서울특별시 강남구 역삼동 823-10',
    priceBand: '120억원',
    draftPayload,
    publishedSnapshot: null,
    correctionNotice: null,
    version: 1,
    docHash: null,
    publishedAt: null,
    revokedAt: null,
    deletedAt: null,
    createdAt: '2026-11-18T05:00:00.000Z',
    updatedAt: '2026-11-18T05:00:00.000Z',
  };
}

describe('Wave 7.3D IM Remediation Unit Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitBuckets();

    mocks.requireBroker.mockResolvedValue({
      user: { id: BROKER_ID, email: 'broker@credeal.net' },
      role: 'broker',
      profile: { role: 'broker', display_name: '박준호' },
      error: null,
    });
    mocks.markAsGoldenIM.mockResolvedValue(1);
    mocks.getWorkspaceItemByAnyId.mockResolvedValue(null);
    mocks.upsertWorkspaceItem.mockResolvedValue(null);
    mocks.getPublicWorkspaceProjection.mockResolvedValue(null);
    mocks.getServerViewer.mockResolvedValue({ userId: null, isAdmin: false });
    mocks.verifyShareLinkToken.mockResolvedValue({ valid: true, buildingId: BUILDING_ID });
    mocks.isBuildingShareLinkRevoked.mockReturnValue(false);
    mocks.isBuildingShareLinkRevokedAsync.mockResolvedValue(false);
    mocks.fetchIMData.mockResolvedValue(null);
    mocks.resolveOrSynthesizeQuickImRecord.mockResolvedValue(null);
    mocks.saveQuickImRecord.mockReturnValue(undefined);
  });

  afterEach(() => {
    clearRateLimitBuckets();
    vi.restoreAllMocks();
  });

  describe('P1-1, P1-2, P2-6 & P2-7: Broker IM Approval & Override Routes', () => {
    it('P1-1: blocks approval with 422 STATUTORY_DISCLOSURE_INCOMPLETE when statutory broker disclosure fields are missing', async () => {
      const approveBody = buildValidApproveBody();
      const expectedHash = computeContentHash({
        body: approveBody,
        releaseTier: 'fact_om',
        policyVersion: '2026-08-31',
      });

      const db = createMockSupabase((q) => {
        if (q.table === 'document_objects' && q.operation === 'select') {
          if (q.selectCols.includes('owner_id')) {
            return {
              data: {
                id: DOC_ID,
                owner_id: BROKER_ID,
                broker_id: BROKER_ID,
                status: 'draft',
                building_id: BUILDING_ID,
                series_id: null,
                version_no: 1,
              },
              error: null,
            };
          }
          return {
            data: { body: approveBody, updated_at: GATE_UPDATED_AT },
            error: null,
          };
        }
        if (q.table === 'profiles') {
          return {
            data: { display_name: '박준호', company: null, phone: null },
            error: null,
          };
        }
        if (q.table === 'broker_profiles') {
          return {
            data: {
              office_address: null,
              office_reg_number: null,
              representative_name: null,
              card_name: null,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const req = new NextRequest(`https://credeal.net/api/broker/im-lite/${DOC_ID}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', expectedHash }),
      });

      const res = await approvePost(req, { params: Promise.resolve({ id: DOC_ID }) });
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(422);
      expect(json.ok).toBe(false);
      expect(json.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
      expect(json.missingFields).toEqual(
        expect.arrayContaining(['company', 'office_address', 'phone', 'office_reg_number']),
      );
      expect(db.writes).toHaveLength(0);
      expect(mocks.upsertWorkspaceItem).not.toHaveBeenCalled();
    });

    it('P1-2: publishes canonical workspace_items row with sanitized snapshot when statutory disclosure is complete', async () => {
      const approveBody = buildValidApproveBody();
      const expectedHash = computeContentHash({
        body: approveBody,
        releaseTier: 'fact_om',
        policyVersion: '2026-08-31',
      });
      const statutory = buildCompleteStatutoryRows();

      mocks.getWorkspaceItemByAnyId.mockResolvedValue(buildDraftWorkspaceItem(approveBody));
      mocks.upsertWorkspaceItem.mockResolvedValue({ id: DOC_ID, status: 'published' });

      const db = createMockSupabase((q) => {
        if (q.table === 'document_objects' && q.operation === 'select') {
          if (q.selectCols.includes('owner_id')) {
            return {
              data: {
                id: DOC_ID,
                owner_id: BROKER_ID,
                broker_id: BROKER_ID,
                status: 'draft',
                building_id: BUILDING_ID,
                series_id: null,
                version_no: 1,
              },
              error: null,
            };
          }
          return {
            data: {
              body: approveBody,
              building_id: BUILDING_ID,
              updated_at: GATE_UPDATED_AT,
            },
            error: null,
          };
        }
        if (q.table === 'document_objects' && q.operation === 'update') {
          return { data: [{ id: DOC_ID }], error: null };
        }
        if (q.table === 'profiles') {
          return { data: statutory.profile, error: null };
        }
        if (q.table === 'broker_profiles') {
          return { data: statutory.brokerProfile, error: null };
        }
        if (q.table === 'im_approvals' && q.operation === 'insert') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const req = new NextRequest(`https://credeal.net/api/broker/im-lite/${DOC_ID}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', expectedHash }),
      });

      const res = await approvePost(req, { params: Promise.resolve({ id: DOC_ID }) });
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.status).toBe('published');

      expect(mocks.upsertWorkspaceItem).toHaveBeenCalledTimes(1);
      const [, workspaceUpsertArg] = mocks.upsertWorkspaceItem.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(workspaceUpsertArg).toMatchObject({
        id: DOC_ID,
        buildingId: BUILDING_ID,
        ownerId: BROKER_ID,
        kind: 'im',
        status: 'published',
        docHash: expectedHash,
      });

      const snapshot = workspaceUpsertArg.publishedSnapshot as Record<string, unknown>;
      expect(snapshot).toBeTruthy();
      expect(snapshot.buildingName).toBe('역삼 프라임 타워');
      // Broker-internal notes & seller PII are stripped while token-gated IM fields are preserved
      expect(snapshot).not.toHaveProperty('privateMemo');
      expect(snapshot).not.toHaveProperty('ownerPhone');
      expect(snapshot.address).toBe('서울특별시 강남구 역삼동 823-10');
      expect(snapshot.rent_roll).toEqual([
        { floor: '2F', tenant: '테크코퍼레이션', monthly_rent_manwon: 1_800 },
      ]);
    });

    it('P2-6: rejects stale expectedHash (422) and concurrent updated_at race mismatch (409 IM_APPROVAL_CONFLICT)', async () => {
      const approveBody = buildValidApproveBody();
      const expectedHash = computeContentHash({
        body: approveBody,
        releaseTier: 'fact_om',
        policyVersion: '2026-08-31',
      });
      const statutory = buildCompleteStatutoryRows();

      const db = createMockSupabase((q) => {
        if (q.table === 'document_objects' && q.operation === 'select') {
          if (q.selectCols.includes('owner_id')) {
            return {
              data: {
                id: DOC_ID,
                owner_id: BROKER_ID,
                broker_id: BROKER_ID,
                status: 'draft',
                building_id: BUILDING_ID,
                series_id: null,
                version_no: 1,
              },
              error: null,
            };
          }
          return {
            data: { body: approveBody, updated_at: GATE_UPDATED_AT },
            error: null,
          };
        }
        if (q.table === 'profiles') {
          return { data: statutory.profile, error: null };
        }
        if (q.table === 'broker_profiles') {
          return { data: statutory.brokerProfile, error: null };
        }
        if (q.table === 'document_objects' && q.operation === 'update') {
          // Simulate optimistic concurrency miss: another writer changed updated_at after hash check
          expect(q.filters.updated_at).toBe(GATE_UPDATED_AT);
          return { data: [], error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      // 1) Stale hash before update -> 422 IM_APPROVAL_HASH_MISMATCH
      const staleReq = new NextRequest(`https://credeal.net/api/broker/im-lite/${DOC_ID}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          expectedHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        }),
      });
      const staleRes = await approvePost(staleReq, { params: Promise.resolve({ id: DOC_ID }) });
      const staleJson = (await staleRes.json()) as Record<string, unknown>;
      expect(staleRes.status).toBe(422);
      expect(staleJson.error).toBe('IM_APPROVAL_HASH_MISMATCH');
      expect(db.writes).toHaveLength(0);

      // 2) Matching hash at read time, but 0 rows updated due to concurrent write -> 409 IM_APPROVAL_CONFLICT
      const raceReq = new NextRequest(`https://credeal.net/api/broker/im-lite/${DOC_ID}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', expectedHash }),
      });
      const raceRes = await approvePost(raceReq, { params: Promise.resolve({ id: DOC_ID }) });
      const raceJson = (await raceRes.json()) as Record<string, unknown>;
      expect(raceRes.status).toBe(409);
      expect(raceJson.code).toBe('IM_APPROVAL_CONFLICT');
      expect(mocks.upsertWorkspaceItem).not.toHaveBeenCalled();
    });

    it('P2-7: approve-override masks raw DB error details on save failure (500 OVERRIDE_SAVE_FAILED)', async () => {
      const db = createMockSupabase((q) => {
        if (q.table === 'document_objects' && q.operation === 'select') {
          return {
            data: {
              id: DOC_ID,
              owner_id: BROKER_ID,
              broker_id: BROKER_ID,
              status: 'draft',
              body: {
                im_type: 'mobile_im_lite',
                releaseTier: 'fact_om',
                floor_leases: [
                  {
                    floor: '1F',
                    area_sqm: 50,
                    monthly_rent_krw: 5_000_000,
                    deposit_krw: 50_000_000,
                    occupancy_status: '임대중',
                  },
                ],
                rent_roll_meta: { gfa_sqm: 1_000 },
              },
            },
            error: null,
          };
        }
        if (q.table === 'document_objects' && q.operation === 'update') {
          return {
            data: null,
            error: {
              code: '23514',
              message: 'new row violates check constraint internal_sql_secret_constraint',
            },
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const req = new NextRequest(
        `https://credeal.net/api/broker/im-lite/${DOC_ID}/approve-override`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '구분소유 1층 단독 매각 대상임' }),
        },
      );

      const res = await approveOverridePost(req, { params: Promise.resolve({ id: DOC_ID }) });
      const text = await res.text();
      const json = JSON.parse(text) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(json.code).toBe('OVERRIDE_SAVE_FAILED');
      expect(text).not.toContain('internal_sql_secret_constraint');
    });
  });

  describe('P1-3 & P1-4: POST /api/broker/im-lite/quick-generate Hardening', () => {
    it('P1-3: fails closed with 503 OWNERSHIP_CHECK_UNAVAILABLE and zero writes when building_ssot_lite ownership lookup errors', async () => {
      const dbErrorClient = createMockSupabase((q) => {
        if (q.table === 'building_ssot_lite' && q.operation === 'select') {
          return {
            data: null,
            error: { code: '08006', message: 'connection to database lost' },
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(dbErrorClient.client);

      const req = new NextRequest('https://credeal.net/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: BUILDING_ID,
          address: '서울특별시 강남구 역삼동 823-10',
          askingPriceManwon: 1_200_000,
        }),
      });

      const res = await quickGeneratePost(req);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(503);
      expect(json.ok).toBe(false);
      expect(json.code).toBe('OWNERSHIP_CHECK_UNAVAILABLE');
      expect(dbErrorClient.writes).toHaveLength(0);
      expect(mocks.upsertWorkspaceItem).not.toHaveBeenCalled();
      expect(mocks.saveQuickImRecord).not.toHaveBeenCalled();
    });

    it('P1-4: returns 429 AI_RATE_LIMITED when per-broker burst rate limit is exceeded', async () => {
      const rateLimitedBrokerId = '44444444-4444-4444-8444-444444444444';
      mocks.requireBroker.mockResolvedValue({
        user: { id: rateLimitedBrokerId, email: 'burst@credeal.net' },
        role: 'broker',
        profile: { role: 'broker', display_name: '박준호' },
        error: null,
      });

      for (let i = 0; i < 20; i += 1) {
        const allowed = await checkRateLimit(
          rateLimitedBrokerId,
          'ai_im_quick_generate',
          20,
          60_000,
        );
        expect(allowed).toBe(true);
      }

      const req = new NextRequest('https://credeal.net/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: '서울특별시 강남구 역삼동 823-10',
          askingPriceManwon: 1_200_000,
        }),
      });

      const res = await quickGeneratePost(req);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(429);
      expect(json.ok).toBe(false);
      expect(json.code).toBe('AI_RATE_LIMITED');
      expect(mocks.createServiceClient).not.toHaveBeenCalled();
      expect(mocks.upsertWorkspaceItem).not.toHaveBeenCalled();
    });
  });

  describe('P2-2: GET /api/public/map/static Proxy Guards', () => {
    it('rejects untrusted cross-origin requests and bare requests without first-party context (403)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const crossOriginReq = new NextRequest(
        'https://credeal.net/api/public/map/static?lat=37.5006&lng=127.0364',
        {
          headers: {
            host: 'credeal.net',
            origin: 'https://evil.example',
            referer: 'https://evil.example/scrape',
            'sec-fetch-site': 'cross-site',
          },
        },
      );
      const crossRes = await publicMapStaticGet(crossOriginReq);
      expect(crossRes.status).toBe(403);
      expect(await crossRes.text()).toContain('지도 표시 권한이 없습니다');

      const noContextReq = new NextRequest(
        'https://credeal.net/api/public/map/static?lat=37.5006&lng=127.0364',
        {
          headers: {
            host: 'credeal.net',
          },
        },
      );
      const noContextRes = await publicMapStaticGet(noContextReq);
      expect(noContextRes.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects out-of-Korea coordinates with 400', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const outOfBoundsReq = new NextRequest(
        'https://credeal.net/api/public/map/static?lat=35.6762&lng=139.6503',
        {
          headers: {
            host: 'credeal.net',
            'sec-fetch-site': 'same-origin',
            'x-forwarded-for': '203.0.113.10',
          },
        },
      );

      const res = await publicMapStaticGet(outOfBoundsReq);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('위치 좌표 확인 필요');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects rate-limited requests with 429', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const clientIp = '198.51.100.77';

      for (let i = 0; i < 60; i += 1) {
        const allowed = await checkRateLimit(clientIp, 'public_map_static', 60, 60_000);
        expect(allowed).toBe(true);
      }

      const limitedReq = new NextRequest(
        'https://credeal.net/api/public/map/static?lat=37.5006&lng=127.0364',
        {
          headers: {
            host: 'credeal.net',
            'sec-fetch-site': 'same-origin',
            'x-forwarded-for': clientIp,
          },
        },
      );

      const res = await publicMapStaticGet(limitedReq);
      expect(res.status).toBe(429);
      expect(await res.text()).toContain('잠시 후 다시 시도해 주세요');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('P2-8, P2-15 & P2-1: Public IM Lite Viewer & Export Guards', () => {
    it('P2-8: denies document_objects rows with missing status (404) to public viewers while preserving owner preview', async () => {
      const db = createMockSupabase((q) => {
        if (q.table === 'activity_events') {
          return { data: [], error: null };
        }
        if (q.table === 'building_ssot_lite') {
          if (q.terminal === 'maybeSingle') {
            return { data: { owner_id: BROKER_ID, status: 'draft' }, error: null };
          }
          return {
            data: {
              id: BUILDING_ID,
              owner_id: BROKER_ID,
              status: 'draft',
              completeness_score: 85,
            },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          return {
            data: {
              body: {
                buildingName: '미승인 상태누락 빌딩',
                sections: [{ sectionId: '01_overview', title: '개요', content: '비공개 본문' }],
                ssot_summary: { area_signal: '역삼권역', asset_type: '오피스' },
              },
              owner_id: BROKER_ID,
              created_at: '2026-11-18T05:00:00.000Z',
              updated_at: '2026-11-18T05:00:00.000Z',
              status: null,
              document_type: 'mobile_im',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const anonReq = new NextRequest(
        `https://credeal.net/api/public/im-lite/${BUILDING_ID}?doc=${DOC_ID}&token=slk.valid`,
      );
      const anonRes = await publicImGet(anonReq, {
        params: Promise.resolve({ buildingId: BUILDING_ID }),
      });
      const anonJson = (await anonRes.json()) as { ok: boolean; error?: { code?: string } };

      expect(anonRes.status).toBe(404);
      expect(anonJson.ok).toBe(false);
      expect(anonJson.error?.code).toBe('NOT_FOUND');

      // Owner preview on the same null-status document remains permitted
      mocks.getServerViewer.mockResolvedValue({ userId: BROKER_ID, isAdmin: false });
      const ownerReq = new NextRequest(
        `https://credeal.net/api/public/im-lite/${BUILDING_ID}?doc=${DOC_ID}`,
      );
      const ownerRes = await publicImGet(ownerReq, {
        params: Promise.resolve({ buildingId: BUILDING_ID }),
      });
      const ownerJson = (await ownerRes.json()) as { ok: boolean; source?: string };
      expect(ownerRes.status).toBe(200);
      expect(ownerJson.ok).toBe(true);
      expect(ownerJson.source).toBe('document_objects');
    });

    it('P2-15: fails closed (503 GOVERNANCE_CHECK_UNAVAILABLE) on unexpected revocation errors, while tolerating 42P01 and 42703 pre-cutover', async () => {
      const publishedDocumentRow = {
        body: {
          buildingName: '공개 승인 오피스',
          basicImDocument: { version: '1.0' },
          sections: [{ sectionId: '01_overview', title: '물건 개요', content: '공개 승인 완료' }],
          ssot_summary: { area_signal: '강남권역', asset_type: '오피스', price_band: '120억원' },
        },
        owner_id: BROKER_ID,
        created_at: '2026-11-18T05:00:00.000Z',
        updated_at: '2026-11-18T05:00:00.000Z',
        status: 'published',
        document_type: 'mobile_im',
      };

      // 1) Unexpected DB error on activity_events -> 503 fail-closed
      const unexpectedErrDb = createMockSupabase((q) => {
        if (q.table === 'activity_events') {
          return {
            data: null,
            error: { code: '08006', message: 'connection failure' },
          };
        }
        if (q.table === 'document_objects') {
          return { data: publishedDocumentRow, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(unexpectedErrDb.client);

      const failClosedRes = await publicImGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}?doc=${DOC_ID}&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      const failClosedJson = (await failClosedRes.json()) as {
        ok: boolean;
        error?: { code?: string };
      };
      expect(failClosedRes.status).toBe(503);
      expect(failClosedJson.ok).toBe(false);
      expect(failClosedJson.error?.code).toBe('GOVERNANCE_CHECK_UNAVAILABLE');

      // 2) Pre-cutover 42P01 (missing activity_events relation) -> tolerated, serves published IM (200)
      const missingTableDb = createMockSupabase((q) => {
        if (q.table === 'activity_events') {
          return {
            data: null,
            error: { code: '42P01', message: 'relation "public.activity_events" does not exist' },
          };
        }
        if (q.table === 'building_ssot_lite') {
          return { data: { owner_id: BROKER_ID, status: 'public_signal_ready' }, error: null };
        }
        if (q.table === 'document_objects') {
          return { data: publishedDocumentRow, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(missingTableDb.client);

      const preCutover42P01Res = await publicImGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}?doc=${DOC_ID}&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      const preCutover42P01Json = (await preCutover42P01Res.json()) as {
        ok: boolean;
        source?: string;
      };
      expect(preCutover42P01Res.status).toBe(200);
      expect(preCutover42P01Json.ok).toBe(true);
      expect(preCutover42P01Json.source).toBe('document_objects');

      // 3) Pre-cutover 42703 (missing building_id column on activity_events) -> falls back to column-less query and serves 200
      const missingColDb = createMockSupabase((q) => {
        if (q.table === 'activity_events') {
          if (q.selectCols.includes('building_id')) {
            return {
              data: null,
              error: {
                code: '42703',
                message: 'column activity_events.building_id does not exist',
              },
            };
          }
          return { data: [], error: null };
        }
        if (q.table === 'building_ssot_lite') {
          return { data: { owner_id: BROKER_ID, status: 'public_signal_ready' }, error: null };
        }
        if (q.table === 'document_objects') {
          return { data: publishedDocumentRow, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(missingColDb.client);

      const preCutover42703Res = await publicImGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}?doc=${DOC_ID}&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      const preCutover42703Json = (await preCutover42703Res.json()) as {
        ok: boolean;
        source?: string;
      };
      expect(preCutover42703Res.status).toBe(200);
      expect(preCutover42703Json.ok).toBe(true);
      expect(preCutover42703Json.source).toBe('document_objects');
    });

    it('P2-1: rate-limits GET /api/public/im-lite/[buildingId]/export with 429 RATE_LIMITED', async () => {
      const exportIp = '198.51.100.88';
      for (let i = 0; i < 60; i += 1) {
        const allowed = await checkRateLimit(exportIp, 'im_lite_export_html', 60, 3600 * 1000);
        expect(allowed).toBe(true);
      }

      const req = new NextRequest(
        `https://credeal.net/api/public/im-lite/${BUILDING_ID}/export?format=html`,
        {
          headers: { 'x-forwarded-for': exportIp },
        },
      );
      const res = await publicImExportGet(req, {
        params: Promise.resolve({ buildingId: BUILDING_ID }),
      });
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('60');
      expect(json.code).toBe('RATE_LIMITED');
      expect(mocks.createServiceClient).not.toHaveBeenCalled();
    });
  });
});
