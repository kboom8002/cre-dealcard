import { describe, it, expect } from 'vitest';
import { evaluateFreshness } from '../freshness-engine';

describe('Freshness Engine (F01~F10) Comprehensive Edge Cases', () => {
  it('F01-경과: flags warning when registry lookup exceeds 30 days', () => {
    const verdicts = evaluateFreshness({ registryDays: 35 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F01');
    expect(verdicts[0].severity).toBe('warn');
    expect(verdicts[0].source).toBe('rule');
  });

  it('F01-정상: passes when registry lookup is within 30 days', () => {
    const verdicts = evaluateFreshness({ registryDays: 20 });
    expect(verdicts.some(v => v.code === 'F01')).toBe(false);
  });

  it('F02-경과: flags info when land use plan exceeds 90 days', () => {
    const verdicts = evaluateFreshness({ landUsePlanDays: 95 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F02');
    expect(verdicts[0].severity).toBe('info');
    expect(verdicts[0].source).toBe('rule');
  });

  it('F03-경과: flags warning when comps exceed 60 days', () => {
    const verdicts = evaluateFreshness({ compsDays: 65 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F03');
    expect(verdicts[0].severity).toBe('warn');
  });

  it('F04-경과: flags info when building register exceeds 60 days', () => {
    const verdicts = evaluateFreshness({ buildingRegisterDays: 65 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F04');
    expect(verdicts[0].severity).toBe('info');
  });

  it('F05-연도: flags warning when official price year is before current year', () => {
    const verdicts = evaluateFreshness({ officialPriceYear: 2025, currentYear: 2026 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F05');
    expect(verdicts[0].severity).toBe('warn');
  });

  it('F06-인근: flags info when new nearby comps exist within 500m', () => {
    const verdicts = evaluateFreshness({ hasNewNearbyComps: true });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F06');
    expect(verdicts[0].severity).toBe('info');
  });

  it('F07-금리: flags warning when interest rate shifts by >= 0.25%p', () => {
    const verdicts = evaluateFreshness({ rateDeltaPct: 0.30 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F07');
    expect(verdicts[0].severity).toBe('warn');
  });

  it('F07-무변동: does not flag when interest rate shift is < 0.25%p', () => {
    const verdicts = evaluateFreshness({ rateDeltaPct: 0.10 });
    expect(verdicts.some(v => v.code === 'F07')).toBe(false);
  });

  it('F08-공실: flags warning when vacancy duration >= 60 days', () => {
    const verdicts = evaluateFreshness({ vacancyDurationDays: 65 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F08');
    expect(verdicts[0].severity).toBe('warn');
  });

  it('F09-만기: flags block when lease expiry is within 6 months', () => {
    const verdicts = evaluateFreshness({ monthsToMinExpiry: 5 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F09');
    expect(verdicts[0].severity).toBe('block');
  });

  it('F09-충분: does not flag when lease expiry has > 6 months remaining', () => {
    const verdicts = evaluateFreshness({ monthsToMinExpiry: 8 });
    expect(verdicts.some(v => v.code === 'F09')).toBe(false);
  });

  it('F10-갱신권: flags info when renewal rights expiry is <= 12 months', () => {
    const verdicts = evaluateFreshness({ monthsToRenewalExpiry: 10 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].code).toBe('F10');
    expect(verdicts[0].severity).toBe('info');
  });

  it('ALL-source: ensures all generated verdicts strictly originate from rule engine', () => {
    const allVerdicts = evaluateFreshness({
      registryDays: 40,
      landUsePlanDays: 100,
      compsDays: 70,
      buildingRegisterDays: 70,
      officialPriceYear: 2025,
      currentYear: 2026,
      hasNewNearbyComps: true,
      rateDeltaPct: 0.5,
      vacancyDurationDays: 90,
      monthsToMinExpiry: 3,
      monthsToRenewalExpiry: 6,
    });
    expect(allVerdicts.length).toBe(10);
    allVerdicts.forEach(v => {
      expect(v.source).toBe('rule');
      expect(v.resolved).toBe(false);
      expect(v.detectedAt).toBeDefined();
    });
  });
});
