/**
 * @file src/tests/im-simple/quick-generate-idempotency.test.ts
 * @description Milestone 5 Test Suite: Quick-Generate Endpoint Idempotency & 4-Item Deal Card Auto-Sync
 *
 * Requirements:
 * 1. POST /api/broker/im-lite/quick-generate idempotency:
 *    - Respects `Idempotency-Key` / `x-idempotency-key` header and body `idempotencyKey`.
 *    - First call returns 201 Created with new buildingId, documentId, docHash, and card4.
 *    - Duplicate call with same idempotency key returns 200 OK (X-Cache-Lookup: HIT) with identical payload.
 *    - Unrelated / new keys create separate unique documents.
 * 2. Returned Payload & Schema Contract:
 *    - Returns { success: true, buildingId, documentId, docHash, card4, basicImDocument, status: 'succeeded' }.
 *    - Input validation: rejects empty address (422), non-positive asking price (422), and malformed JSON (400).
 *    - Authorization guard: requires broker role via requireBroker (401 when unauthorized).
 * 3. Auto-Syncing 4-Item Deal Card from Building Facts:
 *    - Derives card4.region from address (e.g. "영등포구 양평동").
 *    - Derives card4.use ("근린생활시설").
 *    - Derives card4.priceBand formatted via Price Band SSOT (e.g. 950,000만 -> "90~100억").
 *    - Derives card4.points (3 bullet points reflecting regional highlight, rentroll, yield).
 *    - Computes deterministic card4_hash and card4_version = 1.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.3 (WP-P3-04), §5.3, §8 Test Matrix #24
 * - PROJECT.md (Milestone 5, Feature 51)
 * - TEST_INFRA.md (§ Feature Inventory #11)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireBroker = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: any[]) => mockRequireBroker(...args),
}));

import { POST } from '@/app/api/broker/im-lite/quick-generate/route';

describe('M5 IM Simple: Quick-Generate API & Idempotency (WP-P3-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBroker.mockResolvedValue({
      user: { id: 'broker-test-user-id' },
      role: 'broker',
    });
  });

  describe('1. Idempotency & Cached Response Replay', () => {
    it('returns 201 on initial request and 200 HIT on duplicate request with same Idempotency-Key header', async () => {
      const idempotencyKey = `idemp-key-${Date.now()}-${Math.random()}`;

      const payload = {
        address: '서울특별시 영등포구 양평동 11-47',
        askingPriceManwon: 950000, // 95억
        rentRoll: [
          { floor: '1F', use: '스타벅스', depositManwon: 5000, monthlyRentManwon: 450, status: 'occupied' },
          { floor: '2F', use: '병원', depositManwon: 3000, monthlyRentManwon: 280, status: 'occupied' },
        ],
        investmentPosture: 'core_income',
      };

      // Request 1
      const req1 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(201);

      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.buildingId).toBeDefined();
      expect(json1.documentId).toBeDefined();
      expect(json1.docHash).toMatch(/^sha256:/);
      expect(json1.card4).toBeDefined();

      // Request 2 with exact same idempotency key
      const req2 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('X-Cache-Lookup')).toBe('HIT');

      const json2 = await res2.json();
      // Must return identical buildingId, documentId, docHash, and card4 hash
      expect(json2.buildingId).toBe(json1.buildingId);
      expect(json2.documentId).toBe(json1.documentId);
      expect(json2.docHash).toBe(json1.docHash);
      expect(json2.card4.card4_hash).toBe(json1.card4.card4_hash);
    });

    it('supports body.idempotencyKey field when header is omitted', async () => {
      const idempotencyKey = `body-idemp-${Date.now()}`;
      const payload = {
        address: '서울특별시 마포구 대흥동 12-41',
        askingPriceManwon: 780000,
        idempotencyKey,
      };

      const req1 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();

      const req2 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.buildingId).toBe(json1.buildingId);
    });
  });

  describe('2. 4-Item Deal Card Auto-Sync from Building Facts', () => {
    it('automatically extracts and synchronizes a valid Card4Schema Deal Card', async () => {
      const payload = {
        address: '서울특별시 강남구 신사동 590',
        askingPriceManwon: 7600000, // 760억
        rentRoll: [
          { floor: '1F', depositManwon: 20000, monthlyRentManwon: 2500, status: 'occupied' },
          { floor: '2F', depositManwon: 15000, monthlyRentManwon: 1800, status: 'occupied' },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      const card4 = json.card4;

      expect(card4).toBeDefined();
      // 1. Region
      expect(card4.region).toBe('강남구 신사동');
      // 2. Use
      expect(card4.use).toBe('근린생활시설');
      // 3. Price Band
      expect(card4.priceBand).toBe('750~800억'); // Formatted by Price Band SSOT for 760억
      // 4. Points (strictly 3 bullet points)
      expect(card4.points).toHaveLength(3);
      expect(card4.points[0]).toContain('강남구 신사동');
      expect(card4.points[1]).toContain('월 임대수익');
      expect(card4.points[2]).toContain('수익률');

      // Provenance & Versioning
      expect(card4.provenance.points).toEqual(['public', 'broker', 'ai']);
      expect(card4.card4_version).toBe(1);
      expect(card4.card4_hash).toHaveLength(64);
    });

    it('generates BasicImDocument with all 10 canonical sections', async () => {
      const payload = {
        address: '서울특별시 서초구 서초동 1364-28',
        askingPriceManwon: 2300000, // 230억
        title: '서초동 오피스 빌딩',
      };

      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.basicImDocument).toBeDefined();
      expect(json.basicImDocument.sections).toHaveLength(10);
      expect(json.basicImDocument.schemaVersion).toBe('3.0');
      expect(json.basicImDocument.docHash).toMatch(/^sha256:/);
    });
  });

  describe('3. Validation & Authorization Guards', () => {
    it('returns 422 if address is empty or whitespace', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '   ', askingPriceManwon: 100000 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toContain('주소를 입력해주세요');
    });

    it('returns 422 if asking price is non-positive or NaN', async () => {
      const req1 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '서울시 강남구 역삼동 100', askingPriceManwon: 0 }),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(422);

      const req2 = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '서울시 강남구 역삼동 100', askingPriceManwon: -500 }),
      });

      const res2 = await POST(req2);
      expect(res2.status).toBe(422);
    });

    it('returns 400 if request body is not valid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid-json-content',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('JSON');
    });

    it('returns 401 if caller is not authorized as a broker', async () => {
      mockRequireBroker.mockResolvedValueOnce({
        error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
      });

      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/quick-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '서울시 강남구 역삼동 100', askingPriceManwon: 50000 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });
});
