/**
 * C-05 bridge: 동일 buildingId dedupe + pending_magazine_deals 상한(최근 N건)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clientHolder = vi.hoisted(() => ({ client: null as any }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => clientHolder.client }));

import {
  extractAndAppendDealSnippet,
  planPendingDeals,
  MAX_PENDING_MAGAZINE_DEALS,
} from '@/domain/magazine/im-to-magazine-bridge';

const deal = (id: string, i = 0) => ({
  buildingId: id, blindName: `n${i}`, investmentPoint: '', assetType: '', priceBand: '',
  photoUrl: null, imUrl: `/im-lite/${id}`, createdAt: '2026-10-01T00:00:00.000Z',
});

function makeClient(opts: { pending?: unknown; readError?: unknown; profileMissing?: boolean; updateError?: unknown } = {}) {
  const rpc = vi.fn(async () => ({ error: null }));
  const updateEq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn(async () => ({
    data: opts.profileMissing ? null : { pending_magazine_deals: opts.pending ?? [] },
    error: opts.readError ?? null,
  }));
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    update,
  }));
  return { client: { from, rpc }, rpc, update, updateEq, from };
}

const baseOpts = (buildingId: string) => ({
  userId: 'u1',
  buildingId,
  heroCard: { keyInvestmentPoint: '역세권', assetType: '꼬마빌딩', askingPriceDisplay: '50억' } as any,
  ssot: { area_signal: '성수', asset_type: '꼬마빌딩', price_band: '50억' },
  photoUrls: ['https://img/1.jpg'],
});

beforeEach(() => { clientHolder.client = null; });

describe('planPendingDeals (순수)', () => {
  it('새 건물 + 깨끗한 목록 + 한도 이내 → append', () => {
    expect(planPendingDeals([deal('a'), deal('b')], { buildingId: 'c' })).toEqual({ action: 'append' });
    expect(planPendingDeals(null, { buildingId: 'c' })).toEqual({ action: 'append' });
  });

  it('동일 buildingId → skip', () => {
    expect(planPendingDeals([deal('a'), deal('b')], { buildingId: 'b' })).toEqual({ action: 'skip' });
  });

  it('한도 초과 → 최근 N건만 남겨 replace (새 항목이 마지막)', () => {
    const existing = Array.from({ length: MAX_PENDING_MAGAZINE_DEALS }, (_, i) => deal(`b${i}`, i));
    const plan = planPendingDeals(existing, { buildingId: 'new' });
    expect(plan.action).toBe('replace');
    if (plan.action === 'replace') {
      expect(plan.list).toHaveLength(MAX_PENDING_MAGAZINE_DEALS);
      expect(plan.list[plan.list.length - 1].buildingId).toBe('new');
      expect(plan.list[0].buildingId).toBe('b1'); // 가장 오래된 b0 제거
    }
  });

  it('레거시 중복(55건 → 고유 13건)은 정리해서 replace', () => {
    const legacy = Array.from({ length: 55 }, (_, i) => deal(`b${i % 13}`, i));
    const plan = planPendingDeals(legacy, { buildingId: 'b3' });
    expect(plan.action).toBe('replace');
    if (plan.action === 'replace') {
      expect(plan.list).toHaveLength(13);
      expect(new Set(plan.list.map((d) => d.buildingId)).size).toBe(13);
    }
    // buildingId 없는 항목은 버려진다
    const dirty = planPendingDeals([deal('a'), { foo: 1 } as unknown], { buildingId: 'z' });
    expect(dirty.action).toBe('replace');
  });
});

describe('extractAndAppendDealSnippet', () => {
  it('동일 건물 2회 호출 → RPC/update 모두 0회 (1건 유지)', async () => {
    const m = makeClient({ pending: [deal('bld-1')] });
    clientHolder.client = m.client;
    await extractAndAppendDealSnippet(baseOpts('bld-1'));
    await extractAndAppendDealSnippet(baseOpts('bld-1'));
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it('새 건물 → 기존 RPC append 1회 (시그니처/페이로드 유지)', async () => {
    const m = makeClient({ pending: [deal('bld-0')] });
    clientHolder.client = m.client;
    await extractAndAppendDealSnippet(baseOpts('bld-9'));
    expect(m.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = m.rpc.mock.calls[0] as unknown as [string, any];
    expect(fn).toBe('append_magazine_deal_snippet');
    expect(args.p_user_id).toBe('u1');
    expect(args.p_snippet).toMatchObject({ buildingId: 'bld-9', blindName: '성수 · 꼬마빌딩', imUrl: '/im-lite/bld-9' });
    expect(m.update).not.toHaveBeenCalled();
  });

  it('한도(20) 도달 시 RPC 대신 최근 20건으로 교체 저장', async () => {
    const existing = Array.from({ length: MAX_PENDING_MAGAZINE_DEALS }, (_, i) => deal(`b${i}`, i));
    const m = makeClient({ pending: existing });
    clientHolder.client = m.client;
    await extractAndAppendDealSnippet(baseOpts('bld-new'));
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledTimes(1);
    const payload = (m.update.mock.calls[0] as unknown[])[0] as { pending_magazine_deals: any[] };
    expect(payload.pending_magazine_deals).toHaveLength(MAX_PENDING_MAGAZINE_DEALS);
    expect(payload.pending_magazine_deals.at(-1).buildingId).toBe('bld-new');
  });

  it('조회 실패/프로필 없음이면 중복 위험이 있어 append 하지 않는다', async () => {
    const m1 = makeClient({ readError: { message: 'x', code: '42703' } });
    clientHolder.client = m1.client;
    await extractAndAppendDealSnippet(baseOpts('b'));
    expect(m1.rpc).not.toHaveBeenCalled();

    const m2 = makeClient({ profileMissing: true });
    clientHolder.client = m2.client;
    await extractAndAppendDealSnippet(baseOpts('b'));
    expect(m2.rpc).not.toHaveBeenCalled();
  });
});
