/**
 * Wave 1 (WP 1-0 / WP 1-A / WP 1-B / WP 1-E / WP 1-F):
 * Real PostgreSQL + RLS Integration Suite backed by @electric-sql/pglite.
 * Zero DB query mocks: runs 20261115 + 20261117 migrations in PGlite and
 * exercises real repository/route handlers under SQL RLS + DISABLE_MEMORY_STORE=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  authUser: null as { id: string; email: string; role?: string } | null,
  viewer: null as { userId: string | null; isAdmin: boolean } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, error: null }
      : {
          user: null,
          error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        },
}));

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: async () => h.viewer,
}));

import {
  assertLegacyOrDbOwnership,
  upsertWorkspaceItem,
  getWorkspaceItemByAnyId,
  getPublicWorkspaceProjection,
  softDeleteWorkspaceItem,
  restoreWorkspaceItem,
  WorkspaceRepositoryError,
  resetWorkspaceRepositoryCacheForTests,
} from '@/lib/workspace/workspace-repository';
import {
  allowDealPublicMemoryFallback,
  resolvePublicDealWorkspaceGuard,
} from '@/lib/og/deal-public-guard';
import { issueShareLinkToken, revokeShareLinkToken, resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { saveQuickImRecord, saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { handleGetInbox } from '@/lib/inbox/inbox-query';
import { GET as getPublicImLite } from '@/app/api/public/im-lite/[buildingId]/route';

const BROKER_A = '11111111-1111-4111-8111-1111111111a1';
const BROKER_B = '22222222-2222-4222-8222-2222222222b2';

describe('PGlite SQL + RLS Workspace & Inbox Integration Suite', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261117000001_workspace_items_and_drift_fix.sql'),
      'utf8',
    );
    // WP-7.3C P1-3: ACL block now ends with the owner-scoped authenticated SELECT grant
    // (no anon grant, no authenticated INSERT/UPDATE/DELETE).
    const aclMatch = migrationSql.match(
      /REVOKE ALL ON TABLE public\.workspace_items[\s\S]*?GRANT SELECT ON TABLE public\.workspace_items TO authenticated;/,
    );
    expect(aclMatch).not.toBeNull();
    expect(aclMatch![0]).not.toMatch(/TO anon/);
    expect(aclMatch![0]).not.toMatch(/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/);
    await harness.db.exec(aclMatch![0]);
    h.serviceClient = harness.createClient({ role: 'service_role' });
    await harness.seedUser({ id: BROKER_A, email: 'brokerA@credeal.test', displayName: '김갑수' });
    await harness.seedUser({ id: BROKER_B, email: 'brokerB@credeal.test', displayName: '이을동' });
  }, 30_000);

  afterAll(async () => {
    await harness?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
    delete process.env.ALLOW_DEMO_SEEDS_IN_PROD;
    process.env.SHARE_LINK_SECRET = 'pglite-test-share-link-secret-minimum-32-chars!!';
    resetWorkspaceRepositoryCacheForTests();
    resetShareLinkTokenStoreForTests();
    h.authUser = { id: BROKER_A, email: 'brokerA@credeal.test', role: 'broker' };
    h.viewer = null;
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
  });

  it('enforces real SQL RLS isolation across authenticated brokers and anon viewers on workspace_items', async () => {
    const clientA = harness.createClient({ role: 'authenticated', userId: BROKER_A });
    const clientB = harness.createClient({ role: 'authenticated', userId: BROKER_B });
    const clientAnon = harness.createClient({ role: 'anon' });

    // WP-7.3C P1-3 (intentional hardening): workspace_items writes are service-role
    // only (server publish gates). Seed rows through the service client.
    const { item: draftDc } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      legacyId: 'legacy-dc-rls-draft',
      kind: 'dealcard',
      status: 'draft',
      title: '서초구 비공개 초안',
      address: '서초권역',
      priceBand: '180~210억',
      draftPayload: { card4: { headline: '비공개 초안 제목', region: '서초권역', priceBand: '180~210억', points: ['p1'] } },
    });
    expect(draftDc?.id).toMatch(/^[0-9a-f-]{36}$/i);

    const { item: pubDc } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      legacyId: 'legacy-dc-rls-pub',
      kind: 'dealcard',
      status: 'published',
      title: '강남구 공개 매물',
      address: '강남 테헤란로 권역',
      priceBand: '200~230억',
      draftPayload: { card4: { headline: '강남 코어 빌딩', region: '강남권역', priceBand: '200~230억', points: ['지하철 2분'] } },
    });

    // Owner read stays isolated: Broker A reads own rows, Broker B reads none of them
    const aOwnRead = await clientA.from('workspace_items').select('id, status').eq('id', draftDc!.id);
    expect(aOwnRead.error).toBeNull();
    expect(aOwnRead.data).toHaveLength(1);
    const bDraftRead = await clientB.from('workspace_items').select('*').eq('id', draftDc!.id);
    expect(bDraftRead.error).toBeNull();
    expect(bDraftRead.data).toHaveLength(0);
    const bPubRead = await clientB
      .from('workspace_items')
      .select('id, address, draft_payload')
      .eq('id', pubDc!.id);
    expect(bPubRead.error).toBeNull();
    expect(bPubRead.data).toHaveLength(0);

    // Broker B cannot mutate Broker A's rows
    const bUpdate = await clientB.from('workspace_items').update({ title: '탈취 시도' }).eq('id', pubDc!.id).select('*');
    expect(bUpdate.error).not.toBeNull();
    expect(bUpdate.data ?? []).toHaveLength(0);

    // P1-3: the OWNER cannot bypass server publish gates with their own JWT —
    // direct status/published_snapshot UPDATE, INSERT and DELETE are all denied.
    const aDirectPublish = await clientA
      .from('workspace_items')
      .update({ status: 'sent', published_snapshot: { card4: { headline: '게이트 우회 115억' } } })
      .eq('id', draftDc!.id)
      .select('*');
    expect(aDirectPublish.error).not.toBeNull();
    const aDirectInsert = await clientA.from('workspace_items').insert({
      owner_id: BROKER_A,
      kind: 'dealcard',
      status: 'sent',
      title: '직접 발행 시도',
      published_snapshot: { card4: { headline: '직접 발행' } },
    });
    expect(aDirectInsert.error).not.toBeNull();
    const aDirectDelete = await clientA.from('workspace_items').delete().eq('id', draftDc!.id);
    expect(aDirectDelete.error).not.toBeNull();
    const draftAfter = await getWorkspaceItemByAnyId(h.serviceClient, draftDc!.id, 'dealcard');
    expect(draftAfter?.status).toBe('draft');
    expect(draftAfter?.publishedSnapshot).toBeNull();

    // P2: anon cannot enumerate any tenant's rows (public reads go through service-role server code)
    const anonEnumerate = await clientAnon.from('workspace_items').select('id, owner_id, building_id, published_snapshot');
    expect(anonEnumerate.error).not.toBeNull();
    const anonPub = await clientAnon.from('workspace_items').select('id, status').eq('id', pubDc!.id);
    expect(anonPub.error).not.toBeNull();
    const anonPrivateCols = await clientAnon
      .from('workspace_items')
      .select('address, draft_payload')
      .eq('id', pubDc!.id);
    expect(anonPrivateCols.error).not.toBeNull();

    // Public projection still served via the service-role path
    const pubProjection = await getPublicWorkspaceProjection(h.serviceClient, pubDc!.id, 'dealcard');
    expect(pubProjection.projection?.snapshot).toBeTruthy();

    // Anon cannot select kind='im' rows either
    const { item: pubIm } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      legacyId: 'legacy-im-rls-pub',
      kind: 'im',
      status: 'published',
      title: '강남 비공개 토큰전용 IM',
      address: '서울 강남구 역삼동 123',
      priceBand: '200~230억',
      draftPayload: { title: '강남 비공개 토큰전용 IM' },
      publishedSnapshot: { title: '강남 비공개 토큰전용 IM', kind: 'im' },
    });
    const anonImRead = await clientAnon
      .from('workspace_items')
      .select('id, published_snapshot')
      .eq('id', pubIm!.id);
    expect(anonImRead.error).not.toBeNull();

    // Repository cross-tenant rejection (403)
    await expect(
      upsertWorkspaceItem(h.serviceClient, {
        id: pubDc!.id,
        ownerId: BROKER_B,
        kind: 'dealcard',
        title: '타인 수정 시도',
        draftPayload: {},
      })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<WorkspaceRepositoryError>);

    // Legacy ID lookup + Soft delete + Restore
    const byLegacy = await getWorkspaceItemByAnyId(h.serviceClient, 'legacy-dc-rls-pub', 'dealcard');
    expect(byLegacy?.id).toBe(pubDc!.id);
    await softDeleteWorkspaceItem(h.serviceClient, { id: pubDc!.id, userId: BROKER_A, kind: 'dealcard' });
    const afterDelete = await getPublicWorkspaceProjection(h.serviceClient, pubDc!.id, 'dealcard');
    expect(afterDelete.deleted).toBe(true);
    expect(afterDelete.projection).toBeNull();

    await restoreWorkspaceItem(h.serviceClient, { id: pubDc!.id, userId: BROKER_A, kind: 'dealcard' });
    const afterRestore = await getWorkspaceItemByAnyId(h.serviceClient, pubDc!.id, 'dealcard');
    expect(afterRestore?.deletedAt).toBeNull();
  });

  it('blocks drafts/revoked/untokened full IM and ignores in-memory store when DISABLE_MEMORY_STORE=1', async () => {
    expect(allowDealPublicMemoryFallback()).toBe(false);

    // Temporarily seed in-memory record, then flip DISABLE_MEMORY_STORE=1 and verify SQL guard ignores it
    delete process.env.DISABLE_MEMORY_STORE;
    saveQuickImRecord({
      buildingId: 'mem-only-ignored-id',
      documentId: 'mem-only-doc',
      ownerId: BROKER_A,
      buildingName: '메모리 전용 누출 테스트',
      address: '강남구 역삼동 999',
      askingPriceManwon: 1_100_000,
      posture: 'income',
      card4: {
        region: '강남',
        use: '오피스',
        priceBand: '100~120억',
        headline: '메모리 누출',
        points: ['a', 'b', 'c'],
        provenance: { points: ['broker', 'broker', 'broker'] },
        area: '1,000㎡',
        posture: 'income',
        card4_version: 1,
        card4_hash: 'h1',
      },
      rentRoll: [],
      fullDocBody: { sections: [{ title: '개요', content: '메모리 본문' }] },
      basicImDoc: { sections: [{ title: '개요', content: '메모리 본문' }] } as unknown as Parameters<typeof saveQuickImRecord>[0]['basicImDoc'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    process.env.DISABLE_MEMORY_STORE = '1';
    expect(allowDealPublicMemoryFallback()).toBe(false);
    saveInboxState({ revokedBuildings: {}, correctionNotices: {}, gateDecisions: {}, callNotes: {}, customClients: [] });

    const memBlockedApi = await getPublicImLite(
      new NextRequest('http://localhost:3000/api/public/im-lite/mem-only-ignored-id'),
      { params: Promise.resolve({ buildingId: 'mem-only-ignored-id' }) }
    );
    expect(memBlockedApi.status).toBe(404);

    // Create draft and published IM in PGlite workspace_items
    const { item: draftIm } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      kind: 'im',
      status: 'draft',
      title: '초안 IM 빌딩',
      address: '영등포구 여의도동 권역',
      draftPayload: { sections: [{ sectionId: '01', title: '개요', content: '비공개 초안', locked: false, dataSource: 'SSoT', aiRole: 'auto', icon: '🏢' }] },
    });
    const draftRes = await getPublicImLite(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${draftIm!.id}`),
      { params: Promise.resolve({ buildingId: draftIm!.id }) }
    );
    expect(draftRes.status).toBe(404);

    const { item: pubIm } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      kind: 'im',
      status: 'published',
      title: '여의도 코어 오피스 IM',
      address: '여의도 권역',
      priceBand: '300~330억',
      draftPayload: {
        buildingId: undefined,
        blindName: '여의도 코어 오피스 IM',
        fullName: '여의도 코어 오피스 IM',
        areaSignal: '여의도 권역',
        assetType: '오피스',
        priceBand: '300~330억',
        sizeSignal: '연면적 2,000평',
        completenessScore: 95,
        broker: { userId: BROKER_A, displayName: '김갑수', company: '크리딜중개', phone: '02-555-0199', tagline: '', photoUrl: '', slug: 'a', vibeTemplateId: 'default' },
        sections: [{ sectionId: '01', title: '물건 개요', icon: '🏢', content: '공식 스냅샷', dataSource: 'SSoT', aiRole: 'auto', locked: false }],
        generatedAt: new Date().toISOString(),
        disclaimer: '참고용',
        fullImUpgradeCta: { enabled: true, label: '요청', description: '안내' },
        protectedFieldsRemoved: [],
      },
    });

    // Without token -> 403 SHARE_TOKEN_REQUIRED
    const untokened = await getPublicImLite(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubIm!.id}`),
      { params: Promise.resolve({ buildingId: pubIm!.id }) }
    );
    expect(untokened.status).toBe(403);
    const untokenedJson = await untokened.json();
    expect(untokenedJson.code).toBe('SHARE_TOKEN_REQUIRED');

    // Issue token -> 200 OK
    const issued = await issueShareLinkToken({ buildingId: pubIm!.id, brokerId: BROKER_A });
    const withToken = await getPublicImLite(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubIm!.id}?token=${encodeURIComponent(issued.token)}`),
      { params: Promise.resolve({ buildingId: pubIm!.id }) }
    );
    expect(withToken.status).toBe(200);
    const withTokenJson = await withToken.json();
    expect(withTokenJson.data.fullName).toBe('여의도 코어 오피스 IM');

    // Revoke token -> 403
    await revokeShareLinkToken({ token: issued.token, buildingId: pubIm!.id, brokerId: BROKER_A, reason: 'closed' });
    const afterRevoke = await getPublicImLite(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubIm!.id}?token=${encodeURIComponent(issued.token)}`),
      { params: Promise.resolve({ buildingId: pubIm!.id }) }
    );
    expect(afterRevoke.status).toBe(403);

    // Production demo seed check
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_SEEDS_IN_PROD;
    const prodGuard = await resolvePublicDealWorkspaceGuard({ id: 'bld-01', supabase: h.serviceClient });
    expect(prodGuard.blocked).toBe(true);
    expect(prodGuard.reason).toBe('demo_disabled_prod');
  });

  it('paginates >1,000 CRM clients via SQL .range() and isolates other broker activity_events', async () => {
    const svc = h.serviceClient!;
    const clientRowsA = Array.from({ length: 1050 }, (_, idx) => ({
      broker_id: BROKER_A,
      display_name: `고객A-${String(idx).padStart(4, '0')}`,
      email: `clienta_${idx}@example.com`,
      phone: `010-1000-${String(idx).padStart(4, '0')}`,
      client_type: 'buyer',
    }));
    for (let i = 0; i < clientRowsA.length; i += 250) {
      const { error } = await svc.from('broker_clients').insert(clientRowsA.slice(i, i + 250));
      expect(error).toBeNull();
    }

    const clientRowsB = Array.from({ length: 30 }, (_, idx) => ({
      broker_id: BROKER_B,
      display_name: `타사고객B-${idx}`,
      email: `clientb_${idx}@example.com`,
      phone: `010-2000-${String(idx).padStart(4, '0')}`,
      client_type: 'buyer',
    }));
    await svc.from('broker_clients').insert(clientRowsB);

    const eventsB = Array.from({ length: 120 }, (_, idx) => ({
      actor_id: BROKER_B,
      event_type: 'dealcard_upserted',
      entity_type: 'deal_card',
      metadata: { building_id: `broker-b-bld-${idx}`, card4: { headline: `타인매물-${idx}` } },
    }));
    await svc.from('activity_events').insert(eventsB);

    // Fetch 3 pages (500 + 500 + 50 = 1050) for Broker A
    const collectedIds = new Set<string>();
    const p1 = await (await handleGetInbox(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=0&clientPageSize=500'))).json();
    const p2 = await (await handleGetInbox(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=500&clientPageSize=500'))).json();
    const p3 = await (await handleGetInbox(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=1000&clientPageSize=500'))).json();

    expect(p1.ok).toBe(true);
    expect(p1.pagination.totalClients).toBe(1050);
    expect(p1.pagination.hasMoreClients).toBe(true);
    expect(p3.pagination.hasMoreClients).toBe(false);

    for (const c of [...p1.clients, ...p2.clients, ...p3.clients]) {
      expect(c.broker_id).toBe(BROKER_A);
      collectedIds.add(c.id);
    }
    expect(collectedIds.size).toBe(1050);

    // Verify Broker B's 120 activity_events do NOT leak into Broker A's threads or items
    const allThreadTitles = (p1.threads || []).map((t: { title?: string; clientName?: string }) =>
      String(t.title || t.clientName || '')
    );
    expect(allThreadTitles.some((s: string) => s.includes('타사고객B') || s.includes('타인매물'))).toBe(false);
  }, 45_000);

  it('sanitizes DealCard published_snapshot from private memoText/personas, guards non-demo legacy_id, supports 2026-11+ track_event partitions, and atomically consumes Pro download quota via RPC', async () => {
    const clientAnon = harness.createClient({ role: 'anon' });

    const { item: sanitizedDc } = await upsertWorkspaceItem(h.serviceClient, {
      ownerId: BROKER_A,
      legacyId: 'bld-unique-non-demo-72',
      kind: 'dealcard',
      status: 'sent',
      title: '서초동 123-4 비공개메모 포함 매물',
      address: '서초구 서초동 123-4',
      priceBand: '180~200억',
      draftPayload: {
        memoText: '소유주 김OO 010-9999-8888 서초동 123-4 급매 190억',
        pairedMemoId: 'memo-secret-1',
        personas: [{ id: 'p1', label: '사옥 법인' }],
        card4: {
          headline: '서초권역 코너 오피스',
          region: '서초구 서초동 일대',
          priceBand: '180~200억',
          points: ['강남역 도보 5분'],
        },
      },
    });
    expect(sanitizedDc?.publishedSnapshot?.memoText).toBeUndefined();
    expect(sanitizedDc?.publishedSnapshot?.personas).toBeUndefined();
    expect(
      (sanitizedDc?.publishedSnapshot?.card4 as Record<string, unknown> | undefined)?.headline
    ).toBe('서초권역 코너 오피스');

    // WP-7.3C P2 (intentional hardening): anon has no direct table access anymore;
    // the sanitized snapshot is verified through the service-role public projection.
    const anonRead = await clientAnon
      .from('workspace_items')
      .select('id, published_snapshot')
      .eq('id', sanitizedDc!.id);
    expect(anonRead.error).not.toBeNull();
    const publicProjection = await getPublicWorkspaceProjection(h.serviceClient, sanitizedDc!.id, 'dealcard');
    const anonSnap = publicProjection.projection?.snapshot as Record<string, unknown>;
    expect(anonSnap).toBeTruthy();
    expect(anonSnap.memoText).toBeUndefined();
    expect(anonSnap.pairedMemoId).toBeUndefined();
    expect(anonSnap.personas).toBeUndefined();

    // Cross-tenant non-demo legacy_id claim is rejected (403)
    await expect(
      upsertWorkspaceItem(h.serviceClient, {
        ownerId: BROKER_B,
        legacyId: 'bld-unique-non-demo-72',
        kind: 'dealcard',
        status: 'sent',
        title: '탈취 시도',
        draftPayload: { card4: { headline: '탈취' } },
      })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<WorkspaceRepositoryError>);

    // track_event partitions handle 2026-11+ and 2027 dates without partition errors
    const { error: novErr } = await h.serviceClient!.from('track_event').insert({
      tenant_id: BROKER_A,
      deal_id: sanitizedDc!.id,
      kind: 'intent.detail_request',
      occurred_at: '2026-11-18T12:00:00.000Z',
    });
    expect(novErr).toBeNull();
    const { error: futureErr } = await h.serviceClient!.from('track_event').insert({
      tenant_id: BROKER_A,
      deal_id: sanitizedDc!.id,
      kind: 'intent.detail_request',
      occurred_at: '2027-06-15T00:00:00.000Z',
    });
    expect(futureErr).toBeNull();

    // Atomic consume_im_pro_grant_download RPC enforces max_downloads strictly
    const grantId = '77777777-7777-4777-8777-777777777701';
    await h.serviceClient!.from('im_pro_grants').insert({
      id: grantId,
      requester_name: '김매수',
      requester_phone: '010-1111-2222',
      status: 'active',
      max_downloads: 2,
      download_count: 0,
    });
    const r1 = await h.serviceClient!.rpc('consume_im_pro_grant_download', { p_grant_id: grantId, p_default_max: 5 });
    expect(r1.error).toBeNull();
    expect(r1.data).toHaveLength(1);
    expect(r1.data[0].download_count).toBe(1);

    const r2 = await h.serviceClient!.rpc('consume_im_pro_grant_download', { p_grant_id: grantId, p_default_max: 5 });
    expect(r2.error).toBeNull();
    expect(r2.data).toHaveLength(1);
    expect(r2.data[0].download_count).toBe(2);

    const r3 = await h.serviceClient!.rpc('consume_im_pro_grant_download', { p_grant_id: grantId, p_default_max: 5 });
    expect(r3.error).toBeNull();
    expect(r3.data).toHaveLength(0);

    // Non-UUID legacy ownership check on real Postgres UUID entity_id must never throw 22P02
    const nonUuidBld = 'bld-pglite-legacy-probe';
    await expect(
      assertLegacyOrDbOwnership(h.serviceClient, {
        id: nonUuidBld,
        userId: BROKER_A,
        requireExisting: false,
      })
    ).resolves.toEqual({ existingItem: null, ownerId: null });

    await h.serviceClient!.from('activity_events').insert({
      actor_id: BROKER_A,
      event_type: 'dealcard_upserted',
      entity_type: 'building',
      entity_id: null,
      metadata: { building_id: nonUuidBld },
    });

    await expect(
      assertLegacyOrDbOwnership(h.serviceClient, {
        id: nonUuidBld,
        userId: BROKER_A,
        requireExisting: false,
      })
    ).resolves.toEqual({ existingItem: null, ownerId: BROKER_A });

    await expect(
      assertLegacyOrDbOwnership(h.serviceClient, {
        id: nonUuidBld,
        userId: BROKER_B,
        requireExisting: false,
      })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<WorkspaceRepositoryError>);
  }, 30_000);
});
