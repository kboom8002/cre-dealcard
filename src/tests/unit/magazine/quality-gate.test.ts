/**
 * 매거진 품질 게이트(fail-closed) 단위 테스트 (B3a, T3-02 / M2-07·08)
 *  - 근거 숫자 0개 → 불합격 / 날조 숫자 → 불합격 / 정상 → 통과 / 모순 감지 / 빈 본문
 */
import { describe, expect, it } from 'vitest';
import {
  claimTolerance,
  detectContradictions,
  extractNumericClaims,
  runMagazineQualityGate,
} from '@/domain/magazine/quality-gate';

describe('extractNumericClaims', () => {
  it('숫자+단위를 추출하고 소수 자릿수를 기록한다', () => {
    const claims = extractNumericClaims('실거래 12.3억, 공실률 4.5%, 3건');
    const units = claims.map((c) => `${c.value}${c.unit}`);
    expect(units).toContain('12.3억');
    expect(units).toContain('4.5%');
    expect(units).toContain('3건');
    const eok = claims.find((c) => c.unit === '억');
    expect(eok?.decimals).toBe(1);
  });

  it('건수는 정확히 일치해야 한다(허용 오차 0), 소수는 ±0.5×10^-n', () => {
    const [count] = extractNumericClaims('3건');
    expect(claimTolerance(count)).toBeLessThan(1e-6);
    const [pct] = extractNumericClaims('4.5%');
    expect(claimTolerance(pct)).toBeCloseTo(0.05, 6);
  });
});

describe('runMagazineQualityGate (fail-closed)', () => {
  it('근거 숫자가 하나도 없는데 본문에 수치가 있으면 불합격 (NO_SOURCE_NUMBERS)', () => {
    const r = runMagazineQualityGate('매매가 165억원 거래 완료', {});
    expect(r.passed).toBe(false);
    expect(r.status).toBe('needs_review');
    expect(r.failureReasons).toContain('NO_SOURCE_NUMBERS');
  });

  it('근거에 없는 날조 숫자는 불합격 (UNMATCHED_CLAIMS)', () => {
    const r = runMagazineQualityGate('성수동 거래가는 165억원입니다', { facts: ['성수동 실거래 12.3억 (2026-10-01)'] });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain('UNMATCHED_CLAIMS');
    expect(r.mismatchedClaims).toBeGreaterThan(0);
  });

  it('근거와 일치하는 정상 본문은 통과 (draft)', () => {
    const r = runMagazineQualityGate('성수동 실거래는 12.3억이었고 공실률은 4.5%입니다', {
      facts: ['성수동 실거래 12.3억 (2026-10-01)', '임대 동향(2026Q2): 공실률 4.5%'],
    });
    expect(r.passed).toBe(true);
    expect(r.status).toBe('draft');
    expect(r.failureReasons).toEqual([]);
    expect(r.matchedClaims).toBe(r.totalClaims);
  });

  it('가장 가까운 숫자로 대충 맞추지 않는다 (12.3억 근거 → 12.9억 주장은 불합격)', () => {
    const r = runMagazineQualityGate('실거래는 12.9억이었습니다', { facts: ['실거래 12.3억'] });
    expect(r.passed).toBe(false);
  });

  it('빈 본문은 불합격 (EMPTY_BODY)', () => {
    const r = runMagazineQualityGate('   ', { facts: ['12.3억'] });
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain('EMPTY_BODY');
  });

  it('수치 주장이 없는 일반 본문은(빈 근거라도) 통과 — mece-v2 MAG-08', () => {
    const r = runMagazineQualityGate('시장 동향 분석', {});
    expect(r.passed).toBe(true);
  });

  it('억 ↔ 원, 평 ↔ ㎡ 단위 환산 근거를 인정한다', () => {
    const won = runMagazineQualityGate('거래가는 12.3억입니다', { transaction_price: 1_230_000_000 });
    expect(won.passed).toBe(true);
    const area = runMagazineQualityGate('연면적은 약 30평입니다', { building_area: 99.17 });
    expect(area.passed).toBe(true);
  });

  it('과열 표현 + 공실 정점은 모순으로 감지한다', () => {
    const r = runMagazineQualityGate('시장이 과열 국면이며 공실이 사상 최고치를 기록했습니다', { facts: ['4.5%'] }, {});
    expect(r.contradictions.length).toBeGreaterThan(0);
    expect(r.passed).toBe(false);
    expect(r.failureReasons).toContain('CONTRADICTION');
  });

  it('심리지수 70 이상인데 냉각 표현이면 모순', () => {
    const issues = detectContradictions('시장이 냉각되었습니다', { sentimentScore: 82 });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('심리지수 정보가 없으면 심리 모순은 검사하지 않는다', () => {
    expect(detectContradictions('시장이 냉각되었습니다', {})).toEqual([]);
  });
});
