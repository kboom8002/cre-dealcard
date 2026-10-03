import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  toFiniteNumber, fmtFixed, fmtGrouped, fmtPct, fmtEok, pairOrDash, MISSING,
} from '@/lib/format/safe-number';
import { checkOutputInvariants, errorsOf } from '@/domain/building/mobile-im/quality/output-invariants';

describe('H2 safe-number: 결측은 항상 -', () => {
  it.each([null, undefined, '', NaN, Infinity, -Infinity, 'abc'])('toFiniteNumber(%s) → null', (v) => {
    expect(toFiniteNumber(v)).toBeNull();
  });

  it('숫자형 문자열(쉼표 포함)은 허용', () => {
    expect(toFiniteNumber('1,234.5')).toBe(1234.5);
  });

  it.each([null, undefined, NaN, Infinity, ''])('fmtFixed/fmtPct/fmtGrouped(%s) → -', (v) => {
    expect(fmtFixed(v, 1, '%')).toBe(MISSING);
    expect(fmtPct(v)).toBe(MISSING);
    expect(fmtGrouped(v)).toBe(MISSING);
  });

  it('정상 값 포맷', () => {
    expect(fmtFixed(4.55, 1, '%')).toBe('4.5%'); // IEEE754 기준 toFixed 와 동일
    expect(fmtPct(2.524)).toBe('2.5%');
    expect(fmtGrouped(1234567.8, 1, '원')).toBe('1,234,567.8원');
    expect(fmtEok(25_000_000_000)).toBe('250.0억');
  });

  it('fmtEok: 0 이하/결측은 - (가격 절사 회귀 방지)', () => {
    expect(fmtEok(0)).toBe('-');
    expect(fmtEok(-1)).toBe('-');
    expect(fmtEok(undefined)).toBe('-');
    expect(fmtEok(11_500_000_000, 1)).toBe('115.0억'); // 소수 1자리 유지, 정수 절사 없음
  });

  it('pairOrDash: 부분/전체 결측', () => {
    expect(pairOrDash(23, 1, '대')).toBe('23대 / 1대');
    expect(pairOrDash(23, null, '대')).toBe('23대 / -');
    expect(pairOrDash(undefined, NaN, '%')).toBe('-');
    expect(pairOrDash('', '', '%')).toBe('-');
  });

  it('모든 포맷터 출력은 H1 불변식(수치 잔재) 위반 0건', () => {
    const outs = [
      fmtFixed(NaN, 1, '%'), fmtPct(undefined), fmtGrouped(null, 0, '원'), fmtEok(NaN),
      pairOrDash(null, null, '%'), pairOrDash(NaN, undefined, '대'),
    ];
    expect(errorsOf(checkOutputInvariants(outs))).toEqual([]);
  });
});

/**
 * 래칫(ratchet): 렌더 경로의 raw `toFixed(` 사용 수는 증가할 수 없다.
 * 감소시킬 때는 BASELINE 을 함께 낮춘다. (신규 코드는 safe-number 사용)
 */
const RENDER_DIRS = [
  'src/domain/building/mobile-im/pptx',
  'src/domain/building/mobile-im/section-renderers',
];
const BASELINE = 301; // 2026-10-03 실측치. 이 값 이하로만 허용 (줄일 때 함께 낮출 것)

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p, out); }
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe('H2 래칫: 렌더 경로 raw toFixed 증가 금지', () => {
  it(`raw toFixed( 총 사용 수 ≤ ${BASELINE}`, () => {
    let count = 0;
    for (const d of RENDER_DIRS) {
      for (const f of walk(join(process.cwd(), d))) {
        count += (readFileSync(f, 'utf8').match(/\.toFixed\(/g) ?? []).length;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[H2 ratchet] raw toFixed count = ${count} (baseline ${BASELINE})`);
    expect(count).toBeLessThanOrEqual(BASELINE);
  });
});
