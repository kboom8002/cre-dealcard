import { describe, it, expect } from 'vitest';
import { stripRenderOnlyExternal } from '@/domain/building/mobile-im/prompt-external-slice';
import { buildNarrativeUserPrompt } from '@/domain/building/mobile-im/narrative-prompt';

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

// ─── buildingRegister 신규 필드: 프롬프트 바이트 불변 증명 (2026-10-05 건축물대장 보완) ───
// 변경 전 구현(= locationPoi.candidateSpots 제거만)을 그대로 복제한 기준 함수
function legacyStrip(external: Record<string, any>) {
  const out: Record<string, any> = { ...external };
  const poi = out.locationPoi;
  if (poi && typeof poi === 'object' && 'candidateSpots' in poi) {
    const { candidateSpots: _omit, ...rest } = poi;
    out.locationPoi = rest;
  }
  return out;
}
const prompt = (o: unknown) => JSON.stringify(o, null, 2); // narrative-prompt.ts L277 / im-judge.ts L200 과 동일 직렬화

const BASE_BR = {
  totalArea: 2490.88, platArea: 518.7, useAprDay: '20180912', mainPurpose: '업무시설', structure: '철근콘크리트구조',
  floorsAbove: 10, floorsBelow: 1, bcRat: 58.4, vlRat: 398.8, buildingName: '선유테라피스타워',
};
const NEW_BR_KEYS = {
  archArea: 302.94, elevatorCount: 1, passengerElevatorCount: 1, emergencyElevatorCount: 0,
  parkingCount: 23, selfParkingCount: 1, mechanicalParkingCount: 22,
  mainPnu: '1156012800101170000', attachedLots: ['1156012800101250002', '1156012800101340000'],
};

describe('stripRenderOnlyExternal — buildingRegister 신규 키', () => {
  const poi = { nearestStation: { name: 'A' }, keySpots: [{ name: 'k' }], candidateSpots: [{ name: 'c' }] };

  it('신규 키가 없는 입력은 변경 전 구현과 프롬프트 바이트가 완전히 동일', () => {
    const ext = { buildingRegister: { ...BASE_BR }, locationPoi: poi, landUsePlan: { zoningDistrict: '일반상업지역' } };
    expect(prompt(stripRenderOnlyExternal(ext))).toBe(prompt(legacyStrip(ext)));
    // 기존 동작 보존: 객체 동일성까지 (신규 키 없으면 buildingRegister 를 복제조차 하지 않음)
    expect(stripRenderOnlyExternal(ext).buildingRegister).toBe(ext.buildingRegister);
  });

  it('신규 키가 있는 입력의 프롬프트 == 신규 키를 뺀 입력의 (변경 전) 프롬프트', () => {
    const withNew = { buildingRegister: { ...BASE_BR, ...NEW_BR_KEYS }, locationPoi: poi };
    const without = { buildingRegister: { ...BASE_BR }, locationPoi: poi };
    expect(prompt(stripRenderOnlyExternal(withNew))).toBe(prompt(legacyStrip(without)));
    // 키 순서가 섞여 있어도 남는 키의 상대 순서가 유지된다
    const shuffled = { buildingRegister: { archArea: 1, ...BASE_BR, mainPnu: 'x' }, other: 1 };
    expect(Object.keys(stripRenderOnlyExternal(shuffled).buildingRegister)).toEqual(Object.keys(BASE_BR));
  });

  it('원본(렌더 경로에서 쓰는 객체)의 buildingRegister 는 변경하지 않음', () => {
    const br = { ...BASE_BR, ...NEW_BR_KEYS };
    const ext = { buildingRegister: br };
    stripRenderOnlyExternal(ext);
    expect(ext.buildingRegister).toBe(br);
    expect(br.archArea).toBe(302.94);
    expect(br.mainPnu).toBe('1156012800101170000');
  });

  it('buildingRegister 가 null/배열/원시값이어도 그대로 통과', () => {
    expect(stripRenderOnlyExternal({ buildingRegister: null })).toEqual({ buildingRegister: null });
    expect(stripRenderOnlyExternal({ buildingRegister: [1] })).toEqual({ buildingRegister: [1] });
    expect(stripRenderOnlyExternal({ buildingRegister: 'x' })).toEqual({ buildingRegister: 'x' });
  });

  it('기존 대장 키(floorsAbove/bcRat/heatMethod 등)는 제거하지 않음', () => {
    const out = stripRenderOnlyExternal({ buildingRegister: { ...BASE_BR, heatMethod: '지역난방', archArea: 1 } });
    expect(out.buildingRegister).toEqual({ ...BASE_BR, heatMethod: '지역난방' });
  });

  it('실제 프롬프트 빌더(buildNarrativeUserPrompt): 신규 키 유무와 무관하게 프롬프트 문자열 동일 (전 섹션)', () => {
    const sections = ['property_overview', 'building_overview', 'location_access', 'land_detail', 'income_analysis', 'risk_check'] as const;
    for (const s of sections) {
      const a = buildNarrativeUserPrompt(s as any, { name: 'x' }, { buildingRegister: { ...BASE_BR }, locationPoi: poi } as any, {} as any);
      const b = buildNarrativeUserPrompt(s as any, { name: 'x' }, { buildingRegister: { ...BASE_BR, ...NEW_BR_KEYS }, locationPoi: poi } as any, {} as any);
      expect(b).toBe(a);
    }
  });
});
