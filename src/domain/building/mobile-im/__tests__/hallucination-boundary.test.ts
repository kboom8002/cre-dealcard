import { describe, test, expect } from 'vitest';
import { detectHallucination } from '@/domain/building/mobile-im/im-context-builder';
import { runRiskBoundaryCheck } from '@/domain/building/mobile-im/guardrails';

describe('Hallucination Guard Boundary Values', () => {
  // 기준 값 설정
  const anchorPriceKrw = 100 * 1e8; // 100억
  const anchorAreaSqm = 100; // 100㎡

  test('HG-01: price exactly 20x anchor → verify boundary behavior', () => {
    // 100억 * 20 = 2000억
    const text = '매매가는 2000 억 입니다.';
    const result = detectHallucination(text, anchorPriceKrw, anchorAreaSqm);
    // boundary: val > purchasePriceKrw * 20 is false for exact 20x.
    expect(result.anomaly).toBe(false);
  });

  test('HG-02: price 21x anchor → should detect hallucination', () => {
    // 100억 * 21 = 2100억
    const text = '매매가는 2100 억 입니다.';
    const result = detectHallucination(text, anchorPriceKrw, anchorAreaSqm);
    expect(result.anomaly).toBe(true);
    expect(result.reason).toContain('price_outlier');
  });

  test('HG-03: price 19x anchor → should pass clean', () => {
    // 100억 * 19 = 1900억
    const text = '매매가는 1900 억 입니다.';
    const result = detectHallucination(text, anchorPriceKrw, anchorAreaSqm);
    expect(result.anomaly).toBe(false);
  });

  test('HG-04: area exactly 10x anchor → verify boundary behavior', () => {
    // 100㎡ * 10 = 1000㎡
    const text = '면적은 1000 ㎡ 입니다.';
    const result = detectHallucination(text, anchorPriceKrw, anchorAreaSqm);
    // boundary: val > totalAreaSqm * 10 is false for exact 10x.
    expect(result.anomaly).toBe(false);
  });

  test('HG-05: area 11x anchor → should detect hallucination', () => {
    // 100㎡ * 11 = 1100㎡
    const text = '면적은 1100 ㎡ 입니다.';
    const result = detectHallucination(text, anchorPriceKrw, anchorAreaSqm);
    expect(result.anomaly).toBe(true);
    expect(result.reason).toContain('area_outlier');
  });

  test("HG-06: '원금 보장' expression → risk boundary block", () => {
    const text = '이 투자는 원금 보장이 확실합니다.';
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe('blocked'); 
  });

  test("HG-07: '무조건 상승' expression → risk boundary block", () => {
    const text = '앞으로 가격은 무조건 상승합니다.';
    const result = runRiskBoundaryCheck(text);
    expect(result.status).toBe('blocked');
  });
});
