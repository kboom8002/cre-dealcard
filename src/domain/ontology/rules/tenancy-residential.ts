/**
 * tenancy-residential.ts — T-R 규칙군 (주택 임대차 법적 지위)
 * Spec: ONTOLOGY_V0.4_SPEC.md §2
 * 
 * 주택임대차보호법 기반. 상가(T-C)와 결정적으로 다른 점:
 * - 환산보증금 개념 없음 (전 호실 보호)
 * - 갱신요구권 1회 · 2년 (상가 10년과 완전 다름)
 * - 권리금 보호 없음
 * - 임대인 직접사용 갱신거절 가능
 */

import type { Region } from './tenancy';

// 소액임차인 기준 (2026년)
const SMALL_TENANT_SEOUL = 5000_0000;   // 5000만원
const SMALL_TENANT_METRO = 4300_0000;   // 4300만원
const SMALL_TENANT_OTHER = 2300_0000;   // 2300만원

export function getSmallTenantThreshold(region: Region): number {
  switch (region) {
    case 'seoul': return SMALL_TENANT_SEOUL;
    case 'metro': return SMALL_TENANT_METRO;
    case 'other': return SMALL_TENANT_OTHER;
  }
}

export interface ResidentialLeaseInput {
  floor: string;
  depositKrw: number;
  monthlyRentKrw: number;
  leaseStartDate?: string;
  currentContractStartDate?: string;
  /** 전입신고 완료 여부 — 기본 true */
  registrationCompleted?: boolean;
  /** 확정일자 취득 여부 */
  fixedDateObtained?: boolean;
  /** 갱신요구권 사용 여부 */
  renewalUsed?: boolean;
}

export interface ResidentialTenancyResult {
  /** T-R-01: 보호 여부 — 주택은 항상 true */
  isProtected: true;
  /** T-R-02: 대항력 (전입신고 + 인도) */
  opposingPower: boolean;
  /** T-R-03: 갱신요구권 — 1회 한정, 사용 여부 */
  renewalAvailable: boolean;
  /** T-R-03: 갱신 후 계약 종료 예상일 */
  estimatedEndDate: string | null;
  /** T-R-04: 우선변제권 */
  priorityRepayment: boolean;
  /** T-R-05: 최우선변제 — 소액임차인 해당 여부 */
  isSmallTenant: boolean;
  /** T-R-06: 차임 인상률 5% 상한 */
  rentCapApplied: boolean;
  /** T-R-07: 임대인 직접사용 갱신거절 가능 */
  landlordSelfUseRefusal: boolean;
  /** 위반/경고 */
  violations: string[];
}

/**
 * T-R-01~07 주택 임대차 일괄 평가
 */
export function evaluateResidentialTenancy(
  unit: ResidentialLeaseInput,
  region: Region = 'seoul',
): ResidentialTenancyResult {
  const violations: string[] = [];

  // T-R-01: 주택임대차는 환산보증금 개념 없이 전 호실 보호
  const isProtected = true as const;

  // T-R-02: 대항력 — 전입신고 + 인도
  const opposingPower = unit.registrationCompleted !== false;

  // T-R-03: 갱신요구권 — 1회 한정, 2년
  const renewalUsed = unit.renewalUsed ?? false;
  const renewalAvailable = !renewalUsed;
  let estimatedEndDate: string | null = null;
  
  const startStr = unit.currentContractStartDate || unit.leaseStartDate;
  if (startStr) {
    const start = new Date(startStr);
    if (!isNaN(start.getTime())) {
      // 현재 계약 만기 (2년) + 갱신 시 추가 2년
      const totalYears = renewalUsed ? 4 : 2;
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + totalYears);
      estimatedEndDate = end.toISOString().split('T')[0];
    }
  }

  // T-R-04: 우선변제권 — 확정일자 필요
  const priorityRepayment = (unit.fixedDateObtained ?? false) && opposingPower;

  // T-R-05: 최우선변제 — 소액임차인
  const threshold = getSmallTenantThreshold(region);
  const isSmallTenant = unit.depositKrw <= threshold;

  // T-R-06: 차임 인상률 5% — 주택은 갱신 시 적용
  const rentCapApplied = true;

  // T-R-07: 임대인 직접사용 갱신거절 — 주택은 가능
  const landlordSelfUseRefusal = true;

  if (!opposingPower) {
    violations.push('[T-R-02] 전입신고가 완료되지 않아 대항력이 인정되지 않습니다.');
  }

  return {
    isProtected,
    opposingPower,
    renewalAvailable,
    estimatedEndDate,
    priorityRepayment,
    isSmallTenant,
    rentCapApplied,
    landlordSelfUseRefusal,
    violations,
  };
}

/** 전체 주택 임대차에 대해 T-R 규칙 일괄 평가 */
export function evaluateAllResidentialTenancy(
  units: ResidentialLeaseInput[],
  region: Region = 'seoul',
): {
  results: ResidentialTenancyResult[];
  renewalAvailableCount: number;
  smallTenantCount: number;
} {
  const results = units.map(u => evaluateResidentialTenancy(u, region));
  return {
    results,
    renewalAvailableCount: results.filter(r => r.renewalAvailable).length,
    smallTenantCount: results.filter(r => r.isSmallTenant).length,
  };
}
