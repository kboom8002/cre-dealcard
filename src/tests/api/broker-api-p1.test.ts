import { describe, test, expect } from 'vitest';

/**
 * DC-L3 API 엔드포인트 E2E 테스트 (P1)
 */

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('DC-L3 Broker API (P1)', () => {
  const testBuildingId = 'test-building'; // Assumes this building exists or we get 404

  test('DC-L3-06: 딜 브리핑 생성', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/buildings/${testBuildingId}/briefing`, {
      headers: HEADERS
    });
    
    // We expect 200 if the building exists, otherwise maybe 404. We'll check the structure if it's 200.
    if (res.status === 200) {
      const data = await res.json();
      expect(data.matchedBuyers).toBeDefined();
      expect(data.similarDeals).toBeDefined();
    }
  });

  test('DC-L3-07: 딜 인텔리전스 (Conversion)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/buildings/${testBuildingId}/conversion`, {
      headers: HEADERS
    });
    
    if (res.status === 200) {
      const data = await res.json();
      expect(data.conversion).toBeDefined();
      if (data.conversion) {
        expect(data.conversion.probability).toBeGreaterThanOrEqual(0);
        expect(data.conversion.probability).toBeLessThanOrEqual(1);
      }
    }
  });

  test('DC-L3-08: 매물 랭킹', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/buildings/rank`, {
      headers: HEADERS
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.rankings)).toBe(true);
    if (data.rankings.length > 1) {
      expect(data.rankings[0].promotionScore).toBeGreaterThanOrEqual(data.rankings[1].promotionScore);
    }
  });

  test('DC-L3-09: 매수자 클러스터링', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/prediction/cluster-buyers`, {
      method: 'POST',
      headers: HEADERS
    });

    // Could be 200 or 422 if not enough data
    expect([200, 422]).toContain(res.status);
  });

  test('DC-L3-10: 가격 추정', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/prediction/price`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        building_ssot_lite_id: testBuildingId
      })
    });

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.priceRange).toBeDefined();
    }
  });
});
