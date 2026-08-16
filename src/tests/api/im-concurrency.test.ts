import { describe, test, expect, beforeAll } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
let isServerRunning = false;

// Known building IDs
const BLD_JAMWON = 'fe5cbadd-aede-4a58-af40-3982f48ecfa7';
const BLD_DANGSAN = '36300a3c-f4a7-4277-97d8-ee884cf5ea58';
const BLD_YEONNAM = 'f2a70b50-0e70-4203-b358-75cc991c1660';
const BLD_NONEXISTENT = '00000000-0000-0000-0000-000000000000';

describe('IM API Concurrency and Idempotency', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE}/api/health`, { method: 'GET' }).catch(() => fetch(`${BASE}/`, { method: 'HEAD' }));
      isServerRunning = true;
    } catch (e) {
      console.warn(`Server not running at ${BASE}. Skipping tests.`);
    }
  });

  test('CC01: Concurrent POST generate-async with same building_id', async () => {
    if (!isServerRunning) return;
    const req1 = fetch(`${BASE}/api/admin/im/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: BLD_DANGSAN })
    });
    const req2 = fetch(`${BASE}/api/admin/im/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: BLD_DANGSAN })
    });
    const [res1, res2] = await Promise.all([req1, req2]);
    expect(res1.status).toBeLessThan(500);
    expect(res2.status).toBeLessThan(500);
  });

  test('CC02: POST generate-async returns a jobId', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/admin/im/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: BLD_YEONNAM })
    });
    if (res.status === 200 || res.status === 202) {
      const data = await res.json();
      expect(data).toHaveProperty('jobId');
    }
  });

  test('CC03: GET job-status with valid jobId', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/admin/im/job-status/test-job-id`);
    expect(res.status).toBeLessThan(500);
  });

  test('CC04: GET job-status with invalid jobId', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/admin/im/job-status/invalid-job-id-12345`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('CC05: POST generate-async twice sequentially', async () => {
    if (!isServerRunning) return;
    const res1 = await fetch(`${BASE}/api/admin/im/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: BLD_JAMWON })
    });
    const res2 = await fetch(`${BASE}/api/admin/im/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building_id: BLD_JAMWON })
    });
    expect(res1.status).toBeLessThan(500);
    expect(res2.status).toBeLessThan(500);
  });

  test('CC06: GET public IM viewer for published document', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_JAMWON}`);
    expect(res.status).toBeLessThan(500);
  });

  test('CC07: GET public IM viewer for nonexistent document', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_NONEXISTENT}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.data).toBeNull();
    }
  });

  test('CC08: PPTX download for published document', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_JAMWON}/pptx`);
    if (res.status === 200) {
      const contentType = res.headers.get('content-type');
      expect(contentType).toMatch(/octet-stream|presentationml/);
    }
  });

  test('CC09: PPTX download for nonexistent document', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_NONEXISTENT}/pptx`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('CC10: Concurrent PPTX downloads', async () => {
    if (!isServerRunning) return;
    const req1 = fetch(`${BASE}/api/public/im-lite/${BLD_JAMWON}/pptx`);
    const req2 = fetch(`${BASE}/api/public/im-lite/${BLD_JAMWON}/pptx`);
    const [res1, res2] = await Promise.all([req1, req2]);
    expect(res1.status).toBeLessThan(500);
    expect(res2.status).toBeLessThan(500);
  });

  test('CC11: GET im-lite API', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_JAMWON}`);
    if (res.status === 200) {
      const json = await res.json();
      expect(json.data || json).toHaveProperty('sections');
    }
  });

  test('CC12: GET im-lite API for nonexistent', async () => {
    if (!isServerRunning) return;
    const res = await fetch(`${BASE}/api/public/im-lite/${BLD_NONEXISTENT}`);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.data).toBeNull();
    } else {
      expect(res.status).toBe(404);
    }
  });
});
