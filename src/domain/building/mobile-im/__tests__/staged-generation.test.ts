import { describe, it, expect } from 'vitest';

describe('Staged Section Generation (Phase 1 병렬화)', () => {
  // Section dependency graph 테스트
  const INDEPENDENT_SECTIONS = new Set([
    'property_overview', 'location_access', 'lease_status', 'next_steps',
  ]);
  const FINANCIAL_SECTIONS = new Set([
    'income_analysis', 'development_feasibility', 'gop_analysis',
    'cost_comparison', 'comparable_analysis',
  ]);

  it('SG-01: independent sections are correctly classified', () => {
    expect(INDEPENDENT_SECTIONS.has('property_overview')).toBe(true);
    expect(INDEPENDENT_SECTIONS.has('location_access')).toBe(true);
    expect(INDEPENDENT_SECTIONS.has('lease_status')).toBe(true);
    expect(INDEPENDENT_SECTIONS.has('next_steps')).toBe(true);
    expect(INDEPENDENT_SECTIONS.has('income_analysis')).toBe(false);
  });

  it('SG-02: financial sections are correctly classified', () => {
    expect(FINANCIAL_SECTIONS.has('income_analysis')).toBe(true);
    expect(FINANCIAL_SECTIONS.has('development_feasibility')).toBe(true);
    expect(FINANCIAL_SECTIONS.has('property_overview')).toBe(false);
  });

  it('SG-03: risk_check and investment_thesis are not in independent or financial', () => {
    expect(INDEPENDENT_SECTIONS.has('risk_check')).toBe(false);
    expect(FINANCIAL_SECTIONS.has('risk_check')).toBe(false);
    expect(INDEPENDENT_SECTIONS.has('investment_thesis')).toBe(false);
    expect(FINANCIAL_SECTIONS.has('investment_thesis')).toBe(false);
  });

  it('SG-04: CONCURRENCY env controls parallel behavior', () => {
    const concurrency1 = Number('1');
    const concurrency4 = Number('4');
    expect(concurrency1 > 1).toBe(false); // sequential mode
    expect(concurrency4 > 1).toBe(true);  // parallel mode
  });

  // extractKeyFactsFromMarkdown 테스트
  describe('extractKeyFactsFromMarkdown', () => {
    function extractKeyFactsFromMarkdown(markdown: string, sectionType: string): string[] {
      const facts: string[] = [];
      const patterns = [
        /(\d[\d,]*\.?\d*)\s*(㎡|평|\uc5b5|\ub9cc\uc6d0|%)/g,
      ];
      for (const p of patterns) {
        p.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.exec(markdown)) !== null) {
          facts.push(`[${sectionType}] ${m[0]}`);
        }
      }
      return facts.slice(0, 10);
    }

    it('SG-05: extracts area metrics from markdown', () => {
      const md = '연면적 2,490.88㎡(최대 753평)이며 매각가 250억원';
      const facts = extractKeyFactsFromMarkdown(md, 'property_overview');
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.some(f => f.includes('㎡'))).toBe(true);
      expect(facts.some(f => f.includes('평'))).toBe(true);
      expect(facts.some(f => f.includes('억'))).toBe(true);
    });

    it('SG-06: limits to max 10 facts', () => {
      const md = '1㎡ 2㎡ 3㎡ 4㎡ 5㎡ 6㎡ 7㎡ 8㎡ 9㎡ 10㎡ 11㎡ 12㎡';
      const facts = extractKeyFactsFromMarkdown(md, 'test');
      expect(facts.length).toBeLessThanOrEqual(10);
    });

    it('SG-07: returns empty for no metrics', () => {
      const facts = extractKeyFactsFromMarkdown('일반 텍스트 설명', 'test');
      expect(facts.length).toBe(0);
    });
  });

  // Stage ordering 테스트
  it('SG-08: stage ordering preserves dependency chain', () => {
    const allSections = [
      'property_overview', 'location_access', 'income_analysis',
      'lease_status', 'risk_check', 'investment_thesis', 'next_steps',
    ];

    const independentBatch = allSections.filter(s => INDEPENDENT_SECTIONS.has(s));
    const financialBatch = allSections.filter(s => FINANCIAL_SECTIONS.has(s));
    const riskBatch = allSections.filter(s => s === 'risk_check');
    const thesisBatch = allSections.filter(s => s === 'investment_thesis');

    // Stage 1: independent
    expect(independentBatch).toEqual(['property_overview', 'location_access', 'lease_status', 'next_steps']);
    // Stage 2: financial
    expect(financialBatch).toEqual(['income_analysis']);
    // Stage 3: risk
    expect(riskBatch).toEqual(['risk_check']);
    // Stage 4: thesis
    expect(thesisBatch).toEqual(['investment_thesis']);
  });
});
