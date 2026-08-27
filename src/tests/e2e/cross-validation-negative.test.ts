import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateMobileIMHandler } from '@/app/api/broker/im-lite/generate/handler';
import { runCrossValidation } from '@/domain/building/mobile-im/cross-validator';
import type { NumericalAnchors } from '@/domain/building/mobile-im/cross-validator';

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    }),
  };
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-doc-id' }, error: null })
        })
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      })
    }),
  }),
}));

vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockResolvedValue({ content: 'Generated AI text' }),
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

let mockSsotData: any = {};

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    readWithMigration: vi.fn().mockImplementation(async (id: string) => {
      return { data: mockSsotData };
    }),
  };
});

describe('Cross-Validation Negative Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSsotData = {
      id: 'mock-bldg',
      area_signal: '강남구',
      asset_type: '근생빌딩',
      price_band: '100억',
      completeness_score: 80,
      layers: { location: { pnu: '1111' } },
    };
  });

  test('CV-01: income - rent roll sum ≠ reported monthly rent (>10% gap) → warning', () => {
    // We test the cross-validation logic directly for this as it depends on LLM output text
    const anchors: NumericalAnchors = { monthlyRentKrw: 10000000 };
    // Section mentions 5,000,000 won which is > 10% gap
    const sections = [
      { section_type: 'income_analysis', markdown: '월세 총액 500만 원' }
    ];
    const res = runCrossValidation(sections, anchors, 'income');
    expect(res.inconsistencies.some(i => i.field === 'monthly_rent_krw' && i.severity === 'warning')).toBe(true);
  });

  test('CV-02: development - landCost + constructionCost ≠ totalProjectCost → warning (critical)', () => {
    const anchors: NumericalAnchors = {
      landCostKrw: 5000000000,
      constructionCostKrw: 3000000000,
      totalProjectCostKrw: 10000000000 // sum is 8B, total is 10B -> gap > 15%
    };
    const sections = [{ section_type: 'property_overview', markdown: '내용' }];
    const res = runCrossValidation(sections, anchors, 'development');
    expect(res.inconsistencies.some(i => i.field === 'total_project_cost' && i.severity === 'critical')).toBe(true);
  });

  test('CV-03: operating - ADR × OCC% ≠ RevPAR (>20% gap) → warning (critical)', () => {
    const anchors: NumericalAnchors = {
      adrKrw: 100000,
      occPct: 80, // expected revpar: 80,000
      revparKrw: 50000 // gap > 5%
    };
    const sections = [{ section_type: 'property_overview', markdown: '내용' }];
    const res = runCrossValidation(sections, anchors, 'operating');
    expect(res.inconsistencies.some(i => i.field === 'revpar' && i.severity === 'critical')).toBe(true);
  });

  test('CV-04: trading - pricePerPyeong ≠ askingPrice/pyeong → warning', () => {
    const anchors: NumericalAnchors = {
      askingPriceKrw: 10000000000,
      totalAreaSqm: 3305.78, // ~1000 pyeong -> expected price per pyeong = 10,000,000
      pricePerPyeong: 15000000 // gap > 10%
    };
    const sections = [{ section_type: 'property_overview', markdown: '내용' }];
    const res = runCrossValidation(sections, anchors, 'trading');
    expect(res.inconsistencies.some(i => i.field === 'price_per_pyeong' && i.severity === 'warning')).toBe(true);
  });

  test('CV-05: income - Cap Rate < 2% (abnormally low) → financialWarning', async () => {
    // High asking price, low rent -> Low cap rate
    const res = await generateMobileIMHandler({
      buildingId: 'mock-bldg',
      userId: 'user',
      supplemental: { 
        asking_price_manwon: 1000000, // 10B
        monthly_rent_total_krw: 1000000 // 1M / month -> 12M / yr. Cap rate will be ~0.1%
      },
      identity: { investmentPosture: 'income' },
    });
    
    expect(res.financialWarnings?.some(w => w.includes('권역 평균 대비 매우 낮음'))).toBe(true);
  });

  test('CV-06: income - Cap Rate > 15% (abnormally high) → financialWarning', async () => {
    // Low asking price, high rent -> High cap rate
    const res = await generateMobileIMHandler({
      buildingId: 'mock-bldg',
      userId: 'user',
      supplemental: { 
        asking_price_manwon: 1000, // 10M
        monthly_rent_total_krw: 500000000 // 500M / month
      },
      identity: { investmentPosture: 'income' },
    });
    
    expect(res.financialWarnings?.some(w => w.includes('비정상적으로 높음'))).toBe(true);
  });
});
