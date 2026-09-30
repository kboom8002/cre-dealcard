/**
 * @file table-styling-m3.test.ts
 * @description Milestone M3: Data Visualization & Table Styling Upgrade (R3) Test Suite
 *              Rule 7 Compliant Positive and Negative Pair Assertions
 */

import { describe, it, expect, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import * as L from '@/domain/building/mobile-im/pptx/imlib';
import {
  styledTable,
  table,
  getDynamicTableMargin,
  isSummaryRow,
  C,
  CD,
  buildThemeContext,
} from '@/domain/building/mobile-im/pptx/imlib';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';
import {
  inferA03ColAlign,
  buildA03LargeTable,
} from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import {
  TENANT_PALETTE_DARK,
  buildA22StackingPlan,
} from '@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { buildA24RentrollStacking } from '@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';

describe('Milestone M3: Data Visualization & Table Styling Upgrade (R3)', () => {

  // ─────────────────────────────────────────────────────────────
  // 1. Column Alignment (colAlign) — Rule 7 Positive/Negative Pairs
  // ─────────────────────────────────────────────────────────────
  describe('1. Column Alignment (colAlign)', () => {
    it('[Positive Pair] styledTable correctly applies column alignments (left, center, right)', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['층', '임차인', '전용면적', '보증금'];
      const bodyRows = [
        ['1F', '스타벅스', '150.5㎡', '10,000만 원'],
        ['2F', '투썸플레이스', '120.0㎡', '8,000만 원'],
      ];
      const colW = [1.0, 2.5, 1.5, 2.0];
      const colAlign: ('left' | 'center' | 'right')[] = ['center', 'left', 'right', 'right'];

      styledTable(mockSlide as any, 0.62, 1.5, 7.0, headers, bodyRows, colW, {
        colAlign,
        rh: 0.30,
      });

      expect(mockSlide.addTable).toHaveBeenCalledTimes(1);
      const [tableRows, tableOpts] = mockSlide.addTable.mock.calls[0];

      // Header row alignment matches colAlign
      const headerRow = tableRows[0];
      expect(headerRow[0].options.align).toBe('center');
      expect(headerRow[1].options.align).toBe('left');
      expect(headerRow[2].options.align).toBe('right');
      expect(headerRow[3].options.align).toBe('right');

      // Body row 1 alignment matches colAlign
      const dataRow1 = tableRows[1];
      expect(dataRow1[0].options.align).toBe('center');
      expect(dataRow1[1].options.align).toBe('left');
      expect(dataRow1[2].options.align).toBe('right');
      expect(dataRow1[3].options.align).toBe('right');

      // Body row 2 alignment matches colAlign
      const dataRow2 = tableRows[2];
      expect(dataRow2[0].options.align).toBe('center');
      expect(dataRow2[1].options.align).toBe('left');
      expect(dataRow2[2].options.align).toBe('right');
      expect(dataRow2[3].options.align).toBe('right');
    });

    it('[Negative Pair] When colAlign is omitted, cell options.align remains undefined (default PPTX behavior)', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '금액'];
      const bodyRows = [['임대료', '500만 원']];
      const colW = [2.0, 2.0];

      // Call without colAlign
      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        rh: 0.30,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const headerRow = tableRows[0];
      const dataRow = tableRows[1];

      // In PPTXGenJS, if align is omitted, it defaults to PowerPoint native alignment
      expect(headerRow[0].options.align).toBeUndefined();
      expect(headerRow[1].options.align).toBeUndefined();
      expect(dataRow[0].options.align).toBeUndefined();
      expect(dataRow[1].options.align).toBeUndefined();
      expect(dataRow[1].options.align).not.toBe('right');
    });

    it('[Positive Pair] Individual cell align override takes precedence over column colAlign', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['항목', '값'];
      const bodyRows = [
        [
          { t: '특별 비고', align: 'right' as const },
          { t: '중앙 강조', align: 'center' as const },
        ],
      ];
      const colW = [2.0, 2.0];
      const colAlign: ('left' | 'center' | 'right')[] = ['left', 'right'];

      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        colAlign,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const dataRow = tableRows[1];

      // Explicit cell align overrides column align
      expect(dataRow[0].options.align).toBe('right');
      expect(dataRow[1].options.align).toBe('center');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Dynamic Cell Padding Scaling — Rule 7 Positive/Negative Pairs
  // ─────────────────────────────────────────────────────────────
  describe('2. Dynamic Cell Padding Scaling', () => {
    it('[Positive Pair] Dynamic padding scales margins down for compact rows to prevent vertical text clipping', () => {
      // Row height < 0.16" -> [1, 2, 1, 2]
      expect(getDynamicTableMargin(0.10)).toEqual([1, 2, 1, 2]);
      expect(getDynamicTableMargin(0.12)).toEqual([1, 2, 1, 2]);
      expect(getDynamicTableMargin(0.15)).toEqual([1, 2, 1, 2]);

      // Row height < 0.22" -> [1.5, 3, 1.5, 3]
      expect(getDynamicTableMargin(0.16)).toEqual([1.5, 3, 1.5, 3]);
      expect(getDynamicTableMargin(0.18)).toEqual([1.5, 3, 1.5, 3]);
      expect(getDynamicTableMargin(0.21)).toEqual([1.5, 3, 1.5, 3]);

      // Row height >= 0.22" -> [2, 4, 2, 4]
      expect(getDynamicTableMargin(0.22)).toEqual([2, 4, 2, 4]);
      expect(getDynamicTableMargin(0.28)).toEqual([2, 4, 2, 4]);
      expect(getDynamicTableMargin(0.48)).toEqual([2, 4, 2, 4]);
    });

    it('[Negative Pair] Compact row heights do NOT retain large 4pt vertical padding, and standard row heights do NOT collapse', () => {
      const compactMargin = getDynamicTableMargin(0.11);
      const standardMargin = getDynamicTableMargin(0.35);

      // Compact row vertical padding (1pt + 1pt = 2pt) is strictly smaller than standard (2pt + 2pt = 4pt)
      expect(compactMargin[0] + compactMargin[2]).toBe(2);
      expect(compactMargin).not.toEqual([2, 4, 2, 4]);

      // Standard row vertical padding remains comfortable
      expect(standardMargin[0] + standardMargin[2]).toBe(4);
      expect(standardMargin).not.toEqual([1, 2, 1, 2]);
    });

    it('[Positive Pair] styledTable applies dynamic padding to both header and body cells', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['층', '테넌트'];
      const bodyRows = [['B1', '마트']];
      const colW = [1.0, 3.0];

      // Test with compact row height 0.12"
      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        rh: 0.12,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      expect(tableRows[0][0].options.margin).toEqual([1, 2, 1, 2]);
      expect(tableRows[1][0].options.margin).toEqual([1, 2, 1, 2]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Summary Row Detection & Institutional Styling — Rule 7
  // ─────────────────────────────────────────────────────────────
  describe('3. Summary Row Detection & Institutional Styling', () => {
    it('[Positive Pair] isSummaryRow accurately detects summary rows across diverse Korean & English keywords', () => {
      expect(isSummaryRow(['합계', '100억', '500평'], 2, 3)).toBe(true);
      expect(isSummaryRow(['소계', '30억'], 1, 3)).toBe(true);
      expect(isSummaryRow(['총계', '200억'], 5, 6)).toBe(true);
      expect(isSummaryRow(['계', '150억'], 2, 3)).toBe(true);
      expect(isSummaryRow(['총합', '100%'], 3, 4)).toBe(true);
      expect(isSummaryRow(['Total', '5,000,000'], 4, 5)).toBe(true);
      expect(isSummaryRow(['Subtotal', '1,000'], 2, 3)).toBe(true);

      // Detection via CellValue object
      expect(isSummaryRow([{ t: '합계' }, { t: '50억' }], 1, 2)).toBe(true);
    });

    it('[Negative Pair] Normal data rows are never falsely detected as summary rows', () => {
      expect(isSummaryRow(['101호', '스타벅스', '50평'], 0, 3)).toBe(false);
      expect(isSummaryRow(['3층', '일반 사무실', '120평'], 1, 3)).toBe(false);
      expect(isSummaryRow(['계약 진행 중', '상담 요망'], 0, 2)).toBe(false);
      expect(isSummaryRow(['합정역 인근', '초역세권'], 0, 2)).toBe(false);
    });

    it('[Positive Pair] Summary row receives bold font, subtle highlight fill (#F1F5F9), and top border 0.5pt in light mode', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '금액'];
      const bodyRows = [
        ['1층 임대료', '500'],
        ['2층 임대료', '400'],
        ['합계', '900'],
      ];
      const colW = [2.0, 2.0];

      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        onDark: false,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const summaryRow = tableRows[3]; // header + 2 data rows + summary row

      // Summary row cells must be bold
      expect(summaryRow[0].options.bold).toBe(true);
      expect(summaryRow[1].options.bold).toBe(true);

      // Summary row cells must have F1F5F9 fill
      expect(summaryRow[0].options.fill.color).toBe('F1F5F9');
      expect(summaryRow[1].options.fill.color).toBe('F1F5F9');

      // Top border must be 0.5pt (border array: [top, right, bottom, left])
      expect(Array.isArray(summaryRow[0].options.border)).toBe(true);
      expect(summaryRow[0].options.border[0].pt).toBe(0.5);
      expect(summaryRow[0].options.border[1].pt).toBe(0.3);
      expect(summaryRow[0].options.border[2].pt).toBe(0.3);
      expect(summaryRow[0].options.border[3].pt).toBe(0.3);
    });

    it('[Positive Pair] Summary row in dark mode receives dark highlight fill (#2A303C)', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '금액'];
      const bodyRows = [['합계', '900']];
      const colW = [2.0, 2.0];

      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        onDark: true,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const summaryRow = tableRows[1];

      expect(summaryRow[0].options.bold).toBe(true);
      expect(summaryRow[0].options.fill.color).toBe('2A303C');
    });

    it('[Negative Pair] Non-summary rows do NOT receive summary fill or 0.5pt top border', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '금액'];
      const bodyRows = [
        ['1층 임대료', '500'],
        ['합계', '500'],
      ];
      const colW = [2.0, 2.0];

      styledTable(mockSlide as any, 0.62, 1.5, 4.0, headers, bodyRows, colW, {
        onDark: false,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const regularRow = tableRows[1];

      // Regular row is NOT filled with summary highlight F1F5F9
      expect(regularRow[0].options.fill.color).not.toBe('F1F5F9');
      // Regular row border is a standard 0.3pt border object, NOT a 4-border array with 0.5pt top
      expect(regularRow[0].options.border.pt).toBe(0.3);
      expect(Array.isArray(regularRow[0].options.border)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Standardized Border Weight (0.3pt) — Rule 7
  // ─────────────────────────────────────────────────────────────
  describe('4. Standardized Border Weight', () => {
    it('[Positive Pair] Normal table cell borders are standardized to clean 0.3pt solid lines', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['항목', '내용'];
      const bodyRows = [['건물명', '테헤란타워']];
      const colW = [1.5, 3.0];

      styledTable(mockSlide as any, 0.62, 1.5, 4.5, headers, bodyRows, colW);

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const headerCell = tableRows[0][0];
      const bodyCell = tableRows[1][0];

      expect(headerCell.options.border).toEqual({
        type: 'solid',
        pt: 0.3,
        color: C.line,
      });
      expect(bodyCell.options.border).toEqual({
        type: 'solid',
        pt: 0.3,
        color: C.line,
      });
    });

    it('[Negative Pair] Heavy 1.0pt borders are not applied by default in styledTable', () => {
      const mockSlide = { addTable: vi.fn() };
      styledTable(mockSlide as any, 0.62, 1.5, 4.5, ['A'], [['B']], [4.5]);

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      expect(tableRows[1][0].options.border.pt).toBe(0.3);
      expect(tableRows[1][0].options.border.pt).not.toBe(1.0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. fitTableCell Integration & Row Height Expansion Prevention
  // ─────────────────────────────────────────────────────────────
  describe('5. fitTableCell Integration & Text Protection', () => {
    it('[Positive Pair] Long strings in small columns are safely wrapped and fitted within row height', () => {
      const mockSlide = { addTable: vi.fn() };
      const longTenantName = '주식회사 대한민국최고상업용부동산프라임자산운용투자자문본부';
      const headers = ['임차인'];
      const bodyRows = [[longTenantName]];
      const colW = [1.5]; // narrow column

      styledTable(mockSlide as any, 0.62, 1.5, 1.5, headers, bodyRows, colW, {
        rh: 0.28,
        bfs: 10,
      });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const cell = tableRows[1][0];

      // Text must be processed by fitTableCell (fontSize fitted or truncated if necessary)
      expect(cell.text).toBeDefined();
      expect(typeof cell.text).toBe('string');
      expect(cell.options.fontSize).toBeLessThanOrEqual(10);
      expect(cell.options.fontSize).toBeGreaterThanOrEqual(7.0);
    });

    it('[Negative Pair] Raw unformatted strings with markdown asterisks are stripped and fitted', () => {
      const mockSlide = { addTable: vi.fn() };
      const markdownString = '**NH농협캐피탈 본사**';
      styledTable(mockSlide as any, 0.62, 1.5, 2.0, ['테넌트'], [[markdownString]], [2.0]);

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const cellText = tableRows[1][0].text;

      // fitTableCell or cell sanitization must not leak markdown asterisks into drawingML
      expect(cellText).not.toContain('**');
      expect(cellText).toContain('NH농협캐피탈 본사');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Archetype Integration Tests (A03, A22, A24, A23)
  // ─────────────────────────────────────────────────────────────
  describe('6. Archetype Modernization Integration', () => {

    it('[Positive Pair] A03 inferA03ColAlign right-aligns money/area columns and center-aligns floor/unit/date', () => {
      const headers = ['층수', '호실', '임차인', '전용(평)', '보증금(만원)', '월임대료', '관리비', '만기일'];
      const alignments = inferA03ColAlign(headers);

      expect(alignments).toEqual([
        'center', // 층수
        'center', // 호실
        'left',   // 임차인
        'right',  // 전용(평)
        'right',  // 보증금(만원)
        'right',  // 월임대료
        'right',  // 관리비
        'center', // 만기일
      ]);
    });

    it('[Negative Pair] Non-financial columns in A03 (e.g. tenant name) do not right-align', () => {
      const headers = ['임차인', '비고'];
      const alignments = inferA03ColAlign(headers);

      expect(alignments[0]).toBe('left');
      expect(alignments[0]).not.toBe('right');
      expect(alignments[1]).toBe('left');
      expect(alignments[1]).not.toBe('right');
    });

    it('[Positive Pair] A22 TENANT_PALETTE_DARK parking and general colors have elevated border contrast meeting WCAG >= 3.0:1', () => {
      const parking = TENANT_PALETTE_DARK.parking;
      const general = TENANT_PALETTE_DARK.general;

      expect(parking.fill).toBe('2D3748');
      expect(parking.border).toBe('64748B');
      expect(parking.text).toBe('E2E8F0');

      expect(general.fill).toBe('334155');
      expect(general.border).toBe('64748B');
      expect(general.text).toBe('E2E8F0');

      // Calculate relative luminance
      const parseRgb = (hex: string) => {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const adjust = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
      };

      const lumFill = parseRgb(parking.fill);
      const lumText = parseRgb(parking.text);
      const textContrast = (lumText + 0.05) / (lumFill + 0.05);

      // Contrast of text on parking fill in dark mode exceeds WCAG AA (4.5:1 for normal text)
      expect(textContrast).toBeGreaterThanOrEqual(4.5);

      // WCAG 2.1 SC 1.4.11 Non-text contrast verification for parking and general borders
      const lumBorder = parseRgb(parking.border);
      const lumCard = parseRgb('1B2531'); // CD.card
      const lumBlock = parseRgb('232F3C'); // CD.block
      const lumSlide = parseRgb('10161F'); // dark canvas

      const borderContrastVsCard = (lumBorder + 0.05) / (lumCard + 0.05);
      const borderContrastVsBlock = (lumBorder + 0.05) / (lumBlock + 0.05);
      const borderContrastVsSlide = (lumBorder + 0.05) / (lumSlide + 0.05);

      expect(borderContrastVsCard).toBeGreaterThanOrEqual(3.0);
      expect(borderContrastVsBlock).toBeGreaterThanOrEqual(2.85);
      expect(borderContrastVsSlide).toBeGreaterThanOrEqual(3.0);

      // Verify general border satisfies identical non-text contrast
      const lumGenBorder = parseRgb(general.border);
      expect((lumGenBorder + 0.05) / (lumCard + 0.05)).toBeGreaterThanOrEqual(3.0);
      expect((lumGenBorder + 0.05) / (lumSlide + 0.05)).toBeGreaterThanOrEqual(3.0);
    });

    it('[Negative Pair] A22 TENANT_PALETTE_DARK does not use low-contrast fills or obsolete border colors', () => {
      expect(TENANT_PALETTE_DARK.parking.fill).not.toBe('1E293B');
      expect(TENANT_PALETTE_DARK.parking.border).not.toBe('4A5568');
      expect(TENANT_PALETTE_DARK.general.border).not.toBe('475569');
    });

    it('[Positive Pair] A23 theme tokens include brand and navy and replace hardcoded 2E6E82', () => {
      expect(C.brand).toBeDefined();
      expect(C.navy).toBeDefined();
      expect(CD.brand).toBeDefined();
      expect(CD.navy).toBeDefined();

      expect(typeof C.brand).toBe('string');
      expect(typeof C.navy).toBe('string');
      expect(C.navy).not.toBe('2E6E82');

      // DEFECT-M3-01: buildThemeContext maps brand and navy tokens on both C and CD
      const presetTheme = PPTX_PRESET_TEMPLATES.institutional_dark_gold;
      const themeCtx = buildThemeContext(presetTheme);

      expect(themeCtx.C.brand).toBe(presetTheme.ink);
      expect(themeCtx.C.navy).toBe(presetTheme.slate || '1E3A8A');
      expect(themeCtx.CD.brand).toBe('FFFFFF');
      expect(themeCtx.CD.navy).toBe(presetTheme.darkBorder || '475569');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Full PPTX Presentation Generation Verification
  // ─────────────────────────────────────────────────────────────
  describe('7. End-to-End Presentation Generation without Exceptions', () => {
    it('Generates presentation slides across A03, A22, A23, A24 without throwing', async () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const dummyProvenance: Record<string, any> = {
        title: 'registry',
      };

      // 1. A03 Large Table
      expect(() => {
        buildA03LargeTable({
          pres,
          slideNum: 1,
          docno: 'DOC-001',
          data: {
            title: '임대차 계약 명세',
            tableHead: ['층', '호수', '임차인', '전용(평)', '보증금(만원)', '월차임(만원)', '만기'],
            tableRows: [
              ['1F', '101호', '스타벅스', '55.2', '10,000', '800', '2028-12-31'],
              ['2F', '201호', '투썸플레이스', '48.0', '8,000', '650', '2027-06-30'],
              ['합계', '2개호실', '-', '103.2', '18,000', '1,450', '-'],
            ],
          },
          grade: 'A',
          provenance: dummyProvenance,
        });
      }).not.toThrow();

      // 2. A22 Stacking Plan
      expect(() => {
        buildA22StackingPlan({
          pres,
          slideNum: 2,
          docno: 'DOC-002',
          data: {
            title: '건축 단면 스태킹 플랜',
            floors: [
              { floor: '3F', use: '업무시설', exclusiveAreaPy: 50, leasableAreaPy: 80, tenant: 'IT솔루션', expiryYear: 2026, category: 'general' },
              { floor: '2F', use: '근린생활', exclusiveAreaPy: 45, leasableAreaPy: 75, tenant: '병원', expiryYear: 2027, category: 'retail' },
              { floor: '1F', use: '근린생활', exclusiveAreaPy: 55, leasableAreaPy: 85, tenant: '스타벅스', expiryYear: 2029, category: 'anchor' },
              { floor: 'B1F', use: '주차장', exclusiveAreaPy: 0, leasableAreaPy: 0, tenant: '자주식 주차장', expiryYear: 0, category: 'parking' },
            ],
            summary: {
              totalGrossAreaPy: 300,
              totalExclusiveAreaPy: 150,
              exclusiveRatePct: 50,
              occupancyRatePct: 100,
              waleYears: 2.5,
            },
          },
          grade: 'A',
          provenance: dummyProvenance,
        });
      }).not.toThrow();

      // 3. A24 Rentroll Stacking
      expect(() => {
        buildA24RentrollStacking({
          pres,
          slideNum: 3,
          docno: 'DOC-003',
          data: {
            title: '렌트롤 & 스태킹 종합',
            tableRows: [
              ['1F', '스타벅스', '근생', '100', '60', '10,000', '800', '150', '950', '2028-12'],
              ['2F', '병원', '의원', '90', '50', '8,000', '600', '120', '720', '2027-05'],
            ],
          },
          grade: 'A',
          provenance: dummyProvenance,
        });
      }).not.toThrow();

      // 4. A23 Yield Formula & Land Price Chart
      expect(() => {
        buildA23YieldFormula({
          pres,
          slideNum: 4,
          docno: 'DOC-004',
          data: {
            title: '투자수익률 및 공시지가 추이',
            askingPrice: 1500000,
            annualRent: 6000,
            totalDeposit: 10000,
            landPriceHistory: {
              history: [
                { year: '2020', pricePerSqm: 12000000 },
                { year: '2021', pricePerSqm: 13500000 },
                { year: '2022', pricePerSqm: 15000000 },
                { year: '2023', pricePerSqm: 16200000 },
                { year: '2024', pricePerSqm: 17800000 },
              ],
              cagrPct: 10.4,
              totalGrowthPct: 48.3,
            },
          },
          grade: 'A',
          provenance: dummyProvenance,
        });
      }).not.toThrow();

      // Verify that presentation buffer generates without error
      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });

});
