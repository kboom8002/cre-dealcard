/**
 * generate-async: 다필지(parcels/pnus) 전달 계약 테스트
 * 회귀 방지: 바텀시트가 보낸 parcels/pnus 가 route 에서 유실되어 파이프라인(지적도 다필지 하이라이트, 대지면적 합계)에
 * 전혀 도달하지 않던 P0 결함.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
const P1 = '1156011000101170000';
const P2 = '1156011000101340000';
const P3 = '1156011000101250002';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ building_id: BUILDING, ...body }),
  });
}

describe('generate-async 다필지 전달', () => {
  let POST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    POST = (await import('@/app/api/broker/im-lite/generate-async/route')).POST;
    mockRequireBroker.mockResolvedValue({
      user: { id: 'u0000000-0000-0000-0000-000000000001', email: 'b@credeal.kr' },
      role: 'broker', profile: { role: 'broker' }, error: null,
    });
  });

  it('parcels/pnus 가 supplemental 로 전달되어 job input_payload 에 남는다', async () => {
    const res = await POST(req({
      parcels: [
        { pnu: P1, landCategory: '대', areaM2: 300, shareRatio: 1, officialPricePerM2: 1000 },
        { pnu: P2, landCategory: '대', areaM2: 100, shareRatio: 1 },
        { pnu: P3, landCategory: '잡종지', areaM2: 100 },
      ],
      pnus: [P1, P2, P3],
    }));
    expect(res.status).toBe(200);
    const payload = mockUpsert.mock.calls[0][0].input_payload.supplemental;
    expect(payload.pnus).toEqual([P1, P2, P3]);
    expect(payload.parcels).toHaveLength(3);
    expect(payload.parcels[0]).toMatchObject({ pnu: P1, areaM2: 300, landCategory: '대' });
  });

  it('pnus 가 없어도 parcels 에서 파생한다', async () => {
    const res = await POST(req({ parcels: [{ pnu: P1, areaM2: 10 }, { pnu: P2, areaM2: 20 }] }));
    expect(res.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].input_payload.supplemental.pnus).toEqual([P1, P2]);
  });

  it('19자리가 아닌 PNU 는 pnus 에서 제외된다', async () => {
    const res = await POST(req({ parcels: [{ pnu: '123', areaM2: 10 }], pnus: ['123', P1] }));
    expect(res.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0].input_payload.supplemental.pnus).toEqual([P1]);
  });

  it('[NEG] 필지 미입력이면 parcels/pnus 키를 만들지 않는다', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const payload = mockUpsert.mock.calls[0][0].input_payload.supplemental;
    expect(payload.parcels).toBeUndefined();
    expect(payload.pnus).toBeUndefined();
  });

  it('[NEG] parcels 가 배열이 아니면 400 + job 미생성', async () => {
    const res = await POST(req({ parcels: 'x' }));
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('[NEG] 필지 31개 초과는 400', async () => {
    const parcels = Array.from({ length: 31 }, (_, i) => ({ areaM2: i + 1 }));
    const res = await POST(req({ parcels }));
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// NextResponse import 는 모킹된 next/server 에서 타입 용도로만 사용
void NextResponse;
