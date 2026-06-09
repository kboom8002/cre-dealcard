// src/domain/building/mobile-im/value-add-engine.ts
// 밸류업 시나리오 엔진 — 공실해소, 임대료인상, 리모델링 3가지 시나리오 계산

export interface ValueAddInputs {
  currentNoi: number;
  purchasePriceKrw: number;
  currentVacancyPct: number;
  currentMonthlyRentKrw: number;
  totalAreaSqm: number;
  assetType?: string;
}

export interface ValueAddScenario {
  name: string;
  description: string;
  noiImprovement: number;
  noiImprovementPct: number;
  newCapRate: number | null;
  investmentRequired: number;
  paybackYears: number | null;
}

export interface ValueAddOutput {
  scenarios: ValueAddScenario[];
  bestScenario: ValueAddScenario;
  markdownTable: string;
}

export function computeValueAddScenarios(inputs: ValueAddInputs): ValueAddOutput {
  const { currentNoi, purchasePriceKrw, currentVacancyPct, currentMonthlyRentKrw, totalAreaSqm } = inputs;
  const scenarios: ValueAddScenario[] = [];

  // ── Scenario 1: 공실 해소
  if (currentVacancyPct > 0) {
    const additionalMonthlyRent = currentMonthlyRentKrw * (currentVacancyPct / Math.max(100 - currentVacancyPct, 1));
    const additionalAnnualNoi = additionalMonthlyRent * 12 * 0.82;
    const noiImprovementPct = currentNoi > 0 ? (additionalAnnualNoi / currentNoi) * 100 : 0;
    scenarios.push({
      name: '① 공실 해소',
      description: `현재 공실 ${currentVacancyPct}% 해소 시`,
      noiImprovement: Math.round(additionalAnnualNoi),
      noiImprovementPct: parseFloat(noiImprovementPct.toFixed(1)),
      newCapRate: purchasePriceKrw > 0 ? parseFloat((((currentNoi + additionalAnnualNoi) / purchasePriceKrw) * 100).toFixed(2)) : null,
      investmentRequired: 0,
      paybackYears: 0,
    });
  }

  // ── Scenario 2: 임대료 현실화 (+5%)
  const rentIncreaseAnnualNoi = currentMonthlyRentKrw * 12 * 0.05 * 0.82;
  scenarios.push({
    name: '② 임대료 현실화 (+5%)',
    description: '차기 갱신 시 시장가 기준 5% 증액',
    noiImprovement: Math.round(rentIncreaseAnnualNoi),
    noiImprovementPct: currentNoi > 0 ? parseFloat(((rentIncreaseAnnualNoi / currentNoi) * 100).toFixed(1)) : 0,
    newCapRate: purchasePriceKrw > 0 ? parseFloat((((currentNoi + rentIncreaseAnnualNoi) / purchasePriceKrw) * 100).toFixed(2)) : null,
    investmentRequired: 0,
    paybackYears: 0,
  });

  // ── Scenario 3: 리모델링
  if (totalAreaSqm > 0) {
    const remodelCostPerSqm = 300_000;
    const remodelCost = totalAreaSqm * remodelCostPerSqm;
    const rentLiftPct = 0.08;
    const remodelNoiIncrease = currentMonthlyRentKrw * 12 * rentLiftPct * 0.82;
    scenarios.push({
      name: '③ 리모델링 후 임대료 상승',
      description: `경량 리모델링 후 임대료 ${(rentLiftPct * 100).toFixed(0)}% 상승 가정`,
      noiImprovement: Math.round(remodelNoiIncrease),
      noiImprovementPct: currentNoi > 0 ? parseFloat(((remodelNoiIncrease / currentNoi) * 100).toFixed(1)) : 0,
      newCapRate: purchasePriceKrw > 0 ? parseFloat((((currentNoi + remodelNoiIncrease) / purchasePriceKrw) * 100).toFixed(2)) : null,
      investmentRequired: Math.round(remodelCost),
      paybackYears: remodelNoiIncrease > 0 ? parseFloat((remodelCost / remodelNoiIncrease).toFixed(1)) : null,
    });
  }

  if (scenarios.length === 0) {
    // Edge case: no valid scenarios (e.g. all zero inputs)
    const empty: ValueAddScenario = {
      name: '시나리오 없음', description: '유효한 입력 데이터가 부족합니다.',
      noiImprovement: 0, noiImprovementPct: 0, newCapRate: null, investmentRequired: 0, paybackYears: null,
    };
    return { scenarios: [empty], bestScenario: empty, markdownTable: '' };
  }

  const bestScenario = scenarios.reduce((a, b) => a.noiImprovement > b.noiImprovement ? a : b);
  const fmt = (n: number) => `약 ${(n / 100_000_000).toFixed(2)}억 원`;

  const markdownTable = `### 밸류업 시나리오 (AI 추정)
| 시나리오 | NOI 개선 | 개선 Cap Rate | 투자 비용 |
|---------|---------|-------------|--------|
${scenarios.map((s) => `| ${s.name} | +${fmt(s.noiImprovement)} (+${s.noiImprovementPct}%) | ${s.newCapRate ? s.newCapRate + '%' : '-'} | ${s.investmentRequired > 0 ? fmt(s.investmentRequired) : '불필요'} |`).join('\n')}

> 밸류업 시나리오는 AI 추정이며 실제 시장 조건에 따라 다를 수 있습니다.`;

  return { scenarios, bestScenario, markdownTable };
}
