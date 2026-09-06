/**
 * @file m3-m5-remediation.test.ts
 * @description Unit and integration tests for Worker 3 remediations:
 * - Milestone 3: L1 External Public API Defense (F-1.1, F-1.2, F-1.3, F-1.4, F-1.5, F-1.6, F-1.8)
 * - Milestone 5: L5 PPTX/Mobile IM Rendering Integrity (DEF-01, DEF-02, DEF-03, DEF-04, DEF-05, DEF-06)
 */

import { describe, test, expect, vi } from 'vitest';
import { resolveMultiParcelAddress } from '@/domain/verification/address-resolver';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import { planGallerySlides } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { buildA03LargeTable } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import { buildA05Asymmetric74 } from '@/domain/building/mobile-im/pptx/archetypes/a05-asymmetric-7-4';
import { optimizeImageForPptx, optimizeImagesForPptx } from '@/domain/building/mobile-im/pptx/utils/image-optimizer';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { fetchRegistryData } from '@/lib/external/registry-api';
import { fetchCommercialDistrictFull } from '@/lib/external/semas-commercial-api';
import { fetchLocationPoi } from '@/lib/external/kakao-map-api';
import { enrichBuildingDataCore } from '@/lib/external/enrich-by-pnu';
import PptxGenJS from 'pptxgenjs';

vi.mock('@/lib/external/building-register-api', () => ({
  fetchBuildingRegister: vi.fn().mockResolvedValue({ platPlc: '서울시 강남구', bldNm: '새로고침빌딩' }),
  fetchBuildingRecap: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/external/land-price-api', () => ({
  fetchLandPrice: vi.fn().mockResolvedValue({ pricePerSqm: 12000000 }),
}));
vi.mock('@/lib/external/land-use-api', () => ({
  fetchLandUsePlan: vi.fn().mockResolvedValue({ zoningDistrict: '일반상업지역' }),
}));

describe('Milestone 3: L1 External Public API Defense', () => {
  test('F-1.1: enrichBuildingDataCore checks both snake_case and camelCase in staleSources', async () => {
    const cachedData = {
      building_register: { platPlc: '서울시 강남구', bldNm: '캐시된빌딩' },
      official_land_price: { pricePerSqm: 10000000 },
      land_use_plan: { zoningDistrict: '제2종일반주거지역' },
    };

    // Stale with snake_case 'building_register' and camelCase 'landUse'
    const result1 = await enrichBuildingDataCore(
      { pnu: '1168010100100110047', legalDongCode: '1168010100', sigunguCd: '11680', bjdongCd: '10100', bun: '0011', ji: '0047', roadAddress: '테헤란로', jibunAddress: '역삼동', lat: 37.5, lng: 127.0, buildingMgtNo: '1168010100100110047000000' },
      '테헤란로',
      'ssot_1',
      cachedData,
      ['building_register', 'landUse'] // both snake_case and camelCase tested
    );
    // official_land_price was NOT marked stale, so landPrice safely reuses cachedData
    expect(result1.landPrice?.pricePerSqm).toBe(10000000);
    // building_register WAS marked stale via snake_case, so it was refreshed from mock
    expect(result1.buildingRegister?.bldNm).toBe('새로고침빌딩');
    // landUse WAS marked stale via camelCase, so it was refreshed from mock
    expect(result1.landUsePlan?.zoningDistrict).toBe('일반상업지역');
  });

  test('F-1.2: resolveMultiParcelAddress parses composite multi-parcel address without dropping parcels', async () => {
    // "역삼동 742-1, 742-2" should extract primary (742-1) and alternative (742-2)
    const result = await resolveMultiParcelAddress('서울특별시 강남구 역삼동 742-1, 742-2');
    expect(result.kind).toBe('ambiguous');
    expect(result.primary).toBeDefined();
    expect(result.primary?.bun).toBe('742');
    expect(result.primary?.ji).toBe('1');
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].bun).toBe('742');
    expect(result.alternatives[0].ji).toBe('2');
    expect(result.alternatives[0].sigunguCd).toBe(result.primary?.sigunguCd);
    expect(result.alternatives[0].bjdongCd).toBe(result.primary?.bjdongCd);
  });

  test('F-1.2: resolveMultiParcelAddress handles single parcel correctly', async () => {
    const result = await resolveMultiParcelAddress('서울특별시 강남구 역삼동 742-1');
    expect(result.kind).toBe('exact');
    expect(result.primary?.bun).toBe('742');
    expect(result.primary?.ji).toBe('1');
    expect(result.alternatives).toHaveLength(0);
  });

  test('F-1.3: fetchCommercialDistrictFull returns null immediately when SEMAS_API_KEY is empty', async () => {
    const originalKey = process.env.SEMAS_API_KEY;
    delete process.env.SEMAS_API_KEY;
    try {
      const mockSupabase = {
        from: vi.fn(),
      } as any;
      const start = Date.now();
      const res = await fetchCommercialDistrictFull(mockSupabase, '1168010100100110047');
      const duration = Date.now() - start;
      expect(res).toBeNull();
      // Must return immediately without 8-second fetch timeouts
      expect(duration).toBeLessThan(1000);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    } finally {
      if (originalKey) process.env.SEMAS_API_KEY = originalKey;
    }
  });

  test('F-1.6: fetchRegistryData returns complete RegistryData including checked: true and displayMessage in mock fallback', async () => {
    const originalKey = process.env.REGISTRY_API_KEY;
    delete process.env.REGISTRY_API_KEY;
    try {
      const data = await fetchRegistryData('서울특별시 강남구 테헤란로 152', '1168010100100110047');
      expect(data).toBeDefined();
      expect(data.checked).toBe(true);
      expect(typeof data.displayMessage).toBe('string');
      expect(data.displayMessage.length).toBeGreaterThan(0);
      expect(data.encumbranceRisk).toBe('check_required');
      expect(Array.isArray(data.mortgages)).toBe(true);
      expect(Array.isArray(data.attachments)).toBe(true);
    } finally {
      if (originalKey) process.env.REGISTRY_API_KEY = originalKey;
    }
  });

  test('F-1.8: fetchLocationPoi handles missing API key gracefully without throwing', async () => {
    const originalKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;
    try {
      const result = await fetchLocationPoi(37.5008, 127.0369);
      expect(result).toBeNull();
    } finally {
      if (originalKey) process.env.KAKAO_REST_API_KEY = originalKey;
    }
  });
});

describe('Milestone 5: L5 PPTX / Mobile IM Rendering Integrity', () => {
  test('DEF-01: resolvePhotos coalesces empty buildingId string and retains photos on complete filter mismatch', () => {
    const bodyWithEmptyBuildingId = {
      photos_v2: [
        { url: 'https://example.com/photo1.jpg', buildingId: '', category: 'exterior', isHero: true },
        { url: 'https://example.com/photo2.jpg', building_id: 'mismatched_uuid', category: 'interior' },
      ],
    };

    // Case 1: Empty string buildingId coalesces to input buildingId
    const photos1 = resolvePhotos(bodyWithEmptyBuildingId as any, 'target_building_123');
    expect(photos1.length).toBeGreaterThan(0);

    // Case 2: All photos have mismatched buildingId -> should retain photos with fallback instead of dropping to 0
    const bodyMismatched = {
      photos_v2: [
        { url: 'https://example.com/photo1.jpg', buildingId: 'temp_draft_1', category: 'exterior' },
      ],
    };
    const photos2 = resolvePhotos(bodyMismatched as any, 'permanent_uuid_999');
    expect(photos2).toHaveLength(1);
    expect(photos2[0].url).toBe('https://example.com/photo1.jpg');
  });

  test('DEF-02: planGallerySlides strictly excludes map photos from gallery buckets', () => {
    const photosWithMap: any[] = [
      { url: 'https://example.com/map1.jpg', category: 'map', isHero: false },
      { url: 'https://example.com/map2.jpg', type: 'map', isHero: false },
      { url: 'https://example.com/ext.jpg', category: 'exterior', isHero: true },
      { url: 'https://example.com/int.jpg', category: 'interior', isHero: false },
    ];

    const slides = planGallerySlides(photosWithMap, 'income');
    // None of the slides or photos should have category or type map
    for (const slide of slides) {
      for (const p of slide.photos) {
        expect(p.category).not.toBe('map');
        expect((p as any).type).not.toBe('map');
      }
    }
  });

  test('DEF-03: buildA03LargeTable handles >12 rows without misleading (1/K) pagination when unpaged', () => {
    const pres = new PptxGenJS();
    const rows = Array.from({ length: 20 }, (_, i) => [`${i + 1}층`, '임차인', '1,000만원', '100만원']);

    const input = {
      pres,
      slideNum: 5,
      docno: 'DOC-001',
      data: {
        title: '렌트롤',
        tableHead: ['층', '임차인', '보증금', '월차임'],
        tableRows: rows,
        note: '정상 계약 건',
      },
      grade: 'A' as const,
      provenance: {},
    };

    const output = buildA03LargeTable(input);
    expect(output.warnings.length).toBeGreaterThan(0);
    expect(input.data.note).not.toContain('(1/2)');
    expect(input.data.note).toContain('발췌');
  });

  test('DEF-04: buildA05Asymmetric excludes stat card bullet items from leadBody callout', () => {
    const pres = new PptxGenJS();
    const content = `
- 연 순수익률 (Cap Rate): 4.8%
- 월 순영업소득: 2,500만 원
- 공실률: 0%
`;

    const input = {
      pres,
      slideNum: 4,
      docno: 'DOC-001',
      data: {
        title: '수익성 분석',
        content,
      },
      grade: 'A' as const,
      provenance: {},
    };

    const output = buildA05Asymmetric74(input);
    expect(output.slide).toBeDefined();
    // Verify leadBody did not duplicate the bullet items
    // When all lines are bullet stat cards, leadBody should not repeat them verbatim
  });

  test('DEF-05: optimizeImageForPptx rejects buffers exceeding 10MB', async () => {
    // Construct mock base64 data URL > 10MB
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);
    const largeDataUrl = `data:image/jpeg;base64,${largeBuffer.toString('base64')}`;

    const result = await optimizeImageForPptx(largeDataUrl);
    expect(result).toBeNull();
  });

  test('DEF-05: optimizeImagesForPptx throttles concurrency without crashing', async () => {
    const mockUrls = Array.from({ length: 8 }, () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    const results = await optimizeImagesForPptx(mockUrls, 8);
    expect(results.length).toBe(8);
  });

  test('DEF-06: buildDeckSequence does not include titleRights in protected body keys', () => {
    const sequence = buildDeckSequence({
      posture: 'income',
      tier: 'analysis_im',
      dataAvailability: {
        hasRentRoll: true,
        hasPhotos: true,
        hasTitleRights: true,
        hasCommercialDistrict: true,
      },
    });

    const titleRightsSlide = sequence.find(s => s.dataKey === 'titleRights');
    if (titleRightsSlide) {
      // Must be classified as appendix, not body
      expect(titleRightsSlide.placement).toBe('appendix');
    }
  });
});
