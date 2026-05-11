import { describe, test, expect } from 'vitest';

/**
 * DC-L3 API 엔드포인트 E2E 테스트 (P0)
 * Note: These tests are written to be run against a local or staging Next.js server.
 * Requires APP_BASE_URL and a valid TEST_AUTH_TOKEN in the environment.
 */

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('DC-L3 Broker API (P0)', () => {
  let createdBuildingId = '';
  let createdBuyerId = '';

  test('DC-L3-12: 인증 실패 (No Token)', async () => {
    const res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo: 'test' })
    });
    // Next.js API might return 401 or redirect depending on setup, but our API returns 401.
    expect(res.status).toBe(401);
  });

  test('DC-L3-01: 딜카드 생성 from memo', async () => {
    // skip if no real token
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        memo: '강남구 역삼동 5층 근생 100억대, 공실 없음, 1층 스벅 입점'
      })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.dealCardId).toBeDefined();
    createdBuildingId = data.dealCardId;
  });

  test('DC-L3-02: 매수자 메모 분석', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    const res = await fetch(`${BASE_URL}/api/broker/buyer-memo`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        memo: '법인 사옥 목적, 100억 예산, 강남/서초 선호, 주차 중요함'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.intentId).toBeDefined();
    createdBuyerId = data.intentId;
  });

  test('DC-L3-03: AI 매칭 실행', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    if (!createdBuildingId || !createdBuyerId) return;

    const res = await fetch(`${BASE_URL}/api/broker/match`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        buildingId: createdBuildingId,
        buyerIntentId: createdBuyerId
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.matchId).toBeDefined();
    expect(data.result.grade).toBeDefined();
  });

  test('DC-L3-05: 파이프라인 전이', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    if (!createdBuildingId) return;

    const res = await fetch(`${BASE_URL}/api/broker/buildings/${createdBuildingId}/pipeline`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        action: 'move',
        targetStage: 'gate_requested',
        metadata: { gate_request_id: 'dummy-gate' }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
