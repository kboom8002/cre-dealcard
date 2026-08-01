import { describe, it, expect } from 'vitest';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { classifyDealArchetype } from '@/domain/deal/archetype-classifier';

describe('Data Grade Engine (S1-T4)', () => {
  it('computes Grade A when all required and 80%+ enhanced slots exist', () => {
    const attrs = {
      pnu: '1120011400100450012',
      address: '서울 성동구 성수동2가 000-00',
      landAreaPyung: 100,
      totalFloorAreaPyung: 350,
      askingPriceKrw: 8_000_000_000,
      grossAnnualIncomeKrw: 320_000_000,
      zoningRegion: '제2종일반주거지역',
      approvalDate: '2015-05-10',
      farHeadroomPp: 45,
      evictionStatus: '명도완료',
      rentRoll: '1층 A카페 월 800',
      officialLandPricePerSqm: 15000000,
      roadContactType: '광대로접함',
    };

    const result = computeDataGrade(attrs);
    expect(result.grade).toBe('A');
    expect(result.dcfEligible).toBe(true);
    expect(result.missingRequiredSlots.length).toBe(0);
  });

  it('computes Grade D when required slots are missing', () => {
    const attrs = { pnu: '1120011400100450012' };
    const result = computeDataGrade(attrs);
    expect(result.grade).toBe('D');
    expect(result.dcfEligible).toBe(false);
  });
});

describe('Constraint Validator (S1-T5)', () => {
  it('validates zoning FAR limits (C02)', () => {
    const attrs = {
      zoningRegion: '제2종일반주거지역', // Limit 250%
      farPct: 290,
    };
    const result = validateAssetConstraints(attrs);
    expect(result.warningsCount).toBeGreaterThan(0);
    expect(result.violations[0].ruleId).toBe('C02');
  });

  it('flags over-leverage Warning (C12)', () => {
    const attrs = {
      askingPriceKrw: 10_000_000_000, // 100억
      loanAmountKrw: 9_000_000_000,    // 90억
      totalDepositKrw: 3_000_000_000,  // 30억 (합계 120억 > 110억)
    };
    const result = validateAssetConstraints(attrs);
    expect(result.violations.some((v) => v.ruleId === 'C12')).toBe(true);
  });
});

describe('Archetype Classifier (S1-T6)', () => {
  it('classifies STABLE_INCOME archetype for low vacancy newer building', () => {
    const attrs = {
      vacancyPct: 0,
      approvalDate: '2020-01-01',
      askingPriceKrw: 5_000_000_000,
    };
    const result = classifyDealArchetype(attrs);
    expect(result.primaryArchetype).toBe('STABLE_INCOME');
  });

  it('classifies VALUE_ADD archetype for older building with FAR headroom', () => {
    const attrs = {
      approvalDate: '1995-01-01', // Age ~31
      farHeadroomPp: 40,
    };
    const result = classifyDealArchetype(attrs);
    expect(result.primaryArchetype).toBe('VALUE_ADD');
  });
});
