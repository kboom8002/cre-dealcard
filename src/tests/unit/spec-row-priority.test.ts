import { describe, it, expect } from 'vitest';
import { prioritizeSpecRows, specRowPriority } from '@/domain/building/mobile-im/pptx/spec-row-priority';

type R = [string, string];
// p5 에서 실제 관측된 LLM 표 8행 + 렌더러가 뒤에 병합한 층수/주차
const llmThenEnriched: R[] = [
  ['소재지', 'x'], ['대지면적', 'x'], ['연면적', 'x'], ['건축면적', 'x'],
  ['용적률', 'x'], ['건물구조', 'x'], ['용도지역', 'x'], ['준공연도', 'x'],
  ['토지평당가', 'x'],
  ['층수', '지하1층 ~ 지상10층'], ['주차 / 승강기', '23대 / 1대'],
];

describe('spec-row-priority', () => {
  it('maxRows 이하이면 그대로', () => {
    expect(prioritizeSpecRows(llmThenEnriched.slice(0, 6), 8)).toEqual(llmThenEnriched.slice(0, 6));
  });

  it('초과 시 뒤에 붙은 층수/주차 승강기를 보존하고 비표준 행을 잘라낸다 (원래 순서 유지)', () => {
    const out = prioritizeSpecRows(llmThenEnriched, 8).map(r => r[0]);
    expect(out).toContain('주차 / 승강기');
    expect(out).toContain('층수');
    expect(out).not.toContain('토지평당가');
    expect(out).toHaveLength(8);
    // 원래 상대 순서 유지
    expect(out.indexOf('소재지')).toBeLessThan(out.indexOf('층수'));
    expect(out.indexOf('층수')).toBeLessThan(out.indexOf('주차 / 승강기'));
  });

  it('표준 제원이 3개 미만인 일반 표는 기존처럼 앞에서 자르기', () => {
    const rows: R[] = Array.from({ length: 12 }, (_, i) => [`항목${i}`, 'v'] as R);
    expect(prioritizeSpecRows(rows, 9)).toEqual(rows.slice(0, 9));
  });

  it('우선순위 키 분류', () => {
    expect(specRowPriority('주차 / 승강기')).toBe(7);
    expect(specRowPriority('건폐율 / 용적률')).toBe(5);
    expect(specRowPriority('토지평당가')).toBe(50);
  });
});
