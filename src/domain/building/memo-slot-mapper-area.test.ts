import { describe, it, expect } from 'vitest';
import { extractSlotsFromMemo } from './memo-slot-mapper';

const slot = (memo: string, key: string) =>
  new Map(extractSlotsFromMemo(memo).slots.map(s => [s.key, s.value])).get(key);

describe('memo-slot-mapper: 대지면적이 연면적 슬롯으로 중복 매핑되지 않는다 (2026-10 RCA)', () => {
  const memo = '양평동4가 117 더레드빌딩 매각\n매각가 250억\n대지면적 518.7㎡ (157평)\n준공업지역, 2018년 신축\nB1~10F';

  it('대지면적만 있는 메모 → landAreaPyung 만 채우고 totalFloorAreaPyung 은 비움', () => {
    expect(slot(memo, 'landAreaPyung')).toBeGreaterThan(150);
    expect(slot(memo, 'totalFloorAreaPyung')).toBeUndefined();
  });

  it('토지면적·건축면적도 연면적으로 오인하지 않음', () => {
    expect(slot('토지면적 300평', 'totalFloorAreaPyung')).toBeUndefined();
    expect(slot('건축면적 120평', 'totalFloorAreaPyung')).toBeUndefined();
  });

  it('연면적/면적 표기는 여전히 매핑', () => {
    expect(slot('대지면적 100평 연면적 600평', 'totalFloorAreaPyung')).toBe(600);
    expect(slot('면적: 450평', 'totalFloorAreaPyung')).toBe(450);
  });
});
