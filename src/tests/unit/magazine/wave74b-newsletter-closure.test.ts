/**
 * WP-7.4B Newsletter Subsystem Closure Verification Suite
 *  - P0-1: DELETE /api/magazine/editions cleans up magazine_issues (or syncs surviving same-day edition) + tombstone
 *          & findIssueForDate immediately returns null on missing/deleted ?edition=<uuid>
 *  - P1-1: /magazine root page never queries unfiltered cross-tenant magazine_issues; fallback CTA points to /hub
 *  - P1-2: POST /api/magazine/[brokerId] body-save mode validates via normalizeContentForPublish + parseEditionContent,
 *          rejects mock/needsQualityReview/invalid payloads (422), enforces server broker identity & PUBLISHED_LOCKED (409)
 *  - P1-4: SSR ?sid= respects isMagazineTrackingEnabled(), ignores prefetch/bot/scanner headers,
 *          and /api/public/magazine/analytics deduplicates subscriber magazine_view within 60s
 *  - P2-1..3: KST date conversion (toKstDate vs .slice(0,10)), dynamic OG share URLs, and magazine-editor LOC budget
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { createFakeDb, eqValue, filterRows, inKeys, rowVisibleTo, type FakeCall } from './authz-fake-db';
import { __resetMemoryRateLimit } from '@/lib/magazine/public-guard';
import { issueSidToken } from '@/domain/magazine/sid-token';
import {
  findIssueForDate,
  isPrefetchOrScannerRequest,
  listPublishedEntries,
} from '@/lib/magazine/public-page-data';
import { mapServerEditionRowToSummary } from '@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types';

const BROKER_USER = '11111111-1111-4111-8111-111111111111';
const SUB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIS_ID = '22222222-2222-4222-8222-222222222222';
const ED_PRIMARY = 'eeeeeeee-1111-4111-8111-111111111111';
const ED_SIBLING = 'eeeeeeee-2222-4222-8222-222222222222';
const ED_DRAFT = 'eeeeeeee-3333-4333-8333-333333333333';
const SID_SECRET = 'wave74b-sid-secret-1234567890';

const h = vi.hoisted(() => ({
  db: null as unknown as { client: Record<string, unknown>; calls: FakeCall[] },
  unauth: false,
  ctx: {
    userId: '11111111-1111-4111-8111-111111111111',
    slug: 'broker-a',
    displayName: '김중개',
    brokerKeys: ['broker-a', '11111111-1111-4111-8111-111111111111'],
  },
  viewer: null as null | { userId: string },
  headersMap: new Map<string, string>(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.db.client,
}));

vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => {
      if (h.unauth) {
        return {
          ctx: null,
          error: actual.jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401),
        };
      }
      return { ctx: h.ctx, error: null };
    },
  };
});

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: async () => h.viewer,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => h.headersMap.get(name.toLowerCase()) ?? null,
    has: (name: string) => h.headersMap.has(name.toLowerCase()),
  }),
}));

vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));

import { DELETE as DELETE_EDITION } from '@/app/api/magazine/editions/route';
import { POST as POST_BROKER_MAGAZINE } from '@/app/api/magazine/[brokerId]/route';
import { POST as POST_PUBLIC_ANALYTICS } from '@/app/api/public/magazine/analytics/route';
import MagazineRootPage from '@/app/(magazine)/magazine/page';
import MagazineIssuePage from '@/app/(magazine)/magazine/[brokerId]/[date]/page';

function setupMutableDb(seed?: {
  editions?: Array<Record<string, unknown>>;
  issues?: Array<Record<string, unknown>>;
  activityEvents?: Array<Record<string, unknown>>;
  brokerProfile?: Record<string, unknown> | null;
}) {
  let editions = [...(seed?.editions ?? [])];
  let issues = [...(seed?.issues ?? [])];
  const activityEvents = [...(seed?.activityEvents ?? [])];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  const brokerProfile =
    seed?.brokerProfile !== undefined
      ? seed.brokerProfile
      : {
          user_id: BROKER_USER,
          slug: 'broker-a',
          name: '김중개',
          bio: '강남 빌딩 전문',
          office_address: '서울특별시 강남구 테헤란로 100',
          office_reg_number: '11680-2023-04567',
          representative_name: '김중개',
          specialty_regions: ['강남'],
          specialty_assets: ['꼬마빌딩'],
          is_public: true,
        };

  const fake = createFakeDb((call: FakeCall) => {
    switch (call.table) {
      case 'broker_profiles': {
        if (!brokerProfile) return { data: null };
        const qSlug = eqValue(call, 'slug');
        const qUid = eqValue(call, 'user_id');
        if (qSlug && qSlug !== brokerProfile.slug) return { data: null };
        if (qUid && qUid !== brokerProfile.user_id) return { data: null };
        return { data: brokerProfile };
      }
      case 'profiles':
        return {
          data: {
            id: BROKER_USER,
            display_name: '김중개',
            photo_url: null,
            company: '에이스공인중개사사무소',
            phone: '010-1234-5678',
            tagline: '강남 수익형 전문',
          },
        };
      case 'magazine_editions': {
        if (call.op === 'delete') {
          const targetId = eqValue(call, 'id');
          const keys = inKeys(call, 'broker_id') ?? [];
          editions = editions.filter(
            (r) => !(r.id === targetId && keys.includes(String(r.broker_id))),
          );
          return { data: null };
        }
        if (call.op === 'select' && call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) {
          const idVal = eqValue(call, 'id');
          const keys = inKeys(call, 'broker_id');
          const statusVal = eqValue(call, 'status');
          const matched = editions.filter((r) => {
            if (r.id !== idVal) return false;
            if (keys && !keys.includes(String(r.broker_id))) return false;
            if (statusVal && r.status !== statusVal) return false;
            return true;
          });
          // findIssueForDate uses .limit(1) expecting array or row; assertOwnsRow / resolveEventTarget use .maybeSingle()
          const hasLimit = call.filters.some((f) => f[0] === 'limit');
          return { data: hasLimit ? matched : (matched[0] ?? null) };
        }
        return { data: filterRows(editions, call) };
      }
      case 'magazine_issues': {
        if (call.op === 'delete') {
          const keys = inKeys(call, 'broker_id') ?? [];
          const dVal = eqValue(call, 'issue_date');
          issues = issues.filter(
            (r) => !(keys.includes(String(r.broker_id)) && r.issue_date === dVal),
          );
          return { data: null };
        }
        if (call.op === 'upsert') {
          const p = call.payload as Record<string, unknown>;
          const idx = issues.findIndex(
            (r) => r.broker_id === p.broker_id && r.issue_date === p.issue_date,
          );
          if (idx >= 0) {
            issues[idx] = { ...issues[idx], ...p };
          } else {
            issues.push({ id: `iss-${issues.length + 1}`, ...p });
          }
          return { data: p };
        }
        if (call.op === 'select' && call.filters.some((f) => f[0] === 'eq' && f[1] === 'id')) {
          return { data: rowVisibleTo(issues, call, 'id') ?? issues.find((r) => r.id === eqValue(call, 'id')) ?? null };
        }
        const filtered = filterRows(issues, call);
        return { data: filtered };
      }
      case 'magazine_subscribers':
        return {
          data: {
            id: SUB_ID,
            broker_id: 'broker-a',
            status: 'active',
            interest_profile: {},
            subscribed_at: '2026-09-01T00:00:00Z',
          },
        };
      case 'magazine_analytics_events':
        if (call.op === 'insert') return { data: call.payload };
        return { data: [], count: 0 };
      case 'activity_events':
        if (call.op === 'insert') {
          const row = {
            id: `act-${activityEvents.length + 1}`,
            created_at: new Date().toISOString(),
            ...(call.payload as Record<string, unknown>),
          };
          activityEvents.push(row);
          return { data: row };
        }
        return { data: activityEvents, count: activityEvents.length };
      default:
        return { data: [] };
    }
  });

  const client = fake.client as unknown as Record<string, unknown>;
  client.rpc = async (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    if (name === 'magazine_rl_hit') {
      return { data: null, error: { code: 'PGRST202', message: 'fallback' } };
    }
    return { data: null, error: null };
  };

  h.db = { client, calls: fake.calls };
  return {
    getEditions: () => editions,
    getIssues: () => issues,
    getActivityEvents: () => activityEvents,
    rpcCalls,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('MAGAZINE_SID_SECRET', SID_SECRET);
  __resetMemoryRateLimit();
  h.unauth = false;
  h.viewer = null;
  h.headersMap = new Map();
  h.ctx = {
    userId: BROKER_USER,
    slug: 'broker-a',
    displayName: '김중개',
    brokerKeys: ['broker-a', BROKER_USER],
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[P0-1] DELETE /api/magazine/editions + findIssueForDate closure', () => {
  const ISSUE_DATE = '2026-10-16';

  it('deletes magazine_issues and records tombstone when no sibling published edition remains, removing it from listPublishedEntries', async () => {
    const state = setupMutableDb({
      editions: [
        {
          id: ED_PRIMARY,
          broker_id: 'broker-a',
          edition_type: 'monthly',
          edition_label: '2026-10',
          status: 'published',
          title: '10월 강남 빌딩 리포트',
          published_at: '2026-10-15T22:30:00Z', // 2026-10-16 07:30 KST
          created_at: '2026-10-15T20:00:00Z',
          content: {
            headline: '10월 강남 빌딩 리포트',
            briefing: '강남권 매수 문의 증가',
          },
        },
      ],
      issues: [
        {
          id: 'iss-oct-16',
          broker_id: 'broker-a',
          issue_date: ISSUE_DATE,
          updated_at: '2026-10-15T22:30:00Z',
          content: {
            id: ED_PRIMARY,
            headline: '10월 강남 빌딩 리포트',
            briefing: '강남권 매수 문의 증가',
          },
        },
      ],
    });

    const res = await DELETE_EDITION(
      new NextRequest(`https://credeal.net/api/magazine/editions?id=${ED_PRIMARY}`, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, id: ED_PRIMARY, issueDate: ISSUE_DATE });

    // Both magazine_editions and magazine_issues are deleted
    expect(state.getEditions()).toHaveLength(0);
    expect(state.getIssues()).toHaveLength(0);

    // Non-PII tombstone recorded in activity_events
    const tombstones = state
      .getActivityEvents()
      .filter((e) => e.event_type === 'magazine_edition_deleted');
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]).toMatchObject({
      actor_id: BROKER_USER,
      entity_type: 'magazine_editions',
      entity_id: ED_PRIMARY,
      metadata: { edition_id: ED_PRIMARY, issue_date: ISSUE_DATE },
    });

    // Archive / latest entries no longer surface the deleted issue
    const entries = await listPublishedEntries(
      h.db.client,
      { user_id: BROKER_USER, slug: 'broker-a' },
      10,
      new Date('2026-10-20T00:00:00Z'),
    );
    expect(entries).toHaveLength(0);
  });

  it('syncs magazine_issues to surviving sibling published edition when another same-day published edition remains', async () => {
    const state = setupMutableDb({
      editions: [
        {
          id: ED_PRIMARY,
          broker_id: 'broker-a',
          edition_type: 'special',
          edition_label: '긴급 속보',
          status: 'published',
          title: '삭제될 속보 호',
          published_at: '2026-10-16T03:00:00Z',
          content: {
            id: ED_PRIMARY,
            issueDate: ISSUE_DATE,
            headline: '삭제될 속보 호',
            briefing: '속보 본문',
          },
        },
        {
          id: ED_SIBLING,
          broker_id: 'broker-a',
          edition_type: 'weekly',
          edition_label: ISSUE_DATE,
          status: 'published',
          title: '유지될 정기 주간호',
          published_at: '2026-10-16T01:00:00Z',
          content: {
            id: ED_SIBLING,
            issueDate: ISSUE_DATE,
            headline: '유지될 정기 주간호',
            briefing: '주간 브리핑 본문',
          },
        },
      ],
      issues: [
        {
          id: 'iss-oct-16',
          broker_id: 'broker-a',
          issue_date: ISSUE_DATE,
          content: {
            id: ED_PRIMARY,
            issueDate: ISSUE_DATE,
            headline: '삭제될 속보 호',
          },
        },
      ],
    });

    const res = await DELETE_EDITION(
      new NextRequest(`https://credeal.net/api/magazine/editions?id=${ED_PRIMARY}`, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(200);
    expect(state.getEditions().map((e) => e.id)).toEqual([ED_SIBLING]);
    expect(state.getIssues()).toHaveLength(1);
    expect((state.getIssues()[0].content as Record<string, unknown>).id).toBe(ED_SIBLING);
    expect((state.getIssues()[0].content as Record<string, unknown>).headline).toBe('유지될 정기 주간호');

    // Deleting a draft does not touch published magazine_issues
    state.getEditions().push({
      id: ED_DRAFT,
      broker_id: 'broker-a',
      status: 'draft',
      published_at: null,
      created_at: '2026-10-16T04:00:00Z',
      content: { issueDate: ISSUE_DATE, headline: '초안' },
    });
    const draftDelRes = await DELETE_EDITION(
      new NextRequest(`https://credeal.net/api/magazine/editions?id=${ED_DRAFT}`, {
        method: 'DELETE',
      }),
    );
    expect(draftDelRes.status).toBe(200);
    expect(state.getIssues()).toHaveLength(1);
  });

  it('findIssueForDate returns null immediately on missing/deleted ?edition=<uuid> even if an orphan magazine_issues row exists', async () => {
    let issuesQueried = false;
    const orphanClient = {
      from(table: string) {
        if (table === 'magazine_editions') {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'magazine_issues') {
          issuesQueried = true;
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [{ id: 'orphan-iss', content: { headline: '고아 레거시 행' } }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await findIssueForDate(orphanClient, 'broker-a', ISSUE_DATE, ED_PRIMARY);
    expect(result).toBeNull();
    expect(issuesQueried).toBe(false);

    // Pre-migration missing magazine_editions table (42P01) still falls back to magazine_issues
    const preMigrationClient = {
      from(table: string) {
        if (table === 'magazine_editions') {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: async () => ({
                      data: null,
                      error: { code: '42P01', message: 'relation "magazine_editions" does not exist' },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ id: 'legacy-iss', content: { headline: '마이그레이션 이전 호' } }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };
    const fallbackResult = await findIssueForDate(preMigrationClient, 'broker-a', ISSUE_DATE, ED_PRIMARY);
    expect(fallbackResult?.headline).toBe('마이그레이션 이전 호');
  });
});

describe('[P1-1] /magazine root page cross-tenant isolation & /hub CTA', () => {
  it('never queries unfiltered cross-tenant magazine_issues for unauthenticated visitors and links fallback CTA to /hub', async () => {
    setupMutableDb({
      issues: [
        {
          id: 'other-tenant-iss',
          broker_id: 'other-tenant-slug',
          issue_date: '2026-10-16',
          content: { headline: '타 중개사 호' },
        },
      ],
    });
    h.viewer = null;

    const tree = await MagazineRootPage({
      searchParams: Promise.resolve({ sid: 'sensitive-sid-token', qa: '1' }),
    });
    const html = renderToStaticMarkup(tree);

    // Zero unfiltered magazine_issues queries
    const unfilteredIssueCalls = h.db.calls.filter(
      (c) =>
        c.table === 'magazine_issues' &&
        !c.filters.some((f) => (f[0] === 'in' || f[0] === 'eq') && f[1] === 'broker_id'),
    );
    expect(unfilteredIssueCalls).toHaveLength(0);
    expect(h.db.calls).toHaveLength(0);

    // Neutral landing rendered with /guide CTA (no /pulse)
    expect(html).toContain('CREDEAL MAGAZINE');
    expect(html).toContain('href="/guide"');
    expect(html).not.toContain('href="/pulse"');
    expect(html).not.toContain('other-tenant-slug');
  });

  it('new authenticated user with no own slug or published issue stays on neutral landing without cross-tenant redirect', async () => {
    setupMutableDb({
      brokerProfile: null,
      issues: [
        {
          id: 'other-tenant-iss',
          broker_id: 'other-tenant-slug',
          issue_date: '2026-10-16',
          content: { headline: '타 중개사 호' },
        },
      ],
    });
    h.viewer = { userId: '99999999-9999-4999-8999-999999999999' };

    const tree = await MagazineRootPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('href="/guide"');

    const unfilteredIssueCalls = h.db.calls.filter(
      (c) =>
        c.table === 'magazine_issues' &&
        !c.filters.some((f) => (f[0] === 'in' || f[0] === 'eq') && f[1] === 'broker_id'),
    );
    expect(unfilteredIssueCalls).toHaveLength(0);
  });
});

describe('[P1-2] POST /api/magazine/[brokerId] body-save hardening', () => {
  const PAST = '2026-10-10';
  const postBody = (body: Record<string, unknown>) =>
    POST_BROKER_MAGAZINE(
      new NextRequest('https://credeal.net/api/magazine/broker-a', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ issueDate: PAST, ...body }),
      }),
      { params: Promise.resolve({ brokerId: 'broker-a' }) },
    );

  it('rejects missing headline, empty body, mock, needsQualityReview, and malformed payloads with 422', async () => {
    const state = setupMutableDb();

    // 1. Missing headline
    expect((await postBody({})).status).toBe(422);
    // 2. Explicit empty briefing body
    expect((await postBody({ headline: '제목만 있음', briefing: '   ' })).status).toBe(422);
    // 3. Mock generation payload
    const mockRes = await postBody({
      headline: '모의 생성 제목',
      briefing: '모의 생성 본문입니다.',
      generation: { isMock: true },
    });
    expect(mockRes.status).toBe(422);
    expect((await mockRes.json()).error.code).toBe('MOCK_CONTENT');

    // 4. needsQualityReview === true
    const qgFlagRes = await postBody({
      headline: '품질 미통과 제목',
      briefing: '품질 미통과 본문입니다.',
      generation: { needsQualityReview: true },
    });
    expect(qgFlagRes.status).toBe(422);

    // 5. qualityGate.passed === false
    const qgFailedRes = await postBody({
      headline: '품질 게이트 실패',
      briefing: '본문 내용입니다.',
      generation: { qualityGate: { passed: false, status: 'needs_review' } },
    });
    expect(qgFailedRes.status).toBe(422);

    // 6. Malformed schema field (poll not an object)
    const malformedRes = await postBody({
      headline: '정상 제목',
      briefing: '정상 본문',
      poll: 'invalid-poll' as unknown as Record<string, unknown>,
    });
    expect(malformedRes.status).toBe(422);

    expect(state.getIssues()).toHaveLength(0);
  });

  it('enforces server-resolved broker identity and blocks overwriting published issue without correctionReason (409 PUBLISHED_LOCKED)', async () => {
    const state = setupMutableDb();

    // First publish succeeds and overwrites spoofed client broker identity
    const firstRes = await postBody({
      headline: '강남 역세권 주간 브리핑',
      briefing: '임차 수요가 꾸준히 유입되고 있습니다.',
      broker: {
        name: '가짜해커',
        slug: 'spoofed-slug',
        company: '유령중개법인',
        phone: '010-9999-9999',
      },
    });
    expect(firstRes.status).toBe(200);
    expect(state.getIssues()).toHaveLength(1);
    const savedBroker = (state.getIssues()[0].content as { broker: Record<string, unknown> }).broker;
    expect(savedBroker).toMatchObject({
      name: '김중개',
      slug: 'broker-a',
      company: '에이스공인중개사사무소',
      phone: '010-1234-5678',
    });

    // Second save on the same published (slug, issueDate) without correctionReason -> 409 PUBLISHED_LOCKED
    const lockedRes = await postBody({
      headline: '무단 덮어쓰기 시도',
      briefing: '정정 사유 없는 덮어쓰기',
    });
    expect(lockedRes.status).toBe(409);
    expect((await lockedRes.json()).error.code).toBe('PUBLISHED_LOCKED');
    expect((state.getIssues()[0].content as Record<string, unknown>).headline).toBe('강남 역세권 주간 브리핑');

    // Explicit correctionReason allows controlled correction update
    const correctedRes = await postBody({
      headline: '강남 역세권 주간 브리핑 (정정)',
      briefing: '거래 면적 표기 오타를 바로잡았습니다.',
      correctionReason: '면적 단위 오기 정정',
    });
    expect(correctedRes.status).toBe(200);
    expect((state.getIssues()[0].content as Record<string, unknown>).headline).toBe(
      '강남 역세권 주간 브리핑 (정정)',
    );
  });
});

describe('[P1-4] SSR ?sid= tracking hygiene & 60s analytics deduplication', () => {
  const VIEW_DATE = '2026-10-16';

  function seedPublishedViewerDb() {
    return setupMutableDb({
      editions: [
        {
          id: ED_PRIMARY,
          broker_id: 'broker-a',
          edition_type: 'weekly',
          edition_label: VIEW_DATE,
          status: 'published',
          title: '강남 시황 리포트',
          published_at: '2026-10-16T01:00:00Z',
          content: {
            id: ED_PRIMARY,
            issueDate: VIEW_DATE,
            headline: '강남 시황 리포트',
            briefing: '역세권 우량 빌딩 중심의 거래 흐름입니다.',
            broker: { name: '김중개' },
          },
        },
      ],
      issues: [
        {
          id: 'iss-view-1',
          broker_id: 'broker-a',
          issue_date: VIEW_DATE,
          content: {
            id: ED_PRIMARY,
            issueDate: VIEW_DATE,
            headline: '강남 시황 리포트',
            briefing: '역세권 우량 빌딩 중심의 거래 흐름입니다.',
            broker: { name: '김중개' },
          },
        },
      ],
    });
  }

  it('skips SSR magazine_view when MAGAZINE_TRACKING_ENABLED=false or on prefetch / bot / link-scanner headers', async () => {
    const state = seedPublishedViewerDb();
    const validSid = issueSidToken({ subscriberId: SUB_ID, brokerKey: 'broker-a' });

    // 1. Tracking disabled via env flag
    vi.stubEnv('MAGAZINE_TRACKING_ENABLED', 'false');
    await MagazineIssuePage({
      params: Promise.resolve({ brokerId: 'broker-a', date: VIEW_DATE }),
      searchParams: Promise.resolve({ sid: validSid }),
    });
    expect(state.getActivityEvents()).toHaveLength(0);

    // Re-enable tracking and test prefetch / bot / scanner headers
    vi.stubEnv('MAGAZINE_TRACKING_ENABLED', 'true');
    const blockedHeaderSets: Array<Record<string, string>> = [
      { purpose: 'prefetch', 'user-agent': 'Mozilla/5.0' },
      { 'sec-purpose': 'prefetch;prerender', 'user-agent': 'Mozilla/5.0' },
      { 'next-router-prefetch': '1', 'user-agent': 'Mozilla/5.0' },
      { 'x-moz': 'prefetch', 'user-agent': 'Mozilla/5.0' },
      { 'user-agent': 'kakaotalk-scrap/1.0' },
      { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' },
      { 'user-agent': 'Mozilla/5.0 Proofpoint URLDefense' },
      { 'user-agent': 'facebookexternalhit/1.1' },
    ];

    for (const hdrObj of blockedHeaderSets) {
      h.headersMap = new Map(Object.entries(hdrObj));
      expect(isPrefetchOrScannerRequest({ get: (k) => h.headersMap.get(k.toLowerCase()) ?? null })).toBe(true);
      await MagazineIssuePage({
        params: Promise.resolve({ brokerId: 'broker-a', date: VIEW_DATE }),
        searchParams: Promise.resolve({ sid: validSid }),
      });
    }
    expect(state.getActivityEvents()).toHaveLength(0);
  });

  it('deduplicates subscriber magazine_view within 60s between SSR ?sid= and POST /api/public/magazine/analytics', async () => {
    const state = seedPublishedViewerDb();
    const validSid = issueSidToken({ subscriberId: SUB_ID, brokerKey: 'broker-a' });
    h.headersMap = new Map([['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)']]);

    // Step 1: SSR page load records 1 magazine_view
    await MagazineIssuePage({
      params: Promise.resolve({ brokerId: 'broker-a', date: VIEW_DATE }),
      searchParams: Promise.resolve({ sid: validSid }),
    });
    expect(state.getActivityEvents().filter((e) => e.event_type === 'magazine_view')).toHaveLength(1);

    // Step 2: Client ViewerTrackProvider fires POST /api/public/magazine/analytics within 60s
    const analyticsRes = await POST_PUBLIC_ANALYTICS(
      new NextRequest('https://credeal.net/api/public/magazine/analytics', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'x-forwarded-for': '203.0.113.55' },
        body: JSON.stringify({
          edition_id: ED_PRIMARY,
          visitor_id: VIS_ID,
          event_type: 'page_view',
          metadata: { pv: 'pv74b001', sid: validSid },
        }),
      }),
    );
    expect(analyticsRes.status).toBe(200);
    expect(await analyticsRes.json()).toMatchObject({ ok: true, tracked: true });

    // Still exactly 1 magazine_view in activity_events (no double-counting!)
    expect(state.getActivityEvents().filter((e) => e.event_type === 'magazine_view')).toHaveLength(1);
    // Edition view_count RPC still fired once
    expect(state.rpcCalls.filter((r) => r.name === 'increment_edition_views')).toHaveLength(1);

    // Step 3: If the prior SSR view was > 60s ago, a new page_view IS recorded in activity_events
    state.getActivityEvents()[0].created_at = new Date(Date.now() - 65_000).toISOString();
    const secondVisitor = '33333333-3333-4333-8333-333333333333';
    const laterRes = await POST_PUBLIC_ANALYTICS(
      new NextRequest('https://credeal.net/api/public/magazine/analytics', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'x-forwarded-for': '203.0.113.56' },
        body: JSON.stringify({
          edition_id: ED_PRIMARY,
          visitor_id: secondVisitor,
          event_type: 'page_view',
          metadata: { pv: 'pv74b002', sid: validSid },
        }),
      }),
    );
    expect(laterRes.status).toBe(200);
    expect(state.getActivityEvents().filter((e) => e.event_type === 'magazine_view')).toHaveLength(2);
  });
});

describe('[P2-1..3] KST date mapping, dynamic OG share URLs & LOC budget', () => {
  it('mapServerEditionRowToSummary derives KST issueDate via toKstDate instead of UTC .slice(0, 10)', () => {
    const summary = mapServerEditionRowToSummary(
      {
        id: ED_PRIMARY,
        edition_type: 'monthly',
        edition_label: '2026-10',
        title: '야간 발행 호',
        status: 'published',
        published_at: '2026-10-15T22:30:00Z', // 2026-10-16 07:30 KST
        content: { headline: '야간 발행 호' },
      },
      'broker-a',
      ({ brokerSlug, issueDate }) => `https://credeal.net/magazine/${brokerSlug}/${issueDate}`,
    );
    expect(summary.issueDate).toBe('2026-10-16');
    expect(summary.publicUrl).toBe('https://credeal.net/magazine/broker-a/2026-10-16');
  });

  it('enforces dynamic buildOgImageUrl + resolvePublicBaseUrl and keeps magazine-editor/page.tsx <= 3790 LOC', () => {
    const editorPagePath = path.resolve(
      process.cwd(),
      'src/app/(broker)/broker/magazine-editor/page.tsx',
    );
    const outreachTabPath = path.resolve(
      process.cwd(),
      'src/components/magazine-editor/EditorOutreachTab.tsx',
    );
    const editorSrc = fs.readFileSync(editorPagePath, 'utf8');
    const outreachSrc = fs.readFileSync(outreachTabPath, 'utf8');

    const lineCount = editorSrc.split(/\r?\n/).length;
    expect(lineCount).toBeLessThanOrEqual(3790);
    expect(editorSrc).toContain('buildOgImageUrl');
    expect(editorSrc).toContain('resolvePublicBaseUrl');
    expect(editorSrc).not.toContain('/og-default.png');
    expect(editorSrc).not.toContain('publishedAt?.slice(0, 10)');

    expect(outreachSrc).toContain('resolvePublicBaseUrl');
    expect(outreachSrc).toContain('buildOgImageUrl');
    expect(outreachSrc).not.toContain('window.location.origin');
    expect(outreachSrc).not.toContain('/og-default.png');
  });
});
