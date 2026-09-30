/**
 * @file table-styling-adversarial-m3.test.ts
 * @description Adversarial Challenge & Stress Test Suite for Milestone M3:
 *              L.styledTable, colAlign Mismatches, getDynamicTableMargin Monotonicity,
 *              and isSummaryRow False-Positive Resistance.
 *
 * Rule 7 Compliant: Strictly Paired Positive and Negative Assertions.
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
  CellValue,
} from '@/domain/building/mobile-im/pptx/imlib';
import { inferA03ColAlign } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';

describe('Adversarial Stress Harness: Milestone M3 StyledTable Physics', () => {

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. colAlign Adversarial Stress: Underflow, Overflow, and Precedence
  // ═════════════════════════════════════════════════════════════════════════════
  describe('1. colAlign Adversarial Stress (Mismatched Dimensions & Precedence)', () => {
    
    it('[Positive Pair] Underflow: colAlign with fewer elements than colW gracefully aligns defined columns without crashing', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['C0', 'C1', 'C2', 'C3'];
      const bodyRows = [
        ['R0C0', 'R0C1', 'R0C2', 'R0C3'],
        ['R1C0', 'R1C1', 'R1C2', 'R1C3'],
      ];
      const colW = [1.0, 1.0, 1.0, 1.0]; // 4 columns
      const colAlign: ('left' | 'center' | 'right')[] = ['left', 'center']; // Only 2 columns defined (underflow by 2)

      expect(() => {
        styledTable(mockSlide as any, 0.5, 0.5, 4.0, headers, bodyRows, colW, {
          colAlign,
        });
      }).not.toThrow();

      expect(mockSlide.addTable).toHaveBeenCalledTimes(1);
      const [tableRows] = mockSlide.addTable.mock.calls[0];

      // Header row
      expect(tableRows[0][0].options.align).toBe('left');
      expect(tableRows[0][1].options.align).toBe('center');
      expect(tableRows[0][2].options.align).toBeUndefined(); // Underflow column 2
      expect(tableRows[0][3].options.align).toBeUndefined(); // Underflow column 3

      // Body row 0
      expect(tableRows[1][0].options.align).toBe('left');
      expect(tableRows[1][1].options.align).toBe('center');
      expect(tableRows[1][2].options.align).toBeUndefined();
      expect(tableRows[1][3].options.align).toBeUndefined();

      // Body row 1
      expect(tableRows[2][0].options.align).toBe('left');
      expect(tableRows[2][1].options.align).toBe('center');
      expect(tableRows[2][2].options.align).toBeUndefined();
      expect(tableRows[2][3].options.align).toBeUndefined();
    });

    it('[Negative Pair] Underflow: Underflow columns do NOT inherit accidental alignments or throw undefined errors', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['A', 'B', 'C'];
      const bodyRows = [['1', '2', '3']];
      const colW = [1.0, 1.0, 1.0];
      const colAlign: ('left' | 'center' | 'right')[] = ['right']; // Only 1 column defined

      styledTable(mockSlide as any, 0.5, 0.5, 3.0, headers, bodyRows, colW, { colAlign });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      // Column index 1 & 2 must NOT be 'right'
      expect(tableRows[0][1].options.align).not.toBe('right');
      expect(tableRows[0][2].options.align).not.toBe('right');
      expect(tableRows[1][1].options.align).not.toBe('right');
      expect(tableRows[1][2].options.align).not.toBe('right');
    });

    it('[Positive Pair] Overflow: colAlign with more elements than colW safely ignores surplus alignments', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['Col0', 'Col1'];
      const bodyRows = [['Val0', 'Val1']];
      const colW = [2.0, 2.0]; // 2 columns
      // 6 alignments provided (overflow by 4)
      const colAlign: ('left' | 'center' | 'right')[] = ['center', 'right', 'left', 'center', 'right', 'left'];

      expect(() => {
        styledTable(mockSlide as any, 0.5, 0.5, 4.0, headers, bodyRows, colW, { colAlign });
      }).not.toThrow();

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      expect(tableRows[0]).toHaveLength(2);
      expect(tableRows[1]).toHaveLength(2);
      expect(tableRows[0][0].options.align).toBe('center');
      expect(tableRows[0][1].options.align).toBe('right');
      expect(tableRows[1][0].options.align).toBe('center');
      expect(tableRows[1][1].options.align).toBe('right');
    });

    it('[Negative Pair] Overflow: Extra alignments do NOT append ghost cells to headers or body rows', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['Col0'];
      const bodyRows = [['Val0']];
      const colW = [3.0];
      const colAlign: ('left' | 'center' | 'right')[] = ['center', 'right', 'left'];

      styledTable(mockSlide as any, 0.5, 0.5, 3.0, headers, bodyRows, colW, { colAlign });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      expect(tableRows[0]).not.toHaveLength(3);
      expect(tableRows[0]).toHaveLength(1);
      expect(tableRows[1]).not.toHaveLength(3);
      expect(tableRows[1]).toHaveLength(1);
    });

    it('[Positive Pair] Empty array colAlign: Treated identically to omitted colAlign', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['A', 'B'];
      const bodyRows = [['1', '2']];
      const colW = [1.5, 1.5];

      styledTable(mockSlide as any, 0.5, 0.5, 3.0, headers, bodyRows, colW, { colAlign: [] });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      expect(tableRows[0][0].options.align).toBeUndefined();
      expect(tableRows[0][1].options.align).toBeUndefined();
      expect(tableRows[1][0].options.align).toBeUndefined();
      expect(tableRows[1][1].options.align).toBeUndefined();
    });

    it('[Positive Pair] Cell-level alignment override overrides colAlign for body cells, while other cells keep colAlign', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['Col0', 'Col1', 'Col2'];
      const bodyRows: CellValue[][] = [
        [
          'DefaultColAlign',
          { t: 'OverrideToLeft', align: 'left' },
          { t: 'OverrideToCenter', align: 'center' },
        ],
      ];
      const colW = [1.0, 1.0, 1.0];
      const colAlign: ('left' | 'center' | 'right')[] = ['right', 'right', 'right'];

      styledTable(mockSlide as any, 0.5, 0.5, 3.0, headers, bodyRows, colW, { colAlign });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      // Header has all right alignments
      expect(tableRows[0][0].options.align).toBe('right');
      expect(tableRows[0][1].options.align).toBe('right');
      expect(tableRows[0][2].options.align).toBe('right');

      // Body row
      expect(tableRows[1][0].options.align).toBe('right'); // inherited from colAlign
      expect(tableRows[1][1].options.align).toBe('left');  // overridden
      expect(tableRows[1][2].options.align).toBe('center'); // overridden
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. getDynamicTableMargin Boundary Monotonicity & Negative Stress
  // ═════════════════════════════════════════════════════════════════════════════
  describe('2. getDynamicTableMargin Boundary Monotonicity & Robustness Sweeps', () => {

    it('[Positive Pair] Threshold boundaries yield exact specified margins', () => {
      // Below 0.16 -> [1, 2, 1, 2]
      expect(getDynamicTableMargin(0.159)).toEqual([1, 2, 1, 2]);
      expect(getDynamicTableMargin(0.159999)).toEqual([1, 2, 1, 2]);

      // Exactly at 0.16 -> [1.5, 3, 1.5, 3]
      expect(getDynamicTableMargin(0.16)).toEqual([1.5, 3, 1.5, 3]);
      expect(getDynamicTableMargin(0.160001)).toEqual([1.5, 3, 1.5, 3]);

      // Below 0.22 -> [1.5, 3, 1.5, 3]
      expect(getDynamicTableMargin(0.219)).toEqual([1.5, 3, 1.5, 3]);
      expect(getDynamicTableMargin(0.219999)).toEqual([1.5, 3, 1.5, 3]);

      // Exactly at 0.22 -> [2, 4, 2, 4]
      expect(getDynamicTableMargin(0.22)).toEqual([2, 4, 2, 4]);
      expect(getDynamicTableMargin(0.220001)).toEqual([2, 4, 2, 4]);

      // Well above 0.22 -> [2, 4, 2, 4]
      expect(getDynamicTableMargin(0.500)).toEqual([2, 4, 2, 4]);
      expect(getDynamicTableMargin(1.000)).toEqual([2, 4, 2, 4]);
    });

    it('[Positive Pair] Boundary Monotonicity Sweep: Margin values are non-decreasing across all step intervals', () => {
      let prevV = -1;
      let prevH = -1;

      // Fine-grained sweep from 0.05" to 0.50" with 0.005" step
      for (let h = 0.05; h <= 0.50; h += 0.005) {
        const [top, right, bottom, left] = getDynamicTableMargin(h);
        
        // Assert symmetry
        expect(top).toBe(bottom);
        expect(right).toBe(left);

        // Assert non-negative
        expect(top).toBeGreaterThan(0);
        expect(right).toBeGreaterThan(0);

        // Assert vertical is less than horizontal (compact aspect ratio)
        expect(top).toBeLessThanOrEqual(right);

        // Assert monotonicity
        if (prevV !== -1) {
          expect(top).toBeGreaterThanOrEqual(prevV);
          expect(right).toBeGreaterThanOrEqual(prevH);
        }

        prevV = top;
        prevH = right;
      }
    });

    it('[Negative Pair] Negative, zero, or abnormal row heights do NOT produce negative or inverted paddings', () => {
      // 0 height
      const zeroMargin = getDynamicTableMargin(0);
      expect(zeroMargin).toEqual([1, 2, 1, 2]);
      expect(zeroMargin.every(v => v > 0)).toBe(true);

      // Negative height
      const negMargin = getDynamicTableMargin(-0.25);
      expect(negMargin).toEqual([1, 2, 1, 2]);
      expect(negMargin.every(v => v > 0)).toBe(true);

      // Negative infinity
      const negInfMargin = getDynamicTableMargin(-Infinity);
      expect(negInfMargin).toEqual([1, 2, 1, 2]);

      // NaN fallback (falls through to default)
      const nanMargin = getDynamicTableMargin(NaN);
      expect(nanMargin).toEqual([2, 4, 2, 4]);
    });

    it('[Positive Pair] Compact row vertical margin consumes safe fraction of total row height', () => {
      // At rowH = 0.12" (8.64pt), vertical padding = 1pt + 1pt = 2pt (23.1% of row height)
      // With previous static [2, 4, 2, 4], padding was 4pt (46.3% of row height)
      const compactH = 0.12;
      const compactMargin = getDynamicTableMargin(compactH);
      const totalPt = compactH * 72; // 8.64pt
      const totalVerticalPaddingPt = compactMargin[0] + compactMargin[2]; // 2pt
      const paddingRatio = totalVerticalPaddingPt / totalPt;

      expect(paddingRatio).toBeLessThan(0.30); // strictly less than 30% of cell height
      expect(totalVerticalPaddingPt).toBe(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. isSummaryRow Keyword Detection & False-Positive Avoidance
  // ═════════════════════════════════════════════════════════════════════════════
  describe('3. isSummaryRow Keyword Detection & Negative Control Resistance', () => {

    it('[Positive Pair] Detects all specified Korean summary keywords with various delimiters and forms', () => {
      const validCases: string[][] = [
        ['합계', '10,000'],
        ['합계 (연간)', '120,000'],
        ['합계: 50건', '5,000'],
        ['합계：전체', '5,000'], // fullwidth colon
        ['합계[부가세포함]', '11,000'],
        ['소계', '3,000'],
        ['소계 (1F~3F)', '9,000'],
        ['소계: 12실', '3,000'],
        ['총계', '50,000'],
        ['총계 (누적)', '50,000'],
        ['총계: 종합', '50,000'],
        ['계', '5,000'],
        ['계 (원)', '5,000'],
        ['계: 합산', '5,000'],
        ['계[VAT포함]', '5,500'],
        ['총합', '100%'],
        ['총합: 10개실', '100%'],
        ['총액', '500억 원'],
        ['총액: 매매가', '500억 원'],
        ['소 합계', '2,000'],
        ['총 합계', '15,000'],
        ['**합계**', '10,000'], // Markdown bold
        ['**총계**', '20,000'],
      ];

      for (const row of validCases) {
        expect(isSummaryRow(row, 0, 1)).toBe(true);
      }
    });

    it('[Positive Pair] Detects English summary keywords (Total, Subtotal, Sum) case-insensitively with delimiters', () => {
      const validEnCases: string[][] = [
        ['Total', '100,000'],
        ['total', '100,000'],
        ['TOTAL', '100,000'],
        ['Total (USD)', '$5,000'],
        ['Total: 25 Units', '100%'],
        ['Subtotal', '20,000'],
        ['subtotal', '20,000'],
        ['SUBTOTAL', '20,000'],
        ['Subtotal (Floor 1-3)', '20,000'],
        ['Sum', '500'],
        ['sum', '500'],
        ['SUM', '500'],
        ['Sum: Total Area', '1,500 sqm'],
        ['**Total**', '$50,000'],
      ];

      for (const row of validEnCases) {
        expect(isSummaryRow(row, 0, 1)).toBe(true);
      }
    });

    it('[Negative Pair] Negative Controls: Real-world non-summary keywords are strictly NOT falsely detected', () => {
      const negativeControls: string[][] = [
        ['합계출판사', '302호'],           // Starts with '합계' without space/colon/bracket
        ['토탈인테리어', '105호'],         // Korean phonetic '토탈'
        ['총무부', '본관 4F'],             // Common Korean department starting with '총'
        ['총괄책임자', '이사 홍길동'],     // Korean executive title starting with '총'
        ['계약자명', '주식회사 테크'],     // Starts with '계' without delimiter
        ['계약일자', '2024-05-01'],        // Starts with '계'
        ['계약면적', '150.5㎡'],           // Starts with '계'
        ['계약금', '5,000만원'],           // Starts with '계'
        ['계좌번호', '110-123-456789'],    // Starts with '계'
        ['합정동 123-4', '근린생활시설'], // Starts with '합'
        ['합성고무물산', 'B101호'],        // Starts with '합'
        ['소형사무실', '25평'],            // Starts with '소'
        ['소방시설점검', '완료'],          // Starts with '소'
        ['총평', '우량 임차인 위주 구성'], // Starts with '총'
        ['총동문회관', '5F'],              // Starts with '총'
        ['Totally Clean LLC', 'Suite 1'],  // English word with 'Total' prefix but word-internal
        ['Totalize System', 'B201'],       // English word starting with Total
        ['Summary Report', 'Page 1'],      // English word starting with Sum
        ['Summer Cafe', '1F Terrace'],     // English word starting with Sum
        ['Subtotally Built', 'Unit 4'],    // English word starting with Subtotal
      ];

      for (const row of negativeControls) {
        expect(isSummaryRow(row, 0, 1)).toBe(false);
      }
    });

    it('[Positive/Negative Pair] optSummaryIndex takes strict precedence over keyword auto-detection', () => {
      const normalRow = ['101호', '스타벅스', '50평'];
      const summaryTextRow = ['합계', '100억', '500평'];

      // When optSummaryIndex is 2:
      // Row 0 with summary keyword text is FALSE because rIdx !== 2
      expect(isSummaryRow(summaryTextRow, 0, 5, 2)).toBe(false);
      // Row 2 with normal text is TRUE because rIdx === 2
      expect(isSummaryRow(normalRow, 2, 5, 2)).toBe(true);
    });

    it('[Positive Pair] Summary row in middle or at end of table is detected regardless of column position', () => {
      // Summary keyword in column 0
      expect(isSummaryRow(['합계', '100', '200'], 5, 6)).toBe(true);
      // Summary keyword in column 1 (e.g., [floor, '소계', ...])
      expect(isSummaryRow(['지상층', '소계', '5,000'], 3, 6)).toBe(true);
      // Summary keyword in last column
      expect(isSummaryRow(['전체', '합산', 'Total'], 4, 6)).toBe(true);
    });

    it('[Negative Pair] Empty rows, nulls, or undefined cells do NOT throw and return false', () => {
      expect(isSummaryRow([], 0, 1)).toBe(false);
      expect(isSummaryRow(['', ''], 0, 1)).toBe(false);
      expect(isSummaryRow([null as any, undefined as any], 0, 1)).toBe(false);
      expect(isSummaryRow([{ t: '' }, { t: '   ' }], 0, 1)).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. Summary Row Visual Styling Contract Verification
  // ═════════════════════════════════════════════════════════════════════════════
  describe('4. Summary Row Visual Styling Contract in styledTable', () => {

    it('[Positive Pair] Legitimate summary row exclusively receives bold, 0.5pt top border, and highlight fill', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '호수', '금액'];
      const bodyRows = [
        ['일반', '101호', '500'],
        ['합계출판사', '102호', '300'], // Negative control: must NOT be styled as summary!
        ['합계', '2개실', '800'],       // Legitimate summary row
      ];
      const colW = [1.5, 1.5, 1.5];

      styledTable(mockSlide as any, 0.5, 0.5, 4.5, headers, bodyRows, colW, { onDark: false });

      const [tableRows] = mockSlide.addTable.mock.calls[0];

      // Header row
      expect(tableRows[0][0].text).toBe('구분');

      // Row 1: Regular row
      expect(tableRows[1][0].options.fill.color).not.toBe('F1F5F9');
      expect(Array.isArray(tableRows[1][0].options.border)).toBe(false);
      expect(tableRows[1][0].options.border.pt).toBe(0.3);

      // Row 2: '합계출판사' (Negative control)
      expect(tableRows[2][0].text).toBe('합계출판사');
      expect(tableRows[2][0].options.fill.color).not.toBe('F1F5F9');
      expect(Array.isArray(tableRows[2][0].options.border)).toBe(false);
      expect(tableRows[2][0].options.border.pt).toBe(0.3);
      expect(tableRows[2][1].options.bold).toBe(false); // Second cell not bold

      // Row 3: '합계' (Legitimate summary)
      const summaryRow = tableRows[3];
      expect(summaryRow[0].text).toBe('합계');
      expect(summaryRow[0].options.fill.color).toBe('F1F5F9');
      expect(summaryRow[1].options.fill.color).toBe('F1F5F9');
      expect(summaryRow[2].options.fill.color).toBe('F1F5F9');

      // All cells in summary row are bold
      expect(summaryRow[0].options.bold).toBe(true);
      expect(summaryRow[1].options.bold).toBe(true);
      expect(summaryRow[2].options.bold).toBe(true);

      // Top border is 0.5pt, others are 0.3pt
      expect(Array.isArray(summaryRow[0].options.border)).toBe(true);
      expect(summaryRow[0].options.border[0].pt).toBe(0.5);
      expect(summaryRow[0].options.border[1].pt).toBe(0.3);
      expect(summaryRow[0].options.border[2].pt).toBe(0.3);
      expect(summaryRow[0].options.border[3].pt).toBe(0.3);
    });

    it('[Positive Pair] Dark mode summary row styling uses 2A303C highlight and CD.body font color', () => {
      const mockSlide = { addTable: vi.fn() };
      const headers = ['구분', '금액'];
      const bodyRows = [['총계', '1,000']];
      const colW = [2.0, 2.0];

      styledTable(mockSlide as any, 0.5, 0.5, 4.0, headers, bodyRows, colW, { onDark: true });

      const [tableRows] = mockSlide.addTable.mock.calls[0];
      const summaryRow = tableRows[1];

      expect(summaryRow[0].options.fill.color).toBe('2A303C');
      expect(summaryRow[0].options.color).toBe(CD.body);
      expect(summaryRow[0].options.border[0].color).toBe(CD.border);
      expect(summaryRow[0].options.border[0].pt).toBe(0.5);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. inferA03ColAlign Adversarial Edge Cases
  // ═════════════════════════════════════════════════════════════════════════════
  describe('5. inferA03ColAlign Adversarial Edge Cases', () => {

    it('[Positive Pair] Handles unknown headers gracefully with left fallback', () => {
      const headers = ['미확인컬럼', 'X123', '기타특약'];
      const alignments = inferA03ColAlign(headers);

      expect(alignments).toEqual(['left', 'left', 'left']);
    });

    it('[Positive Pair] Accurately recognizes compound money and area terms', () => {
      const headers = [
        '계약면적(평)',
        '실평수',
        '보증금합계(원)',
        '월임대료(VAT별도)',
        '관리비총액',
        '계약시작일',
        '입주일자',
      ];
      const alignments = inferA03ColAlign(headers);

      expect(alignments[0]).toBe('right'); // 계약면적(평)
      expect(alignments[1]).toBe('right'); // 실평수
      expect(alignments[2]).toBe('right'); // 보증금합계(원)
      expect(alignments[3]).toBe('right'); // 월임대료(VAT별도)
      expect(alignments[4]).toBe('right'); // 관리비총액
      expect(alignments[5]).toBe('center'); // 계약시작일 (시작)
      expect(alignments[6]).toBe('center'); // 입주일자 (일자)
    });

    it('[Negative Pair] Non-matching descriptive columns (e.g., 렌트프리조건) fall back to left alignment', () => {
      const headers = ['렌트프리기간', '특약사항', '주요업종'];
      const alignments = inferA03ColAlign(headers);
      expect(alignments).toEqual(['left', 'left', 'left']);
    });


    it('[Negative Pair] Empty headers array returns empty array without throwing', () => {
      expect(inferA03ColAlign([])).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 6. Full PPTX Presentation Generation with Boundary Stress Scenarios
  // ═════════════════════════════════════════════════════════════════════════════
  describe('6. Full PPTX Presentation Generation under Boundary Stress', () => {
    it('Generates PPTX buffer successfully with extreme table configurations', async () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';
      const slide = pres.addSlide();

      // Stress Table: Underflow colAlign, extreme compact rowH = 0.11", summary row with Korean fullwidth colon
      const headers = ['층', '호수', '임차인', '면적', '보증금', '월세'];
      const bodyRows = [
        ['1F', '101', '스타벅스', '50.2', '10,000', '800'],
        ['2F', '201', '합계출판사', '45.0', '8,000', '600'], // Negative control
        ['합계：전체', '2실', '-', '95.2', '18,000', '1,400'], // Legitimate summary with fullwidth colon
      ];
      const colW = [0.8, 0.8, 1.8, 1.0, 1.2, 1.2];
      const colAlign: ('left' | 'center' | 'right')[] = ['center', 'center', 'left']; // Underflow (3 of 6)

      expect(() => {
        styledTable(slide, 0.62, 1.0, 6.8, headers, bodyRows, colW, {
          colAlign,
          rh: 0.11, // Super compact row height (< 0.16)
        });
      }).not.toThrow();

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('Exports physical PPTX presentation for python overflow detector validation', async () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      const dummyProvenance: Record<string, any> = { title: 'registry' };

      // 1. A03 Large Table with long Korean text, right-aligned currency, and summary row
      const { buildA03LargeTable } = await import('@/domain/building/mobile-im/pptx/archetypes/a03-large-table');
      buildA03LargeTable({
        pres,
        slideNum: 1,
        docno: 'DOC-M3-STRESS-1',
        data: {
          title: '임대차 계약 명세 (A03 스트레스 검증)',
          tableHead: ['층수', '호실', '임차인', '전용면적(평)', '보증금(만원)', '월임대료(만원)', '관리비(만원)', '만기일'],
          tableRows: [
            ['B1F', 'B101', '이마트에브리데이 역삼프리미엄점', '125.8', '50,000', '2,500', '500', '2029-12-31'],
            ['1F', '101', '스타벅스 코리아 리저브 강남점', '75.2', '30,000', '2,000', '400', '2030-05-31'],
            ['1F', '102', '올리브영 플래그십 스토어', '65.0', '25,000', '1,800', '350', '2028-08-31'],
            ['2F', '201', '투썸플레이스 프랜차이즈', '55.5', '15,000', '1,200', '280', '2027-11-30'],
            ['3F', '301', '한화생명 금융사업단', '110.0', '20,000', '1,500', '450', '2026-10-31'],
            ['4F', '401', '공실 (임차의향서 접수 중)', '110.0', '0', '0', '0', '-'],
            ['5F', '501', '주식회사 메디컬헬스케어센터', '110.0', '22,000', '1,650', '480', '2031-03-31'],
            ['합계', '7개 호실', '총 6개사 입주', '651.5', '162,000', '10,650', '2,460', '-'],
          ],
        },
        grade: 'A',
        provenance: dummyProvenance,
      });

      // 2. A22 Stacking Plan with 6 floors and compact matrix
      const { buildA22StackingPlan } = await import('@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan');
      buildA22StackingPlan({
        pres,
        slideNum: 2,
        docno: 'DOC-M3-STRESS-2',
        data: {
          title: '건축 단면 스태킹 플랜 (A22 스트레스 검증)',
          floors: [
            { floor: '5F', use: '업무시설', exclusiveAreaPy: 110, leasableAreaPy: 160, tenant: '메디컬센터', expiryYear: 2031, category: 'retail' },
            { floor: '4F', use: '업무시설', exclusiveAreaPy: 110, leasableAreaPy: 160, tenant: '공실', expiryYear: 0, category: 'vacant' },
            { floor: '3F', use: '업무시설', exclusiveAreaPy: 110, leasableAreaPy: 160, tenant: '한화생명', expiryYear: 2026, category: 'general' },
            { floor: '2F', use: '근린생활', exclusiveAreaPy: 55, leasableAreaPy: 85, tenant: '투썸플레이스', expiryYear: 2027, category: 'retail' },
            { floor: '1F', use: '근린생활', exclusiveAreaPy: 140, leasableAreaPy: 200, tenant: '스타벅스', expiryYear: 2030, category: 'anchor' },
            { floor: 'B1F', use: '주차장', exclusiveAreaPy: 0, leasableAreaPy: 0, tenant: '자주식 50대', expiryYear: 0, category: 'parking' },
          ],
          summary: {
            totalGrossAreaPy: 900,
            totalExclusiveAreaPy: 525,
            exclusiveRatePct: 58.3,
            occupancyRatePct: 83.3,
            waleYears: 3.2,
          },
        },
        grade: 'A',
        provenance: dummyProvenance,
      });

      // 3. A24 Rentroll Stacking
      const { buildA24RentrollStacking } = await import('@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking');
      buildA24RentrollStacking({
        pres,
        slideNum: 3,
        docno: 'DOC-M3-STRESS-3',
        data: {
          title: '렌트롤 & 스태킹 (A24 스트레스 검증)',
          tableRows: [
            ['1F', '스타벅스', '근생', '100', '60', '10,000', '800', '150', '950', '2030-05'],
            ['2F', '투썸플레이스', '근생', '90', '50', '8,000', '600', '120', '720', '2027-11'],
            ['3F', '한화생명', '업무', '150', '100', '15,000', '1,200', '250', '1,450', '2026-10'],
          ],
        },
        grade: 'A',
        provenance: dummyProvenance,
      });

      // 4. A23 Yield Formula & Land Price History
      const { buildA23YieldFormula } = await import('@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula');
      buildA23YieldFormula({
        pres,
        slideNum: 4,
        docno: 'DOC-M3-STRESS-4',
        data: {
          title: '투자수익률 및 공시지가 추이 (A23 스트레스 검증)',
          askingPrice: 2500000,
          annualRent: 12000,
          totalDeposit: 20000,
          landPriceHistory: {
            history: [
              { year: '2020', pricePerSqm: 15000000 },
              { year: '2021', pricePerSqm: 17200000 },
              { year: '2022', pricePerSqm: 19500000 },
              { year: '2023', pricePerSqm: 21000000 },
              { year: '2024', pricePerSqm: 23500000 },
            ],
            cagrPct: 11.9,
            totalGrowthPct: 56.7,
          },
        },
        grade: 'A',
        provenance: dummyProvenance,
      });

      const buffer = await pres.write({ outputType: 'nodebuffer' });
      const outputPath = 'docs/test/stress/m3_challenger_stress.pptx';
      const fs = await import('fs');
      fs.writeFileSync(outputPath, buffer as any);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(10000);
    });
  });


});
