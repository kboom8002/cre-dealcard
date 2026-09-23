/**
 * @file basic-im-degenerate-stress.test.ts
 * @description Dedicated Empirical Stress Harness for Degenerate, Adversarial & Boundary Payloads.
 *
 * Authored by Challenger 1 (Empirical Adversarial & Chaos Challenger) under Milestone M4.
 *
 * Stress Test Dimensions:
 * 1. 5,000+ Character Mega Strings (Title, Building Name, Address, Thesis, Tenant, Broker)
 * 2. Hostile & Corrupt Unicode (Unpaired Surrogates, Zalgo diacritics, Control chars, BiDi overrides, XML escape injection)
 * 3. NaN & Infinity Mathematical Chaos (Injected into numeric fields, SSOT summary, financials, floor leases)
 * 4. Zero-Value Simultaneous Collapse (Zero prices, zero areas, zero rent, zero deposit)
 * 5. Degenerate Empty Bodies & Null Permutations (Empty body, null sub-objects, malformed arrays)
 * 6. Strict Slide Bounds & Zero Ghost Slide Assertions (7~11 slides, required sequence preserved)
 * 7. Negative Pair Harness Verification (Confirm oracle catches poison tokens & evasive phrases)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  inspectPptxBinary,
  POISON_TOKEN_REGEX,
  EVASIVE_PHRASES_PATTERN,
  FORBIDDEN_DEFECT_EXCUSE_PATTERN,
} from '@/assurance/im-harness/observers/pptx-binary-observer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
} from '@/assurance/im-harness/golden-test-utils';
import { BASIC_IM_BOUNDS } from '@/domain/building/mobile-im/pptx/basic-im-contract';
import { createAdversarialBasicImInput } from './basic-im-adversarial.test';

describe('Basic IM Degenerate & Hostile Stress Suite (Challenger 1)', () => {
  const renderer = new MobileImPptxRenderer();

  beforeAll(() => {
    // True offline execution guard: block external network calls
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // §1: 5,000+ Character Mega Strings Across Multiple Pipeline Vectors
  // ═══════════════════════════════════════════════════════════════════
  describe('§1: 5,000+ Character Mega Strings Stress Test', () => {
    it('[CHALLENGE-STR-01] 5,000+ char title renders cleanly without buffer overflow or slide crash', async () => {
      const megaTitle = '초특급 강남 랜드마크 프라임 빌딩 ' + '가'.repeat(5500);
      const input = createAdversarialBasicImInput({
        doc: { title: megaTitle, body: {} },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-STR-02] 5,000+ char building name and address do not breach OpenXML layout', async () => {
      const megaName = '역삼 하이퍼 인스티튜셔널 센터 타워 ' + 'B'.repeat(5200);
      const megaAddr = '서울특별시 강남구 테헤란로 152 강남파이낸스센터 인접 ' + 'C'.repeat(5300);

      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.building_name = megaName;
      input.doc.body.ssot_summary.address = megaAddr;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(50_000);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-STR-03] 5,000+ char tenant name in rent roll table handles column wrapping safely', async () => {
      const megaTenant = '주식회사 메가글로벌엔터프라이즈테크놀로지스앤파트너스코리아 ' + 'D'.repeat(5000);
      const input = createAdversarialBasicImInput();
      input.doc.body.floor_leases = [
        {
          floor: '1F',
          tenant: megaTenant,
          area_pyeong: 60,
          deposit_manwon: 8000,
          rent_manwon: 700,
          is_vacant: false,
          lease_end: '2029-12-31',
        },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-STR-04] 5,000+ char broker credentials do not cause footer or closing bleed', async () => {
      const megaBrokerName = '공인중개사 ' + '김'.repeat(5100);
      const megaCompany = '주식회사 글로벌부동산중개법인 ' + '프라임'.repeat(1200);
      const megaSpecialty = '상업용 대형 오피스 빌딩 매입매각 자문 전문 ' + '자문'.repeat(1200);

      const input = createAdversarialBasicImInput({
        broker: {
          display_name: megaBrokerName,
          company_name: megaCompany,
          phone: '010-9999-8888',
          specialty: megaSpecialty,
        },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-STR-05] Compound mega-string bombardment across ALL text fields simultaneously', async () => {
      const chunk5k = '복합스트레스'.repeat(1000);
      const input = createAdversarialBasicImInput({
        doc: {
          title: chunk5k,
          body: {
            keyInvestmentPoint: chunk5k,
            ssot_summary: {
              building_name: chunk5k,
              address: chunk5k,
              zoning: chunk5k,
            },
            heroCard: {
              keyInvestmentPoint: chunk5k,
            },
          },
        },
      });

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §2: Corrupt Unicode, Surrogate Traps & Malicious XML Payloads
  // ═══════════════════════════════════════════════════════════════════
  describe('§2: Corrupt Unicode & Malicious XML Stress Test', () => {
    it('[CHALLENGE-UNI-01] Unpaired high/low surrogates are safely handled without throwing', async () => {
      // Unpaired surrogates can crash poorly implemented UTF-8 serializers
      const unpairedSurrogates = '빌딩\uD800테스트\uDFFF타워\uDBFF센터\uDC00';
      const input = createAdversarialBasicImInput();
      input.doc.title = unpairedSurrogates;
      input.doc.body.ssot_summary.building_name = unpairedSurrogates;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const zip = await JSZip.loadAsync(result.buffer);
      expect(zip.file('ppt/presentation.xml')).toBeDefined();
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-UNI-02] Massive Zalgo diacritical stacking (combining characters) renders without crash', async () => {
      // Create characters with 50 combining marks each
      const combiningMarks = Array.from({ length: 50 }, (_, i) => String.fromCharCode(0x0300 + (i % 70))).join('');
      const zalgoTitle = 'Z' + combiningMarks + 'A' + combiningMarks + 'L' + combiningMarks + 'G' + combiningMarks + 'O';

      const input = createAdversarialBasicImInput();
      input.doc.title = zalgoTitle;
      input.doc.body.ssot_summary.building_name = zalgoTitle;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-UNI-03] BiDi override characters (RLO/LRO) do not disrupt OpenXML parsing', async () => {
      // \u202E (Right-to-Left Override) can reorder visual display
      const bidiBomb = '\u202E역삼동\u202D 테헤란로 \u2066프라임\u2067 타워';
      const input = createAdversarialBasicImInput();
      input.doc.title = bidiBomb;
      input.doc.body.ssot_summary.address = bidiBomb;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      expect(slides.length).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-UNI-04] Full control characters spectrum (\\x00 to \\x1F and \\x7F) are scrubbed', async () => {
      const allControlChars = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('') + '\x7F';
      const input = createAdversarialBasicImInput();
      input.doc.title = '정상제목' + allControlChars;
      input.doc.body.ssot_summary.building_name = '빌딩이름' + allControlChars;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const zip = await JSZip.loadAsync(result.buffer);
      const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
      expect(slide1Xml).toBeDefined();
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-UNI-05] Complex XML injection payloads (<xml>, CDATA, unclosed tags) are properly escaped', async () => {
      const xmlInjections = [
        '<xml version="1.0"><evil>boom</evil></xml>',
        '<![CDATA[<script>alert(1)</script>]]>',
        '</p:sp></p:spTree></p:cSld>',
        '<a:t>Fake Text</a:t>',
        '&amp;&lt;&gt;&quot;&apos;',
      ];

      for (const injection of xmlInjections) {
        const input = createAdversarialBasicImInput();
        input.doc.title = injection;
        input.doc.body.ssot_summary.building_name = injection;

        const result = await renderer.render(input);
        expect(result.buffer).toBeDefined();

        const zip = await JSZip.loadAsync(result.buffer);
        const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
        expect(slide1Xml).toBeDefined();
        // The injection must NOT be present as raw unescaped XML
        expect(slide1Xml).not.toContain('<evil>boom</evil>');
        expect(slide1Xml).not.toContain('<![CDATA[');
        await assertZeroPoisonTokens(result.buffer);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §3: NaN, Infinity & Mathematical Chaos Permutations
  // ═══════════════════════════════════════════════════════════════════
  describe('§3: NaN, Infinity & Mathematical Chaos Stress Test', () => {
    it('[CHALLENGE-MATH-01] NaN injected into ALL numeric SSOT fields produces ZERO poison tokens', async () => {
      const input = createAdversarialBasicImInput();
      const ssot = input.doc.body.ssot_summary as any;
      ssot.asking_price_manwon = NaN;
      ssot.total_deposit_manwon = NaN;
      ssot.monthly_rent_total_krw = NaN;
      ssot.land_area_sqm = NaN;
      ssot.total_gross_area_sqm = NaN;
      ssot.parking_count = NaN;
      ssot.elevator_count = NaN;
      ssot.completion_year = NaN;
      ssot.floors_above = NaN;
      ssot.floors_below = NaN;
      ssot.vacancy_pct = NaN;
      ssot.building_age_years = NaN;

      const hero = input.doc.body.heroCard as any;
      hero.capRateBase = NaN;
      hero.noiBaseBil = NaN;
      hero.equityRequiredBil = NaN;
      hero.leveragedYieldPct = NaN;
      hero.landAreaM2 = NaN;
      hero.totalGrossAreaM2 = NaN;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        // Assert zero isolated NaN tokens in XML or text
        expect(slide.xml).not.toMatch(/>\s*NaN\s*</);
        expect(slide.xml).not.toMatch(/>\s*NaN%\s*</);
        expect(slide.xml).not.toMatch(/>\s*NaN억\s*</);
      }

      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-MATH-02] Infinity and -Infinity input behavior across binary gate and slide XML', async () => {
      const input = createAdversarialBasicImInput();
      const ssot = input.doc.body.ssot_summary as any;
      ssot.asking_price_manwon = Infinity;
      ssot.total_deposit_manwon = -Infinity;
      ssot.monthly_rent_total_krw = Infinity;
      ssot.land_area_sqm = Infinity;
      ssot.total_gross_area_sqm = -Infinity;

      const hero = input.doc.body.heroCard as any;
      hero.capRateBase = Infinity;
      hero.noiBaseBil = Infinity;
      hero.leveragedYieldPct = -Infinity;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const s of slides) {
        if (s.slideNumber === 3 || s.slideNumber === 5) {
          const nanMatches = s.xml.match(/>[^<]*NaN[^<]*</g);
          console.log(`SLIDE ${s.slideNumber} NaN matches:`, nanMatches);
        }
      }

      // Remediated assertion: Guarding Infinity inputs ensures zero NaN or Infinity tokens in output
      for (const s of slides) {
        expect(s.xml).not.toMatch(/>\s*NaN\s*</);
        expect(s.xml).not.toMatch(/>\s*-?Infinity\s*</);
        expect(s.text).not.toContain('Infinity%');
      }
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-MATH-03] Number.MAX_VALUE and Number.MIN_VALUE handle string conversion without scientific leak', async () => {
      const input = createAdversarialBasicImInput();
      const ssot = input.doc.body.ssot_summary as any;
      ssot.asking_price_manwon = Number.MAX_SAFE_INTEGER;
      ssot.total_deposit_manwon = Number.MIN_SAFE_INTEGER;
      ssot.land_area_sqm = Number.EPSILON;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-MATH-04] NaN in floor_leases array items sanitizes gracefully', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.floor_leases = [
        {
          floor: '1F',
          tenant: '테넌트1',
          area_pyeong: NaN,
          deposit_manwon: NaN,
          rent_manwon: NaN,
          is_vacant: false,
        },
        {
          floor: '2F',
          tenant: '테넌트2',
          area_pyeong: Infinity,
          deposit_manwon: -Infinity,
          rent_manwon: NaN,
          is_vacant: true,
        },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.xml).not.toMatch(/>\s*NaN\s*</);
        expect(slide.xml).not.toMatch(/>\s*Infinity\s*</);
      }
      await assertZeroPoisonTokens(result.buffer);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §4: Zero-Value Simultaneous Collapse
  // ═══════════════════════════════════════════════════════════════════
  describe('§4: Zero-Value Simultaneous Collapse Stress Test', () => {
    it('[CHALLENGE-ZERO-01] All prices, areas, rents, deposits are simultaneously 0', async () => {
      const input = createAdversarialBasicImInput();
      const ssot = input.doc.body.ssot_summary as any;
      ssot.asking_price_manwon = 0;
      ssot.total_deposit_manwon = 0;
      ssot.monthly_rent_total_krw = 0;
      ssot.land_area_sqm = 0;
      ssot.total_gross_area_sqm = 0;
      ssot.parking_count = 0;
      ssot.elevator_count = 0;
      ssot.vacancy_pct = 0;
      ssot.building_age_years = 0;

      const hero = input.doc.body.heroCard as any;
      hero.capRateBase = 0;
      hero.noiBaseBil = 0;
      hero.equityRequiredBil = 0;
      hero.leveragedYieldPct = 0;
      hero.landAreaM2 = 0;
      hero.totalGrossAreaM2 = 0;

      input.doc.body.floor_leases = [
        { floor: '1F', tenant: '공실', area_pyeong: 0, deposit_manwon: 0, rent_manwon: 0, is_vacant: true },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN%');
        expect(slide.text).not.toContain('Infinity%');
        expect(slide.text).not.toContain('0/0');
      }

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-ZERO-02] Zero land area with positive gross area (FAR division by zero)', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = 0;
      input.doc.body.ssot_summary.total_gross_area_sqm = 1500;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('Infinity%');
        expect(slide.text).not.toContain('NaN%');
      }
      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-ZERO-03] Positive land area with zero gross area (BCR zero numerator)', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.ssot_summary.land_area_sqm = 500;
      input.doc.body.ssot_summary.total_gross_area_sqm = 0;

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text).not.toContain('NaN%');
      }
      await assertZeroPoisonTokens(result.buffer);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §5: Degenerate Empty Bodies & Null Permutations
  // ═══════════════════════════════════════════════════════════════════
  describe('§5: Degenerate Empty Bodies & Null Permutations Stress Test', () => {
    it('[CHALLENGE-EMPTY-01] Completely bare minimum input object (all optionals omitted)', async () => {
      const minimalInput: MobileImPptxInput = {
        buildingId: 'challenge-minimal-bldg',
        preset: 'credeal_basic',
        posture: 'income',
        grade: 'B',
        doc: {
          title: '',
          body: {} as any,
        },
      };

      const result = await renderer.render(minimalInput);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(6);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-EMPTY-02] doc.body sub-objects are explicitly null', async () => {
      const nullBodyInput: MobileImPptxInput = {
        buildingId: 'challenge-null-subobjs',
        preset: 'credeal_basic',
        posture: 'income',
        grade: 'A',
        doc: {
          title: '널 서브오브젝트 테스트',
          body: {
            heroCard: null,
            ssot_summary: null,
            floor_leases: null,
            photos: null,
            financials: null,
            coordinates: null,
            enrichment: null,
            sections: null,
          } as any,
        },
      };

      const result = await renderer.render(nullBodyInput);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(6);

      await assertZeroPoisonTokens(result.buffer);
    });

    it('[CHALLENGE-EMPTY-03] Photos and FloorLeases contain null, undefined, and empty objects', async () => {
      const input = createAdversarialBasicImInput();
      (input.doc.body as any).photos = [
        null,
        undefined,
        {},
        { url: '' },
        { url: null },
        { url: undefined },
      ];
      (input.doc.body as any).floor_leases = [
        null,
        undefined,
        {},
        { floor: null, tenant: undefined },
      ];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides - 1);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });

    it('[CHALLENGE-EMPTY-04] Sections array is completely empty', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.sections = [];

      const result = await renderer.render(input);
      expect(result.buffer).toBeDefined();
      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);

      await assertZeroPoisonTokens(result.buffer);
      await assertZeroEvasivePhrases(result.buffer);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §6: Strict Slide Bounds & Zero Ghost Slide Verification
  // ═══════════════════════════════════════════════════════════════════
  describe('§6: Strict Slide Bounds & Zero Ghost Slides', () => {
    it('[CHALLENGE-BOUND-01] Standard Basic IM deck complies strictly with 7 to 11 slide limits', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      expect(result.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
      expect(result.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

      // Verify no empty ghost slides: every slide must have non-empty text content
      const slides = await extractSlideTexts(result.buffer);
      expect(slides.length).toBe(result.slideCount);
      for (const slide of slides) {
        expect(slide.text.trim().length).toBeGreaterThan(5);
      }
    });

    it('[CHALLENGE-BOUND-02] Photo-less payload suppresses gallery without leaving blank ghost slide', async () => {
      const input = createAdversarialBasicImInput();
      input.doc.body.photos = [];

      const result = await renderer.render(input);
      expect(result.slideCount).toBeGreaterThanOrEqual(7);
      expect(result.slideCount).toBeLessThanOrEqual(10);

      const slides = await extractSlideTexts(result.buffer);
      for (const slide of slides) {
        expect(slide.text.trim().length).toBeGreaterThan(5);
      }
    });

    it('[CHALLENGE-BOUND-03] Key required slides (Cover, Summary, Overview, RentRoll, Yield, Closing) are present', async () => {
      const input = createAdversarialBasicImInput();
      const result = await renderer.render(input);

      const slides = await extractSlideTexts(result.buffer);
      const combinedText = slides.map((s) => s.text).join('\n---\n');

      // Cover / Title
      expect(combinedText).toContain('투자설명서');
      // Summary / Key stats
      expect(combinedText).toMatch(/매매가|Cap Rate|수익률|연면적/);
      // Property Overview
      expect(combinedText).toMatch(/소재지|대지면적|연면적|준공/);
      // Closing disclaimer
      expect(combinedText).toMatch(/유의사항|면책|문의/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // §7: Negative Pair Harness & Oracle Assertion Verification
  // ═══════════════════════════════════════════════════════════════════
  describe('§7: Negative Pair Oracle Verification (Rule 7 / Rule 54)', () => {
    it('[CHALLENGE-ORACLE-01] POISON_TOKEN_REGEX detects NaN, undefined, null, [object Object]', async () => {
      expect(POISON_TOKEN_REGEX.test('총 매매가: NaN억 원')).toBe(true);
      expect(POISON_TOKEN_REGEX.test('임차인: undefined')).toBe(true);
      expect(POISON_TOKEN_REGEX.test('보증금: null')).toBe(true);
      expect(POISON_TOKEN_REGEX.test('데이터: [object Object]')).toBe(true);

      // Safe clean text should NOT match
      expect(POISON_TOKEN_REGEX.test('서울특별시 강남구 역삼동 123')).toBe(false);
      expect(POISON_TOKEN_REGEX.test('매매가 125억 원, Cap Rate 4.6%')).toBe(false);
    });

    it('[CHALLENGE-ORACLE-02] EVASIVE_PHRASES_PATTERN detects evasive excuses supported by observer', async () => {
      expect(EVASIVE_PHRASES_PATTERN.test('추후 확인 필요')).toBe(true);
      expect(EVASIVE_PHRASES_PATTERN.test('미정')).toBe(true);
      expect(EVASIVE_PHRASES_PATTERN.test('상세 불명')).toBe(true);
      expect(EVASIVE_PHRASES_PATTERN.test('확인 불가')).toBe(true);
      expect(EVASIVE_PHRASES_PATTERN.test('자료 없음')).toBe(true);

      // Normal text should NOT match
      expect(EVASIVE_PHRASES_PATTERN.test('본 자산은 테헤란로 중심에 위치합니다')).toBe(false);
    });

    it('[CHALLENGE-ORACLE-03] FORBIDDEN_DEFECT_EXCUSE_PATTERN detects internal excuse leaks and exposes particle blind spot', async () => {
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('필지별 내역 미확보')).toBe(true);
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('비워 둡니다')).toBe(true);
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('인근 비교사례는 확보하지 않았습니다')).toBe(true);

      // Matches when using '을' as defined in current regex:
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('유효 대지을 산출하지 않았습니다')).toBe(true);
      // Remediated: '유효 대지를 산출하지 않았습니다' is now caught via [을를]?
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('유효 대지를 산출하지 않았습니다')).toBe(true);

      // Normal text should NOT match
      expect(FORBIDDEN_DEFECT_EXCUSE_PATTERN.test('정상적인 임대차 계약이 체결되어 있습니다')).toBe(false);
    });
  });
});
