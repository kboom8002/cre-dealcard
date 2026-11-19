// @vitest-environment node
/**
 * Wave 7.4 — WP-7.4C DealCard Closure Regression Suite
 *
 * Covers:
 *  - [P0-1] Background autosave on a `sent`/`published` DealCard preserves
 *           `workspace_items.status` and `published_snapshot` while updating
 *           `draft_payload` (`hasUnpublishedEdits: true`) without revalidating `/dc/[id]`.
 *  - [P0-2] `brokerDealCardFromMemo` + `POST /api/broker/deal-card/from-memo` writes
 *           `building_ssot_lite` (`status: 'draft'`) + `workspace_items` (`status: 'draft'`,
 *           `publishedSnapshot: null`) + non-PII `dealcard_upserted`; `evaluateDealCardPublicVisibility`
 *           rejects unpublished draft artifacts (`signalCardStatus === 'draft' && teaserDocStatus === 'draft'`).
 *  - [P1-1 & P1-2] `kakao-v2` rejects `dealcard_upserted` without `dealcard_sent` (404);
 *           `kakao-v2` and `card` reject draft `teaserDoc` on UUID DB fallback (404);
 *           `DealCardListColumn` & `LiveDealCardPreviewCard` avoid 404 OG `<img>` requests on drafts.
 *  - [P1-3] Optimistic concurrency control (`expectedVersion` -> 409 `VERSION_CONFLICT`) in
 *           `upsertWorkspaceItem`, `patch-upsert.ts` (`strictVersionCheck`), and `deal-card/[id]`.
 *  - [P1-4] `update_memo_only` persists `memoText` + `pairedMemoId` into `workspace_items.draft_payload`
 *           without leaking into `published_snapshot`.
 *  - [P2-1] `updateWorkspaceItemState` (when `kind` is omitted) updates ALL non-deleted rows
 *           (`dealcard` + `im`) for `(ownerId, buildingId)`; statutory `"개업공인중개사"` in `share-link-tokens.ts`.
 *  - [P2-2] `POST /api/public/teaser/event` enforces 16KB body limit (`413`) and IP rate limit (`429`).
 *  - [P2-3] `POST /api/broker/deal-card/fast-fill` enforces non-UUID cross-tenant ownership (`403`).
 *  - [P2-4] Daylight paper modal & 44px touch targets in `kakao-share-button.tsx` and compliant copy in `DealCardActionsMenu.tsx`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthGuardResult } from '@/lib/auth-guard';
import { computeCard4Hash } from '@/lib/deal-card/card4-schema';
import { evaluateDealCardPublicVisibility } from '@/domain/public-projection/visibility';
import {
  getPublicWorkspaceProjection,
  resetWorkspaceRepositoryCacheForTests,
  updateWorkspaceItemState,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
} from '@/lib/workspace/workspace-repository';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';
import {
  deleteQuickImRecord,
  updateQuickImCard4,
} from '@/lib/im-lite/quick-generate-store';

const OWNER_A = '11117400-7400-4111-8111-111111117401';
const OTHER_B = '22227400-7400-4222-8222-222222227402';
const ADMIN_U = '33337400-7400-4333-8333-333333337403';

const SENT_BLD_UUID = 'aaaa7400-7400-4111-8111-aaaaaaaa7401';
const STANDALONE_WS_UUID = 'bbbb7400-7400-4222-8222-bbbbbbbb7402';
const DRAFT_UUID_FOR_OG = 'cccc7400-7400-4333-8333-cccccccc7403';
const CREATED_FROM_MEMO_UUID = 'dddd7400-7400-4444-8444-dddddddd7404';

interface MockJsonObject {
  [key: string]: unknown;
  card4?: Record<string, unknown>;
  building_id?: string;
  status?: string;
  has_unpublished_edits?: boolean;
  private_memo_text?: string;
  memoText?: string;
  pairedMemoId?: string;
}

interface MockRow {
  [key: string]: unknown;
  id?: string;
  owner_id?: string;
  building_id?: string | null;
  kind?: string;
  status?: string;
  event_type?: string;
  revoked_at?: string | null;
  draft_payload?: MockJsonObject;
  published_snapshot?: MockJsonObject | null;
  metadata?: MockJsonObject;
}

type TableRows = Record<string, MockRow[]>;

interface QueryResult {
  data: MockRow | MockRow[] | null;
  error: { code?: string; message?: string } | null;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select: (cols?: string) => QueryBuilder;
  insert: (data: MockRow | MockRow[]) => QueryBuilder;
  update: (data: MockRow) => QueryBuilder;
  upsert: (data: MockRow | MockRow[]) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  neq: (col: string, val: unknown) => QueryBuilder;
  in: (col: string, vals: unknown[]) => QueryBuilder;
  is: (col: string, val: unknown) => QueryBuilder;
  or: (expr: string) => QueryBuilder;
  contains: (col: string, obj: Record<string, unknown>) => QueryBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  range: () => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
}

function createInMemorySupabase(initial: TableRows) {
  const db: TableRows = structuredClone(initial);

  const ensureTable = (table: string) => {
    if (!db[table]) db[table] = [];
    return db[table];
  };

  const applyFilters = (
    rows: MockRow[],
    filters: Array<(r: MockRow) => boolean>,
  ) => rows.filter((r) => filters.every((fn) => fn(r)));

  const from = vi.fn((table: string): QueryBuilder => {
    const filters: Array<(r: MockRow) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: MockRow | MockRow[] | null = null;
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitCount: number | null = null;
    let wantSingle = false;
    let wantMaybeSingle = false;
    let executed = false;
    let cached: QueryResult | null = null;

    const run = (): QueryResult => {
      if (executed && cached) return cached;
      executed = true;
      const rows = ensureTable(table);

      if (mode === 'select') {
        let matched = applyFilters(rows, filters).map((r) => structuredClone(r));
        if (orderCol) {
          const col = orderCol;
          matched.sort((a, b) => {
            const va = String(a[col] ?? '');
            const vb = String(b[col] ?? '');
            return orderAsc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        }
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        cached = {
          data: wantSingle || wantMaybeSingle ? matched[0] ?? null : matched,
          error: null,
        };
        return cached;
      }

      if (mode === 'insert') {
        const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const inserted = list.map((item, idx) => {
          const id =
            item?.id ||
            (table === 'building_ssot_lite'
              ? CREATED_FROM_MEMO_UUID
              : `gen-${table}-${rows.length + idx + 1}`);
          const now = new Date().toISOString();
          const rec: MockRow = {
            created_at: now,
            updated_at: now,
            ...structuredClone(item),
            id,
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        cached = {
          data: wantSingle || wantMaybeSingle ? inserted[0] ?? null : inserted,
          error: null,
        };
        return cached;
      }

      if (mode === 'update') {
        const matched = applyFilters(rows, filters);
        const updated: MockRow[] = [];
        for (const r of matched) {
          if (payload && !Array.isArray(payload)) {
            Object.assign(r, structuredClone(payload));
          }
          updated.push(structuredClone(r));
        }
        cached = {
          data: wantSingle || wantMaybeSingle ? updated[0] ?? null : updated,
          error: null,
        };
        return cached;
      }

      if (mode === 'upsert') {
        const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const upserted = list.map((item, idx) => {
          const existingIdx = rows.findIndex((r) => item?.id && r.id === item.id);
          const now = new Date().toISOString();
          if (existingIdx >= 0) {
            rows[existingIdx] = {
              ...rows[existingIdx],
              ...structuredClone(item),
              updated_at: now,
            };
            return structuredClone(rows[existingIdx]);
          }
          const rec: MockRow = {
            id: item?.id || `ups-${table}-${rows.length + idx + 1}`,
            created_at: now,
            updated_at: now,
            ...structuredClone(item),
          };
          rows.push(rec);
          return structuredClone(rec);
        });
        cached = {
          data: wantSingle || wantMaybeSingle ? upserted[0] ?? null : upserted,
          error: null,
        };
        return cached;
      }

      if (mode === 'delete') {
        const remaining: MockRow[] = [];
        const deleted: MockRow[] = [];
        for (const r of rows) {
          if (filters.every((fn) => fn(r))) deleted.push(r);
          else remaining.push(r);
        }
        db[table] = remaining;
        cached = {
          data: wantSingle || wantMaybeSingle ? deleted[0] ?? null : deleted,
          error: null,
        };
        return cached;
      }

      return { data: null, error: null };
    };

    const evalOrClause = (r: MockRow, clause: string): boolean => {
      const jsonArrow = clause.match(/^metadata->>([A-Za-z0-9_]+)\.eq\.(.+)$/);
      if (jsonArrow) {
        return String(r.metadata?.[jsonArrow[1]] ?? '') === jsonArrow[2];
      }
      const nestedArrow = clause.match(/^metadata->([A-Za-z0-9_]+)->>([A-Za-z0-9_]+)\.eq\.(.+)$/);
      if (nestedArrow) {
        const nested = r.metadata?.[nestedArrow[1]] as Record<string, unknown> | undefined;
        return String(nested?.[nestedArrow[2]] ?? '') === nestedArrow[3];
      }
      const simpleEq = clause.match(/^([A-Za-z0-9_]+)\.eq\.(.+)$/);
      if (simpleEq) {
        return String(r[simpleEq[1]] ?? '') === simpleEq[2];
      }
      return false;
    };

    const q: QueryBuilder = {
      select: () => q,
      insert: (data: MockRow | MockRow[]) => {
        mode = 'insert';
        payload = data;
        return q;
      },
      update: (data: MockRow) => {
        mode = 'update';
        payload = data;
        return q;
      },
      upsert: (data: MockRow | MockRow[]) => {
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
        filters.push((r) => parts.some((p) => evalOrClause(r, p)));
        return q;
      },
      contains: (col: string, obj: Record<string, unknown>) => {
        filters.push((r) => {
          const target = r[col];
          if (!target || typeof target !== 'object') return false;
          const targetRec = target as Record<string, unknown>;
          return Object.entries(obj).every(([k, v]) => targetRec[k] === v);
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
      then: <TResult1 = QueryResult, TResult2 = never>(
        onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(run()).then(onFulfilled, onRejected),
    };
    return q;
  });

  return { db, client: { from } };
}

const h = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof createInMemorySupabase>['client'] | null,
  authResult: null as AuthGuardResult | null,
  readBuildingResult: null as Record<string, unknown> | null,
  revalidatePathMock: vi.fn(),
  runBrokerDealCardMock: vi.fn(),
  readWithMigrationMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => h.revalidatePathMock(...args),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      void cb();
    },
  };
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.supabase,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => h.authResult),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async () => h.readBuildingResult),
}));

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ssot-adapter')>();
  return {
    ...actual,
    readWithMigration: (...args: unknown[]) => h.readWithMigrationMock(...args),
  };
});

vi.mock('@/ai/agents/broker-deal-card', () => ({
  runBrokerDealCard: (...args: unknown[]) => h.runBrokerDealCardMock(...args),
}));

vi.mock('@/domain/verification/address-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/verification/address-resolver')>();
  return {
    ...actual,
    geocodeAddress: vi.fn(async () => null),
  };
});

vi.mock('@/domain/verification/public-data-verifier', () => ({
  verifyAgainstPublicData: vi.fn(async () => ({ status: 'VERIFIED' })),
}));

vi.mock('@/domain/building/canonical-property', () => ({
  linkBuildingToCanonicalProperty: vi.fn(async () => undefined),
}));

vi.mock('@/domain/building/building-dedup', () => ({
  detectDuplicateBuilding: vi.fn(async () => ({ hasDuplicate: false, candidates: [] })),
}));

vi.mock('@/domain/matching/auto-matcher', () => ({
  runAutoMatch: vi.fn(async () => undefined),
}));

vi.mock('@/lib/ai-quota-guard', () => ({
  enforceFeatureQuota: vi.fn(async () => null),
  enforceBrokerAiQuota: vi.fn(async () => null),
  isLLMMockNotAllowedError: () => false,
  buildAiUnavailable503Response: vi.fn(),
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
    toDataURL: vi.fn(
      async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ),
  },
}));

function setActor(userId: string, role: 'broker' | 'admin' = 'broker') {
  h.authResult = {
    user: { id: userId, email: `${userId}@credeal.kr` },
    role,
    profile: { role, display_name: '정실제' },
    error: null,
  };
}

function buildSeedTables(): TableRows {
  const publishedCard4 = {
    headline: '청담동 코너 우량 근생',
    posture: 'income' as const,
    region: '강남구 청담동',
    use: '근린생활시설',
    area: '연면적 320평',
    priceBand: '140~160억',
    points: ['대로변 코너 각지', '전층 우량 임차인', '안정 임대 수익'] as [string, string, string],
    provenance: { points: ['broker', 'broker', 'broker'] as ['broker', 'broker', 'broker'] },
    card4_version: 2,
    card4_hash: computeCard4Hash({
      headline: '청담동 코너 우량 근생',
      region: '강남구 청담동',
      use: '근린생활시설',
      area: '연면적 320평',
      priceBand: '140~160억',
      points: ['대로변 코너 각지', '전층 우량 임차인', '안정 임대 수익'],
    }),
  };

  return {
    profiles: [
      {
        id: OWNER_A,
        display_name: '정실제',
        company: '정석공인중개사사무소',
        phone: '02-555-7788',
        photo_url: null,
        role: 'broker',
      },
      {
        id: OTHER_B,
        display_name: '박타인',
        company: '타인공인중개사사무소',
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
        license_number: 'LIC-2023-7788',
        office_reg_number: '11680-2023-07788',
        office_address: '서울특별시 강남구 테헤란로 412',
        representative_name: '정실제',
      },
    ],
    building_ssot_lite: [
      {
        id: SENT_BLD_UUID,
        owner_id: OWNER_A,
        area_signal: '강남구 청담동',
        asset_type: '근린생활시설',
        price_band: '140~160억',
        status: 'public_signal_ready',
      },
      {
        id: DRAFT_UUID_FOR_OG,
        owner_id: OWNER_A,
        area_signal: '마포구 서교동',
        asset_type: '근린생활시설',
        price_band: '90~100억',
        status: 'draft',
      },
    ],
    workspace_items: [
      {
        id: SENT_BLD_UUID,
        owner_id: OWNER_A,
        kind: 'dealcard',
        legacy_id: null,
        building_id: SENT_BLD_UUID,
        status: 'sent',
        title: '강남구 청담동 근린생활시설',
        address: '강남구 청담동',
        price_band: '140~160억',
        draft_payload: {
          card4: publishedCard4,
          memoText: '초기 비공개 메모',
        },
        published_snapshot: {
          card4: publishedCard4,
          brokerProfile: {
            displayName: '정실제',
            company: '정석공인중개사사무소',
            officeRegNumber: '11680-2023-07788',
          },
        },
        version: 2,
        doc_hash: publishedCard4.card4_hash,
        published_at: '2026-11-18T00:00:00.000Z',
        revoked_at: null,
        deleted_at: null,
        created_at: '2026-11-18T00:00:00.000Z',
        updated_at: '2026-11-18T00:00:00.000Z',
      },
      {
        id: STANDALONE_WS_UUID,
        owner_id: OWNER_A,
        kind: 'dealcard',
        legacy_id: null,
        building_id: null,
        status: 'draft',
        title: '서초구 반포동 업무시설',
        address: '서초구 반포동',
        price_band: '100~120억',
        draft_payload: {
          card4: {
            headline: '반포역 도보권 사옥',
            posture: 'owner_occupied',
            region: '서초구 반포동',
            use: '업무시설',
            priceBand: '100~120억',
            points: ['반포역 도보 4분', '자주식 주차 여유', '즉시 입주 가능'],
            provenance: { points: ['broker', 'broker', 'broker'] },
            card4_version: 3,
          },
        },
        published_snapshot: null,
        version: 3,
        doc_hash: null,
        published_at: null,
        revoked_at: null,
        deleted_at: null,
        created_at: '2026-11-18T00:00:00.000Z',
        updated_at: '2026-11-18T00:00:00.000Z',
      },
    ],
    document_objects: [
      {
        id: 'doc-sent-1',
        building_id: SENT_BLD_UUID,
        owner_id: OWNER_A,
        document_type: 'blind_teaser',
        status: 'published',
        visibility: 'public_blind',
        body: { card4: publishedCard4 },
        created_at: '2026-11-18T00:00:00.000Z',
      },
    ],
    building_signal_cards: [],
    broker_memos: [],
    activity_events: [],
    teaser_events: [],
    ai_runs: [],
    deal_casepacks: [],
    deal_pipeline_states: [],
  };
}

describe('Wave 7.4 — WP-7.4C DealCard Closure', () => {
  let prevDisableMem: string | undefined;
  let prevRequireWs: string | undefined;

  beforeEach(() => {
    prevDisableMem = process.env.DISABLE_MEMORY_STORE;
    prevRequireWs = process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
    resetWorkspaceRepositoryCacheForTests();
    resetShareLinkTokenStoreForTests();
    clearRateLimitBuckets();
    deleteQuickImRecord('bld-private-owner-a');
    deleteQuickImRecord('bld-legacy-draft-74');
    h.revalidatePathMock.mockReset();
    h.readBuildingResult = null;
    setActor(OWNER_A);
  });

  afterEach(() => {
    if (prevDisableMem === undefined) delete process.env.DISABLE_MEMORY_STORE;
    else process.env.DISABLE_MEMORY_STORE = prevDisableMem;

    if (prevRequireWs === undefined) delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
    else process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = prevRequireWs;
  });

  describe('[P0-1] Preserve sent/published status & published_snapshot during background autosave', () => {
    it('keeps workspace_items.status === "sent" and published_snapshot intact on draft autosave, and updates snapshot only on explicit publish', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      h.supabase = mem.client;

      const { PATCH: summaryPATCH } = await import('@/app/api/broker/workspace/summary/route');

      // 1) Simulate 900ms background autosave (action='upsert', no body.status)
      const autosaveRes = await summaryPATCH(
        new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            buildingId: SENT_BLD_UUID,
            memoText: '청담동 88-12 박사장 비공개 메모 수정본',
            card4: {
              headline: '미발행 임시 수정 제목',
              posture: 'income',
              region: '강남구 삼성동',
              use: '업무시설',
              priceBand: '200~230억',
              points: ['삼성역 도보 3분', '미발행 초안 포인트', '검토 중 문구'],
              provenance: { points: ['broker', 'broker', 'broker'] },
              card4_version: 2,
            },
          }),
        }),
      );

      expect(autosaveRes.status).toBe(200);
      const wsAfterAutosave = mem.db.workspace_items.find((r) => r.id === SENT_BLD_UUID)!;
      expect(wsAfterAutosave.status).toBe('sent');
      expect(wsAfterAutosave.published_snapshot?.card4?.region).toBe('강남구 청담동');
      expect(wsAfterAutosave.published_snapshot?.card4?.priceBand).toBe('140~160억');
      expect(wsAfterAutosave.published_snapshot?.card4?.headline).toBe('청담동 코너 우량 근생');
      expect(wsAfterAutosave.draft_payload?.card4?.region).toBe('강남구 삼성동');
      expect(wsAfterAutosave.draft_payload?.hasUnpublishedEdits).toBe(true);

      // Live public projection (/dc/[id]) continues serving the published snapshot without 404!
      const pubProj = await getPublicWorkspaceProjection(mem.client, SENT_BLD_UUID, 'dealcard');
      expect(pubProj.projection).not.toBeNull();
      expect(pubProj.projection?.status).toBe('sent');
      const snapCard4 = pubProj.projection?.snapshot?.card4 as Record<string, unknown> | undefined;
      expect(snapCard4?.region).toBe('강남구 청담동');

      // Activity event marks draft / has_unpublished_edits without demoting sent
      const upsertedEv = mem.db.activity_events.find((e) => e.event_type === 'dealcard_upserted');
      expect(upsertedEv?.metadata?.status).toBe('draft');
      expect(upsertedEv?.metadata?.has_unpublished_edits).toBe(true);
      expect(h.revalidatePathMock).not.toHaveBeenCalled();

      // 2) Explicit re-publish (status: 'sent') updates published_snapshot, clears hasUnpublishedEdits, and revalidates /dc
      const explicitPubRes = await summaryPATCH(
        new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            status: 'sent',
            buildingId: SENT_BLD_UUID,
            card4: {
              headline: '삼성역 도보권 프라임 사옥',
              posture: 'income',
              region: '강남구 삼성동',
              use: '업무시설',
              priceBand: '200~230억',
              points: ['삼성역 도보 3분', '전층 우량 법인 임차', '안정 임대 수익'],
              provenance: { points: ['broker', 'broker', 'broker'] },
              card4_version: 3,
            },
          }),
        }),
      );
      expect(explicitPubRes.status).toBe(200);
      const wsAfterExplicitPub = mem.db.workspace_items.find((r) => r.id === SENT_BLD_UUID)!;
      expect(wsAfterExplicitPub.status).toBe('sent');
      expect(wsAfterExplicitPub.published_snapshot?.card4?.region).toBe('강남구 삼성동');
      expect(wsAfterExplicitPub.draft_payload?.hasUnpublishedEdits).toBeUndefined();
      expect(h.revalidatePathMock).toHaveBeenCalledWith(`/dc/${SENT_BLD_UUID}`);
    });

    it('upsertWorkspaceItem preserves existing publishedSnapshot when input.status and input.publishedSnapshot are omitted', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      await upsertWorkspaceItem(mem.client, {
        id: SENT_BLD_UUID,
        buildingId: SENT_BLD_UUID,
        ownerId: OWNER_A,
        kind: 'dealcard',
        title: '강남구 삼성동 업무시설',
        draftPayload: {
          card4: {
            region: '강남구 삼성동',
            use: '업무시설',
            priceBand: '200~230억',
            points: ['포인트1', '포인트2', '포인트3'],
          },
          memoText: '비공개 초안',
        },
      });

      const updated = mem.db.workspace_items.find((r) => r.id === SENT_BLD_UUID)!;
      expect(updated.status).toBe('sent');
      expect(updated.published_snapshot?.card4?.region).toBe('강남구 청담동');
      expect(updated.draft_payload?.card4?.region).toBe('강남구 삼성동');
    });
  });

  describe('[P0-2] Close unpublished draft exposure from from-memo & legacy visibility', () => {
    it('from-memo creates building_ssot_lite (status="draft") + workspace_items (status="draft", publishedSnapshot=null) + non-PII dealcard_upserted', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      h.supabase = mem.client;

      h.runBrokerDealCardMock.mockResolvedValue({
        model: 'gemini-2.5-flash',
        usage: { totalTokens: 320 },
        promptVersions: {
          memoParser: 'v1',
          buildingMiniTruth: 'v1',
          blindTeaser: 'v1',
        },
        parsedMemo: {
          extractedFacts: {
            exactAddressCandidate: '서울특별시 마포구 서교동 395-166',
            region: '마포구 서교동',
          },
        },
        resolvedAddress: { pnu: '1144012000103950166' },
        buildingTruth: {
          areaSignal: '마포구 서교동',
          assetType: '근린생활시설',
          priceBand: '90~100억',
          askingPriceManwon: 950_000,
          sizeSignal: '연면적 430평',
          currentUseSignal: '근린생활시설',
          vacancySignal: '만실',
          fitSummary: '합정역 인근 코너 수익형 매물',
          cautionSummary: '현장 실사 필요',
          hiddenFields: ['exact_address', 'owner_identity'],
          confidence: { overall: 'high' },
          investmentPosture: 'income',
        },
        blindTeaser: {
          title: '합정역 코너 수익형 근생',
          regionLabel: '마포구 서교동',
          assetTypeLabel: '근린생활시설',
          dealPoints: ['합정역 도보 3분 코너', '전층 우량 임차 만실', '안정적 임대수익 구조'],
          cautionPoints: ['실사 확인 필요'],
          card4Headline: '합정역 코너 만실 근생',
          card4Points: ['합정역 도보 3분 코너', '전층 우량 임차 만실', '안정적 임대수익 구조'],
          kakaoText: '합정역 인근 코너 근생 안내입니다.',
        },
      });

      h.readWithMigrationMock.mockImplementation(async (id: string) => ({
        source: 'building_ssot_lite',
        migrated: false,
        data: mem.db.building_ssot_lite.find((b) => b.id === id) || null,
      }));

      const { POST: fromMemoPOST } = await import('@/app/api/broker/deal-card/from-memo/route');
      const rawMemoWithPii =
        '마포구 서교동 395-166 호산당빌딩 김철수 사장님 010-8888-7777 매매가 95억 연면적 430평 보증금 3억 월세 2800만 만실';
      const res = await fromMemoPOST(
        new NextRequest('http://localhost:3000/api/broker/deal-card/from-memo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memo: rawMemoWithPii,
            visibilityPreference: 'blind',
          }),
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.buildingId).toBe(CREATED_FROM_MEMO_UUID);

      // 1) building_ssot_lite inserted with status === 'draft' (NOT 'public_signal_ready')
      const createdBld = mem.db.building_ssot_lite.find((b) => b.id === CREATED_FROM_MEMO_UUID)!;
      expect(createdBld).toBeDefined();
      expect(createdBld.status).toBe('draft');

      // 2) workspace_items upserted with status === 'draft' and published_snapshot === null
      const wsRow = mem.db.workspace_items.find(
        (w) => w.building_id === CREATED_FROM_MEMO_UUID && w.kind === 'dealcard',
      )!;
      expect(wsRow).toBeDefined();
      expect(wsRow.status).toBe('draft');
      expect(wsRow.published_snapshot).toBeNull();

      // Public projection must NOT expose the unpublished draft
      const pubProj = await getPublicWorkspaceProjection(
        mem.client,
        CREATED_FROM_MEMO_UUID,
        'dealcard',
      );
      expect(pubProj.found).toBe(true);
      expect(pubProj.projection).toBeNull();

      // 3) dealcard_upserted event has status === 'draft' and ZERO raw PII
      const upsertedEv = mem.db.activity_events.find(
        (e) =>
          e.event_type === 'dealcard_upserted' &&
          e.metadata?.building_id === CREATED_FROM_MEMO_UUID,
      )!;
      expect(upsertedEv).toBeDefined();
      expect(upsertedEv.metadata?.status).toBe('draft');
      const serializedEv = JSON.stringify(upsertedEv);
      expect(serializedEv).not.toContain('395-166');
      expect(serializedEv).not.toContain('김철수');
      expect(serializedEv).not.toContain('010-8888-7777');
      expect(upsertedEv.metadata?.private_memo_text).toBeUndefined();
    });

    it('evaluateDealCardPublicVisibility rejects unpublished draft artifacts while preserving legacy published fixtures', () => {
      // Both signalCard and teaserDoc explicitly draft with no workspace_items row -> NOT public
      expect(
        evaluateDealCardPublicVisibility({
          buildingStatus: 'draft',
          signalCardVisibility: 'public_blind',
          signalCardStatus: 'draft',
          teaserDocStatus: 'draft',
          workspaceItemStatus: null,
        }),
      ).toEqual({
        isPublic: false,
        reasons: ['unpublished_draft_artifacts'],
      });

      // Even pre-fix rows with buildingStatus='public_signal_ready' + both draft artifacts are rejected
      expect(
        evaluateDealCardPublicVisibility({
          buildingStatus: 'public_signal_ready',
          signalCardVisibility: 'public_blind',
          signalCardStatus: 'draft',
          teaserDocStatus: 'draft',
          workspaceItemStatus: null,
        }).isPublic,
      ).toBe(false);

      // Published teaserDoc or absent legacy fixture stays public
      expect(
        evaluateDealCardPublicVisibility({
          buildingStatus: 'public_signal_ready',
          signalCardVisibility: 'public_blind',
          signalCardStatus: 'draft',
          teaserDocStatus: 'published',
          workspaceItemStatus: null,
        }).isPublic,
      ).toBe(true);

      expect(
        evaluateDealCardPublicVisibility({
          buildingStatus: 'public_signal_ready',
          signalCardVisibility: 'public_blind',
          signalCardStatus: 'draft',
        }).isPublic,
      ).toBe(true);
    });

    it('routes legacy /broker/deal-card/new entry links to canonical /broker/w/dealcards', () => {
      const entryFiles = [
        'src/components/layout/BrokerCreateFAB.tsx',
        'src/components/dashboard/QuickActions.tsx',
        'src/components/dashboard/WeeklyReportCard.tsx',
        'src/components/memo/MemoResultSheet.tsx',
        'src/app/(broker)/broker/memos/page.tsx',
      ];
      for (const rel of entryFiles) {
        const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
        expect(src, `${rel} still links to /broker/deal-card/new`).not.toContain(
          '/broker/deal-card/new',
        );
        expect(src, `${rel} should link to /broker/w/dealcards`).toContain(
          '/broker/w/dealcards',
        );
      }
    });
  });

  describe('[P1-1 & P1-2] OG kakao-v2 / card draft leak closure & zero 404 draft thumbnails', () => {
    it('kakao-v2 rejects dealcard_upserted without dealcard_sent (404) and serves 200 after dealcard_sent', async () => {
      const legacyDraftId = 'bld-legacy-draft-74';
      const seeds = buildSeedTables();
      // Simulate pre-cutover missing workspace_items row for legacyDraftId, with only dealcard_upserted
      seeds.activity_events.push({
        id: 'ev-draft-only',
        actor_id: OWNER_A,
        entity_id: OWNER_A,
        event_type: 'dealcard_upserted',
        metadata: {
          building_id: legacyDraftId,
          status: 'draft',
          card4: {
            headline: '비공개 초안 카드',
            region: '강남구 역삼동',
            use: '근린생활시설',
            priceBand: '80~90억',
            points: ['초안1', '초안2', '초안3'],
            card4_version: 1,
          },
        },
        created_at: '2026-11-18T01:00:00.000Z',
      });
      const mem = createInMemorySupabase(seeds);
      h.supabase = mem.client;

      const { GET: kakaoV2GET } = await import('@/app/api/og/deal/[id]/kakao-v2/route');

      // 1) dealcard_upserted alone -> 404
      const draftRes = await kakaoV2GET(
        new NextRequest(`http://localhost:3000/api/og/deal/${legacyDraftId}/kakao-v2`),
        { params: Promise.resolve({ id: legacyDraftId }) },
      );
      expect(draftRes.status).toBe(404);

      // 2) Add dealcard_sent -> 200 PNG
      mem.db.activity_events.push({
        id: 'ev-sent-now',
        actor_id: OWNER_A,
        entity_id: OWNER_A,
        event_type: 'dealcard_sent',
        metadata: {
          building_id: legacyDraftId,
          status: 'sent',
          card4: {
            headline: '발행 완료 카드',
            region: '강남구 역삼동',
            use: '근린생활시설',
            priceBand: '80~90억',
            points: ['발행1', '발행2', '발행3'],
            card4_version: 2,
          },
        },
        created_at: '2026-11-18T02:00:00.000Z',
      });

      const sentRes = await kakaoV2GET(
        new NextRequest(`http://localhost:3000/api/og/deal/${legacyDraftId}/kakao-v2`),
        { params: Promise.resolve({ id: legacyDraftId }) },
      );
      expect(sentRes.status).toBe(200);
      expect(sentRes.headers.get('content-type')).toContain('image/png');
    });

    it('kakao-v2 and card return 404 on UUID DB fallback when teaserDoc.status === "draft"', async () => {
      const seeds = buildSeedTables();
      seeds.document_objects.push({
        id: 'doc-draft-uuid',
        building_id: DRAFT_UUID_FOR_OG,
        owner_id: OWNER_A,
        document_type: 'blind_teaser',
        status: 'draft',
        visibility: 'public_blind',
        body: {
          card4: {
            headline: '미발행 티저',
            region: '마포구 서교동',
            use: '근린생활시설',
            priceBand: '90~100억',
            points: ['초안1', '초안2', '초안3'],
          },
        },
        created_at: '2026-11-18T01:00:00.000Z',
      });
      h.supabase = createInMemorySupabase(seeds).client;
      h.readBuildingResult = {
        id: DRAFT_UUID_FOR_OG,
        area_signal: '마포구 서교동',
        asset_type: '근린생활시설',
        price_band: '90~100억',
        status: 'public_signal_ready',
      };

      const { GET: kakaoV2GET } = await import('@/app/api/og/deal/[id]/kakao-v2/route');
      const { GET: cardGET } = await import('@/app/api/og/deal/[id]/card/route');

      const v2Res = await kakaoV2GET(
        new NextRequest(`http://localhost:3000/api/og/deal/${DRAFT_UUID_FOR_OG}/kakao-v2`),
        { params: Promise.resolve({ id: DRAFT_UUID_FOR_OG }) },
      );
      const cardRes = await cardGET(
        new NextRequest(`http://localhost:3000/api/og/deal/${DRAFT_UUID_FOR_OG}/card`),
        { params: Promise.resolve({ id: DRAFT_UUID_FOR_OG }) },
      );

      expect(v2Res.status).toBe(404);
      expect(cardRes.status).toBe(404);
    });

    it('DealCardListColumn and LiveDealCardPreviewCard gate OG image requests on published/sent status', () => {
      const listColSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/app/(broker)/broker/w/dealcards/_components/DealCardListColumn.tsx',
        ),
        'utf8',
      );
      expect(listColSrc).toContain('item.status === "sent"');

      const livePreviewSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/components/broker/deal-card/LiveDealCardPreviewCard.tsx',
        ),
        'utf8',
      );
      expect(livePreviewSrc).toContain('status === "sent" || status === "published"');
      expect(livePreviewSrc).toContain('live-dealcard-inline-og-fallback');
      expect(livePreviewSrc).not.toContain('/kakao?v=');
    });
  });

  describe('[P1-3 & P1-4] OCC (409 VERSION_CONFLICT) & update_memo_only workspace_items sync', () => {
    it('enforces 409 VERSION_CONFLICT on mismatched expectedVersion in upsertWorkspaceItem, patch-upsert (strictVersionCheck), and deal-card/[id]', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      h.supabase = mem.client;

      // 1) Direct repository OCC check -> throws 409 VERSION_CONFLICT
      await expect(
        upsertWorkspaceItem(mem.client, {
          id: STANDALONE_WS_UUID,
          ownerId: OWNER_A,
          kind: 'dealcard',
          title: '충돌 테스트',
          draftPayload: { card4: { region: '서초구 반포동' } },
          expectedVersion: 1, // current version is 3
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'VERSION_CONFLICT',
      } satisfies Partial<WorkspaceRepositoryError>);

      // 2) patch-upsert with strictVersionCheck=true + stale expectedVersion -> 409
      const { PATCH: summaryPATCH } = await import('@/app/api/broker/workspace/summary/route');
      const strictConflictRes = await summaryPATCH(
        new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            buildingId: STANDALONE_WS_UUID,
            expectedVersion: 1,
            strictVersionCheck: true,
            card4: {
              region: '서초구 반포동',
              use: '업무시설',
              priceBand: '100~120억',
              points: ['반포역 도보 4분', '자주식 주차 여유', '즉시 입주 가능'],
            },
          }),
        }),
      );
      expect(strictConflictRes.status).toBe(409);
      const strictConflictJson = await strictConflictRes.json();
      expect(strictConflictJson.code).toBe('VERSION_CONFLICT');

      // 3) deal-card/[id] standalone UUID PATCH with stale expectedVersion -> 409
      const { PATCH: dealCardPATCH } = await import('@/app/api/broker/deal-card/[id]/route');
      const standaloneConflictRes = await dealCardPATCH(
        new NextRequest(`http://localhost:3000/api/broker/deal-card/${STANDALONE_WS_UUID}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 1,
            card4: {
              region: '서초구 반포동',
              use: '업무시설',
              priceBand: '100~120억',
              points: ['반포역 도보 4분', '자주식 주차 여유', '즉시 입주 가능'],
            },
          }),
        }),
        { params: Promise.resolve({ id: STANDALONE_WS_UUID }) },
      );
      expect(standaloneConflictRes.status).toBe(409);
    });

    it('update_memo_only persists memoText & pairedMemoId into workspace_items.draft_payload without touching published_snapshot', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      h.supabase = mem.client;

      const { PATCH: summaryPATCH } = await import('@/app/api/broker/workspace/summary/route');
      const res = await summaryPATCH(
        new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'update_memo_only',
            buildingId: SENT_BLD_UUID,
            memoText: '90일 이후에도 보존되는 비공개 원문 메모 (소유자 김사장 010-2222-3333)',
            pairedMemoId: 'memo-paired-74',
            generationSource: 'ai_memo',
          }),
        }),
      );

      expect(res.status).toBe(200);
      const wsRow = mem.db.workspace_items.find((r) => r.id === SENT_BLD_UUID)!;
      expect(wsRow.status).toBe('sent');
      expect(wsRow.draft_payload?.memoText).toBe(
        '90일 이후에도 보존되는 비공개 원문 메모 (소유자 김사장 010-2222-3333)',
      );
      expect(wsRow.draft_payload?.pairedMemoId).toBeTruthy();
      // Zero leak into published_snapshot
      expect(JSON.stringify(wsRow.published_snapshot)).not.toContain('010-2222-3333');
      expect(wsRow.published_snapshot?.memoText).toBeUndefined();
    });
  });

  describe('[P2-1, P2-2, P2-3 & P2-4] Kind-scoped updates, teaser rate/body guards, fast-fill AuthZ & UI polish', () => {
    it('[P2-1] updateWorkspaceItemState without kind updates BOTH dealcard and im rows for the owner and share-link-tokens uses statutory terminology', async () => {
      const seeds = buildSeedTables();
      seeds.workspace_items.push({
        id: 'eeee7400-7400-4555-8555-eeeeeeee7405',
        owner_id: OWNER_A,
        kind: 'im',
        legacy_id: null,
        building_id: SENT_BLD_UUID,
        status: 'published',
        title: '청담동 근생 Basic IM',
        address: '강남구 청담동',
        price_band: '140~160억',
        draft_payload: { askingPriceManwon: 1_500_000 },
        published_snapshot: { askingPriceManwon: 1_500_000 },
        version: 1,
        doc_hash: null,
        published_at: '2026-11-18T00:00:00.000Z',
        revoked_at: null,
        deleted_at: null,
        created_at: '2026-11-18T00:00:00.000Z',
        updated_at: '2026-11-18T00:00:00.000Z',
      });
      const mem = createInMemorySupabase(seeds);

      await updateWorkspaceItemState(mem.client, {
        id: SENT_BLD_UUID,
        userId: OWNER_A,
        status: 'revoked',
      });

      const matching = mem.db.workspace_items.filter((r) => r.building_id === SENT_BLD_UUID);
      expect(matching).toHaveLength(2);
      expect(matching.every((r) => r.status === 'revoked' && Boolean(r.revoked_at))).toBe(true);

      const shareTokensSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/security/share-link-tokens.ts'),
        'utf8',
      );
      expect(shareTokensSrc).not.toContain('중개인');
      expect(shareTokensSrc).toContain('개업공인중개사');
    });

    it('[P2-2] POST /api/public/teaser/event enforces 16KB raw body cap (413) and 60/min IP rate limit (429)', async () => {
      const mem = createInMemorySupabase(buildSeedTables());
      h.supabase = mem.client;

      const { POST: teaserEventPOST } = await import('@/app/api/public/teaser/event/route');

      // 1) >16KB body -> 413
      const oversizedPayload = JSON.stringify({
        eventType: 'view',
        buildingId: SENT_BLD_UUID,
        eventData: { pad: 'x'.repeat(17 * 1024) },
      });
      const res413 = await teaserEventPOST(
        new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.41',
          },
          body: oversizedPayload,
        }),
      );
      expect(res413.status).toBe(413);

      // 2) 60 requests from same IP succeed, 61st returns 429
      const floodIp = '203.0.113.99';
      for (let i = 0; i < 60; i++) {
        const okRes = await teaserEventPOST(
          new NextRequest('http://localhost:3000/api/public/teaser/event', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': floodIp,
            },
            body: JSON.stringify({ eventType: 'view' }),
          }),
        );
        expect(okRes.status).toBe(200);
      }

      const res429 = await teaserEventPOST(
        new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': floodIp,
          },
          body: JSON.stringify({ eventType: 'view' }),
        }),
      );
      expect(res429.status).toBe(429);
    });

    it('[P2-3] POST /api/broker/deal-card/fast-fill blocks cross-tenant non-UUID buildingId with 403 and allows owner/admin', async () => {
      const nonUuidId = 'bld-private-owner-a';
      const seeds = buildSeedTables();
      seeds.workspace_items.push({
        id: 'ffff7400-7400-4666-8666-ffffffff7406',
        owner_id: OWNER_A,
        kind: 'dealcard',
        legacy_id: nonUuidId,
        building_id: null,
        status: 'draft',
        title: '마포구 연남동 근생',
        address: '마포구 연남동',
        price_band: '60~70억',
        draft_payload: {
          card4: {
            headline: '연남동 코너 근생',
            posture: 'income',
            region: '마포구 연남동',
            use: '근린생활시설',
            priceBand: '60~70억',
            points: ['홍대입구역 도보권', '코너 가시성 우수', '수익률 4.5%'],
            provenance: { points: ['broker', 'broker', 'broker'] },
            card4_version: 1,
          },
        },
        published_snapshot: null,
        version: 1,
        deleted_at: null,
        revoked_at: null,
        created_at: '2026-11-18T00:00:00.000Z',
        updated_at: '2026-11-18T00:00:00.000Z',
      });
      h.supabase = createInMemorySupabase(seeds).client;
      updateQuickImCard4(
        nonUuidId,
        {
          headline: '연남동 코너 근생',
          posture: 'income',
          region: '마포구 연남동',
          use: '근린생활시설',
          priceBand: '60~70억',
          points: ['홍대입구역 도보권', '코너 가시성 우수', '수익률 4.5%'],
          provenance: { points: ['broker', 'broker', 'broker'] },
          card4_version: 1,
        },
        { ownerId: OWNER_A },
      );

      const { POST: fastFillPOST } = await import('@/app/api/broker/deal-card/fast-fill/route');

      // Cross-tenant Broker B -> 403
      setActor(OTHER_B, 'broker');
      const crossRes = await fastFillPOST(
        new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ buildingId: nonUuidId }),
        }),
      );
      expect(crossRes.status).toBe(403);

      // Owner Broker A -> 200
      setActor(OWNER_A, 'broker');
      const ownerRes = await fastFillPOST(
        new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ buildingId: nonUuidId }),
        }),
      );
      expect(ownerRes.status).toBe(200);

      // Admin -> 200
      setActor(ADMIN_U, 'admin');
      const adminRes = await fastFillPOST(
        new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ buildingId: nonUuidId }),
        }),
      );
      expect(adminRes.status).toBe(200);
    });

    it('[P2-4] enforces Daylight paper modal in kakao-share-button.tsx and compliant copy in DealCardActionsMenu.tsx', () => {
      const kakaoBtnSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/app/(broker)/broker/deal-card/[id]/kakao-share-button.tsx',
        ),
        'utf8',
      );
      expect(kakaoBtnSrc).not.toContain('bg-neutral-900');
      expect(kakaoBtnSrc).not.toContain('bg-neutral-950');
      expect(kakaoBtnSrc).toContain('bg-white text-slate-900 border border-slate-200');
      expect(kakaoBtnSrc).toContain('min-h-[44px] min-w-[44px]');

      const actionsMenuSrc = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/app/(broker)/broker/deal-card/[id]/DealCardActionsMenu.tsx',
        ),
        'utf8',
      );
      expect(actionsMenuSrc).not.toContain('⚡ 급매 소식지 발행');
      expect(actionsMenuSrc).toContain('📰 특별호 소식지 발행');
    });
  });
});
