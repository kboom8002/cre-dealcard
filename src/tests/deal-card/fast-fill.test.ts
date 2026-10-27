import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockBuilding = {
  id: 'bldg-123',
  address: '서울특별시 강남구 신사동 500-1',
  road_address: '서울특별시 강남구 압구정로 100',
  asset_type: '근린생활시설',
  asking_price_krw: 95 * 1_0000_0000,
  land_area_pyung: 120.5,
  total_floor_area_pyung: 345.2,
  road_contact: 'MED_CORNER',
  completion_year: 2019,
};

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => ({
    user: { id: 'broker-1' },
    role: 'broker',
  })),
}));

vi.mock('@/lib/authz/assert-owner', () => ({
  assertBuildingOwner: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: vi.fn(async (id: string) => {
    if (id === 'bldg-123') return mockBuilding;
    return null;
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({})),
}));

import { POST } from '@/app/api/broker/deal-card/fast-fill/route';

describe('WP-P1-04: Fast-Fill Extraction Endpoint', () => {
  it('extracts initial 4 items from building facts with public provenance', async () => {
    const startTime = Date.now();
    const req = new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
      method: 'POST',
      body: JSON.stringify({ buildingId: 'bldg-123' }),
    });

    const res = await POST(req);
    const duration = Date.now() - startTime;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(1000); // Latency SLA < 1s (well below 6s limit)

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.card4).toBeDefined();

    // Verify 4 items derived from building facts
    expect(json.card4.region).toContain('신사동');
    expect(json.card4.use).toBe('근린생활시설');
    expect(json.card4.priceBand).toBe('90~100억'); // Formatted by price band SSOT
    expect(json.card4.points).toHaveLength(3);

    // Provenance should be 'public'
    expect(json.card4.provenance.points).toEqual(['public', 'public', 'public']);

    // Deterministic hash should be generated
    expect(json.card4.card4_hash).toHaveLength(64);
    expect(json.card4.card4_version).toBe(1);
  });

  it('extracts 4 items from raw text memo with broker provenance', async () => {
    const memo = `
      성수동2가 대로변 근생 빌딩 급매합니다.
      매매가 85억원 협의 가능.
      대지 95평 연면적 240평 B1~4F 규모.
      전층 근생 임대 완료되어 공실 없음.
    `;

    const req = new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
      method: 'POST',
      body: JSON.stringify({ memo }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.card4.region).toContain('성수동');
    expect(json.card4.use).toBe('근린생활시설');
    expect(json.card4.priceBand).toBe('80~90억');
    expect(json.card4.provenance.points).toEqual(['broker', 'broker', 'broker']);
  });

  it('rejects request if neither buildingId nor memo is provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
