/**
 * Round3: 면적 표기 정밀도(formatSqm / normalizeAreaRowsPrecision) + 개요 층수·준공연도 메모 폴백(parseBuildingSpecMemoFacts → resolveOverviewSpecs)
 * 값 창작 금지(Rule 34): 대장/SSoT 값이 있으면 메모는 쓰지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { formatSqm } from '@/lib/utils/area-conversion';
import { normalizeAreaValuePrecision, normalizeAreaRowsPrecision } from '@/domain/building/mobile-im/pptx/binder/area-precision';
import { parseBuildingSpecMemoFacts, BROKER_STATED_TAG } from '@/domain/building/mobile-im/pptx/binder/broker-memo-facts';
import { resolveOverviewSpecs, buildOverviewSpecRows } from '@/domain/building/mobile-im/pptx/spec-resolver';
import { renderLandDetail } from '@/domain/building/mobile-im/section-renderers/land-detail-renderer';

describe('formatSqm — 소수 1자리 통일', () => {
  it('환산 잔여 소수 3자리 → 1자리', () => {
    expect(formatSqm(3842.644)).toBe('3,842.6');
    expect(formatSqm(486.281)).toBe('486.3');
  });
  it('원천 소수 2자리 이하(대장값)는 그대로 — 정밀도 훼손 금지', () => {
    expect(formatSqm(1441.15)).toBe('1,441.15');
    expect(formatSqm(506.8)).toBe('506.8');
    expect(normalizeAreaValuePrecision('1,441.15㎡ (435.9평)')).toBe('1,441.15㎡ (435.9평)');
  });
  it("정수는 '.0' 없이, 비정상 값은 '-'", () => {
    expect(formatSqm(596)).toBe('596');
    expect(formatSqm(NaN)).toBe('-');
  });
});

describe('normalizeAreaValuePrecision / Rows', () => {
  it('㎡ (평) 쌍은 평도 소수 1자리로 재계산', () => {
    expect(normalizeAreaValuePrecision('3,842.644㎡ (1162평)')).toBe('3,842.6㎡ (1162.4평)');
    expect(normalizeAreaValuePrecision('486.281㎡ (147.1평)')).toBe('486.3㎡ (147.1평)');
  });
  it('이미 1자리면 그대로, ㎡ 없는 값은 건드리지 않는다', () => {
    expect(normalizeAreaValuePrecision('506.8㎡ (153.3평)')).toBe('506.8㎡ (153.3평)');
    expect(normalizeAreaValuePrecision('18대 / 2대')).toBe('18대 / 2대');
  });
  it('면적 라벨 행만 dataMap(building/land) 에서 제자리 정규화', () => {
    const dm: Record<string, any> = {
      building: { left: { rows: [['연면적', '3,842.644㎡ (1162평)'], ['주차 / 승강기', '18대 / 2대']] } },
      land: { right: { rows: [['대지면적', '486.281㎡ (147.1평)'], ['공시지가', '29,970,000원/㎡']] } },
    };
    normalizeAreaRowsPrecision(dm);
    expect(dm.building.left.rows[0][1]).toBe('3,842.6㎡ (1162.4평)');
    expect(dm.building.left.rows[1][1]).toBe('18대 / 2대');
    expect(dm.land.right.rows[0][1]).toBe('486.3㎡ (147.1평)');
    expect(dm.land.right.rows[1][1]).toBe('29,970,000원/㎡');
  });
  it('뷰어 land_detail 렌더러도 소수 1자리', () => {
    const out = renderLandDetail({ parcels: [{ pnu: 'x', jimok: '대', areaM2: 486.281, ownershipRatio: 1 }], zoning: '일반상업지역' });
    expect(out.markdown).toContain('486.3㎡ (147.1평)');
    expect(out.markdown).not.toContain('486.281');
  });
});

describe('parseBuildingSpecMemoFacts', () => {
  it('호텔 메모: 지하 2층 ~ 지상 12층, 준공 2016년', () => {
    expect(parseBuildingSpecMemoFacts('서울 | 지하 2층 ~ 지상 12층, 준공 2016년, 주차 18대'))
      .toEqual({ floorsBelow: 2, floorsAbove: 12, completionYear: 2016 });
  });
  it('B1~5F / 2002년 준공', () => {
    expect(parseBuildingSpecMemoFacts('준공업지역, 2002년 준공, B1~5F')).toEqual({ floorsBelow: 1, floorsAbove: 5, completionYear: 2002 });
  });
  it('신축·계획 맥락 층수/연도는 현황으로 보지 않는다', () => {
    expect(parseBuildingSpecMemoFacts('신축 가능 연면적 약 2,500평, 지상 15층 계획')).toEqual({});
    expect(parseBuildingSpecMemoFacts('신축 후 임대 예상 스태킹 플랜 포함')).toEqual({});
  });
  it('없으면 빈 객체 (날조 금지)', () => {
    expect(parseBuildingSpecMemoFacts('')).toEqual({});
    expect(parseBuildingSpecMemoFacts(undefined)).toEqual({});
  });
});

describe('resolveOverviewSpecs — 메모는 최후 폴백', () => {
  const memo = { floorsAbove: 12, floorsBelow: 2, completionYear: 2016 };

  it('대장·SSoT 가 모두 비면 메모 값 + 출처 라벨', () => {
    const sp = resolveOverviewSpecs({}, {}, {}, undefined, { memo, nowYear: 2026 });
    expect(sp.floorsAbove).toBe(12);
    expect(sp.floorsBelow).toBe(2);
    expect(sp.useAprYear).toBe(2016);
    const rows = Object.fromEntries(buildOverviewSpecRows(sp));
    expect(rows['층수']).toBe(`지하 2층 / 지상 12층 · ${BROKER_STATED_TAG}`);
    expect(rows['사용승인일']).toContain('2016');
    expect(rows['사용승인일']).toContain(BROKER_STATED_TAG);
  });

  it('대장 값이 있으면 메모를 쓰지 않는다 (라벨도 없음)', () => {
    const enr = { buildingRegister: { grndFlrCnt: 6, ugrndFlrCnt: 1, useAprDay: '19910131' } };
    const sp = resolveOverviewSpecs(enr, {}, {}, undefined, { memo, nowYear: 2026 });
    expect(sp.floorsAbove).toBe(6);
    expect(sp.useAprYear).toBe(1991);
    expect(sp.memoSourced).toBeUndefined();
    const rows = Object.fromEntries(buildOverviewSpecRows(sp));
    expect(rows['층수']).not.toContain(BROKER_STATED_TAG);
  });

  it('memo 미전달 시 기존 동작 (행 생략)', () => {
    const sp = resolveOverviewSpecs({}, {}, {}, undefined, { nowYear: 2026 });
    expect(buildOverviewSpecRows(sp)).toEqual([]);
  });
});
