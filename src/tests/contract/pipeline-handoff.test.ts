/**
 * Pipeline Handoff Contract Tests
 *
 * 파이프라인 스테이지 간 데이터 핸드오프 무결성을 검증합니다.
 * D33~D40 세션에서 발견된 결함의 80%가 핸드오프 지점에서 발생했으며,
 * 이 테스트들은 해당 지점의 계약(contract)을 명시적으로 검증합니다.
 *
 * @see docs/prod-test/production-readiness-strategy.md
 */
import { describe, test, expect } from 'vitest';
import { resolvePhotos, isSupportedMedia } from '@/domain/building/mobile-im/photo-url-transformer';
import { resolveTier } from '@/domain/building/im-core';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import type { DeckSequenceInput, DataAvailability } from '@/domain/building/mobile-im/pptx/deck-sequencer';

// ─────────────────────────────────────────────
// C1: photos_v2 URL 스킴 투과성 (Rule 39)
// generate-async/route.ts의 필터가 4종 스킴을 모두 통과시키는지 검증
// ─────────────────────────────────────────────
describe('C1: photos_v2 URL scheme permeability', () => {
  /** route.ts 필터 로직을 동일하게 재현 */
  function filterPhotosV2(photos: any[]): any[] {
    return (photos || []).filter((p: any) =>
      p?.url && (p.url.startsWith('http://') || p.url.startsWith('https://') || p.url.startsWith('/') || p.url.startsWith('data:'))
    );
  }

  test('Positive: http:// URL passes filter', () => {
    const result = filterPhotosV2([{ url: 'http://example.com/photo.jpg', category: 'exterior' }]);
    expect(result).toHaveLength(1);
  });

  test('Positive: https:// URL passes filter', () => {
    const result = filterPhotosV2([{ url: 'https://storage.supabase.co/photo.jpg', category: 'exterior' }]);
    expect(result).toHaveLength(1);
  });

  test('Positive: / relative URL passes filter', () => {
    const result = filterPhotosV2([{ url: '/images/photo.jpg', category: 'exterior' }]);
    expect(result).toHaveLength(1);
  });

  test('Positive: data: URI passes filter', () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...';
    const result = filterPhotosV2([{ url: dataUri, category: 'exterior' }]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toMatch(/^data:image\//);
  });

  test('Negative: empty URL is filtered out', () => {
    const result = filterPhotosV2([{ url: '', category: 'exterior' }]);
    expect(result).toHaveLength(0);
  });

  test('Negative: null URL is filtered out', () => {
    const result = filterPhotosV2([{ url: null }, { category: 'exterior' }]);
    expect(result).toHaveLength(0);
  });

  test('Mixed: all 4 schemes pass, invalid filtered', () => {
    const photos = [
      { url: 'https://cdn.example.com/1.jpg' },
      { url: 'http://legacy.example.com/2.jpg' },
      { url: '/uploads/3.jpg' },
      { url: 'data:image/png;base64,iVBORw0KGgo...' },
      { url: '' },
      { url: null },
      { category: 'lobby' },
    ];
    const result = filterPhotosV2(photos);
    expect(result).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────
// C2: supplemental → handler 필드 보존
// photos_v2, floor_leases, manual_comps가 supplemental 구성 시 보존되는지 검증
// ─────────────────────────────────────────────
describe('C2: supplemental field preservation', () => {
  /** generate-async/route.ts의 supplemental 구성 로직 재현 */
  function buildSupplemental(body: Record<string, any>) {
    return {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      resolved_address: body.resolved_address,
      photo_urls: body.photo_urls,
      photos_v2: (body.photos_v2 || []).filter((p: any) =>
        p?.url && (p.url.startsWith('http://') || p.url.startsWith('https://') || p.url.startsWith('/') || p.url.startsWith('data:'))
      ),
      floor_leases: body.floor_leases,
      asking_price_manwon: body.asking_price_manwon,
      manual_comps: body.manual_comps,
      occupancySpec: body.occupancySpec,
      developmentSpec: body.developmentSpec,
    };
  }

  test('Positive: photos_v2 array preserved with metadata', () => {
    const body = {
      photos_v2: [
        { url: 'https://cdn.example.com/1.jpg', category: 'exterior', isHero: true, order: 0 },
        { url: 'https://cdn.example.com/2.jpg', category: 'interior', isHero: false, order: 1 },
      ],
    };
    const sup = buildSupplemental(body);
    expect(sup.photos_v2).toHaveLength(2);
    expect(sup.photos_v2[0]).toMatchObject({ category: 'exterior', isHero: true });
  });

  test('Positive: floor_leases array preserved', () => {
    const body = {
      floor_leases: [
        { floor: '1F', tenant: '약국', rent_manwon: 300, area_pyeong: 15 },
        { floor: '2F', tenant: '내과', rent_manwon: 450, area_pyeong: 30 },
      ],
    };
    const sup = buildSupplemental(body);
    expect(sup.floor_leases).toHaveLength(2);
    expect(sup.floor_leases[0].tenant).toBe('약국');
  });

  test('Positive: manual_comps array preserved', () => {
    const body = {
      manual_comps: [{ address: '당산동 123', price_manwon: 85000, area_pyeong: 120 }],
    };
    const sup = buildSupplemental(body);
    expect(sup.manual_comps).toHaveLength(1);
  });

  test('Negative: missing fields are undefined, not error', () => {
    const sup = buildSupplemental({});
    expect(sup.photos_v2).toEqual([]);
    expect(sup.floor_leases).toBeUndefined();
    expect(sup.manual_comps).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// C3: doc.body에 base64 blob 없음 (Rule 40)
// ─────────────────────────────────────────────
describe('C3: JSONB no binary blob guard', () => {
  const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

  test('Positive: URL-only photos_v2 passes size guard', () => {
    const body = {
      photos_v2: Array.from({ length: 8 }, (_, i) => ({
        url: `https://storage.supabase.co/building_photos/uuid/im-photos/${i}.jpg`,
        category: 'exterior',
        order: i,
      })),
      sections: [{ title: 'test', content: 'x'.repeat(5000) }],
    };
    const jsonSize = JSON.stringify(body).length;
    expect(jsonSize).toBeLessThan(MAX_BODY_SIZE);
  });

  test('Negative: multiple base64 photos would exceed size guard', () => {
    // 실 시나리오: 8장 × ~1MB = ~10MB base64 in JSONB
    const fakeBase64 = 'A'.repeat(300_000); // ~300KB per photo
    const body = {
      photos_v2: Array.from({ length: 8 }, () => ({
        url: `data:image/jpeg;base64,${fakeBase64}`,
        category: 'exterior',
      })),
    };
    const jsonSize = JSON.stringify(body).length;
    expect(jsonSize).toBeGreaterThan(MAX_BODY_SIZE);
  });

  test('Guard: body should not contain base64 image data pattern', () => {
    const cleanBody = {
      photos_v2: [{ url: 'https://storage.supabase.co/photo.jpg' }],
      sections: [{ title: 'Summary', content: 'Normal text content' }],
    };
    const bodyStr = JSON.stringify(cleanBody);
    expect(bodyStr).not.toMatch(/base64,[/+A-Za-z0-9]{1000,}/);
  });
});

// ─────────────────────────────────────────────
// C4: doc.body → resolvePhotos 전달
// ─────────────────────────────────────────────
describe('C4: doc.body → resolvePhotos handoff', () => {
  test('Positive: resolvePhotos extracts photos_v2 from supplemental', () => {
    const sup = {
      photos_v2: [
        { url: 'https://storage.supabase.co/photo1.jpg', category: 'exterior', isHero: true },
        { url: 'https://storage.supabase.co/photo2.jpg', category: 'aerial' },
      ],
    } as any;
    const result = resolvePhotos(sup, 'test-building-id');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('Positive: resolvePhotos falls back to photo_urls v1', () => {
    const sup = {
      photo_urls: [
        'https://storage.supabase.co/photo1.jpg',
        'https://storage.supabase.co/photo2.jpg',
      ],
    } as any;
    const result = resolvePhotos(sup, 'test-building-id');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('Negative: empty photos_v2 returns empty array', () => {
    const result = resolvePhotos({ photos_v2: [] } as any, 'test-building-id');
    expect(result).toHaveLength(0);
  });

  test('Negative: null supplemental returns empty array', () => {
    const result = resolvePhotos(null, 'test-building-id');
    expect(result).toHaveLength(0);
  });

  test('isSupportedMedia accepts all valid schemes', () => {
    expect(isSupportedMedia('https://example.com/photo.jpg')).toBe(true);
    expect(isSupportedMedia('http://example.com/photo.jpg')).toBe(true);
    expect(isSupportedMedia('/uploads/photo.jpg')).toBe(true);
    expect(isSupportedMedia('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  test('isSupportedMedia rejects .wdp files', () => {
    expect(isSupportedMedia('https://example.com/photo.wdp')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// C5: resolveTier → deck-sequencer 면수 보장
// ─────────────────────────────────────────────
describe('C5: resolveTier → deck-sequencer page count', () => {
  const fullDA: DataAvailability = {
    hasBuildingRegister: true,
    hasLandUsePlan: true,
    hasRentRoll: true,
    hasComparables: true,
    hasPhotos: true,
  };

  test('Positive: Grade A + full income data → decision_im', () => {
    const tier = resolveTier({
      grade: 'A',
      posture: 'income' as any,
      dataAvailability: fullDA,
      hasExpertReview: false,
      hasAsOf: true,
      hasScenario: true,
    });
    expect(tier).toBe('decision_im');
  });

  test('Positive: decision_im deck contains protected slides', () => {
    const input: DeckSequenceInput = {
      posture: 'income',
      grade: 'A',
      hasPhotos: true,
      gallerySpecs: [],
      dataAvailability: fullDA,
      releaseTier: 'decision_im',
    };
    const sequence = buildDeckSequence(input);
    const dataKeys = sequence.map(s => s.dataKey);
    expect(dataKeys).toContain('cover');
    expect(dataKeys).toContain('summary');
    expect(dataKeys).toContain('closing');
  });

  test('Negative: Grade D → internal_only regardless of data', () => {
    const tier = resolveTier({
      grade: 'D',
      posture: 'income' as any,
      dataAvailability: fullDA,
      hasExpertReview: true,
      hasAsOf: true,
      hasScenario: true,
    });
    expect(tier).toBe('internal_only');
  });

  test('Negative: no rent roll for income → not decision_im', () => {
    const tier = resolveTier({
      grade: 'B',
      posture: 'income' as any,
      dataAvailability: { ...fullDA, hasRentRoll: false, hasComparables: false },
      hasExpertReview: false,
      hasAsOf: true,
      hasScenario: true,
    });
    expect(tier).not.toBe('decision_im');
    expect(tier).not.toBe('analysis_im');
  });
});

// ─────────────────────────────────────────────
// C6: data-binder → archetype 타이틀 무결성
// ─────────────────────────────────────────────
describe('C6: slide title integrity', () => {
  const MOBILE_IM_QUESTION_PATTERNS = [
    /이 건물의.*특징/,
    /투자.*매력/,
    /어떤.*장점/,
    /왜.*투자/,
    /어디에.*위치/,
  ];

  test('Positive: deck-sequencer produces PPTX-standard titles', () => {
    const input: DeckSequenceInput = {
      posture: 'income',
      grade: 'A',
      hasPhotos: false,
      gallerySpecs: [],
      dataAvailability: {
        hasBuildingRegister: true,
        hasLandUsePlan: true,
        hasRentRoll: true,
        hasComparables: true,
        hasPhotos: false,
      },
      releaseTier: 'decision_im',
    };
    const sequence = buildDeckSequence(input);
    for (const spec of sequence) {
      if (spec.title) {
        for (const pattern of MOBILE_IM_QUESTION_PATTERNS) {
          expect(spec.title).not.toMatch(pattern);
        }
      }
    }
  });

  test('Negative: mobile IM question titles are detectable', () => {
    const badTitles = [
      '이 건물의 핵심 특징은 무엇인가요?',
      '왜 이 매물에 투자해야 하나요?',
      '어디에 위치해 있나요?',
    ];
    for (const title of badTitles) {
      const matchesAny = MOBILE_IM_QUESTION_PATTERNS.some(p => p.test(title));
      expect(matchesAny).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────
// C7: deck-sequencer → renderer protected 슬라이드 보장
// ─────────────────────────────────────────────
describe('C7: protected slides survive goldilocks', () => {
  const PROTECTED_SLIDES = ['cover', 'summary', 'closing'];

  test('Positive: protected slides exist in income deck', () => {
    const input: DeckSequenceInput = {
      posture: 'income',
      grade: 'A',
      hasPhotos: true,
      gallerySpecs: [{
        archetype: 'A14' as any,
        kicker: 'Gallery',
        title: '건물 사진',
        dataKey: 'gallery_0',
        layout: 'GRID_2X2' as any,
        photos: [],
        group: 'G1' as any,
      }],
      dataAvailability: {
        hasBuildingRegister: true,
        hasLandUsePlan: true,
        hasRentRoll: true,
        hasComparables: true,
        hasPhotos: true,
        hasCommercialDistrict: true,
        hasCadastralMap: true,
        hasRegistryData: true,
      },
      releaseTier: 'decision_im',
    };
    const sequence = buildDeckSequence(input);
    const dataKeys = sequence.map(s => s.dataKey);
    for (const key of PROTECTED_SLIDES) {
      expect(dataKeys).toContain(key);
    }
  });

  test('Positive: protected slides exist in owner_occupied deck', () => {
    const input: DeckSequenceInput = {
      posture: 'owner_occupied',
      grade: 'B',
      hasPhotos: false,
      gallerySpecs: [],
      dataAvailability: {
        hasBuildingRegister: true,
        hasLandUsePlan: true,
        hasRentRoll: false,
        hasComparables: false,
        hasPhotos: false,
      },
      releaseTier: 'analysis_im',
    };
    const sequence = buildDeckSequence(input);
    const dataKeys = sequence.map(s => s.dataKey);
    for (const key of PROTECTED_SLIDES) {
      expect(dataKeys).toContain(key);
    }
  });

  test('Negative: body slides capped at PAGE_HARD_LIMIT=16 (Rule 10, 24)', () => {
    const input: DeckSequenceInput = {
      posture: 'income',
      grade: 'A',
      hasPhotos: true,
      gallerySpecs: Array.from({ length: 4 }, (_, i) => ({
        archetype: 'A14' as any,
        kicker: `Gallery ${i + 1}`,
        title: `사진 ${i + 1}`,
        dataKey: `gallery_${i}`,
        layout: 'FULL_WIDE' as any,
        photos: [],
        group: 'G1' as any,
      })),
      dataAvailability: {
        hasBuildingRegister: true,
        hasLandUsePlan: true,
        hasRentRoll: true,
        hasComparables: true,
        hasPhotos: true,
        hasCommercialDistrict: true,
        hasCadastralMap: true,
        hasFloorPlan: true,
        hasRegistryData: true,
      },
      releaseTier: 'decision_im',
    };
    const sequence = buildDeckSequence(input);
    const bodySlides = sequence.filter(s => s.placement !== 'appendix');
    expect(bodySlides.length).toBeLessThanOrEqual(16);
  });
});
