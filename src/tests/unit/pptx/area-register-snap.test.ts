import { describe, it, expect } from 'vitest';
import { normalizeAreaRowsPrecision } from '@/domain/building/mobile-im/pptx/binder/area-precision';

describe('normalizeAreaRowsPrecision — 대장값 스냅 (표시 전용)', () => {
  const reg = { totArea: 1441.15, platArea: 506.8, archArea: 263.01 };

  it('평→㎡ 환산 1,441.157 은 대장 1,441.15 로 표기 (1% 이내)', () => {
    const dm: Record<string, any> = { building: { left: { rows: [['연면적', '1,441.157㎡ (435.9평)']] } } };
    normalizeAreaRowsPrecision(dm, reg);
    expect(dm.building.left.rows[0][1]).toBe('1,441.15㎡ (435.9평)');
  });

  it('대지면적 506.81 → 대장 506.8, 라벨별 기준값 구분', () => {
    const dm: Record<string, any> = { building: { left: { rows: [['대지면적', '506.81㎡ (153.3평)'], ['건축면적', '263.01㎡ (79.6평)']] } } };
    normalizeAreaRowsPrecision(dm, reg);
    expect(dm.building.left.rows[0][1]).toBe('506.8㎡ (153.3평)');
    expect(dm.building.left.rows[1][1]).toBe('263.01㎡ (79.6평)');
  });

  it('NEGATIVE: 1% 초과 괴리(중개인 1,141.15 vs 대장 1,441.15)는 중개인 값 유지 — 충돌을 숨기지 않는다', () => {
    const dm: Record<string, any> = { building: { left: { rows: [['연면적', '1,141.15㎡ (345.2평)']] } } };
    normalizeAreaRowsPrecision(dm, reg);
    expect(dm.building.left.rows[0][1]).toBe('1,141.15㎡ (345.2평)');
  });

  it('NEGATIVE: 대장값이 없으면 기존 정규화만 (3자리 이상 소수 → 1자리)', () => {
    const dm: Record<string, any> = { building: { left: { rows: [['연면적', '3,842.644㎡ (1162평)']] } } };
    normalizeAreaRowsPrecision(dm, {});
    expect(dm.building.left.rows[0][1]).toBe('3,842.6㎡ (1162.4평)');
  });

  it('NEGATIVE: 면적 외 라벨/패턴이 다른 값은 건드리지 않는다', () => {
    const dm: Record<string, any> = { building: { left: { rows: [['연면적(공용 제외)', '약 1,441㎡']] } } };
    normalizeAreaRowsPrecision(dm, reg);
    expect(dm.building.left.rows[0][1]).toBe('약 1,441㎡');
  });
});
