// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockRedirect,
  mockNotFound,
  mockRequireBroker,
  mockServiceClientFactory,
  mockFetchBrokerProfile,
  mockAssertPublishable,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string; url?: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    err.url = url;
    throw err;
  }),
  mockNotFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND') as Error & { digest?: string };
    err.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw err;
  }),
  mockRequireBroker: vi.fn(),
  mockServiceClientFactory: vi.fn(),
  mockFetchBrokerProfile: vi.fn(),
  mockAssertPublishable: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: mockRequireBroker,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mockServiceClientFactory,
}));

vi.mock('@/lib/broker/profile', () => ({
  fetchBrokerPublicProfile: mockFetchBrokerProfile,
}));

vi.mock('@/lib/broker/statutory-disclosure', () => ({
  assertPublishable: mockAssertPublishable,
}));

vi.mock('@/lib/ai/rate-limit', () => ({
  enforceBrokerAiQuota: vi.fn(async () => null),
}));

import {
  resolveCanonicalAreaLabel,
  resolveCanonicalAssetUse,
  resolveCanonicalDealHeadline,
  resolveCanonicalDealSummary,
  isLandPriorityPosture,
  sqmToRoundedPyeong,
} from '@/lib/deal-card/canonical-summary';
import {
  mergeWorkspaceDealCard,
  mergeWorkspaceIm,
} from '@/lib/workspace/summary/get-summary-mergers';
import { adaptBuildingToMagazineDeal } from '@/domain/magazine/deal-adapter';
import type { Card4Data } from '@/lib/deal-card/card4-schema';
import type { WorkspaceItemRecord } from '@/lib/workspace/workspace-repository';
import DealCardShortPage from '@/app/(public)/dc/[id]/page';
import { POST as quickGeneratePost } from '@/app/api/broker/im-lite/quick-generate/route';
import { GET as getBuildings } from '@/app/api/broker/buildings/route';
import { PreSendConfirmationSheet } from '@/components/broker/deal-card/PreSendConfirmationSheet';
import { DealCardPreviewColumn } from '@/app/(broker)/broker/w/dealcards/_components/DealCardPreviewColumn';

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_DOC = '33333333-3333-4333-8333-333333333333';
const BROKER_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeBaseCard4(overrides: Partial<Card4Data> = {}): Card4Data {
  return {
    posture: 'income',
    region: '영등포구 당산동5가',
    use: '근린생활시설',
    area: '연면적 300평',
    priceBand: '50억~55억',
    headline: '영등포 코너 우량 임차 빌딩',
    points: ['더블역세권 도보 3분 입지', '전 층 만실 우량 임차 구성', '중장기 가치 상승 기대'],
    provenance: { points: ['public', 'broker', 'ai'] },
    card4_version: 1,
    ...overrides,
  };
}

interface FakeRowStore {
  building_ssot_lite: Array<Record<string, any>>;
  workspace_items: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  pending_magazine_deals: Array<Record<string, any>>;
}

function createFakeSupabase(store: FakeRowStore) {
  function applyFilters(rows: Array<Record<string, any>>, filters: Array<(r: Record<string, any>) => boolean>) {
    return rows.filter((r) => filters.every((fn) => fn(r)));
  }

  function makeQuery(table: keyof FakeRowStore) {
    let op: 'select' | 'upsert' | 'insert' | 'update' = 'select';
    let payload: any = null;
    const filters: Array<(r: Record<string, any>) => boolean> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitCount: number | null = null;
    let expectSingle = false;

    const execute = async (): Promise<{ data: any; error: any }> => {
      const tableRows = store[table] || [];
      if (op === 'upsert') {
        const items = Array.isArray(payload) ? payload : [payload];
        const results: Array<Record<string, any>> = [];
        for (const item of items) {
          const idx = tableRows.findIndex((r) => {
            if (item.id && r.id === item.id) return true;
            if (table === 'workspace_items' && item.owner_id && item.building_id && item.kind) {
              return (
                r.owner_id === item.owner_id &&
                r.building_id === item.building_id &&
                r.kind === item.kind &&
                !r.deleted_at
              );
            }
            return false;
          });
          const saved = {
            ...(idx >= 0 ? tableRows[idx] : {}),
            ...item,
            id: item.id || (idx >= 0 ? tableRows[idx].id : `${table}-${tableRows.length + 1}`),
            updated_at: item.updated_at || new Date().toISOString(),
            created_at: (idx >= 0 ? tableRows[idx].created_at : item.created_at) || new Date().toISOString(),
          };
          if (idx >= 0) tableRows[idx] = saved;
          else tableRows.push(saved);
          results.push(saved);
        }
        return { data: expectSingle ? results[0] ?? null : results, error: null };
      }
      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          tableRows.push({
            ...item,
            id: item.id || `${table}-${tableRows.length + 1}`,
            created_at: item.created_at || new Date().toISOString(),
          });
        }
        return { data: expectSingle ? items[0] : items, error: null };
      }
      if (op === 'update') {
        const matched = applyFilters(tableRows, filters);
        for (const row of matched) {
          Object.assign(row, payload);
        }
        return { data: expectSingle ? matched[0] ?? null : matched, error: null };
      }
      let out = [...applyFilters(tableRows, filters)];
      if (orderCol) {
        out.sort((a, b) => {
          const av = String(a[orderCol!] || '');
          const bv = String(b[orderCol!] || '');
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (typeof limitCount === 'number') {
        out = out.slice(0, limitCount);
      }
      return { data: expectSingle ? out[0] ?? null : out, error: null };
    };

    const builder: any = {
      select: () => builder,
      upsert: (p: any) => {
        op = 'upsert';
        payload = p;
        return builder;
      },
      insert: (p: any) => {
        op = 'insert';
        payload = p;
        return builder;
      },
      update: (p: any) => {
        op = 'update';
        payload = p;
        return builder;
      },
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      in: (col: string, vals: any[]) => {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      is: (col: string, val: any) => {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val));
        return builder;
      },
      or: (expr: string) => {
        const clauses = expr.split(',').map((c) => c.trim());
        filters.push((r) =>
          clauses.some((clause) => {
            const parts = clause.split('.eq.');
            if (parts.length === 2) {
              return String(r[parts[0]] ?? '') === parts[1];
            }
            return false;
          })
        );
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
      maybeSingle: () => {
        expectSingle = true;
        return execute();
      },
      single: () => {
        expectSingle = true;
        return execute();
      },
      then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
        execute().then(resolve, reject),
    };
    return builder;
  }

  return {
    from: (table: keyof FakeRowStore) => makeQuery(table),
  };
}

describe('Wave 2 Track A (A2-01..A2-08) Entity ID Lifecycle, Dedup & Metric/Posture SSOT', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
    mockRequireBroker.mockResolvedValue({
      user: { id: BROKER_UID, email: 'broker@example.com' },
      isAdmin: false,
    });
    mockFetchBrokerProfile.mockResolvedValue(null);
    mockAssertPublishable.mockResolvedValue({
      ok: true,
      missingFields: [],
      missingLabels: [],
    });
  });

  describe('A2-01 / A2-02: Canonical Summary Mergers & /dc/bld-... Redirect', () => {
    it('prefers canonical buildingId in mergeWorkspaceDealCard & dedupes legacy bld-... twin', () => {
      const legacyId = 'bld-1774000000-abcd';
      const dcList = [
        { id: legacyId, title: '로컬 초안', card4: makeBaseCard4({ card4_version: 1 }) },
        { id: UUID_1, title: '기존 캐시', card4: makeBaseCard4({ card4_version: 1 }) },
      ];
      const wsItem: WorkspaceItemRecord = {
        id: 'ws-row-1',
        buildingId: UUID_1,
        legacyId,
        ownerId: BROKER_UID,
        kind: 'dealcard',
        status: 'sent',
        title: '역삼동 초역세권 사옥',
        address: '영등포구 당산동5가',
        priceBand: '50억~55억',
        draftPayload: {
          card4: makeBaseCard4({ headline: '역삼동 초역세권 사옥', card4_version: 3 }),
        },
        publishedSnapshot: null,
        docHash: null,
        correctionNotice: null,
        publishedAt: null,
        revokedAt: null,
        version: 3,
        createdAt: '2026-11-23T00:00:00.000Z',
        updatedAt: '2026-11-23T00:10:00.000Z',
        deletedAt: null,
      };

      mergeWorkspaceDealCard(wsItem, dcList);

      expect(dcList).toHaveLength(1);
      expect(dcList[0].id).toBe(UUID_1);
      expect((dcList[0] as Record<string, unknown>).canonicalId).toBe('ws-row-1');
      expect((dcList[0] as Record<string, unknown>).buildingId).toBe(UUID_1);
      expect((dcList[0] as Record<string, unknown>).legacyId).toBe(legacyId);
      expect(dcList[0].card4.headline).toBe('역삼동 초역세권 사옥');
    });

    it('dedupes legacy bld-... twin in mergeWorkspaceIm and keeps canonical buildingId', () => {
      const legacyId = 'bld-legacy-im';
      const imList: Array<Record<string, any>> = [
        { id: legacyId, buildingId: legacyId, title: '구 IM' },
        { id: UUID_1, buildingId: UUID_1, title: '신 IM' },
      ];
      const wsItem: WorkspaceItemRecord = {
        id: 'ws-im-1',
        buildingId: UUID_1,
        legacyId,
        ownerId: BROKER_UID,
        kind: 'im',
        status: 'published',
        title: '당산 코너 빌딩 IM',
        address: '서울시 영등포구 당산동5가 11-47',
        priceBand: '50억~55억',
        draftPayload: { buildingName: '당산 코너 빌딩 IM', address: '서울시 영등포구 당산동5가 11-47' },
        publishedSnapshot: null,
        docHash: 'hash-1',
        correctionNotice: null,
        publishedAt: null,
        revokedAt: null,
        version: 2,
        createdAt: '2026-11-23T00:00:00.000Z',
        updatedAt: '2026-11-23T00:10:00.000Z',
        deletedAt: null,
      };

      mergeWorkspaceIm(wsItem, imList as any, null);

      expect(imList).toHaveLength(1);
      expect(imList[0].buildingId).toBe(UUID_1);
      expect(imList[0].legacyId).toBe(legacyId);
    });

    it('redirects /dc/bld-... to canonical /dc/<uuid> preserving query params', async () => {
      const legacyId = 'bld-1774000-temp';
      const fakeSb = createFakeSupabase({
        building_ssot_lite: [],
        workspace_items: [
          {
            id: 'ws-item-1',
            building_id: UUID_1,
            legacy_id: legacyId,
            owner_id: BROKER_UID,
            kind: 'dealcard',
            status: 'sent',
            title: '당산 코너 딜카드',
            draft_payload: { card4: makeBaseCard4() },
            published_snapshot: { card4: makeBaseCard4() },
            version: 1,
            deleted_at: null,
            updated_at: '2026-11-23T00:10:00.000Z',
          },
        ],
        document_objects: [],
        activity_events: [],
        pending_magazine_deals: [],
      });
      mockServiceClientFactory.mockReturnValue(fakeSb);

      await expect(
        DealCardShortPage({
          params: Promise.resolve({ id: legacyId }),
          searchParams: Promise.resolve({ utm_source: 'kakao', mode: 'share' }),
        })
      ).rejects.toThrow(`NEXT_REDIRECT:/dc/${UUID_1}?utm_source=kakao&mode=share`);

      expect(mockRedirect).toHaveBeenCalledWith(`/dc/${UUID_1}?utm_source=kakao&mode=share`);
    });
  });

  describe('A2-02 UI Promotion Guards: PreSendConfirmationSheet & DealCardPreviewColumn', () => {
    it('resolves canonical UUID before copying share link in PreSendConfirmationSheet', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      let promotedId = 'bld-temp-123';
      const onEnsureCanonicalId = vi.fn(async () => {
        promotedId = UUID_1;
        return UUID_1;
      });
      const onCopyLink = vi.fn(async () => {
        promotedId = UUID_1;
        return true;
      });

      render(
        React.createElement(PreSendConfirmationSheet, {
          isOpen: true,
          onClose: vi.fn(),
          card4: makeBaseCard4(),
          dealId: 'bld-temp-123',
          resolveEffectiveDealId: () => promotedId,
          onEnsureCanonicalId: onEnsureCanonicalId,
          isSaved: true,
          onFlushSave: vi.fn(async () => true),
          onSendToClient: vi.fn(async () => true),
          onCopyLink: onCopyLink,
        })
      );

      await waitFor(() => {
        expect(onEnsureCanonicalId).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByTestId('presend-copy-btn'));

      await waitFor(() => {
        expect(onCopyLink).toHaveBeenCalled();
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/dc/${UUID_1}`));
      });
      expect(writeText.mock.calls[0]?.[0]).not.toContain('bld-temp-123');
    });

    it('invokes onEnsureCanonicalId proactively when DealCardPreviewColumn receives bld-... liveUrl', async () => {
      const onEnsureCanonicalId = vi.fn(async () => UUID_2);

      render(
        React.createElement(DealCardPreviewColumn, {
          lifecycle: 'published_clean',
          liveUrl: '/dc/bld-temp-preview',
          isPreGeneration: false,
          effectiveCard4: makeBaseCard4(),
          dealId: 'bld-temp-preview',
          brokerProfile: null,
          activeUnitId: null,
          selectedMemoOnly: null,
          publishError: null,
          onStartInput: vi.fn(),
          onResyncPublished: vi.fn(),
          onEnsureCanonicalId: onEnsureCanonicalId,
          onSkipMemoManual: vi.fn(),
          onFillSample: vi.fn(),
          onActivateUnit: vi.fn(),
        })
      );

      await waitFor(() => {
        expect(onEnsureCanonicalId).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByTestId('dealcard-live-link'));
      expect(onEnsureCanonicalId).toHaveBeenCalledTimes(2);
    });
  });

  describe('A2-04..A2-08: quick-generate Dedup, Headline/Use Preservation & Posture/Metric SSOT', () => {
    it('reuses canonical buildingId via legacyBuildingId and preserves custom DealCard headline/use/points/status', async () => {
      const legacyId = 'bld-legacy-preserve';
      const store: FakeRowStore = {
        building_ssot_lite: [
          {
            id: UUID_1,
            owner_id: BROKER_UID,
            pnu: '1156011500100110047',
            raw_address: '서울시 영등포구 당산동5가 11-47',
            layers: {
              location: { address: '서울시 영등포구 당산동5가 11-47', pnu: '1156011500100110047' },
              physical: { total_floor_area_sqm: 900, land_area_sqm: 300 },
            },
          },
        ],
        workspace_items: [
          {
            id: 'ws-dc-1',
            building_id: UUID_1,
            legacy_id: legacyId,
            owner_id: BROKER_UID,
            kind: 'dealcard',
            status: 'sent',
            title: '브로커가 직접 다듬은 헤드라인',
            address: '영등포구 당산동5가',
            price_band: '48억~52억',
            draft_payload: {
              memoText: '중개사 원본 메모 보존 테스트',
              card4: makeBaseCard4({
                headline: '브로커가 직접 다듬은 헤드라인',
                use: '업무시설(사옥)',
                points: ['커스텀 포인트 하나', '커스텀 포인트 둘', '커스텀 포인트 셋'],
                card4_version: 4,
              }),
            },
            published_snapshot: { card4: makeBaseCard4({ headline: '브로커가 직접 다듬은 헤드라인' }) },
            version: 4,
            deleted_at: null,
          },
        ],
        document_objects: [],
        activity_events: [],
        pending_magazine_deals: [],
      };
      mockServiceClientFactory.mockReturnValue(createFakeSupabase(store));

      const req = new NextRequest('http://localhost/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: '서울시 영등포구 당산동5가 11-47',
          askingPriceManwon: 550000,
          legacyBuildingId: legacyId,
          gfaSqm: 1120,
          landAreaSqm: 350,
          mainPurpose: '제2종근린생활시설',
        }),
      });

      const res = await quickGeneratePost(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.buildingId).toBe(UUID_1);
      expect(body.card4.headline).toBe('브로커가 직접 다듬은 헤드라인');
      expect(body.card4.use).toBe('업무시설(사옥)');
      expect(body.card4.points).toEqual(['커스텀 포인트 하나', '커스텀 포인트 둘', '커스텀 포인트 셋']);
      expect(body.card4.gfaPyung).toBe(Math.round(1120 / 3.305785));

      const dcRow = store.workspace_items.find((r) => r.kind === 'dealcard');
      expect(dcRow?.building_id).toBe(UUID_1);
      expect(dcRow?.status).toBe('sent');
      expect(dcRow?.draft_payload?.memoText).toBe('중개사 원본 메모 보존 테스트');
    });

    it('upgrades generic DealCard use when IM mainPurpose is specific, dedups by normalized (owner_id, address), and mints new UUID when isClone is true', async () => {
      const store: FakeRowStore = {
        building_ssot_lite: [
          {
            id: UUID_2,
            owner_id: BROKER_UID,
            raw_address: '서울특별시 강남구 역삼동 823-33',
            layers: { location: { address: '서울특별시 강남구 역삼동 823-33' } },
          },
        ],
        workspace_items: [
          {
            id: 'ws-dc-2',
            building_id: UUID_2,
            owner_id: BROKER_UID,
            kind: 'dealcard',
            status: 'draft',
            title: '강남 역삼동 근린생활시설',
            draft_payload: {
              card4: makeBaseCard4({
                region: '강남구 역삼동',
                use: '근린생활시설',
                headline: '역삼 코너 핵심 매물',
                points: ['테헤란로 이면 코너', '주차 10대 가능', '명도 협의 가능'],
              }),
            },
            version: 1,
            deleted_at: null,
          },
        ],
        document_objects: [],
        activity_events: [],
        pending_magazine_deals: [],
      };
      mockServiceClientFactory.mockReturnValue(createFakeSupabase(store));

      const dedupReq = new NextRequest('http://localhost/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: '강남구 역삼동 823-33번지',
          askingPriceManwon: 800000,
          gfaSqm: 992,
          landAreaSqm: 331,
          mainPurpose: '제2종근린생활시설',
        }),
      });
      const dedupRes = await quickGeneratePost(dedupReq);
      const dedupBody = await dedupRes.json();

      expect(dedupBody.buildingId).toBe(UUID_2);
      expect(dedupBody.card4.use).toBe('제2종근린생활시설');
      expect(dedupBody.card4.headline).toBe('역삼 코너 핵심 매물');

      const cloneReq = new NextRequest('http://localhost/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: '강남구 역삼동 823-33번지',
          askingPriceManwon: 800000,
          isClone: true,
        }),
      });
      const cloneRes = await quickGeneratePost(cloneReq);
      const cloneBody = await cloneRes.json();

      expect(cloneBody.buildingId).not.toBe(UUID_2);
    });

    it('uses land-priority posture size_signal (no 연면적 0㎡ on bare land), rounded integer pyeong, and blind-safe headline', async () => {
      const store: FakeRowStore = {
        building_ssot_lite: [],
        workspace_items: [],
        document_objects: [],
        activity_events: [],
        pending_magazine_deals: [],
      };
      mockServiceClientFactory.mockReturnValue(createFakeSupabase(store));

      const req = new NextRequest('http://localhost/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: '서울시 강남구 역삼동 700-1',
          buildingName: '호산당빌딩',
          askingPriceManwon: 1200000,
          posture: 'development',
          landAreaSqm: 450,
          gfaSqm: 0,
          mainPurpose: '나대지(신축부지)',
        }),
      });

      const res = await quickGeneratePost(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.card4.area).toBe('토지 136평');
      expect(body.card4.landAreaPyung).toBe(136);
      expect(body.card4.use).toBe('나대지(신축부지)');
      expect(body.card4.headline).toBeTruthy();
      expect(body.card4.headline).not.toContain('호산당빌딩');

      const ssotRow = store.building_ssot_lite[0];
      expect(ssotRow.size_signal).toContain('토지 450㎡ (136평)');
      expect(ssotRow.size_signal).not.toContain('연면적 0㎡');

      const docRow = store.document_objects[0];
      expect(docRow.body.ssot_summary.size_signal).toContain('토지 450㎡ (136평)');
      expect(docRow.body.ssot_summary.asset_type).toBe('나대지(신축부지)');
    });
  });

  describe('A2-05..A2-08: /api/broker/buildings, canonical-summary & magazine deal-adapter', () => {
    it('dedupes legacy bld-... rows via seenIds and exposes posture-aware area_label & pyeong fields in GET /api/broker/buildings', async () => {
      const legacyId = 'bld-picker-legacy-01';
      const store: FakeRowStore = {
        building_ssot_lite: [
          {
            id: UUID_1,
            owner_id: BROKER_UID,
            raw_address: '서울시 강남구 역삼동 100-5',
            area_signal: '강남구 역삼동',
            asset_type: '제2종근린생활시설',
            price_band: '70억대',
            status: 'public_signal_ready',
            layers: {
              physical: {
                land_area_sqm: 450,
                total_floor_area_sqm: 1420,
              },
              lease_summary: { asking_price_manwon: 750000 },
            },
            updated_at: '2026-11-23T01:00:00.000Z',
          },
        ],
        workspace_items: [
          {
            id: 'ws-im-canonical',
            building_id: UUID_1,
            legacy_id: legacyId,
            owner_id: BROKER_UID,
            kind: 'im',
            status: 'published',
            title: '역삼 코너 빌딩',
            address: '서울시 강남구 역삼동 100-5',
            price_band: '70억대',
            draft_payload: {
              posture: 'development',
              landAreaSqm: 450,
              gfaSqm: 1420,
              ssot_summary: { main_usage: '제2종근린생활시설', posture: 'development' },
            },
            updated_at: '2026-11-23T01:05:00.000Z',
            deleted_at: null,
          },
          {
            id: 'ws-dc-legacy-twin',
            building_id: legacyId,
            legacy_id: legacyId,
            owner_id: BROKER_UID,
            kind: 'dealcard',
            status: 'sent',
            title: '중복 노출되면 안 되는 레거시 카드',
            address: '강남구 역삼동',
            draft_payload: { card4: makeBaseCard4() },
            updated_at: '2026-11-23T00:30:00.000Z',
            deleted_at: null,
          },
        ],
        document_objects: [],
        activity_events: [],
        pending_magazine_deals: [],
      };
      mockServiceClientFactory.mockReturnValue(createFakeSupabase(store));

      const req = new NextRequest('http://localhost/api/broker/buildings');
      const res = await getBuildings(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      const matching = data.buildings.filter(
        (b: Record<string, any>) => b.id === UUID_1 || b.id === legacyId
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].id).toBe(UUID_1);
      expect(matching[0].land_area_pyeong).toBe(136);
      expect(matching[0].gross_floor_area_pyeong).toBe(430);
      expect(matching[0].posture).toBe('development');
      expect(matching[0].area_label).toBe('토지 136평');
    });

    it('reads layers.physical areas and ssot_summary.main_usage in adaptBuildingToMagazineDeal', () => {
      const adapted = adaptBuildingToMagazineDeal({
        building: {
          id: UUID_DOC,
          owner_id: BROKER_UID,
          raw_address: '서울시 성동구 성수동2가 300-1',
          area_signal: '성동구 성수동2가',
          asset_type: '근린생활시설',
          price_band: '90억대',
          layers: {
            physical: {
              land_area_sqm: 450,
              total_floor_area_sqm: 1420,
              zoning: '준공업지역',
            },
            lease_summary: {
              asking_price_manwon: 950000,
              vacancy_pct: 5,
            },
          },
        } as any,
        imDoc: {
          id: UUID_DOC,
          building_id: UUID_DOC,
          body: {
            ssot_summary: {
              main_usage: '지식산업센터·근생',
            },
          },
        } as any,
      });

      expect(adapted.landAreaM2).toBe(450);
      expect(adapted.grossFloorAreaM2).toBe(1420);
      expect(adapted.assetType).toBe('지식산업센터·근생');
      expect(adapted.zoning).toBe('준공업지역');
    });

    it('computes consistent canonical summary helper values', () => {
      expect(isLandPriorityPosture('development')).toBe(true);
      expect(isLandPriorityPosture('income')).toBe(false);
      expect(sqmToRoundedPyeong(450)).toBe(136);
      expect(
        resolveCanonicalAssetUse({
          mainPurpose: '제2종근린생활시설',
          assetType: '근린생활시설',
          fallbackUse: '근린생활시설',
        })
      ).toBe('제2종근린생활시설');
      expect(
        resolveCanonicalAreaLabel({
          posture: 'value_add',
          landSqm: 450,
          gfaSqm: 1420,
        })
      ).toBe('토지 136평');
      const summary = resolveCanonicalDealSummary({
        posture: 'core_income',
        region: '강남구 역삼동',
        mainPurpose: '업무시설',
        gfaSqm: 992,
        landSqm: 330,
        brokerHeadline: '역세권 도보 2분 코너 사옥',
      });
      expect(summary.use).toBe('업무시설');
      expect(summary.gfaPyeong).toBe(300);
      expect(summary.areaLabel).toBe('연면적 300평');
      expect(summary.headline).toBe('역세권 도보 2분 코너 사옥');
      expect(
        resolveCanonicalDealHeadline({
          region: '강남구 역삼동',
          assetType: '업무시설',
        })
      ).toBe('강남구 역삼동 업무시설');
    });
  });
});
