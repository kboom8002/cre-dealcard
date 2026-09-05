/**
 * @file scripts/adversarial-m5-iter2.test.ts
 * @description Milestone M5 Iteration 2 Adversarial Stress Test Suite
 *
 * Exhaustive Empirical Verification of:
 * 1. POST /api/broker/im-lite/generate-async
 *    - Negative pair: unauthenticated request -> 401
 *    - Negative pair: missing building_id -> 400
 *    - Negative pair: empty string building_id -> 400
 *    - Negative pair: malformed non-UUID strings (sql injection, traversal, bad length, non-hex) -> 400
 *    - Negative pair: non-JSON body -> 400
 *    - Negative pair: Pro tier with qualityGrade = D -> 422
 *    - Negative pair: Pro tier with grade = C -> 422
 *    - Positive pair: Pro tier with qualityGrade = B -> 200 (processing + jobId)
 *    - Positive pair: Pro tier with qualityGrade = A -> 200 (processing + jobId)
 *    - Positive pair: Basic tier with qualityGrade = D -> 200 (not blocked)
 *    - Positive pair: Case-insensitive UUID parsing -> 200
 *    - Strict assertion: Zero 500 crashes across all malformed inputs
 *
 * 2. POST /api/broker/circles/[id]/match/[matchId]/approve
 *    - Negative pair: missing auth -> 401
 *    - Negative pair: invalid token -> 401
 *    - Negative pair: approveIdentityReveal throws -> strictly 500 with exact message, NO DUMMY CATCH BYPASS
 *    - Positive pair: successful reveal -> 200 with bothApproved: true and revealed data
 *
 * 3. GET /api/broker/deal-card/[id]/personas
 *    - Negative pair: DB failure (e.g. 42P01) -> 400 with DB error message (NO process.env.NODE_ENV === "test" bypass)
 *    - Positive pair: DB 22P02 handled as empty array
 *
 * 4. AST / Grep Invariants
 *    - Zero expect(true).toBe(true) in src/tests/
 *    - Zero .catch(() => ({ ok: true in src/app/
 *    - Zero process.env.NODE_ENV === "test" || error in src/app/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'node:child_process';

// ── Mock Next.js after() ──
const mockAfter = vi.fn();
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    after: (cb: () => any) => mockAfter(cb),
  };
});

// ── Mock Supabase Service ──
const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSelect = vi.fn();
const mockFrom = vi.fn().mockImplementation((table: string) => ({
  upsert: mockUpsert,
  select: mockSelect,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// ── Mock Auth Guard for generate-async ──
const mockRequireBroker = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: any[]) => mockRequireBroker(...args),
}));

// ── Mock circle-matching-service for circles approve ──
const mockApproveIdentityReveal = vi.fn();
vi.mock('@/domain/team/circle-matching-service', () => ({
  approveIdentityReveal: (...args: any[]) => mockApproveIdentityReveal(...args),
}));

describe('⚔️ M5 Iteration 2 Adversarial Stress Test Suite', () => {
  const validBuildingUuid = 'a0000000-0000-0000-0000-000000000001';
  const testUserId = 'u0000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBroker.mockResolvedValue({
      user: { id: testUserId, email: 'broker@credeal.kr' },
      role: 'broker',
      profile: { role: 'broker', display_name: '인증 브로커' },
      error: null,
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Challenge: POST /api/broker/im-lite/generate-async
  // ════════════════════════════════════════════════════════════════════
  describe('1. Challenge POST /api/broker/im-lite/generate-async', () => {
    let POST: typeof import('@/app/api/broker/im-lite/generate-async/route').POST;

    beforeEach(async () => {
      const mod = await import('@/app/api/broker/im-lite/generate-async/route');
      POST = mod.POST;
    });

    it('TC-CHAL-ASYNC-AUTH-NEG: Missing auth returns 401 without 500 crash', async () => {
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
    });

    it('TC-CHAL-ASYNC-VAL-EMPTY-NEG: Missing or empty building_id returns 400 without 500 crash', async () => {
      const inputs = [
        {},
        { building_id: '' },
        { building_id: null },
      ];

      for (const body of inputs) {
        const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('building_id is required');
        expect(mockUpsert).not.toHaveBeenCalled();
      }
    });

    it('TC-CHAL-ASYNC-VAL-MALFORMED-NEG: Malformed UUIDs, SQLi, and path traversal return 400 without 500 crash', async () => {
      const malformedIds = [
        'invalid-non-uuid-string',
        'a0000000-0000-0000-0000-00000000000', // 35 chars
        'a0000000-0000-0000-0000-0000000000000', // 37 chars
        'a0000000-0000-0000-0000-00000000000z', // non-hex
        "a0000000-0000-0000-0000-000000000001' OR 1=1;--",
        '../../../../etc/passwd',
      ];

      for (const badId of malformedIds) {
        const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ building_id: badId }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('유효하지 않은 building_id');
        expect(mockUpsert).not.toHaveBeenCalled();
      }
    });

    it('TC-CHAL-ASYNC-VAL-NONJSON-NEG: Malformed non-JSON body returns 400 without 500 crash', async () => {
      const nonJsonBodies = [
        '<html><body>Not JSON</body></html>',
        '{"broken": json without closing',
        '',
      ];

      for (const badBody of nonJsonBodies) {
        const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: badBody,
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Invalid request body');
        expect(mockUpsert).not.toHaveBeenCalled();
      }
    });

    it('TC-CHAL-ASYNC-GRADE-PRO-D-NEG: Pro tier with D-grade rent roll returns 422', async () => {
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

    it('TC-CHAL-ASYNC-GRADE-PRO-C-NEG: Pro tier with C-grade rent roll returns 422', async () => {
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

    it('TC-CHAL-ASYNC-GRADE-PRO-B-POS: Pro tier with B-grade rent roll returns 200 with valid jobId', async () => {
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
      expect(mockAfter).toHaveBeenCalledTimes(1);
    });

    it('TC-CHAL-ASYNC-GRADE-PRO-A-POS: Pro tier with A-grade rent roll returns 200 with valid jobId', async () => {
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: validBuildingUuid,
          tier: 'pro',
          direct_data: { qualityGrade: 'A' },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.jobId).toMatch(new RegExp(`^im_${validBuildingUuid}_\\d+$`));
    });

    it('TC-CHAL-ASYNC-GRADE-BASIC-D-POS: Basic tier with D-grade rent roll is NOT blocked (returns 200)', async () => {
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
    });

    it('TC-CHAL-ASYNC-UUID-UPPERCASE-POS: Uppercase UUID is correctly accepted and processed', async () => {
      const upperUuid = validBuildingUuid.toUpperCase();
      const req = new NextRequest('http://localhost/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_id: upperUuid }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('processing');
      expect(json.jobId).toMatch(new RegExp(`^im_${upperUuid}_\\d+$`));
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Challenge: POST /api/broker/circles/[id]/match/[matchId]/approve
  // ════════════════════════════════════════════════════════════════════
  describe('2. Challenge POST /api/broker/circles/[id]/match/[matchId]/approve', () => {
    let POST: typeof import('@/app/api/broker/circles/[id]/match/[matchId]/approve/route').POST;

    beforeEach(async () => {
      const mod = await import('@/app/api/broker/circles/[id]/match/[matchId]/approve/route');
      POST = mod.POST;
    });

    it('TC-CHAL-APPROVE-UNAUTH-NEG: Request without auth header returns 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/broker/circles/c-1/match/m-1/approve', {
        method: 'POST',
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'c-1', matchId: 'm-1' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(mockApproveIdentityReveal).not.toHaveBeenCalled();
    });

    it('TC-CHAL-APPROVE-INVALID-TOKEN-NEG: Request with invalid/empty token returns 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/broker/circles/c-1/match/m-1/approve', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer unapproved-random-user-token' },
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'c-1', matchId: 'm-1' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(mockApproveIdentityReveal).not.toHaveBeenCalled();
    });

    it('TC-CHAL-APPROVE-ERR-PROPAGATION: When approveIdentityReveal throws, cleanly returns 500 (NO DUMMY CATCH BYPASS)', async () => {
      mockApproveIdentityReveal.mockRejectedValueOnce(
        new Error('Circle match m-999 is expired or already approved'),
      );

      const req = new NextRequest('http://localhost/api/broker/circles/c-1/match/m-999/approve', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token-broker-001' },
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'c-1', matchId: 'm-999' }) });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Circle match m-999 is expired or already approved');
      expect(json.ok).toBeUndefined(); // Strictly NOT masked into { ok: true, status: 'approved' }
    });

    it('TC-CHAL-APPROVE-SUCCESS-POS: Genuine approval flow returns 200 with bothApproved: true and revealedData', async () => {
      mockApproveIdentityReveal.mockResolvedValueOnce({
        bothApproved: true,
        revealedData: {
          building: { address: '서울시 강남구 역삼동 123-45', owner_name: '홍길동' },
          buyer: { name: '이대표', company: '(주)알파인베스트', phone: '010-1234-5678' },
        },
      });

      const req = new NextRequest('http://localhost/api/broker/circles/c-1/match/m-1/approve', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token-broker-001' },
      });

      const res = await POST(req, { params: Promise.resolve({ id: 'c-1', matchId: 'm-1' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.bothApproved).toBe(true);
      expect(json.revealedData.building.address).toBe('서울시 강남구 역삼동 123-45');
      expect(json.revealedData.buyer.company).toBe('(주)알파인베스트');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Challenge: GET /api/broker/deal-card/[id]/personas Error Handling
  // ════════════════════════════════════════════════════════════════════
  describe('3. Challenge GET /api/broker/deal-card/[id]/personas', () => {
    let GET: typeof import('@/app/api/broker/deal-card/[id]/personas/route').GET;

    beforeEach(async () => {
      const mod = await import('@/app/api/broker/deal-card/[id]/personas/route');
      GET = mod.GET;
    });

    it('TC-CHAL-PERSONAS-DB-ERR-NEG: Authentic database error returns 400 with error message (NO TEST-ENV MASKING)', async () => {
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42P01', message: 'relation "deal_card_personas" does not exist' },
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/broker/deal-card/test-id/personas', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const res = await GET(req, { params: Promise.resolve({ id: 'test-id' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('relation "deal_card_personas" does not exist');
      expect(json.ok).toBeUndefined(); // NOT masked into { ok: true, success: true, data: [] }
    });

    it('TC-CHAL-PERSONAS-22P02-POS: Postgres 22P02 invalid UUID cast returns 200 with data: []', async () => {
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '22P02', message: 'invalid input syntax for type uuid' },
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost/api/broker/deal-card/invalid-uuid/personas', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      const res = await GET(req, { params: Promise.resolve({ id: 'invalid-uuid' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Challenge: Codebase Invariants & Absence of Facades
  // ════════════════════════════════════════════════════════════════════
  describe('4. Codebase Invariants (AST / Grep Audit)', () => {
    it('TC-CHAL-INVAR-01: Exactly ZERO occurrences of expect(true).toBe(true) in src/tests/', () => {
      let count = 0;
      try {
        const out = execSync('git grep -n "expect(true).toBe(true)" src/tests/', { encoding: 'utf8' });
        count = out.trim().split('\n').filter(Boolean).length;
      } catch {
        count = 0;
      }
      expect(count).toBe(0);
    });

    it('TC-CHAL-INVAR-02: Exactly ZERO occurrences of .catch(() => ({ ok: true in src/app/', () => {
      let count = 0;
      try {
        const out = execSync('git grep -n "\\.catch(() => ({ ok: true" src/app/', { encoding: 'utf8' });
        count = out.trim().split('\n').filter(Boolean).length;
      } catch {
        count = 0;
      }
      expect(count).toBe(0);
    });

    it('TC-CHAL-INVAR-03: Exactly ZERO occurrences of process.env.NODE_ENV === "test" || error in src/app/api/', () => {
      let count = 0;
      try {
        const out = execSync('git grep -n "process.env.NODE_ENV === \'test\' || error" src/app/api/', { encoding: 'utf8' });
        count = out.trim().split('\n').filter(Boolean).length;
      } catch {
        count = 0;
      }
      expect(count).toBe(0);
    });
  });
});
