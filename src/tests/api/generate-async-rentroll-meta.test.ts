/**
 * generate-async: 렌트롤 v1.5 rent_roll_meta 전달/검증 + 부가수입·연면적 passthrough + 원장 메타 영속 계약
 * 회귀 방지: route 의 수제 화이트리스트에 키가 없으면 입력이 조용히 유실된다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn().mockReturnValue({
  upsert: mockUpsert,
  update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
});
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));
const mockAfter = vi.fn();
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, after: (cb: () => any) => { mockAfter(cb); } };
});
const mockRequireBroker = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: any[]) => mockRequireBroker(...args),
}));
const mockPersist = vi.fn().mockResolvedValue({ inserted: 0, errors: [] });
vi.mock('@/domain/building/mobile-im/lease-adapter', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, persistLeaseUnits: (...args: any[]) => mockPersist(...args) };
});
const mockHandler = vi.fn();
vi.mock('@/app/api/broker/im-lite/generate/handler', () => ({
  generateMobileIMHandler: (...args: any[]) => mockHandler(...args),
}));

const BUILDING = 'a0000000-0000-0000-0000-000000000001';
const USER = 'u0000000-0000-0000-0000-000000000001';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id: BUILDING, ...body }),
  });
}
const supplementalOf = (callIdx = 0) => mockUpsert.mock.calls[callIdx][0].input_payload.supplemental;

describe('generate-async 렌트롤 v1.5 입력 계약', () => {
  let POST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import('@/app/api/broker/im-lite/generate-async/route')).POST;
    mockRequireBroker.mockResolvedValue({
      user: { id: USER, email: 'b@credeal.kr' },
      role: 'broker', profile: { role: 'broker' }, error: null,
    });
    mockHandler.mockResolvedValue({ ok: true, im_lite_id: 'doc-1', url: '/x' });
  });

  it('rent_roll_meta 검증·정제 후 supplemental 로 전달 (override by/at 은 클라이언트 값 무시)', async () => {
    const res = await POST(req({
      rent_roll_meta: {
        area_input_unit: 'pyeong',
        rentroll_version: '1.5',
        rentroll_as_of: '2026-10-01',
        asking_price_krw: 5_000_000_000,
        gfa_sqm: 1200.5,
        market_rent_1f: 150000,
        market_rent_1f_source: '시세 <b>조사</b>',
        area_unit_override: { reason: '일부 층 매각', by: 'attacker', at: '1999-01-01' },
        evil: 'x',
      },
    }));
    expect(res.status).toBe(200);
    const meta = supplementalOf().rent_roll_meta;
    expect(meta).toMatchObject({
      area_input_unit: 'pyeong', rentroll_version: '1.5', rentroll_as_of: '2026-10-01',
      asking_price_krw: 5_000_000_000, gfa_sqm: 1200.5, market_rent_1f: 150000, market_rent_1f_source: '시세 b조사/b',
    });
    expect(meta.area_unit_override).toEqual({ reason: '일부 층 매각' });
    expect(meta.evil).toBeUndefined();
  });

  it('[NEG] 미전송이면 rent_roll_meta 키를 만들지 않는다 (기본 sqm 은 handler 가 적용)', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(supplementalOf().rent_roll_meta).toBeUndefined();
  });

  it('[NEG] 잘못된 메타는 400 + 한국어 메시지 + job 미생성', async () => {
    for (const bad of [
      { area_input_unit: 'ping' },
      { rentroll_as_of: '2026-99-99' },
      { asking_price_krw: -1 },
      { area_unit_override: { reason: '' } },
      'x',
    ]) {
      mockUpsert.mockClear();
      const res = await POST(req({ rent_roll_meta: bad }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('렌트롤 정보');
      expect(mockUpsert).not.toHaveBeenCalled();
    }
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('ancillary_incomes / total_gross_area_m2 가 sanitize 후 통과한다 (X1)', async () => {
    const res = await POST(req({
      ancillary_incomes: [{ type: 'parking', annualAmountKrw: 12_000_000 }, { type: 'x', annualAmountKrw: -1 }],
      total_gross_area_m2: '2,500.5',
    }));
    expect(res.status).toBe(200);
    const s = supplementalOf();
    expect(s.ancillary_incomes).toHaveLength(1);
    expect(s.ancillary_incomes[0]).toMatchObject({ type: 'parking', annualAmountKrw: 12_000_000, provenance: 'broker_input' });
    expect(s.total_gross_area_m2).toBe(2500.5);

    mockUpsert.mockClear();
    await POST(req({ total_gross_area_m2: -5, ancillary_incomes: 'nope' }));
    expect(supplementalOf().total_gross_area_m2).toBeUndefined();
    expect(supplementalOf().ancillary_incomes).toBeUndefined();
  });

  it('floor_leases 의 v1.4/v1.5 행 필드가 정규화되어 전달된다', async () => {
    const res = await POST(req({
      floor_leases: [
        { floor: '1F', rent_manwon: 300, evidence_level: '계약서 원본', payment_status: '정상', rent_free_months: '2', contract_group: 'G1' },
        { floor: '2F', rent_manwon: 100, evidence_level: '카톡', payment_status: '??' },
      ],
    }));
    expect(res.status).toBe(200);
    const rows = supplementalOf().floor_leases;
    expect(rows[0]).toMatchObject({ evidence_level: '계약서 원본', payment_status: '정상', rent_free_months: 2, contract_group: 'G1' });
    expect(rows[1]).toMatchObject({ evidence_level: null, payment_status: null });
  });

  async function runAfter() {
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await (mockAfter.mock.calls[0][0] as () => Promise<void>)();
  }

  it('원장 영속: 클라이언트가 메타를 보냈을 때만 meta 를 persistLeaseUnits 로 넘기고, handler 가 채운 by/at 을 사용', async () => {
    mockHandler.mockImplementation(async (input: any) => {
      // handler 동작 모사: 서버가 override.by/at 을 채워 같은 supplemental 객체에 되돌려 둔다
      input.supplemental.rent_roll_meta = {
        ...input.supplemental.rent_roll_meta,
        area_unit_override: { reason: '일부 층 매각', by: USER, at: '2026-10-10T00:00:00.000Z' },
      };
      return { ok: true, im_lite_id: 'doc-1', url: '/x' };
    });
    await POST(req({
      floor_leases: [{ floor: '1F', rent_manwon: 300, area_sqm: 100 }],
      rent_roll_meta: { area_input_unit: 'pyeong', area_unit_override: { reason: '일부 층 매각' } },
    }));
    await runAfter();
    expect(mockPersist).toHaveBeenCalledTimes(1);
    const [assetId, units, buildingId, opts] = mockPersist.mock.calls[0];
    expect(assetId).toBe(BUILDING);
    expect(buildingId).toBeUndefined();
    expect(units[0]).toMatchObject({ floor: '1F', monthly_rent_krw: 3_000_000, lease_area_sqm: 100 });
    expect(opts.meta).toMatchObject({ area_input_unit: 'pyeong', area_unit_override: { reason: '일부 층 매각', by: USER } });
  });

  it('원장 영속: 메타 미전송이면 meta 는 undefined (기존 pyeong 메타를 sqm 기본값으로 덮지 않는다)', async () => {
    mockHandler.mockImplementation(async (input: any) => {
      input.supplemental.rent_roll_meta = { area_input_unit: 'sqm' }; // handler 가 기본값을 채워도
      return { ok: true, im_lite_id: 'doc-1', url: '/x' };
    });
    await POST(req({ floor_leases: [{ floor: '1F', rent_manwon: 300 }] }));
    await runAfter();
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist.mock.calls[0][3].meta).toBeUndefined();
  });
});
