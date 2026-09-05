/**
 * @file macro-transit-engine.test.ts
 * @description Location Macro Transit Vector Diagram Engine Unit Tests
 *
 * Tests:
 * - Positive: Default 1600x1200 px generation, >= 180 DPI (and G32 >= 150 DPI)
 * - Positive: Concentric circles (0.5km, 1.0km), future lines & badges, asset pin, commute arrows, legend
 * - Positive: District presets (YBD, GBD, CBD, generic) and auto-detection
 * - Positive: A06 diagram archetype integration with macroTransitImage
 * - Negative Pairs: Low DPI failure against G32, invalid dimensions, invalid target box, unsupported format, missing map warning
 */

import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import {
  generateMacroTransitDiagram,
  generateMacroTransitSvg,
  calculateEffectiveDpi,
  detectDistrict,
  detectSubDistrict,
  escapeXml,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_TARGET_BOX,
  MIN_EFFECTIVE_DPI_G32,
  TARGET_EFFECTIVE_DPI_R2,
} from '../../services/macro-transit-engine';
import { checkEffectiveDpi } from '../../domain/building/mobile-im/pptx/utils/layout-physics';
import { buildA06Diagram } from '../../domain/building/mobile-im/pptx/archetypes/a06-diagram';

describe('Macro Transit Vector Diagram Engine (M2 / R2)', () => {
  describe('DPI Calculations and Thresholds', () => {
    it('M2-DPI-01: Default 1600x1200 px in 5.60"x4.50" box achieves 266.7 DPI (exceeds 180+ DPI and passes G32)', () => {
      const dpi = calculateEffectiveDpi(DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_TARGET_BOX.w, DEFAULT_TARGET_BOX.h);
      expect(dpi).toBe(266.7);
      expect(dpi).toBeGreaterThanOrEqual(TARGET_EFFECTIVE_DPI_R2); // 180 DPI
      expect(dpi).toBeGreaterThanOrEqual(MIN_EFFECTIVE_DPI_G32);   // 150 DPI

      // layout-physics checkEffectiveDpi passes (returns null = no violation)
      const g32Check = checkEffectiveDpi(DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_TARGET_BOX.w, DEFAULT_TARGET_BOX.h, 150);
      expect(g32Check).toBeNull();

      const r2Check = checkEffectiveDpi(DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_TARGET_BOX.w, DEFAULT_TARGET_BOX.h, 180);
      expect(r2Check).toBeNull();
    });

    it('M2-DPI-01-NEG: Low-resolution raster (< 150 DPI) fails G32 gate', () => {
      const lowW = 600;
      const lowH = 450;
      const dpi = calculateEffectiveDpi(lowW, lowH, DEFAULT_TARGET_BOX.w, DEFAULT_TARGET_BOX.h);
      expect(dpi).toBe(100); // min(600/5.6=107.1, 450/4.5=100) -> 100 DPI
      expect(dpi).toBeLessThan(MIN_EFFECTIVE_DPI_G32);

      const check = checkEffectiveDpi(lowW, lowH, DEFAULT_TARGET_BOX.w, DEFAULT_TARGET_BOX.h, 150, 'LowResMap');
      expect(check).not.toBeNull();
      expect(check?.gate).toBe('G32');
      expect(check?.severity).toBe('violation');
      expect(check?.message).toContain('실효 DPI');
    });
  });

  describe('Diagram Generation & Graphic Features (YBD Default)', () => {
    it('M2-GEN-01: Generates genuine PNG buffer and base64 with all required YBD features', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'NH농협캐피탈빌딩',
        district: 'YBD',
      });

      // Structure & Dimensions
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.effectiveDpi).toBe(266.7);
      expect(result.district).toBe('YBD');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(1000);
      expect(result.base64).toMatch(/^image\/png;base64,[A-Za-z0-9+/=]+/);

      // Graphic Elements in SVG
      const svg = result.svg;

      // 1. Dark slate background & Han River
      expect(svg).toContain('fill="#1E222D"');
      expect(svg).toContain('H A N   R I V E R');
      expect(svg).toContain('서강대교');
      expect(svg).toContain('마포대교');
      expect(svg).toContain('원효대교');
      expect(svg).toContain('올림픽대로');

      // 2. Concentric walking distance circles (0.5km / 1.0km)
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
      expect(svg).toContain('r="95"');
      expect(svg).toContain('r="185"');
      expect(svg).toContain('stroke="#E8DEC8"');

      // 3. Operating subway lines
      expect(svg).toContain('5호선');
      expect(svg).toContain('9호선');
      expect(svg).toContain('신림선');
      expect(svg).toContain('#8B5CF6'); // Line 5 color
      expect(svg).toContain('#D97706'); // Line 9 color
      expect(svg).toContain('#0D9488'); // Sillim line color

      // 4. Future planned lines with year/dashed badges
      expect(svg).toContain('신안산선 (2025/2026 예정)');
      expect(svg).toContain('GTX-B 노선 (2030 예정)');
      expect(svg).toContain('서부선 (2030 예정)');
      expect(svg).toContain('stroke-dasharray="5,3"');
      expect(svg).toContain('stroke-dasharray="6,4"');
      expect(result.futureLines).toContain('신안산선 (2025/2026 예정)');
      expect(result.futureLines).toContain('GTX-B 노선 (2030 예정)');
      expect(result.futureLines).toContain('서부선 (2030 예정)');

      // 5. Major stations / transit centers
      expect(svg).toContain('여의도역 (5·9호선)');
      expect(svg).toContain('샛강역 (9호선·신림선)');
      expect(svg).toContain('여의도환승센터(BUS)');
      expect(result.stations).toContain('여의도역 (5·9호선)');
      expect(result.stations).toContain('샛강역 (9호선·신림선)');

      // 6. Asset pin & champagne gold halo
      expect(svg).toContain('[ ASSET ] NH농협캐피탈빌딩');
      expect(svg).toContain('fill="#E8DEC8"');

      // 7. Directional commute arrows
      expect(svg).toContain('➔ CBD (도심 15분)');
      expect(svg).toContain('➔ GBD (강남 20분)');
      expect(svg).toContain('➔ 마곡 (18분)');
      expect(result.coreDistrictArrows).toContain('CBD (도심 15분)');
      expect(result.coreDistrictArrows).toContain('GBD (강남 20분)');
      expect(result.coreDistrictArrows).toContain('마곡 (18분)');

      // 8. Legend box
      expect(svg).toContain('대중교통망 범례');
      expect(svg).toContain('5호선 / 9호선 / 신림선');
    });

    it('M2-GEN-02: Generates JPEG format with custom dimensions and target box', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: '여의도 파이낸스타워',
        width: 2000,
        height: 1500,
        targetBoxInches: { w: 6.0, h: 4.5 },
        format: 'jpeg',
      });

      expect(result.width).toBe(2000);
      expect(result.height).toBe(1500);
      expect(result.base64).toMatch(/^image\/jpeg;base64,/);
      // min(2000/6.0 = 333.3, 1500/4.5 = 333.3) -> 333.3 DPI
      expect(result.effectiveDpi).toBe(333.3);
      expect(result.effectiveDpi).toBeGreaterThanOrEqual(180);
    });
  });

  describe('District Presets & Address Detection', () => {
    it('M2-DIST-01: GBD Gangnam preset contains Teheran-ro, Line 2, Sinbundang, GTX-A/C, Pangyo arrow', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'ICL빌딩',
        district: 'GBD',
      });

      expect(result.district).toBe('GBD');
      const svg = result.svg;
      expect(svg).toContain('GANGNAM (GBD) BUSINESS DISTRICT');
      expect(svg).toContain('테헤란로');
      expect(svg).toContain('강남대로');
      expect(svg).toContain('2호선');
      expect(svg).toContain('신분당선');
      expect(svg).toContain('GTX-A (2028 예정)');
      expect(svg).toContain('GTX-C (2028 예정)');
      expect(svg).toContain('위례신사선 (2029 예정)');
      expect(svg).toContain('강남역 (2·신분당선)');
      expect(svg).toContain('삼성역 (2·GTX)');
      expect(svg).toContain('➔ 판교 (13분)');
      expect(svg).toContain('➔ CBD (도심 25분)');
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
    });

    it('M2-DIST-02: CBD Downtown preset contains Cheonggyecheon, Sejong-daero, Line 1, Seoul Station, GTX-A/B', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: '센터원빌딩',
        district: 'CBD',
      });

      expect(result.district).toBe('CBD');
      const svg = result.svg;
      expect(svg).toContain('CENTRAL (CBD) DOWNTOWN DISTRICT');
      expect(svg).toContain('CHEONGGYECHEON (청계천)');
      expect(svg).toContain('세종대로');
      expect(svg).toContain('을지로');
      expect(svg).toContain('1호선');
      expect(svg).toContain('서울역 (1·4·KTX)');
      expect(svg).toContain('GTX-A (2028 예정)');
      expect(svg).toContain('GTX-B (2030 예정)');
      expect(svg).toContain('➔ GBD (강남 25분)');
      expect(svg).toContain('➔ YBD (여의도 15분)');
    });

    it('M2-DIST-03: detectDistrict correctly identifies district from address keywords', () => {
      expect(detectDistrict('서울 영등포구 여의도동 34-1')).toBe('YBD');
      expect(detectDistrict('서울 강남구 테헤란로 152')).toBe('GBD');
      expect(detectDistrict('서울 서초구 서초대로 301')).toBe('GBD');
      expect(detectDistrict('서울 중구 을지로 100')).toBe('CBD');
      expect(detectDistrict('서울 종로구 청계천로 41')).toBe('CBD');
      expect(detectDistrict('부산 해운대구 우동')).toBe('generic');
      expect(detectDistrict(undefined, undefined)).toBe('YBD'); // default
    });
  });

  describe('Negative Validation & Guardrails (Rule 7)', () => {
    it('M2-VAL-01-NEG: Rejects invalid dimensions (<= 0 or NaN)', async () => {
      await expect(generateMacroTransitDiagram({ width: -100 })).rejects.toThrow('Invalid width or height');
      await expect(generateMacroTransitDiagram({ height: 0 })).rejects.toThrow('Invalid width or height');
      await expect(generateMacroTransitDiagram({ width: NaN })).rejects.toThrow('Invalid width or height');
    });

    it('M2-VAL-02-NEG: Rejects invalid target box inches', async () => {
      await expect(generateMacroTransitDiagram({ targetBoxInches: { w: -5.6, h: 4.5 } })).rejects.toThrow('Invalid targetBoxInches');
      await expect(generateMacroTransitDiagram({ targetBoxInches: { w: 5.6, h: 0 } })).rejects.toThrow('Invalid targetBoxInches');
    });

    it('M2-VAL-03-NEG: Rejects unsupported format', async () => {
      await expect(generateMacroTransitDiagram({ format: 'gif' as any })).rejects.toThrow('Unsupported output format');
    });

    it('M2-VAL-04: Escapes XML characters in propertyName preventing injection', () => {
      const escaped = escapeXml('Acme & Partners <Tower> "Prime" \'Asset\'');
      expect(escaped).toBe('Acme &amp; Partners &lt;Tower&gt; &quot;Prime&quot; &apos;Asset&apos;');

      const { svg } = generateMacroTransitSvg({
        propertyName: 'Acme & Partners <Tower> "Prime"',
      });
      expect(svg).toContain('[ ASSET ] Acme &amp; Partners &lt;Tower&gt; &quot;Prime&quot;');
      expect(svg).not.toContain('[ ASSET ] Acme & Partners <Tower>');
    });
  });

  describe('A06 Diagram Archetype Integration', () => {
    it('M2-A06-01: A06 successfully consumes macroTransitImage and suppresses missing map warning', async () => {
      const pres = new PptxGenJS();
      const transitResult = await generateMacroTransitDiagram({
        propertyName: '테스트 타워',
        district: 'YBD',
      });

      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-TEST-001',
        data: {
          title: '입지 및 교통 접근성',
          kicker: 'LOCATION & ACCESS',
          macroTransitImage: transitResult.base64,
          left: { sub: '광역 교통망 벡터 다이어그램' },
          right: {
            sub: '주요 교통 지표',
            rows: [
              ['지하철', '5호선·9호선 여의도역 도보 7분, 신림선 샛강역 도보 3분'],
              ['광역도로', '올림픽대로, 마포대교, 원효대교 인접'],
              ['철도개발', '신안산선(2025/26), GTX-B(2030), 서부선(2030) 예정'],
            ],
          },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect((output as any).suppress).toBeUndefined();
      // Verify that [BL-E] and [BL-2] warnings are NOT generated because macroTransitImage is provided
      expect(output.warnings.some((w) => w.includes('[BL-E]'))).toBe(false);
      expect(output.warnings.some((w) => w.includes('[BL-2]'))).toBe(false);
    });

    it('M2-A06-01-NEG: A06 suppresses slide and produces [BL-E] warning when macroTransitImage and all map sources are absent', async () => {
      const pres = new PptxGenJS();
      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-TEST-002',
        data: {
          title: '입지 정보 부재 케이스',
          // no coordinates, no mapImageUrl, no cadastralImage, no macroTransitImage
          left: {},
          right: { rows: [['주소', '확인 필요']] },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      // Without map data, slide is suppressed to transfer to checklist
      expect((output as any).suppress).toBe(true);
      expect(output.warnings.some((w) => w.includes('[BL-E] 지도 데이터 미확보'))).toBe(true);
    });
  });

  describe('GBD Sub-District Presets (M3 / Feature 9)', () => {
    it('M3-DIST-01: GBD_SINSA preset contains Dosan-daero, Sinsa/Apgujeong stations, Eulji Hospital Stn, Wirye-Sinsa node', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'ICL빌딩',
        address: '서울특별시 강남구 신사동 590',
        subDistrict: 'GBD_SINSA',
      });

      expect(result.district).toBe('GBD');
      expect(result.subDistrict).toBe('GBD_SINSA');
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.effectiveDpi).toBe(266.7);
      const svg = result.svg;
      expect(svg).toContain('GBD NORTH / DOSAN-DAERO');
      expect(svg).toContain('도산대로');
      expect(svg).toContain('논현로');
      expect(svg).toContain('신사역 (3·신분당선)');
      expect(svg).toContain('압구정역 (3호선)');
      expect(svg).toContain('학동역 (7호선)');
      expect(svg).toContain('위례신사선 (2029 예정)');
      expect(svg).toContain('Eulji Hospital Stn');
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
      expect(result.coreDistrictArrows).toContain('CBD (도심 20분)');
      expect(result.coreDistrictArrows).toContain('판교 (20분)');
    });

    it('M3-DIST-02: GBD_SEOCHO preset contains Yangjae/Gangnam stations, GTX-C, Seocho IC', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'FM빌딩',
        address: '서울특별시 서초구 서초동 1364-28',
        subDistrict: 'GBD_SEOCHO',
      });

      expect(result.district).toBe('GBD');
      expect(result.subDistrict).toBe('GBD_SEOCHO');
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.effectiveDpi).toBe(266.7);
      const svg = result.svg;
      expect(svg).toContain('GBD SOUTH / SEOCHO-YANGJAE');
      expect(svg).toContain('남부순환로');
      expect(svg).toContain('강남대로');
      expect(svg).toContain('서초 IC');
      expect(svg).toContain('양재역 (3·신분당·GTX-C)');
      expect(svg).toContain('강남역 (2·신분당선)');
      expect(svg).toContain('GTX-C (2028 예정)');
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
      expect(result.coreDistrictArrows).toContain('판교 (10분)');
    });

    it('M3-DIST-03: detectSubDistrict auto-resolves Sinsa, Seocho, and Teheran from address keywords', () => {
      expect(detectSubDistrict('서울특별시 강남구 신사동 590')).toBe('GBD_SINSA');
      expect(detectSubDistrict('서울특별시 강남구 도산대로 123')).toBe('GBD_SINSA');
      expect(detectSubDistrict('서울특별시 서초구 서초동 1364-28')).toBe('GBD_SEOCHO');
      expect(detectSubDistrict('서울특별시 서초구 양재동 12')).toBe('GBD_SEOCHO');
      expect(detectSubDistrict('서울특별시 강남구 테헤란로 152')).toBe('GBD_TEHERAN');
    });

    it('M3-DIST-03-NEG: detectSubDistrict returns undefined for non-GBD address', () => {
      expect(detectSubDistrict('강원도 원주시 단계동 100')).toBeUndefined();
      expect(detectSubDistrict('서울 영등포구 여의도동 34-1')).toBeUndefined();
    });

    it('[Negative Pair] M3-DIST-04-NEG: Sinsa diagram must NOT contain Samseong Station or Teheran-ro', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: '신사 ICL빌딩',
        subDistrict: 'GBD_SINSA',
      });
      expect(result.svg).not.toContain('테헤란로');
      expect(result.svg).not.toContain('삼성역 (2·GTX)');
    });

    it('[Negative Pair] M3-DIST-05-NEG: Seocho diagram must NOT contain Teheran-ro or Samseong Station', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: '서초 FM빌딩',
        subDistrict: 'GBD_SEOCHO',
      });
      expect(result.svg).not.toContain('테헤란로');
      expect(result.svg).not.toContain('삼성역 (2·GTX)');
    });
  });
});
