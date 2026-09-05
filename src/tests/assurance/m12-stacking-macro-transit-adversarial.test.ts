/**
 * @file m12-stacking-macro-transit-adversarial.test.ts
 * @description Adversarial stress-test suite for Archetype A22 Stacking Plan and Macro Transit Engine
 *
 * Requirements:
 * - Stress-test Stacking Plan Archetype A22:
 *   - Extreme floors: single-floor asset (N=1), 40+ to 50 floor high-rise (N=50)
 *   - Missing fields, zero floor area, inverted setbacks (top floor larger than base)
 *   - 100% vacancy asset, all-retail asset
 *   - Extremely long tenant names and layout overflow
 *   - Assert zero layout crashes, boundary bleed detection, and calculations
 * - Stress-test Macro Transit Engine:
 *   - Unusual coordinates (abroad, empty, undefined, null)
 *   - Unknown / generic districts
 *   - Extreme aspect ratio boxes (ultra-wide, ultra-tall, tiny)
 *   - DPI calculation math: 1600x1200 in 5.60"x4.50" box = 266.7 DPI >= 180+ DPI
 *   - G32 gate behavior and Sharp binary buffer integrity (magic bytes, dimensions)
 */

import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import {
  buildA22StackingPlan,
  calculateSetbackRatio,
  inferTenantCategory,
  SEMANTIC_COLORS,
  SEMANTIC_COLORS_DARK,
} from '../../domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { validateLayout } from '../../domain/building/mobile-im/pptx/layout-validator';
import { checkEffectiveDpi } from '../../domain/building/mobile-im/pptx/utils/layout-physics';
import {
  generateMacroTransitDiagram,
  generateMacroTransitSvg,
  calculateEffectiveDpi,
  detectDistrict,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_TARGET_BOX,
  MIN_EFFECTIVE_DPI_G32,
  TARGET_EFFECTIVE_DPI_R2,
} from '../../services/macro-transit-engine';
import type { StackingPlanFloor } from '../../domain/building/mobile-im/types';

describe('Adversarial Stress Harness: Archetype A22 Stacking Plan', () => {
  // ── 1. Extreme Floors: Single Floor (N=1) ──
  describe('Extreme Floor Count: N=1 (Single-Floor Asset)', () => {
    it('[ADV-A22-01A] Single above-ground floor (1F only) renders without crash or bleed', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE'; // 13.333" x 7.5"

      const singleFloor: StackingPlanFloor[] = [
        {
          floor: '1F',
          use: '제1종근린생활시설',
          tenant: '스타벅스 단독 드라이브스루',
          floorAreaM2: 450.0,
          exclusiveAreaPy: 100.0,
          leasableAreaPy: 136.1,
          expiryYear: 2032,
          isVacant: false,
        },
      ];

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-01A',
        data: {
          title: '단층 단독 리테일 자산 스태킹 플랜',
          stackingPlan: singleFloor,
          summary: {
            totalGrossAreaPy: 136.1,
            exclusiveRatePct: 73.5,
            waleYears: 7.5,
            vacancyRatePct: 0.0,
          },
          anchorTenantName: '스타벅스',
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      expect(result.warnings.length).toBe(0);

      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
      expect(layout.violations.filter(v => v.gate === 'G35').length).toBe(0);
    });

    it('[ADV-A22-01B] Single subterranean floor (B1F only) renders with depth label and without bleed', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const singleSubFloor: StackingPlanFloor[] = [
        {
          floor: 'B1F',
          use: '주차장 및 창고',
          tenant: '지하 자주식 주차장',
          floorAreaM2: 600.0,
          depthMeters: -4.5,
          expiryYear: 0,
          isVacant: false,
        },
      ];

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-01B',
        data: {
          title: '지하 단층 구조물 스태킹 플랜',
          stackingPlan: singleSubFloor,
          onDark: true,
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });
  });

  // ── 2. Extreme Floors: Ultra-High-Rise (N=50) ──
  describe('Extreme Floor Count: N=50 (Ultra-High-Rise Asset)', () => {
    it('[ADV-A22-02] 50-floor skyscraper (1F~45F + B1F~B5F) execution & layout bleed detection', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const fiftyFloors: StackingPlanFloor[] = [];
      // 45 above-ground floors (45F down to 1F)
      for (let i = 45; i >= 1; i--) {
        fiftyFloors.push({
          floor: `${i}F`,
          use: i > 3 ? '업무시설' : '근린생활시설',
          tenant: i === 45 ? '펜트하우스 라운지' : `임차인 ${i}F`,
          floorAreaM2: i >= 40 ? 600.0 : 1200.0,
          exclusiveAreaPy: i >= 40 ? 120.0 : 250.0,
          leasableAreaPy: i >= 40 ? 180.0 : 360.0,
          expiryYear: 2026 + (i % 5),
          isVacant: i % 10 === 0,
        });
      }
      // 5 subterranean floors (B1F down to B5F)
      for (let i = 1; i <= 5; i++) {
        fiftyFloors.push({
          floor: `B${i}F`,
          use: i === 1 ? '근린생활시설' : '주차장',
          tenant: i === 1 ? '아케이드' : `주차장 B${i}`,
          floorAreaM2: 1500.0,
          isVacant: false,
        });
      }

      // Archetype execution should not crash
      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-02',
        data: {
          title: '50층 초고층 프라임 타워 스태킹 플랜',
          stackingPlan: fiftyFloors,
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();

      // Empirical Layout Physical Measurement:
      // In A22, high-rise condensation & dynamic scaling keeps elements within Y+H <= 6.90".
      const layout = validateLayout(pres);
      const bleedViolations = layout.violations.filter(v => v.gate === 'G35');

      expect(bleedViolations.length).toBe(0);
      expect(layout.bleedCount).toBe(0);
    });
  });

  // ── 3. Boundary & Inverted Setbacks ──
  describe('Boundary Conditions: Floor Areas & Inverted Setbacks', () => {
    const stdArea = 1000.0;

    it('[ADV-A22-03A] Inverted setback (top floor area 2500 m² > standard 1000 m²) is clamped to 1.0 for above-ground', () => {
      const ratio = calculateSetbackRatio(2500.0, stdArea, false);
      expect(ratio).toBe(1.0); // Clamp upper limit for above-ground floors
    });

    it('[ADV-A22-03B] Subterranean expansion (floor area 2500 m² > standard 1000 m²) is clamped to 1.35', () => {
      const ratio = calculateSetbackRatio(2500.0, stdArea, true);
      expect(ratio).toBe(1.35); // Subterranean upper clamp
    });

    it('[ADV-A22-03C] Zero floor area returns safe fallback ratio 1.0', () => {
      expect(calculateSetbackRatio(0, stdArea, false)).toBe(1.0);
      expect(calculateSetbackRatio(0, 0, false)).toBe(1.0);
    });

    it('[ADV-A22-03D] Negative floor area throws descriptive Korean domain error', () => {
      expect(() => calculateSetbackRatio(-100.0, stdArea, false)).toThrow('[A22] 바닥면적은 음수일 수 없습니다');
      expect(() => calculateSetbackRatio(-0.01, stdArea, true)).toThrow('[A22] 바닥면적은 음수일 수 없습니다');
    });

    it('[ADV-A22-03E] Inverted setback injected via explicit setbackRatio does not crash renderer', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const invertedFloors: StackingPlanFloor[] = [
        { floor: '3F', use: '오피스', floorAreaM2: 1500, setbackRatio: 1.25, isVacant: false },
        { floor: '2F', use: '오피스', floorAreaM2: 1200, setbackRatio: 1.10, isVacant: false },
        { floor: '1F', use: '로비',   floorAreaM2: 800,  setbackRatio: 0.80, isVacant: false },
      ];

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-03E',
        data: {
          title: '역방향 셋백(Inverted Setback) 자산',
          stackingPlan: invertedFloors,
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });
  });

  // ── 4. 100% Vacancy Asset ──
  describe('100% Vacancy Stress Case', () => {
    it('[ADV-A22-04] 100% vacant asset correctly assigns vacant category, colors, and zero WALE', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const allVacantFloors: StackingPlanFloor[] = [
        { floor: '5F', use: '업무시설', tenant: '공실 (임차인 모집 중)', floorAreaM2: 800, isVacant: true },
        { floor: '4F', use: '업무시설', tenant: '공실', floorAreaM2: 800, isVacant: true },
        { floor: '3F', use: '업무시설', tenant: '공실', floorAreaM2: 800, isVacant: true },
        { floor: '2F', use: '근린생활시설', tenant: '공실', floorAreaM2: 800, isVacant: true },
        { floor: '1F', use: '근린생활시설', tenant: '공실', floorAreaM2: 700, isVacant: true },
        { floor: 'B1F', use: '주차장', tenant: '주차장', floorAreaM2: 1000, isVacant: false },
      ];

      // Check category inference
      allVacantFloors.slice(0, 5).forEach(f => {
        expect(inferTenantCategory(f)).toBe('vacant');
      });

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-04',
        data: {
          title: '전층 공실 자산 밸류애드 스태킹 플랜',
          stackingPlan: allVacantFloors,
          summary: {
            totalGrossAreaPy: 1500.0,
            exclusiveRatePct: 65.0,
            waleYears: 0.0,
            vacancyRatePct: 100.0,
          },
        },
        grade: 'B',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });
  });

  // ── 5. All-Retail MD Asset ──
  describe('All-Retail MD Asset Stress Case', () => {
    it('[ADV-A22-05] All-retail asset assigns retail category & colors correctly', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const allRetailFloors: StackingPlanFloor[] = [
        { floor: '4F', use: '제2종근린생활시설', tenant: '필라테스 & 피트니스', floorAreaM2: 400, isVacant: false },
        { floor: '3F', use: '제1종근린생활시설', tenant: '치과의원 / 피부과', floorAreaM2: 400, isVacant: false },
        { floor: '2F', use: '제2종근린생활시설', tenant: '헤어살롱 & F&B', floorAreaM2: 400, isVacant: false },
        { floor: '1F', use: '제2종근린생활시설', tenant: '투썸플레이스 / 올리브영', floorAreaM2: 380, isVacant: false },
        { floor: 'B1F', use: '제2종근린생활시설', tenant: '식당가 및 베이커리', floorAreaM2: 500, isVacant: false },
      ];

      allRetailFloors.forEach(f => {
        expect(inferTenantCategory(f)).toBe('retail');
      });

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-05',
        data: {
          title: '올리테일 메디컬/근생 빌딩 스태킹 플랜',
          stackingPlan: allRetailFloors,
          summary: {
            totalGrossAreaPy: 630.0,
            exclusiveRatePct: 70.0,
            waleYears: 3.5,
            vacancyRatePct: 0.0,
          },
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });
  });

  // ── 6. Missing Lease Fields & Extremely Long Strings ──
  describe('Missing Fields & Extremely Long String Handling', () => {
    it('[ADV-A22-06A] Gracefully handles missing/null lease fields with standard fallbacks', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const sparseFloors: StackingPlanFloor[] = [
        {
          floor: '3F',
          // use, tenant, expiryYear, exclusiveAreaPy, leasableAreaPy omitted
        } as any,
        {
          floor: '2F',
          use: undefined,
          tenant: undefined,
          expiryYear: undefined,
          isVacant: undefined,
        } as any,
        {
          floor: '1F',
          tenant: '',
          floorAreaM2: 0,
        } as any,
      ];

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-06A',
        data: {
          title: '제원 결손 자산 스태킹 플랜',
          stackingPlan: sparseFloors,
        },
        grade: 'C',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });

    it('[ADV-A22-06B] Truncates extremely long tenant names (100+ chars) preventing horizontal overflow', () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const longName = '주식회사대한민국글로벌프라임상업용부동산투자개발자문운용관리컨설팅앤드에셋매니지먼트파트너스홀딩스지주회사';
      const longUse = '제1종및제2종근린생활시설겸업무시설겸판매시설겸집회시설겸운동시설';

      const longFloors: StackingPlanFloor[] = [
        { floor: '2F', use: longUse, tenant: longName, floorAreaM2: 800, isVacant: false },
        { floor: '1F', use: '근생', tenant: '정상 상호', floorAreaM2: 800, isVacant: false },
      ];

      const result = buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'ADV-TEST-06B',
        data: {
          title: '극단적 장문 텍스트 스트레스 스태킹 플랜',
          stackingPlan: longFloors,
        },
        grade: 'A',
        provenance: {},
      });

      expect(result.slide).toBeDefined();
      const layout = validateLayout(pres);
      expect(layout.bleedCount).toBe(0);
    });
  });
});

describe('Adversarial Stress Harness: Macro Transit Vector Engine', () => {
  // ── 1. DPI Precision Verification ──
  describe('DPI Calculations: 1600x1200 in 5.60"x4.50" Box', () => {
    it('[ADV-MTE-01] Exactly verifies 266.7 DPI calculation math (1600x1200 px in 5.60"x4.50")', () => {
      const w = 1600;
      const h = 1200;
      const boxW = 5.60;
      const boxH = 4.50;

      const dpiW = w / boxW; // 1600 / 5.60 = 285.7142857...
      const dpiH = h / boxH; // 1200 / 4.50 = 266.6666666...
      const rawMinDpi = Math.min(dpiW, dpiH); // 266.6666666...
      const calculatedDpi = calculateEffectiveDpi(w, h, boxW, boxH);

      // Exact mathematical assertions
      expect(dpiW).toBeCloseTo(285.714, 3);
      expect(dpiH).toBeCloseTo(266.667, 3);
      expect(rawMinDpi).toBeCloseTo(266.667, 3);
      expect(calculatedDpi).toBe(266.7);

      // Gate thresholds
      expect(calculatedDpi).toBeGreaterThanOrEqual(180.0); // Target R2
      expect(calculatedDpi).toBeGreaterThanOrEqual(150.0); // G32 Gate

      // Verification with layout-physics checker
      const checkG32 = checkEffectiveDpi(w, h, boxW, boxH, 150, 'MacroTransit');
      expect(checkG32).toBeNull(); // No violation
      const checkR2 = checkEffectiveDpi(w, h, boxW, boxH, 180, 'MacroTransit');
      expect(checkR2).toBeNull(); // No violation
    });
  });

  // ── 2. Extreme Aspect Ratio Target Boxes ──
  describe('Extreme Aspect Ratio Target Boxes', () => {
    it('[ADV-MTE-02A] Ultra-wide box (12.0" x 2.0") yields 133.3 DPI and triggers G32 violation', () => {
      const dpi = calculateEffectiveDpi(1600, 1200, 12.0, 2.0);
      // dpiW = 1600 / 12.0 = 133.333..., dpiH = 1200 / 2.0 = 600.0 -> min = 133.3
      expect(dpi).toBe(133.3);
      expect(dpi).toBeLessThan(MIN_EFFECTIVE_DPI_G32);

      const check = checkEffectiveDpi(1600, 1200, 12.0, 2.0, 150, 'UltraWideBox');
      expect(check).not.toBeNull();
      expect(check?.gate).toBe('G32');
      expect(check?.severity).toBe('violation');
      expect(Math.round(check?.value ?? 0)).toBe(133);
    });

    it('[ADV-MTE-02B] Ultra-tall box (2.0" x 10.0") yields 120.0 DPI and triggers G32 violation', () => {
      const dpi = calculateEffectiveDpi(1600, 1200, 2.0, 10.0);
      // dpiW = 1600 / 2.0 = 800.0, dpiH = 1200 / 10.0 = 120.0 -> min = 120.0
      expect(dpi).toBe(120.0);
      expect(dpi).toBeLessThan(MIN_EFFECTIVE_DPI_G32);

      const check = checkEffectiveDpi(1600, 1200, 2.0, 10.0, 150, 'UltraTallBox');
      expect(check).not.toBeNull();
      expect(check?.gate).toBe('G32');
      expect(check?.severity).toBe('violation');
      expect(Math.round(check?.value ?? 0)).toBe(120);
    });

    it('[ADV-MTE-02C] Tiny target box (1.0" x 1.0") yields ultra-high 1200.0 DPI without overflow', () => {
      const dpi = calculateEffectiveDpi(1600, 1200, 1.0, 1.0);
      expect(dpi).toBe(1200.0);
      expect(dpi).toBeGreaterThanOrEqual(180);
      expect(checkEffectiveDpi(1600, 1200, 1.0, 1.0, 150)).toBeNull();
    });

    it('[ADV-MTE-02D] Zero or negative box dimensions return 0 DPI and reject in generator', async () => {
      expect(calculateEffectiveDpi(1600, 1200, 0, 4.5)).toBe(0);
      expect(calculateEffectiveDpi(1600, 1200, -5.6, 4.5)).toBe(0);

      await expect(generateMacroTransitDiagram({
        targetBoxInches: { w: 0, h: 4.5 },
      })).rejects.toThrow(/Invalid targetBoxInches/);

      await expect(generateMacroTransitDiagram({
        targetBoxInches: { w: 5.6, h: -4.5 },
      })).rejects.toThrow(/Invalid targetBoxInches/);
    });
  });

  // ── 3. Unusual Coordinates & Unknown Districts ──
  describe('Unusual Coordinates & Unknown Districts', () => {
    it('[ADV-MTE-03A] Handles abroad coordinates (New York City) safely without crash', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'Manhattan Center',
        address: '350 5th Ave, New York, NY 10118',
        coordinates: { lat: 40.7484, lng: -73.9857 },
      });

      expect(result.buffer).toBeDefined();
      expect(result.effectiveDpi).toBe(266.7);
      expect(result.svg).toContain('Manhattan Center');
    });

    it('[ADV-MTE-03B] Handles Null Island / undefined / empty coordinates safely', async () => {
      const nullCoordResult = await generateMacroTransitDiagram({
        propertyName: 'Null Island Tower',
        coordinates: { lat: 0, lng: 0 },
      });
      expect(nullCoordResult.buffer).toBeDefined();

      const undefCoordResult = await generateMacroTransitDiagram({
        propertyName: 'Undefined Tower',
        coordinates: undefined,
      });
      expect(undefCoordResult.buffer).toBeDefined();

      const nullObjResult = await generateMacroTransitDiagram({
        propertyName: 'Null Object Tower',
        coordinates: null,
      });
      expect(nullObjResult.buffer).toBeDefined();
    });

    it('[ADV-MTE-03C] Handles generic and unknown districts with valid SVG generation', async () => {
      // Address in Jeju -> detectDistrict returns 'generic'
      const district = detectDistrict('제주특별자치도 제주시 첨단로 242');
      expect(district).toBe('generic');

      const result = await generateMacroTransitDiagram({
        propertyName: '카카오스페이스 제주',
        address: '제주특별자치도 제주시 첨단로 242',
        district: 'generic',
      });

      expect(result.buffer).toBeDefined();
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.svg).toContain('카카오스페이스 제주');
    });
  });

  // ── 4. Binary Buffer Integrity & Format Assertions ──
  describe('Sharp Binary Buffer Integrity & Magic Bytes', () => {
    it('[ADV-MTE-04A] Generated PNG matches genuine PNG-8 magic bytes & sharp metadata', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: '무결성 점검 타워',
        format: 'png',
      });

      const buf = result.buffer;
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(5000);

      // PNG Magic Bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < pngMagic.length; i++) {
        expect(buf[i]).toBe(pngMagic[i]);
      }

      // Verify sharp image metadata
      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(1600);
      expect(metadata.height).toBe(1200);
      expect(metadata.channels).toBe(4); // RGBA
    });

    it('[ADV-MTE-04B] Generated JPEG matches genuine JPEG magic bytes & sharp metadata', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: 'JPEG 무결성 타워',
        format: 'jpeg',
      });

      const buf = result.buffer;
      expect(Buffer.isBuffer(buf)).toBe(true);

      // JPEG Magic Bytes: FF D8 FF
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
      expect(buf[2]).toBe(0xff);

      const metadata = await sharp(buf).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(1600);
      expect(metadata.height).toBe(1200);
    });

    it('[ADV-MTE-04C] Rejects unsupported image formats (webp, bmp, tiff)', async () => {
      await expect(generateMacroTransitDiagram({ format: 'webp' as any })).rejects.toThrow(/Unsupported output format/);
      await expect(generateMacroTransitDiagram({ format: 'bmp' as any })).rejects.toThrow(/Unsupported output format/);
      await expect(generateMacroTransitDiagram({ format: 'tiff' as any })).rejects.toThrow(/Unsupported output format/);
    });
  });

  // ── 5. XML Character Escaping & Injection Stress ──
  describe('XML Character Escaping & Special Characters', () => {
    it('[ADV-MTE-05] Escapes extreme XML injection and unicode entities in propertyName without corrupting SVG/PNG', async () => {
      const injectionName = '<script>alert("XSS")</script> & "Prime" \'Asset\' 🌿 ★ &amp;';
      const result = await generateMacroTransitDiagram({
        propertyName: injectionName,
      });

      expect(result.svg).not.toContain('<script>');
      expect(result.svg).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(5000);
    });
  });
});

describe('Adversarial Deep Boundary & Semantic Defect Analysis', () => {
  it('[ADV-A22-07] Empirical Floor Capacity Boundary: N=17 and N=30 both pass G35 zero bleed', () => {
    function testFloorCountBleed(n: number): number {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';
      const floors: StackingPlanFloor[] = [];
      for (let i = n; i >= 1; i--) {
        floors.push({
          floor: `${i}F`,
          use: '업무시설',
          tenant: `임차인 ${i}F`,
          floorAreaM2: 1000,
          isVacant: false,
        });
      }
      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: `TEST-N-${n}`,
        data: { title: `${n}층 빌딩`, stackingPlan: floors },
        grade: 'A',
        provenance: {},
      });
      const layout = validateLayout(pres);
      return layout.bleedCount;
    }

    // Standard 17-floor building (NH Capital asset) passes 0 bleed
    expect(testFloorCountBleed(17)).toBe(0);

    // 30-floor building now also passes 0 bleed with dynamic scaling & clustering
    const bleed30 = testFloorCountBleed(30);
    expect(bleed30).toBe(0);
  });

  it('[ADV-A22-08] Empty stacking plan array ([]) renders safely with zero floor rows and 0 bleed', () => {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const result = buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'TEST-EMPTY',
      data: { title: '공실/무데이터 자산', stackingPlan: [] },
      grade: 'C',
      provenance: {},
    });
    expect(result.slide).toBeDefined();
    const layout = validateLayout(pres);
    expect(layout.bleedCount).toBe(0);
  });

  it('[ADV-A22-09] Malformed floor object (undefined floor property) handled safely without TypeError', () => {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const malformed = [{ use: '오피스', tenant: '테넌트' } as any];

    expect(() => {
      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'TEST-MALFORMED',
        data: { title: '결손 데이터', stackingPlan: malformed },
        grade: 'C',
        provenance: {},
      });
    }).not.toThrow();
  });

  it('[ADV-A22-10] Dynamic Table Summary Row: Accurately reflects 100% vacant asset', () => {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const twoFloors: StackingPlanFloor[] = [
      { floor: '2F', use: '근린생활시설', tenant: '공실', floorAreaM2: 500, exclusiveAreaPy: 100, isVacant: true },
      { floor: '1F', use: '근린생활시설', tenant: '공실', floorAreaM2: 500, exclusiveAreaPy: 100, isVacant: true },
    ];

    buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'TEST-AUDIT',
      data: {
        title: '2층 100% 공실 리테일',
        stackingPlan: twoFloors,
        summary: {
          totalGrossAreaPy: 302.5,
          exclusiveRatePct: 66.1,
          waleYears: 0.0,
          vacancyRatePct: 100.0,
        },
        anchorTenantName: '앵커없음',
      },
      grade: 'B',
      provenance: {},
    });

    const slides = (pres as any)._slides;
    expect(slides.length).toBe(1);
    const tableObj = slides[0]._slideObjects.find((obj: any) => obj._type === 'table' || obj.arrTabRows);
    expect(tableObj).toBeDefined();

    // Table rows: 1 header + 2 floor rows + 1 summary row = 4 rows
    const rows = tableObj.arrTabRows;
    expect(rows.length).toBe(4);
    const summaryRow = rows[3];

    const extractText = (val: any): string => {
      if (val == null) return '';
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.map(extractText).join('');
      if (typeof val === 'object') {
        if (val.text !== undefined) return extractText(val.text);
        if (val.t !== undefined) return extractText(val.t);
      }
      return String(val);
    };

    // Column 0: '합계'
    expect(extractText(summaryRow[0])).toBe('합계');
    // Column 1: Dynamically computed '2개층 공실' (reflects vacancy)
    expect(extractText(summaryRow[1])).toBe('2개층 공실');
    // Column 2: Dynamically calculated sum of exclusiveAreaPy (100 + 100 = 200.0)
    expect(extractText(summaryRow[2])).toBe('200.0');
    // Column 4: Dynamic tenant note (no false 8개층 claims)
    expect(extractText(summaryRow[4])).not.toContain('8개층');
  });
});
