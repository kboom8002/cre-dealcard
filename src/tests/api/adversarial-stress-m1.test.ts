import { describe, it, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { calcCalloutHeight, charsPerLine } from '@/domain/building/mobile-im/pptx/text-budget';
import { generateMobileIMHandler } from '@/app/api/broker/im-lite/generate/handler';
import { POST as postGenerateAsync } from '@/app/api/broker/im-lite/generate-async/route';
import { POST as postBuildingGenerateAsync } from '@/app/api/broker/buildings/[id]/generate-async/route';
import { POST as postValidate } from '@/app/api/im/validate/route';
import { POST as postBuildingValidate } from '@/app/api/broker/buildings/[id]/validate/route';

// ─── Supabase & Service Mocks ───
let mockBuildingData: any = {};
let mockInsertedJob: any = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'mock-user-id', role: 'broker' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'broker' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'broker' }, error: null }),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockImplementation((payload) => {
        mockInsertedJob = payload;
        return Promise.resolve({ data: payload, error: null });
      }),
      update: vi.fn().mockReturnThis(),
    })),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'broker' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'broker' }, error: null }),
      insert: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-doc-id' }, error: null }),
        }),
      })),
      upsert: vi.fn().mockImplementation((payload) => {
        mockInsertedJob = payload;
        return Promise.resolve({ data: payload, error: null });
      }),
      update: vi.fn().mockReturnThis(),
    })),
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn().mockResolvedValue({ user: { id: 'mock-user-id', role: 'broker' } }),
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'mock-user-id', role: 'broker' } }),
}));

vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockResolvedValue({ content: 'Mock LLM Response' }),
  embedText: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/external/external-data-orchestrator', () => ({
  enrichBuildingData: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 1000000 },
    landUsePlan: { zoningDistrict: '일반상업지역' },
  }),
}));

vi.mock('@/lib/external/enrich-by-pnu', () => ({
  enrichBuildingDataByPNU: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 1000000 },
    landUsePlan: { zoningDistrict: '일반상업지역' },
  }),
}));

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    readWithMigration: vi.fn().mockImplementation(async (id: string) => {
      return { data: mockBuildingData };
    }),
  };
});

// Mock Next.js after() to execute synchronously or no-op
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    after: vi.fn((cb) => {
      // no-op in test or execute
    }),
  };
});

describe('ADVERSARIAL STRESS SUITE: Worker M1 Fixes', () => {

  // ════════════════════════════════════════════════════════════════════════
  // 1. STRESS TEST: calcCalloutHeight with extreme inputs
  // ════════════════════════════════════════════════════════════════════════
  describe('1. calcCalloutHeight Extreme Inputs Stress Test', () => {
    const defaultBoxWidth = 5.0;

    it('1.1: Empty string returns baseline padding (0.55)', () => {
      expect(calcCalloutHeight('', defaultBoxWidth)).toBe(0.55);
    });

    it('1.2: Whitespace-only variants return baseline padding (0.55)', () => {
      expect(calcCalloutHeight(' ', defaultBoxWidth)).toBe(0.55);
      expect(calcCalloutHeight('          ', defaultBoxWidth)).toBe(0.55);
      expect(calcCalloutHeight('\t', defaultBoxWidth)).toBe(0.55);
      expect(calcCalloutHeight('\n\n\n', defaultBoxWidth)).toBe(0.55);
      expect(calcCalloutHeight(' \t \r\n \t\n ', defaultBoxWidth)).toBe(0.55);
    });

    it('1.3: Falsy/boundary inputs return baseline padding without crashing', () => {
      expect(calcCalloutHeight(null as any, defaultBoxWidth)).toBe(0.55);
      expect(calcCalloutHeight(undefined as any, defaultBoxWidth)).toBe(0.55);
    });

    it('1.4: Massive single-line strings (1,000, 5,000, 10,000 chars)', () => {
      const s1000 = 'A'.repeat(1000);
      const h1000 = calcCalloutHeight(s1000, defaultBoxWidth);
      expect(Number.isFinite(h1000)).toBe(true);
      expect(h1000).toBeGreaterThan(0.55);

      const s5000 = '가'.repeat(5000);
      const h5000 = calcCalloutHeight(s5000, defaultBoxWidth);
      expect(Number.isFinite(h5000)).toBe(true);
      expect(h5000).toBeGreaterThan(h1000);

      const s10000 = '🏢'.repeat(10000);
      const h10000 = calcCalloutHeight(s10000, defaultBoxWidth);
      expect(Number.isFinite(h10000)).toBe(true);
      expect(h10000).toBeGreaterThan(0.55);
    });

    it('1.5: Deep multiline strings (50 lines, alternating blank lines)', () => {
      const lines50 = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n');
      const h50 = calcCalloutHeight(lines50, defaultBoxWidth);
      expect(Number.isFinite(h50)).toBe(true);
      // 50 lines * 0.29 + 0.55 = 15.05
      expect(h50).toBeCloseTo(0.55 + 50 * 0.29, 2);

      // Alternating blank lines
      const alternating = 'Line 1\n\nLine 2\n\nLine 3';
      const hAlt = calcCalloutHeight(alternating, defaultBoxWidth);
      expect(Number.isFinite(hAlt)).toBe(true);
      // explicitLines = 4, explicitLines + 1 = 5
      expect(hAlt).toBeCloseTo(0.55 + 5 * 0.29, 2);
    });

    it('1.6: Special characters, Korean mixed CJK, XSS payload, emojis', () => {
      const koreanText = '강남역 테헤란로 중심 업무지구 최상급 오피스 매물입니다. 현재 100% 임대 완료되어 공실 리스크가 매우 낮습니다.';
      const hKorean = calcCalloutHeight(koreanText, defaultBoxWidth);
      expect(Number.isFinite(hKorean)).toBe(true);
      expect(hKorean).toBeGreaterThan(0.55);

      const xssText = '<script>alert("xss")</script><svg onload="alert(1)">&quot;&amp;';
      const hXss = calcCalloutHeight(xssText, defaultBoxWidth);
      expect(Number.isFinite(hXss)).toBe(true);
      expect(hXss).toBeGreaterThan(0.55);

      const emojiText = '🚀🔥🏢💰📈✨💎'.repeat(20);
      const hEmoji = calcCalloutHeight(emojiText, defaultBoxWidth);
      expect(Number.isFinite(hEmoji)).toBe(true);
      expect(hEmoji).toBeGreaterThan(0.55);
    });

    it('1.7: Varying box widths (wide vs narrow)', () => {
      const text = 'This is a sample text for verifying wrapping behavior across widths.';
      const hNarrow = calcCalloutHeight(text, 2.0);
      const hWide = calcCalloutHeight(text, 10.0);
      expect(hNarrow).toBeGreaterThanOrEqual(hWide);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 2. STRESS TEST: Pro Tier & Data Quality Grades (D, C, B, A, edge cases)
  // ════════════════════════════════════════════════════════════════════════
  describe('2. Pro Tier & Data Grade Gating Adversarial Stress Test', () => {
    beforeEach(() => {
      mockBuildingData = {
        id: '11111111-1111-1111-1111-111111111111',
        completeness_score: 80,
        area_signal: '강남구 역삼동',
        asset_type: 'office',
        price_band: '100억',
        lease_summary: { tenants: [{ name: 'Tenant A' }] },
        raw_input: '강남구 역삼동 123',
      };
      mockInsertedJob = null;
    });

    // --- Handler Level ---
    it('2.1: Handler blocks Pro tier with D-grade (returns 422)', async () => {
      const res = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'D' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'pro',
      });
      expect(res.ok).toBe(false);
      expect(res.statusCode).toBe(422);
      expect(res.error).toContain('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
    });

    it('2.2: Handler blocks Pro tier with C-grade (returns 422)', async () => {
      const res = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'C' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'pro',
      });
      expect(res.ok).toBe(false);
      expect(res.statusCode).toBe(422);
      expect(res.error).toContain('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
    });

    it('2.3: Handler blocks Pro tier when completeness_score < 60 even without direct qualityGrade', async () => {
      mockBuildingData.completeness_score = 45;
      const res = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'pro',
      });
      expect(res.ok).toBe(false);
      expect(res.statusCode).toBe(422);
      expect(res.error).toContain('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
    });

    it('2.4: Handler permits Pro tier with B-grade (passes gate)', async () => {
      const res = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'B' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'pro',
      });
      expect(res.ok).toBe(true);
    });

    it('2.5: Handler permits Pro tier with A-grade (passes gate)', async () => {
      const res = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'A' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'pro',
      });
      expect(res.ok).toBe(true);
    });

    it('2.6: Handler permits Basic tier with D-grade and C-grade (no Pro restriction)', async () => {
      const resD = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'D' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'basic',
      });
      expect(resD.ok).toBe(true);

      const resC = await generateMobileIMHandler({
        buildingId: '11111111-1111-1111-1111-111111111111',
        userId: 'mock-user-id',
        directData: { qualityGrade: 'C' },
        supplemental: { resolved_address: '서울 강남구', asking_price_manwon: 1000000 },
        tier: 'basic',
      });
      expect(resC.ok).toBe(true);
    });

    // --- Route Level: /api/broker/im-lite/generate-async ---
    it('2.7: generate-async route blocks Pro + D-grade with HTTP 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: '11111111-1111-1111-1111-111111111111',
          tier: 'pro',
          directData: { qualityGrade: 'D' },
        }),
      });
      const res = await postGenerateAsync(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toContain('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
    });

    it('2.8: generate-async route blocks Pro + C-grade with HTTP 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: '11111111-1111-1111-1111-111111111111',
          tier: 'pro',
          directData: { qualityGrade: 'C' },
        }),
      });
      const res = await postGenerateAsync(req);
      expect(res.status).toBe(422);
    });

    it('2.9: generate-async route passes Pro + B-grade and Pro + A-grade with HTTP 200', async () => {
      const reqB = new NextRequest('http://localhost:3000/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: '11111111-1111-1111-1111-111111111111',
          tier: 'pro',
          directData: { qualityGrade: 'B' },
        }),
      });
      const resB = await postGenerateAsync(reqB);
      expect(resB.status).toBe(200);

      const reqA = new NextRequest('http://localhost:3000/api/broker/im-lite/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: '11111111-1111-1111-1111-111111111111',
          tier: 'pro',
          directData: { qualityGrade: 'A' },
        }),
      });
      const resA = await postGenerateAsync(reqA);
      expect(resA.status).toBe(200);
    });

    // --- Building Scoped Route: /api/broker/buildings/[id]/generate-async ---
    it('2.10: Building-scoped generate-async blocks Pro + D-grade with HTTP 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/broker/buildings/11111111-1111-1111-1111-111111111111/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'pro',
          rentroll_grade: 'D',
        }),
      });
      const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' });
      const res = await postBuildingGenerateAsync(req, { params });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toContain('Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다.');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 3. STRESS TEST: Asking Price Validation in Income vs Development Posture
  // ════════════════════════════════════════════════════════════════════════
  describe('3. Asking Price Validation Adversarial Stress Test', () => {
    async function callValidate(body: Record<string, unknown>) {
      const req = new NextRequest('http://localhost:3000/api/im/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await postValidate(req);
      return { status: res.status, data: await res.json() };
    }

    async function callBuildingValidate(id: string, body: Record<string, unknown>) {
      const req = new NextRequest(`http://localhost:3000/api/broker/buildings/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const params = Promise.resolve({ id });
      const res = await postBuildingValidate(req, { params });
      return { status: res.status, data: await res.json() };
    }

    // --- Income Posture Adversarial Inputs ---
    it('3.1: Income posture: Missing asking_price_manwon causes canGenerate=false and error message', async () => {
      const { data } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(data.canGenerate).toBe(false);
      expect(data.errors).toContain('매각 희망가를 입력해 주세요.');
    });

    it('3.2: Income posture: asking_price_manwon = 0 causes canGenerate=false and error message', async () => {
      const { data } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: 0,
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(data.canGenerate).toBe(false);
      expect(data.errors).toContain('매각 희망가를 입력해 주세요.');
    });

    it('3.3: Income posture: Negative asking_price_manwon causes canGenerate=false and error message', async () => {
      const { data } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: -50000,
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(data.canGenerate).toBe(false);
      expect(data.errors).toContain('매각 희망가를 입력해 주세요.');
    });

    it('3.4: Income posture: String zeros and invalid numeric strings cause canGenerate=false', async () => {
      const { data: dZeroStr } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: '0',
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(dZeroStr.canGenerate).toBe(false);
      expect(dZeroStr.errors).toContain('매각 희망가를 입력해 주세요.');

      const { data: dNegStr } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: '-1000',
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(dNegStr.canGenerate).toBe(false);
      expect(dNegStr.errors).toContain('매각 희망가를 입력해 주세요.');

      const { data: dNaN } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: 'not_a_number',
        monthly_rent_total_krw: 5000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(dNaN.canGenerate).toBe(false);
      expect(dNaN.errors).toContain('매각 희망가를 입력해 주세요.');
    });

    it('3.5: Income posture: Valid positive asking_price_manwon passes validation', async () => {
      const { data } = await callValidate({
        investment_posture: 'income',
        tier: 'basic',
        asking_price_manwon: 350000,
        monthly_rent_total_krw: 15000000,
        resolved_address: '서울 강남구 역삼동',
        resolved_pnu: '1168010100',
      });
      expect(data.canGenerate).toBe(true);
      expect(data.errors).not.toContain('매각 희망가를 입력해 주세요.');
    });

    // --- Development Posture Contrast (Negative Pair) ---
    it('3.6: Development posture: Missing asking_price does NOT block generation if land/zoning present', async () => {
      const { data } = await callValidate({
        investment_posture: 'development',
        tier: 'basic',
        resolved_address: '서울 마포구 상암동',
        resolved_pnu: '1144010100',
        land_area_sqm: 1200,
        zoning: '제3종일반주거지역',
      });
      // Development posture does not strictly require asking price
      expect(data.errors).not.toContain('매각 희망가를 입력해 주세요.');
      expect(data.canGenerate).toBe(true);
    });

    it('3.7: Development posture: 0 or negative asking_price does NOT block development generation', async () => {
      const { data } = await callValidate({
        investment_posture: 'development',
        tier: 'basic',
        asking_price_manwon: 0,
        resolved_address: '서울 마포구 상암동',
        resolved_pnu: '1144010100',
        land_area_sqm: 1200,
        zoning: '제3종일반주거지역',
      });
      expect(data.errors).not.toContain('매각 희망가를 입력해 주세요.');
      expect(data.canGenerate).toBe(true);
    });

    // --- Building Scoped Route: /api/broker/buildings/[id]/validate ---
    it('3.8: Building-scoped validate blocks income posture with missing, 0, or negative asking price', async () => {
      const { data: dMissing } = await callBuildingValidate('b-123', {
        investment_posture: 'income',
      });
      expect(dMissing.canGenerate).toBe(false);
      expect(dMissing.errors).toContain('매각 희망가를 입력해 주세요.');

      const { data: dZero } = await callBuildingValidate('b-123', {
        investment_posture: 'income',
        asking_price_manwon: 0,
      });
      expect(dZero.canGenerate).toBe(false);
      expect(dZero.errors).toContain('매각 희망가를 입력해 주세요.');

      const { data: dNeg } = await callBuildingValidate('b-123', {
        investment_posture: 'income',
        asking_price_manwon: -2500,
      });
      expect(dNeg.canGenerate).toBe(false);
      expect(dNeg.errors).toContain('매각 희망가를 입력해 주세요.');
    });

    it('3.9: Building-scoped validate allows development posture without asking price', async () => {
      const { data } = await callBuildingValidate('b-123', {
        investment_posture: 'development',
        resolved_address: '서울 마포구',
        land_area_sqm: 1000,
        zoning: '준주거지역',
      });
      expect(data.canGenerate).toBe(true);
      expect(data.errors).not.toContain('매각 희망가를 입력해 주세요.');
    });
  });
});
