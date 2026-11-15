import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted spies & mutable state for route/writer unit tests ──
const mocks = vi.hoisted(() => ({
  indexIMSectionsSpy: vi.fn(async () => ({ indexed: 1, skipped: 0, errors: [] })),
  runPublishGatesMock: vi.fn(() => ({ blocked: false, failedBlocks: [] as Array<{ id: string }> })),
  generateSingleSectionMock: vi.fn(),
  buildIMContextMock: vi.fn(),
  readBuildingMock: vi.fn(),
  pptxRenderSpy: vi.fn(),
  checkRateLimitMock: vi.fn(async () => true),
  fetchMonthlyWholeBuildingTransactionsMock: vi.fn(),
  fetchBokMonthlyLoanRatesMock: vi.fn(),
  supabaseState: {
    grant: null as Record<string, any> | null,
    docs: [] as Array<Record<string, any>>,
    buildingRow: null as Record<string, any> | null,
    activityEventCount: 0,
    updatedGrants: [] as Array<{ id: string; payload: Record<string, any> }>,
    externalTransactions: [] as Array<Record<string, any>>,
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => ({
    user: { id: 'broker-wp07-1' },
    role: 'broker',
    error: null,
  })),
}));

vi.mock('@/lib/authz/assert-owner', () => ({
  assertBuildingOwner: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/magazine/authz', () => ({
  requireBrokerContext: vi.fn(async () => ({
    ctx: { userId: 'broker-wp07-1', role: 'broker' },
    error: null,
  })),
  jsonError: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: { code, message } }), { status }),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: (...args: unknown[]) => mocks.readBuildingMock(...args),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: (...args: any[]) => (mocks.checkRateLimitMock as (...a: any[]) => any)(...args),
}));

vi.mock('@/domain/broker/broker-contact', () => ({
  fetchBrokerContact: vi.fn(async () => null),
  toPptxBrokerInput: vi.fn(() => null),
}));

vi.mock('@/domain/building/mobile-im/pptx/pptx-renderer', () => ({
  MobileImPptxRenderer: class {
    async render(input: unknown) {
      return mocks.pptxRenderSpy(input);
    }
  },
}));

vi.mock('@/domain/building/mobile-im/im-embedding-indexer', () => ({
  indexIMSections: (...args: any[]) => (mocks.indexIMSectionsSpy as (...a: any[]) => any)(...args),
}));

vi.mock('@/domain/building/mobile-im/quality-gates-v02', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/building/mobile-im/quality-gates-v02')>();
  return {
    ...actual,
    runPublishGates: (...args: any[]) => (mocks.runPublishGatesMock as (...a: any[]) => any)(...args),
  };
});

vi.mock('@/domain/building/mobile-im/im-context-builder', () => ({
  buildIMContext: (...args: unknown[]) => mocks.buildIMContextMock(...args),
}));

vi.mock('@/domain/building/mobile-im/im-section-generator', () => ({
  generateSingleSection: (...args: unknown[]) => mocks.generateSingleSectionMock(...args),
}));

vi.mock('@/lib/external/bok-ecos-api', () => ({
  fetchBokMonthlyLoanRates: (...args: unknown[]) => mocks.fetchBokMonthlyLoanRatesMock(...args),
}));

vi.mock('@/lib/external/real-transaction-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/external/real-transaction-api')>();
  return {
    ...actual,
    fetchMonthlyWholeBuildingTransactions: (...args: unknown[]) =>
      mocks.fetchMonthlyWholeBuildingTransactionsMock(...args),
  };
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => {
    const makeBuilder = (table: string) => {
      let pendingUpdate: Record<string, any> | null = null;
      let eqId: string | null = null;
      let isHeadCount = false;

      const resolveQuery = async () => {
        if (table === 'im_pro_grants') {
          if (pendingUpdate) {
            mocks.supabaseState.updatedGrants.push({
              id: eqId || '',
              payload: pendingUpdate,
            });
            return { data: pendingUpdate, error: null };
          }
          return { data: mocks.supabaseState.grant, error: null };
        }
        if (table === 'document_objects') {
          return { data: mocks.supabaseState.docs, error: null };
        }
        if (table === 'building_ssot_lite') {
          return { data: mocks.supabaseState.buildingRow, error: null };
        }
        if (table === 'activity_events') {
          if (isHeadCount) {
            return { data: null, count: mocks.supabaseState.activityEventCount, error: null };
          }
          return { data: [], error: null };
        }
        if (table === 'external_transactions') {
          return { data: mocks.supabaseState.externalTransactions, error: null };
        }
        return { data: [], error: null };
      };

      // Strict Rule 26 simulation: PromiseLike WITHOUT .catch()!
      const builder: Record<string, any> = {
        select: (_cols?: string, opts?: { head?: boolean; count?: string }) => {
          if (opts?.head) isHeadCount = true;
          return builder;
        },
        eq: (col: string, val: string) => {
          if (col === 'id') eqId = val;
          return builder;
        },
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, any>) => {
          pendingUpdate = payload;
          return builder;
        },
        insert: () => builder,
        maybeSingle: () => ({
          then: (onFulfilled: any, onRejected?: any) =>
            resolveQuery().then(onFulfilled, onRejected),
        }),
        then: (onFulfilled: any, onRejected?: any) =>
          resolveQuery().then(onFulfilled, onRejected),
      };
      return builder;
    };

    return {
      from: (table: string) => makeBuilder(table),
      storage: {
        from: () => ({
          upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
        }),
      },
    };
  }),
}));

import { FinancialCalculator } from '@/domain/building/im-core/financial-calculator';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { runApprovalGate } from '@/domain/building/im-core/approval-gate';
import {
  calculateFinancials,
  calculateTradingFinancials,
  formatFinancialsMarkdown,
} from '@/domain/building/mobile-im/financials';
import {
  generateMobileIM,
  shouldIndexGoldenRagSections,
} from '@/domain/building/mobile-im/writer';
import {
  POST as postFastFill,
  NON_YIELD_POSITIONING_COPY,
  buildDeterministicFastFillResponse,
} from '@/app/api/broker/deal-card/fast-fill/route';
import {
  RARE_ASSET_TYPES,
  validateBlindPoints,
} from '@/lib/deal-card/blind-guard';
import { renderDealcardHtml } from '@/domain/building/dealcard-publication/assembler';
import { GET as getImProPptx } from '@/app/api/public/im-pro/[grantId]/pptx/route';
import { GET as getMonthlyStats } from '@/app/api/broker/magazine/monthly-stats/route';
import {
  hydrateMonthlyChartsFromDbRows,
  BOK_INSUFFICIENT_DATA_NOTE,
  MOLIT_BAND_INSUFFICIENT_DATA_NOTE,
} from '@/domain/magazine/monthly-stats-hydration';
import { fetchComparableTransactions } from '@/lib/external/real-transaction-api';

describe('Wave 2 — WP-07: Deliverable Edge-Case Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimitMock.mockResolvedValue(true);
    mocks.runPublishGatesMock.mockReturnValue({ blocked: false, failedBlocks: [] });
    mocks.pptxRenderSpy.mockResolvedValue({
      buffer: Buffer.from('PK-mock-pptx'),
      slideCount: 24,
      fileSizeBytes: 12,
    });
    mocks.supabaseState.grant = null;
    mocks.supabaseState.docs = [];
    mocks.supabaseState.buildingRow = null;
    mocks.supabaseState.activityEventCount = 0;
    mocks.supabaseState.updatedGrants = [];
    mocks.supabaseState.externalTransactions = [];
    mocks.fetchMonthlyWholeBuildingTransactionsMock.mockResolvedValue([]);
    mocks.fetchBokMonthlyLoanRatesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── (a) Trading posture without comps ─────────────────────────────────────
  describe('(a) Trading posture without comps never fabricates 1.15x / 1.20x numbers', () => {
    it('returns null discount/gain/HPR and explicit missing-input note in FinancialCalculator & mobile-im financials', () => {
      const calc = new FinancialCalculator(new ClaimRegistry());
      const coreResult = calc.calculate({
        posture: 'trading',
        purchasePriceKrw: 10_000_000_000, // 100억
        totalAreaSqm: 330.58, // 100평
      });

      expect(coreResult.outputs.marketDiscountPct).toBeNull();
      expect(coreResult.outputs.targetCapitalGainBil).toBeNull();
      expect(coreResult.outputs.targetHprPct).toBeNull();
      expect(coreResult.outputs.annualNoi).toEqual({ best: 0, base: 0, worst: 0 });
      expect(coreResult.outputs.landValueRatioNote).toBe('실거래 비교사례·목표 매각가 입력 시 산출');
      expect(coreResult.outputs.disclaimer).toContain('실거래 비교사례·목표 매각가 입력 시 산출');
      expect(
        coreResult.claims.some((c) =>
          ['market_discount_pct', 'target_capital_gain', 'target_hpr'].includes(c.subject),
        ),
      ).toBe(false);

      const mobileResult = calculateFinancials({
        posture: 'trading',
        purchasePriceKrw: 10_000_000_000,
        totalAreaSqm: 330.58,
      });
      expect(mobileResult.marketDiscountPct).toBeNull();
      expect(mobileResult.targetCapitalGainBil).toBeNull();
      expect(mobileResult.targetHprPct).toBeNull();

      const md = formatFinancialsMarkdown(mobileResult);
      expect(md).toContain('실거래 비교사례·목표 매각가 입력 시 산출');
      expect(md).not.toContain('13.0%'); // old 1 - 1/1.15 fabrication
      expect(md).not.toContain('20.0억'); // old 100억 * (1.20 - 1) fabrication

      const helperResult = calculateTradingFinancials({
        askingPriceKrw: 10_000_000_000,
        manualComps: {},
      });
      expect(helperResult.targetExitPriceBil).toBeNull();
      expect(helperResult.expectedHprPct).toBeNull();
      expect(helperResult.note).toBe('실거래 비교사례·목표 매각가 입력 시 산출');
    });

    it('still computes accurate metrics when explicit comparablePricePerPyeongKrw and targetExitPriceKrw are supplied', () => {
      const calc = new FinancialCalculator(new ClaimRegistry());
      const coreResult = calc.calculate({
        posture: 'trading',
        purchasePriceKrw: 10_000_000_000, // 100억 (평당 1억)
        totalAreaSqm: 330.5785, // 100평
        comparablePricePerPyeongKrw: 125_000_000, // 비교사례 평당 1.25억 -> 20% 저평가
        targetExitPriceKrw: 12_500_000_000, // 목표 매각가 125억 -> 시세차익 25억, HPR 25%
      });

      expect(coreResult.outputs.marketDiscountPct).toBeCloseTo(20.0, 1);
      expect(coreResult.outputs.targetCapitalGainBil).toBeCloseTo(25.0, 1);
      expect(coreResult.outputs.targetHprPct).toBeCloseTo(25.0, 1);
    });
  });

  // ── (b) Golden RAG Gate & Approval Gate Hallucination Blocker ─────────────
  describe('(b) writer.ts Golden RAG gate & approval-gate.ts hallucination blocker', () => {
    const makeWriterContext = () => ({
      sectionPlan: { posture: 'income', sections: ['property_overview', 'risk_check', 'checklist', 'closing'] },
      purchasePriceKrw: 8_000_000_000,
      totalAreaSqm: 500,
      cachedFinancials: null,
      sectionCtx: {},
      assetIdentity: { asset_type: '근린생활시설', area_signal: '강남구 역삼동', price_band: '80억대' },
      marketLocation: { address: '서울특별시 강남구 역삼동' },
      buyerFit: { fit_summary: '역세권 입지 우수', caution_summary: '현장 실사 필요' },
      promptVariantId: 'v1',
    });

    it('skips indexIMSections when publishBlocked is true, or confidence === needs_check / hallucination, or imJudgeScore < 4.0', async () => {
      mocks.buildIMContextMock.mockResolvedValue(makeWriterContext());

      // Case 1: publishBlocked === true despite high confidence sections
      mocks.runPublishGatesMock.mockReturnValueOnce({
        blocked: true,
        failedBlocks: [{ id: 'G_BLOCK_TEST' }],
      });
      mocks.generateSingleSectionMock.mockImplementation(async (sectionType: string, idx: number) => ({
        section: {
          section_type: sectionType,
          section_index: idx,
          title: sectionType,
          markdown: '정상 본문 텍스트입니다.',
          confidence: 'high',
          provenance: ['public_api'],
        },
        generatedByAi: false,
        cachedFinancials: null,
      }));

      await generateMobileIM({
        building_ssot_lite: { id: 'bldg-rag-blocked' } as any,
        readiness: { score: 85 } as any,
        supplemental: {} as any,
      });
      expect(mocks.indexIMSectionsSpy).not.toHaveBeenCalled();

      // Case 2: publishBlocked === false, but one section has confidence === 'needs_check' (hallucination flag)
      mocks.runPublishGatesMock.mockReturnValueOnce({ blocked: false, failedBlocks: [] });
      mocks.generateSingleSectionMock.mockImplementation(async (sectionType: string, idx: number) => ({
        section: {
          section_type: sectionType,
          section_index: idx,
          title: sectionType,
          markdown: '검증 필요 수치 포함',
          confidence: idx === 0 ? 'needs_check' : 'high',
          provenance: ['ai_inferred'],
        },
        generatedByAi: true,
        cachedFinancials: null,
      }));

      await generateMobileIM({
        building_ssot_lite: { id: 'bldg-rag-hallucinated' } as any,
        readiness: { score: 85 } as any,
        supplemental: {} as any,
      });
      expect(mocks.indexIMSectionsSpy).not.toHaveBeenCalled();

      // Case 3: Pure predicate checks imJudgeScore < 4.0 vs >= 4.0
      expect(
        shouldIndexGoldenRagSections({
          sections: [
            { section_type: 'property_overview', title: '개요', markdown: '본문', confidence: 'medium' } as any,
          ],
          publishBlocked: false,
        }),
      ).toBe(false);

      expect(
        shouldIndexGoldenRagSections({
          sections: [
            { section_type: 'property_overview', title: '개요', markdown: '본문', confidence: 'high' } as any,
          ],
          publishBlocked: false,
          imJudgeScore: 3.9,
        }),
      ).toBe(false);

      expect(
        shouldIndexGoldenRagSections({
          sections: [
            { section_type: 'property_overview', title: '개요', markdown: '본문', confidence: 'high' } as any,
          ],
          publishBlocked: false,
        }),
      ).toBe(true);
    });

    it('blocks approval in runApprovalGate when hasHallucination is true', () => {
      const registry = new ClaimRegistry();
      const ev = [{ sourceType: 'broker_input', sourceName: 'unit-test' }] as any;
      registry.register({
        subject: 'asking_price',
        value: 8_500_000_000,
        status: 'verified',
        evidence: ev,
        asOf: '2026-11-01',
      } as any);
      registry.register({
        subject: 'total_area_sqm',
        value: 450,
        status: 'verified',
        evidence: ev,
        asOf: '2026-11-01',
      } as any);
      registry.register({
        subject: 'gross_yield',
        value: 4.1,
        status: 'verified',
        evidence: ev,
        asOf: '2026-11-01',
      } as any);

      const cleanGate = runApprovalGate(registry, 'decision_im', {
        posture: 'income',
        hasHallucination: false,
      });
      expect(cleanGate.passed).toBe(true);
      expect(cleanGate.level).toBe('bg_release');

      const hallucinatedGate = runApprovalGate(registry, 'decision_im', {
        posture: 'income',
        hasHallucination: true,
      });
      expect(hallucinatedGate.passed).toBe(false);
      expect(hallucinatedGate.level).toBe('draft');
      expect(
        hallucinatedGate.blockers.some(
          (b) => b.id === 'approval.hallucination' && b.severity === 'block',
        ),
      ).toBe(true);
    });
  });

  // ── (c) DealCard fast-fill, blind-guard rare assets, and assembler XSS ────
  describe('(c) DealCard fast-fill zero-yield guard, blind-guard rare assets, and assembler XSS', () => {
    it('never emits 0.0% yield stability praise when capRate <= 0 or rent is missing', async () => {
      mocks.readBuildingMock.mockResolvedValueOnce({
        id: 'bldg-zero-cap',
        address: '서울특별시 서초구 서초동 1300-1',
        asset_type: '근린생활시설',
        asking_price_krw: 11_000_000_000,
        land_area_pyung: 110,
        total_floor_area_pyung: 320,
        cap_rate: 0,
        monthly_rent: 0,
      });

      const req = new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
        method: 'POST',
        body: JSON.stringify({ buildingId: 'bldg-zero-cap' }),
      });
      const res = await postFastFill(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      const serialized = JSON.stringify(json);

      expect(serialized).not.toContain('0.0%');
      expect(serialized).not.toContain('수익률 0.0% 수준의 안정적 현금흐름');
      expect(serialized).not.toContain('임대수익 기반 안정적 현금흐름');
      expect(serialized).not.toContain('안정 임대수익');
      expect(json.summary).toBe(NON_YIELD_POSITIONING_COPY);

      // Deterministic fallback check with ungrounded zero-yield input points
      const fallback = buildDeterministicFastFillResponse({
        region: '서초구 서초동',
        use: '업무시설',
        posture: 'income',
        priceBand: '100~120억',
        points: [
          '역세권 코너 입지 우수',
          '수익률 0.0% 수준의 안정적 현금흐름',
          '임대수익 기반 안정적 현금흐름',
        ],
        provenanceSource: 'broker',
        capRate: 0,
        hasPositiveYield: false,
      });
      expect(JSON.stringify(fallback)).not.toContain('0.0%');
      expect(JSON.stringify(fallback)).not.toContain('임대수익 기반 안정적 현금흐름');
      expect(fallback.summary).toBe('사옥·실사용 및 밸류애드 검토 적합 자산');
    });

    it('treats 의료시설, 병원, 의원, 종교시설, 주유소, 자동차관련시설 as rare assets and generalizes dong -> gu', async () => {
      for (const rareType of ['의료시설', '병원', '의원', '종교시설', '주유소', '자동차관련시설']) {
        expect(RARE_ASSET_TYPES.has(rareType)).toBe(true);
      }

      const blindRes = validateBlindPoints(
        ['신사동 대로변 입지 우수', '지상 7층 연면적 310평 규모', '주차 자주식 편리'],
        {
          region: '강남구 신사동',
          assetType: '의료시설',
          floorCount: 7,
          areaBand: '300~330평',
        },
      );
      expect(blindRes.requiresDongToGuFallback).toBe(true);
      expect(blindRes.suggestedRegion).toBe('강남구');
      expect(blindRes.cleanedPoints.join(' ')).not.toContain('신사동');

      // End-to-end via fast-fill route on a rare medical building
      mocks.readBuildingMock.mockResolvedValueOnce({
        id: 'bldg-medical',
        address: '서울특별시 강남구 신사동 600-1',
        main_purpose: '의료시설',
        asking_price_krw: 18_000_000_000,
        land_area_pyung: 140,
        total_floor_area_pyung: 480,
        above_ground_floors: 8,
        cap_rate: 0,
      });
      const req = new NextRequest('http://localhost:3000/api/broker/deal-card/fast-fill', {
        method: 'POST',
        body: JSON.stringify({ buildingId: 'bldg-medical' }),
      });
      const res = await postFastFill(req);
      const json = await res.json();
      expect(json.validation.requiresDongToGuFallback).toBe(true);
      expect(json.card4.region).toBe('강남구');
    });

    it('escapes <script> and attribute injection XSS across all interpolated DealCard HTML fields', () => {
      const rendered = renderDealcardHtml({
        bandedLocation: '강남구 <script>alert("loc")</script>',
        title: '<img src=x onerror="alert(1)">강남 사옥',
        summary: '요약 " onload="alert(2) <script>evil()</script>',
        bandedPrice: '90~100억 <script>p()</script>',
        bandedLandArea: '120평대"><svg onload=alert(3)>',
        bandedYield: '연 4%대 <script>y()</script>',
        highlights: [
          '<script>alert("hl")</script> 초역세권',
          '" onmouseover="steal() 코너 입지',
        ],
        brokerName: '김중개<script>b()</script>',
        brokerOffice: '정석중개법인" onclick="hack()',
        rentRollSummary: {
          bandedUnitCount: '5~10개 호실<script>',
          occupancyStatus: '만실" onload="x()',
          tenantIndustryMix: ['의원<script>t()</script>'],
        },
        valueAddSummary: {
          strategies: ['외관 리모델링<script>v()</script>'],
        },
        packageHash: 'abcdef1234567890"><script>',
      } as any);

      expect(rendered.html).not.toContain('<script>');
      expect(rendered.html).not.toContain('<img src=x');
      expect(rendered.html).not.toContain('<svg onload=');
      expect(rendered.html).toContain('&lt;script&gt;');
      expect(rendered.html).toContain('&quot; onload=&quot;');
    });
  });

  // ── (d) Pro PPTX route guards ─────────────────────────────────────────────
  describe('(d) GET /api/public/im-pro/[grantId]/pptx guards', () => {
    const baseActiveGrant = {
      id: 'grant-pro-001',
      building_id: 'bldg-gangnam-001',
      requester_name: '박투자',
      requester_phone: '010-1234-5678',
      status: 'active',
      nda_signed_at: '2026-11-10T00:00:00Z',
      pdf_export_allowed: true,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      download_count: 0,
      max_downloads: 20,
    };

    it('rejects draft / archived / deleted document_objects without exporting', async () => {
      mocks.supabaseState.grant = { ...baseActiveGrant };
      mocks.supabaseState.docs = [
        {
          id: 'doc-draft-1',
          building_id: 'bldg-gangnam-001',
          status: 'draft',
          body: {
            sections: [{ section_type: 'property_overview', title: '개요', markdown: '초안' }],
          },
        },
      ];

      const req = new NextRequest('http://localhost:3000/api/public/im-pro/grant-pro-001/pptx');
      const res = await getImProPptx(req, { params: Promise.resolve({ grantId: 'grant-pro-001' }) });

      expect(res.status).toBe(403);
      expect(mocks.pptxRenderSpy).not.toHaveBeenCalled();
    });

    it('scrubs Dangsan poison coordinates (37.534 / 126.902) on non-Yeongdeungpo addresses and increments download_count', async () => {
      mocks.supabaseState.grant = { ...baseActiveGrant, download_count: 2 };
      mocks.supabaseState.buildingRow = {
        id: 'bldg-gangnam-001',
        raw_address: '서울특별시 강남구 역삼동 823',
        lat: 37.5342,
        lng: 126.9022,
        pnu: '1156011500100110047',
      };
      mocks.supabaseState.docs = [
        {
          id: 'doc-pub-1',
          building_id: 'bldg-gangnam-001',
          status: 'published',
          title: '역삼 코너 빌딩',
          body: {
            address: '서울특별시 강남구 역삼동 823',
            coordinates: { lat: 37.534, lng: 126.902 },
            pnu: '1156011500100110047',
            ssot_summary: {
              address: '서울특별시 강남구 역삼동 823',
              coordinates: { lat: 37.534, lng: 126.902 },
              pnu: '1156011500100110047',
            },
            sections: [{ section_type: 'property_overview', title: '개요', markdown: '역삼동 본문' }],
          },
        },
      ];

      const req = new NextRequest('http://localhost:3000/api/public/im-pro/grant-pro-001/pptx', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      const res = await getImProPptx(req, { params: Promise.resolve({ grantId: 'grant-pro-001' }) });

      expect(res.status).toBe(200);
      expect(mocks.checkRateLimitMock).toHaveBeenCalledWith('203.0.113.10', 'im_pro_pptx', 10, 60_000);
      expect(mocks.pptxRenderSpy).toHaveBeenCalledTimes(1);

      const renderArg = mocks.pptxRenderSpy.mock.calls[0][0];
      expect(renderArg.building.lat).toBeNull();
      expect(renderArg.building.lng).toBeNull();
      expect(renderArg.building.pnu).toBeNull();
      expect(renderArg.doc.body.coordinates).toBeUndefined();
      expect(renderArg.doc.body.ssot_summary.coordinates).toBeUndefined();
      expect(mocks.supabaseState.updatedGrants).toEqual([
        { id: 'grant-pro-001', payload: { download_count: 3 } },
      ]);
    });

    it('returns 429 when grant download_count reaches max_downloads or IP rate limit is exceeded', async () => {
      mocks.supabaseState.grant = { ...baseActiveGrant, download_count: 5, max_downloads: 5 };
      const req1 = new NextRequest('http://localhost:3000/api/public/im-pro/grant-pro-001/pptx');
      const res1 = await getImProPptx(req1, { params: Promise.resolve({ grantId: 'grant-pro-001' }) });
      expect(res1.status).toBe(429);

      mocks.checkRateLimitMock.mockResolvedValueOnce(false);
      const req2 = new NextRequest('http://localhost:3000/api/public/im-pro/grant-pro-001/pptx');
      const res2 = await getImProPptx(req2, { params: Promise.resolve({ grantId: 'grant-pro-001' }) });
      expect(res2.status).toBe(429);
    });
  });

  // ── (e) Monthly Newsletter Stats & Real Transaction API ───────────────────
  describe('(e) Monthly stats land/building separation, honest sparse-sample handling, and MOLIT resultCode validation', () => {
    it('keeps landAreaM2 and buildingAreaM2 distinct without mixing them into building_area', async () => {
      mocks.supabaseState.externalTransactions = [];
      mocks.fetchMonthlyWholeBuildingTransactionsMock.mockResolvedValueOnce([
        {
          ym: '2026-09',
          dealYear: 2026,
          dealMonth: 9,
          sigunguCode: '11680',
          dong: '역삼동',
          dealAmountManwon: 1_000_000,
          dealAmountKrw: 10_000_000_000, // 100억
          buildingAreaM2: 661.16, // 연면적 ~200평 -> 연면적 평당가 ~5,000만/평
          landAreaM2: 330.58, // 대지면적 ~100평 -> 대지 평당가 ~10,000만/평 (절대 섞이면 안 됨!)
          buildingType: '일반',
        },
        {
          ym: '2026-10',
          dealYear: 2026,
          dealMonth: 10,
          sigunguCode: '11680',
          dong: '신사동',
          dealAmountManwon: 1_200_000,
          dealAmountKrw: 12_000_000_000, // 120억
          buildingAreaM2: 661.16, // 연면적 ~200평 -> 연면적 평당가 ~6,000만/평
          landAreaM2: 330.58,
          buildingType: '일반',
        },
      ]);
      mocks.fetchBokMonthlyLoanRatesMock.mockResolvedValueOnce([
        { ym: '202610', periodLabel: '26.10', corporateLoanRatePct: 4.25 }, // < 2 points!
      ]);

      const req = new NextRequest(
        'http://localhost:3000/api/broker/magazine/monthly-stats?region=gbd&pair=molit_bok',
      );
      const res = await getMonthlyStats(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      const txChart = json.charts[0];
      expect(txChart.chartType).toBe('molit_tx_price_trend');
      expect(txChart.title).toContain('연면적 평당가');
      // 연면적 200평 기준 ~5,000만/평이어야 하며, 대지면적(100평 -> 10,000만/평)으로 덮어써지지 않아야 함!
      expect(txChart.series[0].secondaryValue).toBe(5000);
      expect(txChart.series[1].secondaryValue).toBe(6000);

      // BOK chart with < 2 points does NOT fabricate '3개월 전' / '2개월 전' / '1개월 전' curve
      const bokChart = json.charts[1];
      expect(bokChart.subtitle).toBe(BOK_INSUFFICIENT_DATA_NOTE);
      expect(bokChart.series.map((s: any) => s.label)).not.toContain('3개월 전');
      expect(bokChart.series.map((s: any) => s.label)).not.toContain('2개월 전');
    });

    it('does not fabricate 20% / 38% / 42% shares when regional transactions < 3', () => {
      const charts = hydrateMonthlyChartsFromDbRows({
        regionKey: 'gbd',
        pair: ['molit_tx_price_trend', 'molit_price_band_mix'],
        transactions: [
          {
            transaction_date: '2026-10-05',
            transaction_price: 7_500_000_000,
            building_area: 420,
            building_type: '일반',
          },
          {
            transaction_date: '2026-10-19',
            transaction_price: 12_000_000_000,
            building_area: 680,
            building_type: '일반',
          },
        ],
      });

      const bandChart = charts[1];
      expect(bandChart.chartType).toBe('molit_price_band_mix');
      expect(bandChart.subtitle).toBe(MOLIT_BAND_INSUFFICIENT_DATA_NOTE);
      expect(bandChart.placeholderNotice).toBe(MOLIT_BAND_INSUFFICIENT_DATA_NOTE);
      expect(bandChart.unit).toBe('건');

      const serialized = JSON.stringify(bandChart);
      expect(serialized).not.toContain('20%');
      expect(serialized).not.toContain('38%');
      expect(serialized).not.toContain('42%');
      expect(bandChart.series.map((s) => s.primaryValue)).toEqual([0, 1, 1]);
    });

    it('validates XML/JSON <resultCode> in real-transaction-api and avoids mixing plottageAr into building area', async () => {
      const origKey = process.env.DATA_GO_KR_API_KEY;
      process.env.DATA_GO_KR_API_KEY = 'test-molit-key';

      try {
        // 1. Reject XML error response with non-00 resultCode
        vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
            new Response(
              `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><errMsg>SERVICE KEY IS NOT REGISTERED</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>`,
              { status: 200 },
            ),
          ),
        );
        const xmlErrRes = await fetchComparableTransactions('11680', '202610');
        expect(xmlErrRes).toEqual([]);

        // 2. Reject row that has plottageAr only (buildingAr = 0) instead of substituting plottageAr into GFA unit price
        vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
            new Response(
              JSON.stringify({
                response: {
                  header: { resultCode: '000', resultMsg: 'OK' },
                  body: {
                    items: {
                      item: [
                        {
                          buildingType: '일반',
                          sggNm: '강남구',
                          umdNm: '역삼동',
                          jibun: '700',
                          dealYear: '2026',
                          dealMonth: '10',
                          dealDay: '11',
                          dealAmount: '800,000',
                          plottageAr: '330.58',
                          buildingAr: '0',
                          cdealType: '',
                        },
                      ],
                    },
                  },
                },
              }),
              { status: 200 },
            ),
          ),
        );
        const landOnlyRes = await fetchComparableTransactions('11680', '202610');
        expect(landOnlyRes).toEqual([]);
      } finally {
        process.env.DATA_GO_KR_API_KEY = origKey;
      }
    });
  });
});
