import { describe, it, expect } from 'vitest';
import { computeDataGrade } from '../grade-engine';
import { THRESHOLDS } from '@/constants/thresholds';

describe('Data Grade Engine & Next Step Guidance (S4, S5-1)', () => {
  it('기본 필수 데이터만 있을 때 C 또는 B 등급 및 적절한 nextStep이 1개 도출되어야 한다', () => {
    const res = computeDataGrade({
      pnu: '1168010100100010001',
      address: '서울시 강남구 역삼동 123-45',
      askingPriceKrw: 10_000_000_000,
    });

    expect(['B', 'C', 'D']).toContain(res.grade);
    expect(res.nextStep).toBeDefined();
    if (res.nextStep) {
      expect(res.nextStep.slot).toBeDefined();
      expect(res.nextStep.slotLabel).toBeDefined();
      expect(res.nextStep.unlocks.length).toBeGreaterThan(0);
      expect(['A', 'B', 'C']).toContain(res.nextStep.gradeAfter);
    }
  });

  it('모든 데이터 완비 및 구조화 렌트롤 제공 시 A등급 및 DCF 적격이어야 한다', () => {
    const fullAttrs = {
      pnu: '1168010100100010001',
      address: '서울시 강남구 역삼동 123-45',
      landAreaPyung: 150,
      totalFloorAreaPyung: 600,
      askingPriceKrw: 15_000_000_000,
      loanAmountKrw: 5_000_000_000,
      zoningRegion: '일반상업지역',
      farHeadroomPp: 50,
      titleEncumbrance: '깨끗함',
      roadContactType: '광대한면',
      marketCompPerPyung: 120_000_000,
      approvalDate: '2020-01-01',
      evictionStatus: '해당없음',
      officialLandPricePerSqm: 35_000_000,
      grossAnnualIncomeKrw: 600_000_000,
      leaseUnits: [
        { unitLabel: '101호', depositKrw: 100_000_000, monthlyRentKrw: 10_000_000 },
        { unitLabel: '201호', depositKrw: 100_000_000, monthlyRentKrw: 10_000_000 },
      ],
    };

    const res = computeDataGrade(fullAttrs, { investmentPosture: 'income' });
    expect(res.grade).toBe('A');
    expect(res.dcfEligible).toBe(true);
    expect(res.suppressDcf).toBe(false);
  });

  it('잠긴 지표 목록(lockedMetrics)이 누락 사유와 함께 채워져야 한다', () => {
    const partialAttrs = {
      pnu: '1168010100100010001',
      address: '서울시 강남구 역삼동 123-45',
    };

    const res = computeDataGrade(partialAttrs);
    expect(res.lockedMetrics).toBeDefined();
    expect(res.lockedMetrics!.length).toBeGreaterThan(0);
    expect(res.lockedMetrics![0].key).toBeDefined();
    expect(res.lockedMetrics![0].missing.length).toBeGreaterThan(0);
  });

  // Rule 7: Negative Pair — 빈 속성 전달 시 D등급, blockPublish=true, dcfEligible=false
  it('Rule 7 (Negative Pair): 빈 속성 전달 시 D등급 산출 및 발행 차단', () => {
    const emptyRes = computeDataGrade({});
    expect(emptyRes.grade).toBe('D');
    expect(emptyRes.blockPublish).toBe(true);
    expect(emptyRes.dcfEligible).toBe(false);
    expect(emptyRes.suppressDcf).toBe(true);
    expect(emptyRes.suppressTotalReturn).toBe(true);
    expect(emptyRes.scorePct).toBeLessThan(THRESHOLDS.GRADE_D_MAX);
  });

  // Rule 7: Negative Pair — income 포스처에서 렌트롤 누락 시 A등급 승격 차단
  it('Rule 7 (Negative Pair): 렌트롤 없는 income 포스처는 A등급 승격이 차단(B등급 제한)되어야 한다', () => {
    const attrsWithoutRentRoll = {
      pnu: '1168010100100010001',
      address: '서울시 강남구 역삼동 123-45',
      landAreaPyung: 150,
      totalFloorAreaPyung: 600,
      askingPriceKrw: 15_000_000_000,
      loanAmountKrw: 5_000_000_000,
      zoningRegion: '일반상업지역',
      farHeadroomPp: 50,
      titleEncumbrance: '깨끗함',
      roadContactType: '광대한면',
      marketCompPerPyung: 120_000_000,
      approvalDate: '2020-01-01',
      evictionStatus: '해당없음',
      officialLandPricePerSqm: 35_000_000,
      grossAnnualIncomeKrw: 600_000_000,
    };
    const res = computeDataGrade(attrsWithoutRentRoll, { investmentPosture: 'income' });
    expect(res.grade).not.toBe('A');
    expect(res.dcfEligible).toBe(false);
  });

  // Rule 7: Negative Pair — L축이 R0이거나 P축이 P0이면 무조건 D등급이어야 한다
  it('Rule 7 (Negative Pair): L축 또는 P축이 0개 충족 시 무조건 D등급이어야 한다', () => {
    const res = computeDataGrade({ address: '서울시 강남구' }, { investmentPosture: 'income' });
    expect(res.L).toBe('R0');
    expect(res.grade).toBe('D');
    expect(res.blockPublish).toBe(true);
  });
});
