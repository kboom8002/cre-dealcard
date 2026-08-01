import { describe, it, expect } from 'vitest';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';

describe('Constraint Validator — Extended Rules C05-C13', () => {
  // C05: Cap Rate reasonability
  it('C05: should warn when implied cap rate exceeds 30%', () => {
    const result = validateAssetConstraints({ askingPriceKrw: 1000000, grossAnnualIncomeKrw: 400000 });
    const c05 = result.violations.find(v => v.ruleId === 'C05');
    expect(c05).toBeDefined();
    expect(c05?.severity).toBe('warning');
  });

  it('C05: should not warn for normal cap rate', () => {
    const result = validateAssetConstraints({ askingPriceKrw: 10000000, grossAnnualIncomeKrw: 500000 });
    const c05 = result.violations.find(v => v.ruleId === 'C05');
    expect(c05).toBeUndefined();
  });

  // C06: Building Age
  it('C06: should error for future build year', () => {
    const result = validateAssetConstraints({ buildYear: 2099 });
    const c06 = result.violations.find(v => v.ruleId === 'C06');
    expect(c06).toBeDefined();
    expect(c06?.severity).toBe('error');
  });

  it('C06: should error for build year before 1900', () => {
    const result = validateAssetConstraints({ buildYear: 1850 });
    expect(result.violations.find(v => v.ruleId === 'C06')).toBeDefined();
  });

  // C07: Floors sanity
  it('C07: should warn for floors > 200', () => {
    const result = validateAssetConstraints({ floorsAboveGround: 300 });
    expect(result.violations.find(v => v.ruleId === 'C07')).toBeDefined();
  });

  it('C07: should not warn for reasonable floors', () => {
    const result = validateAssetConstraints({ floorsAboveGround: 15 });
    expect(result.violations.find(v => v.ruleId === 'C07')).toBeUndefined();
  });

  // C08: Deposit > Price
  it('C08: should error when deposit exceeds asking price', () => {
    const result = validateAssetConstraints({ askingPriceKrw: 1000, totalDepositKrw: 1500 });
    expect(result.violations.find(v => v.ruleId === 'C08')).toBeDefined();
  });

  // C09: Vacancy > 100%
  it('C09: should error for vacancy rate > 100%', () => {
    const result = validateAssetConstraints({ vacancyRatePct: 150 });
    expect(result.violations.find(v => v.ruleId === 'C09')).toBeDefined();
  });

  // C10: OPEX > 80%
  it('C10: should warn for OPEX ratio > 80%', () => {
    const result = validateAssetConstraints({ opexRatioPct: 90 });
    expect(result.violations.find(v => v.ruleId === 'C10')).toBeDefined();
  });

  // C11: DCF for non-A grade
  it('C11: should error when DCF requested for non-A grade', () => {
    const result = validateAssetConstraints({ dataGrade: 'C', dcfRequested: true });
    expect(result.violations.find(v => v.ruleId === 'C11')).toBeDefined();
  });

  it('C11: should allow DCF for grade A', () => {
    const result = validateAssetConstraints({ dataGrade: 'A', dcfRequested: true });
    expect(result.violations.find(v => v.ruleId === 'C11')).toBeUndefined();
  });

  // C13: Address fallback guard
  it('C13: should warn for low-confidence fallback address', () => {
    const result = validateAssetConstraints({ addressSource: 'fallback', addressConfidence: 0.5 });
    const c13 = result.violations.find(v => v.ruleId === 'C13');
    expect(c13).toBeDefined();
    expect(c13?.severity).toBe('warning');
  });

  it('C13: should not warn for high-confidence address', () => {
    const result = validateAssetConstraints({ addressSource: 'fallback', addressConfidence: 0.95 });
    expect(result.violations.find(v => v.ruleId === 'C13')).toBeUndefined();
  });

  it('C13: should not warn for non-fallback address', () => {
    const result = validateAssetConstraints({ addressSource: 'public_api', addressConfidence: 0.5 });
    expect(result.violations.find(v => v.ruleId === 'C13')).toBeUndefined();
  });
});
