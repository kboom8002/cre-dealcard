/**
 * Stabilized Cap Rate claim → renderer 전달 검증
 * 
 * Bug #2/#4 검증:
 * - FinancialCalculator가 등록한 pro_forma_cap_rate claim을 pptx-renderer가 우선 참조하는지
 * - claim이 없을 때 fallback 재계산이 정상 동작하는지
 * - vacPct=0인 만실 매물에서 capRateStabilized=undefined인지
 * - 임계값 완화(20% → >0%) 후 15% 공실에서도 claim이 등록되는지
 * 
 * Rule 7: Negative Pair Obligation
 */
import { describe, test, expect } from 'vitest';
import { FinancialCalculator } from '@/domain/building/im-core/financial-calculator';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';

/**
 * pptx-renderer.ts의 capRateStabilized 산출 로직을 격리 재현
 * (실제 파일의 L508-517 로직)
 */
function computeCapRateStabilized(params: {
  ssot: Record<string, any>;
  floorLeases?: Array<Record<string, any>>;
  claims?: Array<{ subject: string; value: number }>;
}): number | undefined {
  const { ssot, floorLeases, claims } = params;
  const askManwon = Number(ssot.asking_price_manwon ?? 0);
  const depositKrw = Number(ssot.total_deposit_manwon ?? 0) * 10000;
  const monthlyRentKrw = Number(ssot.monthly_rent_total_krw ?? 0);
  const annualRentKrw = monthlyRentKrw * 12;
  let vacPct = Number(ssot.vacancy_pct ?? 0);

  // floor_leases fallback
  if (vacPct === 0 && floorLeases && floorLeases.length > 0) {
    const totalUnits = floorLeases.length;
    const vacantUnits = floorLeases.filter((l) =>
      l.is_vacant === true
      || l.tenant === '공실' || l.tenant_name === '공실'
      || l.tenant_type === '공실' || l.tenant_sector === '공실'
      || (l.tenant_type?.includes?.('공실'))
      || (l.rent_manwon === 0 && l.deposit_manwon === 0 && !l.tenant_type)
    ).length;
    if (vacantUnits > 0 && totalUnits > 0) {
      vacPct = Math.round((vacantUnits / totalUnits) * 1000) / 10;
    }
  }

  const askKrw = askManwon * 10000;
  const denominator = askKrw - depositKrw;
  
  // claims 우선 참조
  const docClaims = claims ?? [];
  const proFormaClaim = docClaims.find(c => c.subject === 'pro_forma_cap_rate');
  const capRateStabilized = proFormaClaim?.value != null && proFormaClaim.value > 0
    ? proFormaClaim.value
    : (vacPct > 0 && denominator > 0
      ? ((annualRentKrw * (1 + vacPct / (100 - vacPct))) / denominator * 100)
      : undefined);

  return capRateStabilized;
}

describe('Stabilized Cap Rate claim 연동', () => {
  test('POSITIVE: pro_forma_cap_rate claim이 있으면 capRateStabilized에 바인딩', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 13500,
        total_deposit_manwon: 3000,
        monthly_rent_total_krw: 4500000,
        vacancy_pct: 30,
      },
      claims: [{ subject: 'pro_forma_cap_rate', value: 5.82 }],
    });
    expect(result).toBe(5.82);
  });

  test('POSITIVE: claim 없고 vacPct > 0이면 fallback 재계산', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 500000,  // 50억 (만원 단위)
        total_deposit_manwon: 50000,   // 5억 (만원 단위)
        monthly_rent_total_krw: 30000000, // 3000만/월 (원 단위)
        vacancy_pct: 30,
      },
      claims: [],
    });
    expect(result).toBeDefined();
    expect(result).toBeGreaterThan(0);
    // annualRent = 3.6억, denom = 50억-5억 = 45억, stabilized ≈ 11.4%
    expect(result!).toBeLessThan(20); // 합리적 범위
  });

  test('POSITIVE: vacPct=0이면 capRateStabilized=undefined (만실)', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 11500,
        total_deposit_manwon: 2000,
        monthly_rent_total_krw: 8000000,
        vacancy_pct: 0,
      },
      claims: [],
    });
    expect(result).toBeUndefined();
  });

  test('NEGATIVE: claim 값이 0이면 fallback 재계산 (claim 무시)', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 5000,
        total_deposit_manwon: 500,
        monthly_rent_total_krw: 1500000,
        vacancy_pct: 20,
      },
      claims: [{ subject: 'pro_forma_cap_rate', value: 0 }],
    });
    // claim value가 0이므로 fallback 재계산되어야 함
    expect(result).toBeDefined();
    expect(result).toBeGreaterThan(0);
  });

  test('POSITIVE: floor_leases에서 vacPct 직접 산출 (ssot에 vacancy_pct 없을 때)', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 5000,
        total_deposit_manwon: 500,
        monthly_rent_total_krw: 1500000,
        // vacancy_pct 미설정
      },
      floorLeases: [
        { floor: '1F', tenant_name: '스타벅스', rent_manwon: 600, deposit_manwon: 8000 },
        { floor: '2F', is_vacant: true, rent_manwon: 0, deposit_manwon: 0 },
        { floor: '3F', tenant_name: '법무법인', rent_manwon: 400, deposit_manwon: 5000 },
      ],
      claims: [],
    });
    // 3유닛 중 1공실 → vacPct ≈ 33.3%
    expect(result).toBeDefined();
    expect(result).toBeGreaterThan(0);
  });

  test('NEGATIVE: denominator ≤ 0이면 undefined (보증금 ≥ 매도가)', () => {
    const result = computeCapRateStabilized({
      ssot: {
        asking_price_manwon: 1000,
        total_deposit_manwon: 1500, // 보증금 > 매도가
        monthly_rent_total_krw: 500000,
        vacancy_pct: 20,
      },
      claims: [],
    });
    expect(result).toBeUndefined();
  });
});

describe('FinancialCalculator pro_forma 임계값', () => {
  test('POSITIVE: vacancyRatePct=15%에서 pro_forma_cap_rate 등록 (임계값 완화 검증)', () => {
    const registry = new ClaimRegistry();
    const calc = new FinancialCalculator(registry);
    calc.calculate({
      posture: 'income',
      purchasePriceKrw: 50_0000_0000, // 50억
      monthlyRentKrw: 3000_0000,      // 3000만/월
      totalAreaSqm: 500,
      vacancyRatePct: 15,
    });

    const allClaims = registry.getAll();
    const proFormaClaim = allClaims.find(c => c.subject === 'pro_forma_cap_rate');
    expect(proFormaClaim).toBeDefined();
    expect(proFormaClaim!.value).toBeGreaterThan(0);
    // 15% 공실 → 정상화 시 연 임대료 증가 → pro_forma > base cap rate
    const baseClaim = allClaims.find(c => c.subject === 'cap_rate_base');
    if (baseClaim) {
      expect(Number(proFormaClaim!.value)).toBeGreaterThan(Number(baseClaim.value));
    }
  });

  test('POSITIVE: vacancyRatePct=5%에서도 pro_forma_cap_rate 등록', () => {
    const registry = new ClaimRegistry();
    const calc = new FinancialCalculator(registry);
    calc.calculate({
      posture: 'income',
      purchasePriceKrw: 50_0000_0000,
      monthlyRentKrw: 3000_0000,
      totalAreaSqm: 500,
      vacancyRatePct: 5,
    });

    const proFormaClaim = registry.getAll().find(c => c.subject === 'pro_forma_cap_rate');
    expect(proFormaClaim).toBeDefined();
    expect(proFormaClaim!.value).toBeGreaterThan(0);
  });

  test('NEGATIVE: vacancyRatePct=0%이면 pro_forma 미등록 (만실)', () => {
    const registry = new ClaimRegistry();
    const calc = new FinancialCalculator(registry);
    calc.calculate({
      posture: 'income',
      purchasePriceKrw: 50_0000_0000,
      monthlyRentKrw: 3000_0000,
      totalAreaSqm: 500,
      vacancyRatePct: 0,
    });

    const proFormaClaim = registry.getAll().find(c => c.subject === 'pro_forma_cap_rate');
    expect(proFormaClaim).toBeUndefined();
  });

  test('NEGATIVE: vacancyRatePct가 null/undefined이면 pro_forma 미등록', () => {
    const registry = new ClaimRegistry();
    const calc = new FinancialCalculator(registry);
    calc.calculate({
      posture: 'income',
      purchasePriceKrw: 50_0000_0000,
      monthlyRentKrw: 3000_0000,
      totalAreaSqm: 500,
      vacancyRatePct: undefined,
    });

    const proFormaClaim = registry.getAll().find(c => c.subject === 'pro_forma_cap_rate');
    expect(proFormaClaim).toBeUndefined();
  });

  test('POSITIVE: pro_forma_upside도 함께 등록', () => {
    const registry = new ClaimRegistry();
    const calc = new FinancialCalculator(registry);
    calc.calculate({
      posture: 'income',
      purchasePriceKrw: 50_0000_0000,
      monthlyRentKrw: 3000_0000,
      totalAreaSqm: 500,
      vacancyRatePct: 30,
    });

    const upsideClaim = registry.getAll().find(c => c.subject === 'pro_forma_upside_cap_rate_pp');
    expect(upsideClaim).toBeDefined();
    expect(upsideClaim!.value).toBeGreaterThan(0);
    expect(upsideClaim!.unit).toBe('%p');
  });
});
