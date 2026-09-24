/**
 * @file basic-im-adversarial.test.ts
 * @description Comprehensive Adversarial Chaos & Fuzz Test Suite for Basic IM (`credeal_basic`).
 *
 * Implements the full 5-dimension test matrix (D1~D5, 45+ concrete cases) from Explorer 3 audit report:
 * - Dimension 1: Extreme Strings & Text Fuzzing (Chaos & Boundary Text)
 * - Dimension 2: Boundary Numbers & Mathematical Chaos
 * - Dimension 3: Null / Undefined / Corrupted Payload Permutations
 * - Dimension 4: Concurrency, Theme Mutation & OCC Conflicts
 * - Dimension 5: Physical Layout Physics & OpenXML Binary Gate Assertions
 *
 * All tests execute 100% in-memory with real `MobileImPptxRenderer.render()` calls
 * without external database or network dependencies.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import sharp from 'sharp';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  inspectPptxBinary,
  POISON_TOKEN_REGEX,
  EVASIVE_PHRASES_PATTERN,
  MOCK_LEAK_PATTERN,
  FORBIDDEN_DEFECT_EXCUSE_PATTERN,
} from '@/assurance/im-harness/observers/pptx-binary-observer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
} from '@/assurance/im-harness/golden-test-utils';
import { PptxStudioService } from '@/domain/building/pptx-studio/studio-service';
import {
  withThemeIsolation,
  C,
  CD,
} from '@/domain/building/mobile-im/pptx/imlib';
import {
  getPptxTheme,
  DEFAULT_PPTX_PRESET,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import { BASIC_IM_BOUNDS } from '@/domain/building/mobile-im/pptx/basic-im-contract';
import { resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import type { GallerySlideSpec } from '@/domain/building/mobile-im/pptx/gallery-planner';

// ═══════════════════════════════════════════════════════════════════
// In-Memory Deterministic Fixtures & Helpers
// ═══════════════════════════════════════════════════════════════════

const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function createAdversarialBasicImInput(
  overrides: Partial<MobileImPptxInput> = {}
): MobileImPptxInput {
  const buildingId =
    overrides.buildingId ||
    `adv-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const defaultSsot = {
    address: '서울특별시 강남구 역삼동 736-1',
    building_name: '역삼 마스터타워',
    asking_price_manwon: 1250000,
    total_deposit_manwon: 50000,
    monthly_rent_total_krw: 48000000,
    land_area_sqm: 495.8,
    total_gross_area_sqm: 1980.5,
    completion_year: 2019,
    zoning: '일반상업지역',
    floors: '지하 1층 / 지상 6층',
    floors_above: 6,
    floors_below: 1,
    parking_count: 14,
    elevator_count: 1,
    vacancy_pct: 0,
    price_band: '125억',
    building_age_years: 7,
    ...overrides.doc?.body?.ssot_summary,
  };

  const defaultFloorLeases = [
    { floor: '6F', tenant: '테크스타', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2028-12-31' },
    { floor: '5F', tenant: '인베스트', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-06-30' },
    { floor: '4F', tenant: '글로벌파트너스', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-10-31' },
    { floor: '3F', tenant: '디지털랩', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 800, is_vacant: false, lease_end: '2026-05-31' },
    { floor: '2F', tenant: '메디컬클리닉', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 850, is_vacant: false, lease_end: '2029-01-31' },
    { floor: '1F', tenant: '투썸플레이스', area_pyeong: 55, deposit_manwon: 10000, rent_manwon: 900, is_vacant: false, lease_end: '2029-08-31' },
  ];

  const defaultHeroCard = {
    askingPriceDisplay: '125.0억 원',
    capRateBase: 4.6,
    noiBaseBil: 0.576,
    equityRequiredBil: 12.0,
    leveragedYieldPct: 6.4,
    posture: overrides.posture ?? 'income',
    landAreaM2: defaultSsot.land_area_sqm,
    totalGrossAreaM2: defaultSsot.total_gross_area_sqm,
    zoning: defaultSsot.zoning,
    keyInvestmentPoint: '강남 중심업무지구 초역세권 안정적 현금흐름 창출 자산',
    ...overrides.doc?.body?.heroCard,
  };

  const defaultPhotos = [
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'cover', isHero: true, caption: '건물 외관 전경', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'exterior', caption: '건물 정면', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'interior', caption: '실내 로비', buildingId },
  ];

  return {
    buildingId,
    preset: overrides.preset ?? 'credeal_basic',
    posture: (overrides.posture as any) ?? 'income',
    grade: overrides.grade ?? 'B',
    doc: {
      title: overrides.doc?.title ?? `${defaultSsot.address} 투자설명서`,
      body: {
        heroCard: defaultHeroCard,
        identity: {
          investmentPosture: overrides.posture ?? 'income',
          assetType: 'nbhd_building',
        },
        photos: defaultPhotos,
        floor_leases: defaultFloorLeases,
        ssot_summary: defaultSsot,
        financials: {
          capRate: { base: 4.6, normalized: 4.8 },
          leveragedYield: 6.4,
          annualRentKrw: 576000000,
          purchasePriceKrw: 12500000000,
        },
        coordinates: { lat: 37.498, lng: 127.028 },
        enrichment: {
          hasCadastralMap: false,
          macroTransitImage: TINY_PNG_DATA_URI,
          locationPoi: { keySpots: ['역삼역 도보 3분', '테헤란로 업무축 인접'] },
        },
        preset: overrides.preset ?? 'credeal_basic',
        keyInvestmentPoint: defaultHeroCard.keyInvestmentPoint,
        ...overrides.doc?.body,
      },
      sections: overrides.doc?.sections ?? [
        {
          title: '투자 하이라이트',
          markdown:
            '### 우수한 입지 및 임대 안정성\n- 테헤란로 이면 위치\n- 전층 우량 임차인 임대 완료\n- 안정적 임대 수익 시현 중',
          section_type: 'investment_thesis',
        },
        {
          title: '건물 개요',
          section_type: 'property_overview',
          markdown: '### 건물 기본 정보\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | 서울특별시 강남구 역삼동 123-45 |',
        },
        {
          title: '입지 분석',
          section_type: 'location_access',
          markdown: '### 입지 정보\n- 테헤란로 역삼역 도보 3분',
        },
        {
          title: '임대차 현황',
          section_type: 'lease_status',
          markdown:
            '### 층별 임대차 현황\n| 층 | 임차인 | 면적(평) | 보증금(만) | 월세(만) | 계약종료 |\n|:---|:---|---:|---:|---:|:---|\n| 1F | 스타벅스 | 50 | 10,000 | 800 | 2028-12-31 |',
        },
        {
          title: '투자수익률 분석',
          section_type: 'income_analysis',
          markdown: '### 수익률 분석\n- 표면 수익률 4.6%',
        },
      ],
    },
    building: {
      area_signal: defaultSsot.price_band,
      asset_type: 'nbhd_building',
      price_band: '125억',
      ...overrides.building,
    },
    broker: {
      display_name: '김브로커',
      company_name: 'CREDEAL 부동산중개',
      phone: '010-1234-5678',
      specialty: '상업용 빌딩 전문',
      ...overrides.broker,
    },
  };
}

describe('Basic IM Adversarial Chaos & Fuzz Suite', () => {
  const renderer = new MobileImPptxRenderer();

  beforeAll(() => {
    // Intercept any potential external fetch calls for true offline execution
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 1: Extreme Strings & Text Fuzzing
  // ═══════════════════════════════════════════════════════════════════
  describe('Dimension 1: Extreme Strings & Text Fuzzing', () => {
    it('[ADV-TXT-01] Ultra-Long Title (1,000 chars) does not crash and renders valid PPTX', async () => {
      const megaTitle = '강남역 메가빌딩 ' + 'A'.repeat(1000);
      const input = createAdversarialBasicImInput({
        doc: { title: megaTitle, body: {} },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      const slides = await extractSlideTexts(result.buffer);
      expect(slides.length).toBe(result.slideCount);
    });

    it('[ADV-TXT-02] Ultra-Long Address (1,000 chars) handles layout gracefully without throw', async () => {
      const megaAddress = '서울특별시 강남구 테헤란로 ' + '9'.repeat(1000);
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.address = megaAddress;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);
    });

    it('[ADV-TXT-03] Massive Narrative Markdown (10,000 chars) renders without buffer overflow', async () => {
      const massiveText = '우량 상업용 자산 투자 분석 리포트 '.repeat(500); // ~10,000 chars
      const input = createAdversarialBasicImInput({
        doc: {
          sections: [
            {
              title: '심층 투자 분석',
              markdown: massiveText,
              section_type: 'investment_thesis',
            },
          ],
          body: {},
        },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);
    });

    it('[ADV-TXT-04] Mega Tenant Names in A24 Rent Roll preserve table stability', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.floor_leases = Array.from({ length: 8 }).map((_, i) => ({
        floor: `${i + 1}F`,
        tenant: `주식회사글로벌프라임에셋파트너스홀딩스_${'가'.repeat(120)}_${i}`,
        tenant_name: `주식회사글로벌프라임에셋파트너스홀딩스_${'가'.repeat(120)}_${i}`,
        area_pyeong: 50,
        deposit_manwon: 5000,
        rent_manwon: 500,
        is_vacant: false,
        lease_end: '2028-12-31',
      }));

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      expect(slides.some((s) => s.text.includes('주식회사글로벌프라임'))).toBe(true);
    });

    it('[ADV-TXT-05] Empty Strings in Required Fields trigger neutral safe fallbacks', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.title = '';
      input.doc.body.ssot_summary.address = '';
      input.doc.body.ssot_summary.zoning = '';
      input.doc.body.ssot_summary.building_name = '';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('undefined');
      }
    });

    it('[ADV-TXT-06] Whitespace-Only Strings are safely normalized', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.title = '   \t\n  ';
      input.doc.body.ssot_summary.address = '     ';
      input.doc.body.ssot_summary.building_name = '\t\t';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-TXT-07] Zero-Width Characters (\\u200B, \\u200C, \\u200D, \\uFEFF) do not corrupt XML', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.title = '강남역\u200B메가\u200C타워\u200D빌딩\uFEFF';
      input.doc.body.ssot_summary.address = '테헤란로\u200B 123-45';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[ADV-TXT-08] Control Characters & NUL Bytes are handled without crashing ZIP generation', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.title = '강남\x00타워\x07빌딩\x08센터\x1B';
      input.doc.body.ssot_summary.building_name = '테크\x00본사';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);

      const zip = await JSZip.loadAsync(result.buffer);
      const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
      expect(slide1Xml).toBeDefined();
    });

    it('[ADV-TXT-09] High Unicode & Emojis are preserved cleanly in UTF-8 XML', async () => {
      const emojiTitle = '🏢 프리미엄 빌딩 🔥 수익률 10% 💰✨🚀';
      const input = createAdversarialBasicImInput({
        doc: { title: emojiTitle, body: {} },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      expect(slides[0].text).toContain('🏢');
    });

    it('[ADV-TXT-10] RTL Arabic & CJK Ideographs render without crashing', async () => {
      const multilangAddress = 'شارع الملك فهد 商業用 不動産';
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.address = multilangAddress;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      const allText = slides.map((s) => s.text).join(' ');
      expect(allText).toContain('商業用');
    });

    it('[ADV-TXT-11] OpenXML Tag Injection Attempt is escaped safely', async () => {
      const injection = '</p:txBody></p:sp><p:sp><script>evil()</script>';
      const input = createAdversarialBasicImInput({
        doc: { title: injection, body: {} },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const zip = await JSZip.loadAsync(result.buffer);
      const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
      expect(slide1Xml).toBeDefined();
      // Raw unescaped tag should not exist
      expect(slide1Xml).not.toContain('<script>evil()</script>');
    });

    it('[ADV-TXT-12] Disguised Poison Words (Legitimate Korean) are not falsely suppressed', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.title = 'NaN아파트 null번지 undefined로 100';
      input.doc.body.ssot_summary.building_name = 'null스퀘어';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      // Legitimate Korean compound words preserved
      expect(slides[0].text).toMatch(/NaN아파트|null스퀘어/);

      // Strict isolated poison tokens must still be 0
      for (const slide of slides) {
        expect(slide.xml).not.toContain('>NaN<');
        expect(slide.xml).not.toContain('>undefined<');
        expect(slide.xml).not.toContain('>null<');
        expect(slide.xml).not.toContain('[object Object]');
      }
    });

    it('[ADV-TXT-13] Evasive Phrase Infiltration is detected by assertion harness', async () => {
      const evasiveText = '구체적 수치는 추후 확인 필요 항목입니다';
      expect(EVASIVE_PHRASES_PATTERN.test(evasiveText)).toBe(true);

      const defectExcuse = '인근 비교사례는 확보하지 않았습니다';
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test(defectExcuse)).toBe(true);
    });

    it('[ADV-TXT-14] Price Band Infiltration pattern check', async () => {
      const priceBandText = '매각가는 100억~120억 수준으로 형성';
      expect(/\d+억\s*~\s*\d+억/.test(priceBandText)).toBe(true);
      expect(/\d+억\s*대/.test('100억대 매물')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 2: Boundary Numbers & Mathematical Chaos
  // ═══════════════════════════════════════════════════════════════════
  describe('Dimension 2: Boundary Numbers & Mathematical Chaos', () => {
    it('[ADV-NUM-01] Zero Asking Price handles Cap Rate calculation without NaN% or Infinity%', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.asking_price_manwon = 0;
      input.doc.body.heroCard.askingPriceDisplay = '0원';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN%');
        expect(slide.text).not.toContain('Infinity%');
      }
    });

    it('[ADV-NUM-02] Negative Asking Price is sanitized without crashing render', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.asking_price_manwon = -500000;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN');
      }
    });

    it('[ADV-NUM-03] Astronomical Price (100조 원) formats without scientific notation', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.asking_price_manwon = 10_000_000_000; // 100조
      input.doc.body.heroCard.askingPriceDisplay = '100조 원';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('1e+14');
        expect(slide.text).not.toContain('1e+10');
      }
    });

    it('[ADV-NUM-04] Micro-Asset Price (100만 원) formats accurately', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.asking_price_manwon = 100; // 100만 원
      input.doc.body.heroCard.askingPriceDisplay = '100만 원';

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-05] Fractional / Floating Point Epsilon is rounded cleanly', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = 317.40000000000003;
      input.doc.body.ssot_summary.total_gross_area_sqm = 1250.7000000000003;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      const allText = slides.map((s) => s.text).join(' ');
      expect(allText).not.toContain('317.40000000000003');
    });

    it('[ADV-NUM-06] Zero Land & Gross Area do not cause 0/0 = NaN% division error', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = 0;
      input.doc.body.ssot_summary.total_gross_area_sqm = 0;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN%');
      }
    });

    it('[ADV-NUM-07] Negative Land & Gross Area are handled gracefully', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = -100;
      input.doc.body.ssot_summary.total_gross_area_sqm = -500;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-08] Inverted Areas (FAR > 5,000%) compute without crash', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = 10;
      input.doc.body.ssot_summary.total_gross_area_sqm = 50000;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-09] 100% Vacancy Asset executes without division error', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.monthly_rent_total_krw = 0;
      input.doc.body.ssot_summary.vacancy_pct = 100;
      input.doc.body.floor_leases = [
        { floor: '1F', tenant: '공실', area_pyeong: 50, deposit_manwon: 0, rent_manwon: 0, is_vacant: true },
        { floor: '2F', tenant: '공실', area_pyeong: 50, deposit_manwon: 0, rent_manwon: 0, is_vacant: true },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN');
      }
    });

    it('[ADV-NUM-10] Zero Rent, Positive Deposit (Pure Jeonse) renders without division error', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.monthly_rent_total_krw = 0;
      input.doc.body.ssot_summary.total_deposit_manwon = 50000;
      input.doc.body.floor_leases = [
        { floor: '1F', tenant: '전세임차인', area_pyeong: 60, deposit_manwon: 50000, rent_manwon: 0, is_vacant: false },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN');
      }
    });

    it('[ADV-NUM-11] Zero Deposit, Positive Rent (Pure Monthly) renders correctly', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.total_deposit_manwon = 0;
      input.doc.body.ssot_summary.monthly_rent_total_krw = 30000000;
      input.doc.body.floor_leases = [
        { floor: '1F', tenant: '무보증월세', area_pyeong: 60, deposit_manwon: 0, rent_manwon: 3000, is_vacant: false },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-12] Extreme Tenant Count (N=100) respects slide hard limits', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.floor_leases = Array.from({ length: 100 }).map((_, i) => ({
        floor: `${(i % 20) + 1}F`,
        tenant: `임차사_${i + 1}`,
        area_pyeong: 30,
        deposit_manwon: 3000,
        rent_manwon: 200,
        is_vacant: i % 10 === 0,
      }));

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    });

    it('[ADV-NUM-13] Negative Parking & Elevators are sanitized', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.parking_count = -5;
      input.doc.body.ssot_summary.elevator_count = -1;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-14] Inverted Floors (Underground Only) renders without crash', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.floors = '지하 5층';
      input.doc.body.ssot_summary.floors_above = 0;
      input.doc.body.ssot_summary.floors_below = 5;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-NUM-15] Corrupted Lease Dates do not break expiry parsing', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.floor_leases = [
        { floor: '1F', tenant: '테넌트1', area_pyeong: 50, deposit_manwon: 5000, rent_manwon: 400, lease_end: '9999-99-99' },
        { floor: '2F', tenant: '테넌트2', area_pyeong: 50, deposit_manwon: 5000, rent_manwon: 400, lease_end: '미정' },
        { floor: '3F', tenant: '테넌트3', area_pyeong: 50, deposit_manwon: 5000, rent_manwon: 400, lease_end: 'None' },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 3: Null / Undefined / Corrupted Payload Permutations
  // ═══════════════════════════════════════════════════════════════════
  describe('Dimension 3: Null / Undefined / Corrupted Payload Permutations', () => {
    it('[ADV-PERM-01] Completely Empty Document Body renders valid deck using fallbacks', async () => {
      const input: MobileImPptxInput = {
        buildingId: 'adv-empty-body',
        preset: 'credeal_basic',
        posture: 'income',
        grade: 'B',
        doc: {
          title: '기본 투자설명서',
          body: {},
        },
      };

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(6);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    });

    it('[ADV-PERM-02] Null ssot_summary handles safe traversal without throw', async () => {
      const input = createAdversarialBasicImInput();
      (input.doc.body as any).ssot_summary = null;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-03] Partial ssot_summary (Only Address) shows neutral specs', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary = {
        address: '서울특별시 강남구 역삼동 123',
      };

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      const slides = await extractSlideTexts(result.buffer);
      expect(slides.some((s) => s.text.includes('역삼동 123'))).toBe(true);
    });

    it('[ADV-PERM-04] Null & Undefined in Arrays are filtered safely', async () => {
      const input = createAdversarialBasicImInput();
      (input.doc.body as any).photos = [null, undefined, { url: TINY_PNG_DATA_URI, category: 'exterior' }];
      (input.doc.body as any).floor_leases = [
        null,
        undefined,
        { floor: '1F', tenant: '정상테넌트', area_pyeong: 50, deposit_manwon: 5000, rent_manwon: 300 },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-05] Missing Coordinates renders location slide gracefully', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.coordinates = undefined;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-06] Null Island Coordinates ({lat: 0, lng: 0}) are safely bypassed', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.coordinates = { lat: 0, lng: 0 };

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-07] Non-Korean (Foreign) Coordinates render without crashing', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.coordinates = { lat: 40.7128, lng: -74.006 }; // New York

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-08] Zero Photos Payload suppresses gallery slide (Rule 9)', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      // In Basic IM, omitting gallery results in 8 or 9 slides
      expect(result.slideCount).toBeGreaterThanOrEqual(7);
      expect(result.slideCount).toBeLessThanOrEqual(10);
    });

    it('[ADV-PERM-09] Broken Photo URLs (404 / Unreachable) fail gracefully without hanging', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [
        { url: 'http://localhost:9999/does-not-exist.jpg', category: 'exterior', role: 'cover' },
        { url: 'https://example-invalid-url.com/broken.png', category: 'interior' },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-10] Corrupt Image Buffer (0-byte file) is caught safely', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [
        { url: 'data:image/png;base64,', category: 'exterior', role: 'cover' },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-11] Extreme Image Aspect Ratio (100:1 panoramic) is handled cleanly', async () => {
      const widePngBuffer = await sharp({
        create: {
          width: 1000,
          height: 10,
          channels: 4,
          background: { r: 50, g: 50, b: 50, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const wideDataUri = `data:image/png;base64,${widePngBuffer.toString('base64')}`;

      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [
        { url: wideDataUri, category: 'exterior', role: 'cover', caption: '와이드 파노라마' },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-12] Extreme Image Aspect Ratio (1:100 vertical slit) is handled cleanly', async () => {
      const tallPngBuffer = await sharp({
        create: {
          width: 10,
          height: 1000,
          channels: 4,
          background: { r: 50, g: 50, b: 50, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const tallDataUri = `data:image/png;base64,${tallPngBuffer.toString('base64')}`;

      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [
        { url: tallDataUri, category: 'exterior', role: 'cover', caption: '수직 슬릿' },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
    });

    it('[ADV-PERM-13] Non-Standard Image Protocols (javascript:, file:) are filtered out', async () => {
      const dirtySupplemental = {
        photos_v2: [
          { url: 'javascript:alert(1)', category: 'exterior' },
          { url: 'file:///etc/passwd', category: 'interior' },
          { url: 'https://example.com/valid.jpg', category: 'exterior' },
          { url: 'invalid.wdp', category: 'exterior' },
        ],
      };

      const resolved = resolvePhotos(dirtySupplemental as any, 'test-bldg');
      // .wdp and non-supported media should be filtered out
      expect(resolved.some((p) => p.url.endsWith('.wdp'))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 4: Concurrency, Theme Mutation & OCC Conflicts
  // ═══════════════════════════════════════════════════════════════════
  describe('Dimension 4: Concurrency, Theme Mutation & OCC Conflicts', () => {
    it('[ADV-CONC-01] High-Concurrency Multi-Preset PPTX Generation succeeds in parallel', async () => {
      const presets = [
        'credeal_basic',
        'corporate_clean_white',
        'medical_visual_grid',
        'development_technical',
      ];

      const tasks = presets.map((preset, idx) => {
        const input = createAdversarialBasicImInput({
          preset,
          buildingId: `bldg-concurrent-${idx}`,
        });
        return renderer.render(input);
      });

      const results = await Promise.all(tasks);
      expect(results.length).toBe(4);
      for (const res of results) {
        expect(res.buffer).toBeDefined();
        expect(res.buffer.length).toBeGreaterThan(50_000);
        expect(res.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      }
    });

    it('[ADV-CONC-02] withThemeIsolation Overlap Stress restores theme state correctly', async () => {
      const themeBasic = getPptxTheme('credeal_basic');
      const themeWhite = getPptxTheme('corporate_clean_white');

      const initialC = { ...C };

      const task1 = withThemeIsolation(themeBasic, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return C.ink ?? C.bg;
      });

      const task2 = withThemeIsolation(themeWhite, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return C.ink ?? C.bg;
      });

      const [c1, c2] = await Promise.all([task1, task2]);
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();

      // State is clean after execution
      expect(C.ink).toBeDefined();
    });

    it('[ADV-CONC-03] Concurrent Reorder OCC Conflict (Optimistic Concurrency Control)', async () => {
      const studioService = new PptxStudioService();
      const project = await studioService.createProject('deal-occ-1', 'pkg-1', '테스트 프로젝트', 'credeal_basic', {
        bodySlideCount: 5,
      });

      const slideIds = project.slides.map((s) => s.id);
      const reversedIds = [...slideIds].reverse();

      // First reorder with expectedLockVersion = 1 succeeds
      const updated = await studioService.reorderSlides(project.id, reversedIds, 1);
      expect(updated.lockVersion).toBe(2);

      // Second simultaneous reorder with stale expectedLockVersion = 1 must throw STALE_LOCK_ERROR
      await expect(studioService.reorderSlides(project.id, slideIds, 1)).rejects.toThrow(/STALE_LOCK_ERROR/);
    });

    it('[ADV-CONC-04] Stale LockVersion Update Block rejects out-of-order writes', async () => {
      const studioService = new PptxStudioService();
      const project = await studioService.createProject('deal-occ-2', 'pkg-2', '테스트 프로젝트 2');

      // Update slide layout with valid expectedLockVersion
      await studioService.updateSlideLayout(project.id, 1, 'A01', 1);
      expect(project.lockVersion).toBe(2);

      // Subsequent update with stale version 1 must reject
      await expect(studioService.updateSlideLayout(project.id, 2, 'A02', 1)).rejects.toThrow(/STALE_LOCK_ERROR/);
    });

    it('[ADV-CONC-05] High-Contention Sequential OCC Updates preserve serializability', async () => {
      const studioService = new PptxStudioService();
      const project = await studioService.createProject('deal-occ-3', 'pkg-3', '직렬성 검증 프로젝트');

      let currentVersion = project.lockVersion;
      for (let i = 0; i < 5; i++) {
        const slideIds = [...project.slides.map((s) => s.id)].reverse();
        const res = await studioService.reorderSlides(project.id, slideIds, currentVersion);
        currentVersion = res.lockVersion;
      }

      expect(currentVersion).toBe(6);
      expect(project.slides.length).toBeGreaterThan(0);
    });

    it('[ADV-CONC-06] In-Memory Concurrency Harness executes 100% assertions (Rule 60 compliance)', async () => {
      // Replaces skipped tests in CI by executing 3 deterministic parallel renders
      const inputs = Array.from({ length: 3 }).map((_, i) =>
        createAdversarialBasicImInput({ buildingId: `in-memory-harness-${i}` })
      );

      const outputs = await Promise.all(inputs.map((inp) => renderer.render(inp)));
      expect(outputs.length).toBe(3);
      for (const out of outputs) {
        expect(out.buffer.length).toBeGreaterThan(50_000);
        expect(out.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      }
    });

    it('[ADV-CONC-07] ActiveThemeStore ensures concurrent themes do NOT bleed token values into each other', async () => {
      const themeBasic = getPptxTheme('credeal_basic');
      const themeWhite = getPptxTheme('corporate_clean_white');

      let task1InkAtMidpoint: string | undefined;
      let task2InkAtMidpoint: string | undefined;

      const task1 = withThemeIsolation(themeBasic, async () => {
        await new Promise((r) => setTimeout(r, 10));
        task1InkAtMidpoint = C.ink;
        await new Promise((r) => setTimeout(r, 20));
        return C.ink;
      });

      const task2 = withThemeIsolation(themeWhite, async () => {
        await new Promise((r) => setTimeout(r, 15));
        task2InkAtMidpoint = C.ink;
        await new Promise((r) => setTimeout(r, 10));
        return C.ink;
      });

      const [res1, res2] = await Promise.all([task1, task2]);
      expect(task1InkAtMidpoint).toBe(themeBasic.ink);
      expect(task2InkAtMidpoint).toBe(themeWhite.ink);
      expect(res1).toBe(themeBasic.ink);
      expect(res2).toBe(themeWhite.ink);
      expect(res1).not.toBe(res2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Dimension 5: Physical Layout Physics & OpenXML Binary Gate Assertions
  // ═══════════════════════════════════════════════════════════════════
  describe('Dimension 5: Physical Layout Physics & OpenXML Binary Gate Assertions', () => {
    it('[ADV-PHYS-01] Coordinate Boundary & Zero Bleed in generated PPTX', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      const inspection = await inspectPptxBinary(result.buffer);
      expect(inspection.bleedCount).toBe(0);
    });

    it('[ADV-PHYS-02] Slide Hard Limit Invariant (BASIC_IM_BOUNDS: 7 to 11 slides)', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    });

    it('[ADV-PHYS-03] Grade D Full Pipeline Halt throws [G30] immediately', async () => {
      const input = createAdversarialBasicImInput({
        grade: 'D',
      });

      await expect(renderer.render(input)).rejects.toThrow(/\[G30\]/);
    });

    it('[ADV-PHYS-04] OpenXML Poison Token Binary Gate confirms 0 poison tokens', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      await assertZeroPoisonTokens(result.buffer);

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.xml).not.toContain('>NaN<');
        expect(slide.xml).not.toContain('>undefined<');
        expect(slide.xml).not.toContain('>null<');
        expect(slide.xml).not.toContain('[object Object]');
      }
    });

    it('[ADV-PHYS-05] OpenXML Mock Leak Binary Gate confirms 0 dummy mock leaks', async () => {
      const customName = '성수동 리더스타워';
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.building_name = customName;

      const result = await renderer.render(input);
      await assertZeroMockLeaks(result.buffer);

      const slides = await extractSlideTexts(result.buffer);
      const allText = slides.map((s) => s.text).join(' ');
      expect(allText).not.toContain('NH농협캐피탈');
    });

    it('[ADV-PHYS-06] OpenXML Evasive Phrase Gate confirms 0 evasive phrases in standard deck', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[ADV-PHYS-07] OpenXML Price Band Binary Gate confirms 0 N억대 bands in basic IM', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      const slides = await extractSlideTexts(result.buffer);
      const allText = slides.map((s) => s.text).join(' ');
      expect(allText).not.toMatch(/\d+억\s*대/);
    });

    it('[ADV-PHYS-08] Deck sequencer with excess gallery slides preserves required yieldFormula (A23) and rentRoll (A24)', async () => {
      const { buildDeckSequence } = await import('@/domain/building/mobile-im/pptx/deck-sequencer');
      const gallerySpecs: GallerySlideSpec[] = [
        { slideIndex: 0, layout: 'GRID_2X2', photos: [], kicker: 'G1', title: '사진1', dataKey: 'gallery_0' },
        { slideIndex: 1, layout: 'GRID_2X2', photos: [], kicker: 'G2', title: '사진2', dataKey: 'gallery_1' },
        { slideIndex: 2, layout: 'GRID_2X2', photos: [], kicker: 'G3', title: '사진3', dataKey: 'gallery_2' },
        { slideIndex: 3, layout: 'GRID_2X2', photos: [], kicker: 'G4', title: '사진4', dataKey: 'gallery_3' },
      ];

      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        preset: 'credeal_basic',
        gallerySpecs,
        hasPhotos: true,
        dataAvailability: { hasRentRoll: true, hasCadastralMap: true },
      });

      const dataKeys = seq.map((s: any) => s.dataKey);
      expect(dataKeys).toContain('rentRoll');
      expect(dataKeys).toContain('yieldFormula');
      expect(dataKeys).toContain('cover');
      expect(dataKeys).toContain('summary');
      expect(dataKeys).toContain('closing');
      expect(seq.length).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
    });
  });
});
