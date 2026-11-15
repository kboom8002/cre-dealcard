import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResendSend = vi.fn();
const mockRequireBroker = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: (...args: unknown[]) => mockResendSend(...args),
    };
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

import {
  issueShareLinkToken,
  isBuildingShareLinkRevoked,
  resetShareLinkTokenStoreForTests,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import { saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { GET as getInbox } from '@/app/api/broker/inbox/route';
import { POST as postInboxActions } from '@/app/api/broker/inbox/actions/route';
import { POST as postShareLinkRevoke } from '@/app/api/broker/share-links/revoke/route';
import { POST as postResendWebhook } from '@/app/api/webhooks/resend/route';

const BROKER_ID = '11111111-2222-4333-8444-555555555555';
const BUILDING_ID = '22222222-3333-4444-8555-666666666666';
const GATE_BUYER_1 = '33333333-4444-4555-8666-777777777771';
const GATE_BUYER_2 = '33333333-4444-4555-8666-777777777772';
const SUB_ID_1 = '44444444-5555-4666-8777-888888888881';
const CLIENT_UUID_1 = '55555555-6666-4777-8888-999999999991';
const CLIENT_UUID_SELLER = '55555555-6666-4777-8888-999999999992';

const TEST_WEBHOOK_RAW_BYTES = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
const TEST_WEBHOOK_SECRET = `whsec_${TEST_WEBHOOK_RAW_BYTES.toString('base64')}`;

interface MockDb {
  [key: string]: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  user_subscriptions: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  inquiries: Array<Record<string, any>>;
  im_pro_grants: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
}

function createMockDb(): MockDb {
  return {
    profiles: [
      {
        id: BROKER_ID,
        display_name: '김성현 대표중개사',
        company: '테헤란빌딩 부동산중개법인',
        phone: '02-555-1234',
      },
    ],
    broker_profiles: [
      {
        user_id: BROKER_ID,
        office_address: '서울특별시 강남구 테헤란로 152, 10층',
        office_reg_number: '11680-2025-00999',
        slug: 'teheran-prime',
      },
    ],
    user_subscriptions: [{ user_id: BROKER_ID, tier: 'pro', status: 'active' }],
    building_ssot_lite: [
      {
        id: BUILDING_ID,
        owner_id: BROKER_ID,
        name: '역삼 프라임 타워',
        address_road: '서울특별시 강남구 테헤란로 200',
        status: 'published',
      },
    ],
    buildings: [],
    gate_requests: [
      {
        id: GATE_BUYER_1,
        building_id: BUILDING_ID,
        requester_id: null,
        requested_level: 'G1',
        requested_fields: [],
        reason: JSON.stringify({
          name: '이매수 전무',
          phone: '010-2222-3333',
          company: '알파자산운용',
          message: '상세 렌트롤 열람 요청드립니다.',
        }),
        status: 'approved',
        expires_at: '2027-12-31T00:00:00.000Z',
        created_at: '2026-11-15T01:00:00.000Z',
      },
      {
        id: GATE_BUYER_2,
        building_id: BUILDING_ID,
        requester_id: null,
        requested_level: 'G1',
        requested_fields: [],
        reason: JSON.stringify({
          name: '박검토 상무',
          phone: '010-4444-5555',
          company: '베타리츠',
          message: '투심위 검토용 IM 요청드립니다.',
        }),
        status: 'submitted',
        expires_at: '2027-12-31T00:00:00.000Z',
        created_at: '2026-11-15T02:00:00.000Z',
      },
    ],
    im_inquiry_requests: [],
    inquiries: [],
    im_pro_grants: [],
    im_share_links: [],
    in_app_notifications: [],
    magazine_subscribers: [
      {
        id: SUB_ID_1,
        broker_id: 'teheran-prime',
        subscriber_name: '정구독 대표',
        subscriber_phone: '010-8888-9999',
        subscriber_email: 'jung@investor.co.kr',
        status: 'active',
        confirm_status: 'confirmed',
        night_consent: true,
        email_delivery_status: 'ok',
        created_at: '2026-11-14T09:00:00.000Z',
      },
    ],
    broker_clients: [],
    broker_custom_clients: [],
    activity_events: [],
    document_objects: [],
  };
}

function createInMemorySupabase(
  db: MockDb,
  opts?: { simulatePreMigrationBrokerClients?: boolean }
) {
  let autoSeq = 1;
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
      let payload: any = null;
      let pendingError: { code: string; message: string } | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitCount: number | null = null;

      const checkPreMigrationCols = (colsOrObj: string | Record<string, any>) => {
        if (!opts?.simulatePreMigrationBrokerClients || table !== 'broker_clients') return;
        const text =
          typeof colsOrObj === 'string'
            ? colsOrObj
            : Object.keys(colsOrObj || {}).join(',');
        if (
          /\b(is_vip|client_role|preferred_regions|budget_manwon|free_memo|email_delivery_status)\b/.test(
            text
          )
        ) {
          pendingError = {
            code: '42703',
            message: 'column does not exist on pre-migration broker_clients',
          };
        }
      };

      const applyFilters = (rows: Array<Record<string, any>>) => {
        let out = rows.filter((r) => filters.every((fn) => fn(r)));
        if (orderCol) {
          const col = orderCol;
          out = [...out].sort((a, b) => {
            const av = String(a[col] ?? '');
            const bv = String(b[col] ?? '');
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (typeof limitCount === 'number') {
          out = out.slice(0, limitCount);
        }
        return out;
      };

      const execute = async () => {
        if (pendingError) {
          return { data: null, error: pendingError };
        }
        const tableRows = db[table];
        if (!tableRows) {
          return {
            data: null,
            error: { code: '42P01', message: `relation "${table}" does not exist` },
          };
        }

        if (op === 'insert' || op === 'upsert') {
          const items = Array.isArray(payload) ? payload : [payload];
          for (const it of items) {
            checkPreMigrationCols(it);
          }
          if (pendingError) {
            return { data: null, error: pendingError };
          }
          const inserted = items.map((item) => ({
            id:
              item.id ||
              (table === 'broker_clients'
                ? `55555555-6666-4777-8888-${String(999999999900 + autoSeq++).slice(-12)}`
                : `${table}-${autoSeq++}`),
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          }));
          tableRows.push(...inserted);
          return {
            data: Array.isArray(payload) ? inserted : inserted[0],
            error: null,
          };
        }

        if (op === 'update') {
          checkPreMigrationCols(payload || {});
          if (pendingError) {
            return { data: null, error: pendingError };
          }
          const matched = applyFilters(tableRows);
          for (const row of matched) {
            Object.assign(row, payload);
          }
          return { data: matched, error: null };
        }

        if (op === 'delete') {
          const matched = applyFilters(tableRows);
          const matchedSet = new Set(matched);
          db[table] = tableRows.filter((r) => !matchedSet.has(r));
          return { data: matched, error: null };
        }

        return { data: applyFilters(tableRows), error: null };
      };

      const builder: any = {
        select(cols?: string) {
          if (op === 'select') {
            checkPreMigrationCols(String(cols || '*'));
          }
          return builder;
        },
        insert(values: any) {
          op = 'insert';
          payload = values;
          return builder;
        },
        upsert(values: any) {
          op = 'upsert';
          payload = values;
          return builder;
        },
        update(values: any) {
          op = 'update';
          payload = values;
          return builder;
        },
        delete() {
          op = 'delete';
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        neq(col: string, val: unknown) {
          filters.push((r) => r[col] !== val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          const set = new Set(vals);
          filters.push((r) => set.has(r[col]));
          return builder;
        },
        ilike(col: string, val: string) {
          const needle = String(val || '').toLowerCase();
          filters.push((r) => String(r[col] ?? '').toLowerCase() === needle);
          return builder;
        },
        gte(col: string, val: string) {
          filters.push((r) => String(r[col] ?? '') >= val);
          return builder;
        },
        lte(col: string, val: string) {
          filters.push((r) => String(r[col] ?? '') <= val);
          return builder;
        },
        order(col: string, o?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = o?.ascending !== false;
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        maybeSingle() {
          return execute().then((res) => ({
            data: Array.isArray(res.data) ? res.data[0] ?? null : res.data ?? null,
            error: res.error,
          }));
        },
        single() {
          return execute().then((res) => {
            if (res.error) return { data: null, error: res.error };
            const row = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!row) {
              return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
            }
            return { data: row, error: null };
          });
        },
        then(onFulfilled: any, onRejected?: any) {
          return execute().then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };
}

function buildSignedWebhookRequest(params: {
  payload: Record<string, any>;
  svixId?: string;
  timestampSec?: number;
  secret?: string;
  overrideSignature?: string;
  omitHeaders?: boolean;
}) {
  const rawBody = JSON.stringify(params.payload);
  if (params.omitHeaders) {
    return new NextRequest('http://localhost:3000/api/webhooks/resend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawBody,
    });
  }
  const svixId = params.svixId || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(params.timestampSec ?? Math.floor(Date.now() / 1000));
  const secretStr = params.secret ?? TEST_WEBHOOK_SECRET;
  const secretBytes = Buffer.from(secretStr.replace(/^whsec_/, ''), 'base64');
  const validSig = crypto
    .createHmac('sha256', secretBytes)
    .update(`${svixId}.${ts}.${rawBody}`, 'utf8')
    .digest('base64');
  const signatureHeader =
    params.overrideSignature ?? `v1,deadbeef00000000000000000000000000000000000= v1,${validSig}`;

  return new NextRequest('http://localhost:3000/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': ts,
      'svix-signature': signatureHeader,
    },
    body: rawBody,
  });
}

describe('Wave 5 — WP-18: Structured Inbox CRM, Dispatch Audit Timeline, Resend Bounce Webhook & Per-Thread Revoke Isolation', () => {
  let db: MockDb;
  const prevWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const prevResendApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    db = createMockDb();
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.RESEND_API_KEY = 're_test_live_wp18_key';

    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({ data: { id: 're-msg-wp18-01' }, error: null });

    mockRequireBroker.mockReset();
    mockRequireBroker.mockResolvedValue({
      user: { id: BROKER_ID, role: 'broker' },
      role: 'broker',
      error: null,
    });

    mockCreateServiceClient.mockReset();
    mockCreateServiceClient.mockImplementation(() => createInMemorySupabase(db));

    resetShareLinkTokenStoreForTests();
    saveInboxState({
      gateDecisions: {},
      revokedBuildings: {},
      callNotes: {},
      customClients: [],
      correctionNotices: {},
    });
  });

  afterEach(() => {
    if (prevWebhookSecret === undefined) {
      delete process.env.RESEND_WEBHOOK_SECRET;
    } else {
      process.env.RESEND_WEBHOOK_SECRET = prevWebhookSecret;
    }
    if (prevResendApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = prevResendApiKey;
    }
    vi.useRealTimers();
  });

  it('includes idempotent migration 20261115000003_inbox_crm_structured_and_bounces.sql for broker_clients & magazine_subscribers', () => {
    const migPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261115000003_inbox_crm_structured_and_bounces.sql'
    );
    expect(fs.existsSync(migPath)).toBe(true);
    const sql = fs.readFileSync(migPath, 'utf8');
    const sqlLower = sql.toLowerCase();
    expect(sqlLower).toContain('add column if not exists is_vip');
    expect(sqlLower).toContain('add column if not exists client_role');
    expect(sqlLower).toContain('add column if not exists preferred_regions');
    expect(sqlLower).toContain('add column if not exists budget_manwon');
    expect(sqlLower).toContain('add column if not exists free_memo');
    expect(sqlLower).toContain('add column if not exists email_delivery_status');
    expect(sqlLower).toContain('add column if not exists email_bounced_at');
    expect(sqlLower).toContain('add column if not exists email_bounce_reason');
    expect(sqlLower).toContain('public.magazine_subscribers');
  });

  it('verifies Svix HMAC-SHA256 on /api/webhooks/resend (503 unset, 401 missing/invalid/expired), records bounce & complaint idempotently, and blocks outbound send_email (422)', async () => {
    // Seed a broker_clients row sharing the subscriber email + a complained client
    db.broker_clients.push(
      {
        id: CLIENT_UUID_1,
        broker_id: BROKER_ID,
        display_name: '정구독 대표',
        phone: '010-8888-9999',
        email: 'jung@investor.co.kr',
        is_vip: true,
        client_role: 'buyer',
        email_delivery_status: 'ok',
        tags: ['뉴스레터구독'],
        created_at: '2026-11-14T08:00:00.000Z',
      },
      {
        id: CLIENT_UUID_SELLER,
        broker_id: BROKER_ID,
        display_name: '강매도 회장',
        phone: '010-7777-6666',
        email: 'kang@owner.kr',
        is_vip: true,
        client_role: 'seller',
        email_delivery_status: 'ok',
        tags: ['뉴스레터구독'],
        created_at: '2026-11-14T08:30:00.000Z',
      }
    );
    db.magazine_subscribers.push({
      id: '44444444-5555-4666-8777-888888888882',
      broker_id: 'teheran-prime',
      subscriber_name: '강매도 회장',
      subscriber_email: 'kang@owner.kr',
      status: 'active',
      confirm_status: 'confirmed',
      email_delivery_status: 'ok',
      created_at: '2026-11-14T08:35:00.000Z',
    });

    // 1) 503 Fail-Closed when RESEND_WEBHOOK_SECRET is unset
    delete process.env.RESEND_WEBHOOK_SECRET;
    const noSecretRes = await postResendWebhook(
      buildSignedWebhookRequest({
        payload: { type: 'email.bounced', data: { to: ['jung@investor.co.kr'] } },
      })
    );
    expect(noSecretRes.status).toBe(503);
    process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    // 2) 401 on missing signature headers
    const missingHdrRes = await postResendWebhook(
      buildSignedWebhookRequest({
        payload: { type: 'email.bounced', data: { to: ['jung@investor.co.kr'] } },
        omitHeaders: true,
      })
    );
    expect(missingHdrRes.status).toBe(401);

    // 3) 401 on invalid HMAC signature
    const badSigRes = await postResendWebhook(
      buildSignedWebhookRequest({
        payload: { type: 'email.bounced', data: { to: ['jung@investor.co.kr'] } },
        overrideSignature: 'v1,invalidhmacsignaturevalue0000000000000000000=',
      })
    );
    expect(badSigRes.status).toBe(401);

    // 4) 401 on expired timestamp (> 300s old)
    const staleTs = Math.floor(Date.now() / 1000) - 600;
    const expiredRes = await postResendWebhook(
      buildSignedWebhookRequest({
        payload: { type: 'email.bounced', data: { to: ['jung@investor.co.kr'] } },
        timestampSec: staleTs,
      })
    );
    expect(expiredRes.status).toBe(401);

    // 5) 200 on valid whsec_ HMAC-SHA256 for email.bounced + duplicate svix-id idempotency
    const bounceSvixId = 'msg_wp18_bounce_001';
    const bouncePayload = {
      type: 'email.bounced',
      created_at: '2026-11-15T05:00:00.000Z',
      data: {
        email_id: 're_email_991',
        to: ['Jung@Investor.co.kr'],
        bounce: { message: '550 5.1.1 User unknown' },
      },
    };
    const validBounceRes = await postResendWebhook(
      buildSignedWebhookRequest({ payload: bouncePayload, svixId: bounceSvixId })
    );
    expect(validBounceRes.status).toBe(200);
    const validBounceJson = await validBounceRes.json();
    expect(validBounceJson.ok).toBe(true);
    expect(validBounceJson.duplicate).toBeUndefined();

    expect(
      db.broker_clients.find((c) => c.id === CLIENT_UUID_1)?.email_delivery_status
    ).toBe('bounced');
    expect(
      db.magazine_subscribers.find((s) => s.id === SUB_ID_1)?.email_delivery_status
    ).toBe('bounced');
    expect(
      db.activity_events.filter((e) => e.event_type === 'email_bounced')
    ).toHaveLength(1);

    // Duplicate retry with same svix-id must NOT insert a second activity_events row
    const dupBounceRes = await postResendWebhook(
      buildSignedWebhookRequest({ payload: bouncePayload, svixId: bounceSvixId })
    );
    expect(dupBounceRes.status).toBe(200);
    expect((await dupBounceRes.json()).duplicate).toBe(true);
    expect(
      db.activity_events.filter((e) => e.event_type === 'email_bounced')
    ).toHaveLength(1);

    // 6) 200 on valid email.complained -> marks complained AND sets status='unsubscribed' on magazine_subscribers
    const complainRes = await postResendWebhook(
      buildSignedWebhookRequest({
        svixId: 'msg_wp18_complain_002',
        payload: {
          type: 'email.complained',
          created_at: '2026-11-15T05:10:00.000Z',
          data: {
            email_id: 're_email_992',
            to: ['kang@owner.kr'],
          },
        },
      })
    );
    expect(complainRes.status).toBe(200);
    expect(
      db.broker_clients.find((c) => c.id === CLIENT_UUID_SELLER)?.email_delivery_status
    ).toBe('complained');
    const complainedSub = db.magazine_subscribers.find(
      (s) => s.subscriber_email === 'kang@owner.kr'
    );
    expect(complainedSub?.email_delivery_status).toBe('complained');
    expect(complainedSub?.status).toBe('unsubscribed');

    // 7) Subsequent outbound send_email / send_inbox_email to bounced or complained recipient is blocked (422)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T06:00:00.000Z')); // 15:00 KST daytime

    const blockedBounceSend = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          threadId: `custom_${CLIENT_UUID_1}`,
          buildingId: BUILDING_ID,
          clientName: '정구독 대표',
          clientEmail: 'jung@investor.co.kr',
          marketingConsentConfirmed: true,
        }),
      })
    );
    expect([409, 422]).toContain(blockedBounceSend.status);
    const blockedBounceJson = await blockedBounceSend.json();
    expect(blockedBounceJson.ok).toBe(false);
    expect(blockedBounceJson.error).toBe(
      '이전에 반송(수신 불가)되거나 스팸 신고된 이메일 주소이므로 발송이 자동 차단되었습니다.'
    );
    expect(mockResendSend).not.toHaveBeenCalled();

    const blockedComplainSend = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_inbox_email',
          threadId: `custom_${CLIENT_UUID_SELLER}`,
          buildingId: BUILDING_ID,
          clientName: '강매도 회장',
          clientEmail: 'kang@owner.kr',
          marketingConsentConfirmed: true,
        }),
      })
    );
    expect([409, 422]).toContain(blockedComplainSend.status);
    expect((await blockedComplainSend.json()).error).toBe(
      '이전에 반송(수신 불가)되거나 스팸 신고된 이메일 주소이므로 발송이 자동 차단되었습니다.'
    );
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('persists structured CRM fields without clobbering freeMemo on partial updates (including pre-migration fallback) and returns Alimtalk Early-Access guidance', async () => {
    // 1) Create client with freeMemo + initial structured CRM fields
    const createRes = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_client',
          clientName: '한사옥 대표',
          clientPhone: '010-3333-7777',
          clientEmail: 'han@corp.kr',
          isVip: false,
          clientRole: 'buyer',
          preferredRegions: ['강남·역삼'],
          budgetManwon: 650000,
          freeMemo: '자체 사옥용 명도 필수, 자주식 주차 8대 이상 요청',
          buildingId: BUILDING_ID,
          buildingTitle: '역삼 프라임 타워',
        }),
      })
    );
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.ok).toBe(true);
    const savedClientId: string = createJson.clientId;
    expect(createJson.client.freeMemo).toBe(
      '자체 사옥용 명도 필수, 자주식 주차 8대 이상 요청'
    );
    expect(createJson.client.budgetManwon).toBe(650000);
    expect(createJson.client.isVip).toBe(false);

    // 2) Update budgetManwon, preferredRegions, clientRole, isVip WITHOUT passing freeMemo -> freeMemo MUST survive intact!
    const updateStructRes = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_client_profile',
          clientId: savedClientId,
          isVip: true,
          clientRole: 'seller',
          preferredRegions: ['강남·역삼', '서초·교대'],
          budgetManwon: 920000,
        }),
      })
    );
    expect(updateStructRes.status).toBe(200);
    const updateStructJson = await updateStructRes.json();
    expect(updateStructJson.client.isVip).toBe(true);
    expect(updateStructJson.client.clientRole).toBe('seller');
    expect(updateStructJson.client.preferredRegions).toEqual(['강남·역삼', '서초·교대']);
    expect(updateStructJson.client.budgetManwon).toBe(920000);
    expect(updateStructJson.client.freeMemo).toBe(
      '자체 사옥용 명도 필수, 자주식 주차 8대 이상 요청'
    );

    // 3) Update ONLY freeMemo WITHOUT passing budgetManwon / preferredRegions / clientRole / isVip -> structured fields MUST survive intact!
    const updateMemoRes = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_client',
          clientId: savedClientId,
          freeMemo: '보유 서초동 빌딩 매각 후 대토 매입 희망 (세무 자문 연결)',
        }),
      })
    );
    expect(updateMemoRes.status).toBe(200);
    const updateMemoJson = await updateMemoRes.json();
    expect(updateMemoJson.client.freeMemo).toBe(
      '보유 서초동 빌딩 매각 후 대토 매입 희망 (세무 자문 연결)'
    );
    expect(updateMemoJson.client.budgetManwon).toBe(920000);
    expect(updateMemoJson.client.preferredRegions).toEqual(['강남·역삼', '서초·교대']);
    expect(updateMemoJson.client.clientRole).toBe('seller');
    expect(updateMemoJson.client.isVip).toBe(true);

    // Verify DB row notes was NOT clobbered by regex concatenation
    const rawUuid = savedClientId.replace(/^custom_/, '');
    const dbRow = db.broker_clients.find((c) => c.id === rawUuid);
    expect(dbRow?.free_memo).toBe(
      '보유 서초동 빌딩 매각 후 대토 매입 희망 (세무 자문 연결)'
    );
    expect(dbRow?.notes).toBe(
      '보유 서초동 빌딩 매각 후 대토 매입 희망 (세무 자문 연결)'
    );
    expect(dbRow?.budget_manwon).toBe(920000);

    // 4) Pre-migration fallback works cleanly when DB lacks new columns
    mockCreateServiceClient.mockImplementation(() =>
      createInMemorySupabase(db, { simulatePreMigrationBrokerClients: true })
    );
    const preMigRes = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_client',
          clientName: '구버전DB고객',
          clientPhone: '010-1212-3434',
          clientRole: 'tenant',
          budgetManwon: 50000,
          freeMemo: '성수동 1층 쇼룸 임차 희망',
        }),
      })
    );
    expect(preMigRes.status).toBe(200);
    const preMigJson = await preMigRes.json();
    expect(preMigJson.client.clientRole).toBe('tenant');
    expect(preMigJson.client.freeMemo).toBe('성수동 1층 쇼룸 임차 희망');

    // Restore normal mock
    mockCreateServiceClient.mockImplementation(() => createInMemorySupabase(db));

    // 5) Kakao Alimtalk returns graceful Early-Access guidance without fake dispatch row
    const alimRes = await postInboxActions(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_inbox_alimtalk',
          threadId: GATE_BUYER_1,
          buildingId: BUILDING_ID,
          buildingTitle: '역삼 프라임 타워',
          clientName: '이매수 전무',
          clientPhone: '010-2222-3333',
          transactionalBasis: 'im_request',
        }),
      })
    );
    expect(alimRes.status).toBe(200);
    const alimJson = await alimRes.json();
    expect(alimJson.ok).toBe(true);
    expect(alimJson.earlyAccess).toBe(true);
    expect(alimJson.dispatched).toBe(false);
    expect(alimJson.message).toBe(
      'Pro 알림톡 정식 연동 오픈 예정입니다. 이메일 발송 또는 카톡 인사말+링크 1초 복사 기능을 이용해 주세요.'
    );
    expect(
      db.activity_events.filter((e) => e.event_type === 'inbox_alimtalk_sent')
    ).toHaveLength(0);
  });

  it('populates dispatchHistory newest-first, blocks unscoped anonymous view leak onto named customer threads, and filters by vip / buyer / seller / todo / viewed / emailable', async () => {
    // Seed VIP Seller & non-VIP Buyer in broker_clients
    db.broker_clients.push(
      {
        id: CLIENT_UUID_SELLER,
        broker_id: BROKER_ID,
        display_name: '최매도 오너',
        phone: '010-9000-1000',
        email: 'seller@building.kr',
        is_vip: true,
        tier: 'vip',
        client_role: 'seller',
        client_type: 'seller',
        preferred_regions: ['청담·압구정'],
        budget_manwon: 1500000,
        free_memo: '연내 매각 희망',
        email_delivery_status: 'ok',
        tags: ['매도', '뉴스레터구독'],
        linked_building_ids: [BUILDING_ID],
        created_at: '2026-11-15T03:00:00.000Z',
      },
      {
        id: CLIENT_UUID_1,
        broker_id: BROKER_ID,
        display_name: '박바이어 이사',
        phone: '010-9000-2000',
        email: 'bounced-buyer@fund.kr',
        is_vip: false,
        tier: 'normal',
        client_role: 'buyer',
        client_type: 'buyer',
        preferred_regions: ['성수', '을지로'],
        budget_manwon: 480000,
        free_memo: '밸류애드 오피스 검토',
        email_delivery_status: 'bounced',
        tags: ['뉴스레터구독'],
        linked_building_ids: [BUILDING_ID],
        created_at: '2026-11-15T03:10:00.000Z',
      }
    );

    const recentAnonIso = new Date(Date.now() - 120_000).toISOString();
    const recentScopedIso = new Date(Date.now() - 60_000).toISOString();

    // Seed 3 unscoped anonymous views on BUILDING_ID (no recipient_id / gate_request_id / share_token)
    // + 1 recipient-scoped view strictly for GATE_BUYER_1
    db.activity_events.push(
      {
        id: 'ev-anon-1',
        actor_id: null,
        actor_role: 'system',
        event_type: 'im_lite_view',
        entity_type: 'building',
        entity_id: BUILDING_ID,
        metadata: { building_id: BUILDING_ID, visitor_fp: 'anon-fp-999' },
        created_at: recentAnonIso,
      },
      {
        id: 'ev-anon-2',
        actor_id: null,
        actor_role: 'system',
        event_type: 'im_lite_view',
        entity_type: 'building',
        entity_id: BUILDING_ID,
        metadata: { building_id: BUILDING_ID, visitor_fp: 'anon-fp-999' },
        created_at: recentAnonIso,
      },
      {
        id: 'ev-scoped-buyer1',
        actor_id: null,
        actor_role: 'system',
        event_type: 'im_lite_view',
        entity_type: 'building',
        entity_id: BUILDING_ID,
        metadata: {
          building_id: BUILDING_ID,
          recipient_id: GATE_BUYER_1,
          section_viewed: '06_financials',
        },
        created_at: recentScopedIso,
      },
      // Dispatch & delivery audit events for custom_${CLIENT_UUID_1} (oldest -> newest)
      {
        id: 'disp-1',
        actor_id: BROKER_ID,
        event_type: 'inbox_outbound_copied',
        entity_type: 'building',
        entity_id: BUILDING_ID,
        metadata: {
          thread_id: `custom_${CLIENT_UUID_1}`,
          asset_kind: 'im',
        },
        created_at: '2026-11-15T04:00:00.000Z',
      },
      {
        id: 'disp-2',
        actor_id: BROKER_ID,
        event_type: 'inbox_email_sent',
        entity_type: 'building',
        entity_id: BUILDING_ID,
        metadata: {
          thread_id: `custom_${CLIENT_UUID_1}`,
          to_email: 'bounced-buyer@fund.kr',
          asset_kind: 'im',
          subject: '[테헤란빌딩] 역삼 프라임 타워 IM 자료 안내',
        },
        created_at: '2026-11-15T04:05:00.000Z',
      },
      {
        id: 'disp-3',
        actor_id: null,
        event_type: 'email_bounced',
        entity_type: 'building',
        entity_id: BROKER_ID,
        metadata: {
          email: 'bounced-buyer@fund.kr',
          reason: '550 Mailbox unavailable',
        },
        created_at: '2026-11-15T04:06:00.000Z',
      },
      // Delivered event for seller@building.kr
      {
        id: 'disp-seller-delivered',
        actor_id: BROKER_ID,
        event_type: 'email_delivered',
        entity_type: 'building',
        entity_id: BROKER_ID,
        metadata: {
          email: 'seller@building.kr',
        },
        created_at: '2026-11-15T04:10:00.000Z',
      }
    );

    const allRes = await getInbox(new NextRequest('http://localhost:3000/api/broker/inbox'));
    expect(allRes.status).toBe(200);
    const allJson = await allRes.json();
    const allThreads = allJson.threads as Array<Record<string, any>>;

    // GATE_BUYER_2 has NO recipient-scoped views -> openCount MUST be 0 (zero anonymous view leak!)
    const buyer2Thread = allThreads.find((t) => t.id === GATE_BUYER_2);
    expect(buyer2Thread).toBeDefined();
    expect(buyer2Thread?.openCount).toBe(0);

    // GATE_BUYER_1 has exactly 1 recipient-scoped view -> openCount MUST be 1 (not 3!)
    const buyer1Thread = allThreads.find((t) => t.id === GATE_BUYER_1);
    expect(buyer1Thread).toBeDefined();
    expect(buyer1Thread?.openCount).toBe(1);
    expect(buyer1Thread?.focusedSections).toContain('수익률 분석');

    // Anonymous building views surface separately as view_* thread
    const anonThread = allThreads.find((t) => String(t.id).startsWith('view_'));
    expect(anonThread).toBeDefined();
    expect(anonThread?.openCount).toBe(2);

    // Verify dispatchHistory sorted newest-first + bounceReason + structured CRM fields
    const bouncedBuyerThread = allThreads.find((t) => t.id === `custom_${CLIENT_UUID_1}`);
    expect(bouncedBuyerThread).toBeDefined();
    expect(bouncedBuyerThread?.emailDeliveryStatus).toBe('bounced');
    expect(bouncedBuyerThread?.preferredRegions).toEqual(['성수', '을지로']);
    expect(bouncedBuyerThread?.budgetManwon).toBe(480000);
    expect(bouncedBuyerThread?.freeMemo).toBe('밸류애드 오피스 검토');
    expect(bouncedBuyerThread?.dispatchHistory.map((d: any) => d.id)).toEqual([
      'disp-3',
      'disp-2',
      'disp-1',
    ]);
    expect(bouncedBuyerThread?.dispatchHistory[0]).toMatchObject({
      id: 'disp-3',
      eventType: 'email_bounced',
      channel: 'email',
      status: 'bounced',
      bounceReason: '550 Mailbox unavailable',
    });

    // Filter checks: ?filter=vip, ?filter=seller, ?filter=buyer, ?filter=todo, ?filter=viewed, ?filter=emailable
    const vipRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=vip')
    );
    const vipThreads = (await vipRes.json()).threads as Array<Record<string, any>>;
    expect(vipThreads.length).toBeGreaterThanOrEqual(1);
    expect(vipThreads.every((t) => t.isVip === true || t.clientGrade === 'VIP')).toBe(true);

    const sellerRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=seller')
    );
    const sellerThreads = (await sellerRes.json()).threads as Array<Record<string, any>>;
    expect(sellerThreads).toHaveLength(1);
    expect(sellerThreads[0].id).toBe(`custom_${CLIENT_UUID_SELLER}`);
    expect(sellerThreads[0].dispatchHistory[0].eventType).toBe('email_delivered');

    const buyerRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=buyer')
    );
    const buyerThreads = (await buyerRes.json()).threads as Array<Record<string, any>>;
    expect(buyerThreads.every((t) => t.clientRole === 'buyer' && !String(t.id).startsWith('view_'))).toBe(
      true
    );
    expect(buyerThreads.some((t) => t.id === `custom_${CLIENT_UUID_SELLER}`)).toBe(false);

    const todoRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=todo')
    );
    const todoThreads = (await todoRes.json()).threads as Array<Record<string, any>>;
    expect(todoThreads.map((t) => t.id)).toEqual([GATE_BUYER_2]);

    const viewedRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=viewed')
    );
    const viewedThreads = (await viewedRes.json()).threads as Array<Record<string, any>>;
    expect(viewedThreads.some((t) => t.id === GATE_BUYER_1)).toBe(true);
    expect(viewedThreads.some((t) => t.id === GATE_BUYER_2)).toBe(false);

    const emailableRes = await getInbox(
      new NextRequest('http://localhost:3000/api/broker/inbox?filter=emailable')
    );
    const emailableThreads = (await emailableRes.json()).threads as Array<Record<string, any>>;
    // Seller & active subscriber are emailable ('ok'), whereas bounced buyer is excluded!
    expect(emailableThreads.some((t) => t.id === `custom_${CLIENT_UUID_SELLER}`)).toBe(true);
    expect(emailableThreads.some((t) => t.id === `sub_${SUB_ID_1}`)).toBe(true);
    expect(emailableThreads.some((t) => t.id === `custom_${CLIENT_UUID_1}`)).toBe(false);
  });

  it('isolates per-thread share-link revocation (scope: "thread") from locking the entire building while preserving building-level lock', async () => {
    // Issue a live share token for Buyer 2 on BUILDING_ID
    const buyer2Issued = await issueShareLinkToken({
      buildingId: BUILDING_ID,
      brokerId: BROKER_ID,
      recipientId: GATE_BUYER_2,
      ttlDays: 14,
    });
    db.gate_requests.find((g) => g.id === GATE_BUYER_2)!.status = 'approved';

    // 1) Broker revokes Buyer 1's thread with scope: 'thread' and EMPTY token (untokenized thread)
    const threadRevokeRes = await postShareLinkRevoke(
      new NextRequest('http://localhost:3000/api/broker/share-links/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'thread',
          token: '',
          buildingId: BUILDING_ID,
          gateRequestId: GATE_BUYER_1,
          threadId: GATE_BUYER_1,
          reason: 'buyer1_only_lock',
        }),
      })
    );
    expect(threadRevokeRes.status).toBe(200);
    const threadRevokeJson = await threadRevokeRes.json();
    expect(threadRevokeJson.ok).toBe(true);
    expect(threadRevokeJson.scope).toBe('thread');

    // Building MUST NOT be locked globally!
    expect(isBuildingShareLinkRevoked(BUILDING_ID)).toBe(false);

    // Buyer 1 gate_requests row is revoked + thread_link_revoked logged (zero link_revoked!)
    expect(db.gate_requests.find((g) => g.id === GATE_BUYER_1)?.status).toBe('revoked');
    expect(
      db.activity_events.some(
        (e) =>
          e.event_type === 'thread_link_revoked' &&
          e.metadata?.gate_request_id === GATE_BUYER_1
      )
    ).toBe(true);
    expect(db.activity_events.some((e) => e.event_type === 'link_revoked')).toBe(false);

    // Sibling Buyer 2's share token on the SAME building remains 100% valid!
    const buyer2VerifyAfterThreadLock = await verifyShareLinkToken({
      token: buyer2Issued.token,
      buildingId: BUILDING_ID,
    });
    expect(buyer2VerifyAfterThreadLock.valid).toBe(true);

    // GET /api/broker/inbox reflects status='revoked' ONLY for Buyer 1, while Buyer 2 stays 'active'
    const inboxRes = await getInbox(new NextRequest('http://localhost:3000/api/broker/inbox'));
    const inboxThreads = (await inboxRes.json()).threads as Array<Record<string, any>>;
    expect(inboxThreads.find((t) => t.id === GATE_BUYER_1)?.status).toBe('revoked');
    expect(inboxThreads.find((t) => t.id === GATE_BUYER_2)?.status).toBe('active');

    // 2) Explicit building-level revoke (scope: 'building') locks the entire building for all buyers
    const buildingRevokeRes = await postShareLinkRevoke(
      new NextRequest('http://localhost:3000/api/broker/share-links/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'building',
          buildingId: BUILDING_ID,
          reason: 'deal_closed_lock_all',
        }),
      })
    );
    expect(buildingRevokeRes.status).toBe(200);
    const buildingRevokeJson = await buildingRevokeRes.json();
    expect(buildingRevokeJson.scope).toBe('building');
    expect(isBuildingShareLinkRevoked(BUILDING_ID)).toBe(true);

    const buyer2VerifyAfterBuildingLock = await verifyShareLinkToken({
      token: buyer2Issued.token,
      buildingId: BUILDING_ID,
    });
    expect(buyer2VerifyAfterBuildingLock.valid).toBe(false);
    expect(buyer2VerifyAfterBuildingLock.reason).toBe('revoked');
  });
});
