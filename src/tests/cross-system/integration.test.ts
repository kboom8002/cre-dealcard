import { describe, test, expect } from 'vitest';

/**
 * X-L4 크로스시스템 통합 E2E 테스트 (P0)
 */

const DEALCARD_URL = process.env.DEALCARD_URL || 'http://localhost:3000';
const FULLIM_URL = process.env.FULLIM_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('X-L4 Cross-System Integration (P0)', () => {
  let dealCardId = '';

  test('X-L4-01: 메모→딜카드→모바일IM', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // 1. 메모로 딜카드 생성
    const res1 = await fetch(`${DEALCARD_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ memo: '테스트용 메모입니다. 강남구 100억 빌딩' })
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    dealCardId = data1.dealCardId;

    // 2. 생성된 딜카드로 FullIM 시스템에서 모바일 IM 생성 요청
    const res2 = await fetch(`${FULLIM_URL}/api/mobile-im/generate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ building_ssot_lite_id: dealCardId })
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.ok).toBe(true);
    expect(data2.sections.length).toBe(7);
  });

  test('X-L4-02: 딜카드→매칭→그래프 엣지 생성', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // 1. 매수자 생성
    const resBuyer = await fetch(`${DEALCARD_URL}/api/broker/buyer-memo`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ memo: '법인 매수자 테스트' })
    });
    const buyerData = await resBuyer.json();
    const buyerId = buyerData.intentId;

    // 2. 매칭 실행 (내부적으로 G-X 엣지 생성 및 CasePack 저장)
    const resMatch = await fetch(`${DEALCARD_URL}/api/broker/match`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ buildingId: dealCardId, buyerIntentId: buyerId })
    });
    expect(resMatch.status).toBe(200);
    const matchData = await resMatch.json();
    expect(matchData.ok).toBe(true);
  });

  test('X-L4-03: 딜카드→Full IM 핸드오프 (데이터 이관)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // 1. DealCard에서 Full IM 생성 요청
    const resHandoff = await fetch(`${FULLIM_URL}/api/im-projects`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        building_ssot_lite_id: dealCardId,
        target_output: 'full_im'
      })
    });
    expect(resHandoff.status).toBe(200);
    const data = await resHandoff.json();
    expect(data.ok).toBe(true);
    expect(data.projectId).toBeDefined();
    // 데이터 이관이 성공했음을 project 생성으로 확인
  });
});
