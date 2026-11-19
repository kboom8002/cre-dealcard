/**
 * WP-7.3E — Inbox CRM (소통함) remediation regression suite.
 * Covers P1-1..P1-8, P1-10, P2-1, P2-4..P2-6, P2-8, P2-10, P2-11.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveInboxState } from '@/lib/im-lite/quick-generate-store';

const BROKER_A = '11111111-1111-4111-8111-111111111111';
const BROKER_B = '22222222-2222-4222-8222-222222222222';
const BUILDING_UUID = '55555555-5555-4555-8555-555555555555';
const GATE_ID = '66666666-6666-4666-8666-666666666661';
const INQ_OTHER_ID = '66666666-6666-4666-8666-666666666662';
const CLIENT_CONFIRMED = '77777777-7777-4777-8777-777777777771';
const CLIENT_UNSUB = '77777777-7777-4777-8777-777777777772';
const CLIENT_DELETE = '77777777-7777-4777-8777-777777777773';

type Row = Record<string, any>;
type MockDb = Record<string, Row[]>;

function createEmptyDb(): MockDb {
  return {
    broker_profiles: [],
    profiles: [],
    magazine_subscribers: [],
    magazine_issues: [],
    broker_clients: [],
    email_suppressions: [],
    activity_events: [],
    gate_requests: [],
    im_inquiry_requests: [],
    inquiries: [],
    im_pro_grants: [],
    building_ssot_lite: [],
    buildings: [],
    user_subscriptions: [],
    workspace_items: [],
    im_share_links: [],
    in_app_notifications: [],
    document_objects: [],
  };
}

const h = vi.hoisted(() => ({
  db: null as unknown as Record<string, Array<Record<string, any>>>,
  authUserId: '11111111-1111-4111-8111-111111111111',
  failWrite: null as null | { table: string; ops: string[]; error: { code: string; message: string } },
  suppressionLookupError: null as null | Record<string, unknown>,
}));

function buildMockSupabase() {
  let seq = 1;
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
      let payload: any = null;
      let limitCount: number | null = null;

      const execute = () => {
        const rows = h.db[table];
        if (!rows) {
          return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` }, count: null };
        }
        if (h.failWrite && h.failWrite.table === table && h.failWrite.ops.includes(op)) {
          return { data: null, error: h.failWrite.error, count: null };
        }
        if (table === 'email_suppressions' && op === 'select' && h.suppressionLookupError) {
          return { data: null, error: h.suppressionLookupError, count: null };
        }
        if (op === 'insert' || op === 'upsert') {
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted = items.map((item) => {
            const copy = {
              id: item.id ?? `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`,
              created_at: item.created_at ?? new Date().toISOString(),
              ...item,
            };
            rows.push(copy);
            return copy;
          });
          return { data: inserted, error: null, count: inserted.length };
        }
        if (op === 'update') {
          const matched = rows.filter((r) => filters.every((fn) => fn(r)));
          for (const r of matched) Object.assign(r, payload);
          return { data: matched, error: null, count: matched.length };
        }
        if (op === 'delete') {
          const kept = rows.filter((r) => !filters.every((fn) => fn(r)));
          const removed = rows.length - kept.length;
          rows.splice(0, rows.length, ...kept);
          return { data: [], error: null, count: removed };
        }
        let matched = rows.filter((r) => filters.every((fn) => fn(r)));
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        return { data: matched.map((r) => ({ ...r })), error: null, count: matched.length };
      };

      const chain: any = {
        select() {
          return chain;
        },
        insert(p: any) {
          op = 'insert';
          payload = p;
          return chain;
        },
        upsert(p: any) {
          op = 'upsert';
          payload = p;
          return chain;
        },
        update(p: any) {
          op = 'update';
          payload = p;
          return chain;
        },
        delete() {
          op = 'delete';
          return chain;
        },
        eq(col: string, val: any) {
          filters.push((r) => String(r[col] ?? '') === String(val ?? ''));
          return chain;
        },
        neq(col: string, val: any) {
          filters.push((r) => String(r[col] ?? '') !== String(val ?? ''));
          return chain;
        },
        in(col: string, vals: any[]) {
          const set = new Set((vals || []).map((v) => String(v)));
          filters.push((r) => set.has(String(r[col] ?? '')));
          return chain;
        },
        is(col: string, val: any) {
          filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
          return chain;
        },
        ilike(col: string, val: string) {
          const needle = String(val || '').toLowerCase();
          filters.push((r) => String(r[col] ?? '').toLowerCase() === needle);
          return chain;
        },
        or(expr: string) {
          const parts = expr.split(',').map((s) => s.trim()).filter(Boolean);
          filters.push((r) =>
            parts.some((p) => {
              if (p === 'scope.eq.global') return r.scope === 'global';
              const eqIdx = p.indexOf('.eq.');
              if (eqIdx > 0) {
                const rawCol = p.slice(0, eqIdx);
                const val = p.slice(eqIdx + 4);
                if (rawCol.includes('->>')) {
                  const [objCol, jsonKey] = rawCol.split('->>');
                  const obj = r[objCol];
                  const actual = obj && typeof obj === 'object' ? obj[jsonKey] : undefined;
                  return String(actual ?? '') === val;
                }
                return String(r[rawCol] ?? '') === val;
              }
              return true;
            }),
          );
          return chain;
        },
        order() {
          return chain;
        },
        limit(n: number) {
          limitCount = n;
          return chain;
        },
        range() {
          return chain;
        },
        maybeSingle() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          return Promise.resolve({ data: arr[0] ?? null, error: null });
        },
        single() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          if (arr.length === 0) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: '0 rows' } });
          return Promise.resolve({ data: arr[0], error: null });
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => buildMockSupabase(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => ({
    user: { id: h.authUserId, role: 'broker' },
    role: 'broker',
    error: null,
  })),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(async () => true),
}));

import { checkRateLimit } from '@/lib/rate-limiter';
import { requireBroker } from '@/lib/auth-guard';
import {
  isTrustedInboxUnsubscribeUrl,
  resolveInboxAlimtalkLiveMode,
  sendInboxClientEmail,
  sendInboxTransactionalAlimtalk,
} from '@/domain/inbox/inbox-outbound';
import { verifyUnsubToken } from '@/domain/magazine/unsub-token';
import { isEmailSuppressed, SUPPRESSION_LOOKUP_FAILED } from '@/lib/legal/email-suppression';
import { handleOutboundChannelAction } from '@/lib/inbox/inbox-actions-outbound';
import {
  handleDeleteClientAction,
  handleToggleNewsletterAction,
  handleUpsertClientAction,
} from '@/lib/inbox/inbox-actions-clients';
import { handleSendDealcardOrMagazineAction } from '@/lib/inbox/inbox-actions-leads';
import { hashShareTokenForAudit, toDispatchHistoryEntry } from '@/lib/inbox/inbox-helpers';
import { POST as inboxActionsPOST } from '@/app/api/broker/inbox/actions/route';
import { POST as clientsPOST } from '@/app/api/broker/clients/route';
import { PERMANENT_COMPLIANCE_EVENT_TYPES } from '@/app/api/cron/retention-purge/route';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';

const send = (overrides: Partial<Parameters<typeof handleOutboundChannelAction>[0]> & { body: Record<string, any> }) =>
  handleOutboundChannelAction({
    action: 'send_inbox_email',
    userId: BROKER_A,
    buildingId: BUILDING_UUID,
    threadId: '',
    clientId: '',
    shareToken: '',
    origin: 'https://credeal.net',
    ...overrides,
  });

const postAction = (body: Record<string, unknown>) =>
  inboxActionsPOST(
    new NextRequest('https://credeal.net/api/broker/inbox/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const DAYTIME = new Date('2026-11-17T14:00:00+09:00');
const NIGHT = new Date('2026-11-17T23:30:00+09:00');

describe('WP-7.3E Inbox CRM remediation', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'wave73e-unsub-secret-at-least-32-chars!!');
    vi.stubEnv('SHARE_LINK_SECRET', 'wave73e-share-secret-at-least-32-chars!!');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('INBOX_ALIMTALK_LIVE', '');
    vi.stubEnv('INBOX_ALIMTALK_ALLOWLIST', '');
    h.db = createEmptyDb();
    h.authUserId = BROKER_A;
    h.failWrite = null;
    h.suppressionLookupError = null;
    vi.mocked(checkRateLimit).mockImplementation(async () => true);
    resetShareLinkTokenStoreForTests();
    resetWorkspaceRepositoryCacheForTests();
    saveInboxState({ gateDecisions: {}, revokedBuildings: {}, callNotes: {}, customClients: [], correctionNotices: {} });

    h.db.profiles.push({ id: BROKER_A, display_name: '강남 김대표', company: '강남프라임중개법인', phone: '02-555-1234' });
    h.db.broker_profiles.push({
      user_id: BROKER_A,
      slug: 'gangnam-kim',
      card_name: '강남프라임중개법인',
      office_address: '서울특별시 강남구 테헤란로 100',
      office_reg_number: '11680-2024-00011',
      is_public: true,
    });
    h.db.building_ssot_lite.push({ id: BUILDING_UUID, owner_id: BROKER_A, status: 'published' });
    h.db.gate_requests.push({
      id: GATE_ID,
      building_id: BUILDING_UUID,
      status: 'approved',
      reason: JSON.stringify({ name: '요청고객', email: ' Req@Buyer.KR ', message: 'IM 요청' }),
    });
    h.db.im_inquiry_requests.push({
      id: INQ_OTHER_ID,
      building_id: BUILDING_UUID,
      broker_user_id: BROKER_B,
      requester_email: 'other-inquiry@buyer.kr',
    });
    h.db.broker_clients.push(
      {
        id: CLIENT_CONFIRMED,
        broker_id: BROKER_A,
        display_name: '확정고객',
        email: 'confirmed@buyer.kr',
        tags: ['뉴스레터구독'],
        consent_status: 'confirmed',
      },
      {
        id: CLIENT_UNSUB,
        broker_id: BROKER_A,
        display_name: '해지고객',
        email: 'unsub@buyer.kr',
        tags: ['수신거부'],
        consent_status: 'unsubscribed',
      },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('P1-1 transactional basis bound to the recorded requester email', () => {
    it('sends a transactional reply (no 광고, allowed at night) only to the email recorded on the owned gate row', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NIGHT);
      const res = await send({
        threadId: `srv-${GATE_ID}`,
        body: { clientName: '요청고객', clientEmail: 'req@buyer.kr', transactionalBasis: 'im_request' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.deliveryPurpose).toBe('transactional_reply');
      expect(json.subject).not.toContain('(광고)');
      expect(json.transactionalDowngraded).toBeUndefined();
    });

    it('downgrades to marketing (opt-in required) when the recipient differs from the recorded requester', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const res = await send({
        threadId: `srv-${GATE_ID}`,
        body: { clientName: '제3자', clientEmail: 'attacker@evil.kr', transactionalBasis: 'im_request' },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.blockedReason).toBe('OPT_IN_REQUIRED');
      expect(json.transactionalDowngraded).toBe(true);
      expect(json.error).toContain('일치하지 않아');
      expect(h.db.activity_events.some((e) => e.event_type === 'inbox_email_sent')).toBe(false);
    });

    it('a claimed basis on another broker’s inquiry row is never transactional', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const res = await send({
        threadId: INQ_OTHER_ID,
        body: { clientName: '타사고객', clientEmail: 'other-inquiry@buyer.kr', transactionalBasis: 'property_inquiry' },
      });
      expect(res.status).toBe(403);
      expect((await res.json()).blockedReason).toBe('OPT_IN_REQUIRED');
    });

    it('a downgraded send to a recipient with recorded consent goes out as marketing with (광고) + unsubscribe', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const res = await send({
        threadId: `srv-${GATE_ID}`,
        body: { clientName: '확정고객', clientEmail: 'confirmed@buyer.kr', transactionalBasis: 'im_request' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.deliveryPurpose).toBe('marketing_outreach');
      expect(json.subject.startsWith('(광고) ')).toBe(true);
      expect(json.unsubscribeUrl).toContain('https://credeal.net/api/public/magazine/unsubscribe?t=');
    });
  });

  describe('P1-2 unsubscribe URL is always server-generated', () => {
    it('ignores body.unsubscribeUrl in the inbox action', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const res = await send({
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: {
          clientName: '확정고객',
          clientEmail: 'confirmed@buyer.kr',
          unsubscribeUrl: 'https://evil.example/phish?x=1',
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.unsubscribeUrl).not.toContain('evil.example');
      const token = new URL(json.unsubscribeUrl).searchParams.get('t') || '';
      expect(verifyUnsubToken(token).ok).toBe(true);
    });

    it('domain sender discards an untrusted caller URL and regenerates a signed one', async () => {
      const res = await sendInboxClientEmail({
        toEmail: 'optin@buyer.kr',
        brokerName: '김대표',
        clientName: '고객',
        buildingTitle: '빌딩',
        shareUrl: 'https://credeal.net/magazine/gangnam-kim',
        deliveryPurpose: 'marketing_outreach',
        marketingOptIn: true,
        unsubscribeUrl: 'https://evil.example/api/public/magazine/unsubscribe?t=x\r\nBcc: a@b.c',
        now: DAYTIME,
      });
      expect(res.ok).toBe(true);
      expect(res.unsubscribeUrl).toContain('https://credeal.net/api/public/magazine/unsubscribe?t=');
      expect(res.headers?.['List-Unsubscribe']).not.toContain('evil.example');
      expect(isTrustedInboxUnsubscribeUrl('https://credeal.net/api/public/magazine/unsubscribe?t=abc')).toBe(true);
      expect(isTrustedInboxUnsubscribeUrl('https://evil.example/phish?t=abc')).toBe(false);
      expect(isTrustedInboxUnsubscribeUrl('javascript:alert(1)')).toBe(false);
      expect(isTrustedInboxUnsubscribeUrl('https://credeal.net/api/public/magazine/unsubscribe?t=a&redirect=x')).toBe(false);
    });
  });

  describe('P1-3 self-attested consent never authorizes marketing email', () => {
    it('blocks marketingConsentConfirmed/marketingOptIn/nightSendConsent body flags without a recorded opt-in', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const res = await send({
        threadId: 'custom_cold_1',
        clientId: 'custom_cold_1',
        body: {
          clientName: '콜드고객',
          clientEmail: 'cold@buyer.kr',
          marketingConsentConfirmed: true,
          marketingOptIn: true,
          nightSendConsent: true,
        },
      });
      expect(res.status).toBe(403);
      expect((await res.json()).blockedReason).toBe('OPT_IN_REQUIRED');
    });

    it('allows marketing only when the broker_clients consent is recorded as confirmed, and night consent is not self-attested', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const ok = await send({
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { clientName: '확정고객', clientEmail: 'confirmed@buyer.kr' },
      });
      expect(ok.status).toBe(200);
      expect((await ok.json()).deliveryPurpose).toBe('marketing_outreach');

      vi.setSystemTime(NIGHT);
      const night = await send({
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { clientName: '확정고객', clientEmail: 'confirmed@buyer.kr', nightSendConsent: true },
      });
      expect(night.status).toBe(403);
      expect((await night.json()).blockedReason).toBe('QUIET_HOURS_KST');
    });
  });

  describe('P1-4 / P2-11 newsletter toggle requires double opt-in', () => {
    it('records pending (never confirmed) when no confirmed record exists, and the contact stays un-mailable', async () => {
      const res = await handleToggleNewsletterAction({
        action: 'toggle_newsletter',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: 'custom_newbie_1',
        body: { subscribed: true, clientName: '신규', clientEmail: 'newbie@buyer.kr' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.newsletterSubscribed).toBe(false);
      expect(json.requiresDoubleOptIn).toBe(true);
      expect(json.consentStatus).toBe('pending');
      const ev = h.db.activity_events.find((e) => e.event_type === 'newsletter_subscription_toggled');
      expect(ev?.metadata).toMatchObject({
        consent_status: 'pending',
        newsletter_subscribed: false,
        newsletter_opt_in_pending: true,
      });

      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const sendRes = await send({
        threadId: 'custom_newbie_1',
        clientId: 'custom_newbie_1',
        body: { clientName: '신규', clientEmail: 'newbie@buyer.kr' },
      });
      expect(sendRes.status).toBe(403);
      expect((await sendRes.json()).blockedReason).toBe('OPT_IN_REQUIRED');
    });

    it('records confirmed only when an existing confirmed broker_clients record backs it', async () => {
      const res = await handleToggleNewsletterAction({
        action: 'toggle_newsletter',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { subscribed: true, clientEmail: 'confirmed@buyer.kr' },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).newsletterSubscribed).toBe(true);
      const ev = h.db.activity_events.find((e) => e.event_type === 'newsletter_subscription_toggled');
      expect(ev?.metadata?.consent_status).toBe('confirmed');
    });

    it('returns a string error + top-level code for self-opt-in-required (consistent error shape)', async () => {
      const res = await handleToggleNewsletterAction({
        action: 'toggle_newsletter',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: `custom_${CLIENT_UNSUB}`,
        body: { subscribed: true, clientEmail: 'unsub@buyer.kr' },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe('RECIPIENT_SELF_OPTIN_REQUIRED');
      expect(typeof json.error).toBe('string');
    });
  });

  describe('P1-5 pre-send suppression lookup fails closed (pre-cutover aware)', () => {
    const stub = (suppRes: unknown, clientRows: Row[] = []) => ({
      from(table: string) {
        const q: any = {
          select: () => q,
          eq: () => q,
          then: (f: any, r?: any) => {
            if (table === 'email_suppressions') {
              if (suppRes instanceof Error) return Promise.reject(suppRes).then(f, r);
              return Promise.resolve(suppRes).then(f, r);
            }
            if (table === 'broker_clients') return Promise.resolve({ data: clientRows, error: null }).then(f, r);
            return Promise.resolve({ data: [], error: null }).then(f, r);
          },
        };
        return q;
      },
    });

    it('blocks on unexpected errors (returned or thrown)', async () => {
      const r1 = await isEmailSuppressed(stub({ data: null, error: { code: 'XX000', message: 'connection reset' } }), {
        email: 'a@b.kr',
        brokerId: BROKER_A,
      });
      expect(r1).toEqual({ suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED });
      const r2 = await isEmailSuppressed(stub(new Error('socket hang up')), { email: 'a@b.kr', brokerId: BROKER_A });
      expect(r2).toEqual({ suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED });
    });

    it('falls back to legacy per-row checks for missing-table / empty-body pre-cutover errors', async () => {
      for (const err of [
        { code: '42P01', message: 'relation "email_suppressions" does not exist' },
        { code: 'PGRST205', message: 'Could not find the table' },
        { code: '', message: '' },
      ]) {
        const notSupp = await isEmailSuppressed(stub({ data: null, error: err }), { email: 'a@b.kr', brokerId: BROKER_A });
        expect(notSupp.suppressed).toBe(false);
        const legacy = await isEmailSuppressed(
          stub({ data: null, error: err }, [{ consent_status: 'unsubscribed', tags: [] }]),
          { email: 'a@b.kr', brokerId: BROKER_A },
        );
        expect(legacy).toEqual({ suppressed: true, reason: 'unsubscribe' });
      }
    });

    it('inbox send returns 503 SUPPRESSION_CHECK_UNAVAILABLE when the lookup fails unexpectedly', async () => {
      h.suppressionLookupError = { code: '57014', message: 'statement timeout' };
      const res = await send({
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { clientName: '확정고객', clientEmail: 'confirmed@buyer.kr' },
      });
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('SUPPRESSION_CHECK_UNAVAILABLE');
    });
  });

  describe('P1-6 inbox AlimTalk requires explicit live flag + allowlist (D4)', () => {
    const input = {
      recipientPhone: '010-1234-5678',
      templateId: 'TPL_INBOX_IM_APPROVED' as const,
      brokerName: '김대표',
      clientName: '고객',
      buildingTitle: '빌딩',
      shareUrl: 'https://credeal.net/im-lite/x',
      transactionalBasis: 'im_request' as const,
    };

    beforeEach(() => {
      vi.stubEnv('SOLAPI_API_KEY', 'k');
      vi.stubEnv('SOLAPI_API_SECRET', 's');
      vi.stubEnv('SOLAPI_SENDER_PHONE', '0212345678');
      vi.stubEnv('SOLAPI_PFID', 'pf');
    });

    it('stays an honest dry-run when SOLAPI credentials exist but the live flag is off or the phone is not allowlisted', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const off = await sendInboxTransactionalAlimtalk(input);
      expect(off).toMatchObject({ ok: true, simulated: true, simulatedReason: 'LIVE_FLAG_OFF' });

      vi.stubEnv('INBOX_ALIMTALK_LIVE', '1');
      vi.stubEnv('INBOX_ALIMTALK_ALLOWLIST', '01099998888');
      const notListed = await sendInboxTransactionalAlimtalk(input);
      expect(notListed).toMatchObject({ ok: true, simulated: true, simulatedReason: 'NOT_ALLOWLISTED' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('goes live only with INBOX_ALIMTALK_LIVE=1 and an allowlisted phone', async () => {
      const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ groupId: 'grp-1' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);
      vi.stubEnv('INBOX_ALIMTALK_LIVE', '1');
      vi.stubEnv('INBOX_ALIMTALK_ALLOWLIST', '010-1234-5678');
      expect(resolveInboxAlimtalkLiveMode('01012345678')).toEqual({ live: true, reason: 'LIVE' });
      const live = await sendInboxTransactionalAlimtalk(input);
      expect(live).toMatchObject({ ok: true, simulated: false, messageId: 'grp-1' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('P1-7 client upsert reports persisted honestly', () => {
    it('returns 500 persisted:false when the canonical broker_clients write fails with a non-schema error', async () => {
      h.failWrite = { table: 'broker_clients', ops: ['update'], error: { code: '23514', message: 'check violation' } };
      const res = await handleUpsertClientAction({
        action: 'update_client',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { clientName: '확정고객 수정' },
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toMatchObject({ ok: false, persisted: false });
      expect(h.db.activity_events.some((e) => e.event_type === 'custom_client_upserted')).toBe(false);
    });

    it('reports canonical persistence on success, and an explicit event-only fallback for pre-cutover schema errors', async () => {
      const ok = await handleUpsertClientAction({
        action: 'upsert_client',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: '',
        body: { clientName: '정상등록', clientEmail: 'new@buyer.kr' },
      });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, persisted: true, persistence: 'canonical' });

      delete h.db.broker_clients; // pre-cutover: relation missing (42P01)
      const fb = await handleUpsertClientAction({
        action: 'upsert_client',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: '',
        body: { clientName: '임시등록' },
      });
      expect(fb.status).toBe(200);
      const fbJson = await fb.json();
      expect(fbJson).toMatchObject({ ok: true, persisted: true, persistence: 'activity_event_fallback' });
      expect(typeof fbJson.warning).toBe('string');
    });
  });

  describe('P1-8 / P2-5 inbox actions route', () => {
    it('returns 429 when the per-broker limit is exceeded, with a stricter bucket for send actions', async () => {
      vi.mocked(checkRateLimit).mockImplementation(async (_key: string, bucket: string) => bucket !== 'broker_inbox_send');
      const sendRes = await postAction({
        action: 'send_inbox_email',
        clientId: `custom_${CLIENT_CONFIRMED}`,
        clientEmail: 'confirmed@buyer.kr',
      });
      expect(sendRes.status).toBe(429);
      expect((await sendRes.json()).code).toBe('RATE_LIMITED');

      const noteRes = await postAction({ action: 'add_call_note', threadId: `custom_${CLIENT_CONFIRMED}`, note: '통화함' });
      expect(noteRes.status).not.toBe(429);

      vi.mocked(checkRateLimit).mockImplementation(async () => false);
      const anyRes = await postAction({ action: 'add_call_note', threadId: 'x', note: 'n' });
      expect(anyRes.status).toBe(429);
      expect(vi.mocked(checkRateLimit)).toHaveBeenCalledWith(BROKER_A, 'broker_inbox_actions', expect.any(Number), 60_000);
    });

    it('never leaks raw error messages on 500', async () => {
      vi.mocked(requireBroker).mockImplementationOnce(async () => {
        throw new Error('db password=hunter2 leaked detail');
      });
      const res = await postAction({ action: 'add_call_note', threadId: 'x', note: 'n' });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).not.toContain('hunter2');
      expect(json.error).toContain('소통함 작업 처리 중 오류');
    });
  });

  describe('P1-10 / P2-1 retention exemptions and PII scrub on delete', () => {
    it('keeps statutory + archive events permanent, drops PII-bearing CRM events from the exempt list', () => {
      const list = [...PERMANENT_COMPLIANCE_EVENT_TYPES] as string[];
      expect(list).not.toContain('custom_client_upserted');
      expect(list).not.toContain('call_note_recorded');
      for (const t of [
        'email_complained',
        'thread_link_restored',
        'consent_reconfirm_notified',
        'newsletter_subscription_toggled',
        'email_suppression_recorded',
        'magazine_unsubscribed',
        'inbox_thread_archived',
        'inbox_thread_unarchived',
      ]) {
        expect(list).toContain(t);
      }
    });

    it('scrubs PII from the deleted client’s prior upsert/call-note events but keeps statutory consent events', async () => {
      h.db.broker_clients.push({ id: CLIENT_DELETE, broker_id: BROKER_A, display_name: '삭제고객', email: 'del@buyer.kr' });
      h.db.activity_events.push(
        {
          id: 'ev-upsert',
          actor_id: BROKER_A,
          event_type: 'custom_client_upserted',
          metadata: {
            client_id: `custom_${CLIENT_DELETE}`,
            raw_client_id: CLIENT_DELETE,
            client_name: '삭제고객',
            client_phone: '010-1111-2222',
            client_email: 'del@buyer.kr',
            free_memo: '민감 메모',
          },
        },
        {
          id: 'ev-note',
          actor_id: BROKER_A,
          event_type: 'call_note_recorded',
          entity_id: CLIENT_DELETE,
          metadata: { thread_id: `custom_${CLIENT_DELETE}`, raw_client_id: CLIENT_DELETE, note: '통화 기록: 민감' },
        },
        {
          id: 'ev-toggle',
          actor_id: BROKER_A,
          event_type: 'newsletter_subscription_toggled',
          metadata: { client_id: `custom_${CLIENT_DELETE}`, client_email: 'del@buyer.kr', subscribed: false },
        },
        {
          id: 'ev-other-broker',
          actor_id: BROKER_B,
          event_type: 'custom_client_upserted',
          metadata: { client_id: `custom_${CLIENT_DELETE}`, client_name: '타사' },
        },
      );
      const res = await handleDeleteClientAction({
        action: 'delete_client',
        userId: BROKER_A,
        threadId: '',
        clientId: `custom_${CLIENT_DELETE}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).piiScrubbed).toBe(true);
      const byId = (id: string) => h.db.activity_events.find((e) => e.id === id)!;
      expect(byId('ev-upsert').metadata.client_name).toBeUndefined();
      expect(byId('ev-upsert').metadata.client_email).toBeUndefined();
      expect(byId('ev-upsert').metadata.free_memo).toBeUndefined();
      expect(byId('ev-upsert').metadata.pii_scrubbed_at).toBeTruthy();
      expect(byId('ev-note').metadata.note).toBeUndefined();
      expect(byId('ev-toggle').metadata.client_email).toBe('del@buyer.kr');
      expect(byId('ev-other-broker').metadata.client_name).toBe('타사');
    });
  });

  describe('P2-4 send_magazine reports honestly', () => {
    it('returns sentCount 0 / dispatched false and never labels the link event as a delivered newsletter', async () => {
      const res = await handleSendDealcardOrMagazineAction({
        action: 'send_magazine',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: '',
        body: {},
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, sentCount: 0, dispatched: false, deliveryMode: 'link_share' });
      expect(json.recipientCount).toBe(1); // CLIENT_CONFIRMED is the only eligible recipient
      const ev = h.db.activity_events.find((e) => e.event_type === 'magazine_sent');
      expect(ev?.metadata).toMatchObject({ dispatched: false, sent_count: 0 });
      expect(toDispatchHistoryEntry(ev!).status).toBe('prepared');
    });
  });

  describe('P2-6 / P2-8 / P2-10', () => {
    it('stores only a share-token hash (and a token-free URL) in outbound audit events', async () => {
      const res = await handleOutboundChannelAction({
        action: 'prepare_copy_bundle',
        userId: BROKER_A,
        buildingId: BUILDING_UUID,
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: '',
        shareToken: '',
        origin: 'https://credeal.net',
        body: { clientName: '확정고객' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.shareToken).toBeTruthy();
      const ev = h.db.activity_events.find((e) => e.event_type === 'inbox_outbound_copied');
      expect(ev?.metadata?.share_token).toBeUndefined();
      expect(ev?.metadata?.share_token_hash).toBe(hashShareTokenForAudit(json.shareToken));
      expect(String(ev?.metadata?.share_url)).not.toContain('token=');
      expect(JSON.stringify(ev?.metadata)).not.toContain(json.shareToken);
    });

    it('fails closed for marketing email when UNSUBSCRIBE_SECRET is missing (transactional still allowed)', async () => {
      vi.stubEnv('UNSUBSCRIBE_SECRET', '');
      vi.useFakeTimers();
      vi.setSystemTime(DAYTIME);
      const mkt = await send({
        threadId: `custom_${CLIENT_CONFIRMED}`,
        clientId: `custom_${CLIENT_CONFIRMED}`,
        body: { clientName: '확정고객', clientEmail: 'confirmed@buyer.kr' },
      });
      expect(mkt.status).toBe(503);
      expect((await mkt.json()).blockedReason).toBe('UNSUBSCRIBE_LINK_UNAVAILABLE');

      const tx = await send({
        threadId: `srv-${GATE_ID}`,
        body: { clientName: '요청고객', clientEmail: 'req@buyer.kr' },
      });
      expect(tx.status).toBe(200);
      expect((await tx.json()).deliveryPurpose).toBe('transactional_reply');
    });

    it('caps call notes, correction notices and clients POST strings', async () => {
      const longNote = await postAction({ action: 'add_call_note', threadId: 'custom_x', note: 'a'.repeat(1001) });
      expect(longNote.status).toBe(400);
      const longCorrection = await postAction({
        action: 'correction_notice',
        buildingId: BUILDING_UUID,
        message: '가'.repeat(501),
      });
      expect(longCorrection.status).toBe(400);
      const longName = await clientsPOST(
        new NextRequest('https://credeal.net/api/broker/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_type: 'buyer', display_name: '김'.repeat(101) }),
        }),
      );
      expect(longName.status).toBe(400);
      expect((await longName.json()).error).toContain('100자');
      const badJson = await clientsPOST(
        new NextRequest('https://credeal.net/api/broker/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{not json',
        }),
      );
      expect(badJson.status).toBe(400);
    });
  });
});
