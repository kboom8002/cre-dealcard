// 안정화 수익률 market_rent (렌트롤 J5~J7) + V05 별도 줄 — yield-set.ts
import { describe, it, expect } from 'vitest';
import {
  buildYieldSet,
  buildYieldSetFromBody,
  classifyFloorForMarketRent,
  computeMarketRentStabilization,
} from '@/domain/building/mobile-im/yield-set';

const PY = 3.305785;
const J = { market_rent_1f: 1_300_000, market_rent_upper: 900_000, market_rent_basement: 600_000 };
const SRC = {
  market_rent_1f_source: '인근 중개 3건',
  market_rent_upper_source: '호가 2025-05',
  market_rent_basement_source: '감정 참고',
};

const leased = { floor: '1F', lease_state: '임대중', area_sqm: 100, exclusive_area_sqm: 80 };
const vacB1 = { floor: 'B1', lease_state: '공실', area_sqm: 70, exclusive_area_sqm: 60 };
const vac5F = { floor: '5F', lease_state: '공실', area_sqm: 100, exclusive_area_sqm: 80 };

const params = (over: Record<string, any> = {}) => ({
  annualRentKrw: 60_000_000,
  askingPriceKrw: 10_000_000_000,
  depositKrw: 100_000_000,
  floorLeases: [leased, vacB1, vac5F],
  marketRent: { ...J, ...SRC },
  ...over,
});

describe('classifyFloorForMarketRent', () => {
  it.each([
    ['B1', 'basement'], ['B2F', 'basement'], ['b1', 'basement'], ['지하1층', 'basement'], ['지하', 'basement'],
    ['1F', '1f'], ['1층', '1f'], ['1F-A', '1f'], ['1F(1)', '1f'], ['지상1층', '1f'], ['1', '1f'],
    ['2F', 'upper'], ['10F', 'upper'], ['11F', 'upper'], ['12층', 'upper'], ['옥탑', 'upper'], ['4F(1)', 'upper'],
  ])('%s → %s', (floor, cls) => {
    expect(classifyFloorForMarketRent(floor)).toBe(cls);
  });
  it('빈 값은 분류 불가', () => {
    expect(classifyFloorForMarketRent('')).toBeNull();
    expect(classifyFloorForMarketRent(undefined)).toBeNull();
  });
});

describe('market_rent 안정화 수익률', () => {
  it('Σ(공실 행 J[층 구분] × 전용㎡/3.305785)×12 → (연 임대료 + 가정 증가분) ÷ (매매가−보증금)', () => {
    const ys = buildYieldSet(params());
    const addedMonthly = (600_000 * 60) / PY + (900_000 * 80) / PY;
    const expected = Math.round(((60_000_000 + addedMonthly * 12) / 9_900_000_000) * 10_000) / 100;
    expect(ys.stabilized?.kind).toBe('market_rent');
    expect(ys.stabilized?.value).toBe(expected);
    expect(ys.stabilized?.label).toBe('안정화 수익률 (시장 임대료 가정)');
    expect(ys.stabilized?.appliedExclusivePyeong).toBe(Number(((60 + 80) / PY).toFixed(1)));
    expect(ys.stabilized?.addedRentKrw).toBe(Math.round(addedMonthly * 12));
  });

  it('임대면적이 아니라 전용면적을 쓴다 (임대면적 70/100 로 계산하면 값이 달라진다)', () => {
    const viaLease = (600_000 * 70) / PY + (900_000 * 100) / PY;
    const ys = buildYieldSet(params());
    expect(ys.stabilized?.addedRentKrw).not.toBe(Math.round(viaLease * 12));
  });

  it('캡션: 표기만 원→만원, J 값 환산 없음, M5~M7 출처 인용', () => {
    const cap = buildYieldSet(params()).stabilized!.caption!;
    expect(cap).toContain('지하층 60만원');
    expect(cap).toContain('지상층 90만원');
    expect(cap).not.toContain('1층 130만원'); // 1층 공실이 없으므로 인용하지 않는다
    expect(cap).toContain('/전용평·월');
    expect(cap).toContain('출처: 지상층 호가 2025-05; 지하층 감정 참고');
    expect(buildYieldSet(params()).stabilized!.marketRentSources).toEqual(['호가 2025-05', '감정 참고']); // 1층·지상층·지하층 순
  });

  it('출처가 비어 있으면 "출처 미기재"', () => {
    const cap = buildYieldSet(params({ marketRent: J })).stabilized!.caption!;
    expect(cap).toContain('출처 미기재');
  });

  it('자가사용 행도 임대 가정 대상', () => {
    const ys = buildYieldSet(params({ floorLeases: [leased, { floor: '2F', lease_state: '자가사용', exclusive_area_sqm: 50 }] }));
    expect(ys.stabilized?.kind).toBe('market_rent');
    expect(ys.stabilized?.caption).toContain('자가사용');
  });

  it('우선순위: market_rent > target_rent(만원/임대평) > reserve_excluded', () => {
    const all = buildYieldSet(params({ targetRentPerPyeongManwon: 10, vacancyReservePct: 5 }));
    expect(all.stabilized?.kind).toBe('market_rent');
  });

  it('산출 불가 → 다음 종류로 폴스루: 전용면적 없는 공실 행 (임대면적으로 대체 금지)', () => {
    const noExcl = { ...vac5F, exclusive_area_sqm: undefined }; // area_sqm 100 은 있음
    const withTarget = buildYieldSet(params({ floorLeases: [leased, vacB1, noExcl], targetRentPerPyeongManwon: 10, vacancyReservePct: 5 }));
    expect(withTarget.stabilized?.kind).toBe('target_rent'); // 면적을 아는 임대면적 기반 기존 방식으로
    const reserveOnly = buildYieldSet(params({ floorLeases: [leased, vacB1, noExcl], vacancyReservePct: 5 }));
    expect(reserveOnly.stabilized?.kind).toBe('reserve_excluded');
    const nothing = buildYieldSet(params({ floorLeases: [leased, vacB1, noExcl] }));
    expect(nothing.stabilized).toBeNull();
    expect(computeMarketRentStabilization([leased, vacB1, noExcl], { ...J })).toBeNull();
  });

  it('산출 불가 → 폴스루: 해당 층 구분의 J 값이 없는 행', () => {
    const noUpper = { ...J, market_rent_upper: null };
    const ys = buildYieldSet(params({ marketRent: noUpper, vacancyReservePct: 5 }));
    expect(ys.stabilized?.kind).toBe('reserve_excluded');
    expect(computeMarketRentStabilization([leased, vacB1, vac5F], noUpper)).toBeNull();
    // 공실 행이 지하만이면 지상층 J 가 없어도 산출 가능
    expect(computeMarketRentStabilization([leased, vacB1], noUpper)).not.toBeNull();
  });

  it('공실·자가사용 행이 없으면 market_rent 없음, J 가 없으면 기존 동작 불변', () => {
    expect(buildYieldSet(params({ floorLeases: [leased] })).stabilized).toBeNull();
    const legacy = buildYieldSet(params({ marketRent: undefined, targetRentPerPyeongManwon: 10 }));
    expect(legacy.stabilized?.kind).toBe('target_rent');
  });

  it('target_rent 단위(만원/임대평)는 J(원/전용평)와 섞이지 않는다 — 같은 입력에서 값이 독립', () => {
    const t = buildYieldSet(params({ marketRent: undefined, targetRentPerPyeongManwon: 10 }));
    const m = buildYieldSet(params({ targetRentPerPyeongManwon: 10 }));
    expect(m.stabilized?.kind).toBe('market_rent');
    expect(t.stabilized?.value).not.toBe(m.stabilized?.value);
    expect(m.assumptions.targetRentPerPyeongManwon).toBe(10);
  });

  it('buildYieldSetFromBody: body.rent_roll_meta 의 J5~J7·J8 을 읽는다', () => {
    const ys = buildYieldSetFromBody({
      ssot_summary: { asking_price_manwon: 1_000_000, monthly_rent_total_krw: 5_000_000, total_deposit_manwon: 10_000 },
      floor_leases: [leased, vacB1, vac5F],
      rent_roll_meta: { area_input_unit: 'sqm', other_income_krw: 300_000, ...J, ...SRC },
    });
    expect(ys.stabilized?.kind).toBe('market_rent');
    expect(ys.assumptions.otherIncomeKrw).toBe(300_000);
    expect(ys.grossYieldInclOtherIncome).not.toBeNull();
  });
});

describe('V05 — grossYieldInclOtherIncome (별도 줄, 헤드라인에 합산 금지)', () => {
  it('(연 임대료 + 기타수입×12) ÷ (매매가−보증금); 헤드라인(보증금 차감 수익률)은 불변', () => {
    const w = buildYieldSet(params({ otherIncomeKrw: 500_000 }));
    const wo = buildYieldSet(params());
    expect(w.grossYieldNetOfDeposit).toBe(wo.grossYieldNetOfDeposit);
    expect(w.grossYieldOnPrice).toBe(wo.grossYieldOnPrice);
    expect(w.grossYieldInclOtherIncome).toBe(Math.round(((60_000_000 + 6_000_000) / 9_900_000_000) * 10_000) / 100);
    expect(wo.grossYieldInclOtherIncome).toBeNull();
    expect(w.assumptions.otherIncomeKrw).toBe(500_000);
  });
});
