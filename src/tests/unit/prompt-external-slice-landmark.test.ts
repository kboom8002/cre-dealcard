/**
 * landmarkPool 은 렌더 전용 — 프롬프트 직렬화 바이트에 영향을 주지 않는다.
 *  - externalData 에 풀이 실려 있어도 strip 결과는 풀이 없을 때와 동일
 *  - 풀이 없는 입력은 기존과 바이트 동일 (strip 이 아무 키도 추가/변경하지 않음)
 */
import { describe, expect, it } from 'vitest';
import { stripRenderOnlyExternal } from '@/domain/building/mobile-im/prompt-external-slice';

const baseExternal = () => ({
  resolvedAddress: { address: '서울 영등포구 양평동', pnu: '1156011000' },
  locationPoi: {
    keySpots: [{ name: '선유도역', distanceM: 133, category: 'subway' }],
    nearestStation: { name: '선유도역', distanceM: 133 },
    poiCounts: { subway: 2 },
    candidateSpots: [{ name: 'x', distanceM: 1 }],
  },
});

describe('prompt-external-slice × landmarkPool', () => {
  it('top-level / locationPoi 하위 landmarkPool 은 제거되어 프롬프트 바이트가 풀 유무와 무관', () => {
    const plain = JSON.stringify(stripRenderOnlyExternal(baseExternal()));
    const withTop = JSON.stringify(stripRenderOnlyExternal({ ...baseExternal(), landmarkPool: { candidates: [{ name: '롯데홈쇼핑' }] } }));
    const e = baseExternal();
    const withNested = JSON.stringify(stripRenderOnlyExternal({ ...e, locationPoi: { ...e.locationPoi, landmarkPool: { candidates: [1, 2, 3] } } }));
    expect(withTop).toBe(plain);
    expect(withNested).toBe(plain);
  });

  it('풀이 없는 입력은 기존 동작 그대로 (keySpots/nearestStation/poiCounts 유지, candidateSpots 만 제거)', () => {
    const out: any = stripRenderOnlyExternal(baseExternal());
    expect(Object.keys(out.locationPoi)).toEqual(['keySpots', 'nearestStation', 'poiCounts']);
    expect(out.locationPoi.keySpots[0].name).toBe('선유도역');
    expect('landmarkPool' in out).toBe(false);
  });
});
