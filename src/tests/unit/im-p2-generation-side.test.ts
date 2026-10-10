/**
 * P2 생성 경로(LLM 입력·뷰어 본문) 정합 — 면적 정본 교정 / 렌트롤 금액 SSOT / 공식 법정 한도만.
 */
import { describe, it, expect } from 'vitest';
import { rewriteRejectedAreas, filterRejectedAreas } from '@/domain/building/mobile-im/area-authority';
import { sumLeasedRentRoll } from '@/domain/building/mobile-im/lease-vacancy';
import { verifiedLegalLimits, stripUnverifiedLimits } from '@/domain/building/mobile-im/legal-limits';
import { sqmToPyeong } from '@/lib/utils/area-conversion';

describe('rewriteRejectedAreas — 뷰어 본문의 기각 면적 교정', () => {
  const total = { authoritativeSqm: 1441.15, rejectedSqm: [1141.15] };

  it('㎡ 와 평 표기 모두 정본으로 교체 (소수 자릿수 보존)', () => {
    const py = sqmToPyeong(1141.15).toFixed(1); // 345.2
    const r = rewriteRejectedAreas(`연면적 1,141.15㎡ (${py}평) 규모`, [total], []);
    expect(r.replaced).toBe(2);
    expect(r.text).toContain('1,441.15㎡');
    expect(r.text).toContain(`${sqmToPyeong(1441.15).toFixed(1)}평`);
    expect(r.text).not.toContain('1,141');
  });

  it('정본·protected 값은 건드리지 않는다', () => {
    const r = rewriteRejectedAreas('연면적 1,441.15㎡, 5층 임대면적 192.05㎡', [total], [192.05]);
    expect(r.replaced).toBe(0);
  });

  it('단위 없는 숫자는 건드리지 않는다', () => {
    const r = rewriteRejectedAreas('호수 1141 / 공시 1,141만원', [total], []);
    expect(r.replaced).toBe(0);
  });

  it('대지: 중개인 424.6 → 대장 420.6 (같은 값이 다른 슬롯 정본이면 보호)', () => {
    const land = { authoritativeSqm: 420.6, rejectedSqm: [424.6, 436.6] };
    const r = rewriteRejectedAreas('대지면적 424.6㎡, 인접 436.6㎡', [land], []);
    expect(r.text).toBe('대지면적 420.6㎡, 인접 420.6㎡');
    // 연면적 정본이 424.6 이라면 보호
    const r2 = rewriteRejectedAreas('424.6㎡', [land, { authoritativeSqm: 424.6, rejectedSqm: [] }], []);
    expect(r2.replaced).toBe(0);
  });

  it('정본과 0.5% 미만 차이 후보는 기각 값으로 보지 않음', () => {
    expect(filterRejectedAreas({ authoritativeSqm: 420.6, rejectedSqm: [420.7, 424.6] }, [])).toEqual([424.6]);
  });

  it('빈 입력·정본 없음은 원문 그대로', () => {
    expect(rewriteRejectedAreas('', [total], []).text).toBe('');
    expect(rewriteRejectedAreas('1,141.15㎡', [{ authoritativeSqm: 0, rejectedSqm: [1141.15] }], []).replaced).toBe(0);
  });
});

describe('sumLeasedRentRoll — 임대중 호실 합 (생성·요약 공통 SSOT)', () => {
  const rows = [
    { floor: '1F', tenant_name: 'A', rent_manwon: 250, deposit_manwon: 3500, lease_state: '임대중' },
    { floor: '2F', tenant_name: 'B', rent_manwon: 540, deposit_manwon: 5000 },
    { floor: '5F', tenant_type: '사무실', rent_manwon: 600, deposit_manwon: 6000, lease_state: '공실', is_vacant: true }, // 희망 임대료
    { floor: '6F', tenant_type: '자가사용', rent_manwon: 0, deposit_manwon: 0, lease_state: '자가사용' },
    { floor: 'B1', tenant_name: '기계실', rent_manwon: 0, deposit_manwon: 0 },
  ];
  it('공실·자가사용·비임대 행의 금액은 제외', () => {
    expect(sumLeasedRentRoll(rows)).toEqual({ rentManwon: 790, depositManwon: 8500, count: 2 });
  });
  it('빈 입력', () => {
    expect(sumLeasedRentRoll(undefined)).toEqual({ rentManwon: 0, depositManwon: 0, count: 0 });
  });
});

describe('법정 한도 — 용도지역명 추정치는 프롬프트·뷰어에서도 숨김', () => {
  it('inferred_zoning 은 빈 값, official 만 통과', () => {
    expect(verifiedLegalLimits({ buildingCoverageMax: 60, floorAreaRatioMax: 400, limitsSource: 'inferred_zoning' })).toEqual({});
    expect(verifiedLegalLimits({ buildingCoverageMax: 60, floorAreaRatioMax: 400 })).toEqual({});
    expect(verifiedLegalLimits({ buildingCoverageMax: 60, floorAreaRatioMax: 400, limitsSource: 'official' })).toEqual({ bcrMax: 60, farMax: 400 });
  });

  it('stripUnverifiedLimits: 추정 상한 제거, 다른 필드·원본 보존, official 은 유지', () => {
    const src = { landUsePlan: { zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 800, limitsSource: 'inferred_zoning' }, other: 1 };
    const out: any = stripUnverifiedLimits(src);
    expect(out.landUsePlan).toEqual({ zoningDistrict: '일반상업지역', limitsSource: 'inferred_zoning' });
    expect(out.other).toBe(1);
    expect(src.landUsePlan.floorAreaRatioMax).toBe(800); // 원본 불변
    const official = { landUsePlan: { buildingCoverageMax: 60, floorAreaRatioMax: 600, limitsSource: 'official' } };
    expect(stripUnverifiedLimits(official)).toBe(official);
    expect(stripUnverifiedLimits(null)).toBeNull();
    expect(stripUnverifiedLimits({ a: 1 })).toEqual({ a: 1 });
  });

});

import { detectVacancyContradiction } from '@/domain/building/mobile-im/pptx/extract-gate-context';

describe('G41 만실↔공실 모순 탐지 — 부정·완화 서술 오탐 방지', () => {
  it('공실 리스크 낮음/없음은 공실 강조가 아님 (공실률 0%)', () => {
    expect(detectVacancyContradiction(['병원·약국 우량 임차로 공실 리스크 낮음', '공실 0%'])).toBe(false);
    expect(detectVacancyContradiction(['공실 우려 없음'])).toBe(false);
  });
  it('[NEG] 공실 리스크 강조 + 공실률 0% 는 모순, 만실 서술 + 공실률 >5% 도 모순', () => {
    expect(detectVacancyContradiction(['공실 리스크 확대', '공실률 0%'])).toBe(true);
    expect(detectVacancyContradiction(['만실 운영', '공실률 12%'])).toBe(true);
  });
});
