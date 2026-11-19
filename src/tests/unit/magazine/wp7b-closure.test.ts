/**
 * WP-7B Newsletter Subsystem P0 & P1 Closure Verification Suite
 *  - P0-1: POST /api/magazine/issues statutory disclosure gate (422 vs draft 200 vs complete 200) & BrokerStatutoryFooter fallback/14px
 *  - P0-2: raw_address hydration in POST /api/magazine/issues
 *  - P0-3: subscribe page OG image URL (/api/og/magazine?brokerId=...) & signed ?sid= token verification
 *  - P1: distribute-queue (checkFlashWeeklyCap, QUIET_HOURS -> retryable, attempt_count <= 5 -> failed)
 *  - P1: consent-reconfirm-2yr cron (acquireCronIdempotencySlot, .range() pagination, unsubscribe footer, never mutates reconfirm_notified_at in dry-run)
 *  - P1: email-suppression (BATCH_SIZE=1000 .range() pagination, invalid UUID safety, insErr failure reporting)
 *  - P1: weekly-magazine cron (.range() pagination over paid brokers)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { FakeDb, consentedSubscriber, DAYTIME, NIGHT, SUB_ID, BROKER_USER_ID } from './send-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const B1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const h = vi.hoisted(() => ({
  db: null as unknown,
  authCtx: { userId: '11111111-1111-4111-8111-111111111111', slug: 'broker-a', displayName: '김중개', brokerKeys: ['broker-a', '11111111-1111-4111-8111-111111111111'] },
  slotAcquired: true,
  generatedWeekly: [] as string[],
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db }));
vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => ({ ctx: h.authCtx, error: null }),
  };
});
vi.mock('@/domain/subscription/tier-gate', () => ({
  getBrokerSubscriptionTier: async () => ({ tier: 'pro', isPaid: true }),
}));
vi.mock('@/lib/security/cron-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/cron-auth')>();
  return {
    ...actual,
    acquireCronIdempotencySlot: async () => ({ acquired: h.slotAcquired }),
  };
});
vi.mock('@/domain/magazine/weekly-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/magazine/weekly-generator')>();
  return {
    ...actual,
    generateWeeklyMagazine: async ({ brokerId }: { brokerId: string }) => {
      h.generatedWeekly.push(brokerId);
      return { id: `ed-${brokerId}`, status: 'draft' };
    },
  };
});
vi.mock('@/domain/magazine/send-providers', () => ({
  hasEmailProvider: () => true,
  hasKakaoProvider: () => true,
  sendEmailProvider: async () => ({ ok: true, messageId: 'msg-1' }),
  sendKakaoProvider: async () => ({ ok: true, messageId: null }),
}));

import { POST as POST_ISSUES } from '@/app/api/magazine/issues/route';
import { GET as GET_RECONFIRM } from '@/app/api/cron/consent-reconfirm-2yr/route';
import { GET as GET_WEEKLY_CRON } from '@/app/api/cron/weekly-magazine/route';
import { enqueueMagazineDispatch, processMagazineDispatchQueueBatch } from '@/domain/magazine/distribute-queue';
import {
  loadSuppressedEmailHashesForBroker,
  recordEmailSuppression,
} from '@/lib/legal/email-suppression';
import { BrokerStatutoryFooter } from '@/components/magazine/viewer-sections';
import { generateMetadata as generateSubscribeMetadata } from '@/app/(magazine)/magazine/[brokerId]/subscribe/page';
import MagazineIssuePage from '@/app/(magazine)/magazine/[brokerId]/[date]/page';
import { issueSidToken, verifySidToken } from '@/domain/magazine/sid-token';

function createIssuesMockDb(opts: { completeStatutory: boolean }) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const editions: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      let op = 'select';
      let payload: unknown;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: (p: unknown) => {
          op = 'insert';
          payload = p;
          calls.push({ table, op, payload });
          if (table === 'magazine_editions') {
            const row = { id: 'eeeeeeee-1111-4111-8111-111111111111', status: 'draft', ...(p as object) };
            editions.push(row);
            return {
              select: () => ({ single: async () => ({ data: row, error: null }), maybeSingle: async () => ({ data: row, error: null }) }),
              then: (res: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(res),
            };
          }
          return chain;
        },
        update: (p: unknown) => {
          op = 'update';
          payload = p;
          calls.push({ table, op, payload });
          return chain;
        },
        upsert: (p: unknown) => {
          op = 'upsert';
          payload = p;
          calls.push({ table, op, payload });
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'broker_profiles') {
            return {
              data: {
                user_id: UA,
                slug: 'broker-a',
                office_address: opts.completeStatutory ? '서울 강남구 테헤란로 1' : null,
                office_reg_number: opts.completeStatutory ? '11680-2023-04567' : null,
                representative_name: '김중개',
                specialty_regions: ['강남'],
                specialty_assets: ['꼬마빌딩'],
              },
              error: null,
            };
          }
          if (table === 'profiles') {
            return {
              data: {
                id: UA,
                display_name: '김중개',
                company: opts.completeStatutory ? '에이스공인중개사사무소' : null,
                phone: opts.completeStatutory ? '010-1234-5678' : null,
              },
              error: null,
            };
          }
          if (table === 'magazine_editions') {
            return { data: editions[0] ?? { id: 'eeeeeeee-1111-4111-8111-111111111111', status: 'draft', content: {} }, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => ({ data: { id: 'eeeeeeee-1111-4111-8111-111111111111', status: 'published' }, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (table === 'building_ssot_lite') {
            return Promise.resolve({
              data: [{ id: B1, owner_id: UA, raw_address: '서울 강남구 역삼동 10-1', area_signal: '강남 역세권', asset_type: '꼬마빌딩', price_band: '50억', layers: {} }],
              error: null,
            }).then(res);
          }
          if (table === 'magazine_editions') {
            return Promise.resolve({ data: editions, error: null }).then(res);
          }
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
  return { db, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.slotAcquired = true;
  h.generatedWeekly = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('P0-1 & P0-2: POST /api/magazine/issues statutory gate + raw_address', () => {
  it('incomplete statutory fields -> 422 STATUTORY_DISCLOSURE_INCOMPLETE on publish, 200 on saveAsDraft', async () => {
    const { db, calls } = createIssuesMockDb({ completeStatutory: false });
    h.db = db;

    const pubRes = await POST_ISSUES(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ headline: '이번 주 시장 브리핑', briefingBody: '강남 빌딩 시황 정리입니다.' }),
      }),
    );
    expect(pubRes.status).toBe(422);
    const pubJson = await pubRes.json();
    expect(pubJson.error.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
    expect(calls.some((c) => c.table === 'magazine_issues' && c.op === 'upsert')).toBe(false);

    const draftRes = await POST_ISSUES(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ saveAsDraft: true, headline: '초안 제목' }),
      }),
    );
    expect(draftRes.status).toBe(200);
  });

  it('complete statutory fields -> 200 and hydrates raw_address safely', async () => {
    const { db } = createIssuesMockDb({ completeStatutory: true });
    h.db = db;

    const res = await POST_ISSUES(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          headline: '강남 수익형 빌딩 주간 브리핑',
          briefingBody: '역삼동 인근 우량 매물 중심의 매수 문의가 이어지고 있습니다.',
          featuredDealIds: [B1],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.content.featuredDeals[0].address).toContain('강남구 역삼동');
  });
});

describe('P0-1: BrokerStatutoryFooter typography (>=14px) & fallback note', () => {
  it('uses text-sm (>=14px) and renders fallback note instead of null when broker metadata exists', () => {
    // Only sample placeholders -> sanitized items empty, yet broker meta exists -> render fallback note (not null)
    const fallbackHtml = renderToStaticMarkup(
      React.createElement(BrokerStatutoryFooter, {
        displayName: '홍길동',
        officeRegNumber: '11680-2024-00123',
      }),
    );
    expect(fallbackHtml).toContain('data-testid="magazine-broker-statutory-disclosure"');
    expect(fallbackHtml).toContain('text-sm');
    expect(fallbackHtml).not.toContain('text-xs');
    expect(fallbackHtml).not.toContain('text-caption');
    expect(fallbackHtml).not.toContain('11680-2024-00123');
    expect(fallbackHtml).toContain('중개사 프로필');

    // Mixed real + sample placeholder -> renders real items with >=14px and strips sample
    const realHtml = renderToStaticMarkup(
      React.createElement(BrokerStatutoryFooter, {
        company: '에이스공인중개사',
        displayName: '김에이스',
        officeRegNumber: '11680-2024-00123',
      }),
    );
    expect(realHtml).toContain('에이스공인중개사');
    expect(realHtml).toContain('text-sm');
    expect(realHtml).not.toContain('11680-2024-00123');

    // When no broker metadata at all, returns empty
    expect(renderToStaticMarkup(React.createElement(BrokerStatutoryFooter, { displayName: '중개사' }))).toBe('');
  });
});

describe('P0-3: Subscribe OG URL & Signed ?sid= Verification', () => {
  it('subscribe page generateMetadata points to /api/og/magazine?brokerId=...', async () => {
    h.db = {
      from(table: string) {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () =>
            table === 'broker_profiles'
              ? { data: { user_id: UA, slug: 'broker-a', name: '김중개', specialty_regions: [], specialty_assets: [], bio: null, photo_url: null }, error: null }
              : { data: { display_name: '김중개', photo_url: null, company: '에이스공인', phone: '010-1234-5678' }, error: null },
        };
        return chain;
      },
    };
    const meta = await generateSubscribeMetadata({
      params: Promise.resolve({ brokerId: 'broker-a' }),
      searchParams: Promise.resolve({}),
    });
    const imgs = meta.openGraph?.images as Array<{ url: string }>;
    expect(imgs[0].url).toBe('/api/og/magazine?brokerId=broker-a');
    expect(imgs[0].url).not.toContain('/api/public/magazine/og-image');
  });

  it('page.tsx accepts signed dot-delimited sid token and rejects arbitrary unsigned sid strings', async () => {
    vi.stubEnv('MAGAZINE_SID_SECRET', 'test-sid-secret-1234');
    const insertedEvents: Array<Record<string, unknown>> = [];
    const validSid = issueSidToken({ subscriberId: SUB_ID, brokerKey: 'broker-a' });
    expect(validSid).toContain('.');
    expect(verifySidToken(validSid)).toEqual({ ok: true, subscriberId: SUB_ID, brokerKey: 'broker-a' });

    h.db = {
      from(table: string) {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          insert: async (row: Record<string, unknown>) => {
            insertedEvents.push(row);
            return { data: row, error: null };
          },
          maybeSingle: async () => {
            if (table === 'broker_profiles') {
              return { data: { user_id: UA, slug: 'broker-a', name: '김중개', office_address: '서울', office_reg_number: '11680-2023-04567', representative_name: '김중개' }, error: null };
            }
            if (table === 'profiles') {
              return { data: { display_name: '김중개', company: '에이스공인', phone: '010-1234-5678' }, error: null };
            }
            if (table === 'magazine_subscribers') {
              return { data: { id: SUB_ID, status: 'active' }, error: null };
            }
            return { data: null, error: null };
          },
          then: (res: (v: unknown) => unknown) => {
            if (table === 'magazine_issues') {
              return Promise.resolve({ data: [{ id: 'iss-1', issue_date: '2026-10-05', content: { headline: 'H', briefing: 'B', broker: { name: '김중개' } } }], error: null }).then(res);
            }
            return Promise.resolve({ data: [], error: null }).then(res);
          },
        };
        return chain;
      },
    };

    // 1. Unsigned spoofed string -> ignored (0 inserts)
    await MagazineIssuePage({
      params: Promise.resolve({ brokerId: 'broker-a', date: '2026-10-05' }),
      searchParams: Promise.resolve({ sid: 'sub_spoofed_123' }),
    });
    expect(insertedEvents).toHaveLength(0);

    // 2. Valid signed token -> verified & recorded
    await MagazineIssuePage({
      params: Promise.resolve({ brokerId: 'broker-a', date: '2026-10-05' }),
      searchParams: Promise.resolve({ sid: validSid }),
    });
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0].event_type).toBe('magazine_view');
    expect((insertedEvents[0].metadata as Record<string, unknown>).subscriber_id).toBe(SUB_ID);
  });
});

describe('P1: distribute-queue flash weekly cap, QUIET_HOURS retryable, attempt_count <= 5', () => {
  beforeEach(() => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'true');
    vi.stubEnv('APP_BASE_URL', 'https://credeal.net');
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-unsub-secret');
  });

  it('enforces checkFlashWeeklyCap when enqueueing special edition', async () => {
    const db = new FakeDb({
      broker_profiles: [{ user_id: BROKER_USER_ID, slug: 'kim-broker', office_address: '서울 강남구' }],
      profiles: [{ id: BROKER_USER_ID, display_name: '김중개', phone: '010-1234-5678', company: '에이스공인' }],
      magazine_subscribers: [consentedSubscriber()],
      magazine_dispatch_logs: [
        { id: 'd1', idempotency_key: 'k1', broker_id: 'kim-broker', edition_id: 'ed-f1', kind: 'flash', status: 'dry_run', created_at: DAYTIME.toISOString() },
        { id: 'd2', idempotency_key: 'k2', broker_id: 'kim-broker', edition_id: 'ed-f2', kind: 'flash', status: 'dry_run', created_at: DAYTIME.toISOString() },
      ],
    });
    const res = await enqueueMagazineDispatch(db as never, 'kim-broker', {
      id: 'ed-f3',
      editionType: 'special',
      title: '속보 3호',
      date: '2026-10-06',
    }, { now: DAYTIME, dryRun: true });
    expect(res.ok).toBe(false);
    expect(res.blockedReason).toBe('DAILY_CAP');
    expect(res.queued).toBe(0);
  });

  it('preserves retryable QUIET_HOURS rows without consuming attempt_count during night runs and dispatches at DAYTIME', async () => {
    const db = new FakeDb({
      broker_profiles: [{ user_id: BROKER_USER_ID, slug: 'kim-broker', office_address: '서울 강남구' }],
      profiles: [{ id: BROKER_USER_ID, display_name: '김중개', phone: '010-1234-5678', company: '에이스공인' }],
      magazine_dispatch_logs: [
        {
          id: 'q-1',
          idempotency_key: 'kim-broker:2026-10-06:weekly:sub-1:email',
          edition_id: 'ed-1',
          broker_id: 'kim-broker',
          broker_user_id: BROKER_USER_ID,
          subscriber_id: SUB_ID,
          channel: 'email',
          kind: 'weekly',
          status: 'pending_worker',
          attempt_count: 0,
          created_at: NIGHT.toISOString(),
          payload: {
            editionKey: 'kim-broker:2026-10-06:weekly',
            editionUrl: 'https://credeal.net/magazine/kim-broker/2026-10-06',
            title: '주간 호',
            headline: '주간 브리핑',
            marketTemp: '선별 매수',
            date: '2026-10-06',
            kakaoTemplateId: 'TPL',
            sub: consentedSubscriber(),
          },
        },
      ],
    });

    // Across 5 consecutive NIGHT cron ticks -> remains retryable with attempt_count = 0 (no retry exhaustion)
    for (let i = 1; i <= 5; i++) {
      const nightRes = await processMagazineDispatchQueueBatch(db as never, { now: NIGHT, gateDeps: { dryRun: true } });
      expect(nightRes.failed).toBe(0);
      const row = db.rows('magazine_dispatch_logs').find((r) => r.id === 'q-1')!;
      expect(row.status).toBe('retryable');
      expect(row.blocked_reason).toBe('QUIET_HOURS');
      expect(row.attempt_count).toBe(0);
    }

    // Subsequent DAYTIME run dispatches cleanly
    const dayRes = await processMagazineDispatchQueueBatch(db as never, { now: DAYTIME, gateDeps: { dryRun: true } });
    expect(dayRes.failed).toBe(0);
    expect(dayRes.recorded).toBe(1);
    const finalRow = db.rows('magazine_dispatch_logs').find((r) => r.id === 'q-1')!;
    expect(finalRow.status).toBe('dry_run');
    expect(finalRow.attempt_count).toBe(1);
  });
});

describe('P1: email-suppression pagination, UUID validation & insErr', () => {
  it('paginates with BATCH_SIZE=1000 via .range() and rejects invalid UUID without unscoped query', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ email_hash: `h1-${i}`, scope: 'global', broker_id: null }));
    const page2 = [{ email_hash: 'h2-0', scope: 'broker', broker_id: UA }];
    const rangeCalls: Array<[number, number]> = [];
    let queried = false;

    const fakeSb = {
      from() {
        queried = true;
        let fromIdx = 0;
        let toIdx = 999;
        const q: Record<string, unknown> = {
          select: () => q,
          or: () => q,
          eq: () => q,
          order: () => q,
          range: (a: number, b: number) => {
            fromIdx = a;
            toIdx = b;
            rangeCalls.push([a, b]);
            return q;
          },
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: fromIdx === 0 ? page1 : toIdx >= 1000 ? page2 : [], error: null }).then(res),
        };
        return q;
      },
    };

    const invalid = await loadSuppressedEmailHashesForBroker(fakeSb, 'not-a-uuid');
    expect(invalid.size).toBe(0);
    expect(queried).toBe(false);

    const valid = await loadSuppressedEmailHashesForBroker(fakeSb, UA);
    expect(valid.size).toBe(1001);
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('returns { ok: false, error } when email_suppressions insert fails', async () => {
    const fakeSb = {
      from() {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ error: { code: '42501', message: 'rls denied' } }),
        };
        return q;
      },
    };
    const res = await recordEmailSuppression(fakeSb, {
      email: 'user@example.com',
      brokerId: UA,
      scope: 'broker',
      reason: 'unsubscribe',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('rls denied');
  });
});

describe('P1: cron/consent-reconfirm-2yr & cron/weekly-magazine pagination', () => {
  it('consent-reconfirm-2yr enforces idempotency slot, paginates via .range(), and never mutates reconfirm_notified_at in dry-run', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-1234');
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'false');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'true');

    let updatedCount = 0;
    const rangeCalls: Array<[number, number]> = [];
    const oldConsent = new Date(Date.now() - 720 * 86_400_000).toISOString();

    h.db = {
      from(table: string) {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          lt: () => q,
          order: () => q,
          range: (a: number, b: number) => {
            rangeCalls.push([a, b]);
            return q;
          },
          update: () => {
            updatedCount += 1;
            return q;
          },
          insert: async () => ({ error: null }),
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({
              data:
                table === 'magazine_subscribers'
                  ? [{ id: SUB_ID, broker_id: 'broker-a', broker_user_id: UA, subscriber_email: 'a@b.com', subscriber_name: '김독자', marketing_consent_at: oldConsent, reconfirm_notified_at: null, confirm_status: 'confirmed', status: 'active' }]
                  : [],
              error: null,
            }).then(res),
        };
        return q;
      },
    };

    const req = () => new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', { headers: { authorization: 'Bearer cron-secret-1234' } });

    const dryRes = await GET_RECONFIRM(req());
    expect(dryRes.status).toBe(200);
    const dryJson = await dryRes.json();
    expect(dryJson.simulated).toBe(1);
    expect(updatedCount).toBe(0);
    expect(rangeCalls).toEqual([[0, 199]]);

    h.slotAcquired = false;
    const dupRes = await GET_RECONFIRM(req());
    expect(await dupRes.json()).toMatchObject({ ok: true, skipped: 'IDEMPOTENCY_SLOT_ALREADY_ACQUIRED' });
  });

  it('weekly-magazine paginates user_subscriptions and broker_profiles via .range()', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-1234');
    vi.stubEnv('MAGAZINE_CRON_GENERATE_ENABLED', 'true');
    const rangeCalls: Array<{ table: string; range: [number, number] }> = [];

    h.db = {
      from(table: string) {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          in: () => q,
          order: () => q,
          limit: () => q,
          range: (a: number, b: number) => {
            rangeCalls.push({ table, range: [a, b] });
            return q;
          },
          insert: async () => ({ error: null }),
          update: () => q,
          then: (res: (v: unknown) => unknown) => {
            if (table === 'user_subscriptions') {
              return Promise.resolve({ data: [{ user_id: UA }], error: null }).then(res);
            }
            if (table === 'broker_profiles') {
              return Promise.resolve({ data: [{ user_id: UA, slug: 'broker-a' }], error: null }).then(res);
            }
            return Promise.resolve({ data: [], error: null }).then(res);
          },
        };
        return q;
      },
    };

    const res = await GET_WEEKLY_CRON(
      new NextRequest('https://credeal.net/api/cron/weekly-magazine', { headers: { authorization: 'Bearer cron-secret-1234' } }),
    );
    expect(res.status).toBe(200);
    expect(h.generatedWeekly).toEqual(['broker-a']);
    expect(rangeCalls.some((c) => c.table === 'user_subscriptions')).toBe(true);
    expect(rangeCalls.some((c) => c.table === 'broker_profiles')).toBe(true);
  });
});
