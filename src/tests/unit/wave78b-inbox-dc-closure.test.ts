/**
 * Wave 7.8 — WP-7.8B Inbox CRM, DealCard & Shared Workspace Closure Suite
 *
 * Exercises real PostgreSQL + RLS via @electric-sql/pglite and route/action handlers:
 *  1. [Inbox P0-1] `public.im_share_links` column drift reconciliation (`series_id` nullable,
 *     `recipient_id` text `"cli-123"`) + `42501` `anon`/`authenticated` direct write denial on
 *     `public.im_share_links` and `public.contact_history`
 *  2. [Inbox P0-2] `verifyShareLinkToken` rejecting unsigned/tampered `slk.*` tokens even when
 *     an active `im_share_links` row exists, legacy token owner verification, and
 *     `revokeShareLinkToken` allowing canonical building owners to revoke any link on their building
 *  3. [DC P0-1] `restore_link` / `updateWorkspaceItemState` keeping unpublished `'draft'` DealCards
 *     private (`status = 'draft'`, `published_snapshot = null`) and enforcing `assertPublishable`
 *     on previously published items
 *  4. [DC P1-1..P2-2 & IM P0-3a] `evaluateDealCardPublishContent` (`region`/`use`/`area` blind guard
 *     + empty card `422`), `hasUnpublishedEdits` + `updatedAtIso` hydration, `expectedVersion` `409`,
 *     `restore_im` unarchive, clearable `correctionNotice`, and `personas` `ownerId` demo-seed scoping
 *  5. [IM P0-4 & NL P0-3b] `retention-purge` preserving `im_restored`/`dealcard_restored`/
 *     `correction_notice_published`/`correction_notice_cleared` and persisting SHA-256 hashes in
 *     `public.email_suppressions` before `magazine_purge_unsubscribed(30)`
 *  6. [Inbox P1-1, P1-2, P2-4] Statutory gate (`422 STATUTORY_DISCLOSURE_INCOMPLETE`) on
 *     `prepare_copy_bundle`/`approve_gate`/`send_im`/`send_dealcard`, phone-less same-name CRM
 *     client thread preservation, and zero `display_name` PII in `broker_client_created` metadata
 */
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, role: h.authUser.role || 'broker', error: null }
      : {
          user: null,
          role: null,
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
  issueShareLinkToken,
  revokeShareLinkToken,
  verifyShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from '@/lib/security/share-link-tokens';
import {
  resetWorkspaceRepositoryCacheForTests,
  updateWorkspaceItemState,
} from '@/lib/workspace/workspace-repository';
import { resetInboxSchemaCapsForTests } from '@/lib/inbox/inbox-schema-caps';
import { saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { evaluateDealCardPublishContent } from '@/lib/deal-card/publish-content-gate';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import { appendCrmAndSubscriberThreads } from '@/lib/inbox/inbox-client-threads';
import {
  GET as summaryGET,
  PATCH as summaryPATCH,
} from '@/app/api/broker/workspace/summary/route';
import {
  GET as personasGET,
  POST as personasPOST,
} from '@/app/api/broker/deal-card/[id]/personas/route';
import { DELETE as personaItemDELETE } from '@/app/api/broker/deal-card/[id]/personas/[personaId]/route';
import {
  POST as retentionPurgePOST,
  PERMANENT_COMPLIANCE_EVENT_TYPES,
} from '@/app/api/cron/retention-purge/route';
import { POST as inboxActionsPOST } from '@/app/api/broker/inbox/actions/route';
import { POST as clientsPOST } from '@/app/api/broker/clients/route';

const BROKER_A = 'aaaa7800-0000-4000-8000-000000000001';
const BROKER_B = 'bbbb7800-0000-4000-8000-000000000002';
const BROKER_INCOMPLETE = 'cccc7800-0000-4000-8000-000000000003';
const BLD_A_UUID = '11117800-0000-4000-8000-000000000011';
const BLD_DRAFT_UUID = '22227800-0000-4000-8000-000000000022';
const BLD_INCOMPLETE_UUID = '33337800-0000-4000-8000-000000000033';
const GATE_REQ_INCOMPLETE = '44447800-0000-4000-8000-000000000044';
const CLIENT_A_UUID = '55557800-0000-4000-8000-000000000055';
const DOC_ARCHIVED_UUID = '66667800-0000-4000-8000-000000000066';

describe('Wave 7.8 — WP-7.8B Inbox CRM, DealCard & Shared Workspace Closure', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  async function execSql<TRow = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<TRow[]> {
    const res = await harness.db.query<TRow>(sql, params);
    return res.rows;
  }

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create({
      extraMigrations: [
        `
        CREATE OR REPLACE FUNCTION public.magazine_purge_unsubscribed(p_days int DEFAULT 30)
        RETURNS int
        LANGUAGE plpgsql
        AS $$
        DECLARE
          v_cnt int;
        BEGIN
          UPDATE public.magazine_subscribers
             SET subscriber_email = NULL,
                 subscriber_phone = NULL,
                 subscriber_name = NULL
           WHERE (status = 'unsubscribed' OR unsubscribed_at IS NOT NULL)
             AND unsubscribed_at < now() - make_interval(days => p_days)
             AND subscriber_email IS NOT NULL;
          GET DIAGNOSTICS v_cnt = ROW_COUNT;
          RETURN v_cnt;
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.magazine_purge_old_events(p_days int DEFAULT 365)
        RETURNS int
        LANGUAGE sql
        AS $$
          SELECT 0;
        $$;
        `,
      ],
    });
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_A,
      email: 'broker78a@credeal.test',
      displayName: '김갑중개',
      company: '갑중개법인',
      phone: '02-555-7801',
      slug: 'broker-78a',
      registrationNo: '11680-2026-07801',
      officeAddress: '서울특별시 강남구 테헤란로 781',
    });

    await harness.seedUser({
      id: BROKER_B,
      email: 'broker78b@credeal.test',
      displayName: '이을중개',
      company: '을중개법인',
      phone: '02-555-7802',
      slug: 'broker-78b',
      registrationNo: '11680-2026-07802',
      officeAddress: '서울특별시 서초구 서초대로 782',
    });

    await harness.seedUser({
      id: BROKER_INCOMPLETE,
      email: 'incomplete78@credeal.test',
      displayName: '미완성중개',
      company: '미완성중개사무소',
      phone: '02-555-7803',
      slug: 'broker-78inc',
      registrationNo: '11680-2026-07803',
      officeAddress: '서울특별시 마포구 양화로 783',
    });
    await execSql(
      `UPDATE public.broker_profiles SET office_reg_number = NULL WHERE user_id = $1`,
      [BROKER_INCOMPLETE]
    );

    await execSql(
      `INSERT INTO public.building_ssot_lite (id, owner_id, area_signal, asset_type, price_band, status)
       VALUES ($1, $2, '강남구 역삼동', '업무시설', '180~210억', 'published'),
              ($3, $4, '서초구 반포동', '근린생활시설', '90~110억', 'draft'),
              ($5, $6, '마포구 서교동', '근린생활시설', '70~80억', 'published')`,
      [
        BLD_A_UUID,
        BROKER_A,
        BLD_DRAFT_UUID,
        BROKER_A,
        BLD_INCOMPLETE_UUID,
        BROKER_INCOMPLETE,
      ]
    );

    await h.serviceClient.from('broker_clients').insert({
      id: CLIENT_A_UUID,
      broker_id: BROKER_A,
      client_type: 'buyer',
      display_name: '박고객 대표',
      phone: '010-1111-2222',
      tier: 'vip',
    });
  }, 45_000);

  afterAll(async () => {
    await harness?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
    process.env.SHARE_LINK_SECRET = 'wave78b-share-link-secret-32-chars-minimum!';
    process.env.UNSUBSCRIBE_SECRET = 'wave78b-unsubscribe-secret-32-chars-minimum!';
    process.env.CRON_SECRET = 'wave78b-cron-secret-token-32-chars!!';
    resetWorkspaceRepositoryCacheForTests();
    resetInboxSchemaCapsForTests();
    resetShareLinkTokenStoreForTests();
    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });
    h.authUser = { id: BROKER_A, email: 'broker78a@credeal.test', role: 'broker' };
    h.viewer = null;
  });

  it('[Inbox P0-1] reconciles im_share_links schema drift (nullable series_id, text recipient_id) and denies anon/authenticated writes with 42501 on im_share_links & contact_history', async () => {
    const rlsRows = await execSql<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('im_share_links', 'contact_history')
        ORDER BY c.relname`
    );
    expect(rlsRows).toEqual([
      { relname: 'contact_history', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'im_share_links', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const colMeta = await execSql<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'im_share_links'
          AND column_name IN ('series_id', 'recipient_id')
        ORDER BY column_name`
    );
    expect(colMeta).toEqual([
      { column_name: 'recipient_id', is_nullable: 'YES', data_type: 'text' },
      { column_name: 'series_id', is_nullable: 'YES', data_type: 'uuid' },
    ]);

    // service_role can insert non-UUID recipient_id = "cli-123" with series_id omitted (NULL)
    const svcLinkIns = await h.serviceClient!.from('im_share_links').insert({
      token: 'opaque-svc-token-01',
      building_id: BLD_A_UUID,
      broker_id: BROKER_A,
      recipient_id: 'cli-123',
      status: 'active',
    });
    expect(svcLinkIns.error).toBeNull();

    const svcContactIns = await h.serviceClient!.from('contact_history').insert({
      broker_id: BROKER_A,
      client_id: CLIENT_A_UUID,
      contact_type: 'phone',
      summary: '초기 통화 완료',
    });
    expect(svcContactIns.error).toBeNull();

    const anonClient = harness.createClient({ role: 'anon' });
    const brokerAClient = harness.createClient({ role: 'authenticated', userId: BROKER_A });
    const brokerBClient = harness.createClient({ role: 'authenticated', userId: BROKER_B });

    // anon & authenticated writes on im_share_links -> 42501
    const anonLinkIns = await anonClient.from('im_share_links').insert({
      token: 'forged-anon-tok',
      building_id: BLD_A_UUID,
      status: 'active',
    });
    expect(anonLinkIns.error?.code).toBe('42501');

    const authLinkIns = await brokerAClient.from('im_share_links').insert({
      token: 'forged-auth-tok',
      building_id: BLD_A_UUID,
      broker_id: BROKER_A,
      status: 'active',
    });
    expect(authLinkIns.error?.code).toBe('42501');

    const authLinkUpd = await brokerAClient
      .from('im_share_links')
      .update({ status: 'revoked' })
      .eq('token', 'opaque-svc-token-01');
    expect(authLinkUpd.error?.code).toBe('42501');

    const authLinkDel = await brokerAClient
      .from('im_share_links')
      .delete()
      .eq('token', 'opaque-svc-token-01');
    expect(authLinkDel.error?.code).toBe('42501');

    // anon & authenticated writes on contact_history -> 42501
    const anonHistIns = await anonClient.from('contact_history').insert({
      broker_id: BROKER_A,
      client_id: CLIENT_A_UUID,
      contact_type: 'note',
      summary: 'anon spoof',
    });
    expect(anonHistIns.error?.code).toBe('42501');

    const authHistIns = await brokerAClient.from('contact_history').insert({
      broker_id: BROKER_A,
      client_id: CLIENT_A_UUID,
      contact_type: 'note',
      summary: 'direct jwt bypass',
    });
    expect(authHistIns.error?.code).toBe('42501');

    const authHistUpd = await brokerAClient
      .from('contact_history')
      .update({ summary: 'tampered' })
      .eq('broker_id', BROKER_A);
    expect(authHistUpd.error?.code).toBe('42501');

    // Owner-scoped SELECT works for BROKER_A and returns empty for BROKER_B
    const ownLinks = await brokerAClient.from('im_share_links').select('token, recipient_id');
    expect(ownLinks.error).toBeNull();
    expect(ownLinks.data).toEqual(
      expect.arrayContaining([{ token: 'opaque-svc-token-01', recipient_id: 'cli-123' }])
    );
    const rivalLinks = await brokerBClient.from('im_share_links').select('token');
    expect(rivalLinks.data).toEqual([]);

    const ownHist = await brokerAClient.from('contact_history').select('summary');
    expect(ownHist.error).toBeNull();
    expect(ownHist.data).toEqual(expect.arrayContaining([{ summary: '초기 통화 완료' }]));
    const rivalHist = await brokerBClient.from('contact_history').select('summary');
    expect(rivalHist.data).toEqual([]);
  });

  it('[Inbox P0-2] rejects unsigned/tampered slk.* tokens even when im_share_links row exists and allows canonical building owner to revoke any link on their building', async () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({
        b: BLD_A_UUID,
        u: BROKER_A,
        r: 'cli-123',
        exp: Date.now() + 86_400_000,
        n: 'deadbeef1234',
      }),
      'utf8'
    ).toString('base64url');
    const badSlkToken = `slk.${forgedPayload}.forged_invalid_hmac_signature`;

    await h.serviceClient!.from('im_share_links').insert({
      token: badSlkToken,
      building_id: BLD_A_UUID,
      broker_id: BROKER_A,
      recipient_id: 'cli-123',
      status: 'active',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const badVerify = await verifyShareLinkToken({
      token: badSlkToken,
      buildingId: BLD_A_UUID,
    });
    expect(badVerify.valid).toBe(false);
    expect(badVerify.reason).toBe('invalid');

    // Legacy non-slk token with mismatched broker_id (BROKER_B on BROKER_A's building) -> rejected
    await h.serviceClient!.from('im_share_links').insert({
      token: 'legacy-spoofed-broker-tok',
      building_id: BLD_A_UUID,
      broker_id: BROKER_B,
      recipient_id: 'cli-999',
      status: 'active',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const spoofedLegacy = await verifyShareLinkToken({
      token: 'legacy-spoofed-broker-tok',
      buildingId: BLD_A_UUID,
    });
    expect(spoofedLegacy.valid).toBe(false);

    // Valid signed slk.* token succeeds
    const validIssued = await issueShareLinkToken({
      buildingId: BLD_A_UUID,
      brokerId: BROKER_A,
      recipientId: 'cli-123',
      kind: 'dealcard',
    });
    const okVerify = await verifyShareLinkToken({
      token: validIssued.token,
      buildingId: BLD_A_UUID,
    });
    expect(okVerify.valid).toBe(true);
    expect(okVerify.recipientId).toBe('cli-123');

    // Canonical owner BROKER_A can revoke a link on BLD_A_UUID even if im_share_links.broker_id = BROKER_B
    const mismatchedLinkTok = 'legacy-mismatched-owner-revoke';
    await h.serviceClient!.from('im_share_links').insert({
      token: mismatchedLinkTok,
      building_id: BLD_A_UUID,
      broker_id: BROKER_B,
      status: 'active',
    });

    const rivalAttempt = await revokeShareLinkToken({
      token: mismatchedLinkTok,
      buildingId: BLD_A_UUID,
      brokerId: BROKER_B,
      scope: 'thread',
    });
    expect(rivalAttempt.ok).toBe(false);
    expect(rivalAttempt.status).toBe(403);

    const ownerRevoke = await revokeShareLinkToken({
      token: mismatchedLinkTok,
      buildingId: BLD_A_UUID,
      brokerId: BROKER_A,
      scope: 'thread',
      reason: '소유 개업공인중개사 직접 잠금',
    });
    expect(ownerRevoke.ok).toBe(true);
    expect(ownerRevoke.revoked).toBe(true);
  });

  it('[DC P0-1] prevents restore_link / updateWorkspaceItemState from promoting unpublished draft DealCards and gates statutory removal on restore_link', async () => {
    await h.serviceClient!.from('workspace_items').insert([
      {
        id: BLD_DRAFT_UUID,
        owner_id: BROKER_A,
        building_id: BLD_DRAFT_UUID,
        kind: 'dealcard',
        status: 'draft',
        title: '반포동 미발행 초안 딜카드',
        address: '서초구 반포동',
        price_band: '90~110억',
        draft_payload: {
          card4: {
            headline: '내부 검토용 초안',
            region: '서초구 반포동',
            use: '근린생활시설',
            priceBand: '90~110억',
            points: ['반포역 도보 3분', '코너 입지', '검토 중'],
          },
          memoText: '비공개 내부 메모: 소유주 급매 협의 중',
        },
        published_snapshot: null,
      },
      {
        owner_id: BROKER_A,
        building_id: BLD_DRAFT_UUID,
        kind: 'im',
        status: 'revoked',
        title: '반포동 기발행 IM',
        address: '서초구 반포동',
        price_band: '90~110억',
        draft_payload: { buildingId: BLD_DRAFT_UUID, title: '반포동 기발행 IM' },
        published_snapshot: { buildingId: BLD_DRAFT_UUID, title: '반포동 기발행 IM' },
        published_at: new Date().toISOString(),
        revoked_at: new Date().toISOString(),
      },
    ]);

    await updateWorkspaceItemState(h.serviceClient, {
      id: BLD_DRAFT_UUID,
      userId: BROKER_A,
      status: 'published',
    });

    const { data: dcRowAfterRestore } = await h.serviceClient!
      .from('workspace_items')
      .select('status, published_snapshot')
      .eq('id', BLD_DRAFT_UUID)
      .single();
    expect(dcRowAfterRestore?.status).toBe('draft');
    expect(dcRowAfterRestore?.published_snapshot).toBeNull();

    // Statutory gate on restore_link when restoring a previously-published item whose broker lost statutory fields
    await h.serviceClient!.from('workspace_items').insert({
      id: BLD_INCOMPLETE_UUID,
      owner_id: BROKER_INCOMPLETE,
      building_id: BLD_INCOMPLETE_UUID,
      kind: 'dealcard',
      status: 'revoked',
      title: '서교동 기발행 딜카드',
      address: '마포구 서교동',
      price_band: '70~80억',
      draft_payload: { card4: { headline: '합정역 코너 근생' } },
      published_snapshot: { card4: { headline: '합정역 코너 근생' } },
      published_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
    });

    h.authUser = { id: BROKER_INCOMPLETE, email: 'incomplete78@credeal.test', role: 'broker' };
    const blockedRestoreRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'restore_link',
          buildingId: BLD_INCOMPLETE_UUID,
        }),
      })
    );
    expect(blockedRestoreRes.status).toBe(422);
    const blockedJson = await blockedRestoreRes.json();
    expect(blockedJson.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
  });

  it('[DC P1-1..P2-2 & IM P0-3a] enforces content gate on region/use/area & empty cards, hydrates hasUnpublishedEdits + updatedAtIso, enforces expectedVersion 409, unarchives restore_im, clears correctionNotice, and scopes personas demo seeds by ownerId', async () => {
    // 1. DC P1-1: empty card & road address / parcel leaks in region/area/use
    expect(evaluateDealCardPublishContent(null)).toMatchObject({
      ok: false,
      status: 422,
      code: 'DEALCARD_EMPTY_CONTENT',
    });
    expect(
      evaluateDealCardPublishContent({
        headline: '   ',
        region: '강남구 역삼동',
        use: '업무시설',
        priceBand: '180~210억',
        points: ['', '  ', ''],
      })
    ).toMatchObject({
      ok: false,
      status: 422,
      code: 'DEALCARD_EMPTY_CONTENT',
    });
    expect(
      evaluateDealCardPublishContent({
        headline: '역삼역 오피스 투자 매물',
        region: '강남구 테헤란로 152',
        use: '업무시설',
        priceBand: '180~210억',
        points: ['역삼역 도보 2분', '전층 우량 임차인', '안정적 임대수익'],
      })
    ).toMatchObject({
      ok: false,
      status: 422,
      code: 'BLIND_GUARD_VIOLATION',
    });
    expect(
      evaluateDealCardPublishContent({
        headline: '역삼역 오피스 투자 매물',
        region: '강남구 역삼동',
        use: '업무시설',
        area: '역삼동 823-12번지 연면적 420평',
        priceBand: '180~210억',
        points: ['역삼역 도보 2분', '전층 우량 임차인', '안정적 임대수익'],
      })
    ).toMatchObject({
      ok: false,
      status: 422,
      code: 'BLIND_GUARD_VIOLATION',
    });
    expect(
      evaluateDealCardPublishContent({
        headline: '역삼역 오피스 투자 매물',
        region: '강남구 역삼동',
        use: '업무시설',
        area: '연면적 420평',
        priceBand: '180~210억',
        points: ['역삼역 도보 2분', '전층 우량 임차인', '안정적 임대수익'],
      })
    ).toEqual({ ok: true });

    // 2. DC P1-2 + DC P1-3: publish -> draft edit -> hasUnpublishedEdits + updatedAtIso + expectedVersion 409
    const dcStandaloneId = 'bld-wave78b-dirty-sync';
    const pubRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          buildingId: dcStandaloneId,
          status: 'sent',
          expectedVersion: 0,
          card4: {
            headline: '역삼역 코너 수익형 빌딩',
            posture: 'income',
            region: '강남구 역삼동',
            use: '근린생활시설',
            area: '연면적 380평',
            priceBand: '140~160억',
            points: ['역삼역 도보 3분 코너', '우량 법인 전층 임차', '연 4%대 안정 수익'],
            card4_version: 1,
          },
        }),
      })
    );
    expect(pubRes.status).toBe(200);
    const pubJson = await pubRes.json();
    expect(typeof pubJson.version).toBe('number');

    // Draft autosave with matching expectedVersion succeeds and marks hasUnpublishedEdits = true
    const draftEditRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          buildingId: dcStandaloneId,
          expectedVersion: pubJson.version,
          card4: {
            headline: '역삼역 코너 리모델링 완료',
            posture: 'income',
            region: '강남구 역삼동',
            use: '근린생활시설',
            area: '연면적 380평',
            priceBand: '140~160억',
            points: ['역삼역 도보 3분 코너', '최근 외관 리모델링', '연 4%대 안정 수익'],
            card4_version: pubJson.version,
          },
        }),
      })
    );
    expect(draftEditRes.status).toBe(200);
    const draftEditJson = await draftEditRes.json();
    expect(draftEditJson.version).toBeGreaterThan(pubJson.version);

    // Stale expectedVersion (without strictVersionCheck=true) -> 409 VERSION_CONFLICT with currentVersion
    const conflictRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          buildingId: dcStandaloneId,
          expectedVersion: pubJson.version,
          card4: {
            headline: '구버전 덮어쓰기 시도',
            posture: 'income',
            region: '강남구 역삼동',
            use: '근린생활시설',
            priceBand: '140~160억',
            points: ['역삼역 도보 3분 코너', '우량 법인 전층 임차', '연 4%대 안정 수익'],
          },
        }),
      })
    );
    expect(conflictRes.status).toBe(409);
    const conflictJson = await conflictRes.json();
    expect(conflictJson.code).toBe('VERSION_CONFLICT');
    expect(conflictJson.currentVersion).toBe(draftEditJson.version);

    // Summary hydration includes hasUnpublishedEdits: true and ISO updatedAtIso
    const sumRes = await summaryGET(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary')
    );
    expect(sumRes.status).toBe(200);
    const sumJson = await sumRes.json();
    const hydratedDc = (sumJson.dealcards as Array<Record<string, unknown>>).find(
      (d) => d.id === dcStandaloneId
    );
    expect(hydratedDc?.status).toBe('sent');
    expect(hydratedDc?.hasUnpublishedEdits).toBe(true);
    expect(Number.isFinite(Date.parse(String(hydratedDc?.updatedAtIso || '')))).toBe(true);

    // 3. IM P1-5: update_correction_notice publish + clear, and restore_im unarchives document_objects
    const setNoticeRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update_correction_notice',
          buildingId: dcStandaloneId,
          message: '임대료 표기 기준일이 2026년 11월로 정정되었습니다.',
        }),
      })
    );
    expect(setNoticeRes.status).toBe(200);

    const clearNoticeRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update_correction_notice',
          buildingId: dcStandaloneId,
          message: '',
        }),
      })
    );
    expect(clearNoticeRes.status).toBe(200);
    const clearNoticeJson = await clearNoticeRes.json();
    expect(clearNoticeJson.correctionNotice).toBeNull();

    const { data: corrEvents } = await h.serviceClient!
      .from('activity_events')
      .select('event_type')
      .in('event_type', ['correction_notice_published', 'correction_notice_cleared']);
    expect((corrEvents || []).map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['correction_notice_published', 'correction_notice_cleared'])
    );

    await h.serviceClient!.from('document_objects').insert({
      id: DOC_ARCHIVED_UUID,
      owner_id: BROKER_A,
      building_id: BLD_A_UUID,
      document_type: 'im_lite',
      status: 'archived',
      title: '보관된 역삼 IM',
    });
    await h.serviceClient!.from('workspace_items').insert({
      owner_id: BROKER_A,
      building_id: BLD_A_UUID,
      kind: 'im',
      status: 'archived',
      title: '보관된 역삼 IM',
      address: '강남구 역삼동',
      draft_payload: { buildingId: BLD_A_UUID },
      published_snapshot: { buildingId: BLD_A_UUID },
      deleted_at: new Date().toISOString(),
    });
    const restoreImRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'restore_im',
          buildingId: BLD_A_UUID,
          imId: BLD_A_UUID,
        }),
      })
    );
    expect(restoreImRes.status).toBe(200);
    const { data: unarchivedDoc } = await h.serviceClient!
      .from('document_objects')
      .select('status')
      .eq('id', DOC_ARCHIVED_UUID)
      .single();
    expect(unarchivedDoc?.status).toBe('published');

    // 4. DC P2-2: DEMO_SEED_LEGACY_IDS ('bld-01') personas isolated per broker ownerId
    await h.serviceClient!.from('workspace_items').insert([
      {
        owner_id: BROKER_B,
        legacy_id: 'bld-01',
        kind: 'dealcard',
        status: 'draft',
        title: '을중개 데모 딜카드',
        address: '서초구 서초동',
        draft_payload: { personas: { personas: [{ id: 'p-b', name: 'B전용 페르소나' }] } },
      },
      {
        owner_id: BROKER_A,
        legacy_id: 'bld-01',
        kind: 'dealcard',
        status: 'draft',
        title: '갑중개 데모 딜카드',
        address: '마포구 서교동',
        draft_payload: { personas: { personas: [{ id: 'p-a1', name: 'A전용 페르소나' }] } },
      },
    ]);

    h.authUser = { id: BROKER_A, email: 'broker78a@credeal.test', role: 'broker' };
    const getPersonasARes = await personasGET(
      new NextRequest('http://localhost:3000/api/broker/deal-card/bld-01/personas'),
      { params: Promise.resolve({ id: 'bld-01' }) }
    );
    expect(getPersonasARes.status).toBe(200);
    const getPersonasAJson = await getPersonasARes.json();
    expect(JSON.stringify(getPersonasAJson.data)).toContain('A전용 페르소나');
    expect(JSON.stringify(getPersonasAJson.data)).not.toContain('B전용 페르소나');

    const postPersonaARes = await personasPOST(
      new NextRequest('http://localhost:3000/api/broker/deal-card/bld-01/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          personasData: {
            personas: [
              { id: 'p-a1', name: 'A전용 페르소나' },
              { id: 'p-a2', name: 'A추가 페르소나' },
            ],
          },
        }),
      }),
      { params: Promise.resolve({ id: 'bld-01' }) }
    );
    expect(postPersonaARes.status).toBe(200);

    const delPersonaARes = await personaItemDELETE(
      new NextRequest('http://localhost:3000/api/broker/deal-card/bld-01/personas/p-a2', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'bld-01', personaId: 'p-a2' }) }
    );
    expect(delPersonaARes.status).toBe(200);
  });

  it('[IM P0-4 & NL P0-3b] preserves compliance toggle pairs >90d and persists SHA-256 email_suppressions before magazine_purge_unsubscribed scrubs subscriber_email', async () => {
    expect(PERMANENT_COMPLIANCE_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'im_restored',
        'dealcard_restored',
        'correction_notice_published',
        'correction_notice_cleared',
      ])
    );

    const old120dIso = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const old45dIso = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const optOutEmail = 'OptOut78B@Buyer.KR';
    const expectedHash = hashEmailForSuppression(optOutEmail);

    const { data: subInserted } = await h.serviceClient!
      .from('magazine_subscribers')
      .insert({
        broker_id: 'broker-78a',
        broker_user_id: BROKER_A,
        subscriber_email: optOutEmail,
        subscriber_name: '수신거부구독자',
        status: 'unsubscribed',
        consent_status: 'unsubscribed',
        unsubscribed_at: old45dIso,
      })
      .select('id')
      .single();
    expect(subInserted?.id).toBeTruthy();

    await h.serviceClient!.from('activity_events').insert([
      {
        actor_id: BROKER_A,
        event_type: 'im_restored',
        entity_type: 'building',
        entity_id: BLD_A_UUID,
        created_at: old120dIso,
      },
      {
        actor_id: BROKER_A,
        event_type: 'dealcard_restored',
        entity_type: 'building',
        entity_id: BLD_A_UUID,
        created_at: old120dIso,
      },
      {
        actor_id: BROKER_A,
        event_type: 'correction_notice_published',
        entity_type: 'building',
        entity_id: BLD_A_UUID,
        metadata: { message: '정정 안내' },
        created_at: old120dIso,
      },
      {
        actor_id: BROKER_A,
        event_type: 'correction_notice_cleared',
        entity_type: 'building',
        entity_id: BLD_A_UUID,
        created_at: old120dIso,
      },
      {
        actor_id: BROKER_A,
        event_type: 'ephemeral_test_view_78b',
        entity_type: 'building',
        entity_id: BLD_A_UUID,
        created_at: old120dIso,
      },
    ]);

    const purgeRes = await retentionPurgePOST(
      new NextRequest('http://localhost:3000/api/cron/retention-purge', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    expect(purgeRes.status).toBe(200);

    // RPC scrubbed subscriber_email to NULL
    const { data: scrubbedSub } = await h.serviceClient!
      .from('magazine_subscribers')
      .select('subscriber_email')
      .eq('id', subInserted!.id)
      .single();
    expect(scrubbedSub?.subscriber_email).toBeNull();

    // Permanent SHA-256 hash was persisted to email_suppressions BEFORE PII scrub!
    const { data: suppRow } = await h.serviceClient!
      .from('email_suppressions')
      .select('email_hash, broker_id, scope, reason')
      .eq('email_hash', expectedHash)
      .maybeSingle();
    expect(suppRow).toMatchObject({
      email_hash: expectedHash,
      broker_id: BROKER_A,
      scope: 'broker',
      reason: 'unsubscribe',
    });

    // All 4 compliance pair events survived >120d purge while ephemeral_test_view_78b was deleted
    const { data: keptEvents } = await h.serviceClient!
      .from('activity_events')
      .select('event_type')
      .eq('created_at', old120dIso);
    const keptTypes = (keptEvents || []).map((e) => e.event_type);
    expect(keptTypes).toEqual(
      expect.arrayContaining([
        'im_restored',
        'dealcard_restored',
        'correction_notice_published',
        'correction_notice_cleared',
      ])
    );
    expect(keptTypes).not.toContain('ephemeral_test_view_78b');
  });

  it('[Inbox P1-1, P1-2, P2-4] enforces statutory 422 gate on prepare_copy_bundle/approve_gate/send_im/send_dealcard, preserves phone-less same-name CRM clients, and omits display_name PII from broker_client_created', async () => {
    await h.serviceClient!.from('gate_requests').insert({
      id: GATE_REQ_INCOMPLETE,
      building_id: BLD_INCOMPLETE_UUID,
      target_broker_id: BROKER_INCOMPLETE,
      status: 'submitted',
    });

    h.authUser = { id: BROKER_INCOMPLETE, email: 'incomplete78@credeal.test', role: 'broker' };

    for (const payload of [
      {
        action: 'prepare_copy_bundle',
        buildingId: BLD_INCOMPLETE_UUID,
        threadId: 'custom_cli-1',
        clientName: '검증고객',
        assetKind: 'dealcard',
      },
      {
        action: 'approve_gate',
        buildingId: BLD_INCOMPLETE_UUID,
        threadId: GATE_REQ_INCOMPLETE,
      },
      {
        action: 'send_im',
        buildingId: BLD_INCOMPLETE_UUID,
        threadId: 'custom_cli-1',
      },
      {
        action: 'send_dealcard',
        buildingId: BLD_INCOMPLETE_UUID,
        threadId: 'custom_cli-1',
      },
    ]) {
      const res = await inboxActionsPOST(
        new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
      expect(json.shareToken).toBeUndefined();
    }

    // Inbox P1-2: Two phone-less clients with the same name at different emails + one with neither phone nor email
    const threads: Array<Record<string, unknown>> = [];
    appendCrmAndSubscriberThreads({
      threads,
      seenThreadIds: new Set<string>(),
      viewItems: [],
      callNotesByThreadId: new Map(),
      decisionByThreadId: new Map(),
      revokedByThreadId: new Map(),
      issuedTokenByThreadId: new Map(),
      newsletterStateByKey: new Map(),
      shareLinks: [],
      inboxState: {
        revokedBuildings: {},
        correctionNotices: {},
        callNotes: {},
      },
      allOwnedBuildingIds: [],
      deletedBuildingSet: new Set<string>(),
      forbiddenBuildingSet: new Set<string>(),
      buildingTitleById: new Map(),
      isThreadArchived: () => false,
      userId: BROKER_A,
      dbClients: [
        {
          id: 'c1000000-0000-4000-8000-000000000001',
          broker_id: BROKER_A,
          display_name: '김대표',
          company: '알파자산운용',
          phone: '',
          email: 'kim@alpha-amc.kr',
          tier: 'vip',
          created_at: '2026-11-18T01:00:00.000Z',
        },
        {
          id: 'c2000000-0000-4000-8000-000000000002',
          broker_id: BROKER_A,
          display_name: '김대표',
          company: '베타리츠',
          phone: '',
          email: 'kim@beta-reits.kr',
          tier: 'vip',
          created_at: '2026-11-18T02:00:00.000Z',
        },
        {
          id: 'c3000000-0000-4000-8000-000000000003',
          broker_id: BROKER_A,
          display_name: '김대표',
          company: '감마홀딩스',
          phone: '',
          email: '',
          tier: 'normal',
          created_at: '2026-11-18T03:00:00.000Z',
        },
      ],
      subscriberRows: [],
      memCustomClients: [],
      deletedClientIdSet: new Set<string>(),
      quickInventory: [],
    });
    expect(threads).toHaveLength(3);
    expect(threads.map((t) => t.clientEmail)).toEqual([
      'kim@alpha-amc.kr',
      'kim@beta-reits.kr',
      '',
    ]);

    // Inbox P2-4: POST /api/broker/clients omits display_name PII from activity_events.metadata
    h.authUser = { id: BROKER_A, email: 'broker78a@credeal.test', role: 'broker' };
    const createClientRes = await clientsPOST(
      new NextRequest('http://localhost:3000/api/broker/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_type: 'buyer',
          display_name: '민감성함비공개고객',
          phone: '010-7777-8888',
          tier: 'vip',
        }),
      })
    );
    expect(createClientRes.status).toBe(201);
    const createdClientJson = await createClientRes.json();
    const { data: createdEv } = await h.serviceClient!
      .from('activity_events')
      .select('metadata')
      .eq('event_type', 'broker_client_created')
      .eq('entity_id', createdClientJson.data.id)
      .single();
    expect(createdEv?.metadata).toEqual({
      has_phone: true,
      tier: 'vip',
    });
    expect(JSON.stringify(createdEv?.metadata)).not.toContain('민감성함비공개고객');
  });
});
