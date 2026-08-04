/**
 * tenancy-dispatch.ts — 임대차 규칙군 디스패처
 * Spec: ONTOLOGY_V0.4_SPEC.md §2
 *
 * buildingUse의 법령 분기에 따라 상가(T-C) 또는 주택(T-R) 규칙군을 선택합니다.
 * 호실별로 다른 법령이 적용될 수 있습니다 (상가주택 등 혼합 물건).
 *
 * 판정 우선순위:
 * 1. 호실의 실제 사용 용도 (중개인 확인)
 * 2. 건축물대장 층별 용도
 * 3. 건물 주용도
 */

import type { BuildingUse, LeaseUnitLegalBasis } from '../enums';
import type { Region, LeaseUnitInput, TenancyResult } from './tenancy';
import { evaluateTenancy } from './tenancy';
import type { ResidentialLeaseInput, ResidentialTenancyResult } from './tenancy-residential';
import { evaluateResidentialTenancy } from './tenancy-residential';

// ── 법령 분기 결과 ────────────────────────────────────────────────

export type LegalBasis = 'commercial' | 'residential' | 'ambiguous' | 'not_applicable';

/**
 * buildingUse에서 적용 법령을 판정합니다.
 *
 * - house_single, house_multi → 주택임대차보호법
 * - office → ambiguous (오피스텔 주거용 여부)
 * - null → not_applicable (나대지)
 * - 나머지 → 상가건물임대차보호법
 */
export function legalBasisOf(use: BuildingUse | null): LegalBasis {
  if (use === null) return 'not_applicable';
  if (use === 'house_single' || use === 'house_multi') return 'residential';
  if (use === 'office') return 'ambiguous';
  return 'commercial';
}

// ── 통합 결과 타입 ────────────────────────────────────────────────

export interface DispatchedTenancyResult {
  legalBasis: LeaseUnitLegalBasis;
  commercial?: TenancyResult;
  residential?: ResidentialTenancyResult;
}

/**
 * 법령 분기에 따라 적절한 T 규칙군을 실행합니다.
 *
 * @param legalBasis - 호실의 법적 기초 ('commercial' | 'residential')
 * @param unit - 임대차 입력 (상가 또는 주택)
 * @param region - 지역
 */
export function dispatchTenancy(
  legalBasis: LeaseUnitLegalBasis,
  unit: LeaseUnitInput | ResidentialLeaseInput,
  region: Region = 'seoul',
): DispatchedTenancyResult {
  if (legalBasis === 'residential') {
    return {
      legalBasis: 'residential',
      residential: evaluateResidentialTenancy(unit as ResidentialLeaseInput, region),
    };
  }
  return {
    legalBasis: 'commercial',
    commercial: evaluateTenancy(unit as LeaseUnitInput, region),
  };
}

/**
 * 혼합 물건(상가주택 등)에서 호실별로 법령을 분기하여 평가합니다.
 *
 * 각 호실에 legalBasis가 명시되어야 합니다.
 * 명시되지 않은 경우 buildingUse 기반으로 제안합니다.
 */
export function dispatchAllTenancy(
  units: Array<{
    legalBasis: LeaseUnitLegalBasis;
    unit: LeaseUnitInput | ResidentialLeaseInput;
  }>,
  region: Region = 'seoul',
): {
  results: DispatchedTenancyResult[];
  commercialCount: number;
  residentialCount: number;
  isMixed: boolean;
} {
  const results = units.map(u => dispatchTenancy(u.legalBasis, u.unit, region));
  const commercialCount = results.filter(r => r.legalBasis === 'commercial').length;
  const residentialCount = results.filter(r => r.legalBasis === 'residential').length;

  return {
    results,
    commercialCount,
    residentialCount,
    isMixed: commercialCount > 0 && residentialCount > 0,
  };
}
