// @vitest-environment node
/**
 * Wave 7.3 — WP-7.3C DealCard Remediation Unit Suite
 *
 * Covers:
 *  - P1-2: `validateBlindPriceBand` rejects exact prices disguised with negotiation
 *          suffixes ("115억 협의", "115억원 (협의)", "35억5000만 협의") while
 *          accepting "가격 협의", "미정", "100~120억", and "50억대".
 *  - P1-1: `resolvePublicDealWorkspaceGuard` and `resolveOgDealGuard` fail closed
 *          (`blocked: true`, `reason: 'lookup_failed'`) on unexpected DB errors
 *          (e.g. `57014` timeout) while falling back cleanly (`blocked: false`)
 *          on pre-cutover `42P01` / `PGRST205` missing-table errors.
 *  - P1-5 & P2: `evaluateDealCardPublishContent` / `hasDealCardPlaceholderCopy`
 *          enforces blind checks on `pointBriefs` and blocks placeholder copy
 *          ('서울시 핵심권역', '우수 입지' + fallback points) from publishing;
 *          `buildSanitizedDealCardPublicSnapshot` strips private keys recursively.
 *  - P1-3: `20261117000001_workspace_items_and_drift_fix.sql` revokes direct
 *          `INSERT, UPDATE, DELETE` from `authenticated` and revokes `anon`
 *          enumeration on `public.workspace_items`.
 *  - P1-4 & P2: `deleteDealCardDependents` polymorphic `circle_shared_assets`
 *          cleanup + surfaced failures, and `runBackfill` content-gate + >1,000-row
 *          pagination invariants.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateBlindPriceBand } from '@/lib/deal-card/price-band';
import {
  resolveOgDealGuard,
  resolvePublicDealWorkspaceGuard,
} from '@/lib/og/deal-public-guard';
import {
  DEALCARD_PLACEHOLDER_POINTS,
  DEALCARD_PLACEHOLDER_REGION,
  evaluateDealCardPublishContent,
  hasDealCardPlaceholderCopy,
} from '@/lib/deal-card/publish-content-gate';
import { buildSanitizedDealCardPublicSnapshot } from '@/lib/deal-card/public-snapshot';
import { deleteDealCardDependents } from '@/lib/deal-card/delete-dependents';
import {
  buildSanitizedDealCardPublicSnapshot as repoReExportedSanitizer,
  resetWorkspaceRepositoryCacheForTests,
} from '@/lib/workspace/workspace-repository';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { runBackfill } from '../../../scripts/backfill-workspace-items';

const DEAL_ID = 'aaaa7300-7300-4111-8111-aaaaaaaa7301';
const OWNER_ID = '11117300-7300-4111-8111-111111117301';

interface PostgrestOutcome {
  data: unknown;
  error: { code?: string; message: string } | null;
}

interface ChainableQuery extends PromiseLike<PostgrestOutcome> {
  select: (...args: unknown[]) => ChainableQuery;
  eq: (...args: unknown[]) => ChainableQuery;
  neq: (...args: unknown[]) => ChainableQuery;
  in: (...args: unknown[]) => ChainableQuery;
  is: (...args: unknown[]) => ChainableQuery;
  or: (...args: unknown[]) => ChainableQuery;
  order: (...args: unknown[]) => ChainableQuery;
  limit: (...args: unknown[]) => ChainableQuery;
  range: (from: number, to: number) => ChainableQuery;
  maybeSingle: () => Promise<PostgrestOutcome>;
  single: () => Promise<PostgrestOutcome>;
}

interface DeleteQuery extends PromiseLike<{ error?: unknown }> {
  delete: () => DeleteQuery;
  eq: (col: string, val: unknown) => DeleteQuery;
}

interface QueryContext {
  table: string;
  rangeFrom: number | null;
  rangeTo: number | null;
}

function createQueryChain(
  table: string,
  executor: (ctx: QueryContext) => Promise<PostgrestOutcome> | PostgrestOutcome,
): ChainableQuery {
  const ctx: QueryContext = { table, rangeFrom: null, rangeTo: null };
  const run = () => Promise.resolve(executor(ctx));
  const chain: ChainableQuery = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    is: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    range: (from: number, to: number) => {
      ctx.rangeFrom = from;
      ctx.rangeTo = to;
      return chain;
    },
    maybeSingle: () => run(),
    single: () => run(),
    then: (onfulfilled, onrejected) => run().then(onfulfilled, onrejected),
  };
  return chain;
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

describe('Wave 7.3 — WP-7.3C DealCard Remediation', () => {
  describe('P1-2: validateBlindPriceBand negotiation-suffix bypass prevention', () => {
    it('rejects exact prices disguised with "협의" / "미정" suffixes', () => {
      for (const raw of [
        '115억 협의',
        '115억원 (협의)',
        '35억5000만 협의',
        '35억 5,000만원 협의 가능',
        '매매가 115억 미정',
      ]) {
        const res = validateBlindPriceBand(raw);
        expect(res.valid, `expected "${raw}" to be rejected`).toBe(false);
        expect(res.reason).toContain('정확한 단일 매매가');
      }

      const narrowNegotiable = validateBlindPriceBand('100~102억 협의');
      expect(narrowNegotiable.valid).toBe(false);
      expect(narrowNegotiable.reason).toContain('5%');
    });

    it('accepts bare negotiation labels and >=5% blind price bands', () => {
      for (const allowed of [
        '가격 협의',
        '미정',
        '100~120억',
        '50억대',
        '100~120억 협의 가능',
      ]) {
        const res = validateBlindPriceBand(allowed);
        expect(res, `expected "${allowed}" to pass`).toEqual({ valid: true });
      }
    });
  });

  describe('P1-1: resolvePublicDealWorkspaceGuard & resolveOgDealGuard fail-closed vs pre-cutover', () => {
    let prevDisableMem: string | undefined;
    let prevRequireWs: string | undefined;

    beforeEach(() => {
      prevDisableMem = process.env.DISABLE_MEMORY_STORE;
      prevRequireWs = process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
      process.env.DISABLE_MEMORY_STORE = '1';
      delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
      resetWorkspaceRepositoryCacheForTests();
      resetShareLinkTokenStoreForTests();
    });

    afterEach(() => {
      if (prevDisableMem === undefined) delete process.env.DISABLE_MEMORY_STORE;
      else process.env.DISABLE_MEMORY_STORE = prevDisableMem;

      if (prevRequireWs === undefined) delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
      else process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = prevRequireWs;

      resetWorkspaceRepositoryCacheForTests();
    });

    it('fails closed on unexpected DB errors (e.g. 57014 statement timeout and transport throws)', async () => {
      const timeoutSupabase = {
        from: (table: string) =>
          createQueryChain(table, ({ table: tbl }) => {
            if (tbl === 'workspace_items') {
              return {
                data: null,
                error: {
                  code: '57014',
                  message: 'canceling statement due to statement timeout',
                },
              };
            }
            return { data: [], error: null };
          }),
      };

      const wsGuard = await resolvePublicDealWorkspaceGuard({
        id: DEAL_ID,
        supabase: timeoutSupabase,
      });
      expect(wsGuard.blocked).toBe(true);
      expect(wsGuard.reason).toBe('lookup_failed');
      expect(wsGuard.projection).toBeNull();
      expect(wsGuard.draftPayloadForOwnerOnly).toBeNull();
      expect(wsGuard.item).toBeNull();

      const ogGuard = await resolveOgDealGuard(DEAL_ID, timeoutSupabase);
      expect(ogGuard.blocked).toBe(true);
      expect(ogGuard.demoAllowed).toBe(false);
      expect(ogGuard.snapshot).toBeNull();
      expect(ogGuard.snapshotCard4).toBeNull();

      const rejectingSupabase = {
        from: (table: string) =>
          createQueryChain(table, ({ table: tbl }) => {
            if (tbl === 'workspace_items') {
              return Promise.reject(new Error('upstream socket hang up'));
            }
            return { data: [], error: null };
          }),
      };

      const rejectedWs = await resolvePublicDealWorkspaceGuard({
        id: DEAL_ID,
        supabase: rejectingSupabase,
      });
      expect(rejectedWs.blocked).toBe(true);
      expect(rejectedWs.reason).toBe('lookup_failed');

      const rejectedOg = await resolveOgDealGuard(DEAL_ID, rejectingSupabase);
      expect(rejectedOg.blocked).toBe(true);
      expect(rejectedOg.demoAllowed).toBe(false);
    });

    it('falls back cleanly (blocked: false) on pre-cutover 42P01 and PGRST205 missing-table errors', async () => {
      const missingCases: ReadonlyArray<{ code: string; message: string; requireFlag: boolean }> = [
        {
          code: '42P01',
          message: 'relation "public.workspace_items" does not exist',
          requireFlag: false,
        },
        {
          code: 'PGRST205',
          message: "Could not find the table 'public.workspace_items' in the schema cache",
          requireFlag: true,
        },
      ];

      for (const tc of missingCases) {
        if (tc.requireFlag) process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
        else delete process.env.REQUIRE_WORKSPACE_ITEMS_TABLE;
        resetWorkspaceRepositoryCacheForTests();

        const preCutoverSupabase = {
          from: (table: string) =>
            createQueryChain(table, ({ table: tbl }) => {
              if (tbl === 'workspace_items') {
                return { data: null, error: { code: tc.code, message: tc.message } };
              }
              return { data: [], error: null };
            }),
        };

        const wsGuard = await resolvePublicDealWorkspaceGuard({
          id: DEAL_ID,
          supabase: preCutoverSupabase,
        });
        expect(wsGuard.blocked, `wsGuard should allow fallback for ${tc.code}`).toBe(false);
        expect(wsGuard.reason).toBeUndefined();
        expect(wsGuard.item).toBeNull();
        expect(wsGuard.projection).toBeNull();

        resetWorkspaceRepositoryCacheForTests();
        const ogGuard = await resolveOgDealGuard(DEAL_ID, preCutoverSupabase);
        expect(ogGuard.blocked, `ogGuard should allow fallback for ${tc.code}`).toBe(false);
        expect(ogGuard.snapshot).toBeNull();
      }
    });
  });

  describe('P1-5 & P2: publish-content-gate & public-snapshot', () => {
    it('blocks placeholder copy ("서울시 핵심권역" region or >=2 fallback points) from publishing', () => {
      expect(DEALCARD_PLACEHOLDER_REGION).toBe('서울시 핵심권역');
      expect(DEALCARD_PLACEHOLDER_POINTS).toContain('우수 입지');

      const placeholderRegionCard = {
        headline: '역세권 우량 수익형 근생',
        region: '서울시 핵심권역',
        use: '근린생활시설',
        priceBand: '100~120억',
        points: ['역세권 도보 3분', '코너 각지 가시성', '전층 임차 완료'],
      };
      expect(hasDealCardPlaceholderCopy(placeholderRegionCard)).toBe(true);
      const regionGate = evaluateDealCardPublishContent(placeholderRegionCard);
      expect(regionGate).toMatchObject({
        ok: false,
        status: 422,
        code: 'DEALCARD_PLACEHOLDER_COPY',
      });

      const placeholderPointsCard = {
        headline: '강남 코너 근생',
        region: '강남구 역삼동',
        use: '근린생활시설',
        priceBand: '100~120억',
        points: ['우수 입지', '추천 매물', '역세권 도보 3분'],
      };
      expect(hasDealCardPlaceholderCopy(placeholderPointsCard)).toBe(true);
      const pointsGate = evaluateDealCardPublishContent(placeholderPointsCard);
      expect(pointsGate).toMatchObject({
        ok: false,
        status: 422,
        code: 'DEALCARD_PLACEHOLDER_COPY',
      });

      // Single generic phrase with real region + two custom points is allowed
      const singleGenericPointCard = {
        headline: '강남 역세권 근생',
        region: '강남구 역삼동',
        use: '근린생활시설',
        priceBand: '100~120억',
        points: ['우수 입지', '역세권 도보 2분', '전층 우량 임차 완료'],
      };
      expect(hasDealCardPlaceholderCopy(singleGenericPointCard)).toBe(false);
      expect(evaluateDealCardPublishContent(singleGenericPointCard)).toEqual({ ok: true });
    });

    it('enforces blind-guard checks on pointBriefs and preserves pointIndex for points', () => {
      const cleanBase = {
        headline: '역삼역 도보권 코너 근생',
        region: '강남구 역삼동',
        use: '근린생활시설',
        priceBand: '100~120억',
        points: ['역세권 도보 3분', '대로변 코너 가시성', '안정적 임대수익 구조'],
      };

      for (const leakyBriefs of [
        ['테헤란로 152 코너 전면 노출 우수', '', ''],
        ['상권 유동인구 풍부', '역삼동 823-12 인접 입지', ''],
        ['', '', '1층 스타벅스 장기 입점 및 호산당빌딩 맞은편'],
      ]) {
        const res = evaluateDealCardPublishContent({
          ...cleanBase,
          pointBriefs: leakyBriefs,
        });
        expect(res.ok, `expected pointBriefs ${JSON.stringify(leakyBriefs)} to fail`).toBe(false);
        if (!res.ok) {
          expect(res.status).toBe(422);
          expect(res.code).toBe('BLIND_GUARD_VIOLATION');
          expect(res.violations?.length).toBeGreaterThan(0);
        }
      }

      // Point violation at index 1 still reports pointIndex === 1
      const pointViolationRes = evaluateDealCardPublishContent({
        ...cleanBase,
        points: ['역세권 도보 3분', '역삼동 117-3번지 코너', '안정적 임대수익 구조'],
        pointBriefs: ['2호선 역 인접', '가시성 우수', '공실 없음'],
      });
      expect(pointViolationRes.ok).toBe(false);
      if (!pointViolationRes.ok) {
        expect(pointViolationRes.code).toBe('BLIND_GUARD_VIOLATION');
        expect(pointViolationRes.violations?.[0]?.pointIndex).toBe(1);
      }

      // Client-requested extraPriceBands cannot smuggle an exact price past stored card4
      const extraBandRes = evaluateDealCardPublishContent(cleanBase, {
        extraPriceBands: ['115억 협의'],
      });
      expect(extraBandRes).toMatchObject({
        ok: false,
        status: 422,
        code: 'BLIND_PRICE_BAND_INVALID',
      });

      const validWithBriefs = evaluateDealCardPublishContent({
        ...cleanBase,
        pointBriefs: [
          '2호선 역 도보 3분 거리로 출퇴근 동선 우수',
          '양면 도로 접합으로 가시성과 접근성 확보',
          '우량 법인 임차인 장기 계약으로 공실 위험 낮음',
        ],
      });
      expect(validWithBriefs).toEqual({ ok: true });
    });

    it('sanitizes DealCard public snapshots recursively and matches workspace-repository re-export', () => {
      expect(repoReExportedSanitizer).toBe(buildSanitizedDealCardPublicSnapshot);
      expect(buildSanitizedDealCardPublicSnapshot(null)).toBeNull();
      expect(buildSanitizedDealCardPublicSnapshot(undefined)).toBeNull();

      const sanitized = buildSanitizedDealCardPublicSnapshot({
        memoText: '내부 메모 원문',
        ownerPhone: '010-1234-5678',
        ownerName: '김소유',
        jibunAddress: '역삼동 823-12',
        roadAddress: '테헤란로 152',
        rentRoll: [{ floor: '1F', deposit: 10000 }],
        draftPayload: { secret: true },
        card4: {
          headline: '강남 역세권 오피스',
          region: '강남구 역삼동',
          priceBand: '100~120억',
          points: ['역세권 도보 2분', '코너 각지', '전층 임차'],
          pointBriefs: ['2호선 인접', '가시성 우수', '안정 수익'],
          rawMemo: '비공개 메모',
          pairedMemoId: 'memo-1',
          personas: [{ id: 'p-1', internalNotes: '내부검토' }],
          rent_roll: '비공개 렌트롤',
          memo_text: '숨김 메모',
          internalNotes: '중개인 전용 노트',
        },
        blocks: [{ label: '공개블록', ownerPhone: '010-0000-0000', internalNotes: '삭제대상' }],
      });

      expect(sanitized).toEqual({
        card4: {
          headline: '강남 역세권 오피스',
          region: '강남구 역삼동',
          priceBand: '100~120억',
          points: ['역세권 도보 2분', '코너 각지', '전층 임차'],
          pointBriefs: ['2호선 인접', '가시성 우수', '안정 수익'],
        },
        blocks: [{ label: '공개블록' }],
      });
    });
  });

  describe('P1-3: 20261117000001_workspace_items_and_drift_fix.sql RLS & privilege lockdown', () => {
    it('revokes direct INSERT/UPDATE/DELETE from authenticated and revokes anon enumeration on workspace_items', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261117000001_workspace_items_and_drift_fix.sql',
      );
      const rawSql = fs.readFileSync(migrationPath, 'utf8');
      const sql = stripSqlComments(rawSql);

      expect(sql).toMatch(/ALTER\s+TABLE\s+public\.workspace_items\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i);
      expect(sql).toMatch(/ALTER\s+TABLE\s+public\.workspace_items\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/i);

      // Explicit revoke from PUBLIC, anon, authenticated
      expect(sql).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.workspace_items\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*;/i,
      );

      // Authenticated receives SELECT only — never INSERT, UPDATE, DELETE, or ALL
      expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+public\.workspace_items\s+TO\s+authenticated\s*;/i);
      expect(sql).not.toMatch(
        /GRANT\s+[^;]*\b(?:INSERT|UPDATE|DELETE|ALL)\b[^;]*ON\s+(?:TABLE\s+)?public\.workspace_items\s+TO\s+[^;]*\bauthenticated\b/i,
      );

      // anon receives zero table grants and zero RLS policies on workspace_items
      expect(sql).not.toMatch(
        /GRANT\s+[^;]*ON\s+(?:TABLE\s+)?public\.workspace_items\s+TO\s+[^;]*\banon\b/i,
      );
      expect(sql).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+"workspace_items_public_published_read"\s+ON\s+public\.workspace_items\s*;/i,
      );
      expect(sql).not.toMatch(
        /CREATE\s+POLICY\s+[^;]*ON\s+public\.workspace_items[\s\S]*?TO\s+(?:anon|public)\b/i,
      );

      // Owner write policy is dropped and replaced with owner SELECT-only policy
      expect(sql).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+"workspace_items_owner_all"\s+ON\s+public\.workspace_items\s*;/i,
      );
      expect(sql).toMatch(
        /CREATE\s+POLICY\s+"workspace_items_owner_select"\s+ON\s+public\.workspace_items\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*owner_id\s*=\s*auth\.uid\(\)\s*\)\s*;/i,
      );
      expect(sql).not.toMatch(
        /CREATE\s+POLICY\s+[^;]*ON\s+public\.workspace_items\s+FOR\s+(?:ALL|INSERT|UPDATE|DELETE)\s+TO\s+authenticated\b/i,
      );
    });
  });

  describe('P1-4 & P2: deleteDealCardDependents & backfill content-gate / pagination invariants', () => {
    it('deletes circle_shared_assets polymorphically via (asset_type, asset_id), ignores pre-cutover errors, and surfaces real failures', async () => {
      const recordedEqCalls: Record<string, Array<[string, unknown]>> = {};

      const from = vi.fn((table: string): DeleteQuery => {
        recordedEqCalls[table] = [];
        const runDelete = (): Promise<{ error?: unknown }> => {
          if (table === 'deal_casepacks') {
            return Promise.resolve({
              error: { code: '42P01', message: 'relation "deal_casepacks" does not exist' },
            });
          }
          if (table === 'space_ai_handoffs') {
            return Promise.reject({
              code: 'PGRST205',
              message: 'Could not find the table in the schema cache',
            });
          }
          if (table === 'gate_requests') {
            return Promise.resolve({
              error: { code: '23503', message: 'fk constraint violation on gate_requests' },
            });
          }
          if (table === 'deal_matches') {
            return Promise.reject(new Error('statement timeout on deal_matches'));
          }
          return Promise.resolve({ error: null });
        };

        const builder: DeleteQuery = {
          delete: () => builder,
          eq: (col: string, val: unknown) => {
            recordedEqCalls[table].push([col, val]);
            return builder;
          },
          then: (onfulfilled, onrejected) => runDelete().then(onfulfilled, onrejected),
        };
        return builder;
      });

      const failures = await deleteDealCardDependents({ from }, DEAL_ID);

      expect(recordedEqCalls.circle_shared_assets).toEqual([
        ['asset_type', 'building'],
        ['asset_id', DEAL_ID],
      ]);
      expect(
        recordedEqCalls.circle_shared_assets.some(([col]) => col === 'building_id'),
      ).toBe(false);

      expect(failures).toEqual([
        { table: 'gate_requests', message: 'fk constraint violation on gate_requests' },
        { table: 'deal_matches', message: 'statement timeout on deal_matches' },
      ]);
    });

    it('enforces D2 apply guardrail, content gate on dealcard_sent, and >1,000-row workspace_items pagination in runBackfill', async () => {
      const prevConfirm = process.env.CONFIRM_WORKSPACE_BACKFILL;
      delete process.env.CONFIRM_WORKSPACE_BACKFILL;

      try {
        await expect(runBackfill({ apply: true })).rejects.toThrow(/CONFIRM_WORKSPACE_BACKFILL=1/);

        const bldDraftOnly = 'bbbb1111-7300-4111-8111-bbbbbbbb1101';
        const bldPlaceholderSent = 'bbbb2222-7300-4222-8222-bbbbbbbb2202';
        const bldValidSent = 'bbbb3333-7300-4333-8333-bbbbbbbb3303';

        const events = [
          {
            id: 'ev-1',
            actor_id: OWNER_ID,
            entity_id: bldDraftOnly,
            event_type: 'dealcard_upserted',
            metadata: {
              building_id: bldDraftOnly,
              card4: {
                headline: '역삼역 오피스 초안',
                region: '강남구 역삼동',
                use: '업무시설',
                priceBand: '100~120억',
                points: ['역세권 도보 2분', '코너 각지', '전층 임차'],
              },
            },
            created_at: '2026-11-18T00:00:00.000Z',
          },
          {
            id: 'ev-2',
            actor_id: OWNER_ID,
            entity_id: bldPlaceholderSent,
            event_type: 'dealcard_upserted',
            metadata: {
              building_id: bldPlaceholderSent,
              card4: {
                headline: '임시 카드',
                region: '서울시 핵심권역',
                use: '근린생활시설',
                priceBand: '100~120억',
                points: ['우수 입지', '추천 매물', '안정 수익'],
              },
            },
            created_at: '2026-11-18T00:01:00.000Z',
          },
          {
            id: 'ev-3',
            actor_id: OWNER_ID,
            entity_id: bldPlaceholderSent,
            event_type: 'dealcard_sent',
            metadata: { building_id: bldPlaceholderSent },
            created_at: '2026-11-18T00:02:00.000Z',
          },
          {
            id: 'ev-4',
            actor_id: OWNER_ID,
            entity_id: bldValidSent,
            event_type: 'dealcard_upserted',
            metadata: {
              building_id: bldValidSent,
              card4: {
                headline: '청담동 코너 근생',
                region: '강남구 청담동',
                use: '근린생활시설',
                priceBand: '140~160억',
                points: ['대로변 코너 각지', '전층 우량 임차인', '안정 임대 수익'],
                ownerPhone: '010-9999-8888',
              },
            },
            created_at: '2026-11-18T00:03:00.000Z',
          },
          {
            id: 'ev-5',
            actor_id: OWNER_ID,
            entity_id: bldValidSent,
            event_type: 'dealcard_sent',
            metadata: { building_id: bldValidSent },
            created_at: '2026-11-18T00:04:00.000Z',
          },
        ];

        const existingWorkspaceRows = [
          ...Array.from({ length: 1004 }, (_, idx) => ({
            id: `00000000-7300-4000-8000-${String(idx).padStart(12, '0')}`,
            owner_id: OWNER_ID,
            kind: 'dealcard',
            legacy_id: `legacy-seed-${idx}`,
            building_id: null,
          })),
          // Row 1005 sits on page 2 (offset 1000..1999) and matches bldValidSent
          {
            id: '00000000-7300-4000-8000-000000001005',
            owner_id: OWNER_ID,
            kind: 'dealcard',
            legacy_id: null,
            building_id: bldValidSent,
          },
        ];

        const supabaseOverride = {
          from: (table: string) =>
            createQueryChain(table, ({ table: tbl, rangeFrom, rangeTo }) => {
              if (tbl === 'activity_events') {
                const start = rangeFrom ?? 0;
                const end = (rangeTo ?? events.length - 1) + 1;
                return { data: events.slice(start, end), error: null };
              }
              if (tbl === 'profiles') {
                return { data: [{ id: OWNER_ID }], error: null };
              }
              if (tbl === 'building_ssot_lite') {
                return {
                  data: [
                    { id: bldDraftOnly },
                    { id: bldPlaceholderSent },
                    { id: bldValidSent },
                  ],
                  error: null,
                };
              }
              if (tbl === 'workspace_items') {
                const start = rangeFrom ?? 0;
                const end = (rangeTo ?? existingWorkspaceRows.length - 1) + 1;
                return { data: existingWorkspaceRows.slice(start, end), error: null };
              }
              return { data: [], error: null };
            }),
        } as unknown as NonNullable<Parameters<typeof runBackfill>[0]>['supabaseOverride'];

        const report = await runBackfill({ apply: false, supabaseOverride });

        expect(report.mode).toBe('dry-run');
        expect(report.validProfileCandidates).toBe(3);
        expect(report.byStatus.draft).toBe(2);
        expect(report.byStatus.sent).toBe(1);
        expect(report.gateRejectionCount).toBe(1);
        expect(report.gateRejections[0]).toMatchObject({
          eventType: 'dealcard_sent',
          code: 'DEALCARD_PLACEHOLDER_COPY',
        });
        expect(report.existingWorkspaceRows).toBe(1005);
        // bldValidSent was matched on page 2 of workspace_items, leaving 2 pending rows
        expect(report.pendingBackfillCount).toBe(2);
      } finally {
        if (prevConfirm === undefined) delete process.env.CONFIRM_WORKSPACE_BACKFILL;
        else process.env.CONFIRM_WORKSPACE_BACKFILL = prevConfirm;
      }
    });
  });
});
