import { describe, it, expect } from 'vitest';
import {
  resolvePhysicalSpecs,
  parseBrokerCount,
  BROKER_COUNT_MAX,
} from '@/domain/building/mobile-im/resolve-physical-specs';

describe('resolvePhysicalSpecs — 건축물대장 우선, 중개인 입력은 fallback', () => {
  it('대장 값이 있으면 중개인 값과 무관하게 대장 값이 이긴다', () => {
    const r = resolvePhysicalSpecs({
      register: { parkingCount: 26, elevatorCount: 2 },
      broker: { parkingCount: 99, elevatorCount: 9 },
    });
    expect(r).toEqual({
      parkingCount: 26, parkingSource: 'register',
      elevatorCount: 2, elevatorSource: 'register',
    });
  });

  it('대장 값이 null/undefined/0이면 중개인 값으로 보완한다', () => {
    expect(resolvePhysicalSpecs({
      register: { parkingCount: null, elevatorCount: 0 },
      broker: { parkingCount: 12, elevatorCount: 3 },
    })).toEqual({
      parkingCount: 12, parkingSource: 'broker',
      elevatorCount: 3, elevatorSource: 'broker',
    });
    expect(resolvePhysicalSpecs({
      register: undefined,
      broker: { parkingCount: 5 },
    })).toEqual({ parkingCount: 5, parkingSource: 'broker' });
  });

  it('필드별로 독립 해석한다 (주차=대장, 승강기=중개인)', () => {
    const r = resolvePhysicalSpecs({
      register: { parkingCount: 14 },
      broker: { parkingCount: 7, elevatorCount: 1 },
    });
    expect(r.parkingCount).toBe(14);
    expect(r.parkingSource).toBe('register');
    expect(r.elevatorCount).toBe(1);
    expect(r.elevatorSource).toBe('broker');
  });

  it('둘 다 없으면 undefined (지어내지 않음)', () => {
    expect(resolvePhysicalSpecs({})).toEqual({});
    expect(resolvePhysicalSpecs({ register: null, broker: null })).toEqual({});
    expect(resolvePhysicalSpecs({
      register: { parkingCount: 0, elevatorCount: null },
      broker: { parkingCount: '', elevatorCount: undefined },
    })).toEqual({});
  });

  it('유효하지 않은 중개인 입력은 무시한다 (음수/소수/NaN/초과/쓰레기)', () => {
    const bad = [-1, 1.5, NaN, Infinity, BROKER_COUNT_MAX + 1, 'abc', {}, [], 0];
    for (const v of bad) {
      expect(
        resolvePhysicalSpecs({ broker: { parkingCount: v, elevatorCount: v } }),
        `broker=${String(v)}`,
      ).toEqual({});
    }
  });

  it('유효하지 않은 대장 값은 중개인 값으로 넘어간다', () => {
    const r = resolvePhysicalSpecs({
      register: { parkingCount: -3, elevatorCount: NaN },
      broker: { parkingCount: 8, elevatorCount: 2 },
    });
    expect(r.parkingCount).toBe(8);
    expect(r.elevatorCount).toBe(2);
  });

  it('숫자 문자열 입력(JSON 경유)도 정수면 허용', () => {
    expect(resolvePhysicalSpecs({ broker: { parkingCount: '15' } }).parkingCount).toBe(15);
  });
});

describe('parseBrokerCount — 서버 측 검증', () => {
  it('빈 값은 ok + undefined', () => {
    for (const v of [undefined, null, '', '  ']) {
      expect(parseBrokerCount(v, '주차 대수')).toEqual({ ok: true, value: undefined });
    }
  });

  it('0 ~ 9999 정수는 통과', () => {
    expect(parseBrokerCount(0, 'x')).toEqual({ ok: true, value: 0 });
    expect(parseBrokerCount(9999, 'x')).toEqual({ ok: true, value: 9999 });
    expect(parseBrokerCount('42', 'x')).toEqual({ ok: true, value: 42 });
  });

  it('음수/소수/초과/NaN/비숫자는 거부', () => {
    for (const v of [-1, 1.5, 10000, NaN, Infinity, 'abc', true, {}, []]) {
      const r = parseBrokerCount(v, '승강기 대수');
      expect(r.ok, `value=${String(v)}`).toBe(false);
      if (!r.ok) expect(r.error).toContain('승강기 대수');
    }
  });
});
