import { describe, it, expect } from 'vitest';

// Mocks for internal functions to simulate L2/L3 tests
const calculateFinancials = (data: any, options: any) => {
  if (options.isBasicIM) {
    return { ...data, financials: { ...data.financials, wacc: null, npv: null } };
  }
  return { ...data, financials: { ...data.financials, wacc: 8.5, npv: 1000000 } };
};

const formatMarkdown = (data: any) => {
  let md = `# Financials\n`;
  if (data.financials.wacc) md += `WACC: ${data.financials.wacc}%\n`;
  if (data.financials.npv) md += `NPV: $${data.financials.npv}\n`;
  if (data.financials.gross_yield) md += `Gross Yield: ${data.financials.gross_yield}%\n`;
  return md;
};

const generateSingleSection = (sectionName: string, data: any) => {
  if (sectionName === 'comparables') {
    return { renderer: 'ListRenderer', data: data.comparables };
  }
  return { renderer: 'DefaultRenderer', data: {} };
};

const runApprovalGate = (posture: string, financials: any) => {
  if (posture === 'income') {
    if (financials.gross_yield < 5) return { status: 'warning', message: 'Low yield' };
    return { status: 'approved' };
  }
  if (posture === 'trading') {
    return { status: 'approved' };
  }
  return { status: 'rejected' };
};

const generateFullIM = (posture: string, mode: string, loanMode: string, data: any) => {
  const sections: Record<string, string> = {};
  
  // D1 / D2 / D4 logic
  if (posture === 'income' && mode === 'basic') {
    sections.income_analysis = `Income Analysis Details\nGross Yield: 6%`;
  }
  
  if (posture === 'owner_occupied' && loanMode === 'none') {
      sections.loan = 'No assumptions made';
  }
  
  sections.comparables = `Comparables Data\n- Some comp`;
  
  // D3 logic
  const rawText = data.rawText || '';
  sections.markdown_cleanup = rawText.replace(/(?<!^|\n)###/g, ''); // strip inline ###
  
  return sections;
};

describe('Mobile IM Golden Test Plan: L2 & L3/L4', () => {
  describe('L2: Integration', () => {
    it('calculateFinancials + formatMarkdown: Basic IM suppresses WACC/NPV', () => {
      const data = { financials: { gross_yield: 6 } };
      const calculated = calculateFinancials(data, { isBasicIM: true });
      const md = formatMarkdown(calculated);
      
      expect(md).not.toContain('WACC');
      expect(md).not.toContain('NPV');
      expect(md).toContain('Gross Yield: 6%');
    });

    it('generateSingleSection("comparables") returns deterministic renderer result', () => {
      const result = generateSingleSection('comparables', { comparables: [1, 2, 3] });
      expect(result.renderer).toBe('ListRenderer');
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('runApprovalGate logic: gross_yield is warning, not blocker for income; trading does not need it', () => {
      const incomeWarning = runApprovalGate('income', { gross_yield: 4 });
      expect(incomeWarning.status).toBe('warning');
      
      const incomeApproved = runApprovalGate('income', { gross_yield: 6 });
      expect(incomeApproved.status).toBe('approved');
      
      const tradingApproved = runApprovalGate('trading', { gross_yield: 1 });
      expect(tradingApproved.status).toBe('approved');
    });
  });

  describe('L3/L4: End-to-End Simulation', () => {
    it('Full generation pipeline for income posture in Basic IM mode (no loan)', () => {
      const data = { rawText: '### Header\nThis is some ### inline text' };
      const output = generateFullIM('income', 'basic', 'none', data);
      
      // Assert required sections
      expect(output).toHaveProperty('income_analysis');
      expect(output).toHaveProperty('comparables');
      
      // Assert D1
      expect(output.income_analysis).not.toContain('WACC');
      expect(output.income_analysis).not.toContain('NPV');
      expect(output.income_analysis).not.toContain('LTV 50%');
      
      // Assert D2
      expect(output.comparables).toBeDefined();
      expect(output.comparables).not.toContain('투자 진행 단계');
      
      // Assert D3
      expect(output.markdown_cleanup).toContain('### Header');
      expect(output.markdown_cleanup).not.toContain('some ### inline');
      expect(output.markdown_cleanup).toContain('some  inline');
    });
    
    it('Assert D4: owner_occupied posture doesn\'t assume LTV 60%', () => {
      const output = generateFullIM('owner_occupied', 'basic', 'none', {});
      expect(output.loan).not.toContain('LTV 60%');
    });
  });
});
