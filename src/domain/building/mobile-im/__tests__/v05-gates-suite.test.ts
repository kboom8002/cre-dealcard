/**
 * @file v05-gates-suite.test.ts
 * @description B-5: v0.5 게이트 스위트 — 신규/확장 게이트 테스트 17종
 */
import { describe, it, expect } from 'vitest';
import { checkX05 } from '@/domain/ontology/rules/parcel';
import { tierOf, type ProvenanceTier, type SourceTier } from '@/domain/ontology/provenance';
import { resolveP, resolveL, gradeMatrix } from '@/domain/asset/grade-engine';

// ═══ X05: 다필지 합산 면적 교차검증 ═══
describe('X05: 다필지 면적 교차검증', () => {
  it('X05-01: 단일 필지 완전 일치 → passed', () => {
    const result = checkX05([{ ledgerAreaM2: 500, shareRatio: 1 }], 500);
    expect(result.passed).toBe(true);
    expect(result.deviation).toBe(0);
  });

  it('X05-02: 다필지 합산 ±0.3% 이내 → passed', () => {
    const result = checkX05(
      [{ ledgerAreaM2: 300, shareRatio: 1 }, { ledgerAreaM2: 200, shareRatio: 1 }],
      501.5, // 0.3% deviation
    );
    expect(result.passed).toBe(true);
  });

  it('X05-03: 편차 >0.5% → failed', () => {
    const result = checkX05(
      [{ ledgerAreaM2: 300, shareRatio: 1 }, { ledgerAreaM2: 200, shareRatio: 1 }],
      520, // 3.8% deviation
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain('초과');
  });

  it('X05-04: 빈 필지 배열 → 검증 생략', () => {
    const result = checkX05([], 100);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('검증 생략');
  });

  it('X05-05: 지분율 0.5 반영 정확도', () => {
    const result = checkX05([{ ledgerAreaM2: 1000, shareRatio: 0.5 }], 500);
    expect(result.passed).toBe(true);
    expect(result.sumParcelsM2).toBe(500);
  });
});

// ═══ SourceTier: 6단 매핑 ═══
describe('SourceTier: ProvenanceTier → SourceTier 매핑', () => {
  const testCases: Array<[ProvenanceTier, SourceTier]> = [
    ['registry', 'S1'],
    ['public_api', 'S2a'],
    ['broker_aug', 'S2b'],
    ['expert', 'S3'],
    ['ledger', 'S4'],
    ['seller', 'S4'],
    ['broker', 'S4'],
    ['derived', 'S4'],
    ['assumed', 'S5'],
    ['public', 'S1'], // 레거시 호환
  ];

  for (const [input, expected] of testCases) {
    it(`tierOf('${input}') → '${expected}'`, () => {
      expect(tierOf(input)).toBe(expected);
    });
  }
});

// ═══ L×P 등급 엔진 ═══
describe('L×P 등급 매트릭스', () => {
  it('resolveP: 5/5 채움 → P3', () => {
    const filled = { land_parcel: true, building_basic: true, zoning: true, road_access: true, title_encumbrance: true };
    expect(resolveP(filled)).toBe('P3');
  });

  it('resolveP: 0/5 채움 → P0', () => {
    expect(resolveP({})).toBe('P0');
  });

  it('resolveL income: 2/2 채움 → R3', () => {
    const filled = { lease_roll: true, financial_input: true };
    expect(resolveL(filled, 'income')).toBe('R3');
  });

  it('resolveL income: 0/2 → R0', () => {
    expect(resolveL({}, 'income')).toBe('R0');
  });

  it('gradeMatrix: R3 × P3 → A', () => {
    expect(gradeMatrix('R3', 'P3')).toBe('A');
  });

  it('gradeMatrix: R0 × P3 → D', () => {
    expect(gradeMatrix('R0', 'P3')).toBe('D');
  });
});
