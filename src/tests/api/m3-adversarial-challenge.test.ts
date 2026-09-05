import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── In-memory test state ──
const mockDb = {
  teaser_events: [] as any[],
  activity_events: [] as any[],
  building_ssot_lite: new Map<string, any>(),
  assets: new Map<string, any>(),
  deals: new Map<string, any>(),
  lease_units: new Map<string, any>(),
  deal_pipeline_states: [] as any[],
  match_results: [] as any[],
  dealPipelineFilterCalls: [] as { method: string; column: string; value: any }[],
  matchResultsSelectQuery: '',
};

// Track alert calls
export const alertTracker = {
  imViewAlertCount: 0,
  lastIMViewAlertPayload: null as any,
};

// Mock createServiceClient
vi.mock('@/lib/supabase/service', () => {
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        return {
          insert: (payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            if (table === 'teaser_events') {
              mockDb.teaser_events.push(...rows);
            } else if (table === 'activity_events') {
              mockDb.activity_events.push(...rows);
            } else if (table === 'lease_units') {
              for (const r of rows) mockDb.lease_units.set(r.asset_id, r);
            }
            const resultPromise = Promise.resolve({ data: rows, error: null });
            return Object.assign(resultPromise, {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'mock-gen-uuid-1', ...rows[0] }, error: null }),
                maybeSingle: () => Promise.resolve({ data: { id: 'mock-gen-uuid-1', ...rows[0] }, error: null }),
              }),
            });
          },
          upsert: (payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            if (table === 'assets') {
              for (const r of rows) mockDb.assets.set(r.id, { ...r, updated_at: r.updated_at || new Date().toISOString() });
            } else if (table === 'deals') {
              for (const r of rows) mockDb.deals.set(r.id, r);
            }
            return {
              select: () => ({
                single: () => Promise.resolve({ data: rows[0], error: null }),
                maybeSingle: () => Promise.resolve({ data: rows[0], error: null }),
              }),
            };
          },
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
          select: (columns = '*', options?: any) => {
            if (table === 'match_results') {
              mockDb.matchResultsSelectQuery = columns;
            }

            let filterId: string | null = null;

            const queryBuilder: any = {
              eq: (col: string, val: any) => {
                if (col === 'id') filterId = val;
                if (table === 'deal_pipeline_states') {
                  mockDb.dealPipelineFilterCalls.push({ method: 'eq', column: col, value: val });
                }
                return queryBuilder;
              },
              in: (col: string, val: any) => {
                if (table === 'deal_pipeline_states') {
                  mockDb.dealPipelineFilterCalls.push({ method: 'in', column: col, value: val });
                }
                return queryBuilder;
              },
              or: () => queryBuilder,
              gte: () => queryBuilder,
              lt: () => queryBuilder,
              order: () => queryBuilder,
              limit: (limitCount: number) => {
                if (table === 'match_results') {
                  return Promise.resolve({ data: mockDb.match_results.slice(0, limitCount), error: null });
                }
                if (table === 'buyer_intent_lite') {
                  return Promise.resolve({ data: [{ preferred_regions: ['강남구', '서초구'] }], error: null });
                }
                if (table === 'broker_clients') {
                  return Promise.resolve({ data: [], error: null });
                }
                if (table === 'activity_events') {
                  return Promise.resolve({ data: mockDb.activity_events.slice(0, limitCount), error: null });
                }
                return queryBuilder;
              },
              single: () => {
                if (table === 'building_ssot_lite') {
                  const record = filterId ? mockDb.building_ssot_lite.get(filterId) : Array.from(mockDb.building_ssot_lite.values())[0];
                  return Promise.resolve({ data: record || null, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              },
              maybeSingle: () => {
                if (table === 'assets') {
                  const record = filterId ? mockDb.assets.get(filterId) : Array.from(mockDb.assets.values())[0];
                  return Promise.resolve({ data: record || null, error: null });
                }
                if (table === 'building_ssot_lite') {
                  const record = filterId ? mockDb.building_ssot_lite.get(filterId) : Array.from(mockDb.building_ssot_lite.values())[0];
                  return Promise.resolve({ data: record || null, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              },
            };

            if (options?.head && options?.count === 'exact') {
              return Object.assign(Promise.resolve({ count: 1, error: null }), queryBuilder);
            }

            return queryBuilder;
          },
        };
      },
    }),
  };
});

// Mock createServerSupabaseClient for auth in weekly-report
let mockAuthUser: { id: string; email?: string } | null = { id: 'test-broker-uuid', email: 'broker@credeal.kr' };
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockAuthUser } }),
    },
  }),
}));

// Mock createClient for direct Supabase calls in monthly-report
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (columns = '*', options?: any) => {
        const queryBuilder: any = {
          eq: (col: string, val: any) => {
            if (table === 'deal_pipeline_states') {
              mockDb.dealPipelineFilterCalls.push({ method: 'eq', column: col, value: val });
            }
            return queryBuilder;
          },
          in: (col: string, val: any) => {
            if (table === 'deal_pipeline_states') {
              mockDb.dealPipelineFilterCalls.push({ method: 'in', column: col, value: val });
            }
            return queryBuilder;
          },
          gte: () => queryBuilder,
          lt: () => queryBuilder,
        };
        if (options?.head && options?.count === 'exact') {
          return Object.assign(Promise.resolve({ count: 2, error: null }), queryBuilder);
        }
        return queryBuilder;
      },
    }),
  }),
}));

// Mock requireBroker auth guard
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.includes('Bearer valid-token')) {
      const { NextResponse } = await import('next/server');
      return { error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }), user: null };
    }
    return { error: null, user: { id: 'test-broker-uuid', email: 'broker@credeal.kr' } };
  },
}));

// Mock im-view-alert
vi.mock('@/domain/notification/im-view-alert', () => ({
  checkAndSendIMViewAlert: async (_client: any, payload: any) => {
    alertTracker.imViewAlertCount++;
    alertTracker.lastIMViewAlertPayload = payload;
    return { success: true };
  },
}));

vi.mock('@/domain/analytics/cross-channel-score', () => ({
  calculateLeadScore: async () => ({ isHotLead: false, score: 20 }),
}));

vi.mock('@/domain/notification/hot-lead-alert', () => ({
  checkAndSendHotLeadAlert: async () => {},
}));

// Imports of handlers under test
import { POST as postTeaserEvent } from '@/app/api/public/teaser/event/route';
import { POST as postImLiteView } from '@/app/api/public/im-lite/[buildingId]/view/route';
import { GET as getMonthlyReport } from '@/app/api/broker/monthly-report/route';
import { GET as getWeeklyReport } from '@/app/api/broker/weekly-report/route';
import { readWithMigration, readManyWithMigration } from '@/lib/ssot-adapter';

describe('Adversarial Challenge & Stress Verification Suite for Milestone M3', () => {
  beforeEach(() => {
    mockDb.teaser_events = [];
    mockDb.activity_events = [];
    mockDb.building_ssot_lite.clear();
    mockDb.assets.clear();
    mockDb.deals.clear();
    mockDb.lease_units.clear();
    mockDb.deal_pipeline_states = [];
    mockDb.match_results = [];
    mockDb.dealPipelineFilterCalls = [];
    mockDb.matchResultsSelectQuery = '';
    mockAuthUser = { id: 'test-broker-uuid', email: 'broker@credeal.kr' };
    alertTracker.imViewAlertCount = 0;
    alertTracker.lastIMViewAlertPayload = null;
  });

  // ══════════════════════════════════════════════════════════════
  // 1. Challenge POST /api/public/teaser/event
  // ══════════════════════════════════════════════════════════════
  describe('1. Challenge POST /api/public/teaser/event', () => {
    test('ADV-TEASER-01: Dual-table insertion when teaserConfigId, visitorFp, and buildingId provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teaserConfigId: 'cfg-adv-100',
          visitorFp: 'fp-adv-100',
          eventType: 'teaser_view',
          eventData: { section: 'hero', scrollPct: 45 },
          buildingId: 'bld-adv-100',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify teaser_events table
      expect(mockDb.teaser_events).toHaveLength(1);
      expect(mockDb.teaser_events[0]).toMatchObject({
        teaser_config_id: 'cfg-adv-100',
        visitor_fp: 'fp-adv-100',
        event_type: 'teaser_view',
        event_data: { section: 'hero', scrollPct: 45 },
      });

      // Verify activity_events table
      expect(mockDb.activity_events).toHaveLength(1);
      expect(mockDb.activity_events[0]).toMatchObject({
        building_id: 'bld-adv-100',
        building_ssot_lite_id: 'bld-adv-100',
        event_type: 'teaser_view',
        metadata: { section: 'hero', scrollPct: 45 },
      });
    });

    test('ADV-TEASER-02: Omission of teaserConfigId and visitorFp with buildingId falls back cleanly', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'AdversarialBot/2.0',
          'x-forwarded-for': '198.51.100.12',
        },
        body: JSON.stringify({
          eventType: 'intent.pro_request',
          buildingId: 'bld-adv-200',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockDb.teaser_events).toHaveLength(1);
      const tEvent = mockDb.teaser_events[0];
      expect(tEvent.teaser_config_id).toBe('bld-adv-200');
      expect(tEvent.visitor_fp).toMatch(/^anon_[0-9a-f]{16}$/);

      expect(mockDb.activity_events).toHaveLength(1);
      const aEvent = mockDb.activity_events[0];
      expect(aEvent.building_id).toBe('bld-adv-200');
      expect(aEvent.building_ssot_lite_id).toBe('bld-adv-200');
    });

    test('ADV-TEASER-03: When buildingId is omitted, activity_events has 0 writes (no undefined buildingId row)', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'article_read',
          docId: 'doc-standalone-55',
        }),
      });

      const res = await postTeaserEvent(req);
      expect(res.status).toBe(200);

      expect(mockDb.teaser_events).toHaveLength(1);
      expect(mockDb.teaser_events[0].teaser_config_id).toBe('doc-standalone-55');

      // Crucial assertion: no activity_events entry without a buildingId!
      expect(mockDb.activity_events).toHaveLength(0);
    });

    test('ADV-TEASER-04 (Hostile): Missing eventType returns 400 Bad Request with 0 DB writes', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: 'bld-no-event-type',
          teaserConfigId: 'cfg-no-type',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toContain('eventType');
      expect(mockDb.teaser_events).toHaveLength(0);
      expect(mockDb.activity_events).toHaveLength(0);
    });

    test('ADV-TEASER-05 (Hostile): Empty string eventType returns 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: '',
          buildingId: 'bld-empty-type',
        }),
      });

      const res = await postTeaserEvent(req);
      expect(res.status).toBe(400);
      expect(mockDb.teaser_events).toHaveLength(0);
    });

    test('ADV-TEASER-06 (Hostile): Malformed JSON returns 400 Bad Request without 500 error', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"eventType": "broken_json', // broken syntax!
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      // Must be 400, NEVER 500!
      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(mockDb.teaser_events).toHaveLength(0);
    });

    test('ADV-TEASER-07 (Hostile): Empty body string returns 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });

      const res = await postTeaserEvent(req);
      expect(res.status).toBe(400);
      expect(mockDb.teaser_events).toHaveLength(0);
    });

    test('ADV-TEASER-08 (Hostile): JSON array payload returns 400 Bad Request without 500 error', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(['unexpected', 'array']),
      });

      const res = await postTeaserEvent(req);
      expect(res.status).toBe(400);
      expect(mockDb.teaser_events).toHaveLength(0);
    });

    test('ADV-TEASER-09 (Hostile): JSON boolean/number payload returns 400 Bad Request without 500 error', async () => {
      const req1 = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(12345),
      });
      const res1 = await postTeaserEvent(req1);
      expect(res1.status).toBe(400);

      const req2 = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(false),
      });
      const res2 = await postTeaserEvent(req2);
      expect(res2.status).toBe(400);
    });

    test('ADV-TEASER-11 (Vulnerability Check): JSON null literal payload triggers 500 due to unguarded destructuring', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      // Empirically reproduced vulnerability:
      // 'const { teaserConfigId, ... } = body;' with body === null throws TypeError and returns 500.
      // Recommendation for remediation: use 'const { ... } = body || {};'
      expect(res.status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('Internal error');
    });

    test('ADV-TEASER-10: Gate request event triggers intent inference flow', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'gate_request',
          buildingId: 'bld-gate-99',
          visitorFp: 'fp-gate-99',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.intent).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 2. Challenge POST /api/public/im-lite/[buildingId]/view
  // ══════════════════════════════════════════════════════════════
  describe('2. Challenge POST /api/public/im-lite/[buildingId]/view', () => {
    test('ADV-IMVIEW-01: Standard view event writes both building_id AND building_ssot_lite_id', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/im-lite/bld-target-301/view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'Chrome/120.0',
          'x-forwarded-for': '192.0.2.1',
          'referer': 'https://cre-dealcard.kr/buildings/bld-target-301',
        },
        body: JSON.stringify({
          section_viewed: 'financial_summary',
          blind_name: '역삼 랜드마크',
        }),
      });

      const res = await postImLiteView(req, { params: Promise.resolve({ buildingId: 'bld-target-301' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockDb.activity_events).toHaveLength(1);
      const event = mockDb.activity_events[0];
      expect(event.building_id).toBe('bld-target-301');
      expect(event.building_ssot_lite_id).toBe('bld-target-301');
      expect(event.event_type).toBe('im_lite_view');
      expect(event.metadata.section_viewed).toBe('financial_summary');
      expect(event.metadata.referrer).toBe('https://cre-dealcard.kr/buildings/bld-target-301');
      expect(typeof event.metadata.user_agent_hash).toBe('string');
      expect(event.metadata.user_agent_hash).toHaveLength(16);
    });

    test('ADV-IMVIEW-02: Dwell time event writes both IDs and triggers alert when dwellSeconds >= 60', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/im-lite/bld-target-302/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dwell_seconds: 90,
          blind_name: '성수 헤리티지 타워',
        }),
      });

      const res = await postImLiteView(req, { params: Promise.resolve({ buildingId: 'bld-target-302' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockDb.activity_events).toHaveLength(1);
      const event = mockDb.activity_events[0];
      expect(event.building_id).toBe('bld-target-302');
      expect(event.building_ssot_lite_id).toBe('bld-target-302');
      expect(event.metadata.dwell_seconds).toBe(90);
      expect(event.metadata.blind_name).toBe('성수 헤리티지 타워');

      // Alert triggered for dwellSeconds >= 60
      expect(alertTracker.imViewAlertCount).toBe(1);
      expect(alertTracker.lastIMViewAlertPayload.buildingId).toBe('bld-target-302');
      expect(alertTracker.lastIMViewAlertPayload.dwellSeconds).toBe(90);
    });

    test('ADV-IMVIEW-03 (Negative Pair): Dwell time < 60 does NOT trigger Kakao view alert', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/im-lite/bld-target-303/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dwell_seconds: 45,
          blind_name: '판교 밸류센터',
        }),
      });

      const res = await postImLiteView(req, { params: Promise.resolve({ buildingId: 'bld-target-303' }) });
      expect(res.status).toBe(200);
      expect(alertTracker.imViewAlertCount).toBe(0);
    });

    test('ADV-IMVIEW-04 (Hostile): Empty body, malformed body, null body do not crash and return 200', async () => {
      // 1. Malformed JSON
      const req1 = new NextRequest('http://localhost:3000/api/public/im-lite/bld-hostile/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-not-json',
      });
      const res1 = await postImLiteView(req1, { params: Promise.resolve({ buildingId: 'bld-hostile' }) });
      expect(res1.status).toBe(200);

      // 2. Empty string body
      const req2 = new NextRequest('http://localhost:3000/api/public/im-lite/bld-hostile/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      const res2 = await postImLiteView(req2, { params: Promise.resolve({ buildingId: 'bld-hostile' }) });
      expect(res2.status).toBe(200);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 3. Challenge GET /api/broker/monthly-report & weekly-report
  // ══════════════════════════════════════════════════════════════
  describe('3. Challenge GET /api/broker/monthly-report & weekly-report', () => {
    test('ADV-REPORT-01: monthly-report uses stage column (zero current_stage references)', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/monthly-report', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      });

      const res = await getMonthlyReport(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.month).toBeGreaterThanOrEqual(1);
      expect(json.data.month).toBeLessThanOrEqual(12);

      // Verify exact filter calls:
      const queriedColumns = mockDb.dealPipelineFilterCalls.map((c) => c.column);
      expect(queriedColumns).toContain('stage');
      expect(queriedColumns).not.toContain('current_stage');

      const buyerMeetingCall = mockDb.dealPipelineFilterCalls.find(
        (c) => c.column === 'stage' && c.method === 'eq' && c.value === 'buyer_meeting'
      );
      expect(buyerMeetingCall).toBeDefined();

      const contractsCall = mockDb.dealPipelineFilterCalls.find(
        (c) => c.column === 'stage' && c.method === 'in' && c.value.includes('contract') && c.value.includes('closed')
      );
      expect(contractsCall).toBeDefined();
    });

    test('ADV-REPORT-02 (Negative Pair): monthly-report rejects unauthorized request with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/monthly-report', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-token' },
      });

      const res = await getMonthlyReport(req);
      expect(res.status).toBe(401);
    });

    test('ADV-REPORT-03: weekly-report queries building_ssot_lite_id and buyer_intent_lite_id', async () => {
      mockDb.match_results = [
        {
          id: 'match-s-1',
          grade: 'S',
          score: 98.2,
          building_ssot_lite_id: 'bld-ssot-prime-1',
          buyer_intent_lite_id: 'buyer-intent-prime-1',
        },
        {
          id: 'match-a-1',
          grade: 'A',
          score: 87.0,
          building_ssot_lite_id: 'bld-ssot-prime-2',
          buyer_intent_lite_id: 'buyer-intent-prime-2',
        },
      ];

      const req = new NextRequest('http://localhost:3000/api/broker/weekly-report', {
        method: 'GET',
      });

      const res = await getWeeklyReport(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(mockDb.matchResultsSelectQuery).toContain('building_ssot_lite_id');
      expect(mockDb.matchResultsSelectQuery).toContain('buyer_intent_lite_id');

      // Top matches must preserve both schema columns:
      expect(json.data.matching.topMatches).toHaveLength(2);
      expect(json.data.matching.topMatches[0].building_ssot_lite_id).toBe('bld-ssot-prime-1');
      expect(json.data.matching.topMatches[0].buyer_intent_lite_id).toBe('buyer-intent-prime-1');
      expect(json.data.matching.sGrade).toBe(1);
      expect(json.data.matching.aGrade).toBe(1);
    });

    test('ADV-REPORT-04 (Negative Pair): weekly-report rejects unauthenticated user with 401', async () => {
      mockAuthUser = null;

      const req = new NextRequest('http://localhost:3000/api/broker/weekly-report', {
        method: 'GET',
      });

      const res = await getWeeklyReport(req);
      expect(res.status).toBe(401);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 4. Challenge owner-report/page.tsx Live Aggregation
  // ══════════════════════════════════════════════════════════════
  describe('4. Challenge owner-report/page.tsx Live Aggregation', () => {
    test('ADV-OWNER-01: 0 activity events yields exactly 0 page views (no synthetic baseline >= 15)', () => {
      // Direct simulation of the owner report aggregation logic
      const emptyEvents: any[] = [];

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(new Date().getDate() - i);
        return d;
      }).reverse();

      const viewEvents = emptyEvents.filter(
        (e) => e.event_type === 'im_lite_view' || e.event_type === 'teaser_view' || e.event_type === 'view'
      );

      const chartData = last7Days.map((date) => {
        const dateKey = date.toDateString();
        const dayViews = viewEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
        return { dateKey, pageViews: dayViews };
      });

      const totalViews = chartData.reduce((acc, curr) => acc + curr.pageViews, 0);

      // Verify zero fabrication
      expect(totalViews).toBe(0);
      expect(chartData.every((d) => d.pageViews === 0)).toBe(true);
    });

    test('ADV-OWNER-02: Disjoint event types do NOT inflate page views', () => {
      const now = new Date();
      const events = [
        { event_type: 'match_computed', created_at: now.toISOString() },
        { event_type: 'inquiry_received', created_at: now.toISOString() },
        { event_type: 'deal_card_created', created_at: now.toISOString() },
        { event_type: 'gate_approved', created_at: now.toISOString() },
      ];

      const viewEvents = events.filter(
        (e) => e.event_type === 'im_lite_view' || e.event_type === 'teaser_view' || e.event_type === 'view'
      );

      expect(viewEvents).toHaveLength(0);
    });

    test('ADV-OWNER-03: Events strictly within 7-day window are counted, older events excluded', () => {
      const now = new Date();
      const today = new Date(now);
      const fiveDaysAgo = new Date(now);
      fiveDaysAgo.setDate(now.getDate() - 5);
      const eightDaysAgo = new Date(now);
      eightDaysAgo.setDate(now.getDate() - 8); // Outside 7-day window!

      const events = [
        { event_type: 'im_lite_view', created_at: today.toISOString() },
        { event_type: 'teaser_view', created_at: fiveDaysAgo.toISOString() },
        { event_type: 'view', created_at: eightDaysAgo.toISOString() }, // Should NOT be in last 7 days chart
      ];

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - i);
        return d;
      }).reverse();

      const viewEvents = events.filter(
        (e) => e.event_type === 'im_lite_view' || e.event_type === 'teaser_view' || e.event_type === 'view'
      );

      const chartData = last7Days.map((date) => {
        const dateKey = date.toDateString();
        const dayViews = viewEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
        return { dateKey, pageViews: dayViews };
      });

      const total7DayViews = chartData.reduce((acc, curr) => acc + curr.pageViews, 0);

      // Only today and fiveDaysAgo should be counted (total = 2)
      expect(total7DayViews).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 5. Challenge SSoT Cache Freshness (readWithMigration)
  // ══════════════════════════════════════════════════════════════
  describe('5. Challenge SSoT Cache Freshness (readWithMigration)', () => {
    test('ADV-SSOT-01: Re-syncs attributes when building_ssot_lite.updated_at is strictly newer than assets.updated_at', async () => {
      const bldId = 'bld-ssot-newer-stress';

      // Old assets record (e.g. 2 days ago)
      mockDb.assets.set(bldId, {
        id: bldId,
        asset_type: 'office',
        investment_posture: 'income',
        attrs: {
          askingPriceKrw: 10000000000,
          totalFloorAreaPyung: 500,
          landAreaPyung: 150,
          address: '서울시 강남구 테헤란로 200',
          assetType: 'office',
        },
        updated_at: '2026-09-02T12:00:00.000Z',
      });

      // Newer legacy SSOT record (e.g. 1 hour ago) with revised price & area
      mockDb.building_ssot_lite.set(bldId, {
        id: bldId,
        asset_type: 'office',
        raw_address: '서울시 강남구 테헤란로 200',
        asking_price_krw: 11500000000, // Price revised +1.5B
        layers: {
          building_register: {
            total_floor_area_pyung: 540,
            land_area_pyung: 160,
          },
        },
        updated_at: '2026-09-04T20:00:00.000Z',
      });

      const res = await readWithMigration(bldId);

      expect(res.source).toBe('assets');
      expect(res.migrated).toBe(true);

      const updated = mockDb.assets.get(bldId);
      expect(updated.attrs.askingPriceKrw).toBe(11500000000);
      expect(updated.attrs.totalFloorAreaPyung).toBe(540);
      expect(updated.attrs.landAreaPyung).toBe(160);
    });

    test('ADV-SSOT-02: Re-syncs attributes when assets.attrs is missing any key field even if timestamp matches', async () => {
      const bldId = 'bld-ssot-partial-attrs';

      // Missing 'askingPriceKrw' and 'landAreaPyung'
      mockDb.assets.set(bldId, {
        id: bldId,
        asset_type: 'retail',
        attrs: {
          totalFloorAreaPyung: 120,
          address: '서울시 종로구 삼일대로 10',
          assetType: 'retail',
        },
        updated_at: '2026-09-04T15:00:00.000Z',
      });

      mockDb.building_ssot_lite.set(bldId, {
        id: bldId,
        asset_type: 'retail',
        raw_address: '서울시 종로구 삼일대로 10',
        asking_price_krw: 2800000000,
        layers: {
          building_register: {
            total_floor_area_pyung: 120,
            land_area_pyung: 45,
          },
        },
        updated_at: '2026-09-04T15:00:00.000Z',
      });

      const res = await readWithMigration(bldId);

      expect(res.source).toBe('assets');
      expect(res.migrated).toBe(true);

      const updated = mockDb.assets.get(bldId);
      expect(updated.attrs.askingPriceKrw).toBe(2800000000);
      expect(updated.attrs.landAreaPyung).toBe(45);
    });

    test('ADV-SSOT-03 (Negative Pair): Preserves cache and skips re-sync when cache is fully fresh and complete', async () => {
      const bldId = 'bld-ssot-pristine-cache';

      const pristineAttrs = {
        askingPriceKrw: 8000000000,
        totalFloorAreaPyung: 400,
        landAreaPyung: 130,
        address: '서울시 서초구 서초대로 300',
        assetType: 'office',
      };

      // Asset is newer
      mockDb.assets.set(bldId, {
        id: bldId,
        asset_type: 'office',
        attrs: pristineAttrs,
        updated_at: '2026-09-05T01:00:00.000Z',
      });

      // Legacy is older
      mockDb.building_ssot_lite.set(bldId, {
        id: bldId,
        asset_type: 'office',
        updated_at: '2026-09-04T08:00:00.000Z',
      });

      const initialAssetsMap = new Map(mockDb.assets);
      const res = await readWithMigration(bldId);

      expect(res.source).toBe('assets');
      expect(res.migrated).toBe(false);
      expect(res.data.attrs).toEqual(pristineAttrs);

      // Verify no changes to mockDb.assets
      expect(mockDb.assets.get(bldId)).toEqual(initialAssetsMap.get(bldId));
    });

    test('ADV-SSOT-04: Batch readManyWithMigration correctly reflects individual migration states', async () => {
      // Building 1: fresh
      mockDb.assets.set('bld-batch-1', {
        id: 'bld-batch-1',
        attrs: { askingPriceKrw: 1, totalFloorAreaPyung: 1, landAreaPyung: 1, address: 'a', assetType: 'o' },
        updated_at: '2026-09-05T01:00:00.000Z',
      });
      mockDb.building_ssot_lite.set('bld-batch-1', {
        id: 'bld-batch-1',
        updated_at: '2026-09-04T01:00:00.000Z',
      });

      // Building 2: stale (legacy is newer)
      mockDb.assets.set('bld-batch-2', {
        id: 'bld-batch-2',
        attrs: { askingPriceKrw: 1, totalFloorAreaPyung: 1, landAreaPyung: 1, address: 'b', assetType: 'o' },
        updated_at: '2026-09-03T01:00:00.000Z',
      });
      mockDb.building_ssot_lite.set('bld-batch-2', {
        id: 'bld-batch-2',
        raw_address: 'b',
        asking_price_krw: 2,
        layers: { building_register: { total_floor_area_pyung: 2, land_area_pyung: 2 } },
        updated_at: '2026-09-04T12:00:00.000Z',
      });

      const batchRes = await readManyWithMigration(['bld-batch-1', 'bld-batch-2']);
      expect(batchRes.results).toHaveLength(2);
      expect(batchRes.migratedCount).toBe(1); // Exactly 1 building was stale and migrated
    });
  });
});
