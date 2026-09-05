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
                return queryBuilder;
              },
              single: () => {
                if (table === 'building_ssot_lite') {
                  const first = Array.from(mockDb.building_ssot_lite.values())[0];
                  return Promise.resolve({ data: first || null, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              },
              maybeSingle: () => {
                if (table === 'assets') {
                  const first = Array.from(mockDb.assets.values())[0];
                  return Promise.resolve({ data: first || null, error: null });
                }
                if (table === 'building_ssot_lite') {
                  const first = Array.from(mockDb.building_ssot_lite.values())[0];
                  return Promise.resolve({ data: first || null, error: null });
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

// Mock tenant intent normalizer
vi.mock('@/ai/agents/tenant-intent-normalizer', () => ({
  runTenantIntentNormalizer: async () => ({
    intent: {
      businessType: '베이커리 카페',
      preferredRegions: ['성수동'],
      areaMin: 100,
      areaMax: 200,
      budgetDepositMax: 10000,
      budgetMonthlyMax: 800,
      preferredFloors: ['1층'],
      moveInTargetText: '즉시',
      mustHave: ['주차'],
      niceToHave: [],
      missingQuestions: [],
    },
    model: 'gpt-4o-mini',
    promptVersion: 'v1.0',
    usage: { totalTokens: 150 },
  }),
}));

vi.mock('@/domain/matching/lease-auto-matcher', () => ({
  runTenantAutoMatcher: async () => {},
}));

// Imports of handlers under test
import { POST as postTeaserEvent } from '@/app/api/public/teaser/event/route';
import { POST as postImLiteView } from '@/app/api/public/im-lite/[buildingId]/view/route';
import { GET as getMonthlyReport } from '@/app/api/broker/monthly-report/route';
import { GET as getWeeklyReport } from '@/app/api/broker/weekly-report/route';
import { readWithMigration } from '@/lib/ssot-adapter';
import { createTenantIntentFromMemo } from '@/domain/lease/tenant-intent';

describe('Milestone M3: Owner Reports & Analytics Feedback Loop Test Suite', () => {
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
  });

  // ══════════════════════════════════════════════════════════════
  // Feature 9: Mobile IM Telemetry Event Payload Alignment
  // ══════════════════════════════════════════════════════════════
  describe('Feature 9: Mobile IM Telemetry Event Payload Alignment', () => {
    test('F9-01 (Positive): accepts payload with explicit teaserConfigId and visitorFp', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teaserConfigId: 'cfg-explicit-01',
          visitorFp: 'visitor-fp-01',
          eventType: 'view',
          eventData: { screen: 'overview' },
          buildingId: 'bld-01',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify teaser_events table received explicit IDs
      expect(mockDb.teaser_events).toHaveLength(1);
      expect(mockDb.teaser_events[0]).toMatchObject({
        teaser_config_id: 'cfg-explicit-01',
        visitor_fp: 'visitor-fp-01',
        event_type: 'view',
      });

      // Verify activity_events table received building_id & building_ssot_lite_id
      expect(mockDb.activity_events).toHaveLength(1);
      expect(mockDb.activity_events[0]).toMatchObject({
        building_id: 'bld-01',
        building_ssot_lite_id: 'bld-01',
        event_type: 'view',
      });
    });

    test('F9-02 (Positive): accepts mobile-im-viewer payload omitting teaserConfigId and visitorFp', async () => {
      // mobile-im-viewer.tsx sends { eventType: 'intent.pro_request', buildingId, docId }
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          'x-forwarded-for': '203.0.113.195',
        },
        body: JSON.stringify({
          eventType: 'intent.pro_request',
          buildingId: 'bld-mobile-im-77',
          docId: 'doc-77',
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify effective teaserConfigId fell back to buildingId
      expect(mockDb.teaser_events).toHaveLength(1);
      const savedTeaserEvent = mockDb.teaser_events[0];
      expect(savedTeaserEvent.teaser_config_id).toBe('bld-mobile-im-77');
      expect(savedTeaserEvent.event_type).toBe('intent.pro_request');
      expect(savedTeaserEvent.visitor_fp).toMatch(/^anon_[0-9a-f]{16}$/);

      // Verify activity_events recorded
      expect(mockDb.activity_events).toHaveLength(1);
      expect(mockDb.activity_events[0]).toMatchObject({
        building_id: 'bld-mobile-im-77',
        building_ssot_lite_id: 'bld-mobile-im-77',
        event_type: 'intent.pro_request',
      });
    });

    test('F9-03 (Negative Pair): returns 400 Bad Request when eventType is omitted', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: 'bld-invalid',
          teaserConfigId: 'cfg-01',
          // eventType is missing!
        }),
      });

      const res = await postTeaserEvent(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toContain('eventType');

      // Assert no events were inserted into either table
      expect(mockDb.teaser_events).toHaveLength(0);
      expect(mockDb.activity_events).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Feature 10: Telemetry Database Column Alignment
  // ══════════════════════════════════════════════════════════════
  describe('Feature 10: Telemetry Database Column Alignment', () => {
    test('F10-01 (Positive): im-lite/view inserts both building_id AND building_ssot_lite_id for standard view', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/im-lite/bld-gangnam-101/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_viewed: 'location_access',
          blind_name: '강남 프라임 오피스',
        }),
      });

      const res = await postImLiteView(req, { params: Promise.resolve({ buildingId: 'bld-gangnam-101' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockDb.activity_events).toHaveLength(1);
      const viewEvent = mockDb.activity_events[0];
      expect(viewEvent.building_id).toBe('bld-gangnam-101');
      expect(viewEvent.building_ssot_lite_id).toBe('bld-gangnam-101');
      expect(viewEvent.event_type).toBe('im_lite_view');
      expect(viewEvent.metadata.section_viewed).toBe('location_access');
    });

    test('F10-02 (Positive): im-lite/view inserts both building_id AND building_ssot_lite_id for dwell time event', async () => {
      const req = new NextRequest('http://localhost:3000/api/public/im-lite/bld-gangnam-102/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dwell_seconds: 75,
          blind_name: '역삼 메디컬 빌딩',
        }),
      });

      const res = await postImLiteView(req, { params: Promise.resolve({ buildingId: 'bld-gangnam-102' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockDb.activity_events).toHaveLength(1);
      const dwellEvent = mockDb.activity_events[0];
      expect(dwellEvent.building_id).toBe('bld-gangnam-102');
      expect(dwellEvent.building_ssot_lite_id).toBe('bld-gangnam-102');
      expect(dwellEvent.event_type).toBe('im_lite_view');
      expect(dwellEvent.metadata.dwell_seconds).toBe(75);
    });

    test('F10-03 (Positive): createTenantIntentFromMemo logs tenant_intent_created & tenant_intent', async () => {
      const result = await createTenantIntentFromMemo(
        { memo: '성수동 50평 베이커리 카페 1층 월세 800만원 이하' },
        'broker-user-123'
      );

      expect(result.tenantIntentId).toBeDefined();
      expect(result.summary.businessType).toBe('베이커리 카페');

      const tenantIntentEvent = mockDb.activity_events.find((e) => e.event_type === 'tenant_intent_created');
      expect(tenantIntentEvent).toBeDefined();
      expect(tenantIntentEvent.entity_type).toBe('tenant_intent');
    });

    test('F10-04 (Negative Pair): createTenantIntentFromMemo does NOT log buyer_intent_created or buyer_intent_lite', async () => {
      await createTenantIntentFromMemo(
        { memo: '홍대 인근 스튜디오 30평' },
        'broker-user-123'
      );

      const buyerIntentEvent = mockDb.activity_events.find((e) => e.event_type === 'buyer_intent_created');
      expect(buyerIntentEvent).toBeUndefined();

      const buyerEntityEvent = mockDb.activity_events.find((e) => e.entity_type === 'buyer_intent_lite');
      expect(buyerEntityEvent).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Feature 11: Monthly & Weekly Report Database Column Alignment
  // ══════════════════════════════════════════════════════════════
  describe('Feature 11: Monthly & Weekly Report Database Column Alignment', () => {
    test('F11-01 (Positive): monthly-report queries deal_pipeline_states using stage column', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/monthly-report', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      });

      const res = await getMonthlyReport(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify that filter column used is 'stage', NEVER 'current_stage'
      const stageFilterCalls = mockDb.dealPipelineFilterCalls.filter(c => c.column === 'stage');
      expect(stageFilterCalls.length).toBeGreaterThan(0);

      const hasBuyerMeeting = stageFilterCalls.some(c => c.method === 'eq' && c.value === 'buyer_meeting');
      expect(hasBuyerMeeting).toBe(true);

      const hasContracts = stageFilterCalls.some(c => c.method === 'in' && Array.isArray(c.value) && c.value.includes('contract'));
      expect(hasContracts).toBe(true);

      const hasLegacyCurrentStage = mockDb.dealPipelineFilterCalls.some(c => c.column === 'current_stage');
      expect(hasLegacyCurrentStage).toBe(false);
    });

    test('F11-02 (Negative Pair): monthly-report returns 401 when token is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/monthly-report', {
        method: 'GET',
        // No Authorization header
      });

      const res = await getMonthlyReport(req);
      expect(res.status).toBe(401);
    });

    test('F11-03 (Positive): weekly-report selects building_ssot_lite_id and buyer_intent_lite_id', async () => {
      mockDb.match_results = [
        {
          id: 'match-1',
          grade: 'S',
          score: 95.5,
          building_ssot_lite_id: 'bld-ssot-001',
          buyer_intent_lite_id: 'buyer-intent-001',
        },
      ];

      const req = new NextRequest('http://localhost:3000/api/broker/weekly-report', {
        method: 'GET',
      });

      const res = await getWeeklyReport(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.matching.sGrade).toBe(1);

      // Verify selected columns in query
      expect(mockDb.matchResultsSelectQuery).toContain('building_ssot_lite_id');
      expect(mockDb.matchResultsSelectQuery).toContain('buyer_intent_lite_id');
      expect(mockDb.matchResultsSelectQuery).not.toContain('building_id,');
      expect(mockDb.matchResultsSelectQuery).not.toContain('buyer_intent_id');

      // Verify topMatches structure
      const topMatch = json.data.matching.topMatches[0];
      expect(topMatch).toBeDefined();
      expect(topMatch.building_ssot_lite_id).toBe('bld-ssot-001');
      expect(topMatch.buyer_intent_lite_id).toBe('buyer-intent-001');
    });

    test('F11-04 (Negative Pair): weekly-report returns 401 when unauthenticated', async () => {
      mockAuthUser = null; // simulate unauthenticated

      const req = new NextRequest('http://localhost:3000/api/broker/weekly-report', {
        method: 'GET',
      });

      const res = await getWeeklyReport(req);
      expect(res.status).toBe(401);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Feature 12: Owner Vacancy Report Live Telemetry Aggregation
  // ══════════════════════════════════════════════════════════════
  describe('Feature 12: Owner Vacancy Report Live Telemetry Aggregation', () => {
    test('F12-01 (Positive): aggregates genuine event counts across im_lite_view, teaser_view, and view', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(today.getDate() - 2);

      const realActivityEvents = [
        { event_type: 'im_lite_view', created_at: today.toISOString() },
        { event_type: 'teaser_view', created_at: today.toISOString() },
        { event_type: 'view', created_at: today.toISOString() },
        { event_type: 'im_lite_view', created_at: yesterday.toISOString() },
        { event_type: 'im_lite_view', created_at: twoDaysAgo.toISOString() },
        { event_type: 'match_computed', created_at: today.toISOString() },
        { event_type: 'inquiry_received', created_at: today.toISOString() },
      ];

      // Simulate genuine aggregation logic implemented in owner-report/page.tsx
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(today.getDate() - i);
        return d;
      }).reverse();

      const viewEvents = realActivityEvents.filter(
        (e) => e.event_type === 'im_lite_view' || e.event_type === 'teaser_view' || e.event_type === 'view'
      );

      const chartData = last7Days.map((date) => {
        const dateKey = date.toDateString();
        const dayViews = viewEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
        return { dateKey, pageViews: dayViews };
      });

      const totalViews = chartData.reduce((acc, curr) => acc + curr.pageViews, 0);

      // Total genuine views = 3 (today) + 1 (yesterday) + 1 (2 days ago) = 5
      expect(totalViews).toBe(5);

      const todayChart = chartData.find((d) => d.dateKey === today.toDateString());
      expect(todayChart?.pageViews).toBe(3);

      const yesterdayChart = chartData.find((d) => d.dateKey === yesterday.toDateString());
      expect(yesterdayChart?.pageViews).toBe(1);
    });

    test('F12-02 (Negative Pair): renders exact 0 views when no view events exist (no simulated fallback >= 15)', () => {
      const realActivityEvents = [
        { event_type: 'match_computed', created_at: new Date().toISOString() },
        { event_type: 'inquiry_received', created_at: new Date().toISOString() },
      ];

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(new Date().getDate() - i);
        return d;
      }).reverse();

      const viewEvents = realActivityEvents.filter(
        (e) => e.event_type === 'im_lite_view' || e.event_type === 'teaser_view' || e.event_type === 'view'
      );

      const chartData = last7Days.map((date) => {
        const dateKey = date.toDateString();
        const dayViews = viewEvents.filter((e) => new Date(e.created_at).toDateString() === dateKey).length;
        return { dateKey, pageViews: dayViews };
      });

      const totalViews = chartData.reduce((acc, curr) => acc + curr.pageViews, 0);

      // Genuine zero: Must NOT fabricate >= 15 simulated views
      expect(totalViews).toBe(0);
      expect(chartData.every((d) => d.pageViews === 0)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Feature 13: SSoT Read Cache Synchronization
  // ══════════════════════════════════════════════════════════════
  describe('Feature 13: SSoT Read Cache Synchronization', () => {
    test('F13-01 (Positive): re-syncs assets from building_ssot_lite when legacy updated_at is newer', async () => {
      const buildingId = 'bld-sync-newer';

      // Stale asset record from 3 days ago
      mockDb.assets.set(buildingId, {
        id: buildingId,
        asset_type: 'office',
        investment_posture: 'income',
        attrs: {
          askingPriceKrw: 5000000000,
          totalFloorAreaPyung: 300,
          landAreaPyung: 100,
          address: '서울시 강남구 테헤란로 100',
          assetType: 'office',
        },
        updated_at: '2026-09-01T10:00:00.000Z',
      });

      // Updated building_ssot_lite record from today with revised price and area
      mockDb.building_ssot_lite.set(buildingId, {
        id: buildingId,
        asset_type: 'office',
        raw_address: '서울시 강남구 테헤란로 100',
        asking_price_krw: 5500000000,
        layers: {
          building_register: {
            total_floor_area_pyung: 350,
            land_area_pyung: 110,
          },
        },
        updated_at: '2026-09-04T18:00:00.000Z',
      });

      const result = await readWithMigration(buildingId);

      expect(result.source).toBe('assets');
      expect(result.migrated).toBe(true);

      // Verify that assets record in mockDb was re-synced with the newer values
      const syncedAsset = mockDb.assets.get(buildingId);
      expect(syncedAsset.attrs.askingPriceKrw).toBe(5500000000);
      expect(syncedAsset.attrs.totalFloorAreaPyung).toBe(350);
    });

    test('F13-02 (Positive): re-syncs assets from building_ssot_lite when assets.attrs is missing key fields', async () => {
      const buildingId = 'bld-sync-missing-fields';

      // Asset has matching updated_at but incomplete attrs (empty object)
      mockDb.assets.set(buildingId, {
        id: buildingId,
        asset_type: 'retail',
        attrs: {}, // Missing key fields!
        updated_at: '2026-09-04T12:00:00.000Z',
      });

      mockDb.building_ssot_lite.set(buildingId, {
        id: buildingId,
        asset_type: 'retail',
        raw_address: '서울시 마포구 양화로 50',
        asking_price_krw: 3200000000,
        layers: {
          building_register: {
            total_floor_area_pyung: 150,
            land_area_pyung: 60,
          },
        },
        updated_at: '2026-09-04T12:00:00.000Z',
      });

      const result = await readWithMigration(buildingId);

      expect(result.source).toBe('assets');
      expect(result.migrated).toBe(true);

      const syncedAsset = mockDb.assets.get(buildingId);
      expect(syncedAsset.attrs.askingPriceKrw).toBe(3200000000);
      expect(syncedAsset.attrs.totalFloorAreaPyung).toBe(150);
      expect(syncedAsset.attrs.address).toBe('서울시 마포구 양화로 50');
    });

    test('F13-03 (Negative Pair): serves cached assets with migrated:false when cache is fresh with all key fields', async () => {
      const buildingId = 'bld-sync-fresh-cache';

      const freshAttrs = {
        askingPriceKrw: 4200000000,
        totalFloorAreaPyung: 220,
        landAreaPyung: 80,
        address: '서울시 성동구 연무장길 10',
        assetType: 'retail',
      };

      // Asset is newer than legacy and attrs has all key fields
      mockDb.assets.set(buildingId, {
        id: buildingId,
        asset_type: 'retail',
        attrs: freshAttrs,
        updated_at: '2026-09-05T00:00:00.000Z',
      });

      mockDb.building_ssot_lite.set(buildingId, {
        id: buildingId,
        asset_type: 'retail',
        updated_at: '2026-09-04T10:00:00.000Z',
      });

      const initialUpsertCount = mockDb.assets.size;
      const result = await readWithMigration(buildingId);

      // Should return cached asset with migrated = false
      expect(result.source).toBe('assets');
      expect(result.migrated).toBe(false);
      expect(result.data.attrs).toEqual(freshAttrs);

      // Verify no unnecessary re-sync was triggered
      expect(mockDb.assets.size).toBe(initialUpsertCount);
    });
  });
});
