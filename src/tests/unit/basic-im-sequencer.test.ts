import { describe, it, expect } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';

describe('Basic IM (credeal_basic) Sequencer Unit Test (Rule 47 & basic-im-guide.md)', () => {
  const basicInput = {
    posture: 'income' as const,
    preset: 'credeal_basic',
    grade: 'B' as const,
    dataAvailability: {
      hasRentRoll: true,
      hasStackingPlan: true,
      hasPhotos: true,
      hasCadastralMap: true,
    },
  };

  it('generates the standard 9-section Basic IM sequence for income posture', () => {
    const seq = buildDeckSequence(basicInput);
    const dataKeys = seq.map(s => s.dataKey);

    // 1. 표지
    expect(dataKeys[0]).toBe('cover');
    // 2. 요약
    expect(dataKeys[1]).toBe('summary');
    // 3. 물건 개요
    expect(dataKeys[2]).toBe('building');
    // 4. 입지 정보
    expect(dataKeys[3]).toBe('location');
    // 5. 토지 정보
    expect(dataKeys[4]).toBe('land');
    // 5b. 지적도 (hasCadastralMap=true일 때만)
    expect(dataKeys[5]).toBe('cadastralMap');
    // 6. 건물 사용 현황 (A24 렌트롤+스태킹 복합 단일 슬라이드)
    expect(dataKeys[6]).toBe('rentRoll');
    // 7. 투자수익률 분석 (A23)
    expect(dataKeys[7]).toBe('yieldFormula');
    // 8. 현장 사진 (A14)
    expect(dataKeys[8]).toBe('gallery');
    // 9. 문의 및 유의사항 (A10)
    expect(dataKeys[9]).toBe('closing');

    // Total: 10 slides (9 core + cadastral)
    expect(seq.length).toBe(10);

    // Negative: Pro-tier advanced slides must NOT be present
    expect(dataKeys).not.toContain('capital');
    expect(dataKeys).not.toContain('totalReturn');
    expect(dataKeys).not.toContain('dcf');
    expect(dataKeys).not.toContain('sensitivity');
    expect(dataKeys).not.toContain('loan');
    expect(dataKeys).not.toContain('tax');
    expect(dataKeys).not.toContain('thesis');
    expect(dataKeys).not.toContain('risk');
    expect(dataKeys).not.toContain('checklist');
    expect(dataKeys).not.toContain('process');
    expect(dataKeys).not.toContain('stability');
    expect(dataKeys).not.toContain('profit');
    // A24 통합이므로 별도 stackingPlan 슬라이드 부재
    expect(dataKeys).not.toContain('stackingPlan');
  });

  it('Basic IM rentRoll uses A24 composite archetype instead of A03', () => {
    const seq = buildDeckSequence(basicInput);
    const rentRollSlide = seq.find(s => s.dataKey === 'rentRoll');
    expect(rentRollSlide).toBeDefined();
    expect(rentRollSlide?.archetype).toBe('A24');
  });

  it('Basic IM produces 9-10 slides max (guide standard 9 sections + optional cadastral)', () => {
    // With cadastral
    const seqWithCadastral = buildDeckSequence(basicInput);
    expect(seqWithCadastral.length).toBe(10);

    // Without cadastral → 9 slides
    const seqNoCadastral = buildDeckSequence({
      ...basicInput,
      dataAvailability: { ...basicInput.dataAvailability, hasCadastralMap: false },
    });
    expect(seqNoCadastral.length).toBe(9);
  });

  it('preserves default Pro IM sequence when preset is not credeal_basic', () => {
    const proSeq = buildDeckSequence({
      posture: 'income',
      preset: 'commercial_visual_grid',
      grade: 'B',
      dataAvailability: {
        hasRentRoll: true,
        hasStackingPlan: true,
      },
    });

    const proKeys = proSeq.map(s => s.dataKey);
    // Pro sequence contains closing protected items
    expect(proKeys).toContain('thesis');
    expect(proKeys).toContain('risk');
    expect(proKeys).toContain('checklist');
    expect(proKeys).toContain('process');
    expect(proKeys).toContain('closing');
    // Pro uses A03 for rentRoll, not A24
    const proRentRoll = proSeq.find(s => s.dataKey === 'rentRoll');
    expect(proRentRoll?.archetype).toBe('A03');
  });
});
