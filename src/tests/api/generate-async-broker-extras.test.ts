/**
 * generate-async: 중개인 추가 정보(broker_extras) 전달/검증 계약 테스트
 * 회귀 방지: route 의 수제 화이트리스트에 키가 없으면 입력이 조용히 유실된다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = vi.fn().mockReturnValue({
  upsert: mockUpsert,
  update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  select: vi.fn(),
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

const BUILDING = 'a0000000-0000-0000-0000-000000000001';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id: BUILDING, ...body }),
  });
}

describe('generate-async broker_extras 전달/검증', () => {
  let POST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import('@/app/api/broker/im-lite/generate-async/route')).POST;
    mockRequireBroker.mockResolvedValue({
      user: { id: 'u0000000-0000-0000-0000-000000000001', email: 'b@credeal.kr' },
      role: 'broker', profile: { role: 'broker' }, error: null,
    });
  });

  it('검증·정제된 broker_extras 가 supplemental 로 전달된다', async () => {
    const res = await POST(req({
      broker_extras: {
        investment_points: ['  역세권 1분  ', ''],
        market_comps: [{ kind: 'transaction', location: '신사동 1', price_eok: 45 }],
        regulatory_notes: [{ kind: 'dev_restriction', detail: '제한', basis: '고시', unknown_key: 'x' }],
        target_rent_per_pyeong_manwon: 11,
        evil: '<script>',
      },
    }));
    expect(res.status).toBe(200);
    const extras = mockUpsert.mock.calls[0][0].input_payload.supplemental.broker_extras;
    expect(extras.investment_points).toEqual(['역세권 1분']);
    expect(extras.market_comps).toEqual([{ kind: 'transaction', location: '신사동 1', price_eok: 45 }]);
    expect(extras.regulatory_notes[0]).toEqual({ kind: 'dev_restriction', detail: '제한', basis: '고시' });
    expect(extras.target_rent_per_pyeong_manwon).toBe(11);
    expect(extras.evil).toBeUndefined();
  });

  it('[NEG] 미입력/전부 공백이면 broker_extras 키를 만들지 않는다', async () => {
    const res1 = await POST(req({}));
    expect(res1.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].input_payload.supplemental.broker_extras).toBeUndefined();
    const res2 = await POST(req({ broker_extras: { investment_points: [' '], closing_line: '' } }));
    expect(res2.status).toBe(200);
    expect(mockUpsert.mock.calls[1][0].input_payload.supplemental.broker_extras).toBeUndefined();
  });

  it('[NEG] 한도 초과는 400 + 한국어 메시지 + job 미생성', async () => {
    const res = await POST(req({ broker_extras: { investment_points: ['1', '2', '3', '4', '5', '6'] } }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('투자 포인트');
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('[NEG] 음수 목표 임대료 / 객체 아님은 400', async () => {
    expect((await POST(req({ broker_extras: { target_rent_per_pyeong_manwon: -3 } }))).status).toBe(400);
    expect((await POST(req({ broker_extras: 'x' }))).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('photos_v2 의 신규 문서 카테고리(location_map 등)가 그대로 통과한다', async () => {
    const res = await POST(req({
      photos_v2: [
        { url: 'https://x/ext.jpg', category: 'exterior' },
        { url: 'https://x/loc.png', category: 'location_map' },
        { url: 'https://x/dp.png', category: 'district_plan_map' },
        { url: 'https://x/plan.png', category: 'floor_plan' },
      ],
    }));
    expect(res.status).toBe(200);
    const cats = mockUpsert.mock.calls[0][0].input_payload.supplemental.photos_v2.map((p: any) => p.category);
    expect(cats).toEqual(['exterior', 'location_map', 'district_plan_map', 'floor_plan']);
  });
});
