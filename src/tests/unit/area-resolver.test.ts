import { describe, it, expect } from 'vitest';
import {
  resolveTotalAreaWithSource,
  resolveLandAreaWithSource,
  readSsotLayerAreas,
  readVworldLandAreaSqm,
  isPlannedFloorAreaInMemo,
  invalidateForeignRegisterFacts,
  isAreaConflict,
  positiveOrNull,
} from '@/domain/building/mobile-im/resolve-total-area';

const PY = 3.305785;

describe('연면적 해석기 — 우선순위 / 출처', () => {
  it('명시 ㎡ > 명시 평 > 메모 SSoT > 대장', () => {
    expect(resolveTotalAreaWithSource({ explicitSqm: 1000, memoSqm: 2000, registerSqm: 1500 })).toMatchObject({ value: 1000, source: 'explicit_input' });
    const py = resolveTotalAreaWithSource({ explicitPyeong: 100, memoSqm: 2000 });
    expect(py.value).toBeCloseTo(100 * PY, 3);
    expect(py.source).toBe('explicit_input');
    expect(resolveTotalAreaWithSource({ memoSqm: 2000, registerSqm: 1500 })).toMatchObject({ value: 2000, source: 'broker_memo' });
    expect(resolveTotalAreaWithSource({ registerSqm: 1687.51 })).toMatchObject({ value: 1687.51, source: 'public_register' });
  });

  it('후보 전무(0/NaN/음수) → value 0, source none (렌트롤 합 등으로 대체하지 않음)', () => {
    expect(resolveTotalAreaWithSource({})).toMatchObject({ value: 0, source: 'none' });
    expect(resolveTotalAreaWithSource({ explicitSqm: NaN, memoSqm: -5, registerSqm: 0 })).toMatchObject({ value: 0, source: 'none' });
  });
});

describe('2배 괴리 가드 — 중개인 vs 대장은 별도 슬롯', () => {
  it('호텔: 메모 1162.4평(=3842.6㎡) vs 대장 231.4㎡ → 충돌, 중개인 값 채택', () => {
    const areas = readSsotLayerAreas({ total_floor_area_pyung: 1162.4, land_area_pyung: 147.1 });
    expect(areas.totalSqm).toBeCloseTo(3842.6, 0);
    expect(areas.landSqm).toBeCloseTo(486.2, 0);
    const r = resolveTotalAreaWithSource({ memoSqm: areas.totalSqm, registerSqm: 231.4 });
    expect(r.registerConflict).toBe(true);
    expect(r.value).toBeCloseTo(3842.6, 0);
    expect(r.source).toBe('broker_memo');
    expect(r.registerSqm).toBe(231.4);
  });

  it('양방향(≥2배/≤1/2배) 모두 충돌, 경계 미만은 충돌 아님', () => {
    expect(isAreaConflict(1000, 2000)).toBe(true);
    expect(isAreaConflict(1000, 500)).toBe(true);
    expect(isAreaConflict(1000, 1999)).toBe(false);
    expect(isAreaConflict(1000, 501)).toBe(false);
    expect(isAreaConflict(0, 5000)).toBe(false);
    expect(isAreaConflict(1000, 0)).toBe(false);
  });

  it('대장만 있고 중개인 값 없음 → 충돌 판정 없음 (대장 vs 대장 비교 금지)', () => {
    const r = resolveTotalAreaWithSource({ registerSqm: 231.4 });
    expect(r.registerConflict).toBe(false);
    expect(r.brokerSqm).toBe(0);
  });

  it('대장의 다른 건물 사실(준공·용도·층수·건물명·건폐/용적률) 무효화', () => {
    const reg: Record<string, any> = {
      totalArea: 231.4, platArea: 0, useAprDay: '19710101', mainPurpose: '제2종근린생활시설',
      floorsAbove: 3, floorsBelow: 0, bcRat: 60, vlRat: 200, buildingName: ' ', structure: '조적조',
    };
    const removed = invalidateForeignRegisterFacts(reg);
    expect(removed).toEqual(expect.arrayContaining(['useAprDay', 'mainPurpose', 'floorsAbove', 'buildingName', 'bcRat', 'vlRat']));
    expect(reg.useAprDay).toBeUndefined();
    expect(reg.mainPurpose).toBeUndefined();
    expect(reg.floorsAbove).toBeUndefined();
    expect(reg.buildingName).toBeUndefined();
    expect(reg.totalArea).toBe(231.4); // 면적은 호출자가 교정
  });
});

describe('SSoT 키 불일치 흡수 (평 flat + ㎡ physical)', () => {
  it('layers.physical.total_area_sqm(㎡) 도 읽는다', () => {
    const a = readSsotLayerAreas({ physical: { total_area_sqm: 1234.5, land_area_sqm: 400 } });
    expect(a).toMatchObject({ totalSqm: 1234.5, landSqm: 400, totalFrom: 'physical_sqm', landFrom: 'physical_sqm' });
  });

  it('physical.plat_area_sqm / site_area_sqm 별칭', () => {
    expect(readSsotLayerAreas({ physical: { plat_area_sqm: 300 } }).landSqm).toBe(300);
    expect(readSsotLayerAreas({ physical: { site_area_sqm: 310 } }).landSqm).toBe(310);
  });

  it('평 flat 키 → ㎡ 변환 (pyeongToSqm 과 동일 계수)', () => {
    const a = readSsotLayerAreas({ total_floor_area_pyung: 100, land_area_pyung: 50 });
    expect(a.totalSqm).toBeCloseTo(100 * PY, 3);
    expect(a.landSqm).toBeCloseTo(50 * PY, 3);
    expect(a.totalFrom).toBe('pyung');
    expect(a.landFrom).toBe('pyung');
  });

  it('0/문자열/음수/layers 없음 → 0', () => {
    expect(readSsotLayerAreas({ total_floor_area_pyung: 0, land_area_pyung: -3 })).toMatchObject({ totalSqm: 0, landSqm: 0, totalFrom: 'none' });
    expect(readSsotLayerAreas(null)).toMatchObject({ totalSqm: 0, landSqm: 0, plannedGfaSqm: 0 });
    expect(readSsotLayerAreas(undefined).totalSqm).toBe(0);
  });
});

describe('개발 포스처 — 신축/계획/가능 연면적은 기존 연면적이 아니다', () => {
  const memo = '매각가 89억\n대지면적 197평\n신축 가능 연면적 2,500평 (용적률 완화 시)';

  it('라벨 판정: "신축 가능 연면적 2,500평" = 계획', () => {
    expect(isPlannedFloorAreaInMemo(memo, 2500)).toBe(true);
    expect(isPlannedFloorAreaInMemo('연면적: 계획 1,000평', 1000)).toBe(true);
    expect(isPlannedFloorAreaInMemo('연면적 1,000평 (신축 가능)', 1000)).toBe(true);
  });

  it('현황 연면적 / 값 불일치는 계획이 아님', () => {
    expect(isPlannedFloorAreaInMemo('연면적 1,162.4평\n대지면적 147.1평', 1162.4)).toBe(false);
    expect(isPlannedFloorAreaInMemo(memo, 1000)).toBe(false);
    // 준공 건물 설명의 단순 "신축" 은 개발 포스처가 아니면 계획으로 보지 않음
    expect(isPlannedFloorAreaInMemo('2023년 신축 연면적 300평', 300)).toBe(false);
    expect(isPlannedFloorAreaInMemo('2023년 신축 연면적 300평', 300, { development: true })).toBe(true);
  });

  it('sutaek: total_floor_area_pyung=2500 + 메모 라벨 → totalSqm 0, plannedGfaSqm 2500평', () => {
    const a = readSsotLayerAreas({ total_floor_area_pyung: 2500 }, { memoText: memo });
    expect(a.totalSqm).toBe(0);
    expect(a.totalFrom).toBe('none');
    expect(a.plannedGfaSqm).toBeCloseTo(2500 * PY, 2);
  });

  it('planned_floor_area_pyung 신규 키도 계획 GFA 로 읽는다', () => {
    const a = readSsotLayerAreas({ planned_floor_area_pyung: 2500 });
    expect(a.totalSqm).toBe(0);
    expect(a.plannedGfaSqm).toBeCloseTo(2500 * PY, 2);
  });

  it('메모 원문 없이 값만 있으면 기존 연면적으로 취급 (기존 동작 유지)', () => {
    expect(readSsotLayerAreas({ total_floor_area_pyung: 2500 }).totalSqm).toBeCloseTo(2500 * PY, 2);
  });
});

describe('대지면적 해석기 — 우선순위', () => {
  it('명시 > 필지 합 > 메모 > 대장(>0) > V-World > none', () => {
    const all = { explicitSqm: 100, parcelSumSqm: 200, memoSqm: 300, registerPlatSqm: 400, vworldSqm: 500 };
    expect(resolveLandAreaWithSource(all)).toEqual({ value: 100, source: 'explicit_input' });
    expect(resolveLandAreaWithSource({ ...all, explicitSqm: 0 })).toEqual({ value: 200, source: 'parcel_sum' });
    expect(resolveLandAreaWithSource({ ...all, explicitSqm: 0, parcelSumSqm: null })).toEqual({ value: 300, source: 'broker_memo' });
    expect(resolveLandAreaWithSource({ registerPlatSqm: 400, vworldSqm: 500 })).toEqual({ value: 400, source: 'public_register' });
    expect(resolveLandAreaWithSource({ registerPlatSqm: 0, vworldSqm: 500 })).toEqual({ value: 500, source: 'vworld' });
    expect(resolveLandAreaWithSource({ registerPlatSqm: 0 })).toEqual({ value: 0, source: 'none' });
  });

  it('명시 평 입력은 ㎡ 로 환산', () => {
    const r = resolveLandAreaWithSource({ explicitPyeong: 197 });
    expect(r.value).toBeCloseTo(197 * PY, 3);
    expect(r.source).toBe('explicit_input');
  });

  it('수택(dev): 대장 없음 + 메모/ssot 651.2 → 651.2', () => {
    expect(resolveLandAreaWithSource({ registerPlatSqm: 0, memoSqm: 651.2 })).toEqual({ value: 651.2, source: 'broker_memo' });
  });

  it('hotel: 대장 platArea 0 + 메모 147.1평 → 486.2㎡ (0 이 아님)', () => {
    const memo = readSsotLayerAreas({ land_area_pyung: 147.1 }).landSqm;
    const r = resolveLandAreaWithSource({ registerPlatSqm: 0, memoSqm: memo });
    expect(r.value).toBeCloseTo(486.2, 0);
    expect(r.source).toBe('broker_memo');
  });

  it('V-World 면적 필드 변이 흡수', () => {
    expect(readVworldLandAreaSqm({ landPrice: { landArea: 123 } })).toBe(123);
    expect(readVworldLandAreaSqm({ landUsePlan: { lndpclAr: '88.5' } })).toBe(88.5);
    expect(readVworldLandAreaSqm({ landPrice: { landArea: 0 } })).toBe(0);
    expect(readVworldLandAreaSqm(null)).toBe(0);
  });
});

describe('positiveOrNull (heroCard 0 → null)', () => {
  it('0/NaN/Infinity-NaN/음수/문자열 → null, 양수만 통과', () => {
    expect(positiveOrNull(0)).toBeNull();
    expect(positiveOrNull(NaN)).toBeNull();
    expect(positiveOrNull(-1)).toBeNull();
    expect(positiveOrNull('abc')).toBeNull();
    expect(positiveOrNull(undefined)).toBeNull();
    expect(positiveOrNull(null)).toBeNull();
    expect(positiveOrNull(Infinity)).toBeNull();
    expect(positiveOrNull(231.4)).toBe(231.4);
  });
});
