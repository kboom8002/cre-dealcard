import crypto from 'node:crypto';
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
  evaluateInboxAlimtalkAccess,
  resolveInboxEmailDeliveryPurpose,
  sendInboxClientEmail,
} from '@/domain/inbox/inbox-outbound';
import {
  resetShareLinkTokenStoreForTests,
} from '@/lib/security/share-link-tokens';
import { saveInboxState } from '@/lib/im-lite/quick-generate-store';
import { POST as postInboxActions } from '@/app/api/broker/inbox/actions/route';
import {
  GET as getRetentionPurge,
  PERMANENT_COMPLIANCE_EVENT_TYPES,
  POST as postRetentionPurge,
  PROTECTED_NON_BUILDING_DOCUMENT_TYPES,
} from '@/app/api/cron/retention-purge/route';

const BROKER_ID = '11111111-2222-4333-8444-555555555555';
const BUILDING_ID = '22222222-3333-4444-8555-666666666666';
const GATE_REQ_ID = '33333333-4444-4555-8666-777777777777';

interface TestDb {
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
  magazine_subscribers: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  party: Array<Record<string, any>>;
  buyer_condition: Array<Record<string, any>>;
  track_event: Array<Record<string, any>>;
}

function createSeededDb(): TestDb {
  return {
    profiles: [
      {
        id: BROKER_ID,
        display_name: '박성훈 대표중개사',
        company: '한강빌딩 부동산중개법인',
        phone: '02-555-7890',
      },
    ],
    broker_profiles: [
      {
        user_id: BROKER_ID,
        office_address: '서울특별시 강남구 테헤란로 152, 12층',
        office_reg_number: '11680-2024-00888',
        representative_name: '박성훈',
        slug: 'hangang-park',
      },
    ],
    user_subscriptions: [{ user_id: BROKER_ID, tier: 'free', status: 'active' }],
    building_ssot_lite: [
      {
        id: BUILDING_ID,
        owner_id: BROKER_ID,
        status: 'published',
      },
    ],
    buildings: [],
    gate_requests: [
      {
        id: GATE_REQ_ID,
        building_id: BUILDING_ID,
        reason: JSON.stringify({ name: '강매수 대표', email: 'kang@buyer.co.kr', message: '자료 열람 신청' }),
        status: 'approved',
        created_at: '2026-11-14T02:00:00.000Z',
      },
    ],
    im_inquiry_requests: [],
    inquiries: [],
    im_pro_grants: [],
    im_share_links: [],
    magazine_subscribers: [],
    broker_clients: [],
    activity_events: [],
    document_objects: [],
    party: [],
    buyer_condition: [],
    track_event: [],
  };
}

function parsePostgrestInList(rawVal: string): Set<string> {
  const trimmed = rawVal.trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!trimmed) return new Set();
  return new Set(
    trimmed
      .split(',')
      .map((part) => part.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'))
      .filter(Boolean)
  );
}

function createStrictSchemaSupabaseMock(
  db: TestDb,
  selectLog: Array<{ table: string; columns: string }> = []
) {
  return {
    rpc: vi.fn(async (fnName: string) => ({
      data: { fn: fnName, purged: 0 },
      error: null,
    })),
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let pendingError: { code: string; message: string } | null = null;
      let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
      let writePayload: any = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitCount: number | null = null;

      const validateSelectColumns = (cols?: string) => {
        const colStr = String(cols || '*');
        selectLog.push({ table, columns: colStr });
        if (/\boffice_name\b/.test(colStr)) {
          pendingError = {
            code: '42703',
            message: `column ${table}.office_name does not exist`,
          };
        }
        if (
          table === 'broker_profiles' &&
          /\b(display_name|company|phone)\b/.test(colStr)
        ) {
          pendingError = {
            code: '42703',
            message: `column on broker_profiles (${colStr}) does not exist; use profiles table`,
          };
        }
        if (
          table === 'profiles' &&
          /\b(office_address|office_reg_number|slug)\b/.test(colStr)
        ) {
          pendingError = {
            code: '42703',
            message: `column on profiles (${colStr}) does not exist; use broker_profiles table`,
          };
        }
      };

      const getRows = () => (db as Record<string, Array<Record<string, any>>>)[table] || [];

      const filterMatched = (list: Array<Record<string, any>>) => {
        let matched = list.filter((row) => filters.every((fn) => fn(row)));
        if (orderCol) {
          const col = orderCol;
          matched = [...matched].sort((a, b) => {
            const av = String(a[col] ?? '');
            const bv = String(b[col] ?? '');
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (typeof limitCount === 'number') {
          matched = matched.slice(0, limitCount);
        }
        return matched;
      };

      const execute = async () => {
        if (pendingError) {
          return { data: null, error: pendingError, count: null };
        }
        const list = (db as Record<string, Array<Record<string, any>>>)[table];
        if (!list) {
          return {
            data: null,
            error: { code: '42P01', message: `relation "${table}" does not exist` },
            count: null,
          };
        }

        if (op === 'insert' || op === 'upsert') {
          const items = Array.isArray(writePayload) ? writePayload : [writePayload];
          const inserted = items.map((item, idx) => ({
            id: item.id || `${table}-${Date.now()}-${idx}`,
            created_at: item.created_at || new Date().toISOString(),
            ...item,
          }));
          list.push(...inserted);
          return {
            data: Array.isArray(writePayload) ? inserted : inserted[0],
            error: null,
            count: inserted.length,
          };
        }

        if (op === 'update') {
          const matched = filterMatched(list);
          for (const row of matched) {
            Object.assign(row, writePayload);
          }
          return { data: matched, error: null, count: matched.length };
        }

        if (op === 'delete') {
          const matched = filterMatched(list);
          const matchedSet = new Set(matched);
          (db as Record<string, Array<Record<string, any>>>)[table] = list.filter(
            (r) => !matchedSet.has(r)
          );
          return { data: matched, error: null, count: matched.length };
        }

        const matched = filterMatched(getRows());
        return { data: matched, error: null, count: matched.length };
      };

      const builder: any = {
        select: (cols?: string) => {
          validateSelectColumns(cols);
          return builder;
        },
        insert: (payload: any) => {
          op = 'insert';
          writePayload = payload;
          return builder;
        },
        upsert: (payload: any) => {
          op = 'upsert';
          writePayload = payload;
          return builder;
        },
        update: (payload: any) => {
          op = 'update';
          writePayload = payload;
          return builder;
        },
        delete: () => {
          op = 'delete';
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters.push((r) => String(r[col] ?? '') === String(val ?? ''));
          return builder;
        },
        neq: (col: string, val: unknown) => {
          filters.push((r) => String(r[col] ?? '') !== String(val ?? ''));
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          const set = new Set((vals || []).map((v) => String(v)));
          filters.push((r) => set.has(String(r[col] ?? '')));
          return builder;
        },
        not: (col: string, operator: string, val: unknown) => {
          if (operator === 'in') {
            const excluded =
              typeof val === 'string'
                ? parsePostgrestInList(val)
                : new Set(Array.isArray(val) ? val.map((v) => String(v)) : []);
            filters.push((r) => !excluded.has(String(r[col] ?? '')));
          } else if (operator === 'is') {
            filters.push((r) => (val === null ? r[col] !== null && r[col] !== undefined : r[col] !== val));
          }
          return builder;
        },
        lt: (col: string, val: string) => {
          filters.push((r) => String(r[col] ?? '') < String(val));
          return builder;
        },
        gte: (col: string, val: string) => {
          filters.push((r) => String(r[col] ?? '') >= String(val));
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderCol = col;
          orderAsc = opts?.ascending !== false;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: async () => {
          const res = await execute();
          if (res.error) return { data: null, error: res.error };
          const arr = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
          return { data: arr[0] ?? null, error: null };
        },
        single: async () => {
          const res = await execute();
          if (res.error) return { data: null, error: res.error };
          const arr = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
          return { data: arr[0] ?? null, error: null };
        },
        then: (onFulfilled: (val: any) => any, onRejected?: (err: any) => any) =>
          execute().then(onFulfilled, onRejected),
      };

      return builder;
    },
  };
}

describe('Wave 3 — WP-10: 정보통신망법 제50조 소통함 이메일 적법화 · SQL 조인 수정 · 90일 배치 법정 보존', () => {
  const savedEnv = { ...process.env };
  let db: TestDb;
  let selectLog: Array<{ table: string; columns: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetShareLinkTokenStoreForTests();
    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });

    process.env.RESEND_API_KEY = 're_test_key_wp10';
    process.env.UNSUBSCRIBE_SECRET = 'wp10-unsubscribe-secret-at-least-32-chars!!';
    process.env.SHARE_LINK_SECRET = 'wp10-share-link-secret-at-least-32-chars!!';
    process.env.CRON_SECRET = 'wp10-cron-secret-token';

    mockResendSend.mockResolvedValue({ data: { id: 're-msg-001' }, error: null });
    mockRequireBroker.mockResolvedValue({
      user: { id: BROKER_ID, role: 'broker' },
      role: 'broker',
      error: null,
    });

    db = createSeededDb();
    selectLog = [];
    mockCreateServiceClient.mockImplementation(() => createStrictSchemaSupabaseMock(db, selectLog));
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  describe('(a) sendInboxClientEmail — marketing_outreach mode (정보통신망법 제50조)', () => {
    it('blocks during KST 21:00–08:00 quiet hours without nightSendConsent and never calls Resend', async () => {
      const kstNight2230 = new Date('2026-11-15T22:30:00+09:00');
      const res = await sendInboxClientEmail({
        toEmail: 'buyer@alpha.co.kr',
        brokerName: '박성훈',
        brokerCompany: '한강빌딩 부동산중개법인',
        brokerPhone: '02-555-7890',
        brokerAddress: '서울특별시 강남구 테헤란로 152',
        clientName: '이투자 상무',
        buildingTitle: '역삼동 코너 근생빌딩',
        shareUrl: 'https://credeal.net/im-lite/bld-1?token=slk.test',
        deliveryPurpose: 'marketing_outreach',
        marketingOptIn: true,
        nightSendConsent: false,
        now: kstNight2230,
      });

      expect(res.ok).toBe(false);
      expect(res.blockedReason).toBe('QUIET_HOURS_KST');
      expect(res.subject.startsWith('(광고) ')).toBe(true);
      expect(res.error).toContain('야간 시간대(21:00~08:00)');
      expect(mockResendSend).not.toHaveBeenCalled();

      // Dawn 07:59 KST is also quiet hours
      const kstDawn0759 = new Date('2026-11-16T07:59:00+09:00');
      const dawnRes = await sendInboxClientEmail({
        toEmail: 'buyer@alpha.co.kr',
        brokerName: '박성훈',
        clientName: '이투자 상무',
        buildingTitle: '역삼동 코너 근생빌딩',
        shareUrl: 'https://credeal.net/im-lite/bld-1?token=slk.test',
        deliveryPurpose: 'marketing_outreach',
        marketingOptIn: true,
        now: kstDawn0759,
      });
      expect(dawnRes.ok).toBe(false);
      expect(dawnRes.blockedReason).toBe('QUIET_HOURS_KST');
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('blocks when marketingOptIn === false with OPT_IN_REQUIRED regardless of hour', async () => {
      const kstDaytime = new Date('2026-11-15T14:00:00+09:00');
      const res = await sendInboxClientEmail({
        toEmail: 'cold@alpha.co.kr',
        brokerName: '박성훈',
        brokerCompany: '한강빌딩 부동산중개법인',
        clientName: '최고객 대표',
        buildingTitle: '논현동 사옥빌딩',
        shareUrl: 'https://credeal.net/im-lite/bld-2?token=slk.test',
        deliveryPurpose: 'marketing_outreach',
        marketingOptIn: false,
        now: kstDaytime,
      });

      expect(res.ok).toBe(false);
      expect(res.blockedReason).toBe('OPT_IN_REQUIRED');
      expect(res.subject.startsWith('(광고) ')).toBe(true);
      expect(res.error).toContain('수신 동의가 확인되지 않은 직접 등록 고객');
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('prefixes (광고), injects sender identity (발신자/연락처/소재지), List-Unsubscribe RFC 8058 header, and 무료 수신거부 footer when opted-in during daytime', async () => {
      const kstDaytime = new Date('2026-11-15T10:30:00+09:00');
      const unsubUrl = 'https://credeal.net/api/public/magazine/unsubscribe?t=v2signedtoken';

      const res = await sendInboxClientEmail({
        toEmail: 'optin@alpha.co.kr',
        brokerName: '박성훈',
        brokerCompany: '한강빌딩 부동산중개법인',
        brokerPhone: '02-555-7890',
        brokerAddress: '서울특별시 강남구 테헤란로 152, 12층',
        clientName: '정매수 대표',
        buildingTitle: '서초동 역세권 빌딩',
        shareUrl: 'https://credeal.net/im-lite/bld-3?token=slk.test',
        deliveryPurpose: 'marketing_outreach',
        marketingOptIn: true,
        unsubscribeUrl: unsubUrl,
        now: kstDaytime,
      });

      expect(res.ok).toBe(true);
      expect(res.subject.startsWith('(광고) ')).toBe(true);
      expect(mockResendSend).toHaveBeenCalledTimes(1);

      const sentPayload = mockResendSend.mock.calls[0][0] as Record<string, any>;
      expect(sentPayload.subject).toBe(res.subject);
      expect(sentPayload.headers).toMatchObject({
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
      expect(sentPayload.text).toContain('발신자: 한강빌딩 부동산중개법인');
      expect(sentPayload.text).toContain('연락처: 02-555-7890');
      expect(sentPayload.text).toContain('소재지: 서울특별시 강남구 테헤란로 152, 12층');
      expect(sentPayload.text).toContain(`무료 수신거부: ${unsubUrl}`);
      expect(sentPayload.html).toContain('발신자: 한강빌딩 부동산중개법인');
      expect(sentPayload.html).toContain('연락처: 02-555-7890');
      expect(sentPayload.html).toContain('소재지: 서울특별시 강남구 테헤란로 152, 12층');
      expect(sentPayload.html).toContain(unsubUrl);
      expect(sentPayload.html).toContain('무료 수신거부');
    });

    it('keeps Free-tier Alimtalk gate intact with graceful Pro 오픈 예정 copy', () => {
      const access = evaluateInboxAlimtalkAccess({
        tier: 'free',
        isPaid: false,
        transactionalBasis: 'im_request',
        clientPhone: '010-1234-5678',
      });
      expect(access.allowed).toBe(false);
      expect(access.code).toBe('PLAN_UPGRADE_REQUIRED');
      expect(access.reason).toBe(
        'Pro 오픈 예정 · 이메일 발송 또는 카톡 인사말+링크 1초 복사 기능을 바로 이용하실 수 있습니다'
      );
    });
  });

  describe('(b) sendInboxClientEmail — transactional_reply mode', () => {
    it('sends immediate inquiry / IM-request reply cleanly even during KST nighttime without (광고) prefix', async () => {
      const kstLateNight = new Date('2026-11-15T23:45:00+09:00');

      expect(
        resolveInboxEmailDeliveryPurpose({ transactionalBasis: 'im_request' })
      ).toBe('transactional_reply');
      expect(
        resolveInboxEmailDeliveryPurpose({ transactionalBasis: 'property_inquiry' })
      ).toBe('transactional_reply');
      expect(
        resolveInboxEmailDeliveryPurpose({ transactionalBasis: 'tour_booking' })
      ).toBe('transactional_reply');
      expect(
        resolveInboxEmailDeliveryPurpose({ transactionalBasis: 'broker_manual' })
      ).toBe('marketing_outreach');

      const res = await sendInboxClientEmail({
        toEmail: 'requester@buyer.co.kr',
        brokerName: '박성훈',
        brokerCompany: '한강빌딩 부동산중개법인',
        brokerPhone: '02-555-7890',
        clientName: '김요청 전무',
        buildingTitle: '역삼동 프라임 빌딩',
        shareUrl: 'https://credeal.net/im-lite/bld-4?token=slk.test',
        transactionalBasis: 'im_request',
        now: kstLateNight,
      });

      expect(res.ok).toBe(true);
      expect(res.deliveryPurpose).toBe('transactional_reply');
      expect(res.subject).not.toContain('(광고)');
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      const sentPayload = mockResendSend.mock.calls[0][0] as Record<string, any>;
      expect(sentPayload.headers).toBeUndefined();
      expect(sentPayload.html).toContain('상담·자료 요청 고객님께 1:1로 전달된 매물 안내 메일');
    });
  });

  describe('(c) POST /api/broker/inbox/actions — SQL profile join, key separation & unsubscribe suppression', () => {
    it('queries profiles (display_name, company, phone) + broker_profiles (office_address, office_reg_number, slug) without office_name error and sends transactional_reply for real gate_requests', async () => {
      // Even at night KST, real gate_requests reply succeeds and resolves broker profile cleanly
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-15T23:10:00+09:00'));

      const res = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_client_email',
            threadId: GATE_REQ_ID,
            buildingId: BUILDING_ID,
            buildingTitle: '강남구 테헤란로 코너빌딩',
            clientName: '강매수 대표',
            clientEmail: 'kang@buyer.co.kr',
            assetKind: 'im',
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.deliveryPurpose).toBe('transactional_reply');
      expect(json.subject).toContain('박성훈 대표중개사');
      expect(json.subject).not.toContain('(광고)');

      // Verify exact SQL selects on profiles & broker_profiles (zero office_name!)
      const profileSelects = selectLog.filter((q) => q.table === 'profiles');
      const brokerProfileSelects = selectLog.filter((q) => q.table === 'broker_profiles');
      expect(profileSelects.length).toBeGreaterThan(0);
      expect(brokerProfileSelects.length).toBeGreaterThan(0);
      for (const s of [...profileSelects, ...brokerProfileSelects]) {
        expect(s.columns).not.toMatch(/\boffice_name\b/);
      }
      expect(profileSelects.some((s) => s.columns.includes('display_name'))).toBe(true);
      expect(brokerProfileSelects.some((s) => s.columns.includes('office_address'))).toBe(true);
    });

    it('blocks unsubscribed recipients with 403 via activity_events (newsletter_subscription_toggled) or magazine_subscribers (unsubscribed)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-15T11:00:00+09:00'));

      // Case 1: Unsubscribed via activity_events newsletter_subscription_toggled (subscribed: false)
      db.activity_events.push({
        id: 'ev-unsub-1',
        actor_id: BROKER_ID,
        event_type: 'newsletter_subscription_toggled',
        entity_type: 'building',
        entity_id: BROKER_ID,
        metadata: {
          client_email: 'unsub-event@buyer.co.kr',
          subscribed: false,
          newsletter_subscribed: false,
        },
        created_at: '2026-11-10T05:00:00.000Z',
      });

      const evBlockedRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_cli_1',
            buildingId: BUILDING_ID,
            clientName: '해지고객A',
            clientEmail: 'unsub-event@buyer.co.kr',
            marketingConsentConfirmed: true,
          }),
        })
      );
      expect(evBlockedRes.status).toBe(403);
      const evBlockedJson = await evBlockedRes.json();
      expect(evBlockedJson.ok).toBe(false);
      expect(evBlockedJson.error).toBe('수신거부(해지)를 요청한 고객에게는 이메일을 발송할 수 없습니다.');

      // Case 2: Unsubscribed via magazine_subscribers status = 'unsubscribed'
      db.magazine_subscribers.push({
        id: '44444444-5555-4666-8777-888888888888',
        broker_id: 'hangang-park',
        subscriber_email: 'unsub-mag@buyer.co.kr',
        status: 'unsubscribed',
        unsubscribed_at: '2026-11-12T01:00:00.000Z',
        created_at: '2026-10-01T00:00:00.000Z',
      });

      const magBlockedRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_cli_2',
            buildingId: BUILDING_ID,
            clientName: '해지고객B',
            clientEmail: 'unsub-mag@buyer.co.kr',
            marketingConsentConfirmed: true,
          }),
        })
      );
      expect(magBlockedRes.status).toBe(403);
      expect((await magBlockedRes.json()).error).toBe(
        '수신거부(해지)를 요청한 고객에게는 이메일을 발송할 수 없습니다.'
      );
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('requires recorded opt-in (rejecting self-attested marketingConsentConfirmed alone) for custom_* contacts and sends marketing_outreach with (광고) + signed unsubscribe URL', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-15T13:00:00+09:00'));

      // 1) Custom contact without consent -> 403 OPT_IN_REQUIRED
      const unconsentedRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_cold_99',
            buildingId: BUILDING_ID,
            buildingTitle: '논현동 신축빌딩',
            clientName: '미동의고객',
            clientEmail: 'cold99@buyer.co.kr',
          }),
        })
      );
      expect(unconsentedRes.status).toBe(403);
      const unconsentedJson = await unconsentedRes.json();
      expect(unconsentedJson.blockedReason).toBe('OPT_IN_REQUIRED');

      // 2) WP-7.3E P1-3: Self-attested body flag marketingConsentConfirmed: true WITHOUT recorded DB opt-in -> still 403 OPT_IN_REQUIRED
      const selfAttestedRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_optin_99',
            buildingId: BUILDING_ID,
            buildingTitle: '논현동 신축빌딩',
            clientName: '동의완료고객',
            clientEmail: 'optin99@buyer.co.kr',
            marketingConsentConfirmed: true,
          }),
        })
      );
      expect(selfAttestedRes.status).toBe(403);
      const selfAttestedJson = await selfAttestedRes.json();
      expect(selfAttestedJson.blockedReason).toBe('OPT_IN_REQUIRED');

      // 3) Custom contact backed by active confirmed magazine_subscribers opt-in -> 200 marketing_outreach with (광고) & signed unsub URL during daytime, 403 QUIET_HOURS_KST at night
      db.magazine_subscribers.push({
        id: '55555555-6666-4777-8888-999999999999',
        broker_id: 'hangang-park',
        subscriber_email: 'active-sub@buyer.co.kr',
        status: 'active',
        confirm_status: 'confirmed',
        night_consent: false,
        created_at: '2026-10-15T00:00:00.000Z',
      });

      const subDayRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_sub_01',
            buildingId: BUILDING_ID,
            buildingTitle: '논현동 신축빌딩',
            clientName: '구독동의고객',
            clientEmail: 'active-sub@buyer.co.kr',
          }),
        })
      );
      expect(subDayRes.status).toBe(200);
      const subDayJson = await subDayRes.json();
      expect(subDayJson.ok).toBe(true);
      expect(subDayJson.deliveryPurpose).toBe('marketing_outreach');
      expect(subDayJson.subject.startsWith('(광고) ')).toBe(true);
      expect(subDayJson.unsubscribeUrl).toContain('/api/public/magazine/unsubscribe?t=');

      vi.setSystemTime(new Date('2026-11-15T22:15:00+09:00'));
      const subNightRes = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_inbox_email',
            threadId: 'custom_sub_01',
            buildingId: BUILDING_ID,
            buildingTitle: '논현동 신축빌딩',
            clientName: '구독동의고객',
            clientEmail: 'active-sub@buyer.co.kr',
          }),
        })
      );
      expect(subNightRes.status).toBe(403);
      expect((await subNightRes.json()).blockedReason).toBe('QUIET_HOURS_KST');
    });

    it('never falls back to SUPABASE_SERVICE_ROLE_KEY when verifying shareToken HMAC ownership', async () => {
      delete process.env.SHARE_LINK_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'leaked-service-role-key-must-never-sign-slk';

      // Forge a token signed with SUPABASE_SERVICE_ROLE_KEY owned by rival broker
      const rivalId = '99999999-9999-4999-8999-999999999999';
      const forgedPayload = Buffer.from(
        JSON.stringify({ b: BUILDING_ID, u: rivalId, r: 'c1', exp: Date.now() + 60_000 })
      ).toString('base64url');
      const forgedSig = crypto
        .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY)
        .update(forgedPayload)
        .digest('base64url');
      const forgedToken = `slk.${forgedPayload}.${forgedSig}`;

      // Because SUPABASE_SERVICE_ROLE_KEY is NOT accepted as HMAC key, forgedSig is invalidSig (not trusted as rivalId)
      const res = await postInboxActions(
        new NextRequest('https://credeal.net/api/broker/inbox/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prepare_copy_bundle',
            buildingId: BUILDING_ID,
            shareToken: forgedToken,
            clientName: '검증고객',
          }),
        })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('(d) /api/cron/retention-purge — PERMANENT_COMPLIANCE_EVENT_TYPES & non-building document_objects protection', () => {
    it('exports PERMANENT_COMPLIANCE_EVENT_TYPES and preserves statutory opt-out, link_revoked, deletion audit events, and non-building document_objects past 90 days', async () => {
      expect(PERMANENT_COMPLIANCE_EVENT_TYPES).toEqual([
        'newsletter_subscription_toggled',
        'link_revoked',
        'link_restored',
        'thread_link_revoked',
        'thread_link_restored',
        'dealcard_deleted',
        'dealcard_restored',
        'im_deleted',
        'im_restored',
        'correction_notice_published',
        'correction_notice_cleared',
        'custom_client_deleted',
        'email_bounced',
        'email_complained',
        'magazine_unsubscribed',
        'email_suppression_recorded',
        'consent_reconfirm_notified',
        'inbox_thread_archived',
        'inbox_thread_unarchived',
      ]);
      expect(PROTECTED_NON_BUILDING_DOCUMENT_TYPES).toEqual([
        'magazine_edition',
        'magazine_issue',
        'morning_briefing',
        'qa_feedback_pin',
        'qa_session',
      ]);

      const old120DaysIso = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const recent5DaysIso = new Date(Date.now() - 5 * 86_400_000).toISOString();

      // Seed 8 permanent compliance events (>120 days old) + 2 ephemeral events (>120 days old) + 1 recent ephemeral event
      for (const permType of PERMANENT_COMPLIANCE_EVENT_TYPES) {
        db.activity_events.push({
          id: `perm-${permType}`,
          actor_id: BROKER_ID,
          event_type: permType,
          entity_type: 'building',
          entity_id: BUILDING_ID,
          created_at: old120DaysIso,
        });
      }
      db.activity_events.push(
        {
          id: 'old-ephemeral-view',
          actor_id: BROKER_ID,
          event_type: 'im_viewed',
          entity_type: 'building',
          entity_id: BUILDING_ID,
          created_at: old120DaysIso,
        },
        {
          id: 'old-ephemeral-copy',
          actor_id: BROKER_ID,
          event_type: 'inbox_outbound_copied',
          entity_type: 'building',
          entity_id: BUILDING_ID,
          created_at: old120DaysIso,
        },
        {
          id: 'recent-ephemeral-view',
          actor_id: BROKER_ID,
          event_type: 'im_viewed',
          entity_type: 'building',
          entity_id: BUILDING_ID,
          created_at: recent5DaysIso,
        }
      );

      // Seed non-building document_objects (building_id: null, >120 days old) + 1 true orphan snapshot draft
      for (const docType of PROTECTED_NON_BUILDING_DOCUMENT_TYPES) {
        db.document_objects.push({
          id: `protected-doc-${docType}`,
          building_id: null,
          document_type: docType,
          created_at: old120DaysIso,
        });
      }
      db.document_objects.push(
        {
          id: 'true-orphan-snapshot',
          building_id: null,
          document_type: 'building_snapshot_draft',
          created_at: old120DaysIso,
        },
        {
          id: 'linked-building-im',
          building_id: BUILDING_ID,
          document_type: 'mobile_im',
          created_at: old120DaysIso,
        }
      );

      // Unauthorized call must return 401
      const unauthRes = await getRetentionPurge(
        new NextRequest('https://credeal.net/api/cron/retention-purge')
      );
      expect(unauthRes.status).toBe(401);

      // Authorized cron execution
      const res = await postRetentionPurge(
        new NextRequest('https://credeal.net/api/cron/retention-purge', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.results.activityEventsPurged).toBe(2);
      expect(json.results.orphanDocsPurged).toBe(1);

      // All 8 permanent compliance events + 1 recent ephemeral event remain intact!
      const remainingEventIds = db.activity_events.map((e) => e.id);
      for (const permType of PERMANENT_COMPLIANCE_EVENT_TYPES) {
        expect(remainingEventIds).toContain(`perm-${permType}`);
      }
      expect(remainingEventIds).toContain('recent-ephemeral-view');
      expect(remainingEventIds).not.toContain('old-ephemeral-view');
      expect(remainingEventIds).not.toContain('old-ephemeral-copy');

      // All 5 non-building document_objects + linked building IM remain intact; only true orphan draft deleted!
      const remainingDocIds = db.document_objects.map((d) => d.id);
      for (const docType of PROTECTED_NON_BUILDING_DOCUMENT_TYPES) {
        expect(remainingDocIds).toContain(`protected-doc-${docType}`);
      }
      expect(remainingDocIds).toContain('linked-building-im');
      expect(remainingDocIds).not.toContain('true-orphan-snapshot');
    });
  });
});
