/**
 * Drift 방지: generate(sync) 와 generate-async 는 같은 요청 바디에서 같은 supplemental 을 handler 로 넘겨야 한다.
 * 회귀 배경: sync 라우트의 수제 화이트리스트가 floor_leases·parcels·specs 등을 조용히 유실해 렌트롤이 사라졌다.
 * 두 라우트는 supplemental-whitelist.parseSupplementalFromBody 단일 헬퍼를 쓴다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SUPPLEMENTAL_PASSTHROUGH_KEYS, parseSupplementalFromBody } from '@/domain/building/mobile-im/supplemental-whitelist';

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
vi.mock('@/domain/building/mobile-im/lease-adapter', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, persistLeaseUnits: vi.fn().mockResolvedValue({ inserted: 0, errors: [] }) };
});
const mockHandler = vi.fn();
vi.mock('@/app/api/broker/im-lite/generate/handler', () => ({
  generateMobileIMHandler: (...args: any[]) => mockHandler(...args),
}));

const BUILDING = 'a0000000-0000-0000-0000-000000000001';
const USER = 'u0000000-0000-0000-0000-000000000001';
const PNU = '1168010100101230045';

const FULL_BODY = {
  building_id: BUILDING,
  monthly_rent_total_krw: 12_000_000,
  asking_price_manwon: 500000,
  resolved_address: '서울 강남구 역삼동 123-45',
  resolved_pnu: PNU,
  photo_urls: ['https://x/a.jpg'],
  photos_v2: [
    { url: 'https://x/a.jpg', category: 'exterior' },
    { url: 'javascript:alert(1)', category: 'exterior' }, // 화이트리스트에서 제거
  ],
  broker_highlight: '역세권',
  floor_leases: [
    {
      floor: '1F', rent_manwon: 300, area_sqm: 100, exclusive_area_sqm: 60,
      contract_group: 'G1', evidence_level: '계약서 원본', rent_free_months: '2', payment_status: '정상',
    },
    { floor: '2F', rent_manwon: 100, evidence_level: '카톡', payment_status: '??' },
  ],
  rent_roll_meta: { area_input_unit: 'pyeong', gfa_sqm: 1200.5, area_unit_override: { reason: '일부 층 매각', by: 'attacker' } },
  broker_extras: { investment_points: ['역세권 1분'], target_rent_per_pyeong_manwon: 11 },
  ancillary_incomes: [{ type: 'parking', annualAmountKrw: 12_000_000 }],
  total_gross_area_m2: '2,500.5',
  parcels: [{ pnu: PNU, area_m2: 330 }],
  pnus: [PNU],
  parking_count: 12,
  elevator_count: 2,
  hospitalitySpec: { rooms: 10 },
  developmentSpec: { far: 800 },
  vacateSpec: { x: 1 },
  permitSpec: { y: 2 },
  occupancySpec: { z: 3 },
  sectionalSpec: { s: 1 },
  residentialSpec: { r: 1 },
  logistics: { dock: 3 },
  manual_comps: [{ name: 'c1' }],
  ltv_pct: 60,
  target_irr_pct: 8,
  evil_key: 'must-not-pass',
};

function req(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/broker/im-lite/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('generate / generate-async supplemental 화이트리스트 drift 방지', () => {
  let syncPOST: typeof import('@/app/api/broker/im-lite/generate/route').POST;
  let asyncPOST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    syncPOST = (await import('@/app/api/broker/im-lite/generate/route')).POST;
    asyncPOST = (await import('@/app/api/broker/im-lite/generate-async/route')).POST;
    mockRequireBroker.mockResolvedValue({
      user: { id: USER, email: 'b@credeal.kr' }, role: 'broker', profile: { role: 'broker' }, error: null,
    });
    mockHandler.mockResolvedValue({ ok: true, im_lite_id: 'doc-1', url: '/x' });
  });

  async function supplementalViaSync(body: Record<string, unknown>) {
    mockHandler.mockClear();
    const res = await syncPOST(req('generate', body));
    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    return JSON.parse(JSON.stringify(mockHandler.mock.calls[0][0].supplemental));
  }
  async function supplementalViaAsync(body: Record<string, unknown>) {
    mockHandler.mockClear();
    mockAfter.mockClear();
    const res = await asyncPOST(req('generate-async', body));
    expect(res.status).toBe(200);
    await (mockAfter.mock.calls[0][0] as () => Promise<void>)();
    expect(mockHandler).toHaveBeenCalledTimes(1);
    return JSON.parse(JSON.stringify(mockHandler.mock.calls[0][0].supplemental));
  }

  it('같은 바디 → 두 라우트가 handler 로 동일한 supplemental 을 전달한다 (키 집합·값 동일)', async () => {
    const s = await supplementalViaSync(FULL_BODY);
    const a = await supplementalViaAsync(FULL_BODY);
    expect(Object.keys(s).sort()).toEqual(Object.keys(a).sort());
    expect(s).toEqual(a);
  });

  it('sync 가 floor_leases(v1.5 행 필드) · rent_roll_meta · broker_extras · ancillary_incomes · total_gross_area_m2 · parcels · photos_v2 를 전달한다', async () => {
    const s = await supplementalViaSync(FULL_BODY);

    expect(s.floor_leases).toHaveLength(2);
    expect(s.floor_leases[0]).toMatchObject({
      floor: '1F', exclusive_area_sqm: 60, contract_group: 'G1',
      evidence_level: '계약서 원본', rent_free_months: 2, payment_status: '정상',
    });
    expect(s.floor_leases[1]).toMatchObject({ evidence_level: null, payment_status: null }); // 허용값 밖 → null

    expect(s.rent_roll_meta).toMatchObject({ area_input_unit: 'pyeong', gfa_sqm: 1200.5 });
    expect(s.rent_roll_meta.area_unit_override).toEqual({ reason: '일부 층 매각' }); // by 는 클라이언트 값 무시
    expect(s.broker_extras).toBeDefined();
    expect(s.ancillary_incomes[0]).toMatchObject({ type: 'parking', annualAmountKrw: 12_000_000, provenance: 'broker_input' });
    expect(s.total_gross_area_m2).toBe(2500.5);
    expect(s.parcels).toHaveLength(1);
    expect(s.pnus).toEqual([PNU]);
    expect(s.photos_v2).toEqual([{ url: 'https://x/a.jpg', category: 'exterior' }]);
    expect(s.parking_count).toBe(12);
    expect(s.elevator_count).toBe(2);
    for (const k of ['hospitalitySpec', 'developmentSpec', 'vacateSpec', 'permitSpec', 'occupancySpec', 'sectionalSpec', 'residentialSpec', 'logistics', 'manual_comps', 'ltv_pct', 'target_irr_pct']) {
      expect(s[k], k).toBeDefined();
    }
    expect(s.evil_key).toBeUndefined();
  });

  it('[NEG] 같은 잘못된 입력 → 두 라우트 모두 400 + 동일한 한국어 메시지, handler 미호출', async () => {
    for (const bad of [
      { rent_roll_meta: { area_input_unit: 'ping' } },
      { parking_count: -3 },
      { parcels: 'nope' },
    ]) {
      mockHandler.mockClear();
      mockAfter.mockClear();
      const s = await syncPOST(req('generate', { building_id: BUILDING, ...bad }));
      const a = await asyncPOST(req('generate-async', { building_id: BUILDING, ...bad }));
      expect(s.status, JSON.stringify(bad)).toBe(400);
      expect(a.status, JSON.stringify(bad)).toBe(400);
      expect((await s.json()).error).toBe((await a.json()).error);
      expect(mockHandler).not.toHaveBeenCalled();
    }
  });

  it('헬퍼 키 목록: 모든 passthrough 키가 두 라우트 결과에 존재한다 (값이 있을 때)', async () => {
    const body: Record<string, unknown> = { building_id: BUILDING };
    for (const k of SUPPLEMENTAL_PASSTHROUGH_KEYS) body[k] = k === 'floor_leases' ? [{ floor: '1F', rent_manwon: 1 }] : `v-${k}`;
    const s = await supplementalViaSync(body);
    const a = await supplementalViaAsync(body);
    for (const k of SUPPLEMENTAL_PASSTHROUGH_KEYS) {
      expect(s[k], `sync:${k}`).toBeDefined();
      expect(a[k], `async:${k}`).toBeDefined();
    }
  });

  it('헬퍼 단위: 순서 — 주차 오류가 먼저, 부가 입력 없으면 키 생략', () => {
    const r = parseSupplementalFromBody({ parking_count: -1, rent_roll_meta: { area_input_unit: 'ping' } });
    expect(r.ok).toBe(false);
    const ok = parseSupplementalFromBody({});
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.supplemental.rent_roll_meta).toBeUndefined();
      expect(ok.supplemental.parcels).toBeUndefined();
      expect(ok.side.hasExplicitRentRollMeta).toBe(false);
    }
  });
});
