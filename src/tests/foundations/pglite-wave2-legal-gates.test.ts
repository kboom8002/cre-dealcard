/**
 * Wave 2 (WP 2-A ~ WP 2-E + D4 + D5) Legal & Compliance Integration Suite
 * Backed by real PGlite PostgreSQL + RLS (no mocked Supabase tables).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  authUser: null as { id: string; email: string; role?: string } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, role: h.authUser.role || 'broker', error: null }
      : {
          user: null,
          error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        },
}));

import { GET as unsubscribeGET, POST as unsubscribePOST } from '@/app/api/public/magazine/unsubscribe/route';
import { POST as actionsPOST } from '@/app/api/broker/inbox/actions/route';
import { POST as importContactsPOST } from '@/app/api/broker/inbox/import-contacts/route';
import { POST as subscribersPOST } from '@/app/api/broker/magazine/subscribers/route';
import { POST as publishDealcardPOST } from '@/app/api/broker/dealcards/[id]/publish/route';
import { POST as publishEditionPOST } from '@/app/api/magazine/editions/[id]/publish/route';
import { POST as distributePOST } from '@/app/api/broker/magazine/distribute/route';
import { POST as retentionPurgePOST } from '@/app/api/cron/retention-purge/route';
import { POST as consentReconfirmPOST } from '@/app/api/cron/consent-reconfirm-2yr/route';
import { POST as gateRequestsPOST, GET as gateRequestsGET } from '@/app/api/gate-requests/route';
import { issueUnsubToken } from '@/domain/magazine/unsub-token';
import { sendGate } from '@/domain/magazine/send-gate';
import { renderMagazineEmail } from '@/domain/magazine/email-template';
import { isEmailSuppressed, recordEmailSuppression } from '@/lib/legal/email-suppression';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { resolveInvariantMode } from '@/domain/building/mobile-im/quality/invariant-telemetry';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import {
  formatPriceRange,
  formatKrw,
  validateBlindPriceBand,
  parseKoreanPriceKrw,
} from '@/lib/deal-card/price-band';
import { bandPriceDisplay } from '@/domain/ontology/price-banding';
import { formatBlindPriceBandFromManwon } from '@/lib/workspace/summary/types-and-helpers';
import { parseMemoIntoCard4 } from '@/lib/deal-card/memo-pairing';

const BROKER_COMPLETE = '11111111-1111-4111-8111-111111111201';
const BROKER_INCOMPLETE = '22222222-2222-4222-8222-222222222202';
const BLD_COMPLETE = '33333333-3333-4333-8333-333333333301';
const BLD_INCOMPLETE = '44444444-4444-4444-8444-444444444402';

describe('Wave 2 Legal & Compliance Gates (Real PGlite SQL)', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  async function execSql<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const res = await harness.execSqlAs({ role: 'service_role' }, sql, params);
    return res.rows as T[];
  }

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_COMPLETE,
      email: 'complete@credeal.test',
      displayName: '정완전',
    });
    await execSql(
      `UPDATE public.profiles SET company = $2, phone = $3 WHERE id = $1`,
      [BROKER_COMPLETE, '성수정석공인중개사사무소', '02-456-7890'],
    );
    await execSql(
      `INSERT INTO public.broker_profiles (user_id, slug, office_address, office_reg_number, representative_name, contact_email, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (user_id) DO UPDATE SET
         slug = EXCLUDED.slug,
         office_address = EXCLUDED.office_address,
         office_reg_number = EXCLUDED.office_reg_number,
         representative_name = EXCLUDED.representative_name,
         contact_email = EXCLUDED.contact_email`,
      [
        BROKER_COMPLETE,
        'complete-broker',
        '서울특별시 성동구 성수이로 88',
        '11200-2023-04567',
        '정완전',
        'office@credeal.test',
      ],
    );

    await harness.seedUser({
      id: BROKER_INCOMPLETE,
      email: 'incomplete@credeal.test',
      displayName: '박미입력',
    });
    await execSql(
      `UPDATE public.profiles SET company = $2, phone = $3 WHERE id = $1`,
      [BROKER_INCOMPLETE, '미완성공인중개사사무소', '02-987-6543'],
    );
    await execSql(
      `INSERT INTO public.broker_profiles (user_id, slug, office_address, office_reg_number, representative_name, is_public)
       VALUES ($1, $2, $3, NULL, $4, true)
       ON CONFLICT (user_id) DO UPDATE SET
         slug = EXCLUDED.slug,
         office_address = EXCLUDED.office_address,
         office_reg_number = NULL,
         representative_name = EXCLUDED.representative_name`,
      [BROKER_INCOMPLETE, 'incomplete-broker', '서울특별시 강남구 테헤란로 10', '박미입력'],
    );

    await execSql(
      `INSERT INTO public.building_ssot_lite (id, owner_id, area_signal, asset_type, price_band, status)
       VALUES ($1, $2, '성수동', '근린생활시설', '90~100억', 'draft'),
              ($3, $4, '강남역', '업무시설', '100~120억', 'draft')`,
      [BLD_COMPLETE, BROKER_COMPLETE, BLD_INCOMPLETE, BROKER_INCOMPLETE],
    );
  }, 30_000);

  afterAll(async () => {
    await harness?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'wave2-unsub-secret-32-chars-minimum-key';
    process.env.CRON_SECRET = 'wave2-cron-secret-32-chars-minimum-key';
    process.env.SHARE_LINK_SECRET = 'wave2-share-secret-32-chars-minimum-key';
    process.env.APP_BASE_URL = 'https://www.credeal.net';
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    process.env.MAGAZINE_SEND_DRY_RUN = 'true';
    delete process.env.MAGAZINE_SEND_ALLOWLIST;
    h.authUser = { id: BROKER_COMPLETE, email: 'complete@credeal.test', role: 'broker' };
  });

  it('WP 2-A: email footer includes sender address & email; unsubscribe blocks sendGate & Inbox + writes email_suppressions', async () => {
    const rendered = renderMagazineEmail({
      brokerName: '정완전',
      brokerContact: '02-456-7890',
      senderAddress: '서울특별시 성동구 성수이로 88',
      senderEmail: 'office@credeal.test',
      subscriberName: '김매수',
      edition: {
        title: '성수 브리핑',
        headline: '이번 주 시황',
        marketTemp: '관망',
        date: '2026-11-17',
        url: 'https://www.credeal.net/magazine/complete-broker',
      },
      unsubscribeUrl: 'https://www.credeal.net/api/public/magazine/unsubscribe?t=abc',
      isAd: true,
    });
    expect(rendered.html).toContain('서울특별시 성동구 성수이로 88');
    expect(rendered.html).toContain('office@credeal.test');
    expect(rendered.text).toContain('전자우편 office@credeal.test');

    const cliId = '55555555-5555-4555-8555-555555555501';
    const targetEmail = 'unsub-crm@client.test';
    await execSql(
      `INSERT INTO public.broker_clients (id, broker_id, client_type, display_name, email, tags)
       VALUES ($1, $2, 'buyer', '해지테스트고객', $3, ARRAY['뉴스레터구독'])`,
      [cliId, BROKER_COMPLETE, targetEmail],
    );

    const token = issueUnsubToken({ subscriberId: cliId, brokerId: 'complete-broker' });
    const unsubGetReq = new NextRequest(
      `https://www.credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`,
    );
    const unsubGetRes = await unsubscribeGET(unsubGetReq);
    expect(unsubGetRes.status).toBe(200);

    const unsubReq = new NextRequest(
      `https://www.credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token }) },
    );
    const unsubRes = await unsubscribePOST(unsubReq);
    expect(unsubRes.status).toBe(200);

    const suppCheck = await isEmailSuppressed(h.serviceClient, {
      email: targetEmail,
      brokerId: BROKER_COMPLETE,
      brokerKeys: [BROKER_COMPLETE, 'complete-broker'],
    });
    expect(suppCheck.suppressed).toBe(true);

    // sendGate blocks when suppressed=true
    const gateRes = await sendGate(
      {
        subscriber: {
          id: cliId,
          subscriber_email: targetEmail,
          channel: 'email',
          status: 'active',
          marketing_consent_at: '2026-10-01T00:00:00.000Z',
          confirm_status: 'confirmed',
          suppressed: true,
        },
        channel: 'email',
        editionKey: 'complete-broker:2026-11-17:weekly',
        brokerId: 'complete-broker',
        brokerUserId: BROKER_COMPLETE,
        kind: 'weekly',
        rendered: {
          subject: '(광고) 테스트',
          body: '<p>test</p>',
          hasAdLabel: true,
          hasUnsubscribeLink: true,
          senderName: '정완전',
          senderContact: '02-456-7890',
        },
      },
      { supabase: h.serviceClient as never, now: new Date('2026-11-17T03:00:00.000Z'), dryRun: true },
    );
    expect(gateRes).toMatchObject({ ok: false, blocked: 'UNSUBSCRIBED' });

    // Inbox outbound email to suppressed CRM client is blocked cleanly
    const sendEmailReq = new NextRequest('https://www.credeal.net/api/broker/inbox/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'send_inbox_email',
        assetKind: 'dealcard',
        clientId: `custom_${cliId}`,
        clientName: '해지테스트고객',
        clientEmail: targetEmail,
        buildingId: BLD_COMPLETE,
        buildingTitle: '성수 꼬마빌딩',
      }),
    });
    const sendEmailRes = await actionsPOST(sendEmailReq);
    expect(sendEmailRes.status).toBe(403);
    const sendEmailJson = await sendEmailRes.json();
    expect(sendEmailJson.blockedReason || sendEmailJson.code).toBe('RECIPIENT_UNSUBSCRIBED');
  });

  it('WP 2-B: blocks broker re-subscribe (403), forces pending on import/manual add, notifies 2yr consent, exempts D5 logs', async () => {
    const cliId = '55555555-5555-4555-8555-555555555501';
    const toggleReq = new NextRequest('https://www.credeal.net/api/broker/inbox/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle_newsletter',
        clientId: `custom_${cliId}`,
        clientEmail: 'unsub-crm@client.test',
        subscribed: true,
      }),
    });
    const toggleRes = await actionsPOST(toggleReq);
    expect(toggleRes.status).toBe(403);
    // WP-7.3E P2-11: consistent string `error` with top-level `code`
    const toggleJson = await toggleRes.json();
    expect(toggleJson.code).toBe('RECIPIENT_SELF_OPTIN_REQUIRED');
    expect(typeof toggleJson.error).toBe('string');

    // Manual subscriber add -> confirm_status='pending'
    const manualSubReq = new NextRequest('https://www.credeal.net/api/broker/magazine/subscribers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '신규수동',
        phone: '010-2222-3333',
        email: 'manual-pending@client.test',
        channel: 'both',
        consentAttested: true,
      }),
    });
    const manualSubRes = await subscribersPOST(manualSubReq);
    expect(manualSubRes.status).toBe(201);
    const manualSubJson = await manualSubRes.json();
    expect(manualSubJson.subscriber.confirm_status).toBe('pending');

    // Bulk import -> broker_clients.consent_status='pending' & magazine_subscribers.confirm_status='pending'
    const importReq = new NextRequest('https://www.credeal.net/api/broker/inbox/import-contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        registerAsNewsletterSubscriber: true,
        contacts: [
          {
            name: '엑셀등록',
            phone: '010-4444-5555',
            email: 'excel-pending@client.test',
            marketingConsent: true,
          },
        ],
      }),
    });
    const importRes = await importContactsPOST(importReq);
    expect(importRes.status).toBe(200);
    const subRows = await execSql<{ confirm_status: string; consent_status: string; consent_source: string }>(
      `SELECT confirm_status, consent_status, consent_source FROM public.magazine_subscribers WHERE subscriber_email = $1`,
      ['excel-pending@client.test'],
    );
    expect(subRows[0]).toMatchObject({
      confirm_status: 'pending',
      consent_status: 'pending',
      consent_source: 'bulk_import',
    });

    // Old confirmed subscriber >= 23 months triggers consent-reconfirm-2yr cron notice
    const oldSubId = '66666666-6666-4666-8666-666666666601';
    await execSql(
      `INSERT INTO public.magazine_subscribers (id, broker_id, broker_user_id, subscriber_email, subscriber_name, channel, status, confirm_status, marketing_consent_at)
       VALUES ($1, 'complete-broker', $2, 'old-consent@client.test', '장기구독자', 'email', 'active', 'confirmed', now() - interval '25 months')`,
      [oldSubId, BROKER_COMPLETE],
    );
    const reconfirmReq = new NextRequest('https://www.credeal.net/api/cron/consent-reconfirm-2yr', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const reconfirmRes = await consentReconfirmPOST(reconfirmReq);
    expect(reconfirmRes.status).toBe(200);
    const reconfirmJson = await reconfirmRes.json();
    expect(reconfirmJson.scanned).toBeGreaterThanOrEqual(1);

    // D5 / WP-7.3E P1-10: retention-purge purges PII-bearing call_note_recorded while preserving statutory/governance non-PII events & email_suppressions
    await execSql(
      `INSERT INTO public.activity_events (actor_id, event_type, entity_type, entity_id, metadata, created_at)
       VALUES ($1, 'call_note_recorded', 'client', $1, '{"note":"vip"}', now() - interval '120 days'),
              ($1, 'inbox_thread_archived', 'thread', $1, '{}', now() - interval '120 days'),
              ($1, 'magazine_unsubscribed', 'subscriber', $1, '{}', now() - interval '120 days'),
              ($1, 'email_suppression_recorded', 'email', $1, '{}', now() - interval '120 days'),
              ($1, 'routine_view_event', 'building', $1, '{}', now() - interval '120 days')`,
      [BROKER_COMPLETE],
    );
    await recordEmailSuppression(h.serviceClient, {
      email: 'permanent-bounce@client.test',
      scope: 'global',
      reason: 'hard_bounce',
      source: 'resend_webhook',
    });

    const purgeReq = new NextRequest('https://www.credeal.net/api/cron/retention-purge', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const purgeRes = await retentionPurgePOST(purgeReq);
    expect(purgeRes.status).toBe(200);

    const remainingEvents = await execSql<{ event_type: string }>(
      `SELECT event_type FROM public.activity_events WHERE actor_id = $1 AND created_at < now() - interval '90 days'`,
      [BROKER_COMPLETE],
    );
    const types = remainingEvents.map((e) => e.event_type);
    expect(types).not.toContain('call_note_recorded');
    expect(types).toContain('inbox_thread_archived');
    expect(types).toContain('magazine_unsubscribed');
    expect(types).toContain('email_suppression_recorded');
    expect(types).not.toContain('routine_view_event');

    const suppRows = await execSql<{ email_hash: string }>(
      `SELECT email_hash FROM public.email_suppressions`,
    );
    expect(suppRows.length).toBeGreaterThanOrEqual(2);
  });

  it('WP 2-C: enforces 422 STATUTORY_DISCLOSURE_INCOMPLETE across DealCard, IM, and Magazine; fixes isLicensed & prod block', async () => {
    // Missing office_reg_number -> DealCard publish returns 422
    h.authUser = { id: BROKER_INCOMPLETE, email: 'incomplete@credeal.test', role: 'broker' };
    const failDcRes = await publishDealcardPOST(
      new NextRequest(`https://www.credeal.net/api/broker/dealcards/${BLD_INCOMPLETE}/publish`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: BLD_INCOMPLETE }) },
    );
    expect(failDcRes.status).toBe(422);
    const failDcJson = await failDcRes.json();
    expect(failDcJson.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
    expect(failDcJson.missingFields).toContain('office_reg_number');

    // Missing IM core 5 items -> IM publish gate returns 422
    const failImGate = await assertPublishable({
      supabase: h.serviceClient,
      userId: BROKER_COMPLETE,
      kind: 'im',
      itemPayload: { title: '불완전 IM' },
    });
    expect(failImGate.ok).toBe(false);
    if (!failImGate.ok) {
      expect(failImGate.status).toBe(422);
      expect(failImGate.missingFields).toContain('im.address');
    }

    // Incomplete broker Magazine edition publish & distribute -> 422
    const edId = '77777777-7777-4777-8777-777777777701';
    await execSql(
      `INSERT INTO public.magazine_editions (id, broker_id, broker_user_id, issue_date, edition_type, status, content)
       VALUES ($1, 'incomplete-broker', $2, '2026-11-17', 'weekly', 'draft', '{"format":"simple","field_note":{"comment":"성수동 현장 매물 브리핑 내용입니다. 최소 길이 충족용 텍스트입니다."}}'::jsonb)`,
      [edId, BROKER_INCOMPLETE],
    );
    const failEdRes = await publishEditionPOST(
      new NextRequest(`https://www.credeal.net/api/magazine/editions/${edId}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: edId }) },
    );
    expect(failEdRes.status).toBe(422);
    expect((await failEdRes.json()).error?.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');

    const failDistRes = await distributePOST(
      new NextRequest('https://www.credeal.net/api/broker/magazine/distribute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '주간 리포트' }),
      }),
    );
    expect(failDistRes.status).toBe(422);

    // Complete broker DealCard publish without content -> 422 DEALCARD_EMPTY_CONTENT, with blind card4 -> 200
    h.authUser = { id: BROKER_COMPLETE, email: 'complete@credeal.test', role: 'broker' };
    const emptyDcRes = await publishDealcardPOST(
      new NextRequest(`https://www.credeal.net/api/broker/dealcards/${BLD_COMPLETE}/publish`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: BLD_COMPLETE }) },
    );
    expect(emptyDcRes.status).toBe(422);
    expect((await emptyDcRes.json()).code).toBe('DEALCARD_EMPTY_CONTENT');

    const okDcRes = await publishDealcardPOST(
      new NextRequest(`https://www.credeal.net/api/broker/dealcards/${BLD_COMPLETE}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          card4: {
            headline: '성수동 핵심 상권 코너 근린생활시설',
            region: '성동구 성수동',
            use: '근린생활시설',
            area: '연면적 약 280평',
            priceBand: '90~100억',
            points: ['역세권 도보 4분 거리', '양면 도로 코너 가시성 확보', '우량 임차인 장기 계약 유지'],
          },
        }),
      }),
      { params: Promise.resolve({ id: BLD_COMPLETE }) },
    );
    expect(okDcRes.status).toBe(200);

    // isLicensed defaults to false + production invariant mode defaults to 'block'
    const dto = toPublicDealCard({
      id: BLD_COMPLETE,
      building: { id: BLD_COMPLETE, price_band: '90~100억', layers: {} },
      signalCard: null,
      teaserDoc: null,
      brokerProfile: { display_name: '정완전' },
      hasImDoc: false,
      isPptxApproved: false,
      pptxDownloadUrl: '',
    });
    expect(dto.broker.isLicensed).toBe(false);
    expect(resolveInvariantMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('block');
  });

  it('WP 2-D: enforces single price-band SSOT >= 5% width and 조 unit across formatters', () => {
    expect(formatPriceRange(200_000_000_000)).toBe('2,000~2,200억');
    expect(formatPriceRange(1_200_000_000_000)).toBe('1조 2,000억~1조 3,000억');
    expect(formatKrw(1_000_000_000_000)).toBe('1조');
    expect(parseKoreanPriceKrw('1조 2,000억')).toBe(1_200_000_000_000);
    expect(bandPriceDisplay(2_000_0000, 'range')).toBe('2,000~2,200억');
    expect(formatBlindPriceBandFromManwon(2_000_0000)).toBe('2,000~2,200억');

    expect(validateBlindPriceBand('200억').valid).toBe(false);
    expect(validateBlindPriceBand('2,000~2,050억', 200_000_000_000).valid).toBe(false);
    expect(validateBlindPriceBand('2,000~2,200억', 200_000_000_000).valid).toBe(true);

    const parsedCard = parseMemoIntoCard4('강남구 역삼동 근생빌딩 매매가 2,000억');
    expect(parsedCard.priceBand).toBe('2,000~2,200억');
  });

  it('WP 2-E: enforces privacyConsent=true on PII gate-requests (400) and issues signed HttpOnly verification cookie', async () => {
    const noConsentRes = await gateRequestsPOST(
      new Request('https://www.credeal.net/api/gate-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          buildingId: BLD_COMPLETE,
          requestedLevel: 'G1',
          name: '김매수',
          phone: '010-1234-5678',
          privacyConsent: false,
        }),
      }),
    );
    expect(noConsentRes.status).toBe(400);
    expect((await noConsentRes.json()).error?.code).toBe('PRIVACY_CONSENT_REQUIRED');

    const okRes = await gateRequestsPOST(
      new Request('https://www.credeal.net/api/gate-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          buildingId: BLD_COMPLETE,
          requestedLevel: 'G1',
          name: '김매수',
          phone: '010-1234-5678',
          privacyConsent: true,
        }),
      }),
    );
    expect(okRes.status).toBe(200);
    const setCookie = okRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain('cre_gate_verified=');
    expect(setCookie).toContain('HttpOnly');

    const cookiePair = setCookie.split(';')[0];
    const verifyRes = await gateRequestsGET(
      new Request(`https://www.credeal.net/api/gate-requests?buildingId=${BLD_COMPLETE}`, {
        headers: { cookie: cookiePair },
      }),
    );
    expect(await verifyRes.json()).toEqual({ ok: true, verified: true });
  });
});
