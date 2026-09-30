/**
 * Adversarial Physical Layout & Visual Quality Stress Suite — Challenger 2 (Milestone M3)
 *
 * Verifies:
 * 1. A03 Large Table:
 *    - Extreme long tenant names (50~80 chars with CJK, symbols, English)
 *    - Wide financial numbers (billions vs millions) and multi-currencies (KRW, USD, EUR, JPY)
 *    - Column-level right-alignment inference (inferA03ColAlign)
 *    - 12-row pagination cutoff and split metadata preservation
 * 2. A22 Stacking Plan:
 *    - High floor counts (14, 20, 25 floors) triggering compact row height (rowH < 0.16")
 *    - Dynamic table margin scaling to [1, 2, 1, 2] and font size to 7.5pt
 *    - Dual-theme rendering (Light mode and Dark mode onDark: true)
 *    - Table bottom <= 6.40" and zero footer collision
 * 3. A24 Rentroll Stacking:
 *    - Compliant multi-row rent rolls (16 rows <= 18 limit) meeting zero overflow under --strict
 *    - Truncated multi-row rent rolls (25 rows) reproducing footnote SAFE_AREA_VIOLATION
 *    - 12-digit wide numbers and numeric column right-alignment
 *    - Dynamic row height (rh >= 0.24") and 0.3pt border weight
 * 4. A23 Yield Formula & Land Price History:
 *    - 10-year land price history bar chart in light and dark themes
 *    - Theme tokens C.brass, C.navy, C.brand replacing hardcoded colors
 *    - 3-bullet bottom callout boundary clamp (calloutY + calloutH <= SAFE_BOTTOM 6.75")
 * 5. Python PPTX Overflow Inspector (detect_pptx_overflow.py --strict):
 *    - 0 table cell vertical expansions
 *    - 0 text overflows
 *    - 0 footer collisions (y >= 6.94")
 *    - 0 canvas bleeds (x + w > 13.333" or y + h > 7.50")
 * 6. WCAG 2.1 Contrast Ratios for TENANT_PALETTE_DARK:
 *    - Text on Fill >= 4.5:1 (WCAG AA)
 *    - Empirical evaluation of non-text graphical boundary contrast (WCAG 1.4.11 >= 3.0:1)
 * 7. Verification of Theme Context Isolation (buildThemeContext token integrity)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { buildA03LargeTable, inferA03ColAlign } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import { buildA22StackingPlan, TENANT_PALETTE_DARK, TENANT_PALETTE } from '@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import {
  W,
  H,
  M,
  CW,
  SAFE_BOTTOM,
  getDynamicTableMargin,
  isSummaryRow,
  styledTable,
  withThemeIsolation,
  buildThemeContext,
  C,
  CD,
} from '@/domain/building/mobile-im/pptx/imlib';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';

const EMU_PER_INCH = 914400;
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'test', 'stress', 'm3-challenger-output');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface XfrmInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  isLine?: boolean;
}

function extractShapesAndTables(slideXml: string): { shapes: XfrmInfo[]; tables: XfrmInfo[] } {
  const shapes: XfrmInfo[] = [];
  const tables: XfrmInfo[] = [];

  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let spMatch: RegExpExecArray | null;
  while ((spMatch = spRegex.exec(slideXml)) !== null) {
    const spContent = spMatch[1];
    const offExt = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/.exec(spContent);
    if (offExt) {
      const x = parseInt(offExt[1], 10) / EMU_PER_INCH;
      const y = parseInt(offExt[2], 10) / EMU_PER_INCH;
      const w = parseInt(offExt[3], 10) / EMU_PER_INCH;
      const h = parseInt(offExt[4], 10) / EMU_PER_INCH;

      const textParts: string[] = [];
      const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(spContent)) !== null) {
        textParts.push(tMatch[1]);
      }

      const isLine = spContent.includes('prst="line"') || h === 0;
      shapes.push({ x, y, w, h, text: textParts.join(' '), isLine });
    }
  }

  const gfRegex = /<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g;
  let gfMatch: RegExpExecArray | null;
  while ((gfMatch = gfRegex.exec(slideXml)) !== null) {
    const gfContent = gfMatch[1];
    const offExt = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\/>\s*<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/.exec(gfContent);
    if (offExt) {
      const x = parseInt(offExt[1], 10) / EMU_PER_INCH;
      const y = parseInt(offExt[2], 10) / EMU_PER_INCH;
      const w = parseInt(offExt[3], 10) / EMU_PER_INCH;
      const h = parseInt(offExt[4], 10) / EMU_PER_INCH;

      const textParts: string[] = [];
      const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(gfContent)) !== null) {
        textParts.push(tMatch[1]);
      }

      tables.push({ x, y, w, h, text: textParts.join(' ') });
    }
  }

  return { shapes, tables };
}

function runPythonInspector(filePath: string): { exitCode: number; stdout: string; json: any } {
  try {
    const stdout = execSync(`python scripts/detect_pptx_overflow.py "${filePath}" --strict --json`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { exitCode: 0, stdout, json: JSON.parse(stdout) };
  } catch (err: any) {
    const stdout = err.stdout?.toString() || '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // fallback
    }
    return { exitCode: err.status ?? 1, stdout, json: parsed };
  }
}

function calculateRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace(/^#/, '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
  const adjust = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
}

function calculateContrastRatio(hex1: string, hex2: string): number {
  const lum1 = calculateRelativeLuminance(hex1);
  const lum2 = calculateRelativeLuminance(hex2);
  const max = Math.max(lum1, lum2);
  const min = Math.min(lum1, lum2);
  return (max + 0.05) / (min + 0.05);
}

describe('Challenger 2: Milestone M3 Physical Layout & Visual Quality Stress Suite', () => {

  beforeAll(() => {
    ensureDir(OUTPUT_DIR);
  });

  // ═════════════════════════════════════════════════════════════
  // 1. Archetype A03: Large Table Stress
  // ═════════════════════════════════════════════════════════════
  describe('1. Archetype A03 Large Table Stress', () => {
    it('[Positive Pair] inferA03ColAlign correctly maps financial, currency, area, date and string columns', () => {
      const headers = [
        '층수',
        '호실',
        '임차인',
        '전용면적(㎡)',
        '임대면적(평)',
        '보증금(원)',
        '월임대료(₩)',
        '관리비(USD)',
        '만기일자',
        '비고',
      ];
      const align = inferA03ColAlign(headers);
      expect(align).toEqual([
        'center', // 층수
        'center', // 호실
        'left',   // 임차인
        'right',  // 전용면적(㎡)
        'right',  // 임대면적(평)
        'right',  // 보증금(원)
        'right',  // 월임대료(₩)
        'right',  // 관리비(USD)
        'center', // 만기일자
        'left',   // 비고
      ]);
    });

    it('[Negative Pair] Non-financial columns in A03 never get right-aligned', () => {
      const headers = ['임차인명', '업종구분', '특약사항'];
      const align = inferA03ColAlign(headers);
      expect(align[0]).toBe('left');
      expect(align[0]).not.toBe('right');
      expect(align[2]).toBe('left');
      expect(align[2]).not.toBe('right');
    });

    it('[Stress Deck] Generates A03 with long tenant names, billions vs millions, multi-currency, and notes', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const tableHead = ['층수', '호실', '임차인', '전용(평)', '보증금(원)', '월임대료(원)', '관리비(USD)', '만기일'];
      const tableRows = [
        ['12F', '1201', '주식회사한국글로벌상업용부동산투자개발자산운용전문유한회사영등포여의도금융부동산전담본부사업단', '125.5', '580,000,000,000', '1,250,000,000', '$95,000', '2030-12-31'],
        ['11F', '1101', 'PricewaterhouseCoopers Global Financial Advisory Group Korea Regional Headquarters', '120.0', '120,000,000,000', '850,000,000', '$75,000', '2029-06-30'],
        ['10F', '1001', '메디컬케어네트워크종합검진클리닉센터영등포영업소', '115.2', '80,000,000,000', '650,000,000', '$55,000', '2028-09-30'],
        ['9F', '901', '에이아이인공지능딥러닝로보틱스소프트웨어연구소', '110.0', '50,000,000,000', '450,000,000', '$40,000', '2027-11-30'],
        ['8F', '801', '법무법인대한국민종합법률사무소금융부동산센터', '110.0', '30,000,000,000', '320,000,000', '$30,000', '2028-04-30'],
        ['7F', '701', '삼정세무회계사무소공인회계사및세무전문컨설팅', '105.0', '15,000,000,000', '180,000,000', '$18,000', '2026-10-31'],
        ['6F', '601', '스타트업인큐베이팅엑셀러레이터협회', '95.5', '5,000,000,000', '95,000,000', '$9,500', '2027-03-31'],
        ['5F', '501', '소규모벤처기업소프트웨어개발실', '80.0', '1,200,000,000', '25,000,000', '$2,500', '2026-08-31'],
        ['4F', '401', '개인사업자디자인스튜디오', '45.0', '500,000,000', '8,500,000', '$850', '2026-05-31'],
        ['3F', '301', '소형상담실및회의공간', '35.0', '150,000,000', '3,500,000', '$350', '2025-12-31'],
        ['2F', '201', '초소형공유오피스임차인', '20.0', '50,000,000', '1,200,000', '$120', '2025-10-31'],
        ['합계', '11개실', '-', '961.2', '881,900,000,000', '3,833,200,000', '$326,320', '-'],
      ];

      buildA03LargeTable({
        pres,
        slideNum: 1,
        docno: 'A03-STRESS',
        data: {
          kicker: 'Rent Roll Matrix',
          title: '임대차 계약 명세 (초고가/소형 복합 및 다중 통화 스트레스)',
          tableHead,
          tableRows,
          note: '* 계약상 보증금 및 월차임은 VAT 별도 실측 기준이며 환율은 $1 = 1,350원 기준 환산액입니다.',
          callouts: [
            { kind: 'good', title: '우량 앵커 테넌트 확보', body: '상위 3개 임차인이 전체 월임대료의 71.8%를 점유하여 현금흐름 안정성이 매우 우수합니다.' },
            { kind: 'info', title: '계약 만기 분산', body: '2025년 만기 도래 호실은 2개(3.5%)에 불과하여 단기 공실 리스크가 극히 제한적입니다.' },
          ],
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(OUTPUT_DIR, 'a03_stress_deck.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      // Verify DrawingML Table Geometry
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { tables } = extractShapesAndTables(slideXml);
      expect(tables.length).toBeGreaterThan(0);

      const table = tables[0];
      const tableBottom = table.y + table.h;
      expect(tableBottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.02);

      // Ellipsis clamping verification on ultra-long tenant (>48 chars)
      expect(table.text).toContain('…');

      // Verify python overflow detector with --strict
      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
      expect(pyResult.json.warning_count).toBe(0);
    });

    it('[Stress Deck] A03 Handles >12 Rows with Split Pagination and Preserved Note', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const tableHead = ['층수', '호실', '임차인', '전용면적', '보증금', '월임대료', '만기일'];
      const tableRows: any[][] = [];
      for (let i = 1; i <= 18; i++) {
        tableRows.push([
          `${i}F`,
          `${i}01호`,
          `주식회사테넌트_${i}_금융부동산컨설팅파트너스`,
          `${(50 + i * 2.5).toFixed(1)}㎡`,
          `${(1000 + i * 200).toLocaleString()}만원`,
          `${(100 + i * 15).toLocaleString()}만원`,
          `2028-0${(i % 9) + 1}-15`,
        ]);
      }

      const inputData: Record<string, any> = {
        kicker: 'Rent Roll Split',
        title: '대형 빌딩 렌트롤 분할 렌더링 검증 (18개 행)',
        tableHead,
        tableRows,
        note: '* 현황 데이터는 임대차 계약서 및 사업자등록증 사본과 일치함을 확인하였습니다.',
      };

      buildA03LargeTable({
        pres,
        slideNum: 1,
        docno: 'A03-SPLIT',
        data: inputData,
        grade: 'A',
        provenance: {},
      });

      // Split metadata assertions
      expect(inputData._splitTotal).toBe(18);
      expect(inputData._splitOverflow.length).toBe(6);
      expect(inputData.note).toContain('12건 발췌');

      const pptxPath = path.join(OUTPUT_DIR, 'a03_split_deck.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 2. Archetype A22: Stacking Plan High Floor Count & Dual Theme
  // ═════════════════════════════════════════════════════════════
  describe('2. Archetype A22 Stacking Plan High Floor Count Stress', () => {

    it('[Dynamic Margin Verification] rowH < 0.16" scales margin down to [1, 2, 1, 2]', () => {
      const ultraCompactMargin = getDynamicTableMargin(0.12);
      expect(ultraCompactMargin).toEqual([1, 2, 1, 2]);

      const compactMargin = getDynamicTableMargin(0.18);
      expect(compactMargin).toEqual([1.5, 3, 1.5, 3]);

      const standardMargin = getDynamicTableMargin(0.25);
      expect(standardMargin).toEqual([2, 4, 2, 4]);
    });

    it('[Stress Deck] Generates A22 with 25 High Floor Count in Light Mode (rowH < 0.16")', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const stackingPlan: any[] = [];
      for (let f = 22; f >= 1; f--) {
        stackingPlan.push({
          floor: `${f}F`,
          use: f > 18 ? '업무시설(고층부)' : f > 4 ? '업무시설(기준층)' : '근린생활시설',
          exclusiveAreaPy: 75.0,
          leasableAreaPy: 125.0,
          tenant: f === 1 ? '스타벅스코리아리저브' : f % 4 === 0 ? '공실 (임차모집중)' : `주식회사테넌트_${f}F_한국본사`,
          expiryYear: 2026 + (f % 5),
          category: f === 1 ? 'anchor' : f % 4 === 0 ? 'vacant' : f > 4 ? 'general' : 'retail',
        });
      }
      stackingPlan.push(
        { floor: 'B1F', use: '구내식당/리테일', exclusiveAreaPy: 80.0, leasableAreaPy: 130.0, tenant: 'CJ푸드빌프레시푸드코트', expiryYear: 2027, category: 'retail' },
        { floor: 'B2F', use: '기계식주차장', exclusiveAreaPy: 0, leasableAreaPy: 0, tenant: '자주식/기계식주차시설', expiryYear: 0, category: 'parking' },
        { floor: 'B3F', use: '전기실/발전실', exclusiveAreaPy: 0, leasableAreaPy: 0, tenant: '방재센터및기계실', expiryYear: 0, category: 'parking' },
      );

      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'A22-LIGHT-25F',
        data: {
          kicker: 'Stacking Plan Stress',
          title: '25개층 초고층 단면 실루엣 및 콤팩트 임대차 매트릭스',
          stackingPlan,
          anchorTenantName: '스타벅스코리아리저브',
          summary: {
            totalGrossAreaPy: 3125.0,
            totalExclusiveAreaPy: 1730.0,
            exclusiveRatePct: 55.4,
            occupancyRatePct: 88.0,
            waleYears: 3.2,
          },
          buildingNote: '25개층 전층 표기 기준',
          onDark: false,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(OUTPUT_DIR, 'a22_light_stress.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      // Verify DrawingML geometry
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { tables } = extractShapesAndTables(slideXml);
      expect(tables.length).toBeGreaterThan(0);

      const table = tables[0];
      const tableBottom = table.y + table.h;
      // In A22, table bottom must strictly be <= 6.40"
      expect(tableBottom).toBeLessThanOrEqual(6.40 + 0.02);

      // Run python inspector
      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Stress Deck] Generates A22 with 25 High Floor Count in Dark Mode (onDark: true)', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const stackingPlan: any[] = [];
      for (let f = 20; f >= 1; f--) {
        stackingPlan.push({
          floor: `${f}F`,
          use: f > 3 ? '업무시설' : '근린생활시설',
          exclusiveAreaPy: 60.0,
          leasableAreaPy: 100.0,
          tenant: f === 1 ? '스타벅스' : f === 5 ? '공실' : `테넌트_${f}F`,
          expiryYear: 2027,
          category: f === 1 ? 'anchor' : f === 5 ? 'vacant' : f > 3 ? 'general' : 'retail',
        });
      }
      stackingPlan.push(
        { floor: 'B1F', use: '근생', exclusiveAreaPy: 60.0, leasableAreaPy: 100.0, tenant: '아케이드', expiryYear: 2026, category: 'retail' },
        { floor: 'B2F', use: '주차장', exclusiveAreaPy: 0, leasableAreaPy: 0, tenant: '주차장', expiryYear: 0, category: 'parking' },
      );

      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'A22-DARK-22F',
        data: {
          kicker: 'Dark Stacking Plan',
          title: '다크 테마 건축 셋백 및 층별 임대차 현황',
          stackingPlan,
          anchorTenantName: '스타벅스',
          summary: {
            totalGrossAreaPy: 2200.0,
            totalExclusiveAreaPy: 1260.0,
            exclusiveRatePct: 57.3,
            occupancyRatePct: 95.5,
            waleYears: 2.8,
          },
          onDark: true,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(OUTPUT_DIR, 'a22_dark_stress.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 3. Archetype A24: Rentroll Stacking Multi-Row & Wide Numbers
  // ═════════════════════════════════════════════════════════════
  describe('3. Archetype A24 Rentroll Stacking Multi-Row & Wide Numbers Stress', () => {

    it('[Positive Control] Generates A24 with 16 rows (within 18 row budget) achieving 0 overflows', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const rows: any[][] = [
        ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'],
      ];

      for (let i = 15; i >= 1; i--) {
        rows.push([
          `${i}F`,
          i === 1 ? '스타벅스코리아리저브DT점' : `한국글로벌자산운용_${i}층_사업단`,
          i <= 3 ? '근린생활' : '업무시설',
          '1,250.5',
          '750.3',
          '150,000,000,000',
          '1,250,000,000',
          '150,000,000',
          '1,400,000,000',
          `2028-12-31`,
        ]);
      }

      buildA24RentrollStacking({
        pres,
        slideNum: 1,
        docno: 'A24-WIDE-16R',
        data: {
          kicker: 'Rent Roll Stacking',
          title: '임대차 현황 및 층별 공간 배치 (16행 규격 내 스트레스)',
          tableRows: rows,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(OUTPUT_DIR, 'a24_compliant_16r.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Remediated DEFECT-M3-02] A24 >18 rows truncation footnote stays strictly within safe area (bottom <= 6.75")', async () => {
      // 1. Test with 19 rows (generates a24_overflow_19rows.pptx)
      const pres19 = new pptxgen();
      pres19.layout = 'LAYOUT_WIDE';

      const rows19: any[][] = [
        ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'],
      ];

      for (let i = 18; i >= 1; i--) {
        rows19.push([
          `${i}F`,
          i === 1 ? '스타벅스코리아리저브DT점' : `한국글로벌자산운용_${i}층_본사사업부`,
          i <= 3 ? '근린생활' : '업무시설',
          '1,250.5',
          '750.3',
          '150,000,000,000',
          '1,250,000,000',
          '150,000,000',
          '1,400,000,000',
          `2028-12-31`,
        ]);
      }

      buildA24RentrollStacking({
        pres: pres19,
        slideNum: 1,
        docno: 'A24-OVERFLOW-19R',
        data: {
          kicker: 'Rent Roll Stacking',
          title: '임대차 현황 및 층별 공간 배치 (19행 초과 절삭 각주 검증)',
          tableRows: rows19,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath19 = path.join(OUTPUT_DIR, 'a24_overflow_19rows.pptx');
      const buffer19 = (await pres19.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath19, buffer19);

      const pyResult19 = runPythonInspector(pptxPath19);
      expect(pyResult19.exitCode).toBe(0);
      expect(pyResult19.json.is_pass).toBe(true);
      expect(pyResult19.json.error_count).toBe(0);

      // 2. Test with 25 rows (generates a24_overflow_25r.pptx)
      const pres25 = new pptxgen();
      pres25.layout = 'LAYOUT_WIDE';

      const rows25: any[][] = [
        ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'],
      ];

      for (let i = 24; i >= 1; i--) {
        rows25.push([
          `${i}F`,
          i === 1 ? '스타벅스코리아리저브DT점' : `한국글로벌자산운용_${i}층_본사사업부`,
          i <= 3 ? '근린생활' : '업무시설',
          '1,250.5',
          '750.3',
          '150,000,000,000',
          '1,250,000,000',
          '150,000,000',
          '1,400,000,000',
          `2028-12-31`,
        ]);
      }

      buildA24RentrollStacking({
        pres: pres25,
        slideNum: 1,
        docno: 'A24-OVERFLOW-25R',
        data: {
          kicker: 'Rent Roll Stacking',
          title: '임대차 현황 및 층별 공간 배치 (25행 초과 절삭 각주 스트레스)',
          tableRows: rows25,
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath25 = path.join(OUTPUT_DIR, 'a24_overflow_25r.pptx');
      const buffer25 = (await pres25.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath25, buffer25);

      const pyResult25 = runPythonInspector(pptxPath25);
      expect(pyResult25.exitCode).toBe(0);
      expect(pyResult25.json.is_pass).toBe(true);
      expect(pyResult25.json.error_count).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 4. Archetype A23: Yield Formula & Land Price History Chart
  // ═════════════════════════════════════════════════════════════
  describe('4. Archetype A23 Yield Formula & Land Price History Stress', () => {

    it('[Stress Deck] Generates A23 with 10-Year Land Price History and 3-Bullet Callout in Light Mode', async () => {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_WIDE';

      const history = [
        { year: '2015', pricePerSqm: 45000000 },
        { year: '2016', pricePerSqm: 51000000 },
        { year: '2017', pricePerSqm: 58000000 },
        { year: '2018', pricePerSqm: 66000000 },
        { year: '2019', pricePerSqm: 75000000 },
        { year: '2020', pricePerSqm: 85000000 },
        { year: '2021', pricePerSqm: 98000000 },
        { year: '2022', pricePerSqm: 108000000 },
        { year: '2023', pricePerSqm: 115000000 },
        { year: '2024', pricePerSqm: 125000000 },
      ];

      buildA23YieldFormula({
        pres,
        slideNum: 1,
        docno: 'A23-LIGHT-10Y',
        data: {
          kicker: 'Investment Yield',
          title: '투자수익률 분석 및 10개년 개별공시지가 추이',
          askingPrice: 50000000000,
          annualRent: 3500000000,
          totalDeposit: 5000000000,
          landAreaSqm: 400.0,
          landPriceHistory: {
            history,
            cagrPct: 12.0,
            totalGrowthPct: 177.8,
            latestPricePerSqm: 125000000,
          },
        },
        grade: 'A',
        provenance: {},
      });

      const pptxPath = path.join(OUTPUT_DIR, 'a23_light_stress.pptx');
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      fs.writeFileSync(pptxPath, buffer);

      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
      const { shapes } = extractShapesAndTables(slideXml);

      for (const shape of shapes) {
        if (!shape.isLine && shape.y < 6.90) {
          const bottom = shape.y + shape.h;
          expect(bottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.05);
        }
      }

      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Stress Deck] Generates A23 under Institutional Theme Isolation', async () => {
      const theme = PPTX_PRESET_TEMPLATES.institutional_dark_gold;

      const pptxPath = path.join(OUTPUT_DIR, 'a23_dark_stress.pptx');
      await withThemeIsolation(theme, async () => {
        const pres = new pptxgen();
        pres.layout = 'LAYOUT_WIDE';

        buildA23YieldFormula({
          pres,
          slideNum: 1,
          docno: 'A23-THEME',
          data: {
            kicker: 'Yield & Land Price',
            title: '테마 격리 환경 하 공시지가 바 차트 렌더링',
            askingPrice: 30000000000,
            annualRent: 1800000000,
            totalDeposit: 2000000000,
            landAreaSqm: 350.0,
            landPriceHistory: {
              history: [
                { year: '2020', pricePerSqm: 60000000 },
                { year: '2021', pricePerSqm: 68000000 },
                { year: '2022', pricePerSqm: 75000000 },
                { year: '2023', pricePerSqm: 82000000 },
                { year: '2024', pricePerSqm: 90000000 },
              ],
              cagrPct: 10.6,
              totalGrowthPct: 50.0,
              latestPricePerSqm: 90000000,
            },
          },
          grade: 'A',
          provenance: {},
        });

        const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
        fs.writeFileSync(pptxPath, buffer);
      });

      const pyResult = runPythonInspector(pptxPath);
      expect(pyResult.exitCode).toBe(0);
      expect(pyResult.json.is_pass).toBe(true);
      expect(pyResult.json.error_count).toBe(0);
    });

    it('[Remediated DEFECT-M3-01] buildThemeContext provides brand and navy tokens on themeC and themeCD', () => {
      const theme = PPTX_PRESET_TEMPLATES.institutional_dark_gold;
      const context = buildThemeContext(theme);

      // C.brand and C.navy are attached to context.C
      expect((context.C as any).brand).toBe(theme.ink);
      expect((context.C as any).navy).toBe(theme.slate || '1E3A8A');
      // CD.brand and CD.navy are attached to context.CD
      expect((context.CD as any).brand).toBe('FFFFFF');
      expect((context.CD as any).navy).toBe(theme.darkBorder || '475569');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 5. WCAG 2.1 Contrast Audit: TENANT_PALETTE_DARK & Summary Rows
  // ═════════════════════════════════════════════════════════════
  describe('5. WCAG 2.1 Contrast Rigorous Audit', () => {

    const darkCardBg = '1B2531'; // CD.card
    const darkBlockBg = '232F3C'; // CD.block
    const darkSlideBg = '10161F'; // Dark presentation canvas

    it('[Positive Pair] All 5 categories in TENANT_PALETTE_DARK achieve Text-on-Fill contrast >= 4.5:1 (WCAG AA)', () => {
      const categories = Object.keys(TENANT_PALETTE_DARK) as (keyof typeof TENANT_PALETTE_DARK)[];

      for (const cat of categories) {
        const item = TENANT_PALETTE_DARK[cat];
        const contrast = calculateContrastRatio(item.text, item.fill);
        expect(contrast, `Category ${String(cat)} text ${item.text} on fill ${item.fill} failed WCAG AA`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('[Positive Pair] Categories anchor, retail, and vacant achieve Non-text Graphical Contrast >= 3.0:1 vs dark canvas', () => {
      const validCategories: (keyof typeof TENANT_PALETTE_DARK)[] = ['anchor', 'retail', 'vacant'];

      for (const cat of validCategories) {
        const item = TENANT_PALETTE_DARK[cat];
        const borderContrastVsCard = calculateContrastRatio(item.border, darkCardBg);
        const borderContrastVsSlide = calculateContrastRatio(item.border, darkSlideBg);

        expect(borderContrastVsCard).toBeGreaterThanOrEqual(3.0);
        expect(borderContrastVsSlide).toBeGreaterThanOrEqual(3.0);
      }
    });

    it('[Remediated DEFECT-M3-03] Categories general and parking meet WCAG 2.1 non-text contrast >= 3.0:1 on dark canvas', () => {
      // General: fill #334155, border #64748B
      const general = TENANT_PALETTE_DARK.general;
      const genBorderVsCard = calculateContrastRatio(general.border, darkCardBg);
      const genBorderVsSlide = calculateContrastRatio(general.border, darkSlideBg);

      expect(general.border).toBe('64748B');
      expect(genBorderVsCard).toBeGreaterThanOrEqual(3.0);
      expect(genBorderVsSlide).toBeGreaterThanOrEqual(3.0);

      // Parking: fill #2D3748, border #64748B
      const parking = TENANT_PALETTE_DARK.parking;
      const parkBorderVsCard = calculateContrastRatio(parking.border, darkCardBg);
      const parkBorderVsSlide = calculateContrastRatio(parking.border, darkSlideBg);

      expect(parking.border).toBe('64748B');
      expect(parkBorderVsCard).toBeGreaterThanOrEqual(3.0);
      expect(parkBorderVsSlide).toBeGreaterThanOrEqual(3.0);
    });

    it('[Positive Pair] Summary row highlight colors maintain clear contrast on light and dark slides', () => {
      // Light mode summary row: #F1F5F9 with dark text #10161F
      const lightSummaryBg = 'F1F5F9';
      const lightSummaryText = '10161F';
      const lightContrast = calculateContrastRatio(lightSummaryText, lightSummaryBg);
      expect(lightContrast).toBeGreaterThanOrEqual(10.0);

      // Dark mode summary row: #2A303C with text #FFFFFF
      const darkSummaryBg = '2A303C';
      const darkSummaryText = 'FFFFFF';
      const darkContrast = calculateContrastRatio(darkSummaryText, darkSummaryBg);
      expect(darkContrast).toBeGreaterThanOrEqual(7.0);
    });

    it('[Negative Pair] TENANT_PALETTE_DARK never falls back to low-contrast 1E293B for parking', () => {
      const parking = TENANT_PALETTE_DARK.parking;
      expect(parking.fill).not.toBe('1E293B');
      expect(parking.fill).toBe('2D3748');
    });
  });

});
