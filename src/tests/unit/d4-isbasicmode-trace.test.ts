/**
 * D4 isBasicMode 실전 검증 — formatFinancialsMarkdown 출력에
 * WACC/NPV/IRR이 포함되는지 확인
 */
import { describe, it, expect } from 'vitest';
import { calculateFinancials, formatFinancialsMarkdown } from '@/domain/building/mobile-im/financials';

describe('D4: isBasicMode → WACC/NPV/IRR 억제 검증', () => {
  it('loan_amount_manwon=undefined → isBasicMode=true → WACC/NPV/IRR 미포함', () => {
    const fin = calculateFinancials({
      posture: 'income',
      monthlyRentKrw: 19_460_000,
      purchasePriceKrw: 115_0000_0000, // 115억
      totalDepositManwon: 29000,
      loanAmountManwon: undefined, // 대출 미입력
      isBasicMode: true,           // Basic IM
      assetType: '근린생활시설',
    });

    // isBasicMode 전파 확인
    expect(fin.isBasicMode).toBe(true);

    // formatMarkdown 출력 확인
    const md = formatFinancialsMarkdown(fin);
    console.log('=== Basic IM markdown ===');
    console.log(md);

    // WACC/NPV/IRR이 없어야 함
    expect(md).not.toContain('WACC');
    expect(md).not.toContain('NPV');
    expect(md).not.toContain('자기자본수익률');
    // IRR 행 자체가 없어야 함
    expect(md).not.toMatch(/5년 보유 시 투자수익률\(IRR\)/);

    // Cap Rate, NOI는 있어야 함
    expect(md).toContain('Cap Rate');
    expect(md).toContain('NOI');
  });

  it('loan_amount_manwon=50000 → isBasicMode=false → WACC/NPV/IRR 포함', () => {
    const fin = calculateFinancials({
      posture: 'income',
      monthlyRentKrw: 19_460_000,
      purchasePriceKrw: 115_0000_0000,
      totalDepositManwon: 29000,
      loanAmountManwon: 500000, // 대출 50억
      isBasicMode: false,       // Pro IM
      assetType: '근린생활시설',
    });

    expect(fin.isBasicMode).toBe(false);
    const md = formatFinancialsMarkdown(fin);
    console.log('=== Pro IM markdown ===');
    console.log(md);

    // WACC가 있어야 함
    expect(md).toContain('WACC');
  });

  it('!supplemental.loan_amount_manwon evaluates correctly', () => {
    // undefined → true (Basic)
    expect(!undefined).toBe(true);
    // null → true (Basic)
    expect(!null).toBe(true);
    // 0 → true (Basic — 대출 0원)
    expect(!0).toBe(true);
    // 50000 → false (Pro — 대출 50억)
    expect(!50000).toBe(false);
  });
});
