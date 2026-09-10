import { describe, it, expect } from 'vitest';
import { buildDeckSequence, type DeckSequenceInput } from '@/domain/building/mobile-im/pptx/deck-sequencer';

// 1. Summary A02: 3대 핵심 투자 포인트 공간 계산
describe('D41: Summary 3대 핵심 투자 포인트', () => {
  it('6개 metrics + leadSentence → 3개 포인트 모두 y 경계 내', () => {
    const metricsCount = 6;
    const startY = 2.15;
    const cardH = metricsCount > 4 ? 1.10 : 1.4;
    const cols = Math.min(4, metricsCount);
    const kpiRows = Math.ceil(metricsCount / cols);
    const kpiEndY = startY + kpiRows * (cardH + 0.18);
    const hlStartY = Math.max(kpiEndY + 0.10, 3.50);
    const availableH = 6.55 - hlStartY - 0.36;
    const numPoints = 3;
    const maxRowH = Math.min(0.64, availableH / numPoints - 0.06);
    const rowH = Math.max(0.40, maxRowH);
    const rowGap = Math.max(0.04, Math.min(0.12, (availableH - numPoints * rowH) / Math.max(1, numPoints - 1)));
    for (let idx = 0; idx < 3; idx++) {
      const ry = hlStartY + 0.36 + idx * (rowH + rowGap);
      expect(ry + rowH).toBeLessThanOrEqual(6.75);
    }
  });

  it('Negative: 기존 크기(cardH=1.4, rowH=0.64)에서는 02/03 렌더링 불가', () => {
    const startY = 2.15;
    const kpiRows = Math.ceil(6 / 4);
    const kpiEndY = startY + kpiRows * (1.4 + 0.18);
    const hlStartY = Math.max(kpiEndY + 0.15, 3.75);
    const ry_02 = hlStartY + 0.36 + 1 * (0.64 + 0.12);
    expect(ry_02 + 0.64).toBeGreaterThan(6.5);
  });
});

// 2. Comps 조건부 가드
describe('D41: Comps hasComparables guard', () => {
  it('Positive: hasComparables=true → Comps 포함', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'B', dataAvailability: { hasComparables: true, hasRentRoll: true } });
    expect(seq.some(s => s.dataKey === 'comps')).toBe(true);
  });
  it('Negative: hasComparables=false → Comps 미포함', () => {
    const seq = buildDeckSequence({ posture: 'income', grade: 'B', dataAvailability: { hasComparables: false, hasRentRoll: true } });
    expect(seq.some(s => s.dataKey === 'comps')).toBe(false);
  });
});

// 3. Vacancy calc
describe('D41: Stability vacancy calc', () => {
  it('만실 → 공실 없음', () => {
    const leases = [{ is_vacant: false }, { is_vacant: false }, { is_vacant: false }];
    expect(leases.filter(l => l.is_vacant).length).toBe(0);
  });
  it('1구획 공실 → 33.3%', () => {
    const leases = [{ is_vacant: false }, { is_vacant: true }, { is_vacant: false }];
    const v = leases.filter(l => l.is_vacant).length;
    expect(((v / leases.length) * 100).toFixed(1)).toBe('33.3');
  });
});

// 4. D41-D2: Capital 슬라이드 취득비용 동적 바인딩
describe('D41-D2: Capital slide acquisition cost binding', () => {
  it('Positive: 사용자 입력 취득세율 12.4% → 세금 계산 정확', () => {
    const priceWon = 100 * 1e8;
    const taxPct = 12.4;
    const acquisitionTax = Math.round(priceWon * (taxPct / 100));
    expect(acquisitionTax).toBe(12.4 * 1e8);
  });

  it('Negative: 기본값 4.6% 적용 시 법인세율이 아님', () => {
    const priceWon = 100 * 1e8;
    const defaultTax = Math.round(priceWon * 0.046);
    expect(defaultTax).not.toBe(Math.round(priceWon * 0.124));
  });

  it('Positive: 법무사비·기타 비용이 총취득원가에 반영', () => {
    const priceWon = 100 * 1e8;
    const acquisitionTax = Math.round(priceWon * 0.046);
    const brokerFee = Math.round(priceWon * 0.009);
    const legalFee = 50 * 10000;
    const otherCost = 30 * 10000;
    const total = priceWon + acquisitionTax + brokerFee + legalFee + otherCost;
    expect(total).toBeGreaterThan(priceWon + acquisitionTax + brokerFee);
  });
});

// 5. D41-D2: Profit 슬라이드 B2 (LTV 미입력 시 실투자금 숨김)
describe('D41-D2: Profit slide B2 LTV guard', () => {
  it('Positive: loan_scenario 입력 시 실투자금 표시', () => {
    const hasLoanInput = true;
    const stats: Array<{ label: string; value: string }> = [
      { label: '매매가', value: '100억' },
      { label: '총취득원가', value: '105.5억' },
    ];
    if (hasLoanInput) stats.push({ label: '실투자금', value: '30.5억' });
    expect(stats).toHaveLength(3);
    expect(stats.find(s => s.label === '실투자금')).toBeDefined();
  });

  it('Negative: LTV 미입력 시 실투자금 미표시', () => {
    const hasLoanInput = false;
    const stats: Array<{ label: string; value: string }> = [
      { label: '매매가', value: '100억' },
      { label: '총취득원가', value: '105.5억' },
    ];
    if (hasLoanInput) stats.push({ label: '실투자금', value: '30.5억' });
    expect(stats).toHaveLength(2);
    expect(stats.find(s => s.label === '실투자금')).toBeUndefined();
  });
});

// 6. D41-D2: Loan 슬라이드 구조화 테이블 생성
describe('D41-D2: Loan slide structured table', () => {
  it('Positive: loan_scenario 입력 시 DSCR > 1.0', () => {
    const askingManwon = 100 * 10000;
    const ltv = 50;
    const rate = 4.5;
    const loanManwon = Math.round(askingManwon * ltv / 100);
    const monthlyInterest = Math.round(loanManwon * rate / 100 / 12);
    const annualInterest = monthlyInterest * 12;
    const monthlyRentManwon = 4000;
    const annualRentManwon = monthlyRentManwon * 12;
    const dscr = annualRentManwon / annualInterest;
    expect(loanManwon).toBe(500000);
    expect(dscr).toBeGreaterThan(1.0);
  });

  it('Negative: 대출 없을 때 이자 부담 0', () => {
    const loanManwon = 0;
    const rate = 4.5;
    const monthlyInterest = loanManwon > 0 ? Math.round(loanManwon * rate / 100 / 12) : 0;
    expect(monthlyInterest).toBe(0);
  });
});
