// @vitest-environment node
/**
 * Wave 7.5B — IM Multi-Tenant, Blind-Gate & Studio Closure Unit Suite
 *
 * Covers:
 *  1. P0-1: Collision-free `?fresh=1` & duplicate IM ID minting (`mintUniqueFreshImIds`, `mintDuplicateImIds`),
 *           `im-doc-01..03` in `DEMO_SEED_LEGACY_IDS` (repository, backfill, SQL partial unique index),
 *           unscoped demo-seed guard in `getWorkspaceItemByAnyId` & `resolveOrSynthesizeQuickImRecord`,
 *           and owner-scoped `getWorkspaceItemByAnyId` in `patch-upsert-im` preventing cross-tenant
 *           `publishedSnapshot` leaks.
 *  2. P0-2: `quick-generate` sanitizing companion DealCard via `cleanBlindPoints` + known building/tenant
 *           stripping + `validateBlindPriceBand` + `evaluateDealCardPublishContent` (and downgrading
 *           companion DealCard to `status: 'draft'`, `publishedSnapshot: null` when unblindable).
 *  3. P0-3: `/api/broker/buildings/[id]/legal` `GET`+`PATCH` authz & `layers.legal` merge persistence,
 *           `evidence/route.ts` `multipart/form-data` magic-byte validation + Storage upload + `502`
 *           rollback on `STORAGE_UPLOAD_FAILED` (preserving `INVALID_STORAGE_BUCKET` & `INVALID_STORAGE_PATH`),
 *           and `studio/briefing/page.tsx` `/snapshot` CTA.
 *  4. P1-1..5 & P2-1..4: `SlidePreview.tsx` zero synthetic `[42, 48, ...]` land-price bars,
 *           `basic-im-studio/[id]` `lockVersion` `409 STALE_LOCK_ERROR` OCC + `workspace_items` sync,
 *           `map-upload` `fieldName` allowlist (`400 INVALID_FIELD_NAME`), Pro IM rate limits +
 *           unified PPTX+PDF download quota, `buildings/rank` `requireBroker` + masked DB errors,
 *           `buildings/[id]/validate` authz before early `200`, `studio-owner.ts` fail-closed non-UUID
 *           check, `buildings/[id]/disclosure` server-side `blind_teaser` redactions, and owner export
 *           QR share token + `>=14px` SVG/export typography.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireBroker: vi.fn(),
  createServiceClient: vi.fn(),
  createSupabaseClient: vi.fn(),
  getServerViewer: vi.fn(),
  enforceBrokerAiQuota: vi.fn(),
  qrToDataURL: vi.fn(),
  resolveProGrantByAnyId: vi.fn(),
  verifyProGrantViewerAccess: vi.fn(),
  consumeProGrantDownload: vi.fn(),
  resolvePublishedImProDocument: vi.fn(),
  upsertWorkspaceItemSpy: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mocks.requireBroker(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mocks.createServiceClient(),
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: (...args: unknown[]) =>
      mocks.createSupabaseClient.getMockImplementation()
        ? mocks.createSupabaseClient(...args)
        : actual.createClient(...(args as Parameters<typeof actual.createClient>)),
  };
});

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: () => mocks.getServerViewer(),
}));

vi.mock('@/lib/ai-quota-guard', () => ({
  enforceBrokerAiQuota: (...args: unknown[]) => mocks.enforceBrokerAiQuota(...args),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: (...args: unknown[]) => mocks.qrToDataURL(...args),
  },
  toDataURL: (...args: unknown[]) => mocks.qrToDataURL(...args),
}));

vi.mock('@/domain/gate/im-pro-grant-service', () => ({
  resolveProGrantByAnyId: (...args: unknown[]) => mocks.resolveProGrantByAnyId(...args),
  verifyProGrantViewerAccess: (...args: unknown[]) => mocks.verifyProGrantViewerAccess(...args),
  consumeProGrantDownload: (...args: unknown[]) => mocks.consumeProGrantDownload(...args),
}));

vi.mock('@/app/api/public/im-pro/_lib/im-pro-doc-guard', () => ({
  resolvePublishedImProDocument: (...args: unknown[]) =>
    mocks.resolvePublishedImProDocument(...args),
}));

vi.mock('@/lib/workspace/workspace-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/workspace-repository')>();
  return {
    ...actual,
    upsertWorkspaceItem: async (...args: Parameters<typeof actual.upsertWorkspaceItem>) => {
      mocks.upsertWorkspaceItemSpy(...args);
      return actual.upsertWorkspaceItem(...args);
    },
  };
});

import {
  mintDuplicateImIds,
  mintUniqueFreshImIds,
} from '@/app/(broker)/broker/w/im/page';
import {
  DEMO_SEED_LEGACY_IDS,
  getWorkspaceItemByAnyId,
  resetWorkspaceRepositoryCacheForTests,
  upsertWorkspaceItem,
} from '@/lib/workspace/workspace-repository';
import { handlePatchWorkspaceImUpsert } from '@/lib/workspace/summary/patch-upsert-im';
import {
  clearQuickImStoreForTest,
  resolveOrSynthesizeQuickImRecord,
  saveQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import { POST as quickGeneratePost } from '@/app/api/broker/im-lite/quick-generate/route';
import {
  GET as buildingLegalGet,
  PATCH as buildingLegalPatch,
} from '@/app/api/broker/buildings/[id]/legal/route';
import { POST as evidencePost } from '@/app/api/broker/buildings/[id]/evidence/route';
import { PATCH as basicImStudioPatch } from '@/app/api/broker/basic-im-studio/[id]/route';
import { POST as mapUploadPost } from '@/app/api/broker/basic-im-studio/[id]/map-upload/route';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { GET as publicImProGet } from '@/app/api/public/im-pro/[grantId]/route';
import { GET as publicImProExportGet } from '@/app/api/public/im-pro/[grantId]/export/route';
import { GET as publicImProPptxGet } from '@/app/api/public/im-pro/[grantId]/pptx/route';
import { GET as buildingsRankGet } from '@/app/api/broker/buildings/rank/route';
import { POST as buildingDisclosurePost } from '@/app/api/broker/buildings/[id]/disclosure/route';
import { POST as buildingValidatePost } from '@/app/api/broker/buildings/[id]/validate/route';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { GET as publicImLiteExportGet } from '@/app/api/public/im-lite/[buildingId]/export/route';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';

const BROKER_A = '11117500-7500-4111-8111-111111117501';
const BROKER_B = '22227500-7500-4222-8222-222222227502';
const BUILDING_ID = 'aaaa7500-7500-4111-8111-aaaaaaaa7501';
const DOC_ID = 'dddd7500-7500-4111-8111-dddddddd7501';
const GRANT_ID = 'gggg7500-7500-4111-8111-gggggggg7501';

interface MockQueryState {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert';
  selectCols: string;
  selectOpts?: { count?: string; head?: boolean };
  filters: Record<string, unknown>;
  orExpr: string | null;
  payload?: unknown;
  terminal: 'many' | 'maybeSingle' | 'single';
}

interface MockDbResult {
  data: unknown;
  count?: number | null;
  error: { code?: string; message?: string } | null;
}

interface MockStorageHandlers {
  upload?: (
    bucket: string,
    storagePath: string,
    body: unknown,
    opts?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  download?: (
    bucket: string,
    storagePath: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function createMockDb(
  handler: (q: MockQueryState) => MockDbResult | Promise<MockDbResult>,
  storageHandlers?: MockStorageHandlers,
) {
  const queries: MockQueryState[] = [];

  const from = (table: string) => {
    const state: MockQueryState = {
      table,
      operation: 'select',
      selectCols: '*',
      filters: {},
      orExpr: null,
      terminal: 'many',
    };

    const run = (terminal: MockQueryState['terminal']): Promise<MockDbResult> => {
      state.terminal = terminal;
      const snap: MockQueryState = {
        ...state,
        filters: { ...state.filters },
      };
      queries.push(snap);
      return Promise.resolve().then(() => handler(snap));
    };

    const builder = {
      select(cols = '*', opts?: { count?: string; head?: boolean }) {
        state.selectCols = cols;
        state.selectOpts = opts;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters[`neq:${col}`] = val;
        return builder;
      },
      is(col: string, val: unknown) {
        state.filters[`is:${col}`] = val;
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        state.filters[col] = vals;
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        state.filters[`not:${col}:${op}`] = val;
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
      range() {
        return builder;
      },
      insert(payload: unknown) {
        state.operation = 'insert';
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.operation = 'update';
        state.payload = payload;
        return builder;
      },
      upsert(payload: unknown) {
        state.operation = 'upsert';
        state.payload = payload;
        return builder;
      },
      maybeSingle() {
        return run('maybeSingle');
      },
      single() {
        return run('single');
      },
      then<TResult1 = MockDbResult, TResult2 = never>(
        onfulfilled?: ((value: MockDbResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        return run('many').then(onfulfilled, onrejected);
      },
    };

    return builder;
  };

  const storage = {
    from: (bucket: string) => ({
      upload: (storagePath: string, body: unknown, opts?: Record<string, unknown>) =>
        storageHandlers?.upload
          ? storageHandlers.upload(bucket, storagePath, body, opts)
          : Promise.resolve({ data: { path: storagePath }, error: null }),
      download: (storagePath: string) =>
        storageHandlers?.download
          ? storageHandlers.download(bucket, storagePath)
          : Promise.resolve({ data: null, error: { message: 'not found' } }),
      createSignedUrl: async () => ({ data: null, error: null }),
    }),
  };

  return {
    client: { from, storage },
    queries,
  };
}

describe('Wave 7.5B IM Multi-Tenant, Blind-Gate & Studio Closure Suite', () => {
  const prevRequireWs = process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;

  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceRepositoryCacheForTests();
    clearRateLimitBuckets();
    clearQuickImStoreForTest();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;

    mocks.requireBroker.mockResolvedValue({
      user: { id: BROKER_A, email: 'broker-a@credeal.net' },
      role: 'broker',
      profile: { role: 'broker', display_name: '김대표' },
      error: null,
    });
    mocks.getServerViewer.mockResolvedValue({ userId: null, isAdmin: false });
    mocks.enforceBrokerAiQuota.mockResolvedValue(null);
    mocks.qrToDataURL.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
  });

  afterEach(() => {
    if (prevRequireWs === undefined) {
      delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
    } else {
      process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = prevRequireWs;
    }
    clearRateLimitBuckets();
    clearQuickImStoreForTest();
    vi.restoreAllMocks();
  });

  describe('P0-1: Multi-Tenant Legacy-ID Collision Closure & Owner-Scoped Workspace Lookups', () => {
    it('mints collision-free per-instance ?fresh=1 and duplicate IDs and allowlists im-doc-01..03 across repository, backfill & SQL', async () => {
      const fresh1 = mintUniqueFreshImIds();
      const fresh2 = mintUniqueFreshImIds();
      expect(fresh1.id).toMatch(/^im-doc-fresh-.+/);
      expect(fresh1.buildingId).toMatch(/^bld-fresh-.+/);
      expect(fresh1.id).not.toBe('im-doc-fresh-draft');
      expect(fresh1.buildingId).not.toBe('bld-fresh-draft');
      expect(fresh1.id).not.toBe(fresh2.id);
      expect(fresh1.buildingId).not.toBe(fresh2.buildingId);

      const dupFromDemo = mintDuplicateImIds('bld-01');
      const dupFromFresh = mintDuplicateImIds(fresh1.buildingId);
      expect(dupFromDemo.id).toMatch(/^im-doc-.+/);
      expect(dupFromDemo.buildingId).toMatch(/^bld-dup-.+/);
      expect(dupFromFresh.buildingId).toMatch(/^bld-dup-.+/);
      expect(dupFromDemo.id).not.toBe(dupFromFresh.id);

      const imPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/w/im/page.tsx'),
        'utf8',
      );
      expect(imPageSrc).not.toContain('"im-doc-fresh-draft"');
      expect(imPageSrc).not.toContain('"bld-fresh-draft"');

      for (const seedId of ['bld-01', 'bld-02', 'bld-03', 'im-doc-01', 'im-doc-02', 'im-doc-03']) {
        expect(DEMO_SEED_LEGACY_IDS.has(seedId)).toBe(true);
      }

      const backfillSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'scripts/backfill-workspace-items.ts'),
        'utf8',
      );
      expect(backfillSrc).toContain("'im-doc-01'");
      expect(backfillSrc).toContain("'im-doc-02'");
      expect(backfillSrc).toContain("'im-doc-03'");

      const migrationSql = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'supabase/migrations/20261117000001_workspace_items_and_drift_fix.sql',
        ),
        'utf8',
      );
      expect(migrationSql).toContain(
        'DROP INDEX IF EXISTS public.uq_workspace_items_kind_legacy_non_demo;',
      );
      expect(migrationSql).toContain("'im-doc-01', 'im-doc-02', 'im-doc-03'");
    });

    it('blocks unscoped demo-seed lookups and prevents cross-tenant publishedSnapshot leaks in patch-upsert-im', async () => {
      const storedRows: Array<Record<string, unknown>> = [
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          owner_id: BROKER_A,
          kind: 'im',
          legacy_id: 'im-doc-01',
          building_id: null,
          status: 'published',
          title: '브로커A 비공개 서교동 빌딩',
          address: '서울특별시 마포구 서교동 395-166',
          price_band: '90~100억',
          draft_payload: { title: '브로커A 초안' },
          published_snapshot: {
            title: '브로커A 발행 스냅샷 — 타 테넌트 유출 금지',
            secretMarker: 'TENANT_A_SNAPSHOT',
          },
          version: 2,
          created_at: '2026-11-18T00:00:00.000Z',
          updated_at: '2026-11-18T00:00:00.000Z',
        },
      ];

      const db = createMockDb((q) => {
        if (q.table === 'workspace_items' && q.operation === 'select') {
          const matched = storedRows.filter((r) => {
            if (q.filters.legacy_id && r.legacy_id !== q.filters.legacy_id) return false;
            if (q.filters.owner_id && r.owner_id !== q.filters.owner_id) return false;
            if (q.filters.kind && r.kind !== q.filters.kind) return false;
            return true;
          });
          return {
            data: q.terminal === 'many' ? matched : matched[0] ?? null,
            error: null,
          };
        }
        if (q.table === 'workspace_items' && q.operation === 'insert') {
          const row = { ...(q.payload as Record<string, unknown>) };
          storedRows.push(row);
          return { data: row, error: null };
        }
        if (q.table === 'activity_events') {
          return { data: [], error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      // 1) Unscoped lookup on shared demo seed returns null (never Broker A's row)
      const unscoped = await getWorkspaceItemByAnyId(db.client, 'im-doc-01', 'im');
      expect(unscoped).toBeNull();

      // 2) Unscoped resolveOrSynthesizeQuickImRecord on shared demo seed skips cross-tenant DB rows (never leaks Broker A's row)
      const unscopedQuick = await resolveOrSynthesizeQuickImRecord('im-doc-01', db.client);
      expect(unscopedQuick?.ownerId).not.toBe(BROKER_A);
      expect(JSON.stringify(unscopedQuick)).not.toContain('브로커A');

      // 3) Scoped lookup returns Broker A's row only for BROKER_A
      const scopedA = await getWorkspaceItemByAnyId(db.client, 'im-doc-01', 'im', BROKER_A);
      expect(scopedA?.ownerId).toBe(BROKER_A);
      const scopedB = await getWorkspaceItemByAnyId(db.client, 'im-doc-01', 'im', BROKER_B);
      expect(scopedB).toBeNull();

      // 4) Broker B saving draft on shared demo seed 'im-doc-01' succeeds (no 403) AND never copies Broker A's publishedSnapshot
      const patchRes = await handlePatchWorkspaceImUpsert({
        supabase: db.client as any,
        userId: BROKER_B,
        role: 'broker',
        action: 'upsert_im',
        buildingId: 'bld-01',
        uuidOwnerVerified: false,
        brokerProfileMeta: undefined,
        body: {
          action: 'upsert_im',
          buildingId: 'bld-01',
          imId: 'im-doc-01',
          imItem: {
            id: 'im-doc-01',
            buildingId: 'bld-01',
            title: '브로커B 새 초안',
            address: '서울특별시 강남구 신사동 540-1',
            askingPriceManwon: 850000,
            status: 'draft',
            hasUnpublishedEdits: true,
          },
        },
      });
      expect(patchRes.status).toBe(200);
      const brokerBRow = storedRows.find((r) => r.owner_id === BROKER_B);
      expect(brokerBRow).toBeDefined();
      expect(brokerBRow?.status).toBe('draft');
      expect(brokerBRow?.published_snapshot).toBeNull();
    });
  });

  describe('P0-2: Companion DealCard Blind-Guard & Content Gate in quick-generate', () => {
    it('strips unblinded exact address, building name, tenant brand & exact price before publishing companion DealCard, and downgrades unblindable placeholder copy to draft', async () => {
      process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';

      const db = createMockDb((q) => {
        if (q.table === 'profiles') {
          return {
            data: {
              display_name: '박준호',
              company: '강남프라임공인중개사사무소',
              phone: '02-555-7890',
            },
            error: null,
          };
        }
        if (q.table === 'broker_profiles') {
          return {
            data: {
              office_reg_number: '11680-2024-00456',
              license_number: '제44890호',
              office_address: '서울특별시 서초구 반포대로 201, 3층',
              representative_name: '박준호',
            },
            error: null,
          };
        }
        if (q.table === 'workspace_items' && q.operation === 'select') {
          return { data: [], error: null };
        }
        if (q.table === 'workspace_items' && (q.operation === 'insert' || q.operation === 'update')) {
          return { data: q.payload, error: null };
        }
        if (q.table === 'building_ssot_lite') {
          return { data: q.operation === 'select' ? null : q.payload, error: null };
        }
        if (q.table === 'document_objects') {
          return { data: q.operation === 'select' ? [] : q.payload, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      // 1) Unblinded address, building name, tenant brand & exact price are stripped & banded
      const res1 = await quickGeneratePost(
        new NextRequest('https://credeal.net/api/broker/im-lite/quick-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: '서울특별시 강남구 역삼동 823-10',
            buildingName: '호산당빌딩',
            askingPriceManwon: 950000,
            priceBand: '95억',
            gfaSqm: 1650,
            landAreaSqm: 420,
            zoning: '일반상업지역',
            floorsAbove: 7,
            completionDate: '2019-06-15',
            brokerName: '박준호',
            brokerageName: '강남프라임공인중개사사무소',
            brokerPhone: '02-555-7890',
            brokerAddress: '서울특별시 서초구 반포대로 201, 3층',
            brokerRegNo: '11680-2024-00456',
            rentRoll: [
              {
                floor: '1F',
                tenantName: '메가커피 역삼점',
                use: '카페',
                depositManwon: 10000,
                monthlyRentManwon: 850,
              },
            ],
            investmentPoints: [
              '테헤란로 152 호산당빌딩 코너 가시성',
              '1층 메가커피 역삼점 및 스타벅스 인접',
              '역삼동 823-10 초역세권 우량 수익형',
            ],
          }),
        }),
      );
      expect(res1.status).toBe(201);

      const dealCardUpsertCall1 = mocks.upsertWorkspaceItemSpy.mock.calls.find(
        (call) => call[1]?.kind === 'dealcard',
      );
      expect(dealCardUpsertCall1).toBeDefined();
      const dealCardInput1 = dealCardUpsertCall1![1];
      expect(dealCardInput1.status).toBe('sent');
      expect(dealCardInput1.priceBand).toBe('90~100억');
      expect(dealCardInput1.publishedSnapshot).not.toBeNull();
      const snapJson1 = JSON.stringify(dealCardInput1.publishedSnapshot);
      expect(snapJson1).not.toContain('호산당빌딩');
      expect(snapJson1).not.toContain('메가커피 역삼점');
      expect(snapJson1).not.toContain('스타벅스');
      expect(snapJson1).not.toContain('테헤란로 152');
      expect(snapJson1).not.toContain('823-10');

      // 2) Unblindable / placeholder DealCard copy downgrades companion DealCard to draft while IM still succeeds (201)
      mocks.upsertWorkspaceItemSpy.mockClear();
      const res2 = await quickGeneratePost(
        new NextRequest('https://credeal.net/api/broker/im-lite/quick-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: '서울특별시 서초구 서초동 1303-35',
            askingPriceManwon: 1200000,
            gfaSqm: 1650,
            landAreaSqm: 420,
            zoning: '일반상업지역',
            floorsAbove: 7,
            completionDate: '2019-06-15',
            brokerName: '박준호',
            brokerageName: '강남프라임공인중개사사무소',
            brokerPhone: '02-555-7890',
            brokerAddress: '서울특별시 서초구 반포대로 201, 3층',
            brokerRegNo: '11680-2024-00456',
            investmentPoints: ['우수 입지', '추천 매물', '안정 수익'],
          }),
        }),
      );
      expect(res2.status).toBe(201);
      const imUpsertCall2 = mocks.upsertWorkspaceItemSpy.mock.calls.find(
        (call) => call[1]?.kind === 'im',
      );
      const dealCardUpsertCall2 = mocks.upsertWorkspaceItemSpy.mock.calls.find(
        (call) => call[1]?.kind === 'dealcard',
      );
      expect(imUpsertCall2?.[1]?.status).toBe('published');
      expect(dealCardUpsertCall2?.[1]?.status).toBe('draft');
      expect(dealCardUpsertCall2?.[1]?.publishedSnapshot).toBeNull();
    });
  });

  describe('P0-3: Studio Sub-Workflows (Legal Route, Multipart Evidence Upload & Briefing Snapshot Link)', () => {
    it('enforces requireBroker + ownership on GET/PATCH /api/broker/buildings/[id]/legal and persists layers.legal', async () => {
      // Foreign owner -> 403
      const foreignDb = createMockDb((q) => {
        if (q.table === 'building_ssot_lite') {
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_B, layers: { location: { pnu: '1168010100108230010' } } },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(foreignDb.client);

      const forbiddenRes = await buildingLegalGet(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/legal`),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(forbiddenRes.status).toBe(403);

      // Owner PATCH + GET
      let savedLayers: Record<string, unknown> = {
        location: { address: '서울특별시 강남구 역삼동 823-10' },
      };
      const ownerDb = createMockDb((q) => {
        if (q.table === 'building_ssot_lite' && q.operation === 'select') {
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_A, layers: savedLayers },
            error: null,
          };
        }
        if (q.table === 'building_ssot_lite' && q.operation === 'update') {
          const patch = q.payload as { layers: Record<string, unknown> };
          savedLayers = patch.layers;
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_A, layers: savedLayers },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(ownerDb.client);

      const patchRes = await buildingLegalPatch(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/legal`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            violation_registered: true,
            violation_detail: '베란다 경량철골 증축',
            transaction_structure: '포괄양수도',
            encumbrance_note: '잔금 동시 근저당 말소',
            zoning_confirmed: true,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(patchRes.status).toBe(200);
      const patchJson = await patchRes.json();
      expect(patchJson.ok).toBe(true);
      expect(patchJson.data.layers.location).toEqual({
        address: '서울특별시 강남구 역삼동 823-10',
      });
      expect(patchJson.data.layers.legal.violation_registered).toBe(true);
      expect(patchJson.data.layers.legal.transaction_structure).toBe('포괄양수도');
      expect(patchJson.data.layers.legal.zoning_confirmed).toBe(true);

      const getRes = await buildingLegalGet(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/legal`),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.data.layers.legal.violation_detail).toBe('베란다 경량철골 증축');

      const legalPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/buildings/[id]/studio/legal/page.tsx'),
        'utf8',
      );
      expect(legalPageSrc).toContain('/api/broker/buildings/${encodeURIComponent(id)}/legal');
      expect(legalPageSrc).not.toContain('/api/v1/buildings/');
    });

    it('validates magic bytes & Storage upload in multipart evidence/route.ts, rolls back on STORAGE_UPLOAD_FAILED, keeps JSON guards, and fixes briefing snapshot CTA', async () => {
      let uploadShouldFail = true;
      const uploadedPaths: string[] = [];

      const evDb = createMockDb(
        (q) => {
          if (q.table === 'building_ssot_lite' && q.operation === 'select') {
            return {
              data: { id: BUILDING_ID, owner_id: BROKER_A, completeness_score: 40, price_band: '90~100억' },
              error: null,
            };
          }
          if (q.table === 'evidence_files' && q.operation === 'select') {
            return { data: [], error: null };
          }
          if (q.table === 'evidence_files' && q.operation === 'insert') {
            return { data: { id: 'ev-file-01', ...(q.payload as object) }, error: null };
          }
          if (q.table === 'building_ssot_lite' && q.operation === 'update') {
            return { data: { id: BUILDING_ID }, error: null };
          }
          if (q.table === 'activity_events') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        {
          upload: async (bucket, storagePath) => {
            if (uploadShouldFail) {
              return { data: null, error: { message: 'storage bucket offline' } };
            }
            uploadedPaths.push(`${bucket}:${storagePath}`);
            return { data: { path: storagePath }, error: null };
          },
          download: async () => ({ data: null, error: { message: 'object not found' } }),
        },
      );
      mocks.createSupabaseClient.mockReturnValue(evDb.client);

      // 1) Backward-compatible JSON bucket & path validation + unuploaded file rejection
      const badBucketRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerCategory: 'photos',
            storageBucket: 'forbidden-bucket',
            storagePath: `${BUILDING_ID}/a.pdf`,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(badBucketRes.status).toBe(400);
      expect((await badBucketRes.json()).code).toBe('INVALID_STORAGE_BUCKET');

      const badPathRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerCategory: 'photos',
            storageBucket: 'evidence-private',
            storagePath: `${BROKER_B}/other.pdf`,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(badPathRes.status).toBe(400);
      expect((await badPathRes.json()).code).toBe('INVALID_STORAGE_PATH');

      const missingUploadRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerCategory: 'building_register',
            storageBucket: 'evidence-private',
            storagePath: `${BUILDING_ID}/building_register/fake.pdf`,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(missingUploadRes.status).toBe(400);
      expect((await missingUploadRes.json()).code).toBe('EVIDENCE_FILE_NOT_UPLOADED');

      // 2) Multipart with non-PDF/image magic bytes -> 400 UNSUPPORTED_FILE_TYPE
      const badMagicForm = new FormData();
      badMagicForm.append(
        'file',
        new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], 'malware.pdf', {
          type: 'application/pdf',
        }),
      );
      badMagicForm.append('layerCategory', 'building_register');
      const badMagicRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          body: badMagicForm,
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(badMagicRes.status).toBe(400);
      expect((await badMagicRes.json()).code).toBe('UNSUPPORTED_FILE_TYPE');

      // 3) Multipart with valid PDF when Storage fails -> 502 STORAGE_UPLOAD_FAILED & zero DB insert/score inflation
      const validPdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
      const failUploadForm = new FormData();
      failUploadForm.append(
        'file',
        new File([validPdfBytes], 'register.pdf', { type: 'application/pdf' }),
      );
      failUploadForm.append('layerCategory', 'building_register');
      const failUploadRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          body: failUploadForm,
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(failUploadRes.status).toBe(502);
      expect((await failUploadRes.json()).code).toBe('STORAGE_UPLOAD_FAILED');
      expect(
        evDb.queries.some((q) => q.table === 'evidence_files' && q.operation === 'insert'),
      ).toBe(false);
      expect(
        evDb.queries.some((q) => q.table === 'building_ssot_lite' && q.operation === 'update'),
      ).toBe(false);

      // 4) Multipart with valid PDF when Storage succeeds -> 200 & inserts evidence_files
      uploadShouldFail = false;
      const okUploadForm = new FormData();
      okUploadForm.append(
        'file',
        new File([validPdfBytes], 'building_register.pdf', { type: 'application/pdf' }),
      );
      okUploadForm.append('layerCategory', 'building_register');
      const okUploadRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          body: okUploadForm,
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(okUploadRes.status).toBe(200);
      const okUploadJson = await okUploadRes.json();
      expect(okUploadJson.ok).toBe(true);
      expect(uploadedPaths).toHaveLength(1);
      expect(uploadedPaths[0]).toContain(`evidence-private:${BUILDING_ID}/building_register/`);

      // 5) Studio files & briefing UI source checks
      const filesPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/buildings/[id]/studio/files/page.tsx'),
        'utf8',
      );
      expect(filesPageSrc).toContain('new FormData()');
      expect(filesPageSrc).not.toContain('Simulate presigned path');

      const briefingSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/buildings/[id]/studio/briefing/page.tsx'),
        'utf8',
      );
      expect(briefingSrc).toContain('/broker/buildings/${id}/snapshot');
      expect(briefingSrc).not.toContain('/broker/buildings/${id}/studio/snapshot');
    });
  });

  describe('P1-1..5 & P2-1..4: Studio OCC, Honest Land Chart, Pro IM Quota, AuthZ & A11y/Export Polish', () => {
    it('removes synthetic [42, 48, ...] land-price bars in SlidePreview.tsx, enforces 409 OCC on lockVersion in basic-im-studio/[id], and allowlists map-upload fieldName', async () => {
      const slidePreviewSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/app/(broker)/broker/basic-im-studio/[buildingId]/components/SlidePreview.tsx',
        ),
        'utf8',
      );
      expect(slidePreviewSrc).not.toContain('42, 48, 53');
      expect(slidePreviewSrc).toContain(
        '개별공시지가 다개년 이력 데이터 미수집 (공공데이터 연동 후 표시)',
      );
      expect(slidePreviewSrc).not.toContain('우상향');

      const db = createMockDb((q) => {
        if (q.table === 'building_ssot_lite') {
          return { data: { id: BUILDING_ID, owner_id: BROKER_A }, error: null };
        }
        if (q.table === 'workspace_items' && q.operation === 'select') {
          return {
            data: [
              {
                id: DOC_ID,
                owner_id: BROKER_A,
                kind: 'im',
                building_id: BUILDING_ID,
                status: 'published',
                title: '역삼 코너 빌딩',
                address: '서울특별시 강남구 역삼동 823-10',
                draft_payload: { title: '역삼 코너 빌딩' },
                published_snapshot: { title: '역삼 코너 빌딩 공개본' },
                version: 1,
              },
            ],
            error: null,
          };
        }
        if (q.table === 'workspace_items' && q.operation === 'update') {
          return { data: q.payload, error: null };
        }
        if (q.table === 'document_objects') {
          return { data: q.payload ?? null, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const project = await studioService.createBasicImProject(
        BUILDING_ID,
        '역삼 코너 빌딩',
        { ssot_summary: { address: '서울특별시 강남구 역삼동 823-10', asking_price_manwon: 950000 } },
        undefined,
        BROKER_A,
      );
      const coverSlide = project.slides[0];

      // Valid lockVersion=1 -> 200 and increments lockVersion to 2 while preserving publishedSnapshot
      const okPatch = await basicImStudioPatch(
        new NextRequest(`https://credeal.net/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'override',
            slideId: coverSlide.id,
            lockVersion: 1,
            overrides: { title: '역삼 코너 빌딩 (스튜디오 수정)' },
          }),
        }),
        { params: Promise.resolve({ id: project.id }) },
      );
      expect(okPatch.status).toBe(200);
      const okPatchJson = await okPatch.json();
      expect(okPatchJson.project.lockVersion).toBe(2);

      // Stale client lockVersion=1 -> 409 STALE_LOCK_ERROR
      const stalePatch = await basicImStudioPatch(
        new NextRequest(`https://credeal.net/api/broker/basic-im-studio/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'override',
            slideId: coverSlide.id,
            lockVersion: 1,
            overrides: { title: '구버전 덮어쓰기 시도' },
          }),
        }),
        { params: Promise.resolve({ id: project.id }) },
      );
      expect(stalePatch.status).toBe(409);
      expect((await stalePatch.json()).code).toBe('STALE_LOCK_ERROR');

      // map-upload rejects arbitrary fieldName with 400 INVALID_FIELD_NAME
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const mapForm = new FormData();
      mapForm.append('file', new File([pngHeader], 'map.png', { type: 'image/png' }));
      mapForm.append('slideId', coverSlide.id);
      mapForm.append('fieldName', 'arbitraryInjectedKey');
      const badFieldRes = await mapUploadPost(
        new NextRequest(`https://credeal.net/api/broker/basic-im-studio/${project.id}/map-upload`, {
          method: 'POST',
          body: mapForm,
        }),
        { params: Promise.resolve({ id: project.id }) },
      );
      expect(badFieldRes.status).toBe(400);
      expect((await badFieldRes.json()).code).toBe('INVALID_FIELD_NAME');
    });

    it('enforces IP rate limits on public Pro IM view/export and unifies PPTX+PDF pre-cutover download quota', async () => {
      const proDb = createMockDb((q) => {
        if (q.table === 'activity_events' && q.selectOpts?.head) {
          const inEvents = q.filters.event_type as string[] | undefined;
          const isUnified =
            Array.isArray(inEvents) &&
            inEvents.includes('im_pro_pptx_exported') &&
            inEvents.includes('im_pro_pdf_exported');
          return { data: null, count: isUnified ? 5 : 2, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(proDb.client);
      mocks.resolveProGrantByAnyId.mockResolvedValue({
        grant: {
          id: GRANT_ID,
          building_id: BUILDING_ID,
          status: 'active',
          is_revoked: false,
          nda_signed_at: '2026-11-18T00:00:00.000Z',
          pdf_export_allowed: true,
          max_downloads: 5,
          download_count: 0,
        },
        buildingId: BUILDING_ID,
      });
      mocks.verifyProGrantViewerAccess.mockResolvedValue({ ok: true });
      mocks.resolvePublishedImProDocument.mockResolvedValue({
        ok: true,
        doc: { id: DOC_ID, title: 'Pro IM', body: { sections: [] } },
      });

      // 1) Unified PPTX (3) + PDF (2) = 5 >= max_downloads (5) -> 429 on BOTH /export and /pptx
      const exportQuotaRes = await publicImProExportGet(
        new NextRequest(`https://credeal.net/api/public/im-pro/${GRANT_ID}/export`, {
          headers: { 'x-forwarded-for': '203.0.113.10' },
        }),
        { params: Promise.resolve({ grantId: GRANT_ID }) },
      );
      expect(exportQuotaRes.status).toBe(429);
      expect((await exportQuotaRes.json()).used).toBe(5);

      const pptxQuotaRes = await publicImProPptxGet(
        new NextRequest(`https://credeal.net/api/public/im-pro/${GRANT_ID}/pptx`, {
          headers: { 'x-forwarded-for': '203.0.113.11' },
        }),
        { params: Promise.resolve({ grantId: GRANT_ID }) },
      );
      expect(pptxQuotaRes.status).toBe(429);

      // 2) Rate limit on /api/public/im-pro/[grantId] (60/min) -> 61st returns 429 + Retry-After: 60
      mocks.resolveProGrantByAnyId.mockResolvedValue({ grant: null, buildingId: null });
      let lastViewRes: Response | null = null;
      for (let i = 0; i < 61; i += 1) {
        lastViewRes = await publicImProGet(
          new NextRequest(`https://credeal.net/api/public/im-pro/${GRANT_ID}`, {
            headers: { 'x-forwarded-for': '198.51.100.77' },
          }),
          { params: Promise.resolve({ grantId: GRANT_ID }) },
        );
      }
      expect(lastViewRes?.status).toBe(429);
      expect(lastViewRes?.headers.get('Retry-After')).toBe('60');

      // 3) Pure render check on im-pro/[grantId]/page.tsx
      const proPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(public)/im-pro/[grantId]/page.tsx'),
        'utf8',
      );
      expect(proPageSrc).not.toContain('expiresAt.getTime() - Date.now()');
    });

    it('enforces AuthZ & server-side blind redactions across buildings/rank, buildings/[id]/validate, studio-owner & buildings/[id]/disclosure', async () => {
      // 1) buildings/rank uses requireBroker (401 when unauthenticated) and masks 500 DB errors
      mocks.requireBroker.mockResolvedValueOnce({
        user: null,
        role: null,
        profile: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      const unauthRank = await buildingsRankGet(
        new NextRequest('https://credeal.net/api/broker/buildings/rank'),
      );
      expect(unauthRank.status).toBe(401);

      const rankErrDb = createMockDb(() => ({
        data: null,
        error: { code: 'XX000', message: 'pg_internal_secret_column_failure' },
      }));
      mocks.createSupabaseClient.mockReturnValue(rankErrDb.client);
      const rank500 = await buildingsRankGet(
        new NextRequest('https://credeal.net/api/broker/buildings/rank'),
      );
      expect(rank500.status).toBe(500);
      expect(await rank500.text()).not.toContain('pg_internal_secret_column_failure');
      expect(rankErrDb.queries[0].filters.owner_id).toBe(BROKER_A);
      expect(rankErrDb.queries[0].filters['neq:status']).toBe('archived');
      expect(rankErrDb.queries[0].orExpr).toBeNull();

      // 2) buildings/[id]/validate rejects foreign broker with 403 BEFORE returning early 200 validation result
      const foreignBldDb = createMockDb((q) => {
        if (q.table === 'building_ssot_lite') {
          return { data: { id: BUILDING_ID, owner_id: BROKER_B }, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(foreignBldDb.client);

      const validateForbidden = await buildingValidatePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investment_posture: 'income', asking_price_manwon: 0 }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(validateForbidden.status).toBe(403);

      // 3) studio-owner fails closed (403) on non-UUID deal without verified ownerId
      const unownedDb = createMockDb(() => ({ data: [], error: null }));
      mocks.createServiceClient.mockReturnValue(unownedDb.client);
      saveQuickImRecord({
        buildingId: 'bld-unowned-legacy',
        documentId: 'im-doc-unowned',
        address: '서울특별시 강남구 역삼동 1-1',
        buildingName: '무주물 빌딩',
        askingPriceManwon: 500000,
        posture: 'core_income',
        card4: {
          region: '강남구 역삼동',
          use: '근린생활시설',
          priceBand: '50~55억',
          points: ['역세권', '안정 수익', '코너 가시성'],
          provenance: { points: ['public', 'public', 'public'] },
          card4_version: 1,
        },
        basicImDoc: {} as any,
        rentRoll: [],
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      });
      const studioDenied = await assertStudioDealOwner(
        {
          user: { id: BROKER_A, email: 'broker-a@credeal.net' } as any,
          role: 'broker',
          profile: null,
          error: null,
        },
        'bld-unowned-legacy',
      );
      expect(studioDenied?.status).toBe(403);

      // 4) buildings/[id]/disclosure forces hide_exact_address, hide_tenant_names, hide_unit_rent when blind_teaser is enabled
      let persistedDisclosurePrefs: Record<string, unknown> | null = null;
      const discDb = createMockDb((q) => {
        if (q.table === 'building_ssot_lite' && q.operation === 'select') {
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_A, price_band: '90~100억' },
            error: null,
          };
        }
        if (q.table === 'evidence_files') {
          return { data: [], error: null };
        }
        if (q.table === 'building_ssot_lite' && q.operation === 'update') {
          persistedDisclosurePrefs = (q.payload as { disclosure_prefs: Record<string, unknown> })
            .disclosure_prefs;
          return { data: { id: BUILDING_ID }, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createSupabaseClient.mockReturnValue(discDb.client);

      const discRes = await buildingDisclosurePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/disclosure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blind_teaser: true,
            disclosurePrefs: {
              show_area_signal: true,
              hide_exact_address: false,
              hide_tenant_names: false,
              hide_unit_rent: false,
            },
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(discRes.status).toBe(200);
      expect(persistedDisclosurePrefs).toMatchObject({
        blind_teaser: true,
        hide_exact_address: true,
        hide_tenant_names: true,
        hide_unit_rent: true,
      });
    });

    it('mints share token into owner export QR URL and enforces >=14px typography & canonical /broker/w/im link', async () => {
      mocks.getServerViewer.mockResolvedValue({ userId: BROKER_A, isAdmin: false });
      const exportDb = createMockDb((q) => {
        if (q.table === 'workspace_items') return { data: [], error: null };
        if (q.table === 'activity_events') return { data: [], error: null };
        if (q.table === 'building_ssot_lite') {
          return {
            data: {
              id: BUILDING_ID,
              owner_id: BROKER_A,
              area_signal: '강남구 역삼동',
              asset_type: '근린생활시설',
              price_band: '90~100억',
            },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          return {
            data: {
              id: DOC_ID,
              building_id: BUILDING_ID,
              owner_id: BROKER_A,
              status: 'published',
              document_type: 'mobile_im',
              title: '역삼 코너 빌딩',
              created_at: '2026-11-18T00:00:00.000Z',
              body: {
                sections: [{ section_type: 'property_overview', title: '물건 개요', markdown: '개요 본문' }],
              },
            },
            error: null,
          };
        }
        if (q.table === 'profiles' || q.table === 'broker_profiles' || q.table === 'im_share_links') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(exportDb.client);

      const exportRes = await publicImLiteExportGet(
        new NextRequest(`https://credeal.net/api/public/im-lite/${BUILDING_ID}/export`),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(exportRes.status).toBe(200);
      expect(mocks.qrToDataURL).toHaveBeenCalledTimes(1);
      const qrViewerUrl = String(mocks.qrToDataURL.mock.calls[0][0]);
      expect(qrViewerUrl).toContain(`https://credeal.net/im-lite/${BUILDING_ID}?token=slk.`);

      const exportSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/api/public/im-lite/[buildingId]/export/route.ts'),
        'utf8',
      );
      expect(exportSrc).not.toContain('font-size:11px;color:#475569');
      expect(exportSrc).toContain('font-size:14px;color:#475569');

      const leverageChartSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(public)/im-lite/[buildingId]/leverage-chart.tsx'),
        'utf8',
      );
      expect(leverageChartSrc).not.toContain('fontSize="10"');
      expect(leverageChartSrc).not.toContain('fontSize="13"');
      expect(leverageChartSrc).toContain('fontSize="14"');

      const presetGallerySrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/broker/im-studio/PresetGallery.tsx'),
        'utf8',
      );
      expect(presetGallerySrc).toContain("whiteContrast >= 4.5");
      expect(presetGallerySrc).toContain("'WARN'");

      const fabSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/app/(public)/im-lite/[buildingId]/components/floating-action-bar.tsx',
        ),
        'utf8',
      );
      expect(fabSrc).not.toContain('/broker/im-approval/');
      expect(fabSrc).toContain('/broker/w/im?buildingId=');
    });
  });
});
