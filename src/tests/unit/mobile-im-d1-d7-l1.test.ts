import { describe, it, expect, vi } from 'vitest';
import { calculateNetCashFlow, formatNetCashFlowMarkdown } from '@/domain/building/mobile-im/net-cash-flow-calculator';
import { formatFinancialsMarkdown } from '@/domain/building/mobile-im/financials';
import { generatePremiumTemplate } from '@/domain/building/mobile-im/premium-template-engine';
import { renderComparables } from '@/domain/building/mobile-im/section-renderers/comparables-renderer';

// Helper for D3 testing conceptually matching im-section-generator.ts logic
function sanitizeHeadings(markdown: string): string {
  // Line start (### 제목)은 남기고, 인라인 (문장 중간의 ###)은 제거
  // 줄 시작이나 개행문자, 혹은 다른 # 문자 뒤에 오는 #은 제외하여 온전한 제목을 보존합니다.
  return markdown.replace(/(?<!^|\n|#)#{1,6}\s+/g, '');
}

describe('Mobile IM D1-D7 L1 (Domain Unit) Tests', () => {
  describe('D1: LTV & Financials', () => {
    it('calculateNetCashFlow doesn\'t assume 50% LTV when loan is missing', () => {
      const result = calculateNetCashFlow({
        purchasePriceKrw: 10000000000,
        monthlyRentKrw: 30000000,
        totalDepositKrw: 500000000,
        // loanAmountKrw is intentionally omitted
        landPriceTotalKrw: 5000000000,
      });
      
      expect(result).not.toBeNull();
      // If loan is undefined, it should be 0, not 50% of purchase price
      expect(result?.estimatedLoanBil).toBe(0);
      expect(result?.netEquityBil).toBe(95); // 100억 - 0억 - 5억
    });

    it('formatNetCashFlowMarkdown doesn\'t mention interest/LTV when loan is missing', () => {
      const summary = {
        askingPriceBil: 100,
        estimatedLoanBil: 0, // No loan
        totalDepositBil: 5,
        netEquityBil: 95,
        monthlyRentManwon: 3000,
        monthlyInterestManwon: 0,
        monthlyNetManwon: 3000,
        annualNetBil: 3.6,
        equityYieldPct: 3.79,
        grossYieldPct: 3.6,
        landSafetyRatioPct: 50,
        interestRatePct: 4.5,
        isLoanEstimated: false
      };
      
      const markdown = formatNetCashFlowMarkdown(summary);
      expect(markdown).not.toContain('대출 이자');
      expect(markdown).not.toContain('대출 반영 기준');
      expect(markdown).toContain('① 실투자금');
      expect(markdown).toContain('월 임대료(3,000만)');
    });

    it('formatFinancialsMarkdown in financials hides WACC, NPV, IRR when isBasicMode is true', () => {
      const finOutputs = {
        annualNoi: { best: 10, base: 9, worst: 8 },
        capRate: { best: 0.05, base: 0.045, worst: 0.04 },
        irr5Year: { best: 0.1, base: 0.08, worst: 0.06 },
        wacc: 0.04,
        dcf10Year: { npvBase: 100, npvBest: 120, npvWorst: 80 } as any,
        leveragedYield: 6,
        isBasicMode: true,
        pricePerSqm: 1000,
        pricePerPyeong: 3300,
        landValueRatio: null,
        landValueRatioNote: null,
        yieldOnCost: 0.05,
        totalDepositBil: null,
        loanAmountBil: null,
        equityRequired: null,
        disclaimer: '',
        posture: 'income'
      };
      
      const markdown = formatFinancialsMarkdown(finOutputs as any);
      expect(markdown).not.toContain('WACC');
      expect(markdown).not.toContain('NPV');
      expect(markdown).not.toContain('IRR');
    });
  });

  describe('D2: Comparables Template', () => {
    it('generatePremiumTemplate("comparables", ...) returns appropriate text without next_steps leaking', () => {
      const result = generatePremiumTemplate(
        "comparables" as any,
        {} as any, {} as any, {} as any, {} as any, 
        {} as any, null, {} as any, "income" as any
      );
      expect(result).not.toContain('next_steps');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('D2/D6: comparables-renderer', () => {
    it('renderComparables returns table markdown when data is present', () => {
      const result = renderComparables({
        subjectName: 'Test Building',
        subjectPricePerPyeong: 10000,
        comparables: [
          { 
            name: 'Comp 1', 
            distanceKm: 0.5,
            askingPriceKrw: 20000000000,
            pricePerPyeong: 11000, 
            areaM2: 500,
            transactionDate: '2023-01' 
          }
        ]
      });
      expect(result.markdown).toContain('|'); // Table formatting
      expect(result.markdown).toContain('Comp 1');
      expect(result.markdown).not.toContain('비교 가능한 매물 데이터가 충분하지 않습니다');
    });

    it('renderComparables returns fallback text when data is empty', () => {
      const result = renderComparables({
        subjectName: 'Test Building',
        subjectPricePerPyeong: 10000,
        comparables: []
      });
      expect(result.markdown).toContain('비교 가능한 매물 데이터가 충분하지 않습니다');
      expect(result.markdown).not.toContain('|'); // No table
    });
  });

  describe('D3: Markdown Heading Sanitizer', () => {
    it('strips inline hashes but preserves line-start hashes', () => {
      const input = `### 정상적인 제목\n이것은 문장 중간에 ### 해시가 들어간 테스트입니다.`;
      const sanitized = sanitizeHeadings(input);
      expect(sanitized).toContain('### 정상적인 제목');
      expect(sanitized).toContain('이것은 문장 중간에 해시가 들어간 테스트입니다.');
      expect(sanitized).not.toContain('이것은 문장 중간에 ### 해시가 들어간 테스트입니다.');
    });
  });
});
