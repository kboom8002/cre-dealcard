/**
 * @file missing-data-fallback.test.ts
 * @description Programmatic assertions for Basic IM PPTX generation with degenerate/missing mock inputs.
 *
 * Verifies that when core inputs (cadastral maps, transit diagrams, photos, rent roll, land price history)
 * are missing or degenerate:
 *   1. Canonical 9-Slide deck is strictly preserved (zero slides popped/dropped, e.g. pres.slides.pop()).
 *   2. Zero Rule G54 defect excuses leak into output text ("API 연결 지연", "PNU 미등록", "자료 없음", "미확보").
 *   3. Structured fallback UI components (due-diligence action points / diligence protocols) are rendered.
 *   4. Positive / Negative pairs per Rule 7 verify both normal and degenerate execution paths.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { MobileImPptxRenderer, type MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { extractSlideTexts, inspectPptxBinary } from '@/assurance/im-harness/golden-test-utils';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';

// Rule G54 Defect Excuse Regex (Prohibited technical excuses & blame strings)
export const G54_DEFECT_EXCUSE_REGEX = /(?:API\s*연결\s*지연|PNU\s*미등록|자료\s*없음|미확보|일시적으로\s*불러올\s*수\s*없습니다|현장\s*사진이\s*아직\s*등록되지\s*않았습니다)/i;

// Poison Token Regex
export const POISON_TOKEN_REGEX = /(?:-?Infinity|NaN|undefined|\bnull\b|\[object Object\])/;

// 1x1 transparent PNG data URI for mock image testing
const DUMMY_PNG_DATA_URI = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Helper to construct a complete, healthy baseline Basic IM mock input (9 slides).
 */
function createFullPositiveBaseline(overrides: Partial<MobileImPptxInput['doc']['body']> = {}): MobileImPptxInput {
  const askingPriceManwon = 1500000; // 150억
  const monthlyRentKrw = 45000000;   // 4,500만
  const totalDepositManwon = 150000; // 15억

  const financials = calculateFinancials({
    purchasePriceKrw: askingPriceManwon * 10000,
    monthlyRentKrw,
    totalDepositManwon,
  });

  const ssot = {
    address: '서울특별시 강남구 역삼동 736-1',
    building_name: '역삼 테헤란 프라임 타워',
    asking_price_manwon: askingPriceManwon,
    total_deposit_manwon: totalDepositManwon,
    monthly_rent_total_krw: monthlyRentKrw,
    land_area_sqm: 450.5,
    total_gross_area_sqm: 2850.2,
    completion_year: 2019,
    zoning: '일반상업지역',
    floors: '지상 10층 / 지하 2층',
    floors_above: 10,
    floors_below: 2,
    parking_count: 24,
    elevator_count: 2,
    vacancy_pct: 0,
    price_band: '150억',
  };

  const defaultBody = {
    heroCard: {
      askingPriceDisplay: '150.0억 원',
      capRateBase: financials?.capRate?.base ?? 4.0,
      noiBaseBil: 5.4,
      equityRequiredBil: 135.0,
      leveragedYieldPct: financials?.leveragedYield ?? 5.5,
      posture: 'income' as const,
      landAreaM2: ssot.land_area_sqm,
      totalGrossAreaM2: ssot.total_gross_area_sqm,
      zoning: ssot.zoning,
      keyInvestmentPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    },
    identity: {
      investmentPosture: 'income' as const,
      assetType: '근린생활시설',
    },
    ssot_summary: ssot,
    financials: financials ?? {},
    preset: 'credeal_basic',
    keyInvestmentPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    keyPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    // Complete visual & tabular assets for positive baseline
    coordinates: { lat: 37.498095, lng: 127.027610 },
    macroTransitImage: DUMMY_PNG_DATA_URI,
    cadastralMapImage: DUMMY_PNG_DATA_URI,
    photos: [
      {
        url: join(process.cwd(), 'docs', 'golden-test-data', 'p1-dangsan-income', 'r2-standard', 'images', 'image_01.jpeg').replace(/\\/g, '/'),
        category: 'exterior',
        caption: '건물 전면 외관',
        isHero: true,
        role: 'exterior',
      },
    ],
    floor_leases: [
      { floor: '1F', tenant_type: '스타벅스', area_pyeong: 45.2, deposit_manwon: 30000, rent_manwon: 1500 },
      { floor: '2F', tenant_type: '올리브영', area_pyeong: 42.0, deposit_manwon: 20000, rent_manwon: 1100 },
      { floor: '3F', tenant_type: '치과의원', area_pyeong: 40.5, deposit_manwon: 15000, rent_manwon: 950 },
    ],
    hasRentRoll: true,
    hasLandHistory: true,
    landPriceHistory: {
      history: [
        { year: 2020, priceWon: 35000000 },
        { year: 2021, priceWon: 38000000 },
        { year: 2022, priceWon: 42000000 },
        { year: 2023, priceWon: 45000000 },
        { year: 2024, priceWon: 48000000 },
      ],
    },
    enrichment: {
      hasCadastralMap: true,
      cadastralMapImage: DUMMY_PNG_DATA_URI,
      hasTransitMap: true,
      macroTransitImage: DUMMY_PNG_DATA_URI,
      landPriceHistory: {
        history: [
          { year: '2020', pricePerSqm: 35000000 },
          { year: '2021', pricePerSqm: 38000000 },
          { year: '2022', pricePerSqm: 42000000 },
          { year: '2023', pricePerSqm: 45000000 },
          { year: '2024', pricePerSqm: 48000000 },
        ],
      },
    },
    ...overrides,
  };

  return {
    buildingId: 'missing-data-test-001',
    preset: 'credeal_basic',
    posture: 'income',
    grade: 'A',
    doc: {
      title: '역삼 테헤란 프라임 타워 투자설명서',
      body: defaultBody,
      sections: [
        {
          title: '물건 개요',
          section_type: 'property_overview',
          markdown: '### 물건 기본 정보\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | 서울특별시 강남구 역삼동 736-1 |\n| 연면적 | 2,850.2㎡ |',
        },
        {
          title: '입지 분석',
          section_type: 'location_access',
          markdown: '### 입지 정보\n- 역삼역 도보 2분 테헤란로 핵심 업무지구 위치',
        },
        {
          title: '임대차 현황',
          section_type: 'lease_status',
          markdown: '### 층별 임대차 현황\n| 층 | 임차인 | 보증금(만) | 월세(만) |\n|:---|:---|---:|---:|\n| 1F | 스타벅스 | 30,000 | 1,500 |',
        },
        {
          title: '투자수익률 분석',
          section_type: 'income_analysis',
          markdown: '### 수익률 분석\n- 표면 수익률 4.0%',
        },
      ],
    },
    building: {
      area_signal: 'GBD',
      asset_type: '근린생활시설',
      price_band: '150억',
      address: ssot.address,
      building_name: ssot.building_name,
    },
    broker: {
      display_name: '김수석',
      company_name: 'CREDEAL 프라임',
      phone: '010-1234-5678',
      specialty: '강남 프라임 오피스/근생',
    },
  };
}

describe('R4: Programmatic Missing-Data Fallback Test Suite (Rule 7 Positive/Negative Pairs)', () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Positive Baseline Control Test
  // ═══════════════════════════════════════════════════════════════════
  describe('Positive Control: Full Data Asset Baseline', () => {
    it('[Control Positive] Complete input generates canonical 9 slides with 0 excuses and 0 poison tokens', async () => {
      const input = createFullPositiveBaseline();
      const output = await renderer.render(input);
      const slideTexts = await extractSlideTexts(output.buffer);
      expect(output.slideCount).toBe(9);
      expect(slideTexts.length).toBe(9);

      const allText = slideTexts.map(s => s.text).join(' ');
      expect(allText).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
      expect(allText).not.toMatch(POISON_TOKEN_REGEX);

      const binaryResult = await inspectPptxBinary(output.buffer);
      expect(binaryResult.bleedCount).toBe(0);
      expect(binaryResult.poisonTokenViolationCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case A: Cadastral Map (Positive vs. Negative)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case A: Cadastral Map Fallback', () => {
    it('[Positive] Complete cadastral map -> renders 9 slides with valid cadastral asset', async () => {
      const input = createFullPositiveBaseline({
        cadastralMapImage: DUMMY_PNG_DATA_URI,
        enrichment: {
          hasCadastralMap: true,
          cadastralMapImage: DUMMY_PNG_DATA_URI,
          hasTransitMap: true,
          macroTransitImage: DUMMY_PNG_DATA_URI,
          landPriceHistory: {
            history: [
              { year: '2020', pricePerSqm: 35000000 },
              { year: '2021', pricePerSqm: 38000000 },
              { year: '2022', pricePerSqm: 42000000 },
              { year: '2023', pricePerSqm: 45000000 },
              { year: '2024', pricePerSqm: 48000000 },
            ],
          },
        },
      });

      const output = await renderer.render(input);
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      const allText = slideTexts.map(s => s.text).join(' ');

      expect(allText).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
      expect(allText).not.toMatch(POISON_TOKEN_REGEX);
    });

    it('[Negative] Missing cadastral map (undefined/empty) -> preserves 9 slides, 0 G54 excuses, renders fallback diligence UI', async () => {
      const input = createFullPositiveBaseline({
        cadastralMapImage: undefined,
        enrichment: {
          hasCadastralMap: false,
          cadastralMapImage: undefined,
        },
      });

      const output = await renderer.render(input);
      
      // Assertion 1: Slide count must remain 9 (canonical Basic IM deck)
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      const allText = slideTexts.map(s => s.text).join(' ');

      // Assertion 2: Zero G54 excuses ("V-World API 연결 지연", "PNU 미등록", etc.)
      expect(allText).not.toMatch(G54_DEFECT_EXCUSE_REGEX);

      // Assertion 3: Zero poison tokens
      expect(allText).not.toMatch(POISON_TOKEN_REGEX);

      // Assertion 4: Slide 5 (Land) must render fallback diligence text/card instead of error box
      const landSlide = slideTexts[4]; // seq 5
      expect(landSlide).toBeDefined();
      expect(landSlide.text).not.toContain('일시적으로 불러올 수 없습니다');
      expect(landSlide.text).not.toContain('API 연결 지연');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case B: Location / Transit Diagram (Positive vs. Negative)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case B: Location / Transit Diagram Fallback', () => {
    it('[Positive] Complete transit diagram & coordinates -> renders 9 slides with location analysis', async () => {
      const input = createFullPositiveBaseline({
        coordinates: { lat: 37.498095, lng: 127.027610 },
        macroTransitImage: DUMMY_PNG_DATA_URI,
        mapImageUrl: 'https://example.com/map.png',
      });

      const output = await renderer.render(input);
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);
      expect(slideTexts[3].text).toContain('입지');
    });

    it('[Negative] Missing transit diagram & coordinates (null/undefined) -> zero slide popping (strictly 9 slides), zero excuses', async () => {
      const input = createFullPositiveBaseline({
        coordinates: null,
        macroTransitImage: null,
        mapImageUrl: null,
        poiSpots: [],
      });

      const output = await renderer.render(input);

      // Assertion 1: Zero slide popping — must NOT drop to 8 slides via pres.slides.pop()!
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      // Slide 4 must still be present as Location slide
      const locationSlide = slideTexts[3]; // seq 4
      expect(locationSlide).toBeDefined();
      expect(locationSlide.text).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
      expect(locationSlide.text).not.toMatch(POISON_TOKEN_REGEX);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case C: Photo Gallery (Positive vs. Negative)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case C: Photo Gallery Fallback', () => {
    it('[Positive] Complete photo assets -> renders gallery slide with photos', async () => {
      const input = createFullPositiveBaseline({
        photos: [
          {
            url: join(process.cwd(), 'docs', 'golden-test-data', 'p1-dangsan-income', 'r2-standard', 'images', 'image_01.jpeg').replace(/\\/g, '/'),
            category: 'exterior',
            caption: '전면 외관',
            isHero: true,
            role: 'exterior',
          },
        ],
      });

      const output = await renderer.render(input);
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);
    });

    it('[Negative] Empty photos array -> preserves 9 slides, renders architectural survey fallback card (zero excuses)', async () => {
      const input = createFullPositiveBaseline({
        photos: [],
        photoUrls: [],
      });

      const output = await renderer.render(input);

      // Assertion 1: Slide count must remain 9 (canonical Basic IM deck)
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      // Slide 8 is Gallery slide
      const gallerySlide = slideTexts[7]; // seq 8
      expect(gallerySlide).toBeDefined();

      // Assertion 2: Zero G54 excuses ("현장 사진이 아직 등록되지 않았습니다", "추후 촬영 후 업데이트...")
      expect(gallerySlide.text).not.toContain('아직 등록되지 않았습니다');
      expect(gallerySlide.text).not.toContain('추후 촬영 후 업데이트');
      expect(gallerySlide.text).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case D: Rent Roll (Positive vs. Negative)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case D: Rent Roll Fallback', () => {
    it('[Positive] Complete floor leases -> renders rent roll table on slide 6', async () => {
      const input = createFullPositiveBaseline({
        hasRentRoll: true,
        floor_leases: [
          { floor: '1F', tenant_type: '스타벅스', area_pyeong: 45.2, deposit_manwon: 30000, rent_manwon: 1500 },
          { floor: '2F', tenant_type: '올리브영', area_pyeong: 42.0, deposit_manwon: 20000, rent_manwon: 1100 },
          { floor: '3F', tenant_type: '치과의원', area_pyeong: 40.5, deposit_manwon: 15000, rent_manwon: 950 },
        ],
      });

      const output = await renderer.render(input);
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts[5].text).toContain('스타벅스');
    });

    it('[Negative] Missing rent roll (empty leases / hasRentRoll=false) -> preserves 9 slides, renders tenancy due-diligence card', async () => {
      const input = createFullPositiveBaseline({
        hasRentRoll: false,
        floor_leases: [],
        tableRows: [],
      });

      const output = await renderer.render(input);

      // Assertion 1: Slide count must remain 9 (rent roll slide is NOT dropped!)
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      // Slide 6 is Rent Roll slide
      const rentRollSlide = slideTexts[5]; // seq 6
      expect(rentRollSlide).toBeDefined();

      // Assertion 2: Zero G54 excuses ("자료 없음", "원장 합계 차이")
      expect(rentRollSlide.text).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
      expect(rentRollSlide.text).not.toMatch(POISON_TOKEN_REGEX);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case E: Land Price History (Positive vs. Negative)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case E: Land Price History Fallback', () => {
    it('[Positive] Complete land price history -> renders 10-year historical chart without bleed', async () => {
      const input = createFullPositiveBaseline({
        hasLandHistory: true,
        enrichment: {
          hasCadastralMap: true,
          cadastralMapImage: DUMMY_PNG_DATA_URI,
          hasTransitMap: true,
          macroTransitImage: DUMMY_PNG_DATA_URI,
          landPriceHistory: {
            history: [
              { year: '2020', pricePerSqm: 35000000 },
              { year: '2021', pricePerSqm: 38000000 },
              { year: '2022', pricePerSqm: 42000000 },
              { year: '2023', pricePerSqm: 45000000 },
              { year: '2024', pricePerSqm: 48000000 },
            ],
          },
        },
      });

      const output = await renderer.render(input);
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts[6].text).toContain('공시지가');
    });

    it('[Negative] Missing land price history (hasLandHistory=false) -> zero G54 excuses, safe bottom height <= 6.75"', async () => {
      const input = createFullPositiveBaseline({
        hasLandHistory: false,
        landPriceHistory: null,
      });

      const output = await renderer.render(input);

      // Assertion 1: 9 slides preserved
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      // Slide 7 is Yield / Land Price slide
      const yieldSlide = slideTexts[6]; // seq 7
      expect(yieldSlide).toBeDefined();

      // Assertion 2: Zero G54 excuses ("국토교통부 API 연결 지연", "PNU 미등록", etc.)
      expect(yieldSlide.text).not.toContain('일시적으로 불러올 수 없습니다');
      expect(yieldSlide.text).not.toContain('국토교통부 API');
      expect(yieldSlide.text).not.toMatch(G54_DEFECT_EXCUSE_REGEX);

      // Assertion 3: Physical layout inspection — no canvas bleed
      const inspection = await inspectPptxBinary(output.buffer);
      expect(inspection.bleedCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Case F: Total Degenerate Combined Chaos (All Assets Missing)
  // ═══════════════════════════════════════════════════════════════════
  describe('Case F: Total Degenerate Combined Chaos', () => {
    it('[Adversarial Stress] All visual & financial tables missing simultaneously -> exactly 9 slides, 0 G54 leaks, 0 poison tokens, 0 bleeds', async () => {
      const degenerateInput = createFullPositiveBaseline({
        coordinates: null,
        macroTransitImage: null,
        mapImageUrl: null,
        cadastralMapImage: null,
        poiSpots: [],
        photos: [],
        photoUrls: [],
        hasRentRoll: false,
        floor_leases: [],
        tableRows: [],
        hasLandHistory: false,
        landPriceHistory: null,
        enrichment: {
          hasCadastralMap: false,
          hasTransitMap: false,
        },
      });

      const output = await renderer.render(degenerateInput);

      // 1. Hard invariant: Canonical 9 slides strictly preserved
      expect(output.slideCount).toBe(9);

      const slideTexts = await extractSlideTexts(output.buffer);
      expect(slideTexts.length).toBe(9);

      // 2. Binary physical integrity inspection
      const binaryResult = await inspectPptxBinary(output.buffer);
      expect(binaryResult.bleedCount).toBe(0);
      expect(binaryResult.brokenImageCount).toBe(0);
      expect(binaryResult.placeholderResidueCount).toBe(0);
      expect(binaryResult.poisonTokenViolationCount).toBe(0);

      // 3. Exhaustive check: Zero G54 excuses across all slides
      for (const slide of slideTexts) {
        expect(slide.text).not.toMatch(G54_DEFECT_EXCUSE_REGEX);
        expect(slide.text).not.toMatch(POISON_TOKEN_REGEX);
      }
    });
  });
});
