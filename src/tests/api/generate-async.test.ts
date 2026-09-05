/**
 * src/tests/api/generate-async.test.ts
 *
 * Production-grade API integration test suite for
 * POST /api/broker/im-lite/generate-async
 *
 * Requirements:
 * - Genuine API route handler invocations (no facades)
 * - Negative pair obligations (Rule 7) across all test categories
 * - Strict output assertions (Rule 6) on HTTP status, jobId, error codes, and DB job record
 * - Zero instances of placeholder boolean assertions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mock DB client & job queue ──
const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
});
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
});

const mockFrom = vi.fn().mockReturnValue({
  upsert: mockUpsert,
  update: mockUpdate,
  select: mockSelect,
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// ── Mock Next.js after() to prevent AsyncLocalStorage missing-store error ──
const mockAfter = vi.fn();
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    after: (cb: () => any) => {
      mockAfter(cb);
    },
  };
});

// ── Mock requireBroker from auth-guard ──
const mockRequireBroker = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: any[]) => mockRequireBroker(...args),
}));

describe('API Route - POST /api/broker/im-lite/generate-async', () => {
  let POST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

  const validBuildingUuid = 'a0000000-0000-0000-0000-000000000001';
  const testUserId = 'u0000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/broker/im-lite/generate-async/route');
    POST = mod.POST;

    // Default: Authenticated broker
    mockRequireBroker.mockResolvedValue({
      user: { id: testUserId, email: 'broker@credeal.kr' },
      role: 'broker',
      profile: { role: 'broker', display_name: '인증 브로커' },
      error: null,
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 1. Authentication & Authorization Tests (Rule 7 Negative Pair)
  // ════════════════════════════════════════════════════════════════════════
  describe('1. Authentication Guard', () => {
    it('TC-ASYNC-AUTH-01-NEG [Negative Pair]: Unauthenticated request returns HTTP 401', async () => {
      mockRequireBroker.mockResolvedValueOnce({
        user: null,
        role: null,
        profile: null,
        error: NextResponse.json(
          { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
          { status: 401 },
        ),
      });

      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: validBuildingUuid }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it('TC-ASYNC-AUTH-01-POS [Positive Pair]: Authenticated broker passes auth check and schedules job', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ building_id: validBuildingUuid }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.jobId).toMatch(new RegExp(`^im_${validBuildingUuid}_\\d+$`));
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 2. Request Body & UUID Validation Tests (Rule 7 Negative Pair)
  // ════════════════════════════════════════════════════════════════════════
  describe('2. Input Payload Validation', () => {
    it('TC-ASYNC-VAL-01-NEG [Negative Pair]: Missing building_id returns HTTP 400', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'basic' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('building_id is required');
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('TC-ASYNC-VAL-02-NEG [Negative Pair]: Malformed non-UUID building_id returns HTTP 400', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: 'invalid-non-uuid-string' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('유효하지 않은 building_id');
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('TC-ASYNC-VAL-03-NEG [Negative Pair]: Non-JSON malformed request body returns HTTP 400', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{{malformed json payload',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid request body');
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 3. Pro Tier Quality Grade Gates (Rule 6 Output Assertions & 422 status)
  // ════════════════════════════════════════════════════════════════════════
  describe('3. Pro Tier Quality Grade Gates (Rule 6 Output Assertions & 422 Handling)', () => {
    it('TC-ASYNC-GRADE-01-NEG [Negative Pair]: Pro tier generation with D-grade rent roll returns HTTP 422', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: validBuildingUuid,
          tier: 'pro',
          direct_data: { qualityGrade: 'D' },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.error).toBe('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it('TC-ASYNC-GRADE-02-NEG [Negative Pair]: Pro tier generation with C-grade rent roll returns HTTP 422', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: validBuildingUuid,
          tier: 'pro',
          direct_data: { grade: 'C' },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.error).toBe('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('TC-ASYNC-GRADE-01-POS [Positive Pair]: Pro tier generation with B-grade rent roll succeeds (HTTP 200)', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: validBuildingUuid,
          tier: 'pro',
          direct_data: { qualityGrade: 'B' },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.jobId).toMatch(new RegExp(`^im_${validBuildingUuid}_\\d+$`));
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('TC-ASYNC-GRADE-BASIC-POS [Positive Pair]: Basic tier generation with D-grade rent roll is NOT blocked', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: validBuildingUuid,
          tier: 'basic',
          direct_data: { qualityGrade: 'D' },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.jobId).toMatch(new RegExp(`^im_${validBuildingUuid}_\\d+$`));
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 4. Asynchronous Execution & DB Job Persistence (Rule 6 Output Assertions)
  // ════════════════════════════════════════════════════════════════════════
  describe('4. Asynchronous Job Persistence & Execution Flow', () => {
    it('TC-ASYNC-GEN-01 [Positive]: Full valid payload returns 200, creates DB job, and triggers after() callback', async () => {
      const payload = {
        building_id: validBuildingUuid,
        tier: 'basic',
        skip_approval: true,
        investment_posture: 'income',
        monthly_rent_total_krw: 35000000,
        total_deposit_manwon: 50000,
        asking_price_manwon: 1200000,
        vacancy_pct: 0,
        resolved_address: '서울시 강남구 역삼동 123-45',
        resolved_pnu: '1168010100101230045',
        floor_leases: [
          { floor: '1F', tenant_type: '스타벅스', rent_manwon: 1500, deposit_manwon: 20000 },
          { floor: '2F', tenant_type: '병원', rent_manwon: 1000, deposit_manwon: 15000 },
        ],
      };

      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.result).toBeNull();
      expect(json.jobId).toMatch(new RegExp(`^im_${validBuildingUuid}_\\d+$`));

      // Rule 6: Verify DB job upsert record structure and exact values
      expect(mockFrom).toHaveBeenCalledWith('im_generation_jobs');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: json.jobId,
          building_id: validBuildingUuid,
          user_id: testUserId,
          status: 'processing',
          input_payload: expect.objectContaining({
            tier: 'basic',
            skipApproval: true,
            supplemental: expect.objectContaining({
              monthly_rent_total_krw: 35000000,
              total_deposit_manwon: 50000,
              asking_price_manwon: 1200000,
              resolved_address: '서울시 강남구 역삼동 123-45',
            }),
          }),
          created_at: expect.any(String),
        }),
      );

      // Verify after() background job hook was scheduled
      expect(mockAfter).toHaveBeenCalledTimes(1);
      expect(typeof mockAfter.mock.calls[0][0]).toBe('function');
    });
  });
});
