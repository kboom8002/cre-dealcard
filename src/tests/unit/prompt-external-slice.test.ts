import { describe, it, expect } from 'vitest';
import { stripRenderOnlyExternal } from '@/domain/building/mobile-im/prompt-external-slice';

describe('stripRenderOnlyExternal', () => {
  it('locationPoi.candidateSpots 를 제거하고 나머지는 보존', () => {
    const src = { locationPoi: { nearestStation: { name: 'A' }, keySpots: [{ name: 'k' }], candidateSpots: [{ name: 'c' }] }, other: 1 };
    const out = stripRenderOnlyExternal(src);
    expect(out.locationPoi).toEqual({ nearestStation: { name: 'A' }, keySpots: [{ name: 'k' }] });
    expect(out.other).toBe(1);
  });

  it('원본(렌더 경로에서 쓰는 객체)은 변경하지 않음', () => {
    const src = { locationPoi: { candidateSpots: [{ name: 'c' }] } };
    stripRenderOnlyExternal(src);
    expect(src.locationPoi.candidateSpots).toHaveLength(1);
  });

  it('locationPoi 없으면 그대로', () => {
    expect(stripRenderOnlyExternal({ a: 1 })).toEqual({ a: 1 });
  });
});
