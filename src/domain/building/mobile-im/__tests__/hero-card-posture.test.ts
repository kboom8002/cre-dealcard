import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import * as contextBuilder from '@/domain/building/mobile-im/im-context-builder';
import * as sectionGenerator from '@/domain/building/mobile-im/im-section-generator';
import type { MobileIMWriterInput } from '@/domain/building/mobile-im/types';
import type { FinancialOutputs } from '@/domain/building/mobile-im/financials';
import type { IMGenerationContext } from '@/domain/building/mobile-im/im-context-builder';

// 모듈 모킹
vi.mock('@/domain/building/mobile-im/im-context-builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/building/mobile-im/im-context-builder')>();
  return {
    ...actual,
    buildIMContext: vi.fn(),
  };
});

vi.mock('@/domain/building/mobile-im/im-section-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/building/mobile-im/im-section-generator')>();
  return {
    ...actual,
    generateSingleSection: vi.fn(),
  };
});

// 품질 게이트 차단 로그 등 무시용
vi.mock('@/domain/building/mobile-im/quality-gates-v02', () => ({
  runPublishGates: vi.fn(() => ({ blocked: false, failedBlocks: [] })),
}));

vi.mock('@/domain/building/mobile-im/cross-validator', () => ({
  runCrossValidation: vi.fn(() => ({ passed: true, inconsistencies: [] })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/domain/building/mobile-im/im-embedding-indexer', () => ({
  indexIMSections: vi.fn(),
}));

describe('HeroCard Posture-Specific Metrics', () => {
  const dummyInput: MobileIMWriterInput = {
    building_ssot_lite: { id: 'test_bld' } as any,
    supplemental: {},
    readiness: { score: 100, missing: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 섹션 생성은 단순히 빈 값을 리턴하도록 설정
    vi.mocked(sectionGenerator.generateSingleSection).mockResolvedValue({
      section: { section_type: 'property_overview' } as any,
      generatedByAi: false,
      cachedFinancials: null,
    });
  });

  const setupMockContext = (
    posture: string,
    mockFinancials: Partial<FinancialOutputs>,
    mockAssetIdentity: Record<string, any> = {}
  ) => {
    vi.mocked(contextBuilder.buildIMContext).mockResolvedValue({
      sectionPlan: { posture, sections: ['property_overview'] },
      cachedFinancials: mockFinancials as FinancialOutputs,
      assetIdentity: mockAssetIdentity,
      buyerFit: {},
      marketLocation: {},
      sectionCtx: { numericalAnchors: {} },
    } as unknown as IMGenerationContext);
  };

  test('HC-01: income → askingPriceDisplay, equityRequiredBil, capRateBase, leveragedYieldPct present', async () => {
    setupMockContext('income', {
      capRate: { base: 4.5, upside: 5.0, range: '4.5~5.0%' },
      equityRequired: 30,
      leveragedYield: 6.2,
      annualNoi: { base: 100000000, upside: 120000000 },
    }, { price_band: '100억' });

    const result = await generateMobileIM(dummyInput);
    
    expect(result.heroCard?.posture).toBe('income');
    expect(result.heroCard?.askingPriceDisplay).toBe('100억');
    expect(result.heroCard?.capRateBase).toBe(4.5);
    expect(result.heroCard?.equityRequiredBil).toBe(30);
    expect(result.heroCard?.leveragedYieldPct).toBe(6.2);
    expect(result.heroCard?.noiBaseBil).toBe(1.0); // 1억 = 1.0 (억원)
  });

  test('HC-02: owner_occupied → totalGrossAreaM2, askingPriceDisplay, ownVsLeaseSavingsBil present', async () => {
    setupMockContext('owner_occupied', {
      ownVsLeaseSavingsBil: 2.5,
      breakevenYears: 5,
    }, { price_band: '120억' });

    // totalGrossAreaM2는 ctx.totalAreaSqm 또는 external_data에서 옴
    // ctx에 totalAreaSqm 추가
    vi.mocked(contextBuilder.buildIMContext).mockResolvedValue({
      sectionPlan: { posture: 'owner_occupied', sections: ['property_overview'] },
      cachedFinancials: { ownVsLeaseSavingsBil: 2.5, breakevenYears: 5 } as any,
      assetIdentity: { price_band: '120억' },
      buyerFit: {},
      marketLocation: {},
      sectionCtx: { numericalAnchors: {} },
      totalAreaSqm: 500,
    } as unknown as IMGenerationContext);

    const result = await generateMobileIM(dummyInput);

    expect(result.heroCard?.posture).toBe('owner_occupied');
    expect(result.heroCard?.askingPriceDisplay).toBe('120억');
    expect(result.heroCard?.ownVsLeaseSavingsBil).toBe(2.5);
    expect(result.heroCard?.breakevenYears).toBe(5);
    expect(result.heroCard?.totalGrossAreaM2).toBe(500);
  });

  test('HC-03: development → landPricePerPyeong, zoning, devProfitMarginPct present', async () => {
    setupMockContext('development', {
      landPricePerPyeong: 8000,
      devProfitMarginPct: 15.5,
    });

    const inputWithZoning = {
      ...dummyInput,
      external_data: { landUsePlan: { zoningDistrict: '일반상업지역' } } as any,
    };

    const result = await generateMobileIM(inputWithZoning);

    expect(result.heroCard?.posture).toBe('development');
    expect(result.heroCard?.landPricePerPyeong).toBe(8000);
    expect(result.heroCard?.devProfitMarginPct).toBe(15.5);
    expect(result.heroCard?.zoning).toBe('일반상업지역');
  });

  test('HC-04: operating → gopMarginPct, adr, occPct, revpar present', async () => {
    setupMockContext('operating', {
      gopMarginPct: 35.0,
      adrKrw: 15, // 15만원
      occPct: 80,
      revparKrw: 12, // 12만원
    });

    const result = await generateMobileIM(dummyInput);

    expect(result.heroCard?.posture).toBe('operating');
    expect(result.heroCard?.gopMarginPct).toBe(35.0);
    expect(result.heroCard?.adr).toBe(15);
    expect(result.heroCard?.occPct).toBe(80);
    expect(result.heroCard?.revpar).toBe(12);
  });

  test('HC-05: trading → pricePerPyeong, marketDiscountPct, targetHprPct present', async () => {
    setupMockContext('trading', {
      pricePerPyeong: 5000,
      marketDiscountPct: 10,
      targetHprPct: 18,
    });

    const result = await generateMobileIM(dummyInput);

    expect(result.heroCard?.posture).toBe('trading');
    expect(result.heroCard?.pricePerPyeong).toBe(5000);
    expect(result.heroCard?.marketDiscountPct).toBe(10);
    expect(result.heroCard?.targetHprPct).toBe(18);
  });

  test('HC-06: unknown posture → default income fallback', async () => {
    setupMockContext('unknown_posture', {
      capRate: { base: 4.0, upside: 4.5, range: '4.0~4.5%' },
    });

    const result = await generateMobileIM(dummyInput);

    expect(result.heroCard?.posture).toBe('unknown_posture');
    // fallback으로 처리되어도 인터페이스는 capRateBase 등을 반환
    expect(result.heroCard?.capRateBase).toBe(4.0);
  });
});
