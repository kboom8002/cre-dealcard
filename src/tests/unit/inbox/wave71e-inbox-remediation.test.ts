import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import { saveInboxState } from '@/lib/im-lite/quick-generate-store';

const BROKER_A = '11111111-1111-4111-8111-111111111111';
const BROKER_B = '22222222-2222-4222-8222-222222222222';
const SUB_UUID = '0b8f1c52-6d4e-4f0a-9c1b-2a3d4e5f6a7b';
const CLIENT_UUID_B = '33333333-3333-4333-8333-333333333333';
const CLIENT_UUID_VIP = '44444444-4444-4444-8444-444444444444';
const BUILDING_UUID = '55555555-5555-4555-8555-555555555555';

interface MockDb {
  [key: string]: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  email_suppressions: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  inquiries: Array<Record<string, any>>;
  im_pro_grants: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  user_subscriptions: Array<Record<string, any>>;
  workspace_items: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
}

function createEmptyDb(): MockDb {
  return {
    broker_profiles: [],
    profiles: [],
    magazine_subscribers: [],
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
  db: null as unknown as MockDb,
  authUserId: '11111111-1111-4111-8111-111111111111',
  preCutoverInsertCols: false,
  rejectLegacyBrokerNameCol: true,
}));

function buildMockSupabase() {
  let seq = 1;
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
      let payload: any = null;
      let pendingErr: { code: string; message: string } | null = null;
      let limitCount: number | null = null;
      let rangeStart: number | null = null;
      let rangeEnd: number | null = null;

      const execute = () => {
        if (pendingErr) return { data: null, error: pendingErr, count: null };
        const rows = h.db[table];
        if (!rows) {
          return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` }, count: null };
        }

        if (op === 'insert' || op === 'upsert') {
          const items = Array.isArray(payload) ? payload : [payload];
          if (table === 'broker_clients' && h.preCutoverInsertCols) {
            const forbidden = ['email', 'company', 'consent_status', 'consent_source', 'is_vip', 'client_role'];
            for (const item of items) {
              const bad = forbidden.find((col) => col in item);
              if (bad) {
                return {
                  data: null,
                  error: { code: '42703', message: `column "${bad}" of relation "broker_clients" does not exist` },
                  count: null,
                };
              }
            }
          }
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
        if (rangeStart !== null && rangeEnd !== null) {
          matched = matched.slice(rangeStart, rangeEnd + 1);
        } else if (limitCount !== null) {
          matched = matched.slice(0, limitCount);
        }
        return { data: matched.map((r) => ({ ...r })), error: null, count: matched.length };
      };

      const chain: any = {
        select(cols?: string) {
          if (h.rejectLegacyBrokerNameCol && table === 'broker_profiles' && /\bname\b/.test(String(cols || ''))) {
            pendingErr = { code: '42703', message: 'column broker_profiles.name does not exist' };
          }
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
          filters.push((r) =>
            val === null ? r[col] === null || r[col] === undefined : r[col] === val,
          );
          return chain;
        },
        not(col: string, operator: string, val: any) {
          if (operator === 'is' && val === null) {
            filters.push((r) => r[col] !== null && r[col] !== undefined);
          } else if (operator === 'eq') {
            filters.push((r) => String(r[col] ?? '') !== String(val ?? ''));
          }
          return chain;
        },
        ilike(col: string, val: string) {
          const needle = String(val || '').replace(/\\([%_\\])/g, '$1').toLowerCase();
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
        range(start: number, end: number) {
          rangeStart = start;
          rangeEnd = end;
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
          if (arr.length === 0) {
            return Promise.resolve({ data: null, error: { code: 'PGRST116', message: '0 rows' } });
          }
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

import { buildInboxUnsubscribeUrl } from '@/domain/inbox/inbox-outbound';
import { verifyUnsubToken } from '@/domain/magazine/unsub-token';
import { GET as unsubGET, POST as unsubPOST } from '@/app/api/public/magazine/unsubscribe/route';
import { handleImportContacts } from '@/lib/inbox/inbox-import';
import { appendCrmAndSubscriberThreads } from '@/lib/inbox/inbox-client-threads';
import { handleOutboundChannelAction } from '@/lib/inbox/inbox-actions-outbound';
import { handleSendDealcardOrMagazineAction } from '@/lib/inbox/inbox-actions-leads';
import { verifyBrokerOwnership } from '@/lib/inbox/inbox-ownership';
import { POST as clientsPOST } from '@/app/api/broker/clients/route';
import { PUT as clientDetailPUT } from '@/app/api/broker/clients/[id]/route';
import { POST as shareLinksRevokePOST } from '@/app/api/broker/share-links/revoke/route';
import { POST as inboxActionsPOST } from '@/app/api/broker/inbox/actions/route';
import { POST as imInquiryPOST } from '@/app/api/public/im-inquiry/route';
import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';
import { createGateRequest } from '@/domain/gate/gate-request';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';

describe('Wave 7.1E Inbox CRM P0/P1 Remediation', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'wave71e-unsub-secret-at-least-32-chars!!');
    vi.stubEnv('SHARE_LINK_SECRET', 'wave71e-share-secret-should-not-sign-unsub!!');
    vi.stubEnv('NEXTAUTH_SECRET', 'wave71e-nextauth-secret-should-not-sign-unsub!!');
    vi.stubEnv('RESEND_API_KEY', '');
    h.db = createEmptyDb();
    h.authUserId = BROKER_A;
    h.preCutoverInsertCols = false;
    h.rejectLegacyBrokerNameCol = true;
    resetShareLinkTokenStoreForTests();
    resetWorkspaceRepositoryCacheForTests();
    saveInboxState({
      gateDecisions: {},
      revokedBuildings: {},
      callNotes: {},
      customClients: [],
      correctionNotices: {},
    });

    h.db.profiles.push({
      id: BROKER_A,
      display_name: '강남 김대표',
      company: '강남프라임중개법인',
      phone: '02-555-1234',
    });
    h.db.broker_profiles.push({
      user_id: BROKER_A,
      slug: 'gangnam-kim',
      card_name: '강남프라임중개법인',
      office_address: '서울특별시 강남구 테헤란로 100',
      office_reg_number: '11680-2024-00011',
      is_public: true,
    });
    h.db.building_ssot_lite.push({
      id: BUILDING_UUID,
      owner_id: BROKER_A,
      status: 'published',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('1. buildInboxUnsubscribeUrl (P0-1)', () => {
    it('always signs via issueUnsubToken and uses emh_<64hex> for email-only / non-UUID recipients (never inbox-client)', () => {
      const email = 'Investor@Example.co.kr';
      const expectedHash = hashEmailForSuppression(email);

      for (const subId of [undefined, '', 'inbox-client', 'custom_optin_99', 'cli-cold_1']) {
        const url = buildInboxUnsubscribeUrl({
          origin: 'https://credeal.net',
          brokerId: 'gangnam-kim',
          subscriberId: subId,
          toEmail: email,
        });
        expect(url).toContain('https://credeal.net/api/public/magazine/unsubscribe?t=');
        const token = new URL(url).searchParams.get('t') || '';
        const verified = verifyUnsubToken(token);
        expect(verified).toEqual({
          ok: true,
          subscriberId: `emh_${expectedHash}`,
          brokerId: 'gangnam-kim',
        });
      }

      // Valid UUID and sub_ IDs are preserved
      const uuidUrl = buildInboxUnsubscribeUrl({
        origin: 'https://credeal.net',
        brokerId: BROKER_A,
        subscriberId: SUB_UUID,
        toEmail: email,
      });
      const uuidTok = new URL(uuidUrl).searchParams.get('t') || '';
      expect(verifyUnsubToken(uuidTok)).toEqual({
        ok: true,
        subscriberId: SUB_UUID,
        brokerId: BROKER_A,
      });
    });

    it('fails closed (returns empty string) when UNSUBSCRIBE_SECRET is missing — never falls back to SHARE_LINK_SECRET', () => {
      vi.stubEnv('UNSUBSCRIBE_SECRET', '');
      const url = buildInboxUnsubscribeUrl({
        origin: 'https://credeal.net',
        brokerId: 'gangnam-kim',
        subscriberId: SUB_UUID,
        toEmail: 'buyer@credeal.net',
      });
      expect(url).toBe('');
    });
  });

  describe('2. /api/public/magazine/unsubscribe emh_<64hex> & card_name (P0-1)', () => {
    it('GET and POST with emh_<64hex> return 200 OK, use broker_profiles.card_name (no 42703), record hash suppression, and sync matching rows', async () => {
      const targetEmail = 'cold-prospect@corp.kr';
      const emailHash = hashEmailForSuppression(targetEmail);

      h.db.magazine_subscribers.push({
        id: SUB_UUID,
        broker_id: 'gangnam-kim',
        subscriber_email: targetEmail,
        status: 'active',
        confirm_status: 'confirmed',
      });
      h.db.broker_clients.push({
        id: CLIENT_UUID_VIP,
        broker_id: BROKER_A,
        display_name: '김잠재',
        email: targetEmail,
        tags: ['뉴스레터구독', '수신동의'],
        consent_status: 'confirmed',
      });

      const unsubUrl = buildInboxUnsubscribeUrl({
        origin: 'https://credeal.net',
        brokerId: 'gangnam-kim',
        toEmail: targetEmail,
      });
      const token = new URL(unsubUrl).searchParams.get('t') || '';

      // GET confirmation page -> 200 OK with card_name brand (zero 42703)
      const getRes = await unsubGET(new Request(unsubUrl));
      expect(getRes.status).toBe(200);
      const getHtml = await getRes.text();
      expect(getHtml).toContain('강남프라임중개법인 매거진');
      expect(getHtml).toContain('수신 거부하기');

      // POST One-Click / JSON -> 200 OK & records hash suppression + updates subscriber/client
      const postRes = await unsubPOST(
        new Request(`https://credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        }),
      );
      expect(postRes.status).toBe(200);
      expect(await postRes.text()).toContain('수신 거부가 완료되었습니다');

      expect(h.db.email_suppressions).toHaveLength(1);
      expect(h.db.email_suppressions[0]).toMatchObject({
        email_hash: emailHash,
        broker_id: BROKER_A,
        scope: 'broker',
        reason: 'unsubscribe',
        source: 'one_click_inbox',
      });
      expect(h.db.magazine_subscribers[0].status).toBe('unsubscribed');
      expect(h.db.broker_clients[0].consent_status).toBe('unsubscribed');
      expect(h.db.broker_clients[0].tags).toContain('수신거부');
      expect(h.db.broker_clients[0].tags).not.toContain('뉴스레터구독');

      // Subsequent GET reflects already-unsubscribed state via email_suppressions
      const getAfter = await unsubGET(new Request(unsubUrl));
      expect(getAfter.status).toBe(200);
      expect(await getAfter.text()).toContain('이미 수신 거부가 완료된 상태입니다');
    });

    it('POST with emh_<64hex> and unresolved broker records global suppression and returns 200 JSON', async () => {
      const targetEmail = 'global-optout@corp.kr';
      const emailHash = hashEmailForSuppression(targetEmail);
      const unsubUrl = buildInboxUnsubscribeUrl({
        origin: 'https://credeal.net',
        brokerId: null,
        toEmail: targetEmail,
      });
      const token = new URL(unsubUrl).searchParams.get('t') || '';

      const postRes = await unsubPOST(
        new Request('https://credeal.net/api/public/magazine/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ t: token }),
        }),
      );
      expect(postRes.status).toBe(200);
      expect(await postRes.json()).toEqual({ ok: true });
      expect(h.db.email_suppressions).toHaveLength(1);
      expect(h.db.email_suppressions[0]).toMatchObject({
        email_hash: emailHash,
        broker_id: null,
        scope: 'global',
        reason: 'unsubscribe',
        source: 'one_click_inbox',
      });
    });
  });

  describe('3. Pending bulk import tag isolation & pre-cutover fallback (P0-2)', () => {
    it('writes 수신확인대기 (never 수신동의 or 뉴스레터구독) for pending double opt-in rows and blocks outbound email until confirmed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-17T14:00:00+09:00'));

      const importRes = await handleImportContacts(
        new NextRequest('https://credeal.net/api/broker/inbox/import-contacts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            registerAsNewsletterSubscriber: true,
            contacts: [
              {
                name: '박대기',
                phone: '010-5555-6666',
                email: 'pending-doi@buyer.kr',
                clientRole: 'buyer',
                isVip: true,
                marketingConsent: true,
              },
            ],
          }),
        }),
      );
      expect(importRes.status).toBe(200);
      const importJson = await importRes.json();
      expect(importJson.importedCount).toBe(1);

      expect(h.db.broker_clients).toHaveLength(1);
      const importedRow = h.db.broker_clients[0];
      expect(importedRow.consent_status).toBe('pending');
      expect(importedRow.tags).toContain('수신확인대기');
      expect(importedRow.tags).not.toContain('수신동의');
      expect(importedRow.tags).not.toContain('뉴스레터구독');

      // Even if a legacy row has 수신동의 tag while consent_status is pending, outbound email & magazine broadcast must NOT honor it
      importedRow.tags = ['수신동의', '뉴스레터구독'];
      const outboundRes = await handleOutboundChannelAction({
        action: 'send_inbox_email',
        userId: BROKER_A,
        buildingId: BUILDING_UUID,
        threadId: `custom_${importedRow.id}`,
        clientId: `custom_${importedRow.id}`,
        shareToken: '',
        origin: 'https://credeal.net',
        body: {
          clientName: '박대기',
          clientEmail: 'pending-doi@buyer.kr',
        },
      });
      expect(outboundRes.status).toBe(403);
      expect((await outboundRes.json()).blockedReason).toBe('OPT_IN_REQUIRED');

      const magRes = await handleSendDealcardOrMagazineAction({
        action: 'send_magazine',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: '',
        body: {},
      });
      expect(magRes.status).toBe(200);
      expect((await magRes.json()).recipientCount).toBe(0);
    });

    it('strips email, company, consent_status, consent_source, is_vip, client_role in pre-cutover 42703 insert fallback', async () => {
      h.preCutoverInsertCols = true;

      const importRes = await handleImportContacts(
        new NextRequest('https://credeal.net/api/broker/inbox/import-contacts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            registerAsNewsletterSubscriber: false,
            contacts: [
              {
                name: '최구버전',
                phone: '010-7777-8888',
                email: 'legacy@buyer.kr',
                company: '구버전자산',
                clientRole: 'seller',
                isVip: true,
                marketingConsent: true,
              },
            ],
          }),
        }),
      );
      expect(importRes.status).toBe(200);
      const json = await importRes.json();
      expect(json.importedCount).toBe(1);
      expect(h.db.broker_clients).toHaveLength(1);
      expect(h.db.broker_clients[0]).not.toHaveProperty('consent_status');
      expect(h.db.broker_clients[0]).not.toHaveProperty('consent_source');
      expect(h.db.broker_clients[0]).not.toHaveProperty('is_vip');
      expect(h.db.broker_clients[0]).not.toHaveProperty('client_role');
      expect(h.db.broker_clients[0]).not.toHaveProperty('email');
      expect(h.db.broker_clients[0]).not.toHaveProperty('company');
      expect(h.db.broker_clients[0].tags).toContain('수신확인대기');
    });
  });

  describe('4. VIP/Seller reconciliation & IDOR ownership checks (P1-1, P1-4)', () => {
    it('inbox-client-threads preserves VIP/seller created with tier=vip and client_type=seller even when DB defaults is_vip=false and client_role=buyer', () => {
      const threads: any[] = [];
      appendCrmAndSubscriberThreads({
        threads,
        seenThreadIds: new Set(),
        viewItems: [],
        callNotesByThreadId: new Map(),
        revokedByThreadId: new Map(),
        issuedTokenByThreadId: new Map(),
        decisionByThreadId: new Map(),
        newsletterStateByKey: new Map(),
        shareLinks: [],
        allOwnedBuildingIds: [],
        inboxState: {
          revokedBuildings: {},
          callNotes: {},
          correctionNotices: {},
        },
        deletedBuildingSet: new Set(),
        forbiddenBuildingSet: new Set(),
        buildingTitleById: new Map(),
        isThreadArchived: () => false,
        userId: BROKER_A,
        dbClients: [
          {
            id: CLIENT_UUID_VIP,
            broker_id: BROKER_A,
            display_name: '이매도 회장',
            phone: '010-9999-1111',
            tier: 'vip',
            is_vip: false,
            client_type: 'seller',
            client_role: 'buyer',
            tags: [],
            consent_status: 'unconfirmed',
            created_at: '2026-11-17T01:00:00.000Z',
          },
        ],
        subscriberRows: [],
        memCustomClients: [],
        deletedClientIdSet: new Set(),
        quickInventory: [],
      });

      expect(threads).toHaveLength(1);
      expect(threads[0].isVip).toBe(true);
      expect(threads[0].clientGrade).toBe('VIP');
      expect(threads[0].clientRole).toBe('seller');
    });

    it('rejects falsy subRow.broker_id and blocks cross-tenant bare-UUID threadId in verifyBrokerOwnership', async () => {
      const ORPHAN_SUB = '66666666-6666-4666-8666-666666666666';
      h.db.magazine_subscribers.push({ id: ORPHAN_SUB, broker_id: null, status: 'active' });
      h.db.broker_clients.push({ id: CLIENT_UUID_B, broker_id: BROKER_B, display_name: '타사고객' });

      const subRes = await verifyBrokerOwnership({
        userId: BROKER_A,
        isAdmin: false,
        buildingId: '',
        threadId: `sub_${ORPHAN_SUB}`,
        clientId: `sub_${ORPHAN_SUB}`,
      });
      expect(subRes.allowed).toBe(false);
      expect(subRes.status).toBe(403);

      const cliRes = await verifyBrokerOwnership({
        userId: BROKER_A,
        isAdmin: false,
        buildingId: '',
        threadId: CLIENT_UUID_B,
        clientId: '',
        action: 'toggle_newsletter',
      });
      expect(cliRes.allowed).toBe(false);
      expect(cliRes.status).toBe(403);
    });

    it('POST /api/broker/clients syncs is_vip, client_role, and consent_status=unconfirmed with 42703 fallback', async () => {
      const res = await clientsPOST(
        new NextRequest('https://credeal.net/api/broker/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_type: 'seller',
            display_name: '신규VIP매도자',
            tier: 'vip',
            email: 'VIP-Seller@Example.KR',
          }),
        }),
      );
      expect(res.status).toBe(201);
      const created = (await res.json()).data;
      expect(created).toMatchObject({
        is_vip: true,
        client_role: 'seller',
        consent_status: 'unconfirmed',
        email: 'vip-seller@example.kr',
      });

      // Pre-cutover DB fallback
      h.preCutoverInsertCols = true;
      h.db.broker_clients = [];
      const fallbackRes = await clientsPOST(
        new NextRequest('https://credeal.net/api/broker/clients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_type: 'seller',
            display_name: '구스키마고객',
            tier: 'vip',
          }),
        }),
      );
      expect(fallbackRes.status).toBe(201);
    });
  });

  describe('5. Wave 7.2E Cross-Tenant Share-Link Revoke IDOR & Double Opt-In & Public Inquiry Hardening', () => {
    it('[P0-1] rejects non-owner broker (403) when gate_requests.target_broker_id IS NULL, fails closed on null building, and returns 404 on unknown UUID', async () => {
      const GR_NULL_TARGET = '77777777-7777-4777-8777-777777777771';
      const GR_ORPHAN_NULL = '77777777-7777-4777-8777-777777777772';
      const UNKNOWN_GR_UUID = '77777777-7777-4777-8777-777777777773';
      const BUILDING_B = '55555555-5555-4555-8555-555555555559';

      h.db.building_ssot_lite.push({
        id: BUILDING_B,
        owner_id: BROKER_B,
        status: 'published',
      });
      h.db.gate_requests.push(
        {
          id: GR_NULL_TARGET,
          building_id: BUILDING_UUID,
          target_broker_id: null,
          status: 'approved',
        },
        {
          id: GR_ORPHAN_NULL,
          building_id: null,
          target_broker_id: null,
          status: 'approved',
        },
      );

      // Attacker Broker B tries to revoke Broker A's gate_request (target_broker_id IS NULL) without passing buildingId
      h.authUserId = BROKER_B;
      const crossRes = await shareLinksRevokePOST(
        new NextRequest('https://credeal.net/api/broker/share-links/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'thread',
            gateRequestId: GR_NULL_TARGET,
            threadId: GR_NULL_TARGET,
          }),
        }),
      );
      expect(crossRes.status).toBe(403);
      expect(h.db.gate_requests.find((g) => g.id === GR_NULL_TARGET)?.status).toBe('approved');

      // Attacker Broker B tries passing their own BUILDING_B alongside Broker A's GR_NULL_TARGET
      const bypassRes = await shareLinksRevokePOST(
        new NextRequest('https://credeal.net/api/broker/share-links/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'thread',
            gateRequestId: GR_NULL_TARGET,
            buildingId: BUILDING_B,
          }),
        }),
      );
      expect(bypassRes.status).toBe(403);
      expect(h.db.gate_requests.find((g) => g.id === GR_NULL_TARGET)?.status).toBe('approved');

      // gate_request with null target_broker_id AND null building_id fails closed with 403
      h.authUserId = BROKER_A;
      const orphanRes = await shareLinksRevokePOST(
        new NextRequest('https://credeal.net/api/broker/share-links/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'thread',
            gateRequestId: GR_ORPHAN_NULL,
          }),
        }),
      );
      expect(orphanRes.status).toBe(403);
      expect(h.db.gate_requests.find((g) => g.id === GR_ORPHAN_NULL)?.status).toBe('approved');

      // Unknown UUID that matches neither gate_requests, im_inquiry_requests, im_share_links, nor owned buildingId -> 404 (zero blind audit log)
      const unknownRes = await shareLinksRevokePOST(
        new NextRequest('https://credeal.net/api/broker/share-links/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'thread',
            gateRequestId: UNKNOWN_GR_UUID,
          }),
        }),
      );
      expect(unknownRes.status).toBe(404);
      expect(h.db.activity_events.filter((e) => e.event_type === 'thread_link_revoked')).toHaveLength(0);

      // Legitimate owner Broker A revokes GR_NULL_TARGET -> 200 and gate_requests updated
      const ownerRes = await shareLinksRevokePOST(
        new NextRequest('https://credeal.net/api/broker/share-links/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scope: 'thread',
            gateRequestId: GR_NULL_TARGET,
            threadId: GR_NULL_TARGET,
          }),
        }),
      );
      expect(ownerRes.status).toBe(200);
      expect(h.db.gate_requests.find((g) => g.id === GR_NULL_TARGET)?.status).toBe('revoked');

      // createGateRequest populates target_broker_id from building owner
      const createdGate = await createGateRequest(
        {
          buildingId: BUILDING_UUID,
          requestedLevel: 'G2',
          requestedFields: ['rent_roll'],
          reason: '상세 렌트롤 요청',
        },
        null,
      );
      const insertedGate = h.db.gate_requests.find((g) => g.id === createdGate.gateRequestId);
      expect(insertedGate?.target_broker_id).toBe(BROKER_A);
    });

    it('[P0-2] enforces double opt-in across upsert_client, toggle_newsletter, checkEmailDeliveryEligibility, send_magazine & thread hydration', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-17T14:00:00+09:00'));

      // 1) upsert_client with newsletterSubscribed: true leaves consent_status='pending', omits 뉴스레터구독, adds 수신확인대기
      const upsertRes = await inboxActionsPOST(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert_client',
            clientName: '박미확정',
            clientPhone: '010-4040-5050',
            clientEmail: 'pending-upsert@buyer.kr',
            newsletterSubscribed: true,
            marketingConsentConfirmed: true,
          }),
        }),
      );
      expect(upsertRes.status).toBe(200);
      const upsertJson = await upsertRes.json();
      expect(upsertJson.client.newsletterSubscribed).toBe(false);
      expect(upsertJson.client.newsletterOptInPending).toBe(true);

      const cliRow = h.db.broker_clients.find((c) => c.email === 'pending-upsert@buyer.kr');
      expect(cliRow).toBeDefined();
      expect(cliRow?.consent_status).toBe('pending');
      expect(cliRow?.tags).toContain('수신확인대기');
      expect(cliRow?.tags).not.toContain('뉴스레터구독');
      expect(cliRow?.tags).not.toContain('수신동의');

      const upsertEv = h.db.activity_events.find((e) => e.event_type === 'custom_client_upserted');
      expect(upsertEv?.metadata?.newsletter_subscribed).toBe(false);
      expect(upsertEv?.metadata?.newsletter_opt_in_pending).toBe(true);
      expect(upsertEv?.metadata?.consent_status).toBe('pending');

      // 2) WP-7.4E P1-1: toggle_newsletter on a pending (non-unsubscribed) CRM contact triggers DOI confirmation (200 optInPending: true, newsletterSubscribed: false)
      const toggleCliRes = await inboxActionsPOST(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'toggle_newsletter',
            clientId: `custom_${cliRow!.id}`,
            clientEmail: 'pending-upsert@buyer.kr',
            subscribed: true,
          }),
        }),
      );
      expect(toggleCliRes.status).toBe(200);
      const toggleCliJson = await toggleCliRes.json();
      expect(toggleCliJson.ok).toBe(true);
      expect(toggleCliJson.optInPending).toBe(true);
      expect(toggleCliJson.newsletterSubscribed).toBe(false);

      // 3) WP-7.4E P1-1: toggle_newsletter on pending/null confirm_status subscriber also triggers DOI confirmation while keeping newsletterSubscribed === false
      const PENDING_SUB_ID = '88888888-8888-4888-8888-888888888881';
      const NULL_CONFIRM_SUB_ID = '88888888-8888-4888-8888-888888888882';
      h.db.magazine_subscribers.push(
        {
          id: PENDING_SUB_ID,
          broker_id: 'gangnam-kim',
          subscriber_email: 'sub-pending@buyer.kr',
          status: 'active',
          confirm_status: 'pending',
          created_at: '2026-11-17T01:00:00.000Z',
        },
        {
          id: NULL_CONFIRM_SUB_ID,
          broker_id: 'gangnam-kim',
          subscriber_email: 'sub-null-confirm@buyer.kr',
          status: 'active',
          confirm_status: null,
          created_at: '2026-11-17T01:00:00.000Z',
        },
      );

      for (const [sid, email] of [
        [PENDING_SUB_ID, 'sub-pending@buyer.kr'],
        [NULL_CONFIRM_SUB_ID, 'sub-null-confirm@buyer.kr'],
      ] as const) {
        const toggleSubRes = await inboxActionsPOST(
          new NextRequest('https://credeal.net/api/broker/inbox/actions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'toggle_newsletter',
              clientId: `sub_${sid}`,
              clientEmail: email,
              subscribed: true,
            }),
          }),
        );
        expect(toggleSubRes.status).toBe(200);
        const toggleSubJson = await toggleSubRes.json();
        expect(toggleSubJson.ok).toBe(true);
        expect(toggleSubJson.optInPending).toBe(true);
        expect(toggleSubJson.newsletterSubscribed).toBe(false);
      }

      // 4) checkEmailDeliveryEligibility blocks marketing send when confirm_status is null or pending (and even if marketingConsentConfirmed: true on pending CRM row)
      for (const [tid, email] of [
        [`sub_${PENDING_SUB_ID}`, 'sub-pending@buyer.kr'],
        [`sub_${NULL_CONFIRM_SUB_ID}`, 'sub-null-confirm@buyer.kr'],
      ] as const) {
        const sendBlockedSub = await handleOutboundChannelAction({
          action: 'send_inbox_email',
          userId: BROKER_A,
          buildingId: BUILDING_UUID,
          threadId: tid,
          clientId: tid,
          shareToken: '',
          origin: 'https://credeal.net',
          body: {
            clientName: '미확인구독자',
            clientEmail: email,
          },
        });
        expect(sendBlockedSub.status).toBe(403);
        expect((await sendBlockedSub.json()).blockedReason).toBe('OPT_IN_REQUIRED');
      }

      const sendBlockedCrm = await handleOutboundChannelAction({
        action: 'send_inbox_email',
        userId: BROKER_A,
        buildingId: BUILDING_UUID,
        threadId: `custom_${cliRow!.id}`,
        clientId: `custom_${cliRow!.id}`,
        shareToken: '',
        origin: 'https://credeal.net',
        body: {
          clientName: '박미확정',
          clientEmail: 'pending-upsert@buyer.kr',
          marketingConsentConfirmed: true,
        },
      });
      expect(sendBlockedCrm.status).toBe(403);
      expect((await sendBlockedCrm.json()).blockedReason).toBe('OPT_IN_REQUIRED');

      // 5) Even if a legacy event logged subscribed: true, pending DB consent_status keeps send_magazine & thread hydration unsubscribed
      h.db.activity_events.push({
        id: 'ev-legacy-override-attempt',
        actor_id: BROKER_A,
        event_type: 'newsletter_subscription_toggled',
        entity_type: 'building',
        entity_id: BROKER_A,
        metadata: {
          client_id: `custom_${cliRow!.id}`,
          raw_client_id: cliRow!.id,
          client_email: 'pending-upsert@buyer.kr',
          subscribed: true,
          newsletter_subscribed: true,
        },
        created_at: '2026-11-17T06:00:00.000Z',
      });

      const magRes = await handleSendDealcardOrMagazineAction({
        action: 'send_magazine',
        userId: BROKER_A,
        buildingId: '',
        threadId: '',
        clientId: '',
        body: {},
      });
      expect(magRes.status).toBe(200);
      expect((await magRes.json()).recipientCount).toBe(0);

      const threads: any[] = [];
      const nlMap = new Map<string, { subscribed: boolean; createdAtMs: number }>([
        [`custom_${cliRow!.id}`, { subscribed: true, createdAtMs: Date.now() + 10_000 }],
        [`sub_${PENDING_SUB_ID}`, { subscribed: true, createdAtMs: Date.now() + 10_000 }],
      ]);
      appendCrmAndSubscriberThreads({
        threads,
        seenThreadIds: new Set(),
        viewItems: [],
        callNotesByThreadId: new Map(),
        revokedByThreadId: new Map(),
        issuedTokenByThreadId: new Map(),
        decisionByThreadId: new Map(),
        newsletterStateByKey: nlMap,
        shareLinks: [],
        allOwnedBuildingIds: [],
        inboxState: { revokedBuildings: {}, callNotes: {}, correctionNotices: {} },
        deletedBuildingSet: new Set(),
        forbiddenBuildingSet: new Set(),
        buildingTitleById: new Map(),
        isThreadArchived: () => false,
        userId: BROKER_A,
        dbClients: h.db.broker_clients,
        subscriberRows: h.db.magazine_subscribers,
        memCustomClients: [],
        deletedClientIdSet: new Set(),
        quickInventory: [],
      });
      expect(threads.find((t) => t.id === `custom_${cliRow!.id}`)?.newsletterSubscribed).toBe(false);
      expect(threads.find((t) => t.id === `sub_${PENDING_SUB_ID}`)?.newsletterSubscribed).toBe(false);
    });

    it('[P1-1] POST /api/public/im-inquiry resolves workspace_items UUIDs and returns 404 on unknown non-UUID buildingId with spoofed broker_user_id', async () => {
      const WS_PUB_UUID = '99999999-9999-4999-8999-999999999991';
      h.db.workspace_items.push({
        id: WS_PUB_UUID,
        owner_id: BROKER_B,
        kind: 'im',
        legacy_id: null,
        building_id: null,
        status: 'published',
        title: '삼성동 워크스페이스 빌딩',
        address: '서울시 강남구 삼성동',
        price_band: '180억',
        draft_payload: {},
        published_snapshot: { title: '삼성동 워크스페이스 빌딩' },
        version: 1,
        revoked_at: null,
        deleted_at: null,
        created_at: '2026-11-17T00:00:00.000Z',
        updated_at: '2026-11-17T00:00:00.000Z',
      });

      // 1) Published workspace_items UUID resolves real owner BROKER_B (overriding spoofed BROKER_A)
      const wsRes = await imInquiryPOST(
        new NextRequest('https://credeal.net/api/public/im-inquiry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            building_id: WS_PUB_UUID,
            broker_user_id: BROKER_A, // spoofed!
            requester_name: '김문의',
            requester_phone: '010-1234-5678',
            privacy_agreed: true,
          }),
        }),
      );
      expect(wsRes.status).toBe(200);
      expect(h.db.im_inquiry_requests).toHaveLength(1);
      expect(h.db.im_inquiry_requests[0].broker_user_id).toBe(BROKER_B);

      // 2) Unknown non-UUID buildingId with spoofed broker_user_id MUST return 404 (never trust body.broker_user_id)
      const unknownRes = await imInquiryPOST(
        new NextRequest('https://credeal.net/api/public/im-inquiry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            building_id: 'non-existent-slug-999',
            broker_user_id: BROKER_B,
            requester_name: '위조시도자',
            requester_phone: '010-9876-5432',
            privacy_agreed: true,
          }),
        }),
      );
      expect(unknownRes.status).toBe(404);
      expect(h.db.im_inquiry_requests).toHaveLength(1);
    });

    it('[P1-2, P1-3, P2-1] hardens clients/[id] PUT, resend webhook ilike/consent_status, and malformed JSON (400)', async () => {
      // 1) PUT /api/broker/clients/[id] normalizes email, syncs is_vip/client_role, strips 뉴스레터구독/수신동의 unless confirmed, preserves 수신거부
      h.db.broker_clients.push({
        id: CLIENT_UUID_VIP,
        broker_id: BROKER_A,
        display_name: '박수신거부',
        client_type: 'buyer',
        tier: 'normal',
        is_vip: false,
        client_role: 'buyer',
        email: 'old@example.kr',
        tags: ['수신거부'],
        consent_status: 'unsubscribed',
      });

      const putRes = await clientDetailPUT(
        new NextRequest(`https://credeal.net/api/broker/clients/${CLIENT_UUID_VIP}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: '  Upper.Case@Example.KR ',
            tier: 'vip',
            client_type: 'seller',
            tags: ['뉴스레터구독', '수신동의', '강남권'],
          }),
        }),
        { params: Promise.resolve({ id: CLIENT_UUID_VIP }) },
      );
      expect(putRes.status).toBe(200);
      const putJson = await putRes.json();
      expect(putJson.data).toMatchObject({
        email: 'upper.case@example.kr',
        is_vip: true,
        client_role: 'seller',
      });
      expect(putJson.data.tags).toContain('강남권');
      expect(putJson.data.tags).toContain('수신거부');
      expect(putJson.data.tags).not.toContain('뉴스레터구독');
      expect(putJson.data.tags).not.toContain('수신동의');

      // 2) Resend webhook handles case-insensitive email match and writes consent_status='unsubscribed' on email.complained
      const rawBytes = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
      const secret = `whsec_${rawBytes.toString('base64')}`;
      vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);

      const CASE_SUB_UUID = 'aaaaaaaa-1111-4111-8111-111111111111';
      h.db.magazine_subscribers.push({
        id: CASE_SUB_UUID,
        broker_id: 'gangnam-kim',
        subscriber_email: 'MixedCase@Corp.KR',
        status: 'active',
        confirm_status: 'confirmed',
        consent_status: 'confirmed',
      });

      const svixId = 'msg_wave72e_complain_case';
      const ts = String(Math.floor(Date.now() / 1000));
      const webhookBody = JSON.stringify({
        type: 'email.complained',
        created_at: '2026-11-17T10:00:00.000Z',
        data: { to: ['mixedcase@corp.kr'] },
      });
      const sig = crypto
        .createHmac('sha256', rawBytes)
        .update(`${svixId}.${ts}.${webhookBody}`, 'utf8')
        .digest('base64');

      const webhookRes = await resendWebhookPOST(
        new NextRequest('https://credeal.net/api/webhooks/resend', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'svix-id': svixId,
            'svix-timestamp': ts,
            'svix-signature': `v1,${sig}`,
          },
          body: webhookBody,
        }),
      );
      expect(webhookRes.status).toBe(200);
      expect(h.db.magazine_subscribers[0]).toMatchObject({
        status: 'unsubscribed',
        consent_status: 'unsubscribed',
        email_delivery_status: 'complained',
      });

      // 3) Malformed JSON to POST /api/broker/inbox/actions -> 400 (never 500)
      const badJsonRes = await inboxActionsPOST(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{not-valid-json',
        }),
      );
      expect(badJsonRes.status).toBe(400);
    });
  });
});
