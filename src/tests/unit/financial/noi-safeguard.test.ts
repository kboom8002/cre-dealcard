import { describe, it, expect } from 'vitest';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { FinancialCalculator } from '@/domain/building/im-core/financial-calculator';

describe('Financial Calculation Safeguards (CIM-0103 / PR-M1-03)', () => {
  it('should flag violation and keep cap_rate as unverified when operating expenses are not provided', () => {
    const registry = new ClaimRegistry();
    const calculator = new FinancialCalculator(registry, '2026-09-03');

    const result = calculator.calculate({
      purchasePriceKrw: 10000000000,
      monthlyRentKrw: 35000000,
      posture: 'income',
      // opexRatioPct and mgmtFeeTotalManwon are undefined / missing
    });

    // Verify G38 violation recorded
    expect(result.violations.some((v) => v.includes('G38_NOI_MISSING_OPEX'))).toBe(true);

    // Verify that cap_rate_base claim status is unverified, NOT reconciled
    const capRateClaim = result.claims.find((c) => c.subject === 'cap_rate_base');
    expect(capRateClaim).toBeDefined();
    expect(capRateClaim?.status).toBe('unverified');
  });

  it('should reconcile cap_rate_base when user operating expenses are explicitly provided', () => {
    const registry = new ClaimRegistry();
    const calculator = new FinancialCalculator(registry, '2026-09-03');

    const result = calculator.calculate({
      purchasePriceKrw: 10000000000,
      monthlyRentKrw: 35000000,
      opexRatioPct: 8.0,
      mgmtFeeTotalManwon: 200,
      posture: 'income',
    });

    expect(result.violations.some((v) => v.includes('G38_NOI_MISSING_OPEX'))).toBe(false);
    const capRateClaim = result.claims.find((c) => c.subject === 'cap_rate_base');
    expect(capRateClaim).toBeDefined();
    expect(capRateClaim?.status).toBe('reconciled');
  });
});
