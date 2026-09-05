import { describe, it, expect } from 'vitest';
import { parseMemoToObservations } from '@/domain/building/memo-intake/parser';

describe('Memo Intake & Sensitive Segment Extraction (CIM-0301 / PR-M3-01)', () => {
  it('should parse asking price, land area, and identify sensitive phone number and exact address', () => {
    const rawMemo = '영등포 당산역 인근 대지 100평 근생 120억 매각 의뢰. 당산동 123-4 위치. 담당 010-9876-5432';
    const observationSet = parseMemoToObservations(rawMemo);

    expect(observationSet.memoRawHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const priceObs = observationSet.observations.find((o) => o.candidateType === 'asking_price');
    expect(priceObs).toBeDefined();
    expect(priceObs?.candidateValue).toBe(12000000000);

    const landObs = observationSet.observations.find((o) => o.candidateType === 'land_area');
    expect(landObs).toBeDefined();
    expect(landObs?.candidateValue).toBeCloseTo(330.6, 1);

    // Verify sensitive segments
    const phoneSegment = observationSet.sensitiveSegments.find((s) => s.type === 'phone_number');
    expect(phoneSegment).toBeDefined();
    expect(phoneSegment?.rawText).toBe('010-9876-5432');
    expect(phoneSegment?.action).toBe('mask');

    const addressSegment = observationSet.sensitiveSegments.find((s) => s.type === 'exact_address');
    expect(addressSegment).toBeDefined();
    expect(addressSegment?.rawText).toBe('당산동 123-4');
    expect(addressSegment?.action).toBe('generalize');
  });
});
