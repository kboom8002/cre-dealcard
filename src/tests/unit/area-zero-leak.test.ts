import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import * as contextBuilder from '@/domain/building/mobile-im/im-context-builder';
import * as sectionGenerator from '@/domain/building/mobile-im/im-section-generator';
import { renderLandDetail } from '@/domain/building/mobile-im/section-renderers/land-detail-renderer';
import type { MobileIMWriterInput } from '@/domain/building/mobile-im/types';
import type { IMGenerationContext } from '@/domain/building/mobile-im/im-context-builder';

vi.mock('@/domain/building/mobile-im/im-context-builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/building/mobile-im/im-context-builder')>();
  return { ...actual, buildIMContext: vi.fn() };
});
vi.mock('@/domain/building/mobile-im/im-section-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/building/mobile-im/im-section-generator')>();
  return { ...actual, generateSingleSection: vi.fn() };
});
vi.mock('@/domain/building/mobile-im/quality-gates-v02', () => ({
  runPublishGates: vi.fn(() => ({ blocked: false, failedBlocks: [] })),
}));
vi.mock('@/domain/building/mobile-im/cross-validator', () => ({
  runCrossValidation: vi.fn(() => ({ passed: true, inconsistencies: [] })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/domain/building/mobile-im/im-embedding-indexer', () => ({ indexIMSections: vi.fn() }));

describe('land_detail — 대지면적 0/NaN/음수는 "0㎡ (0.0평)" 이 아니라 "-"', () => {
  const p = { pnu: 'x', jimok: '대', ownershipRatio: 1 };
  test.each([0, NaN, -5])('단일 필지 areaM2=%s → 대지면적 "-"', areaM2 => {
    const md = renderLandDetail({ parcels: [{ ...p, areaM2 }], zoning: '-' }).markdown;
    expect(md).toContain('- **대지면적**: -');
    expect(md).not.toContain('0㎡');
    expect(md).not.toContain('0.0평');
    expect(md).not.toContain('NaN');
  });

  test('양수는 기존 표기 유지', () => {
    const md = renderLandDetail({ parcels: [{ ...p, areaM2: 486.2 }], zoning: '-' }).markdown;
    expect(md).toContain('486.2㎡');
    expect(md).toContain('평)');
  });
});

describe('writer heroCard — 면적 0/NaN → null, 해석된 대지면적 사용', () => {
  const baseInput = (over: Partial<MobileIMWriterInput> = {}): MobileIMWriterInput => ({
    building_ssot_lite: { id: 'b' } as any,
    supplemental: {},
    readiness: { score: 100, missing: [] },
    ...over,
  });

  const ctxWith = (totalAreaSqm: number) =>
    vi.mocked(contextBuilder.buildIMContext).mockResolvedValue({
      sectionPlan: { posture: 'operating', sections: ['property_overview'] },
      cachedFinancials: {} as any,
      assetIdentity: {},
      buyerFit: {},
      marketLocation: {},
      sectionCtx: { numericalAnchors: {} },
      totalAreaSqm,
    } as unknown as IMGenerationContext);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sectionGenerator.generateSingleSection).mockResolvedValue({
      section: { section_type: 'property_overview' } as any,
      generatedByAi: false,
      cachedFinancials: null,
    });
  });

  test('대장 platArea 0 + ctx 연면적 0 → landAreaM2/totalGrossAreaM2 모두 null (0 누출 없음)', async () => {
    ctxWith(0);
    const r = await generateMobileIM(baseInput({ external_data: { buildingRegister: { platArea: 0, totalArea: 0 } } as any }));
    expect(r.heroCard?.landAreaM2).toBeNull();
    expect(r.heroCard?.totalGrossAreaM2).toBeNull();
  });

  test('NaN 도 null', async () => {
    ctxWith(NaN);
    const r = await generateMobileIM(baseInput({ external_data: { buildingRegister: { platArea: NaN, totalArea: NaN } } as any }));
    expect(r.heroCard?.landAreaM2).toBeNull();
    expect(r.heroCard?.totalGrossAreaM2).toBeNull();
  });

  test('hotel: 대장 platArea 0 이어도 메모 SSoT 147.1평 → 486.2㎡ (히어로 대지면적)', async () => {
    ctxWith(3842.6);
    const r = await generateMobileIM(baseInput({
      building_ssot_lite: { id: 'b', layers: { total_floor_area_pyung: 1162.4, land_area_pyung: 147.1 } } as any,
      external_data: { buildingRegister: { platArea: 0, totalArea: 231.4 } } as any,
    }));
    expect(r.heroCard?.landAreaM2).toBeCloseTo(486.2, 0);
    // 연면적은 ctx(handler 해석값) 우선 — 대장의 231.4 가 아니다
    expect(r.heroCard?.totalGrossAreaM2).toBeCloseTo(3842.6, 1);
  });

  test('수택(dev): 대장 없음 + 필지 합/명시 대지면적 651.2 → landAreaM2 651.2, 연면적 null', async () => {
    ctxWith(0);
    const r = await generateMobileIM(baseInput({ supplemental: { land_area_m2: 651.2 } as any }));
    expect(r.heroCard?.landAreaM2).toBe(651.2);
    expect(r.heroCard?.totalGrossAreaM2).toBeNull();
  });
});
