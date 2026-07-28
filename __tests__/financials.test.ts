import { describe, it, expect } from 'vitest';
import {
  calculateNOI,
  calculateCapRate,
  calculateEquityRequired,
  computeFinancialSummary,
} from '../src/domain/building/financials';
import { validateAssetProvenance, attachDefaultProvenance } from '../src/lib/provenance-guard';

describe('Financial Engine (S0-T1 & S0-T2 & S0-T6)', () => {
  it('correctly calculates NOI with default assumptions', () => {
    // 100,000,000 gross income, 5% vacancy (95M EGI), 10% OPEX (9.5M) => 85.5M NOI
    const result = calculateNOI(100_000_000);
    expect(result.value).toBe(85_500_000);
    expect(result.isAssumption).toBe(true);
    expect(result.provenanceTier).toBe('ai_inferred');
  });

  it('correctly calculates Cap Rate', () => {
    const noi = 500_000_000;
    const askingPrice = 10_000_000_000; // 100억
    const capRate = calculateCapRate(noi, askingPrice);
    expect(capRate.value).toBe(5.0);
    expect(capRate.provenanceTier).toBe('broker_input');
  });

  it('gates DCF analysis by Data Grade A', () => {
    const summaryGradeB = computeFinancialSummary({
      askingPriceKrw: 10_000_000_000,
      grossAnnualIncomeKrw: 500_000_000,
      dataGrade: 'B',
    });
    expect(summaryGradeB.dcfEligible).toBe(false);
    expect(summaryGradeB.dcfReason).toContain('DCF 비활성화');

    const summaryGradeA = computeFinancialSummary({
      askingPriceKrw: 10_000_000_000,
      grossAnnualIncomeKrw: 500_000_000,
      dataGrade: 'A',
    });
    expect(summaryGradeA.dcfEligible).toBe(true);
    expect(summaryGradeA.dcfReason).toContain('DCF 분석 가용');
  });
});

describe('Provenance Guard (S0-T4)', () => {
  it('passes validation when all attributes have provenance metadata', () => {
    const validPayload = {
      attrs: { totalFloorArea: 450, asksPrice: 5000000000 },
      provenance: {
        totalFloorArea: { tier: 'public_data' as const, verified_at: new Date().toISOString() },
        asksPrice: { tier: 'broker_input' as const, verified_at: new Date().toISOString() },
      },
    };
    expect(() => validateAssetProvenance(validPayload)).not.toThrow();
  });

  it('throws error when provenance metadata is missing for any attribute', () => {
    const invalidPayload = {
      attrs: { totalFloorArea: 450, asksPrice: 5000000000 },
      provenance: {
        totalFloorArea: { tier: 'public_data' as const, verified_at: new Date().toISOString() },
      },
    };
    expect(() => validateAssetProvenance(invalidPayload)).toThrow(/ProvenanceViolation/);
  });

  it('attaches default provenance correctly', () => {
    const rawAttrs = { areaPyung: 120, zoning: '제3종일반주거지역' };
    const wrapped = attachDefaultProvenance(rawAttrs, 'public_data', 'MOLIT_API');
    expect(wrapped.provenance.areaPyung.tier).toBe('public_data');
    expect(wrapped.provenance.areaPyung.source_ref).toBe('MOLIT_API');
    expect(() => validateAssetProvenance(wrapped)).not.toThrow();
  });
});
