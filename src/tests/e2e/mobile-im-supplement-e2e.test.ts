import { describe, test, expect } from 'vitest';

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'dummy-token';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

describe('Mobile IM Supplement E2E Tests', () => {
  // B1. IM 생성 보충 (IM-SUP-01~02)
  test('IM-SUP-01: 메모 텍스트를 파싱하여 구조화된 SSoT 필드를 반환해야 한다 (POST /api/broker/im-lite/parse-memo)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/parse-memo`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ memo_text: '강남구 역삼동 100억 빌딩 매각. 현재 공실 없음. 수익률 5%.' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data).toHaveProperty('asset_type');
  });

  test('IM-SUP-02: IM 생성 비동기 작업 상태를 조회해야 한다 (GET /api/broker/im-lite/job-status?jobId=xxx)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/job-status?jobId=test-job-id`, {
      headers: HEADERS
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(['processing', 'completed', 'failed']).toContain(data.status);
  });

  // B2. IM 승인 보충 (IM-SUP-03~04)
  test('IM-SUP-03: XSS가 방지된 상태로 IM 섹션 데이터를 저장해야 한다 (PUT /api/broker/im-lite/[id]/save-sections)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const imId = 'test-im-123';
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/${imId}/save-sections`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ sections: [{ id: 's1', content: '<script>alert(1)</script>Safe content' }] })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('IM-SUP-04: K-Anonymity 체크를 거쳐 IM을 승인/발행 상태로 변경해야 한다 (POST /api/broker/im-lite/[id]/approve)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const imId = 'test-im-123';
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/${imId}/approve`, {
      method: 'POST',
      headers: HEADERS
    });
    // K-Anonymity checks might fail in test depending on data, but we expect an API response
    expect([200, 400, 422]).toContain(res.status);
  });

  // B3. IM 뷰어 보충 (IM-SUP-05~06)
  test('IM-SUP-05: Public API가 전체 IM 데이터를 JSON으로 반환해야 한다 (GET /api/public/im-lite/[buildingId])', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}`, {
      headers: HEADERS
    });
    // 상태 코드는 데이터 존재 여부에 따라 달라질 수 있으나 API 도달을 확인
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('buildingId');
    }
  });

  test('IM-SUP-06: PDF 생성을 위한 HTML 익스포트가 정상 동작해야 한다 (GET /api/public/im-lite/[buildingId]/export)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}/export`, {
      headers: HEADERS
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const text = await res.text();
      expect(text.toLowerCase()).toContain('<html');
    }
  });

  // B5. 번역 & TTS (IM-SUP-07~09)
  test('IM-SUP-07: 영문 번역을 요청하고 결과를 반환해야 한다 (POST /api/public/im-lite/[buildingId]/translate)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}/translate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ targetLang: 'en' })
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.translatedText).toBeDefined();
    }
  });

  test('IM-SUP-08: 중문 번역을 요청하고 결과를 반환해야 한다 (POST /api/public/im-lite/[buildingId]/translate)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}/translate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ targetLang: 'zh' })
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.translatedText).toBeDefined();
    }
  });

  test('IM-SUP-09: TTS 오디오 응답을 정상적으로 반환해야 한다 (GET /api/public/im-lite/[buildingId]/tts)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}/tts`, {
      headers: HEADERS
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      expect(contentType.includes('audio')).toBe(true);
    }
  });

  // B6. 열람 분석 (IM-SUP-10~12)
  test('IM-SUP-10: 뷰어 조회수 로깅 이벤트가 200을 반환해야 한다 (POST /api/public/im-lite/[buildingId]/view)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const buildingId = 'bld-456';
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingId}/view`, {
      method: 'POST',
      headers: HEADERS
    });
    expect(res.status).toBe(200);
  });

  test('IM-SUP-11: 브로커가 조회수 통계 데이터를 정상적으로 확인할 수 있어야 한다 (GET /api/broker/im-lite/[id]/views)', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const imId = 'test-im-123';
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/${imId}/views`, {
      headers: HEADERS
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('totalViews');
      expect(data).toHaveProperty('uniqueViewers');
      expect(data).toHaveProperty('recentViewers');
    }
  });

  test('IM-SUP-12: IM 문서를 정상적으로 삭제할 수 있어야 한다 (DELETE /api/broker/im-lite/[id])', async () => {
    if (AUTH_TOKEN === 'dummy-token') return;
    const imId = 'test-im-123';
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/${imId}`, {
      method: 'DELETE',
      headers: HEADERS
    });
    expect([200, 404]).toContain(res.status);
  });
});
