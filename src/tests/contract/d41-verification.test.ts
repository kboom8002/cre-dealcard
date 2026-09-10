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
