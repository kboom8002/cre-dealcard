/**
 * Wave 7.4E — Inbox CRM, SQL RLS & Cutover Migration Closure Suite
 *
 * Exercises real PostgreSQL + RLS via @electric-sql/pglite and actual route/action handlers:
 *  - [P0-1] Direct PostgREST write lockdown on public.activity_events & public.broker_clients
 *  - [P0-2] Partial unique index uq_magazine_cron_runs_run_id (multi-broker UUID run_id vs cron_slot:*)
 *  - [P1-1] Broker-initiated CRM opt-in DOI pending dispatch, honest UI state & lead opt-out email_suppressions
 *  - [P1-2] Resend webhook per-broker thread_id isolation, message_id storage & email_hash matching
 *  - [P1-3] DELETE /api/broker/clients/[id] tombstone + PII scrub + zero resurrection on GET /api/broker/inbox
 *  - [P1-4, P2-1..3] Timeline status labels, Zod .max(...) bounds, tour null guards & SSR cookie client
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  authUser: null as { id: string; email: string; role?: string } | null,
  viewer: null as { userId: string | null; isAdmin: boolean } | null,
  optInCalls: [] as Array<{ email: string; brokerName: string; brokerSlug: string }>,
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

vi.mock('@/domain/magazine/consent-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/magazine/consent-service')>();
  return {
    ...actual,
    sendOptInConfirmation: vi.fn(async (params: Parameters<typeof actual.sendOptInConfirmation>[0]) => {
      h.optInCalls.push({
        email: params.email || '',
        brokerName: params.brokerName || '',
        brokerSlug: params.brokerSlug,
      });
      return actual.sendOptInConfirmation(params);
    }),
  };
});

import { GET as inboxGET } from '@/app/api/broker/inbox/route';
import { POST as inboxActionsPOST } from '@/app/api/broker/inbox/actions/route';
import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';
import {
  PUT as clientPUT,
  DELETE as clientDELETE,
} from '@/app/api/broker/clients/[id]/route';
import { POST as clientContactsPOST } from '@/app/api/broker/clients/[id]/contacts/route';
import { PATCH as clientContactItemPATCH } from '@/app/api/broker/clients/[id]/contacts/[contactId]/route';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import { resetInboxSchemaCapsForTests } from '@/lib/inbox/inbox-schema-caps';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { getInboxState, saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import {
  formatDispatchStatusBadge,
  normalizeServerThread,
} from '@/app/(broker)/broker/w/inbox/_components/inbox-types';

const BROKER_A = 'aaaa7400-0000-4000-8000-000000000001';
const BROKER_B = 'bbbb7400-0000-4000-8000-000000000002';
const BROKER_C = 'cccc7400-0000-4000-8000-000000000003';
const BLD_A_UUID = '11117400-0000-4000-8000-000000000011';
const BLD_B_UUID = '22227400-0000-4000-8000-000000000022';

const WEBHOOK_RAW_SECRET = Buffer.from('wave74e-svix-webhook-secret-32b!!', 'utf8').toString('base64');
const WEBHOOK_SECRET = `whsec_${WEBHOOK_RAW_SECRET}`;

function buildSvixHeaders(rawBody: string, svixId: string): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const secretBytes = Buffer.from(WEBHOOK_RAW_SECRET, 'base64');
  const sig = crypto
    .createHmac('sha256', secretBytes)
    .update(`${svixId}.${ts}.${rawBody}`, 'utf8')
    .digest('base64');
  return {
    'content-type': 'application/json',
    'svix-id': svixId,
    'svix-timestamp': ts,
    'svix-signature': `v1,${sig}`,
  };
}

describe('Wave 7.4E — Inbox CRM, SQL RLS & Cutover Migration Closure', () => {
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
    harness = await PgliteSupabaseHarness.create();
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_A,
      email: 'broker74a@credeal.test',
      displayName: '김갑중개',
      company: '갑중개법인',
      phone: '02-555-7401',
      slug: 'broker-74a',
      registrationNo: '11680-2026-07401',
      officeAddress: '서울특별시 강남구 테헤란로 741',
    });

    await harness.seedUser({
      id: BROKER_B,
      email: 'broker74b@credeal.test',
      displayName: '이을중개',
      company: '을중개법인',
      phone: '02-555-7402',
      slug: 'broker-74b',
      registrationNo: '11680-2026-07402',
      officeAddress: '서울특별시 서초구 서초대로 742',
    });

    await harness.seedUser({
      id: BROKER_C,
      email: 'broker74c@credeal.test',
      displayName: '박병중개',
      company: '병중개법인',
      phone: '02-555-7403',
      slug: 'broker-74c',
      registrationNo: '11680-2026-07403',
      officeAddress: '서울특별시 송파구 올림픽로 743',
    });

    await execSql(
      `INSERT INTO public.building_ssot_lite (id, owner_id, area_signal, asset_type, price_band, status)
       VALUES ($1, $2, '강남 역삼권역', '업무시설', '180~210억', 'published'),
              ($3, $4, '서초 교대권역', '근린생활시설', '90~110억', 'published')`,
      [BLD_A_UUID, BROKER_A, BLD_B_UUID, BROKER_B]
    );

    await h.serviceClient.from('workspace_items').insert([
      {
        id: BLD_A_UUID,
        owner_id: BROKER_A,
        building_id: BLD_A_UUID,
        kind: 'im',
        status: 'published',
        title: '역삼 코어 오피스 빌딩',
        address: '강남 역삼권역',
        price_band: '180~210억',
        draft_payload: { buildingId: BLD_A_UUID, fullName: '역삼 코어 오피스 빌딩' },
        published_snapshot: {
          buildingId: BLD_A_UUID,
          buildingName: '역삼 코어 오피스 빌딩',
          fullName: '역삼 코어 오피스 빌딩',
          address: '강남 역삼권역',
          sections: [{ id: 's1', title: '요약', markdown: '검증 완료' }],
        },
      },
      {
        id: BLD_B_UUID,
        owner_id: BROKER_B,
        building_id: BLD_B_UUID,
        kind: 'im',
        status: 'published',
        title: '서초 교대 수익형 빌딩',
        address: '서초 교대권역',
        price_band: '90~110억',
        draft_payload: { buildingId: BLD_B_UUID, fullName: '서초 교대 수익형 빌딩' },
        published_snapshot: {
          buildingId: BLD_B_UUID,
          buildingName: '서초 교대 수익형 빌딩',
          fullName: '서초 교대 수익형 빌딩',
          address: '서초 교대권역',
          sections: [{ id: 's1', title: '요약', markdown: '검증 완료' }],
        },
      },
    ]);
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
    process.env.SHARE_LINK_SECRET = 'wave74e-share-link-secret-32-chars-minimum!';
    process.env.UNSUBSCRIBE_SECRET = 'wave74e-unsubscribe-secret-32-chars-minimum!';
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RESEND_DRY_RUN = '1';
    delete process.env.RESEND_API_KEY;
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
    h.optInCalls = [];
    h.authUser = { id: BROKER_A, email: 'broker74a@credeal.test', role: 'broker' };
    h.viewer = null;
  });

  it('[P0-1] locks down direct PostgREST writes on activity_events & broker_clients while preserving own-row SELECT and service_role writes', async () => {
    // 1. Verify legacy permissive policies (00001 / 00020) were dropped and FORCE RLS is active
    const rlsMeta = await execSql<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('activity_events', 'broker_clients')
        ORDER BY relname`
    );
    expect(rlsMeta).toEqual([
      { relname: 'activity_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'broker_clients', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const policies = await execSql<{
      tablename: string;
      policyname: string;
      cmd: string;
      roles: string[];
    }>(
      `SELECT tablename, policyname, cmd, roles
         FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('activity_events', 'broker_clients')`
    );
    const policyNames = policies.map((p) => p.policyname);
    expect(policyNames).not.toContain('events_insert_authenticated');
    expect(policyNames).not.toContain('events_insert_anon');
    expect(policyNames).not.toContain('broker_clients_own_all');
    expect(policyNames).not.toContain('broker_clients_own');
    expect(policyNames).toContain('events_select_own');
    expect(policyNames).toContain('broker_clients_select_own');

    const clientA = harness.createClient({ role: 'authenticated', userId: BROKER_A });
    const clientB = harness.createClient({ role: 'authenticated', userId: BROKER_B });
    const clientAnon = harness.createClient({ role: 'anon' });
    const svc = h.serviceClient!;

    // 2. Direct authenticated INSERTs on activity_events (link_revoked, magazine_subscribed) are REJECTED
    const spoofRevoke = await clientA.from('activity_events').insert({
      actor_id: BROKER_A,
      event_type: 'link_revoked',
      entity_type: 'building',
      metadata: { building_id: BLD_B_UUID, scope: 'building' },
    });
    expect(spoofRevoke.error).not.toBeNull();

    const spoofSub = await clientA.from('activity_events').insert({
      actor_id: BROKER_A,
      event_type: 'magazine_subscribed',
      entity_type: 'subscriber',
      metadata: { email: 'victim@credeal.test' },
    });
    expect(spoofSub.error).not.toBeNull();

    const anonInsertEv = await clientAnon.from('activity_events').insert({
      event_type: 'link_revoked',
      metadata: { building_id: BLD_A_UUID },
    });
    expect(anonInsertEv.error).not.toBeNull();

    // 3. service_role writes succeed; authenticated SELECT sees ONLY own actor_id rows
    const svcEvA = await svc
      .from('activity_events')
      .insert({
        actor_id: BROKER_A,
        event_type: 'call_note_recorded',
        metadata: { note: 'Broker A server log' },
      })
      .select('id, actor_id')
      .single();
    expect(svcEvA.error).toBeNull();

    const svcEvB = await svc
      .from('activity_events')
      .insert({
        actor_id: BROKER_B,
        event_type: 'call_note_recorded',
        metadata: { note: 'Broker B server log' },
      })
      .select('id, actor_id')
      .single();
    expect(svcEvB.error).toBeNull();

    const aEvSelect = await clientA.from('activity_events').select('id, actor_id');
    expect(aEvSelect.error).toBeNull();
    expect(aEvSelect.data.some((r) => r.id === svcEvA.data.id)).toBe(true);
    expect(aEvSelect.data.some((r) => r.id === svcEvB.data.id)).toBe(false);

    const anonEvSelect = await clientAnon.from('activity_events').select('id');
    expect(anonEvSelect.error).not.toBeNull();

    // 4. Seed broker_clients via service_role, then verify authenticated INSERT/UPDATE/DELETE are REJECTED
    const seededClientA = await svc
      .from('broker_clients')
      .insert({
        broker_id: BROKER_A,
        display_name: '수신거부고객',
        email: 'unsub_target@credeal.test',
        phone: '010-7400-0001',
        consent_status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .select('id, consent_status')
      .single();
    expect(seededClientA.error).toBeNull();

    const seededClientB = await svc
      .from('broker_clients')
      .insert({
        broker_id: BROKER_B,
        display_name: '타브로커고객',
        email: 'other_broker_client@credeal.test',
        phone: '010-7400-0002',
        consent_status: 'pending',
      })
      .select('id')
      .single();
    expect(seededClientB.error).toBeNull();

    // Direct client-side consent spoofing (consent_status = 'confirmed', unsubscribed_at = null) MUST fail
    const spoofConsentUpdate = await clientA
      .from('broker_clients')
      .update({ consent_status: 'confirmed', unsubscribed_at: null })
      .eq('id', seededClientA.data.id);
    expect(spoofConsentUpdate.error).not.toBeNull();

    const spoofClientInsert = await clientA.from('broker_clients').insert({
      broker_id: BROKER_A,
      display_name: '직접삽입시도',
      email: 'spoof_insert@credeal.test',
      consent_status: 'confirmed',
    });
    expect(spoofClientInsert.error).not.toBeNull();

    const spoofClientDelete = await clientA
      .from('broker_clients')
      .delete()
      .eq('id', seededClientA.data.id);
    expect(spoofClientDelete.error).not.toBeNull();

    // Verify DB row remained unsubscribed & untouched
    const verifyRow = await svc
      .from('broker_clients')
      .select('id, consent_status, unsubscribed_at')
      .eq('id', seededClientA.data.id)
      .single();
    expect(verifyRow.data.consent_status).toBe('unsubscribed');
    expect(verifyRow.data.unsubscribed_at).toBeTruthy();

    // Authenticated SELECT on broker_clients returns ONLY own rows; anon SELECT is rejected
    const aClients = await clientA.from('broker_clients').select('id, broker_id');
    expect(aClients.error).toBeNull();
    expect(aClients.data.some((r) => r.id === seededClientA.data.id)).toBe(true);
    expect(aClients.data.some((r) => r.id === seededClientB.data.id)).toBe(false);

    const bClients = await clientB.from('broker_clients').select('id, broker_id');
    expect(bClients.error).toBeNull();
    expect(bClients.data.some((r) => r.id === seededClientA.data.id)).toBe(false);
    expect(bClients.data.some((r) => r.id === seededClientB.data.id)).toBe(true);

    const anonClients = await clientAnon.from('broker_clients').select('id');
    expect(anonClients.error).not.toBeNull();
  });

  it('[P0-2] allows multiple weekly-magazine rows sharing one UUID run_id while rejecting duplicate cron_slot:* rows with 23505', async () => {
    const sharedRunUuid = '74747474-7474-4747-8747-747474747474';

    await execSql(
      `INSERT INTO public.magazine_cron_runs (job_key, bucket_key, run_id, broker_id, broker_user_id, issue_date, kind, status)
       VALUES
         ('weekly-magazine', '2026-11-18:broker-a', $1, 'broker-74a', $2, '2026-11-18', 'weekly', 'sent'),
         ('weekly-magazine', '2026-11-18:broker-b', $1, 'broker-74b', $3, '2026-11-18', 'weekly', 'sent'),
         ('weekly-magazine', '2026-11-18:broker-c', $1, 'broker-74c', $4, '2026-11-18', 'weekly', 'sent')`,
      [sharedRunUuid, BROKER_A, BROKER_B, BROKER_C]
    );

    const uuidRows = await execSql<{ id: string }>(
      `SELECT id FROM public.magazine_cron_runs WHERE run_id = $1`,
      [sharedRunUuid]
    );
    expect(uuidRows).toHaveLength(3);

    // First cron_slot:* insert succeeds; second with identical cron_slot:* fails with 23505
    await execSql(
      `INSERT INTO public.magazine_cron_runs (job_key, bucket_key, run_id, kind, status)
       VALUES ('weekly-magazine-slot', 'slot-1', 'cron_slot:weekly:2026-11-18', 'weekly', 'started')`
    );

    let caughtCode = '';
    try {
      await execSql(
        `INSERT INTO public.magazine_cron_runs (job_key, bucket_key, run_id, kind, status)
         VALUES ('weekly-magazine-slot', 'slot-2', 'cron_slot:weekly:2026-11-18', 'weekly', 'started')`
      );
    } catch (err: unknown) {
      caughtCode = String((err as { code?: unknown })?.code || '');
    }
    expect(caughtCode).toBe('23505');

    const idxRows = await execSql<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'magazine_cron_runs'`
    );
    const idxNames = idxRows.map((r) => r.indexname);
    expect(idxNames).toContain('uq_magazine_cron_runs_run_id');
    expect(idxNames).toContain('idx_magazine_cron_runs_run_id');
  });

  it('[P1-1] dispatches DOI pending opt-in for CRM upsert & toggle_newsletter, keeps newsletterSubscribed=false, and writes email_suppressions on lead opt-out', async () => {
    // 1. upsert_client with newsletterOptIn=true -> pending subscriber + sendOptInConfirmation + optInPending=true
    const upsertRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_client',
          clientId: `custom_${Date.now()}`,
          clientName: '박수신대기',
          clientPhone: '010-7411-0001',
          clientEmail: 'doi_new_client@credeal.test',
          clientGrade: 'VIP',
          clientRole: 'buyer',
          newsletterOptIn: true,
          newsletterSubscribed: true,
        }),
      })
    );
    expect(upsertRes.status).toBe(200);
    const upsertJson = (await upsertRes.json()) as {
      ok: boolean;
      clientId: string;
      newsletterSubscribed: boolean;
      optInPending: boolean;
      client: { newsletterSubscribed: boolean };
    };
    expect(upsertJson.ok).toBe(true);
    expect(upsertJson.optInPending).toBe(true);
    expect(upsertJson.newsletterSubscribed).toBe(false);
    expect(upsertJson.client.newsletterSubscribed).toBe(false);
    expect(h.optInCalls.some((c) => c.email === 'doi_new_client@credeal.test')).toBe(true);

    const subRowsAfterUpsert = await execSql<{
      subscriber_email: string;
      status: string;
      confirm_status: string;
      confirm_token_hash: string | null;
    }>(
      `SELECT subscriber_email, status, confirm_status, confirm_token_hash
         FROM public.magazine_subscribers
        WHERE subscriber_email = 'doi_new_client@credeal.test'`
    );
    expect(subRowsAfterUpsert).toHaveLength(1);
    expect(subRowsAfterUpsert[0].status).toBe('active');
    expect(subRowsAfterUpsert[0].confirm_status).toBe('pending');
    expect(subRowsAfterUpsert[0].confirm_token_hash).toBeTruthy();

    // 2. toggle_newsletter ON for another non-confirmed CRM client -> triggers DOI pending instead of false green active
    const [ ToggleClient ] = await execSql<{ id: string }>(
      `INSERT INTO public.broker_clients (broker_id, display_name, email, phone, consent_status)
       VALUES ($1, '최토글대기', 'doi_toggle@credeal.test', '010-7411-0002', 'pending')
       RETURNING id`,
      [BROKER_A]
    );
    h.optInCalls = [];

    const toggleOnRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_newsletter',
          threadId: `custom_${ToggleClient.id}`,
          clientId: `custom_${ToggleClient.id}`,
          clientName: '최토글대기',
          clientPhone: '010-7411-0002',
          clientEmail: 'doi_toggle@credeal.test',
          subscribed: true,
        }),
      })
    );
    expect(toggleOnRes.status).toBe(200);
    const toggleOnJson = (await toggleOnRes.json()) as {
      ok: boolean;
      newsletterSubscribed: boolean;
      optInPending?: boolean;
    };
    expect(toggleOnJson.ok).toBe(true);
    expect(toggleOnJson.optInPending).toBe(true);
    expect(toggleOnJson.newsletterSubscribed).toBe(false);
    expect(h.optInCalls.some((c) => c.email === 'doi_toggle@credeal.test')).toBe(true);

    // 3. Lead thread opt-out (subscribed: false) with clientEmail -> writes email_suppressions even without broker_clients row
    const leadEmail = 'lead_optout_only@credeal.test';
    const leadInqId = '33337400-0000-4000-8000-000000000033';
    await execSql(
      `INSERT INTO public.im_inquiry_requests (id, building_id, broker_user_id, requester_name, requester_phone, requester_email)
       VALUES ($1, $2, $3, '문의리드고객', '010-7411-9999', NULL)`,
      [leadInqId, BLD_A_UUID, BROKER_A]
    );
    const leadOptOutRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_newsletter',
          threadId: `inq-${leadInqId}`,
          clientId: `inq-${leadInqId}`,
          buildingId: BLD_A_UUID,
          clientName: '문의리드고객',
          clientPhone: '010-7411-9999',
          clientEmail: leadEmail,
          subscribed: false,
        }),
      })
    );
    expect(leadOptOutRes.status).toBe(200);

    const suppressionRows = await execSql<{
      email_hash: string;
      broker_id: string | null;
      reason: string;
    }>(
      `SELECT email_hash, broker_id, reason
         FROM public.email_suppressions
        WHERE email_hash = $1 AND broker_id = $2`,
      [hashEmailForSuppression(leadEmail), BROKER_A]
    );
    expect(suppressionRows).toHaveLength(1);
    expect(suppressionRows[0].reason).toBe('unsubscribe');

    // 4. Verify UI source contracts in w/inbox/page.tsx
    const inboxPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(broker)/broker/w/inbox/page.tsx'),
      'utf8'
    );
    expect(inboxPageSrc).toContain('고객 이메일로 수신동의 확인 안내를 발송했습니다 (확인 완료 후 발송 가능)');
    expect(inboxPageSrc).toContain('수신동의 확인 요청을 발송했습니다 (고객 확인 후 활성화됩니다)');
    expect(inboxPageSrc).toContain('clientEmail: targetThread.clientEmail || undefined');
    expect(inboxPageSrc).not.toContain('newsletterSubscribed: newClientForm.newsletterOptIn,\n      events:');
  });

  it('[P1-2] isolates per-broker thread_id in Resend webhook, persists message_id + email_hash on inbox_email_sent, and matches hash-only webhook events in inbox-query & outbound', async () => {
    const sharedEmail = 'shared_buyer_74e@credeal.test';
    const sharedEmailHash = hashEmailForSuppression(sharedEmail);

    const [clientA] = await execSql<{ id: string }>(
      `INSERT INTO public.broker_clients (broker_id, display_name, email, phone, consent_status)
       VALUES ($1, '공통바이어A', $2, '010-7412-0001', 'confirmed')
       RETURNING id`,
      [BROKER_A, sharedEmail]
    );
    const [clientB] = await execSql<{ id: string }>(
      `INSERT INTO public.broker_clients (broker_id, display_name, email, phone, consent_status)
       VALUES ($1, '공통바이어B', $2, '010-7412-0002', 'pending')
       RETURNING id`,
      [BROKER_B, sharedEmail]
    );
    await execSql(
      `INSERT INTO public.magazine_subscribers (broker_id, broker_user_id, subscriber_email, subscriber_name, channel, status, confirm_status, night_consent, client_id)
       VALUES ('broker-74a', $1, $2, '공통바이어A', 'email', 'active', 'confirmed', true, $3)`,
      [BROKER_A, sharedEmail, clientA.id]
    );

    // 1. Broker A sends inbox email -> activity_events records message_id + email_hash
    const sendRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'send_inbox_email',
          threadId: `custom_${clientA.id}`,
          clientId: `custom_${clientA.id}`,
          buildingId: BLD_A_UUID,
          buildingTitle: '역삼 코어 오피스 빌딩',
          clientName: '공통바이어A',
          clientEmail: sharedEmail,
          assetKind: 'im',
          headline: '[역삼 코어 오피스 빌딩] 검토 자료',
          marketingConsentConfirmed: true,
        }),
      })
    );
    expect(sendRes.status).toBe(200);
    const sendJson = (await sendRes.json()) as { ok: boolean; messageId?: string };
    expect(sendJson.ok).toBe(true);
    expect(sendJson.messageId).toBeTruthy();

    const sentEvRows = await execSql<{ metadata: Record<string, unknown> }>(
      `SELECT metadata
         FROM public.activity_events
        WHERE actor_id = $1 AND event_type = 'inbox_email_sent'
        ORDER BY created_at DESC
        LIMIT 1`,
      [BROKER_A]
    );
    expect(sentEvRows).toHaveLength(1);
    expect(sentEvRows[0].metadata.email_hash).toBe(sharedEmailHash);
    expect(sentEvRows[0].metadata.message_id).toBe(sendJson.messageId);

    // 2. Resend hard-bounce webhook arrives for sharedEmail -> each broker gets its OWN thread_id!
    const webhookBody = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: 're_msg_74e_uncorrelated_multi',
        to: [sharedEmail],
        bounce: { type: 'Permanent', message: '550 5.1.1 User unknown' },
      },
    });
    const webhookRes = await resendWebhookPOST(
      new NextRequest('http://localhost:3000/api/webhooks/resend', {
        method: 'POST',
        headers: buildSvixHeaders(webhookBody, 'msg_74e_multibroker_bounce_1'),
        body: webhookBody,
      })
    );
    expect(webhookRes.status).toBe(200);

    const bounceEvents = await execSql<{
      actor_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT actor_id, metadata
         FROM public.activity_events
        WHERE event_type = 'email_bounced'
          AND metadata->>'email_hash' = $1`,
      [sharedEmailHash]
    );
    const evByBroker = new Map(bounceEvents.map((e) => [e.actor_id, e.metadata]));
    expect(evByBroker.get(BROKER_A)?.thread_id).toBe(`custom_${clientA.id}`);
    expect(evByBroker.get(BROKER_B)?.thread_id).toBe(`custom_${clientB.id}`);
    // Verify no plaintext email leaked into permanent bounce event metadata
    expect(evByBroker.get(BROKER_A)?.email).toBeUndefined();
    expect(evByBroker.get(BROKER_A)?.to_email).toBeUndefined();

    // 3. Verify hash-only email_bounced / email_delivered matching in GET /api/broker/inbox & outbound check
    const hashOnlyEmail = 'hash_only_match_74e@credeal.test';
    const hashOnlyDigest = hashEmailForSuppression(hashOnlyEmail);
    const [hashClient] = await execSql<{ id: string }>(
      `INSERT INTO public.broker_clients (broker_id, display_name, email, phone, consent_status)
       VALUES ($1, '해시매칭고객', $2, '010-7412-0099', 'confirmed')
       RETURNING id`,
      [BROKER_A, hashOnlyEmail]
    );
    await execSql(
      `INSERT INTO public.magazine_subscribers (broker_id, broker_user_id, subscriber_email, subscriber_name, channel, status, confirm_status, night_consent, client_id)
       VALUES ('broker-74a', $1, $2, '해시매칭고객', 'email', 'active', 'confirmed', true, $3)`,
      [BROKER_A, hashOnlyEmail, hashClient.id]
    );
    // Insert a hash-only email_bounced event (without updating broker_clients.email_delivery_status and without thread_id)
    await execSql(
      `INSERT INTO public.activity_events (actor_id, actor_role, event_type, entity_type, metadata)
       VALUES ($1, 'system', 'email_bounced', 'email_webhook', $2::jsonb)`,
      [
        BROKER_A,
        JSON.stringify({
          email_hash: hashOnlyDigest,
          email_masked: 'h***@credeal.test',
          reason: '550 mailbox unavailable',
        }),
      ]
    );

    const inboxRes = await inboxGET(
      new NextRequest('http://localhost:3000/api/broker/inbox?workspace=1')
    );
    expect(inboxRes.status).toBe(200);
    const inboxJson = (await inboxRes.json()) as {
      threads: Array<{
        id: string;
        emailDeliveryStatus?: string;
        dispatchHistory?: Array<{ eventType: string; status: string }>;
      }>;
    };
    const matchedHashThread = inboxJson.threads.find((t) => t.id === `custom_${hashClient.id}`);
    expect(matchedHashThread).toBeDefined();
    expect(matchedHashThread?.emailDeliveryStatus).toBe('bounced');
    expect(
      matchedHashThread?.dispatchHistory?.some(
        (d) => d.eventType === 'email_bounced' && d.status === 'bounced'
      )
    ).toBe(true);

    // Outbound send_inbox_email must ALSO reject hashOnlyEmail via checkEmailDeliveryEligibility email_hash match
    const blockedSendRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'send_inbox_email',
          threadId: `custom_${hashClient.id}`,
          clientId: `custom_${hashClient.id}`,
          buildingId: BLD_A_UUID,
          buildingTitle: '역삼 코어 오피스 빌딩',
          clientName: '해시매칭고객',
          clientEmail: hashOnlyEmail,
          assetKind: 'im',
          marketingConsentConfirmed: true,
        }),
      })
    );
    expect(blockedSendRes.status).toBe(422);
  });

  it('[P1-3] DELETE /api/broker/clients/[id] writes custom_client_deleted tombstone, scrubs PII from prior CRM events, and prevents resurrection on GET /api/broker/inbox', async () => {
    // 1. Create client via Inbox upsert_client (creates broker_clients row + custom_client_upserted event)
    const createRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_client',
          clientId: `custom_${Date.now()}`,
          clientName: '삭제대상고객PII',
          clientPhone: '010-7413-7777',
          clientEmail: 'delete_pii_74e@credeal.test',
          freeMemo: '비공개 자산가 메모 300억 현금보유',
          clientGrade: 'VIP',
          clientRole: 'buyer',
          newsletterOptIn: false,
        }),
      })
    );
    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as { clientId: string };
    const canonicalThreadId = createJson.clientId;
    const rawUuid = canonicalThreadId.replace(/^custom_/, '');

    // Seed an in-memory customClients copy too to verify memory eviction
    const mem = getInboxState();
    mem.customClients.push({
      id: canonicalThreadId,
      ownerId: BROKER_A,
      clientName: '삭제대상고객PII',
      clientGrade: 'VIP',
      clientPhone: '010-7413-7777',
      clientEmail: 'delete_pii_74e@credeal.test',
      budget: '300억',
      preferredRegion: '강남',
      buildingId: BLD_A_UUID,
      buildingTitle: '역삼 코어 오피스 빌딩',
      newsletterSubscribed: false,
      createdAt: new Date().toISOString(),
    });
    saveInboxState(mem);

    // Record a call note containing PII
    const noteRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'log_call',
          threadId: canonicalThreadId,
          buildingId: BLD_A_UUID,
          note: '삭제대상고객PII 통화 메모: 010-7413-7777 직통번호 확인',
        }),
      })
    );
    expect(noteRes.status).toBe(200);

    // 2. Delete client via /api/broker/clients/[id] (CRM detail page delete endpoint)
    const delRes = await clientDELETE(
      new NextRequest(`http://localhost:3000/api/broker/clients/${rawUuid}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: rawUuid }) }
    );
    expect(delRes.status).toBe(200);

    // 3. Verify tombstone exists & prior custom_client_upserted + call_note_recorded PII is scrubbed
    const tombstones = await execSql<{ metadata: Record<string, unknown> }>(
      `SELECT metadata
         FROM public.activity_events
        WHERE actor_id = $1
          AND event_type = 'custom_client_deleted'
          AND metadata->>'raw_client_id' = $2`,
      [BROKER_A, rawUuid]
    );
    expect(tombstones.length).toBeGreaterThanOrEqual(1);

    const priorCrmEvents = await execSql<{
      event_type: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata
         FROM public.activity_events
        WHERE actor_id = $1
          AND event_type IN ('custom_client_upserted', 'inbox_custom_client_upserted', 'call_note_recorded')`,
      [BROKER_A]
    );
    const matchingPrior = priorCrmEvents.filter((ev) => {
      const m = ev.metadata;
      return (
        m.raw_client_id === rawUuid ||
        m.client_id === canonicalThreadId ||
        m.thread_id === canonicalThreadId
      );
    });
    expect(matchingPrior.length).toBeGreaterThanOrEqual(2);
    for (const ev of matchingPrior) {
      expect(ev.metadata.pii_scrubbed_at).toBeTruthy();
      expect(ev.metadata.client_name).toBeUndefined();
      expect(ev.metadata.client_phone).toBeUndefined();
      expect(ev.metadata.client_email).toBeUndefined();
      expect(ev.metadata.free_memo).toBeUndefined();
      expect(ev.metadata.note).toBeUndefined();
    }

    // Memory state evicted
    expect(getInboxState().customClients.some((c) => c.id === canonicalThreadId)).toBe(false);

    // 4. GET /api/broker/inbox must NOT resurrect the deleted client
    const inboxAfterRes = await inboxGET(
      new NextRequest('http://localhost:3000/api/broker/inbox?workspace=1')
    );
    expect(inboxAfterRes.status).toBe(200);
    const inboxAfterJson = (await inboxAfterRes.json()) as {
      clients: Array<{ id: string; display_name?: string }>;
      threads: Array<{ id: string; clientName?: string }>;
    };
    expect(inboxAfterJson.clients.some((c) => c.id === rawUuid)).toBe(false);
    expect(
      inboxAfterJson.threads.some(
        (t) =>
          t.id === canonicalThreadId ||
          t.id === `cli-${rawUuid}` ||
          t.clientName === '삭제대상고객PII'
      )
    ).toBe(false);
  });

  it('[P1-4, P2-1..3] preserves copied/prepared/imported/logged timeline statuses, enforces Zod .max(...) bounds, and guards tour nulls & SSR cookie client', async () => {
    // 1. P2-1: normalizeServerThread & formatDispatchStatusBadge preserve honest statuses
    const normalized = normalizeServerThread({
      id: 'custom_status_test',
      clientName: '상태검증고객',
      dispatchHistory: [
        { id: 'd1', eventType: 'inbox_outbound_copied', channel: 'kakao_copy', title: '카톡 복사', status: 'copied', createdAt: '2026-11-18T00:00:00Z' },
        { id: 'd2', eventType: 'im_link_prepared', channel: 'link', title: 'IM 링크', status: 'prepared', createdAt: '2026-11-18T00:01:00Z' },
        { id: 'd3', eventType: 'contact_imported', channel: 'import', title: '명단 등록', status: 'imported', createdAt: '2026-11-18T00:02:00Z' },
        { id: 'd4', eventType: 'call_note_recorded', channel: 'system', title: '상담 메모', status: 'logged', createdAt: '2026-11-18T00:03:00Z' },
      ],
    });
    expect(normalized.dispatchHistory?.map((d) => d.status)).toEqual([
      'copied',
      'prepared',
      'imported',
      'logged',
    ]);
    expect(formatDispatchStatusBadge('copied').label).toBe('링크 복사됨');
    expect(formatDispatchStatusBadge('prepared').label).toBe('링크 준비됨');
    expect(formatDispatchStatusBadge('imported').label).toBe('연락처 등록됨');
    expect(formatDispatchStatusBadge('logged').label).toBe('기록됨');
    expect(formatDispatchStatusBadge('sent').label).toBe('발송 완료');

    // 2. P2-3: Zod .max(...) bounds on PUT /api/broker/clients/[id] & contacts routes
    const [validClient] = await execSql<{ id: string }>(
      `INSERT INTO public.broker_clients (broker_id, display_name, phone)
       VALUES ($1, '검증고객', '010-7423-0001')
       RETURNING id`,
      [BROKER_A]
    );

    const overNameRes = await clientPUT(
      new NextRequest(`http://localhost:3000/api/broker/clients/${validClient.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: '가'.repeat(121) }),
      }),
      { params: Promise.resolve({ id: validClient.id }) }
    );
    expect(overNameRes.status).toBe(400);

    const overTagsRes = await clientPUT(
      new NextRequest(`http://localhost:3000/api/broker/clients/${validClient.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tags: Array.from({ length: 31 }, (_, idx) => `tag-${idx}`),
        }),
      }),
      { params: Promise.resolve({ id: validClient.id }) }
    );
    expect(overTagsRes.status).toBe(400);

    const overNotesRes = await clientPUT(
      new NextRequest(`http://localhost:3000/api/broker/clients/${validClient.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: '메'.repeat(5001) }),
      }),
      { params: Promise.resolve({ id: validClient.id }) }
    );
    expect(overNotesRes.status).toBe(400);

    const overContactSummaryPost = await clientContactsPOST(
      new NextRequest(`http://localhost:3000/api/broker/clients/${validClient.id}/contacts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contact_type: 'phone',
          summary: '상'.repeat(5001),
        }),
      }),
      { params: Promise.resolve({ id: validClient.id }) }
    );
    expect(overContactSummaryPost.status).toBe(400);

    const overContactSummaryPatch = await clientContactItemPATCH(
      new NextRequest(
        `http://localhost:3000/api/broker/clients/${validClient.id}/contacts/00000000-0000-4000-8000-000000000099`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contact_type: 'phone',
            summary: '수'.repeat(5001),
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: validClient.id,
          contactId: '00000000-0000-4000-8000-000000000099',
        }),
      }
    );
    expect(overContactSummaryPatch.status).toBe(400);

    // 3. P1-4 & P2-2: Tour null-guards, SSR cookie client & honest newsletter copy on /broker/clients/**
    const clientDetailSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(broker)/broker/clients/[id]/page.tsx'),
      'utf8'
    );
    expect(clientDetailSrc).toContain('일정 정보 미상');
    expect(clientDetailSrc).toContain('외부·비공개 매물');
    expect(clientDetailSrc).toContain('@/lib/supabase/client');
    expect(clientDetailSrc).not.toContain("from '@supabase/supabase-js'");

    const clientNewSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(broker)/broker/clients/new/page.tsx'),
      'utf8'
    );
    expect(clientNewSrc).toContain('@/lib/supabase/client');
    expect(clientNewSrc).not.toContain("from '@supabase/supabase-js'");

    const clientsListSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(broker)/broker/clients/page.tsx'),
      'utf8'
    );
    expect(clientsListSrc).not.toContain('매주 월요일 오전 자동 발송');
    expect(clientsListSrc).toContain('수신동의 확인');
  });
});
