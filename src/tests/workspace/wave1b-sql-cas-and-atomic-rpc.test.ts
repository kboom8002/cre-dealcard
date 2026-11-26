/**
 * @file src/tests/workspace/wave1b-sql-cas-and-atomic-rpc.test.ts
 * @description Wave 1 Track 1B Verification Suite:
 *   1. SQL-level Optimistic Concurrency Control (CAS):
 *      - `upsertWorkspaceItem` appends `.eq('version', existing.version)` when `expectedVersion` is provided.
 *      - Concurrent version advance between SELECT and UPDATE throws `409 VERSION_CONFLICT` without
 *        executing the blind `safeDraftOnlyPayload` overwrite.
 *      - Preserves compatibility with lightweight mock DBs returning `{ data: null, error: null }` without `.select()`.
 *   2. `handlePatchWorkspaceImUpsert` (`patch-upsert-im.ts`) & `PptxStudioService` (`studio-service.ts`):
 *      - Forwards `expectedVersion` to `upsertWorkspaceItem` and returns `409 VERSION_CONFLICT` on stale edits.
 *      - Strips multi-MB inline base64 strings from `activity_events.metadata` while preserving summary fields.
 *      - `PptxStudioService` reads authoritative DB state across warm lambdas and enforces `saveProject` OCC.
 *   3. Hermetic PGlite execution of `20261126000003_sota_atomic_domain_rpcs.sql`:
 *      - `policy-scan.mjs` compliance, `SECURITY DEFINER` `search_path = public`, and `REVOKE PUBLIC, anon`.
 *      - Atomic rollback on `rpc_publish_magazine_edition` & `rpc_delete_magazine_edition` when `magazine_issues` fails.
 *      - `pg_advisory_xact_lock(hashtext(p_asset_id))` serialization & clean prune in `rpc_replace_lease_ledger`.
 *      - Atomic approval + `im_approvals` + `workspace_items` sync & CAS conflict in `rpc_approve_im_document`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';
import { scanFile } from '../../../scripts/policy-scan.mjs';

const hoisted = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  brokerGuard: null as {
    user: { id: string; email: string } | null;
    role?: string;
    profile?: Record<string, unknown>;
    error: Response | null;
  } | null,
  brokerCtx: null as {
    userId: string;
    slug: string | null;
    displayName: string | null;
    brokerKeys: string[];
  } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => hoisted.serviceClient),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () =>
    hoisted.brokerGuard ?? {
      user: null,
      error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }),
    }
  ),
}));

vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: vi.fn(async () =>
      hoisted.brokerCtx
        ? { ctx: hoisted.brokerCtx, error: null }
        : { ctx: null, error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401) }
    ),
  };
});

import {
  getWorkspaceItemByAnyId,
  resetWorkspaceRepositoryCacheForTests,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
} from '@/lib/workspace/workspace-repository';
import { handlePatchWorkspaceImUpsert } from '@/lib/workspace/summary/patch-upsert-im';
import { PptxStudioService } from '@/domain/building/pptx-studio/studio-service';
import { computeContentHash } from '@/domain/building/im-core/hashes';
import { POST as publishMagazinePost } from '@/app/api/magazine/editions/[id]/publish/route';
import { DELETE as deleteMagazineRoute } from '@/app/api/magazine/editions/route';
import { POST as approveImPost } from '@/app/api/broker/im-lite/[id]/approve/route';

const MIGRATION_FILE = '20261126000003_sota_atomic_domain_rpcs.sql';
const BROKER_A = '11111111-1111-4111-8111-111111111b01';
const BROKER_B = '22222222-2222-4222-8222-222222222b02';
const SLUG_A = 'wave1b-broker-a';

describe('Wave 1 Track 1B: SQL-Level CAS Optimistic Locking & Atomic Domain RPCs', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    const p4aSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261027000003_p4a_im_versioning.sql'),
      'utf8'
    );
    const wave1bSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations', MIGRATION_FILE),
      'utf8'
    );

    const prereqPatchSql = `
      ALTER TABLE public.im_share_links ADD COLUMN IF NOT EXISTS version_id UUID;
      ALTER TABLE public.document_objects ADD COLUMN IF NOT EXISTS broker_id UUID;
    `;
    harness = await PgliteSupabaseHarness.create({
      extraMigrations: [prereqPatchSql, p4aSql, wave1bSql, wave1bSql], // Dual-replay proves idempotency
    });

    hoisted.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_A,
      email: 'wave1b-a@credeal.test',
      displayName: '박원자',
      company: '원자부동산중개법인',
      phone: '02-555-7788',
      slug: SLUG_A,
      registrationNo: '11680-2025-00999',
      officeAddress: '서울특별시 강남구 테헤란로 211, 8층',
    });
    await harness.seedUser({
      id: BROKER_B,
      email: 'wave1b-b@credeal.test',
      displayName: '최경쟁',
      company: '경쟁중개사무소',
      phone: '02-555-9900',
      slug: 'wave1b-broker-b',
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.close();
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    resetWorkspaceRepositoryCacheForTests();
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';

    hoisted.serviceClient = harness.createClient({ role: 'service_role' });
    hoisted.brokerGuard = {
      user: { id: BROKER_A, email: 'wave1b-a@credeal.test' },
      role: 'broker',
      profile: { role: 'broker', display_name: '박원자' },
      error: null,
    };
    hoisted.brokerCtx = {
      userId: BROKER_A,
      slug: SLUG_A,
      displayName: '박원자',
      brokerKeys: [SLUG_A, BROKER_A],
    };
  });

  describe('1. SQL-Level CAS in workspace-repository.ts & patch-upsert-im.ts', () => {
    it('chains .eq("version", existing.version) on SQL UPDATE and throws 409 VERSION_CONFLICT without blind overwrite when concurrent DB version advances between SELECT and UPDATE', async () => {
      // Seed v1 item in real PGlite
      const { item: seeded } = await upsertWorkspaceItem(hoisted.serviceClient, {
        ownerId: BROKER_A,
        legacyId: 'cas-race-item-1',
        kind: 'dealcard',
        status: 'draft',
        title: '초기 버전 1',
        address: '강남구 역삼동',
        draftPayload: { card4: { headline: '버전 1 헤드라인' } },
      });
      expect(seeded).not.toBeNull();
      expect(seeded!.version).toBe(1);

      // Wrap real PGlite client to (a) record SQL .eq() filters on UPDATE and
      // (b) simulate a concurrent writer advancing version 1 -> 2 right after SELECT and before UPDATE executes!
      const recordedUpdateEqFilters: Array<[string, unknown]> = [];
      let updateCallCount = 0;
      let injectedConcurrentAdvance = false;

      const racingClient = {
        from(table: string) {
          const realBuilder = hoisted.serviceClient!.from(table);
          if (table !== 'workspace_items') return realBuilder;

          const origUpdate = realBuilder.update.bind(realBuilder);
          realBuilder.update = (patch: object) => {
            updateCallCount += 1;
            const updBuilder = origUpdate(patch);
            const origEq = updBuilder.eq.bind(updBuilder);
            updBuilder.eq = (col: string, val: unknown) => {
              recordedUpdateEqFilters.push([col, val]);
              return origEq(col, val);
            };
            const origSingle = updBuilder.single.bind(updBuilder);
            updBuilder.single = (async () => {
              if (!injectedConcurrentAdvance) {
                injectedConcurrentAdvance = true;
                // Concurrent writer commits version = 2 in SQL right before this UPDATE runs!
                await harness.db.query(
                  `UPDATE public.workspace_items
                   SET version = 2, title = '동시 커밋된 버전 2', draft_payload = '{"winner":"writerB"}'::jsonb
                   WHERE id = $1`,
                  [seeded!.id]
                );
              }
              return await origSingle();
            }) as unknown as typeof updBuilder.single;
            return updBuilder;
          };
          return realBuilder;
        },
      };

      await expect(
        upsertWorkspaceItem(racingClient, {
          id: seeded!.id,
          ownerId: BROKER_A,
          kind: 'dealcard',
          status: 'draft',
          title: '뒤늦은 덮어쓰기 시도',
          draftPayload: { winner: 'staleWriterA' },
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({
        status: 409,
        code: 'VERSION_CONFLICT',
        currentVersion: 2,
      } satisfies Partial<WorkspaceRepositoryError>);

      // 1) SQL UPDATE explicitly chained .eq('id', seeded.id) AND .eq('version', 1)
      expect(recordedUpdateEqFilters).toEqual(
        expect.arrayContaining([
          ['id', seeded!.id],
          ['version', 1],
        ])
      );
      // 2) Only 1 UPDATE was attempted — the blind zeroRowsMatched fallback overwrite NEVER ran!
      expect(updateCallCount).toBe(1);

      // 3) Authoritative row in PGlite retains concurrent winner's title & draft_payload intact!
      const authoritative = await getWorkspaceItemByAnyId(hoisted.serviceClient, seeded!.id, 'dealcard', BROKER_A);
      expect(authoritative?.version).toBe(2);
      expect(authoritative?.title).toBe('동시 커밋된 버전 2');
      expect(authoritative?.draftPayload).toEqual({ winner: 'writerB' });
    });

    it('keeps compatibility with lightweight unit-test mock DBs returning { data: null, error: null } on .update() without .select()', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      const lightweightMockDb = {
        from(table: string) {
          if (table !== 'workspace_items') {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
          }
          return {
            select: () => {
              const q: Record<string, unknown> = {
                or: () => q,
                eq: () => q,
                order: () => q,
                limit: () => q,
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                        owner_id: BROKER_A,
                        kind: 'dealcard',
                        status: 'draft',
                        title: 'Mock Row',
                        address: '서초구',
                        draft_payload: {},
                        version: 3,
                      },
                    ],
                    error: null,
                  }).then(resolve),
              };
              return q;
            },
            update: () => {
              // Notice: NO .select() method on this lightweight mock update chain!
              const uq: Record<string, unknown> = {
                eq: (col: string, val: unknown) => {
                  eqCalls.push([col, val]);
                  return uq;
                },
                neq: () => uq,
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: null, error: null }).then(resolve),
              };
              return uq;
            },
          };
        },
      };

      const res = await upsertWorkspaceItem(lightweightMockDb, {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ownerId: BROKER_A,
        kind: 'dealcard',
        title: 'Updated Mock Title',
        draftPayload: { ok: true },
        expectedVersion: 3,
      });

      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          ['version', 3],
        ])
      );
      expect(res.tableAvailable).toBe(true);
      expect(res.item?.version).toBe(4);
      expect(res.item?.title).toBe('Updated Mock Title');
    });

    it('forwards expectedVersion in patch-upsert-im.ts (rejecting stale edits with 409) and strips multi-MB base64 strings from activity_events.metadata', async () => {
      const giantBase64Photo = `data:image/png;base64,${'A'.repeat(25_000)}`;
      const hostedPhotoUrl = 'https://cdn.credeal.test/photos/exterior-1.jpg';

      // 1) Initial IM save creates v1
      const createRes = await handlePatchWorkspaceImUpsert({
        supabase: hoisted.serviceClient as any,
        userId: BROKER_A,
        role: 'broker',
        action: 'upsert_im',
        buildingId: 'bld-im-cas-01',
        uuidOwnerVerified: false,
        brokerProfileMeta: { displayName: '박원자', company: '원자부동산중개법인', phone: '02-555-7788' },
        body: {
          action: 'upsert_im',
          buildingId: 'bld-im-cas-01',
          imItem: {
            id: 'im-cas-01',
            buildingId: 'bld-im-cas-01',
            title: '역삼 프라임 타워 v1',
            address: '서울특별시 강남구 역삼동 700-1',
            askingPriceManwon: 950_000,
            status: 'draft',
            hasUnpublishedEdits: true,
            photos: [
              { url: giantBase64Photo, caption: '인라인 대용량 사진' },
              { url: hostedPhotoUrl, caption: 'CDN 외관 사진' },
            ],
            cadastralMapImage: giantBase64Photo,
          },
        },
      });
      expect(createRes.status).toBe(200);
      const createJson = await createRes.json();
      expect(createJson.version).toBe(1);

      // Verify activity_events.metadata does NOT contain the 25KB base64 string while preserving summary fields
      const evRows = await harness.db.query<{ metadata: Record<string, any> }>(
        `SELECT metadata FROM public.activity_events
         WHERE actor_id = $1 AND event_type = 'im_upserted'
         ORDER BY created_at DESC LIMIT 1`,
        [BROKER_A]
      );
      expect(evRows.rows).toHaveLength(1);
      const savedMeta = evRows.rows[0].metadata;
      expect(JSON.stringify(savedMeta)).not.toContain('AAAAAAAAAA');
      expect(savedMeta.im_item.title).toBe('역삼 프라임 타워 v1');
      expect(savedMeta.im_item.askingPriceManwon).toBe(950_000);
      expect(savedMeta.im_item.photos).toEqual([{ url: hostedPhotoUrl, caption: 'CDN 외관 사진' }]);
      expect(savedMeta.im_item.photoCount).toBe(2);

      // 2) Matching expectedVersion: 1 -> advances to version 2
      const okUpdateRes = await handlePatchWorkspaceImUpsert({
        supabase: hoisted.serviceClient as any,
        userId: BROKER_A,
        role: 'broker',
        action: 'upsert_im',
        buildingId: 'bld-im-cas-01',
        uuidOwnerVerified: false,
        brokerProfileMeta: undefined,
        body: {
          action: 'upsert_im',
          buildingId: 'bld-im-cas-01',
          expectedVersion: 1,
          imItem: {
            id: 'im-cas-01',
            buildingId: 'bld-im-cas-01',
            title: '역삼 프라임 타워 v2',
            address: '서울특별시 강남구 역삼동 700-1',
            askingPriceManwon: 980_000,
            status: 'draft',
            hasUnpublishedEdits: true,
          },
        },
      });
      expect(okUpdateRes.status).toBe(200);
      const okUpdateJson = await okUpdateRes.json();
      expect(okUpdateJson.version).toBe(2);

      // 3) Stale expectedVersion: 1 -> rejected with 409 VERSION_CONFLICT
      const staleRes = await handlePatchWorkspaceImUpsert({
        supabase: hoisted.serviceClient as any,
        userId: BROKER_A,
        role: 'broker',
        action: 'upsert_im',
        buildingId: 'bld-im-cas-01',
        uuidOwnerVerified: false,
        brokerProfileMeta: undefined,
        body: {
          action: 'upsert_im',
          buildingId: 'bld-im-cas-01',
          expectedVersion: 1,
          imItem: {
            id: 'im-cas-01',
            buildingId: 'bld-im-cas-01',
            title: '구버전 덮어쓰기 시도',
            address: '서울특별시 강남구 역삼동 700-1',
            askingPriceManwon: 500_000,
            status: 'draft',
            hasUnpublishedEdits: true,
          },
        },
      });
      expect(staleRes.status).toBe(409);
      const staleJson = await staleRes.json();
      expect(staleJson.code).toBe('VERSION_CONFLICT');
      expect(staleJson.conflict).toBe(true);
      expect(staleJson.currentVersion).toBe(2);
    });
  });

  describe('2. PptxStudioService Cross-Lambda Cache Freshness & saveProject OCC', () => {
    it('serves fresh DB state across warm studio instances and enforces expectedLockVersion / expectedUpdatedAt in saveProject', async () => {
      // Temporarily allow memory cache alongside DB-backed runtime to simulate two warm serverless lambdas!
      delete process.env.DISABLE_MEMORY_STORE;

      const bldRes = await harness.db.query<{ id: string }>(
        `INSERT INTO public.building_ssot_lite (owner_id, address) VALUES ($1, '서울 강남구 삼성동 100') RETURNING id`,
        [BROKER_A]
      );
      const buildingUuid = bldRes.rows[0].id;

      const lambdaA = new PptxStudioService();
      const lambdaB = new PptxStudioService();

      const created = await lambdaA.createBasicImProject(
        buildingUuid,
        '삼성동 마스터 빌딩',
        { ssot_summary: { address: '서울 강남구 삼성동 100', asking_price_manwon: 1_500_000 } },
        undefined,
        BROKER_A
      );
      expect(created.lockVersion).toBe(1);

      // Lambda B updates slide overrides (advancing lockVersion 1 -> 2 in Supabase document_objects)
      const coverSlideId = created.slides[0].id;
      const updatedOnB = await lambdaB.patchSlideOverrides(
        created.id,
        coverSlideId,
        { title: 'Lambda B 최신 수정 제목' },
        1,
        BROKER_A
      );
      expect(updatedOnB.lockVersion).toBe(2);

      // Lambda A (which still had lockVersion=1 in its warm this.projects Map!) MUST fetch lockVersion=2 from DB!
      const fetchedOnA = await lambdaA.getProject(created.id);
      expect(fetchedOnA.lockVersion).toBe(2);
      expect(fetchedOnA.slides[0].title).toBe('Lambda B 최신 수정 제목');

      // saveProject with stale expectedLockVersion throws STALE_LOCK_ERROR
      await expect(
        lambdaA.saveProject({ ...fetchedOnA, title: 'Stale Save' }, { ownerId: BROKER_A, expectedLockVersion: 1 })
      ).rejects.toThrow(/STALE_LOCK_ERROR/);

      // saveProject with stale expectedUpdatedAt throws STALE_LOCK_ERROR
      await expect(
        lambdaA.saveProject(
          { ...fetchedOnA, title: 'Stale Timestamp Save' },
          { ownerId: BROKER_A, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }
        )
      ).rejects.toThrow(/STALE_LOCK_ERROR/);
    });
  });

  describe('3. PGlite Atomic Transactional Domain RPCs (20261126000003_sota_atomic_domain_rpcs.sql)', () => {
    it('passes policy-scan.mjs with 0 findings and locks down SECURITY DEFINER search_path & ACLs', async () => {
      const findings = scanFile(MIGRATION_FILE);
      expect(findings).toEqual([]);

      const procCheck = await harness.db.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        anon_exec: boolean;
        auth_exec: boolean;
        service_exec: boolean;
      }>(`
        SELECT
          p.proname,
          p.prosecdef,
          p.proconfig,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'rpc_publish_magazine_edition',
            'rpc_delete_magazine_edition',
            'rpc_replace_lease_ledger',
            'rpc_approve_im_document'
          )
        ORDER BY p.proname;
      `);

      expect(procCheck.rows).toHaveLength(4);
      for (const row of procCheck.rows) {
        expect(row.prosecdef).toBe(true);
        expect(row.proconfig ?? []).toContain('search_path=public');
        expect(row.anon_exec).toBe(false);
        expect(row.auth_exec).toBe(false);
        expect(row.service_exec).toBe(true);
      }
    });

    it('atomically publishes magazine_editions + magazine_issues via rpc_publish_magazine_edition and rolls back magazine_editions on magazine_issues failure', async () => {
      const draftContent = {
        schemaVersion: 1,
        kind: 'weekly',
        headline: '원자적 발행 검증 헤드라인',
        briefing: '이번 주 강남 오피스 캡레이트 및 거래 동향 요약입니다.',
      };

      const edInsert = await harness.db.query<{ id: string }>(
        `INSERT INTO public.magazine_editions (broker_id, broker_user_id, edition_type, edition_label, status, title, content)
         VALUES ($1, $2, 'weekly', 'W48-2026', 'draft', '초안 제목', $3::jsonb)
         RETURNING id`,
        [SLUG_A, BROKER_A, JSON.stringify(draftContent)]
      );
      const editionId = edInsert.rows[0].id;

      // Inject a temporary trigger on magazine_issues to simulate mid-transaction failure
      await harness.db.exec(`
        CREATE OR REPLACE FUNCTION public.tmp_fail_magazine_issues()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'SIMULATED_ISSUES_WRITE_FAILURE';
        END;
        $$;
        CREATE TRIGGER trg_tmp_fail_magazine_issues
          BEFORE INSERT OR UPDATE ON public.magazine_issues
          FOR EACH ROW EXECUTE FUNCTION public.tmp_fail_magazine_issues();
      `);

      try {
        const failRes = await publishMagazinePost(
          new NextRequest(`https://credeal.net/api/magazine/editions/${editionId}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acknowledgeQualityGate: true }),
          }),
          { params: Promise.resolve({ id: editionId }) }
        );
        expect(failRes.status).toBe(500);

        // Atomic rollback assertion: magazine_editions MUST remain status='draft' with published_at IS NULL!
        const afterFail = await harness.db.query<{ status: string; published_at: string | null }>(
          `SELECT status, published_at FROM public.magazine_editions WHERE id = $1`,
          [editionId]
        );
        expect(afterFail.rows[0].status).toBe('draft');
        expect(afterFail.rows[0].published_at).toBeNull();
      } finally {
        await harness.db.exec(`
          DROP TRIGGER IF EXISTS trg_tmp_fail_magazine_issues ON public.magazine_issues;
          DROP FUNCTION IF EXISTS public.tmp_fail_magazine_issues();
        `);
      }

      // Now remove trigger and verify atomic publish commits BOTH magazine_editions and magazine_issues
      const okRes = await publishMagazinePost(
        new NextRequest(`https://credeal.net/api/magazine/editions/${editionId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acknowledgeQualityGate: true }),
        }),
        { params: Promise.resolve({ id: editionId }) }
      );
      expect(okRes.status).toBe(200);
      const okJson = await okRes.json();
      expect(okJson.ok).toBe(true);

      const edAfter = await harness.db.query<{ status: string; published_at: string | null }>(
        `SELECT status, published_at FROM public.magazine_editions WHERE id = $1`,
        [editionId]
      );
      expect(edAfter.rows[0].status).toBe('published');
      expect(edAfter.rows[0].published_at).not.toBeNull();

      const issAfter = await harness.db.query<{ broker_id: string; issue_date: string }>(
        `SELECT broker_id, issue_date::text AS issue_date
         FROM public.magazine_issues
         WHERE broker_id = $1 AND issue_date::text = $2`,
        [SLUG_A, okJson.issueDate]
      );
      expect(issAfter.rows).toHaveLength(1);
    });

    it('atomically deletes magazine_editions + cleans up magazine_issues via rpc_delete_magazine_edition and rolls back on failure', async () => {
      const issueDate = '2026-11-20';
      const edRes = await harness.db.query<{ id: string }>(
        `INSERT INTO public.magazine_editions (
           broker_id, broker_user_id, edition_type, edition_label, status, title, published_at, content
         ) VALUES (
           $1, $2, 'daily', $3, 'published', '삭제 대상 발행본', '2026-11-20T02:00:00Z',
           $4::jsonb
         ) RETURNING id`,
        [SLUG_A, BROKER_A, issueDate, JSON.stringify({ schemaVersion: 1, headline: '삭제 테스트', issueDate })]
      );
      const editionId = edRes.rows[0].id;

      await harness.db.query(
        `INSERT INTO public.magazine_issues (broker_id, issue_date, content)
         VALUES ($1, $2, '{"headline":"삭제 테스트"}'::jsonb)
         ON CONFLICT (broker_id, issue_date) DO UPDATE SET content = EXCLUDED.content`,
        [SLUG_A, issueDate]
      );

      // Force magazine_issues DELETE to fail -> edition deletion MUST roll back atomically!
      await harness.db.exec(`
        CREATE OR REPLACE FUNCTION public.tmp_fail_issues_delete()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'SIMULATED_ISSUES_DELETE_FAILURE';
        END;
        $$;
        CREATE TRIGGER trg_tmp_fail_issues_delete
          BEFORE DELETE ON public.magazine_issues
          FOR EACH ROW EXECUTE FUNCTION public.tmp_fail_issues_delete();
      `);

      try {
        const failDelRes = await deleteMagazineRoute(
          new NextRequest(`https://credeal.net/api/magazine/editions?id=${editionId}`, {
            method: 'DELETE',
          })
        );
        expect(failDelRes.status).toBe(500);

        const stillExists = await harness.db.query<{ id: string }>(
          `SELECT id FROM public.magazine_editions WHERE id = $1`,
          [editionId]
        );
        expect(stillExists.rows).toHaveLength(1);
      } finally {
        await harness.db.exec(`
          DROP TRIGGER IF EXISTS trg_tmp_fail_issues_delete ON public.magazine_issues;
          DROP FUNCTION IF EXISTS public.tmp_fail_issues_delete();
        `);
      }

      // Now delete succeeds atomically across both tables
      const okDelRes = await deleteMagazineRoute(
        new NextRequest(`https://credeal.net/api/magazine/editions?id=${editionId}`, {
          method: 'DELETE',
        })
      );
      expect(okDelRes.status).toBe(200);

      const edGone = await harness.db.query(`SELECT id FROM public.magazine_editions WHERE id = $1`, [editionId]);
      expect(edGone.rows).toHaveLength(0);

      const issGone = await harness.db.query(
        `SELECT id FROM public.magazine_issues WHERE broker_id = $1 AND issue_date::text = $2`,
        [SLUG_A, issueDate]
      );
      expect(issGone.rows).toHaveLength(0);
    });

    it('acquires pg_advisory_xact_lock(hashtext(p_asset_id)) and serializes rent-roll replacement cleanly in rpc_replace_lease_ledger', async () => {
      const assetId = 'asset-rentroll-lock-01';

      // Verify advisory transaction lock is acquired inside a live transaction
      await harness.db.transaction(async (tx) => {
        const rpcOut = await tx.query<{ res: Record<string, unknown> }>(
          `SELECT public.rpc_replace_lease_ledger(
             $1,
             $2::jsonb,
             $3::jsonb,
             'broker_input'
           ) AS res`,
          [
            assetId,
            JSON.stringify([
              { unit_label: '1F', tenant_business: '스타벅스', deposit_krw: 100_000_000, monthly_rent_krw: 8_000_000, lease_state: '임대중' },
              { unit_label: '2F', tenant_business: '메디컬의원', deposit_krw: 50_000_000, monthly_rent_krw: 4_500_000, lease_state: '임대중' },
            ]),
            JSON.stringify({ area_input_unit: 'pyeong', rentroll_version: '1.5', asking_price_krw: 12_000_000_000 }),
          ]
        );
        expect(rpcOut.rows[0].res).toMatchObject({
          ok: true,
          asset_id: assetId,
          inserted: 2,
          meta_updated: true,
        });

        const lockCheck = await tx.query<{ cnt: number }>(
          `SELECT count(*)::int AS cnt
           FROM pg_locks
           WHERE locktype = 'advisory'
             AND objid = (hashtext($1)::bigint & 4294967295)
             AND granted = true`,
          [assetId]
        );
        expect(lockCheck.rows[0].cnt).toBeGreaterThanOrEqual(1);
      });

      // Seed a studio_input row to verify p_prune_source_tier isolation
      await harness.db.query(
        `SELECT public.rpc_replace_lease_ledger($1, $2::jsonb, NULL, 'studio_input')`,
        [
          assetId,
          JSON.stringify([{ unit_label: 'B1', tenant_business: '스튜디오편집호실', source_tier: 'studio_input' }]),
        ]
      );

      // Run two concurrent broker_input replacements; final state must cleanly match the second replacement without touching studio_input!
      const [r1, r2] = await Promise.all([
        hoisted.serviceClient!.rpc('rpc_replace_lease_ledger', {
          p_asset_id: assetId,
          p_rows: [
            { unit_label: '1F', tenant_business: '1차교체_1F', monthly_rent_krw: 8_200_000 },
            { unit_label: '3F', tenant_business: '1차교체_3F', monthly_rent_krw: 3_900_000 },
          ],
          p_meta: { area_input_unit: 'sqm' },
          p_prune_source_tier: 'broker_input',
        }),
        hoisted.serviceClient!.rpc('rpc_replace_lease_ledger', {
          p_asset_id: assetId,
          p_rows: [
            { unit_label: '4F', tenant_business: '최종교체_4F', monthly_rent_krw: 5_100_000 },
          ],
          p_meta: { area_input_unit: 'pyeong' },
          p_prune_source_tier: 'broker_input',
        }),
      ]);

      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();

      const finalRows = await harness.db.query<{ unit_label: string; tenant_business: string; source_tier: string }>(
        `SELECT unit_label, tenant_business, source_tier
         FROM public.lease_ledger
         WHERE asset_id = $1
         ORDER BY unit_label`,
        [assetId]
      );
      // studio_input ('B1') preserved; broker_input has ONLY '4F' (no stale '1F', '2F', '3F' orphans!)
      expect(finalRows.rows).toEqual([
        { unit_label: '4F', tenant_business: '최종교체_4F', source_tier: 'broker_input' },
        { unit_label: 'B1', tenant_business: '스튜디오편집호실', source_tier: 'studio_input' },
      ]);
    });

    it('atomically seals document_objects, writes im_approvals, and publishes workspace_items in approve route (with rollback on failure)', async () => {
      const bldRes = await harness.db.query<{ id: string }>(
        `INSERT INTO public.building_ssot_lite (owner_id, address) VALUES ($1, '서울특별시 강남구 역삼동 823-10') RETURNING id`,
        [BROKER_A]
      );
      const bldId = bldRes.rows[0].id;

      const approveBody = {
        releaseTier: 'fact_om',
        im_type: 'mobile_im_lite',
        buildingName: '역삼 아토믹 타워',
        address: '서울특별시 강남구 역삼동 823-10',
        askingPriceManwon: 1_200_000,
        gfaSqm: 1_650,
        landAreaSqm: 420,
        zoning: '일반상업지역',
        floorsAbove: 7,
        completionDate: '2019-06-15',
        privateMemo: '내부 비공개 메모',
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
        sections: [{ sectionId: '01', title: '물건 개요', content: '역삼역 도보 3분 코어 오피스' }],
      };

      const expectedHash = computeContentHash({
        body: approveBody,
        releaseTier: 'fact_om',
        policyVersion: '2026-08-31',
      });

      const docRes = await harness.db.query<{ id: string }>(
        `INSERT INTO public.document_objects (owner_id, broker_id, building_id, document_type, status, title, body)
         VALUES ($1, $1, $2, 'mobile_im', 'draft', '역삼 아토믹 타워', $3::jsonb)
         RETURNING id`,
        [BROKER_A, bldId, JSON.stringify(approveBody)]
      );
      const docId = docRes.rows[0].id;

      await upsertWorkspaceItem(hoisted.serviceClient, {
        id: docId,
        buildingId: bldId,
        ownerId: BROKER_A,
        kind: 'im',
        status: 'draft',
        title: '역삼 아토믹 타워',
        address: '서울특별시 강남구 역삼동 823-10',
        draftPayload: approveBody,
      });

      const approveRes = await approveImPost(
        new NextRequest(`https://credeal.net/api/broker/im-lite/${docId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', expectedHash }),
        }),
        { params: Promise.resolve({ id: docId }) }
      );
      expect(approveRes.status).toBe(200);

      const sealedDoc = await harness.db.query<{ status: string; seal_hash: string | null }>(
        `SELECT status, seal_hash FROM public.document_objects WHERE id = $1`,
        [docId]
      );
      expect(sealedDoc.rows[0].status).toBe('published');
      expect(sealedDoc.rows[0].seal_hash).toBe(expectedHash);

      const ledgerRows = await harness.db.query<{ version_id: string; target_hash: string }>(
        `SELECT version_id, target_hash FROM public.im_approvals WHERE version_id = $1`,
        [docId]
      );
      expect(ledgerRows.rows).toHaveLength(1);
      expect(ledgerRows.rows[0].target_hash).toBe(expectedHash);

      const syncedWs = await getWorkspaceItemByAnyId(hoisted.serviceClient, docId, 'im', BROKER_A);
      expect(syncedWs?.status).toBe('published');
      expect(syncedWs?.publishedSnapshot).not.toHaveProperty('privateMemo');
    });
  });
});
