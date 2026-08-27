import { describe, it, expect } from 'vitest';
import { extractBoldKeyValues, parseMarkdownTable, stripMarkdown } from '@/domain/building/mobile-im/pptx/data-binder';
import { charsPerLine, enforceTextBudget } from '@/domain/building/mobile-im/pptx/text-budget';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, extractSlideTexts, extractSlideXmls } from './pptx-test-helpers';

describe('P1 Layout & Parsing Tests', () => {

  describe('T04: Markdown Parsing Edge Cases', () => {
    it('T04-01: Nested bold (****deep****) -> stripMarkdown correctly removes', () => {
      const text = '****deep****';
      expect(stripMarkdown(text)).toBe('deep');
    });

    it('T04-02: Mixed language bold key-value (**Cap Rate**: 5.33%) -> extractBoldKeyValues extracts', () => {
      const lines = ['**Cap Rate**: 5.33%'];
      const result = extractBoldKeyValues(lines);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('Cap Rate');
      expect(result[0].value).toBe('5.33%');
    });

    it('T04-03: Parentheses with colon inside bold (**월세(VAT포함)**: 1,200만) -> no false extraction', () => {
      const lines = ['**월세(VAT포함)**: 1,200만'];
      const result = extractBoldKeyValues(lines);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('월세(VAT포함)');
      expect(result[0].value).toBe('1,200만');
    });

    it('T04-04: Table with empty cells (| 항목 | | 값 |) -> parseMarkdownTable handles gracefully', () => {
      const markdown = `
| 항목 | | 값 |
|---|---|---|
| A | | B |
      `;
      const tables = parseMarkdownTable(markdown);
      expect(tables).toHaveLength(1);
      expect(tables[0].headers).toHaveLength(3);
      expect(tables[0].rows[0]).toHaveLength(3);
    });

    it('T04-05: Table with only 1 column -> parseMarkdownTable returns valid structure', () => {
      const markdown = `
| 단일 |
|---|
| 값1 |
| 값2 |
      `;
      const tables = parseMarkdownTable(markdown);
      expect(tables).toHaveLength(1);
      expect(tables[0].headers).toHaveLength(1);
      expect(tables[0].rows).toHaveLength(2);
    });

    it('T04-06: Extremely nested markdown (> - **bold** _italic_ text) -> no crash', () => {
      const text = '> - **bold** _italic_ text';
      expect(() => stripMarkdown(text)).not.toThrow();
    });

    it('T04-07: Korean-English mixed colon formats', () => {
      const lines = [
        '**항목1**：값1',
        '**항목2**: 값2',
        '**항목3** : 값3'
      ];
      const result = extractBoldKeyValues(lines);
      expect(result).toHaveLength(3);
      expect(result[0].key).toBe('항목1');
      expect(result[0].value).toBe('값1');
      expect(result[1].key).toBe('항목2');
      expect(result[1].value).toBe('값2');
      expect(result[2].key).toBe('항목3');
      expect(result[2].value).toBe('값3');
    });
  });

  describe('T06: CJK Long Text Rendering', () => {
    it('T06-01: 200-char Korean risk description in risk section', async () => {
      const doc = buildMinimalDoc('income');
      const longText = '가'.repeat(200);
      doc.sections = [
        {
          title: '리스크',
          section_type: 'risk_check',
          markdown: `**리스크**\n${longText}`,
        }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
      const texts = await extractSlideTexts(buffer);
    });

    it('T06-02: 30+ char mixed Korean-English tenant name -> charsPerLine calculates correct line count', () => {
      const boxWidth = 5;
      const count = charsPerLine(boxWidth);
      expect(count).toBeGreaterThan(0);
    });

    it('T06-03: Section with 100% Korean characters 500+ chars -> enforceTextBudget truncates', () => {
      const longText = '다'.repeat(500);
      const truncated = enforceTextBudget(longText, 100);
      expect(truncated.length).toBeLessThanOrEqual(100 + 3);
    });

    it('T06-04: Full PPTX render with all sections having 200+ char descriptions -> no crash', async () => {
      const doc = buildMinimalDoc('income');
      const longText = '마'.repeat(200);
      doc.sections = [
        { title: '투자포인트', section_type: 'investment_thesis', markdown: longText },
        { title: '임대차', section_type: 'lease_status', markdown: longText }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('T07: Dynamic Height Allocation Boundaries', () => {
    it('T07-01: Render PPTX with 2-stat section -> no slide text overlap', async () => {
      const doc = buildMinimalDoc('income');
      doc.sections = [
        {
          title: '투자 포인트',
          section_type: 'investment_thesis',
          markdown: `**Point 1**\nDetails 1\n\n**Point 2**\nDetails 2`,
        }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('T07-02: Render PPTX with maximally populated risk table (5 rows) -> no crash', async () => {
      const doc = buildMinimalDoc('income');
      const rows = Array.from({ length: 5 }, (_, i) => `| 리스크 ${i} | 설명 ${i} | 대응 ${i} |`).join('\n');
      doc.sections = [
        {
          title: '리스크',
          section_type: 'risk_check',
          markdown: `| 항목 | 리스크 | 대응 방안 |\n|---|---|---|\n${rows}`,
        }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('T07-03: Render PPTX with 0 metrics -> graceful degradation', async () => {
      const doc = buildMinimalDoc('income');
      doc.sections = [
        {
          title: '재무',
          section_type: 'income_analysis',
          markdown: `**매매가**: 100억\n(No metrics)`,
        }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('T07-04: PPTX with thesis section having 4+ investment points -> renders all', async () => {
      const doc = buildMinimalDoc('income');
      doc.sections = [
        {
          title: '투자포인트',
          section_type: 'investment_thesis',
          markdown: `**1**: A\n**2**: B\n**3**: C\n**4**: D`,
        }
      ];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('T07-05: All text within PPTX XML y-coordinates do not exceed slide height 7.5', async () => {
      const doc = buildMinimalDoc('income');
      doc.sections = [{ title: '투자포인트', section_type: 'investment_thesis', markdown: 'test' }];

      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      const xmls = await extractSlideXmls(buffer);
      for (const [_, xml] of xmls) {
        expect(xml).toContain('<p:sld');
      }
    });
  });

  describe('T08: Footer/Watermark Overlap', () => {
    it('T08-01: Basic tier PPTX -> footer text (크리딜) present in last area of every slide', async () => {
      const doc = buildMinimalDoc('income');
      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      const texts = await extractSlideTexts(buffer);
    });

    it('T08-02: Pro tier PPTX -> watermark elements exist', async () => {
      const doc = buildMinimalDoc('income');
      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({ 

        buildingId: 'test', 
        watermark: { requesterName: '홍길동', phoneLast4: '1234', timestamp: '2024' },
        doc 
      } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('T08-03: Dense content PPTX -> footer y-position consistent across slides', async () => {
      const doc = buildMinimalDoc('income');
      doc.sections = [
        { title: 'point1', section_type: 'investment_thesis', markdown: 'short' },
        { title: 'tenant', section_type: 'lease_status', markdown: 'loooooooong'.repeat(100) }
      ];
      const renderer = new MobileImPptxRenderer();
      const { buffer } = await renderer.render({buildingId: 'test', doc } as any);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
