import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod/v4';

const sharpInputs: string[] = [];

vi.mock('sharp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sharp')>();
  const sharpDefault: any = (actual as any).default ?? actual;
  const wrappedSharp = ((input?: unknown, options?: unknown) => {
    if (Buffer.isBuffer(input)) {
      sharpInputs.push(input.toString('utf8'));
    } else if (typeof input === 'string') {
      sharpInputs.push(input);
    }
    return sharpDefault(input, options);
  }) as unknown as typeof sharpDefault;
  Object.assign(wrappedSharp, sharpDefault);
  return {
    ...(actual as unknown as Record<string, unknown>),
    default: wrappedSharp,
  };
});

const llmCalls: Array<{ params: any; options: any }> = [];
vi.mock('@/ai/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai/llm-client')>();
  return {
    ...actual,
    callLLM: vi.fn(async (params: any, options: any) => {
      llmCalls.push({ params, options });
      if (String(options?.cacheKey || '').startsWith('translate-')) {
        return {
          content: '=== SECTION 1: Property Overview ===\nTranslated section body',
          model: params.model || 'gpt-5.4',
          provider: 'mock',
          tokens: { prompt: 10, completion: 10, total: 20 },
          latencyMs: 5,
        };
      }
      return {
        content: JSON.stringify({ summary: 'ok' }),
        model: params.model || 'gpt-6.1-terra',
        provider: 'mock',
        tokens: { prompt: 10, completion: 10, total: 20 },
        latencyMs: 5,
      };
    }),
  };
});

let mockServiceClientImpl: (() => any) | null = null;
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    if (mockServiceClientImpl) return mockServiceClientImpl();
    throw new Error('mockServiceClientImpl not configured');
  },
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: async () => true,
}));

vi.mock('@/lib/notifications/in-app', () => ({
  createNotification: async () => true,
}));

vi.mock('@/lib/inbox/upsert-broker-client', () => ({
  upsertBrokerClientFromInbound: async () => undefined,
}));

vi.mock('@/lib/authz/studio-owner', () => ({
  assertStudioDealOwner: async () => null,
}));

describe('Wave 0D Regression Suite: Cross-Tenant LLM Cache, Math/Query SSoT, Fail-Closed & Rule 66 SVG', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    llmCalls.length = 0;
    sharpInputs.length = 0;
    mockServiceClientImpl = null;
  });

  afterEach(() => {
    const envMut = process.env as Record<string, string | undefined>;
    for (const k of Object.keys(envMut)) {
      if (!(k in savedEnv)) delete envMut[k];
    }
    Object.assign(envMut, savedEnv);
  });

  // 1. Cross-Tenant LLM Cache Keys (run-ai.ts & translator.ts)
  describe('1. Cross-Tenant SHA-256 LLM Cache Key Isolation', () => {
    it('run-ai.ts produces distinct 64-hex SHA-256 cacheKeys for prompts sharing identical first 50+ Korean chars and defaults to gpt-6.1-terra', async () => {
      delete (process.env as Record<string, string | undefined>).AI_DEFAULT_MODEL;
      const { aiClient } = await import('@/ai/run-ai');
      const sharedPrefix =
        '다음 상업용 부동산 투자설명서 데이터를 기반으로 핵심 매수 적합성 요약을 JSON 형식으로 작성하십시오. 대상 자산 상세 내역: ';

      const schema = z.object({ summary: z.string() });
      await aiClient.generateObject({
        schemaName: 'radar_summary',
        promptVersion: 'v1',
        input: `${sharedPrefix}서울특별시 강남구 역삼동 123-45 매매가 180억 원 임대수익률 4.2%`,
        schema,
      });
      await aiClient.generateObject({
        schemaName: 'radar_summary',
        promptVersion: 'v1',
        input: `${sharedPrefix}서울특별시 영등포구 여의도동 45-9 매매가 420억 원 임대수익률 5.1%`,
        schema,
      });

      expect(llmCalls).toHaveLength(2);
      expect(llmCalls[0].params.model).toBe('gpt-6.1-terra');
      const keyA = llmCalls[0].options.cacheKey;
      const keyB = llmCalls[1].options.cacheKey;
      expect(keyA).toMatch(/^[0-9a-f]{64}$/);
      expect(keyB).toMatch(/^[0-9a-f]{64}$/);
      expect(keyA).not.toBe(keyB);
    });

    it('translator.ts produces distinct SHA-256 cacheKeys for two buildings with identical section titles', async () => {
      const { translateIMSections } = await import('@/domain/building/mobile-im/translator');

      await translateIMSections({
        language: 'en',
        posture: 'income',
        sections: [
          { title: '물건 개요', content: '강남구 신사동 590 소재 근린생활시설 매매가 250억 원' },
          { title: '수익 분석', content: '연 순임대수익 8.5억 원, Cap Rate 3.40%' },
        ],
      });
      await translateIMSections({
        language: 'en',
        posture: 'income',
        sections: [
          { title: '물건 개요', content: '마포구 서교동 395 소재 오피스빌딩 매매가 95억 원' },
          { title: '수익 분석', content: '연 순임대수익 4.2억 원, Cap Rate 4.42%' },
        ],
      });

      expect(llmCalls).toHaveLength(2);
      const keyA = llmCalls[0].options.cacheKey;
      const keyB = llmCalls[1].options.cacheKey;
      expect(keyA).toMatch(/^translate-en-[0-9a-f]{64}$/);
      expect(keyB).toMatch(/^translate-en-[0-9a-f]{64}$/);
      expect(keyA).not.toBe(keyB);
    });
  });

  // 2. im-inquiry & NDA raw_address query & archived 404 block
  describe('2. POST /api/public/im-inquiry & NDA raw_address SSoT & Archived Building Block', () => {
    it('selects raw_address (never non-existent address) on building_ssot_lite and blocks archived buildings with 404', async () => {
      const buildingSelectCalls: string[] = [];
      const BLD_ARCHIVED = 'b0000000-0000-0000-0000-000000000099';
      const BLD_ACTIVE = 'b0000000-0000-0000-0000-000000000088';
      const BROKER_UUID = '11111111-1111-1111-1111-111111111111';

      mockServiceClientImpl = () => ({
        from: (table: string) => {
          const state: { cols?: string; id?: string } = {};
          const chain: any = {
            select: (cols: string) => {
              state.cols = cols;
              if (table === 'building_ssot_lite') buildingSelectCalls.push(cols);
              return chain;
            },
            eq: (col: string, val: string) => {
              if (col === 'id') state.id = val;
              return chain;
            },
            in: () => chain,
            is: () => chain,
            or: () => chain,
            order: () => chain,
            limit: () => chain,
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'inq-001' }, error: null }),
              }),
              then: (r: any) => Promise.resolve({ data: null, error: null }).then(r),
            }),
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
            maybeSingle: async () => {
              if (table === 'building_ssot_lite') {
                // Simulate real Postgres: selecting non-existent 'address' column fails with 42703!
                if (/\baddress\b/.test(String(state.cols || '')) && !/\braw_address\b/.test(String(state.cols || ''))) {
                  return {
                    data: null,
                    error: { code: '42703', message: 'column building_ssot_lite.address does not exist' },
                  };
                }
                if (state.id === BLD_ARCHIVED) {
                  return {
                    data: {
                      id: BLD_ARCHIVED,
                      owner_id: BROKER_UUID,
                      status: 'archived',
                      area_signal: '강남구 역삼동',
                      asset_type: '오피스',
                      raw_address: '서울특별시 강남구 역삼동 700-1',
                    },
                    error: null,
                  };
                }
                if (state.id === BLD_ACTIVE) {
                  return {
                    data: {
                      id: BLD_ACTIVE,
                      owner_id: BROKER_UUID,
                      status: 'published',
                      area_signal: '강남구 논현동',
                      asset_type: '근린생활시설',
                      raw_address: '서울특별시 강남구 논현동 100-2',
                    },
                    error: null,
                  };
                }
              }
              return { data: null, error: null };
            },
            then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
          };
          return chain;
        },
      });

      const { POST } = await import('@/app/api/public/im-inquiry/route');

      // Archived building -> 404
      const archivedRes = await POST(
        new NextRequest('http://localhost/api/public/im-inquiry', {
          method: 'POST',
          body: JSON.stringify({
            building_id: BLD_ARCHIVED,
            requester_name: '김투자',
            requester_phone: '010-2222-3333',
            privacy_agreed: true,
          }),
        })
      );
      expect(archivedRes.status).toBe(404);

      // Active building -> 200
      const activeRes = await POST(
        new NextRequest('http://localhost/api/public/im-inquiry', {
          method: 'POST',
          body: JSON.stringify({
            building_id: BLD_ACTIVE,
            requester_name: '박매수',
            requester_phone: '010-4444-5555',
            privacy_agreed: true,
          }),
        })
      );
      expect(activeRes.status).toBe(200);
      expect(buildingSelectCalls.length).toBeGreaterThanOrEqual(2);
      for (const cols of buildingSelectCalls) {
        expect(cols).toContain('raw_address');
        expect(cols).not.toMatch(/(^|,\s*)address(\s*,|$)/);
      }
    });
  });

  // 3. pro-chapter-binder cap_rate_base normalization & zero +0.5%p fabrication
  describe('3. pro-chapter-binder Cap Rate Normalization & Unfabricated Stabilized Cap Rate', () => {
    it('keeps percentage cap_rate_base (3.42) as 3.42 (NOT 342), normalizes legacy decimal (0.0342 -> 3.42), and does NOT fabricate +0.5%p when vacancy is 0', async () => {
      const { bindProImChapterData } = await import(
        '@/domain/building/mobile-im/pptx/binder/pro-chapter-binder'
      );

      const boundPct = bindProImChapterData({
        title: '테스트 빌딩',
        body: {
          asking_price_krw: 10_000_000_000,
          annual_rent_krw: 342_000_000,
          total_deposit_krw: 500_000_000,
          cap_rate_base: 3.42,
          land_area_py: 120,
          total_gross_area_py: 450,
          floor_leases: [
            { floor: '1F', tenant_name: '우량약국', leased_area_m2: 150, deposit_manwon: 50000, rent_manwon: 2850 },
          ],
        },
      });

      expect((boundPct.cash_flow_snapshot as any).capRateAsIs).toBe(3.42);
      expect((boundPct.cash_flow_snapshot as any).capRateStabilized).toBe(3.42);
      expect((boundPct.dcf_valuation as any).capRateAsIs).toBe(3.42);
      expect((boundPct.dcf_valuation as any).capRateStabilized).toBe(3.42);
      expect(String((boundPct.cash_flow_snapshot as any).leadSentence)).not.toContain('342');
      expect(String((boundPct.cash_flow_snapshot as any).leadSentence)).not.toContain('3.92');

      const boundDecimal = bindProImChapterData({
        title: '레거시 소수 빌딩',
        body: {
          asking_price_krw: 10_000_000_000,
          annual_rent_krw: 342_000_000,
          cap_rate_base: 0.0342,
        },
      });
      expect((boundDecimal.cash_flow_snapshot as any).capRateAsIs).toBe(3.42);
      expect((boundDecimal.cash_flow_snapshot as any).capRateStabilized).toBe(3.42);
    });
  });

  // 4. fetch-im-data land_area_sqm resolution, workspace_items stats, ReleaseTier fail-closed, Studio Grade D & share-link fail-closed
  describe('4. fetchIMData Area Key SSoT, workspace_items Stats, ReleaseTier & Studio Grade D Gate', () => {
    it('resolves land_area_sqm/total_gross_area_sqm, queries workspace_items (never deal_cards), and gates dcf10Year when releaseTier is undefined', async () => {
      const queriedTables: string[] = [];
      const BLD_ID = 'c0000000-0000-0000-0000-000000000077';
      const OWNER_ID = '11111111-1111-1111-1111-111111111111';

      const docRow = {
        id: 'd0000000-0000-0000-0000-000000000077',
        building_id: BLD_ID,
        owner_id: OWNER_ID,
        document_type: 'mobile_im',
        status: 'published',
        created_at: '2026-11-01T00:00:00Z',
        body: {
          // Notice: releaseTier is intentionally omitted!
          ssot_summary: {
            area_signal: '강남구 역삼동',
            asset_type: '오피스',
            asking_price_manwon: 1500000,
            land_area_sqm: 412.5,
            total_gross_area_sqm: 1980.4,
          },
          dcf10Year: { npvBil: 18.2, irrPct: 7.5 },
          financials: { equityRequired: 75, loanAmountBil: 75, leveragedYield: 5.8 },
          sections: [
            {
              section_type: 'property_overview',
              title: '물건 개요',
              markdown: '- 강남구 역삼동 프라임 코어 입지 자산',
            },
          ],
        },
      };

      mockServiceClientImpl = () => ({
        from: (table: string) => {
          queriedTables.push(table);
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            neq: () => chain,
            in: () => chain,
            is: () => chain,
            or: () => chain,
            order: () => chain,
            limit: () => chain,
            single: async () => {
              if (table === 'document_objects') return { data: docRow, error: null };
              return chain.maybeSingle();
            },
            maybeSingle: async () => {
              if (table === 'document_objects') {
                return { data: docRow, error: null };
              }
              if (table === 'building_ssot_lite') {
                return {
                  data: {
                    id: BLD_ID,
                    owner_id: OWNER_ID,
                    status: 'published',
                    raw_address: '서울특별시 강남구 역삼동 650-1',
                    area_signal: '강남구 역삼동',
                    asset_type: '오피스',
                  },
                  error: null,
                };
              }
              if (table === 'broker_profiles') {
                return {
                  data: {
                    user_id: OWNER_ID,
                    slug: 'prime-broker-seoul',
                    company_name: '프라임중개법인',
                    display_name: '이대표',
                    is_public: true,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
            then: (resolve: any) => {
              if (table === 'workspace_items') {
                return Promise.resolve({ data: [], count: 3, error: null }).then(resolve);
              }
              if (table === 'document_objects') {
                return Promise.resolve({ data: [docRow], error: null }).then(resolve);
              }
              return Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
            },
          };
          return chain;
        },
      });

      const { issueShareLinkToken } = await import('@/lib/security/share-link-tokens');
      const issued = await issueShareLinkToken({ buildingId: BLD_ID, brokerId: OWNER_ID });

      const { fetchIMData } = await import('@/app/(public)/im-lite/[buildingId]/fetch-im-data');
      const imDoc = await fetchIMData(
        BLD_ID,
        undefined,
        { id: OWNER_ID, role: 'broker' } as any,
        { token: issued.token }
      );

      expect(imDoc).not.toBeNull();
      expect(queriedTables).not.toContain('deal_cards');
      expect(queriedTables).toContain('workspace_items');
      expect((imDoc?.heroCard as any)?.landArea).toBe(412.5);
      expect((imDoc?.heroCard as any)?.totalArea).toBe(1980.4);
      // With releaseTier undefined, effectiveTier defaults to 'fact_om' -> dcf10Year & financials gated!
      expect(imDoc?.dcf10Year).toBeUndefined();
      expect(imDoc?.financials).toBeUndefined();
      expect(imDoc?.releaseTier).toBe('fact_om');
    });

    it('pptx-studio download route skips Studio project rows in document_objects and rejects Grade D with 422 INSUFFICIENT_DATA_GRADE_D', async () => {
      const DEAL_ID = 'e0000000-0000-0000-0000-000000000055';
      const { studioService } = await import('@/domain/building/pptx-studio/studio-service');
      mockServiceClientImpl = () => ({
        from: (table: string) => {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            or: () => chain,
            order: () => chain,
            limit: () => chain,
            upsert: async () => ({ data: null, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: any) => {
              if (table === 'document_objects') {
                return Promise.resolve({
                  data: [
                    // Studio project row first (should be skipped because body.slides is an Array!)
                    {
                      id: 'studio-row-1',
                      building_id: DEAL_ID,
                      document_type: 'pptx_project',
                      body: { slides: [{ id: 's1', dataKey: 'cover' }], dataGrade: 'A' },
                    },
                    // Real mobile_im row with Grade D
                    {
                      id: 'im-row-1',
                      building_id: DEAL_ID,
                      document_type: 'mobile_im',
                      body: { dataGrade: 'D', ssot_summary: {} },
                    },
                  ],
                  error: null,
                }).then(resolve);
              }
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          };
          return chain;
        },
      });

      const proj = await studioService.createProject(DEAL_ID, 'pkg-d', '등급D 테스트');
      const { GET } = await import('@/app/api/broker/pptx-studio/projects/[id]/download/route');
      const res = await GET(
        new NextRequest(`http://localhost/api/broker/pptx-studio/projects/${proj.id}/download`, {
          headers: { 'x-test-bypass': 'true', 'x-broker-id': 'test-broker' },
        }),
        { params: Promise.resolve({ id: proj.id }) }
      );
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe('INSUFFICIENT_DATA_GRADE_D');
    });

    it('isBuildingShareLinkRevokedAsync fails closed (returns true) on unexpected DB errors in production runtime while keeping strict:true throw contract', async () => {
      const { isBuildingShareLinkRevokedAsync } = await import('@/lib/security/share-link-tokens');

      const brokenDb = {
        from: () => ({
          select: () => ({
            in: () => ({
              order: () => ({
                limit: async () => ({
                  data: null,
                  error: { code: '57014', message: 'canceling statement due to statement timeout' },
                }),
              }),
            }),
          }),
        }),
      };

      // Explicit strict: true throws as expected
      await expect(
        isBuildingShareLinkRevokedAsync('bld-timeout-1', brokenDb, { strict: true })
      ).rejects.toMatchObject({ code: '57014' });

      // Real production runtime without strict: false fails closed -> true
      const envMut = process.env as Record<string, string | undefined>;
      envMut.NODE_ENV = 'production';
      envMut.VERCEL_ENV = 'production';
      envMut.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-project.supabase.co';
      delete envMut.NEXT_PHASE;

      const prodRevoked = await isBuildingShareLinkRevokedAsync('bld-timeout-1', brokenDb);
      expect(prodRevoked).toBe(true);
    });
  });

  // 5. Rule 66: macro-transit-engine SVG passed to sharp has ZERO Hangul characters
  describe('5. Rule 66 Macro Transit SVG Zero-Hangul Sharp Rasterization & Native Labels', () => {
    it('passes pure vector/ASCII SVG with ZERO Hangul characters to sharp across all districts and returns positioned Korean labels', async () => {
      const { generateMacroTransitDiagram, generateMacroTransitMap } = await import(
        '@/services/macro-transit-engine'
      );

      sharpInputs.length = 0;
      const presets = [
        { propertyName: '여의도 파크원타워', district: 'YBD' as const },
        { propertyName: '역삼 테라타워', district: 'GBD' as const, subDistrict: 'GBD_TEHERAN' as const },
        { propertyName: '신사 ICL빌딩', district: 'GBD' as const, subDistrict: 'GBD_SINSA' as const },
        { propertyName: '서초 FM빌딩', district: 'GBD' as const, subDistrict: 'GBD_SEOCHO' as const },
        { propertyName: '을지로 센터원', district: 'CBD' as const },
      ];

      for (const opts of presets) {
        const res = await generateMacroTransitDiagram(opts);
        expect(Buffer.isBuffer(res.buffer)).toBe(true);
        expect(res.buffer.length).toBeGreaterThan(2000);
        expect(/[\uAC00-\uD7A3]/.test(res.rasterSvg)).toBe(false);
        expect(res.labels.length).toBeGreaterThan(8);
        expect(res.labels.some((l) => l.text.includes(opts.propertyName))).toBe(true);
      }

      const mapBuf = await generateMacroTransitMap({
        propertyName: '한글두부방지빌딩',
        district: 'YBD',
      });
      expect(Buffer.isBuffer(mapBuf)).toBe(true);

      expect(sharpInputs.length).toBe(presets.length + 1);
      for (const svgPassedToSharp of sharpInputs) {
        expect(/[\uAC00-\uD7A3]/.test(svgPassedToSharp)).toBe(false);
      }
    });
  });
});
