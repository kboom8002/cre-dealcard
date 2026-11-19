// @vitest-environment node
/**
 * Wave 7.4D — IM Closure Unit Suite
 *
 * Covers:
 *  - P0-1: `buildSanitizedImPublicSnapshot` strips broker-internal private notes & seller PII
 *          while preserving token-gated IM property specs, rentRoll/floor_leases, yield, coordinates,
 *          and parcels; `synthesizeQuickRecordFromImItem` falls back to `ssot_summary`, `basicImDocument`,
 *          and `floor_leases`/`rent_roll`; `fetchIMData` enriches `wsSnap` from `document_objects` +
 *          `building_ssot_lite` on UUID buildings; `/pptx` never overwrites non-zero `dbDoc.body` fields with 0.
 *  - P0-2: Anonymous public viewers (`fetchIMData`, `resolveOrSynthesizeQuickImRecord`, `/export`, `/pptx`)
 *          skip unpublished draft / `hasUnpublishedEdits` `im_upserted` events and serve the latest published
 *          event; `runBackfill` preserves `published` status & sanitized `lastPublishedPayload` snapshot on
 *          dirty IM edits while updating `draft_payload`, and gates `explicitPublished` IM backfill rows.
 *  - P1-1: `/translate` and `/export` redact `locked`, `min_tier === 'premium'` (on non-Pro), and both
 *          `hidden_sections` & `hiddenSections` (and `/translate` excludes `blind_teaser`).
 *  - P1-2: `/pptx?tier=pro` blocks privilege escalation to `decision_im` for non-privileged public viewers,
 *          and `/pptx`, `/export`, `/translate`, `/tts` fail closed (`503 GOVERNANCE_CHECK_UNAVAILABLE`)
 *          when `activity_events` revocation queries return non-schema DB errors.
 *  - P1-3: Zero `<14px` text tokens and 100% `min-h-[44px]` button compliance across `basic-im-studio` & `im-studio`.
 *  - P1-4: Pro IM `tfoot` & `/im-pro/[grantId]/export` exclude vacant and owner-use (`자가사용` / `owner_use`)
 *          rows from total deposit & monthly rent sums and emit occupancy status (`임대중` / `공실` / `자가사용`).
 *  - P1-5 & P2-1..3: `/views` handles non-UUID `bld-*` without `22P02` (primary + `42703` fallback) and masks
 *          500 DB errors; `resolveImVersion` never leaks `current_draft_version_id` on `access: 'public'`;
 *          `evidence/route.ts` enforces storage bucket allowlist & path segment check; `save-sections/route.ts`
 *          masks raw DB errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireBroker: vi.fn(),
  createServiceClient: vi.fn(),
  createSupabaseClient: vi.fn(),
  getServerViewer: vi.fn(),
  verifyShareLinkToken: vi.fn(),
  isBuildingShareLinkRevoked: vi.fn(),
  getWorkspaceItemByAnyId: vi.fn(),
  upsertWorkspaceItem: vi.fn(),
  getPublicWorkspaceProjection: vi.fn(),
  assertLegacyOrDbOwnership: vi.fn(),
  translateIMSections: vi.fn(),
  pptxRender: vi.fn(),
  resolveBrandAccent: vi.fn(),
  fetchBrokerContact: vi.fn(),
  toPptxBrokerInput: vi.fn(),
  resolveProGrantByAnyId: vi.fn(),
  verifyProGrantViewerAccess: vi.fn(),
  consumeProGrantDownload: vi.fn(),
  resolvePublishedImProDocument: vi.fn(),
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

vi.mock('@/lib/security/share-link-tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/share-link-tokens')>();
  return {
    ...actual,
    verifyShareLinkToken: (...args: unknown[]) => mocks.verifyShareLinkToken(...args),
    isBuildingShareLinkRevoked: (...args: unknown[]) => mocks.isBuildingShareLinkRevoked(...args),
  };
});

vi.mock('@/lib/workspace/workspace-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/workspace-repository')>();
  return {
    ...actual,
    getWorkspaceItemByAnyId: (...args: unknown[]) => mocks.getWorkspaceItemByAnyId(...args),
    upsertWorkspaceItem: (...args: unknown[]) => mocks.upsertWorkspaceItem(...args),
    getPublicWorkspaceProjection: (...args: unknown[]) =>
      mocks.getPublicWorkspaceProjection(...args),
    assertLegacyOrDbOwnership: (...args: unknown[]) => mocks.assertLegacyOrDbOwnership(...args),
  };
});

vi.mock('@/domain/building/mobile-im/translator', () => ({
  translateIMSections: (...args: unknown[]) => mocks.translateIMSections(...args),
}));

vi.mock('@/domain/building/mobile-im/pptx/pptx-renderer', () => ({
  MobileImPptxRenderer: class {
    render(input: unknown) {
      mocks.pptxRender(input);
      return Promise.resolve({
        buffer: Buffer.from('PK-mock-pptx'),
        slideCount: 10,
        fileSizeBytes: 12,
        warnings: [],
        auditReport: { totalViolations: 0, layoutViolations: [], standardViolations: [] },
      });
    }
  },
}));

vi.mock('@/domain/building/mobile-im/pptx/brand-skin', () => ({
  resolveBrandAccent: (...args: unknown[]) => mocks.resolveBrandAccent(...args),
}));

vi.mock('@/domain/broker/broker-contact', () => ({
  fetchBrokerContact: (...args: unknown[]) => mocks.fetchBrokerContact(...args),
  toPptxBrokerInput: (...args: unknown[]) => mocks.toPptxBrokerInput(...args),
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

import { buildSanitizedImPublicSnapshot } from '@/lib/workspace/summary/patch-upsert-im';
import {
  clearQuickImStoreForTest,
  resolveOrSynthesizeQuickImRecord,
  synthesizeQuickRecordFromImItem,
} from '@/lib/im-lite/quick-generate-store';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';
import { GET as publicPptxGet } from '@/app/api/public/im-lite/[buildingId]/pptx/route';
import { GET as publicExportGet } from '@/app/api/public/im-lite/[buildingId]/export/route';
import { POST as publicTranslatePost } from '@/app/api/public/im-lite/[buildingId]/translate/route';
import { GET as publicTtsGet } from '@/app/api/public/im-lite/[buildingId]/tts/route';
import { GET as publicImProExportGet } from '@/app/api/public/im-pro/[grantId]/export/route';
import { GET as brokerViewsGet } from '@/app/api/broker/im-lite/[id]/views/route';
import { PUT as saveSectionsPut } from '@/app/api/broker/im-lite/[id]/save-sections/route';
import { POST as evidencePost } from '@/app/api/broker/buildings/[id]/evidence/route';
import { resolveImVersion } from '@/domain/building/im-core/version-resolver';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';
import { runBackfill } from '../../../../scripts/backfill-workspace-items';

const BROKER_ID = '11117400-7400-4111-8111-111111117401';
const OTHER_BROKER_ID = '22227400-7400-4222-8222-222222227402';
const BUILDING_ID = 'aaaa7400-7400-4111-8111-aaaaaaaa7401';
const DOC_ID = 'dddd7400-7400-4111-8111-dddddddd7401';
const GRANT_ID = 'gggg7400-7400-4111-8111-gggggggg7401';

interface MockQueryState {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert';
  selectCols: string;
  filters: Record<string, unknown>;
  orExpr: string | null;
  rangeFrom?: number;
  rangeTo?: number;
  payload?: unknown;
  terminal: 'many' | 'maybeSingle' | 'single';
}

interface MockDbResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

function createMockDb(handler: (q: MockQueryState) => MockDbResult | Promise<MockDbResult>) {
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
      select(cols = '*') {
        state.selectCols = cols;
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
      in(col: string, vals: readonly unknown[]) {
        state.filters[col] = vals;
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        state.filters[`not:${col}:${op}`] = val;
        return builder;
      },
      contains(col: string, val: unknown) {
        state.filters[`contains:${col}`] = val;
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
      range(fromIdx: number, toIdx: number) {
        state.rangeFrom = fromIdx;
        state.rangeTo = toIdx;
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
    from: () => ({
      upload: async () => ({ data: null, error: { message: 'storage disabled in unit test' } }),
      createSignedUrl: async () => ({ data: null, error: null }),
      download: async () => ({ data: null, error: { message: 'cache miss' } }),
    }),
    createBucket: async () => ({ data: null, error: null }),
  };

  return {
    client: { from, storage },
    queries,
  };
}

describe('Wave 7.4D IM Closure Unit Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitBuckets();
    clearQuickImStoreForTest();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    mocks.requireBroker.mockResolvedValue({
      user: { id: BROKER_ID, email: 'broker@credeal.net' },
      role: 'broker',
      profile: { role: 'broker', display_name: '박준호' },
      error: null,
    });
    mocks.getServerViewer.mockResolvedValue({ userId: null, isAdmin: false });
    mocks.verifyShareLinkToken.mockResolvedValue({ valid: true, buildingId: BUILDING_ID });
    mocks.isBuildingShareLinkRevoked.mockReturnValue(false);
    mocks.getWorkspaceItemByAnyId.mockResolvedValue(null);
    mocks.upsertWorkspaceItem.mockResolvedValue({ item: { id: DOC_ID, status: 'published' } });
    mocks.getPublicWorkspaceProjection.mockResolvedValue({
      item: null,
      snapshot: null,
      tableAvailable: false,
    });
    mocks.assertLegacyOrDbOwnership.mockResolvedValue({
      existingItem: null,
      ownerId: BROKER_ID,
    });
    mocks.resolveBrandAccent.mockResolvedValue(null);
    mocks.fetchBrokerContact.mockResolvedValue(null);
    mocks.toPptxBrokerInput.mockReturnValue(null);
    mocks.translateIMSections.mockImplementation(async ({ sections }: { sections: unknown[] }) =>
      sections,
    );
  });

  afterEach(() => {
    clearRateLimitBuckets();
    clearQuickImStoreForTest();
    vi.restoreAllMocks();
  });

  describe('P0-1: Sanitized Public Snapshot Preservation & Non-Zero IM Hydration', () => {
    it('preserves property specs, rentRoll/floor_leases, yield, coordinates & parcels while stripping privateMemo and seller PII, and synthesizes non-zero IM facts from dbDocBody', async () => {
      const dbDocBody: Record<string, unknown> = {
        schemaVersion: '3.0',
        tier: 'basic',
        buildingName: '역삼 코너 메디컬타워',
        resolved_address: '서울특별시 강남구 역삼동 823-10',
        pnu: '1168010100108230010',
        coordinates: { lat: 37.5006, lng: 127.0364 },
        parcels: [{ pnu: '1168010100108230010', areaSqm: 420, isPrimary: true }],
        privateMemo: '매도인 급매 내부 사정 — 절대 비공개',
        memoText: '내부 협상 하한가 112억',
        pairedMemoId: 'memo-secret-01',
        internalNotes: '중개인 전용 비밀 노트',
        ownerPhone: '010-1234-5678',
        sellerPhone: '010-8765-4321',
        ownerEmail: 'owner@secret.example',
        sellerEmail: 'seller@secret.example',
        handoverNote: '잔금 시 3층 명도 협의 가능',
        brokerExtras: { closingLine: '역삼역 초역세권 코너 수익형 빌딩' },
        floor_leases: [
          {
            floor: '1F',
            tenant: '스타약국',
            tenant_type: '약국',
            area_sqm: 180,
            deposit_krw: 200_000_000,
            monthly_rent_krw: 12_000_000,
            occupancy_status: '임대중',
          },
          {
            floor: '2F',
            tenant: '프라임내과',
            tenant_type: '의원',
            area_sqm: 320,
            deposit_manwon: 15_000,
            monthly_rent_manwon: 1_500,
            occupancy_status: '임대중',
          },
        ],
        ssot_summary: {
          address: '서울특별시 강남구 역삼동 823-10',
          road_address: '서울특별시 강남구 테헤란로 152',
          asking_price_manwon: 1_200_000,
          total_gross_area_sqm: 1_650,
          land_area_sqm: 420,
          zoning: '일반상업지역',
          completion_date: '2019-06-15',
          floors_above: 7,
          floors_below: 2,
          bcr_pct: 58.4,
          far_pct: 392.8,
          gross_yield_pct: 2.78,
          cap_rate_pct: 2.43,
          privateMemo: '중첩 내부 메모도 제거되어야 함',
        },
      };

      const sanitized = buildSanitizedImPublicSnapshot(dbDocBody);

      // Private notes & seller PII stripped at root and nested depths
      expect(sanitized).not.toHaveProperty('privateMemo');
      expect(sanitized).not.toHaveProperty('memoText');
      expect(sanitized).not.toHaveProperty('pairedMemoId');
      expect(sanitized).not.toHaveProperty('internalNotes');
      expect(sanitized).not.toHaveProperty('ownerPhone');
      expect(sanitized).not.toHaveProperty('sellerPhone');
      expect(sanitized).not.toHaveProperty('ownerEmail');
      expect(sanitized).not.toHaveProperty('sellerEmail');
      expect(sanitized.ssot_summary as Record<string, unknown>).not.toHaveProperty('privateMemo');

      // Token-gated IM fields preserved
      expect(sanitized.resolved_address).toBe('서울특별시 강남구 역삼동 823-10');
      expect(sanitized.pnu).toBe('1168010100108230010');
      expect(sanitized.coordinates).toEqual({ lat: 37.5006, lng: 127.0364 });
      expect(sanitized.parcels).toHaveLength(1);
      expect(sanitized.floor_leases).toHaveLength(2);
      expect(sanitized.handoverNote).toBe('잔금 시 3층 명도 협의 가능');
      expect(sanitized.brokerExtras).toEqual({ closingLine: '역삼역 초역세권 코너 수익형 빌딩' });

      // Synthesize QuickRecord from snake_case dbDocBody without top-level camelCase scalars
      const synth = synthesizeQuickRecordFromImItem(BUILDING_ID, sanitized);
      expect(synth.askingPriceManwon).toBe(1_200_000);
      expect(synth.specs?.gfaSqm).toBe(1_650);
      expect(synth.specs?.landAreaSqm).toBe(420);
      expect(synth.specs?.zoning).toBe('일반상업지역');
      expect(synth.rentRoll).toHaveLength(2);
      expect(synth.rentRoll[0].depositManwon).toBe(20_000);
      expect(synth.rentRoll[0].monthlyRentManwon).toBe(1_200);
      expect(synth.basicImDoc.facts.valuation.grossYieldPct).toBeGreaterThan(2.5);

      // fetchIMData on UUID building enriches wsSnap with published document_objects instead of short-circuiting to zero
      mocks.getWorkspaceItemByAnyId.mockResolvedValue({
        id: DOC_ID,
        ownerId: BROKER_ID,
        buildingId: BUILDING_ID,
        status: 'published',
        revokedAt: null,
        deletedAt: null,
      });
      mocks.getPublicWorkspaceProjection.mockResolvedValue({
        projection: {
          id: DOC_ID,
          kind: 'im',
          status: 'published',
          snapshot: { title: '역삼 코너 메디컬타워', address: '서울특별시 강남구 역삼동 823-10' },
        },
        tableAvailable: true,
      });

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') return { data: [], error: null };
        if (q.table === 'building_ssot_lite') {
          return {
            data: {
              id: BUILDING_ID,
              owner_id: BROKER_ID,
              status: 'public_signal_ready',
              raw_address: '서울특별시 강남구 역삼동 823-10',
            },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          return {
            data: {
              id: DOC_ID,
              building_id: BUILDING_ID,
              owner_id: BROKER_ID,
              status: 'published',
              document_type: 'mobile_im',
              created_at: '2026-11-18T10:00:00.000Z',
              updated_at: '2026-11-18T10:00:00.000Z',
              body: {
                ...sanitized,
                sections: [
                  {
                    section_type: 'property_overview',
                    title: '물건 개요',
                    markdown: '연면적 1,650㎡, 매매가 120억원 역삼동 수익형 빌딩입니다.',
                  },
                ],
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const imDoc = await fetchIMData(
        BUILDING_ID,
        undefined,
        { userId: null, isAdmin: false },
        { token: 'slk.valid', enforceShareToken: true },
      );

      expect(imDoc).not.toBeNull();
      const imRecord = imDoc as unknown as {
        ssotSummary?: Record<string, unknown>;
        floor_leases?: unknown[];
        basicImDocument?: { facts?: { transaction?: { askingPriceKrw?: number } } };
      };
      expect(imRecord.ssotSummary?.asking_price_manwon).toBe(1_200_000);
      expect(imRecord.ssotSummary?.total_gross_area_sqm).toBe(1_650);
      expect(imRecord.floor_leases).toHaveLength(2);
      expect(imRecord.basicImDocument?.facts?.transaction?.askingPriceKrw).toBe(
        12_000_000_000,
      );
    });

    it('never overwrites non-zero dbDoc.body scalars with zeroed synthesized quickRec fields in /pptx', async () => {
      // Seed a synthesized quickRec with 0 askingPriceManwon and newer updatedAt
      synthesizeQuickRecordFromImItem(
        BUILDING_ID,
        {
          id: DOC_ID,
          buildingId: BUILDING_ID,
          title: '역삼 코너 메디컬타워',
          address: '서울특별시 강남구 역삼동 823-10',
          askingPriceManwon: 0,
          gfaSqm: 0,
          landAreaSqm: 0,
        },
        undefined,
        '2026-11-18T12:00:00.000Z',
        BROKER_ID,
      );

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') return { data: [], error: null };
        if (q.table === 'building_ssot_lite') {
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_ID, raw_address: '서울시 강남구 역삼동 823-10' },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          return {
            data: {
              id: DOC_ID,
              building_id: BUILDING_ID,
              owner_id: BROKER_ID,
              document_type: 'mobile_im',
              status: 'published',
              created_at: '2026-11-18T08:00:00.000Z',
              updated_at: '2026-11-18T08:00:00.000Z',
              body: {
                tier: 'basic',
                dataGrade: 'A',
                buildingName: '역삼 코너 메디컬타워',
                sections: [{ section_type: 'property_overview', markdown: '본문' }],
                floor_leases: [{ floor: '1F', tenant: '스타약국', monthly_rent_manwon: 1_200 }],
                ssot_summary: {
                  address: '서울특별시 강남구 역삼동 823-10',
                  asking_price_manwon: 1_200_000,
                  total_gross_area_sqm: 1_650,
                  land_area_sqm: 420,
                  investment_posture: 'income',
                },
                basicImDocument: {
                  facts: {
                    transaction: { askingPriceManwon: 1_200_000 },
                    building: { totalGrossAreaSqm: 1_650 },
                  },
                },
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createSupabaseClient.mockReturnValue(db.client);
      mocks.createServiceClient.mockReturnValue(db.client);

      const res = await publicPptxGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/pptx?direct=1&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );

      expect(res.status).toBe(200);
      expect(mocks.pptxRender).toHaveBeenCalledTimes(1);
      const renderArg = mocks.pptxRender.mock.calls[0][0] as {
        doc: {
          body: {
            ssot_summary: Record<string, unknown>;
            floor_leases: unknown[];
            basicImDocument: { facts: { transaction: { askingPriceManwon: number } } };
          };
        };
      };
      expect(renderArg.doc.body.ssot_summary.asking_price_manwon).toBe(1_200_000);
      expect(renderArg.doc.body.ssot_summary.total_gross_area_sqm).toBe(1_650);
      expect(renderArg.doc.body.floor_leases).toHaveLength(1);
      expect(renderArg.doc.body.basicImDocument.facts.transaction.askingPriceManwon).toBe(
        1_200_000,
      );
    });
  });

  describe('P0-2: Block Unpublished Draft im_upserted Leakage & Cutover Backfill Dirty-IM Guard', () => {
    it('skips draft / hasUnpublishedEdits im_upserted events for anonymous public viewers while selecting the latest published event', async () => {
      const legacyId = 'bld-custom-740';
      const events = [
        {
          actor_id: BROKER_ID,
          entity_id: BROKER_ID,
          event_type: 'im_upserted',
          created_at: '2026-11-18T11:00:00.000Z',
          metadata: {
            building_id: legacyId,
            status: 'draft',
            hasUnpublishedEdits: true,
            im_item: {
              id: legacyId,
              buildingId: legacyId,
              status: 'draft',
              hasUnpublishedEdits: true,
              title: '비공개 수정중 타이틀 (절대 노출 금지)',
              address: '서울특별시 강남구 논현동 100-1',
              askingPriceManwon: 1_900_000,
              gfaSqm: 980,
              landAreaSqm: 310,
            },
          },
        },
        {
          actor_id: BROKER_ID,
          entity_id: BROKER_ID,
          event_type: 'im_upserted',
          created_at: '2026-11-18T09:00:00.000Z',
          metadata: {
            building_id: legacyId,
            status: 'published',
            im_item: {
              id: legacyId,
              buildingId: legacyId,
              status: 'published',
              hasUnpublishedEdits: false,
              title: '공개 승인된 논현 빌딩',
              address: '서울특별시 강남구 논현동 100-1',
              askingPriceManwon: 1_350_000,
              gfaSqm: 980,
              landAreaSqm: 310,
            },
          },
        },
      ];

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') return { data: events, error: null };
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);
      mocks.verifyShareLinkToken.mockResolvedValue({ valid: true, buildingId: legacyId });

      // 1) resolveOrSynthesizeQuickImRecord with publishedOnly: true selects 135억 published, NOT 190억 draft
      const pubQuick = await resolveOrSynthesizeQuickImRecord(legacyId, db.client, null, {
        publishedOnly: true,
      });
      expect(pubQuick).not.toBeNull();
      expect(pubQuick!.buildingName).toBe('공개 승인된 논현 빌딩');
      expect(pubQuick!.askingPriceManwon).toBe(1_350_000);

      // 2) Anonymous fetchIMData serves published version, never the dirty draft title
      clearQuickImStoreForTest();
      const anonDoc = await fetchIMData(
        legacyId,
        undefined,
        { userId: null, isAdmin: false },
        { token: 'slk.valid', enforceShareToken: true },
      );
      expect(anonDoc).not.toBeNull();
      expect(anonDoc!.blindName).toBe('공개 승인된 논현 빌딩');
      expect(anonDoc!.blindName).not.toContain('비공개 수정중');

      // 3) Owner preview still sees latest draft edit
      clearQuickImStoreForTest();
      const ownerDoc = await fetchIMData(legacyId, undefined, {
        userId: BROKER_ID,
        isAdmin: false,
      });
      expect(ownerDoc).not.toBeNull();
      expect(ownerDoc!.blindName).toBe('비공개 수정중 타이틀 (절대 노출 금지)');
    });

    it('preserves published status & sanitized lastPublishedPayload on dirty IM backfill and gates incomplete IM rows', async () => {
      const bldDirtyPublished = 'bbbb7401-7400-4111-8111-bbbbbbbb7401';
      const bldMissingCore = 'bbbb7402-7400-4222-8222-bbbbbbbb7402';
      const unstatBroker = '33337400-7400-4333-8333-333333337403';
      const bldMissingStatutory = 'bbbb7403-7400-4333-8333-bbbbbbbb7403';

      const events = [
        // 1a) Published IM with complete core + statutory fields (and privateMemo to strip)
        {
          id: 'im-ev-1',
          actor_id: BROKER_ID,
          entity_id: bldDirtyPublished,
          event_type: 'im_upserted',
          created_at: '2026-11-18T08:00:00.000Z',
          metadata: {
            building_id: bldDirtyPublished,
            status: 'published',
            im_item: {
              id: bldDirtyPublished,
              buildingId: bldDirtyPublished,
              status: 'published',
              title: '청담동 승인 완료 빌딩',
              address: '서울특별시 강남구 청담동 88-1',
              askingPriceManwon: 1_200_000,
              gfaSqm: 1_100,
              privateMemo: '매도인 비밀 메모',
              rentRoll: [{ floor: '1F', tenant: '청담카페', monthlyRentManwon: 950 }],
            },
          },
        },
        // 1b) Newer dirty draft save on the already-published IM
        {
          id: 'im-ev-2',
          actor_id: BROKER_ID,
          entity_id: bldDirtyPublished,
          event_type: 'im_upserted',
          created_at: '2026-11-18T09:30:00.000Z',
          metadata: {
            building_id: bldDirtyPublished,
            status: 'draft',
            im_item: {
              id: bldDirtyPublished,
              buildingId: bldDirtyPublished,
              status: 'draft',
              hasUnpublishedEdits: true,
              title: '청담동 미발행 초안 수정본',
              address: '서울특별시 강남구 청담동 88-1',
              askingPriceManwon: 1_550_000,
              gfaSqm: 1_100,
            },
          },
        },
        // 2) Published IM missing price/address -> downgraded to draft
        {
          id: 'im-ev-3',
          actor_id: BROKER_ID,
          entity_id: bldMissingCore,
          event_type: 'im_upserted',
          created_at: '2026-11-18T10:00:00.000Z',
          metadata: {
            building_id: bldMissingCore,
            status: 'published',
            im_item: {
              id: bldMissingCore,
              title: '주소·가격 누락 매물',
              address: '',
              askingPriceManwon: 0,
            },
          },
        },
        // 3) Published IM by broker missing statutory registration number -> downgraded to draft
        {
          id: 'im-ev-4',
          actor_id: unstatBroker,
          entity_id: bldMissingStatutory,
          event_type: 'im_upserted',
          created_at: '2026-11-18T10:05:00.000Z',
          metadata: {
            building_id: bldMissingStatutory,
            status: 'published',
            im_item: {
              id: bldMissingStatutory,
              title: '법정표시 미비 매물',
              address: '서울특별시 서초구 서초동 1300-1',
              askingPriceManwon: 850_000,
            },
          },
        },
      ];

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') {
          const start = q.rangeFrom ?? 0;
          const end = (q.rangeTo ?? events.length - 1) + 1;
          return { data: events.slice(start, end), error: null };
        }
        if (q.table === 'profiles') {
          return {
            data: [
              {
                id: BROKER_ID,
                display_name: '박준호',
                company: '강남프라임공인중개사사무소',
                phone: '02-555-7890',
              },
              {
                id: unstatBroker,
                display_name: '김미비',
                company: null,
                phone: null,
              },
            ],
            error: null,
          };
        }
        if (q.table === 'broker_profiles') {
          return {
            data: [
              {
                user_id: BROKER_ID,
                office_address: '서울특별시 강남구 테헤란로 152',
                office_reg_number: '11680-2024-00456',
                representative_name: '박준호',
                card_name: '박준호',
              },
            ],
            error: null,
          };
        }
        if (q.table === 'building_ssot_lite') {
          return {
            data: [
              { id: bldDirtyPublished },
              { id: bldMissingCore },
              { id: bldMissingStatutory },
            ],
            error: null,
          };
        }
        if (q.table === 'workspace_items') {
          return { data: [], error: null };
        }
        return { data: [], error: null };
      });

      const report = await runBackfill({
        apply: false,
        supabaseOverride: db.client as unknown as NonNullable<
          Parameters<typeof runBackfill>[0]
        >['supabaseOverride'],
      });

      expect(report.byStatus.published).toBe(1);
      expect(report.byStatus.draft).toBe(2);
      expect(report.gateRejections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'IM_CORE_FIELDS_INCOMPLETE' }),
          expect.objectContaining({ code: 'STATUTORY_DISCLOSURE_INCOMPLETE' }),
        ]),
      );

      const dirtyCand = report.candidates.find((c) => c.building_id === bldDirtyPublished);
      expect(dirtyCand).toBeDefined();
      expect(dirtyCand!.status).toBe('published');
      // published_snapshot retains the last published 120억 payload (with privateMemo stripped & rentRoll preserved)
      expect(dirtyCand!.published_snapshot?.title).toBe('청담동 승인 완료 빌딩');
      expect(dirtyCand!.published_snapshot?.askingPriceManwon).toBe(1_200_000);
      expect(dirtyCand!.published_snapshot?.rentRoll).toHaveLength(1);
      expect(dirtyCand!.published_snapshot).not.toHaveProperty('privateMemo');
      // draft_payload retains the newer dirty 155억 edits
      expect(dirtyCand!.draft_payload.title).toBe('청담동 미발행 초안 수정본');
      expect(dirtyCand!.draft_payload.askingPriceManwon).toBe(1_550_000);
    });
  });

  describe('P1-1: Public /translate & /export Section Redaction', () => {
    it('redacts locked, min_tier=premium (on non-Pro), hidden_sections, and hiddenSections in /translate and /export, and blocks blind_teaser in /translate', async () => {
      const docBody = {
        tier: 'basic',
        hidden_sections: ['secret_snake_sec'],
        hiddenSections: ['secret_camel_sec'],
        sections: [
          {
            section_type: 'property_overview',
            title: '물건 개요',
            markdown: '공개 허용 본문입니다.',
            locked: false,
          },
          {
            section_type: 'locked_dcf',
            title: '잠금 DCF',
            markdown: '잠금 섹션 기밀 수치 999억',
            locked: true,
          },
          {
            section_type: 'pro_only_alpha',
            title: 'Pro 전용 심층 분석',
            markdown: '프리미엄 전용 기밀 시나리오',
            min_tier: 'premium',
          },
          {
            section_type: 'secret_snake_sec',
            title: '숨김 섹션 1',
            markdown: 'hidden_sections 비노출 텍스트',
          },
          {
            section_type: 'secret_camel_sec',
            title: '숨김 섹션 2',
            markdown: 'hiddenSections 비노출 텍스트',
          },
        ],
      };

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') return { data: [], error: null };
        if (q.table === 'building_ssot_lite') {
          return {
            data: { owner_id: BROKER_ID, area_signal: '역삼권역', asset_type: '오피스', price_band: '120억' },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          const allowedTypes = (q.filters.document_type as string[] | undefined) || [];
          if (allowedTypes.length > 0) {
            expect(allowedTypes).not.toContain('blind_teaser');
          }
          return {
            data: {
              id: DOC_ID,
              owner_id: BROKER_ID,
              building_id: BUILDING_ID,
              title: '역삼 프라임 타워',
              status: 'published',
              document_type: 'mobile_im',
              body: docBody,
              metadata: {},
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      // 1) /translate (ko)
      const trKoRes = await publicTranslatePost(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/translate?token=slk.valid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'ko', doc_id: DOC_ID }),
          },
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(trKoRes.status).toBe(200);
      const trKoJson = (await trKoRes.json()) as { sections: Array<{ content: string; sectionId: string }> };
      expect(trKoJson.sections).toHaveLength(1);
      expect(trKoJson.sections[0].sectionId).toBe('property_overview');

      // 2) /translate (en -> OpenAI payload also redacted)
      const trEnRes = await publicTranslatePost(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/translate?token=slk.valid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'en', doc_id: DOC_ID }),
          },
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(trEnRes.status).toBe(200);
      expect(mocks.translateIMSections).toHaveBeenCalledTimes(1);
      const sentToOpenAi = (mocks.translateIMSections.mock.calls[0][0] as { sections: unknown[] })
        .sections;
      expect(sentToOpenAi).toHaveLength(1);

      // 3) /export HTML redacts all 4 restricted sections
      const expRes = await publicExportGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/export?format=html&doc_id=${DOC_ID}&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(expRes.status).toBe(200);
      const expHtml = await expRes.text();
      expect(expHtml).toContain('공개 허용 본문입니다.');
      expect(expHtml).not.toContain('잠금 섹션 기밀 수치');
      expect(expHtml).not.toContain('프리미엄 전용 기밀 시나리오');
      expect(expHtml).not.toContain('hidden_sections 비노출 텍스트');
      expect(expHtml).not.toContain('hiddenSections 비노출 텍스트');
    });
  });

  describe('P1-2: /pptx?tier=pro Escalation Block & 503 Fail-Closed Revocation', () => {
    it('ignores untrusted ?tier=pro on public /pptx (keeping basic / fact_om) while allowing verified owner', async () => {
      const db = createMockDb((q) => {
        if (q.table === 'activity_events') return { data: [], error: null };
        if (q.table === 'building_ssot_lite') {
          return {
            data: { id: BUILDING_ID, owner_id: BROKER_ID, raw_address: '서울시 강남구 역삼동 823-10' },
            error: null,
          };
        }
        if (q.table === 'document_objects') {
          return {
            data: {
              id: DOC_ID,
              building_id: BUILDING_ID,
              owner_id: BROKER_ID,
              document_type: 'mobile_im',
              status: 'published',
              body: {
                dataGrade: 'A',
                buildingName: '역삼 타워',
                sections: [{ section_type: 'property_overview', markdown: '개요' }],
                ssot_summary: {
                  address: '서울시 강남구 역삼동 823-10',
                  asking_price_manwon: 1_000_000,
                  total_gross_area_sqm: 1_200,
                  investment_posture: 'income',
                },
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createSupabaseClient.mockReturnValue(db.client);
      mocks.createServiceClient.mockReturnValue(db.client);

      // Anonymous token-holder passing ?tier=pro&preset=credeal_signature -> forced to basic / fact_om
      const anonRes = await publicPptxGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/pptx?direct=1&tier=pro&preset=credeal_signature&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(anonRes.status).toBe(200);
      const anonRenderArg = mocks.pptxRender.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(anonRenderArg.releaseTier).toBe('fact_om');
      expect(anonRenderArg.preset).toBe('credeal_basic');
      expect(decodeURIComponent(anonRes.headers.get('X-Safe-Filename') || '')).toContain(
        '_Basic_IM.pptx',
      );

      // Verified owner passing ?tier=pro -> permitted
      mocks.getServerViewer.mockResolvedValue({ userId: BROKER_ID, isAdmin: false });
      const ownerRes = await publicPptxGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/pptx?direct=1&tier=pro`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(ownerRes.status).toBe(200);
      const ownerRenderArg = mocks.pptxRender.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(ownerRenderArg.releaseTier).toBe('decision_im');
    });

    it('fails closed with 503 GOVERNANCE_CHECK_UNAVAILABLE across /pptx, /export, /translate, and /tts on revocation DB failure', async () => {
      const brokenGovDb = createMockDb((q) => {
        if (q.table === 'activity_events') {
          return {
            data: null,
            error: { code: '08006', message: 'connection to postgres lost' },
          };
        }
        return { data: null, error: null };
      });
      mocks.createSupabaseClient.mockReturnValue(brokenGovDb.client);
      mocks.createServiceClient.mockReturnValue(brokenGovDb.client);

      const pptxRes = await publicPptxGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/pptx?direct=1&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(pptxRes.status).toBe(503);
      expect(((await pptxRes.json()) as { code?: string }).code).toBe(
        'GOVERNANCE_CHECK_UNAVAILABLE',
      );

      const exportRes = await publicExportGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/export?format=html&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(exportRes.status).toBe(503);
      expect(((await exportRes.json()) as { code?: string }).code).toBe(
        'GOVERNANCE_CHECK_UNAVAILABLE',
      );

      const translateRes = await publicTranslatePost(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/translate?token=slk.valid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'ko', doc_id: DOC_ID }),
          },
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(translateRes.status).toBe(503);
      expect(((await translateRes.json()) as { code?: string }).code).toBe(
        'GOVERNANCE_CHECK_UNAVAILABLE',
      );

      const ttsRes = await publicTtsGet(
        new NextRequest(
          `https://credeal.net/api/public/im-lite/${BUILDING_ID}/tts?language=ko&token=slk.valid`,
        ),
        { params: Promise.resolve({ buildingId: BUILDING_ID }) },
      );
      expect(ttsRes.status).toBe(503);
      expect(((await ttsRes.json()) as { code?: string }).code).toBe(
        'GOVERNANCE_CHECK_UNAVAILABLE',
      );
    });
  });

  describe('P1-3: Basic IM Studio ≥14px Typography & ≥44px Interactive Touch Targets', () => {
    it('contains zero <14px Tailwind text tokens and ensures min-h-[44px] on all studio buttons', () => {
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) out.push(...walk(full));
          else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
        }
        return out;
      };

      const studioFiles = [
        ...walk(path.resolve(process.cwd(), 'src/app/(broker)/broker/basic-im-studio')),
        ...walk(path.resolve(process.cwd(), 'src/components/broker/im-studio')),
      ];
      expect(studioFiles.length).toBeGreaterThanOrEqual(9);

      const sub14Re =
        /(?:^|[\s"'`])(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|[\s"'`/])/;
      for (const file of studioFiles) {
        const src = fs.readFileSync(file, 'utf8');
        expect(src, `Sub-14px token found in ${file}`).not.toMatch(sub14Re);

        const btnRe = /<button\b[\s\S]*?<\/button>/g;
        let match: RegExpExecArray | null;
        while ((match = btnRe.exec(src)) !== null) {
          expect(
            match[0],
            `Button missing min-h-[44px] in ${file}: ${match[0].slice(0, 120)}`,
          ).toMatch(/min-h-\[(?:4[4-9]|[5-9]\d|\d{3,})px\]/);
        }
      }
    });
  });

  describe('P1-4: Pro IM Rent-Roll Totals Exclude Vacant & Owner-Use Rows', () => {
    it('excludes vacant and 자가사용/owner_use rows from tfoot deposit & rent sums and emits occupancy status in /im-pro/[grantId]/export', async () => {
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
              office_address: '서울특별시 강남구 테헤란로 152',
              representative_name: '박준호',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      mocks.resolveProGrantByAnyId.mockResolvedValue({
        grant: {
          id: GRANT_ID,
          building_id: BUILDING_ID,
          status: 'active',
          is_revoked: false,
          nda_signed_at: '2026-11-18T08:00:00.000Z',
          pdf_export_allowed: true,
          expires_at: '2027-11-18T08:00:00.000Z',
          max_downloads: 5,
          download_count: 0,
          requester_name: '이매수',
          requester_phone: '010-2222-3333',
        },
        buildingId: BUILDING_ID,
      });
      mocks.verifyProGrantViewerAccess.mockResolvedValue({ ok: true });
      mocks.consumeProGrantDownload.mockResolvedValue({ ok: true, limit: 5, used: 1 });
      mocks.resolvePublishedImProDocument.mockResolvedValue({
        ok: true,
        doc: {
          id: DOC_ID,
          owner_id: BROKER_ID,
          body: {
            title: '역삼 Pro IM',
            sections: [{ title: '핵심 요약', markdown: '본문' }],
            floor_leases: [
              {
                floor: '1F',
                tenant_type: '약국',
                area_sqm: 100,
                deposit_manwon: 10_000,
                monthly_rent_manwon: 800,
                status: 'occupied',
              },
              {
                floor: '2F',
                tenant_type: '의원',
                area_sqm: 150,
                deposit_manwon: 15_000,
                monthly_rent_manwon: 1_200,
                occupancy_status: '임대중',
              },
              {
                floor: '3F',
                tenant_type: '오피스',
                area_sqm: 150,
                deposit_manwon: 9_000,
                monthly_rent_manwon: 700,
                is_vacant: true,
              },
              {
                floor: '4F',
                tenant_type: '자가사용',
                area_sqm: 150,
                deposit_manwon: 20_000,
                monthly_rent_manwon: 1_500,
                lease_state: '자가사용',
              },
            ],
          },
        },
      });

      const res = await publicImProExportGet(
        new NextRequest(`https://credeal.net/api/public/im-pro/${GRANT_ID}/export?token=gtok`),
        { params: Promise.resolve({ grantId: GRANT_ID }) },
      );
      expect(res.status).toBe(200);
      const html = await res.text();

      // Status column & labels rendered
      expect(html).toContain('<th>상태</th>');
      expect(html).toContain('<td>임대중</td>');
      expect(html).toContain('<td>공실</td>');
      expect(html).toContain('<td>자가사용</td>');

      // Tfoot sums ONLY 1F (10,000 / 800) + 2F (15,000 / 1,200) = 25,000 / 2,000 (excluding 3F vacant & 4F 자가사용)
      const tfootMatch = html.match(/<tfoot>[\s\S]*?<\/tfoot>/);
      expect(tfootMatch).not.toBeNull();
      expect(tfootMatch![0]).toContain('<strong>25,000</strong>');
      expect(tfootMatch![0]).toContain('<strong>2,000</strong>');
      expect(tfootMatch![0]).toContain('1실 공실');

      // Also verify im-pro/[grantId]/page.tsx source renders 자가사용 and excludes vac || own in tfoot
      const proPageSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(public)/im-pro/[grantId]/page.tsx'),
        'utf8',
      );
      expect(proPageSrc).toContain("'자가사용'");
      expect(proPageSrc).toContain('if (vac || own) return s;');
    });
  });

  describe('P1-5 & P2-1..3: Non-UUID /views Guard, Version Resolver Public Safety & Route Hygiene', () => {
    it('P1-5: serves non-UUID bld-* on /views with 42703 fallback without entity_id 22P02 and masks 500 DB errors', async () => {
      const legacyBuildingId = 'bld-legacy-740';

      const db = createMockDb((q) => {
        if (q.table === 'activity_events') {
          if (q.selectCols.includes('building_id')) {
            return {
              data: null,
              error: { code: '42703', message: 'column activity_events.building_id does not exist' },
            };
          }
          // Pre-cutover fallback MUST NOT pass non-UUID to entity_id.eq.<non-uuid>
          expect(q.orExpr ?? '').not.toContain(`entity_id.eq.${legacyBuildingId}`);
          expect(q.filters['metadata->>building_id']).toBe(legacyBuildingId);
          return {
            data: [
              {
                id: 'v-1',
                entity_id: BROKER_ID,
                metadata: { building_id: legacyBuildingId, user_agent_hash: 'ua-1' },
                created_at: '2026-11-18T10:00:00.000Z',
              },
              {
                id: 'v-2',
                entity_id: BROKER_ID,
                metadata: { building_id: legacyBuildingId, user_agent_hash: 'ua-2' },
                created_at: '2026-11-18T10:05:00.000Z',
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(db.client);

      const okRes = await brokerViewsGet(
        new NextRequest(`https://credeal.net/api/broker/im-lite/${legacyBuildingId}/views`),
        { params: Promise.resolve({ id: legacyBuildingId }) },
      );
      expect(okRes.status).toBe(200);
      const okJson = (await okRes.json()) as { totalViews: number; uniqueViews: number };
      expect(okJson.totalViews).toBe(2);
      expect(okJson.uniqueViews).toBe(2);
      expect(mocks.assertLegacyOrDbOwnership).toHaveBeenCalledWith(
        db.client,
        expect.objectContaining({ id: legacyBuildingId, userId: BROKER_ID, requireExisting: true }),
      );

      // DB error on activity_events masks raw SQL message
      const errDb = createMockDb((q) => {
        if (q.table === 'activity_events') {
          return {
            data: null,
            error: { code: '57014', message: 'canceling statement due to secret_internal_sql_role' },
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(errDb.client);

      const errRes = await brokerViewsGet(
        new NextRequest(`https://credeal.net/api/broker/im-lite/${legacyBuildingId}/views`),
        { params: Promise.resolve({ id: legacyBuildingId }) },
      );
      expect(errRes.status).toBe(500);
      const errText = await errRes.text();
      expect(errText).not.toContain('secret_internal_sql_role');
    });

    it('P2-1: resolveImVersion never falls back to current_draft_version_id when published_version_id is null for public callers', async () => {
      const seriesRow = {
        id: 'series-740',
        building_id: BUILDING_ID,
        owner_id: BROKER_ID,
        latest_version_no: 1,
        published_version_id: null,
        current_draft_version_id: DOC_ID,
      };
      const draftDoc = {
        id: DOC_ID,
        series_id: 'series-740',
        version_no: 1,
        title: '미승인 초안',
        body: { sections: [] },
        status: 'draft',
        owner_id: BROKER_ID,
        building_id: BUILDING_ID,
      };

      const db = createMockDb((q) => {
        if (q.table === 'im_share_links') {
          return {
            data: { token: 'tok-series', series_id: 'series-740', version_id: null, revoked_at: null },
            error: null,
          };
        }
        if (q.table === 'im_series') {
          return { data: q.terminal === 'many' ? [seriesRow] : seriesRow, error: null };
        }
        if (q.table === 'document_objects') {
          return { data: q.terminal === 'many' ? [draftDoc] : draftDoc, error: null };
        }
        return { data: null, error: null };
      });

      expect(await resolveImVersion({ shareToken: 'tok-series' }, db.client)).toBeNull();
      expect(await resolveImVersion({ seriesId: 'series-740' }, db.client)).toBeNull();
      expect(await resolveImVersion({ buildingId: BUILDING_ID }, db.client)).toBeNull();

      // Verified owner still resolves current_draft_version_id
      const ownerResolved = await resolveImVersion(
        { seriesId: 'series-740', viewerId: BROKER_ID },
        db.client,
      );
      expect(ownerResolved?.access).toBe('owner');
      expect(ownerResolved?.version.id).toBe(DOC_ID);
    });

    it('P2-2 & P2-3: validates storageBucket/storagePath in evidence/route.ts, masks DB error in save-sections/route.ts, and routes studio CTA to /broker/w/im', async () => {
      const evDb = createMockDb((q) => {
        if (q.table === 'building_ssot_lite') {
          return { data: { id: BUILDING_ID, owner_id: BROKER_ID, completeness_score: 50 }, error: null };
        }
        return { data: null, error: null };
      });
      mocks.createSupabaseClient.mockReturnValue(evDb.client);

      // 1) Disallowed storageBucket rejected with 400
      const badBucketRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerCategory: 'photos',
            storageBucket: 'private-admin-secrets',
            storagePath: `${BUILDING_ID}/photo1.jpg`,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(badBucketRes.status).toBe(400);
      expect(((await badBucketRes.json()) as { code?: string }).code).toBe(
        'INVALID_STORAGE_BUCKET',
      );

      // 2) Path missing buildingId or containing traversal rejected with 400
      const badPathRes = await evidencePost(
        new NextRequest(`https://credeal.net/api/broker/buildings/${BUILDING_ID}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layerCategory: 'photos',
            storageBucket: 'evidence-files',
            storagePath: `${OTHER_BROKER_ID}/other-building.pdf`,
          }),
        }),
        { params: Promise.resolve({ id: BUILDING_ID }) },
      );
      expect(badPathRes.status).toBe(400);
      expect(((await badPathRes.json()) as { code?: string }).code).toBe('INVALID_STORAGE_PATH');

      // 3) save-sections masks raw DB error message
      const saveDb = createMockDb((q) => {
        if (q.table === 'document_objects' && q.operation === 'select') {
          return {
            data: {
              id: DOC_ID,
              owner_id: BROKER_ID,
              broker_id: BROKER_ID,
              status: 'draft',
              building_id: BUILDING_ID,
              sealed_at: null,
              body: { sections: [] },
            },
            error: null,
          };
        }
        if (q.table === 'document_objects' && q.operation === 'update') {
          return {
            data: null,
            error: { code: '23514', message: 'violates constraint raw_pg_internal_secret_name' },
          };
        }
        return { data: null, error: null };
      });
      mocks.createServiceClient.mockReturnValue(saveDb.client);

      const saveRes = await saveSectionsPut(
        new NextRequest(`https://credeal.net/api/broker/im-lite/${DOC_ID}/save-sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: [{ section_type: 'property_overview', title: '개요', markdown: '정상 본문' }],
          }),
        }),
        { params: Promise.resolve({ id: DOC_ID }) },
      );
      expect(saveRes.status).toBe(500);
      expect(await saveRes.text()).not.toContain('raw_pg_internal_secret_name');

      // 4) Studio CTA routes cleanly to canonical /broker/w/im?buildingId=
      const studioSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/(broker)/broker/buildings/[id]/studio/page.tsx'),
        'utf8',
      );
      expect(studioSrc).toContain('/broker/w/im?buildingId=');
      expect(studioSrc).toContain('IM 작업실 열기');
    });
  });
});
