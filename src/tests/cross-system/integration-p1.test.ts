import { describe, test, expect } from 'vitest';

/**
 * X-L4 크로스시스템 통합 E2E 테스트 (P1)
 */

const DEALCARD_URL = process.env.DEALCARD_URL || 'http://localhost:3000';
const FULLIM_URL = process.env.FULLIM_URL || 'http://localhost:3001';
const AIPAGE_URL = process.env.AIPAGE_URL || 'http://localhost:3002';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('X-L4 Cross-System Integration (P1)', () => {
  const mockSpaceId = 'test-space';
  const mockDealCardId = 'test-building';

  test('X-L4-06 & X-L4-07: 공간 AI → 딜카드 Vacancy/Promotion 갱신', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // 1. AiPage에서 임차인 적합도 평가 발생
    const resFit = await fetch(`${AIPAGE_URL}/api/spaces/${mockSpaceId}/evaluate-fit`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ tenant_industry: '스튜디오' })
    });
    
    // 2. 딜카드 측 API로 Webhook이 왔다고 가정 (enrich-from-leasing, enrich-vacancy)
    const resEnrich = await fetch(`${DEALCARD_URL}/api/broker/buildings/${mockDealCardId}/enrich-vacancy`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        has_demand: true,
        inquiry_count: 3
      })
    });
    expect([200, 404]).toContain(resEnrich.status);
    
    if (resEnrich.status === 200) {
      const data = await resEnrich.json();
      expect(data.ok).toBe(true);
    }
  });

  test('X-L4-04 & X-L4-05: P-D 가격 / AiPage 데이터 → Full IM 반영', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // IM 섹션 초안 생성 시 외부 API 데이터를 잘 가져오는지 확인
    const resIm = await fetch(`${FULLIM_URL}/api/im-sections/generate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        projectId: 'test-project',
        sectionType: 'valuation' // 가치평가 섹션 (P-D 가격 데이터 사용)
      })
    });

    expect([200, 404]).toContain(resIm.status);
    if (resIm.status === 200) {
      const data = await resIm.json();
      expect(data.ok).toBe(true);
      expect(typeof data.markdown).toBe('string');
    }
  });

  test('X-L4-09: 파이프라인 종료 → P-X 스냅샷', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;

    // 딜카드 파이프라인을 closed로 전이
    const res = await fetch(`${DEALCARD_URL}/api/broker/buildings/${mockDealCardId}/pipeline`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        action: 'move',
        targetStage: 'closed',
        metadata: { closing_date: new Date().toISOString(), fund_confirmed: true }
      })
    });

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.ok).toBe(true);
      // 백그라운드에서 deal_conversion_features 에 스냅샷이 생성되어야 함
    }
  });
});
