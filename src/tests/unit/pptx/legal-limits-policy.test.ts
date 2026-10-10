/**
 * 법정 건폐율·용적률 "공식 조회값만 표시" 정책 (2026-10-10 결정) 회귀 테스트.
 * 현재 V-World 경로의 상한은 용도지역명 추정치(limitsSource 미설정) → IM 어디에도 "법정 …" 수치가 나오면 안 된다.
 */
import { describe, it, expect } from 'vitest';
import { verifiedLegalLimits, verifiedLegalLimitsFromSsot } from '@/domain/building/mobile-im/pptx/binder/legal-limits';
import { resolveOverviewSpecs, buildOverviewSpecRows } from '@/domain/building/mobile-im/pptx/spec-resolver';

const inferredLup = { zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 800 };

describe('legal-limits policy', () => {
  it('추정치(limitsSource 없음/inferred)는 숨김', () => {
    expect(verifiedLegalLimits(inferredLup)).toEqual({});
    expect(verifiedLegalLimits({ ...inferredLup, limitsSource: 'inferred_zoning' })).toEqual({});
    expect(verifiedLegalLimits(null)).toEqual({});
  });

  it("공식 조회값('official')만 반환", () => {
    expect(verifiedLegalLimits({ ...inferredLup, floorAreaRatioMax: 600, limitsSource: 'official' })).toEqual({ bcrMax: 60, farMax: 600 });
  });

  it('ssot max_* 는 공식 출처 표식이 있을 때만', () => {
    expect(verifiedLegalLimitsFromSsot({ max_bcr_pct: 60, max_far_pct: 800 })).toEqual({});
    expect(verifiedLegalLimitsFromSsot({ max_bcr_pct: 60, max_far_pct: 600, legal_limits_source: 'official' })).toEqual({ bcrMax: 60, farMax: 600 });
  });

  it('개요 행: 추정 상한이면 "(법정 …)" 미표기, 현행값은 유지', () => {
    const specs = resolveOverviewSpecs(
      { landUsePlan: inferredLup, buildingRegister: { bcRat: 65.35, vlRat: 325.39 } },
      { max_bcr_pct: 60, max_far_pct: 800 }, {},
    );
    const row = buildOverviewSpecRows(specs).find(([k]) => k.startsWith('건폐율'));
    expect(row?.[1]).toBe('65.35% / 325.39%');
    expect(buildOverviewSpecRows(specs).some(([, v]) => v.includes('법정'))).toBe(false);
  });

  it('개요 행: 현행값이 없고 상한도 추정이면 행 자체 생략', () => {
    const specs = resolveOverviewSpecs({ landUsePlan: inferredLup }, {}, {});
    expect(buildOverviewSpecRows(specs).some(([k]) => k.includes('건폐율') || k.includes('용적률'))).toBe(false);
  });
});
