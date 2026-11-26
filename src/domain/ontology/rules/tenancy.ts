/**
 * tenancy.ts — T-C 규칙군 (상가 임대차 법적 지위)
 * Spec: ONTOLOGY_V0.4_SPEC.md §2 · CATALOG_RULES.md §2.1
 *
 * v0.2의 T01~T06 → v0.4에서 T-C-01~06으로 개명.
 * 상가건물임대차보호법 전용. 주택(T-R)은 tenancy-residential.ts.
 * 로직은 v0.2에서 검증 완료되었으므로 그대로 유지합니다.
 *
 * 주요 차이 (상가 vs 주택):
 * - T-C: 환산보증금으로 적용 여부 분기 / 갱신요구권 10년
 * - T-R: 전 호실 보호 / 갱신요구권 1회·2년 (max 4년)
 */

import {
  COMMERCIAL_LEASE_ACT_THRESHOLDS,
  CONVERTED_DEPOSIT_RATE,
} from '@/domain/building/im-core/lease-calc';

// ── 상가건물 임대차보호법 시행령 제2조제1항 4단계 권역 기준액 (SSOT) ──────
const THRESHOLD_SEOUL = COMMERCIAL_LEASE_ACT_THRESHOLDS['서울']; // 9억원
const THRESHOLD_METRO = COMMERCIAL_LEASE_ACT_THRESHOLDS['수도권과밀억제']; // 6.9억원
const THRESHOLD_METRO_CITY = COMMERCIAL_LEASE_ACT_THRESHOLDS['광역시']; // 5.4억원
const THRESHOLD_NON_METRO = COMMERCIAL_LEASE_ACT_THRESHOLDS['기타']; // 3.7억원

export type Region = 'seoul' | 'metro' | 'metro_city' | 'non_metro' | 'other';

export function getThreshold(region: Region): number {
  switch (region) {
    case 'seoul':
      return THRESHOLD_SEOUL;
    case 'metro':
      return THRESHOLD_METRO;
    case 'metro_city':
      return THRESHOLD_METRO_CITY;
    case 'non_metro':
      return THRESHOLD_NON_METRO;
    case 'other':
      return THRESHOLD_METRO_CITY;
  }
}

/** 수도권정비계획법상 경기도 과밀억제권역 시 목록 (시행령 제2조제1항제2호: 6.9억 원) */
const GYEONGGI_OVERPOPULATION_CITY_RE =
  /(?:수원|성남|안양|부천|광명|과천|의왕|군포|시흥|고양|의정부|구리|남양주|하남)시?/;

/** 경기도 내 시행령 제2조제1항제3호 지정 시 목록 (5.4억 원) */
const GYEONGGI_METRO_CITY_TIER_RE = /(?:파주|화성|안산|용인|김포|광주)시/;

/**
 * 주소 문자열로부터 상가건물 임대차보호법 시행령 제2조제1항 권역(4단계)을 판정합니다.
 *  - 'seoul'      (9.0억): 서울특별시
 *  - 'metro'      (6.9억): 수도권 과밀억제권역(서울 제외) 및 부산광역시
 *  - 'metro_city' (5.4억): 광역시(부산·과밀억제 제외, 군지역 제외), 세종특별자치시, 파주·화성·안산·용인·김포·광주시
 *  - 'non_metro'  (3.7억): 그 밖의 지방 도·특별자치도 시·군 (전북 전주시, 강원 춘천시, 제주 제주시 등)
 */
export function resolveLeaseActRegionFromAddress(address: string): Region {
  const s = String(address ?? '').trim();
  if (!s) return 'non_metro';

  if (/^(?:서울특별시|서울시|서울)(?=\s|$)/.test(s)) {
    return 'seoul';
  }

  // 부산광역시 (시행령 제2조제1항제2호: 6.9억 원, 단 기장군은 군지역으로 기타 3.7억)
  if (/^(?:부산광역시|부산시|부산)(?=\s|$)/.test(s)) {
    if (/(?:^|\s)기장군(?=\s|$)/.test(s)) return 'non_metro';
    return 'metro';
  }

  // 인천광역시 (강화군·옹진군은 군지역 제외, 일반 구는 수도권 과밀억제권역 6.9억)
  if (/^(?:인천광역시|인천시|인천)(?=\s|$)/.test(s)) {
    if (/(?:^|\s)(?:강화군|옹진군)(?=\s|$)/.test(s)) return 'non_metro';
    return 'metro';
  }

  // 세종특별자치시 (시행령 제2조제1항제3호: 5.4억 원)
  if (/^(?:세종특별자치시|세종시|세종)(?=\s|$)/.test(s)) {
    return 'metro_city';
  }

  // 대구·광주·대전·울산 광역시 (군지역인 달성군·울주군은 기타, 일반 구는 5.4억 원)
  if (/^(?:대구|광주|대전|울산)(?:광역시|시)?(?=\s|$)/.test(s)) {
    if (/(?:^|\s)(?:달성군|울주군)(?=\s|$)/.test(s)) return 'non_metro';
    return 'metro_city';
  }

  // 경기도 (과밀억제권역 6.9억 vs 제3호 특례 6개 시 5.4억 vs 그 외 경기 시·군 3.7억)
  if (/^(?:경기도|경기)(?=\s|$)/.test(s)) {
    if (GYEONGGI_OVERPOPULATION_CITY_RE.test(s)) return 'metro';
    if (GYEONGGI_METRO_CITY_TIER_RE.test(s)) return 'metro_city';
    return 'non_metro';
  }

  // 도명 생략 수도권 주요 시 단독 표기 지원 (전북·강원·제주 등 지방 도 표기가 없을 때만)
  const isExplicitNonMetroProvince =
    /^(?:강원|충북|충청북도|충남|충청남도|전북|전라북도|전남|전라남도|경북|경상북도|경남|경상남도|제주)/.test(s);
  if (!isExplicitNonMetroProvince) {
    if (GYEONGGI_OVERPOPULATION_CITY_RE.test(s)) return 'metro';
    if (GYEONGGI_METRO_CITY_TIER_RE.test(s)) return 'metro_city';
  }

  return 'non_metro';
}

import type { LeaseUnitPrecise } from '../lease-precise';

// ── 임대차 단위 입력 ──────────────────────────────────────────────
export interface LeaseUnitInput {
  floor: string;
  tenantType?: string;
  depositKrw: number;
  monthlyRentKrw: number;
  leaseStartDate?: string;     // ISO date
  /** 대항력 수동 오버라이드 (기본: true) */
  opposingPowerOverride?: boolean;
  /** 대항력 부정 시 근거 */
  opposingPowerEvidence?: string;
}

// ── T 규칙 결과 ──────────────────────────────────────────────────
export interface TenancyResult {
  /** T-C-01: 환산보증금 */
  convertedDeposit: number;
  /** T-C-01: 상임법 적용 여부 */
  isProtected: boolean;
  /** T-C-02: 대항력 */
  opposingPower: boolean;
  /** T-C-03: 계약갱신요구권 잔여 년수 (10년 기준) */
  renewalRightRemaining: number | null;
  /** T-C-04: 우선변제권 */
  priorityRepayment: boolean;
  /** T-C-05: 차임 인상률 5% 상한 적용 */
  rentCapApplied: boolean;
  /** T-C-06: 권리금 회수기회 보호 */
  premiumProtection: boolean;
  /** 상임법 보호 시/비보호 시에 따른 인상 여력 (마켓렌트 대비) */
  increaseHeadroom: number | null;
  /** 위반/경고 메시지 */
  violations: string[];
}

/**
 * T-C-01~06을 일괄 평가합니다 (상가건물임대차보호법).
 *
 * T-C-01: 환산보증금 = 보증금 + 월세 × 100
 * T-C-02: 대항력 — 기본값 true (부정 시 근거 필수)
 * T-C-03: 계약갱신요구권 — 최초 계약일부터 10년, 잔여 산출
 * T-C-04: 우선변제권 — 환산보증금 이하 + 확정일자
 * T-C-05: 차임 인상률 5% 상한 — 환산보증금 이하만
 * T-C-06: 권리금 회수기회 보호 — 환산보증금 무관 적용
 */
export function evaluateTenancy(
  unit: LeaseUnitInput | LeaseUnitPrecise,
  region: Region = 'seoul',
): TenancyResult {
  const violations: string[] = [];

  const unitAny = unit as any;
  const deposit = unit.depositKrw;
  const monthlyRent = unit.monthlyRentKrw;
  
  // Try to find the start date
  const startDateStr = unitAny.firstContractDate || unitAny.leaseStartDate || unitAny.currentStartDate;
  const startDateObj = unitAny.startDate;

  // T01: 환산보증금 (정수 산술 — IEEE-754 오차 방지)
  const convertedDeposit = Math.round(
    deposit + (CONVERTED_DEPOSIT_RATE === 0.12 ? monthlyRent * 100 : (monthlyRent * 12) / CONVERTED_DEPOSIT_RATE)
  );
  const threshold = getThreshold(region);
  const isProtected = convertedDeposit <= threshold;

  // T02: 대항력 — 기본값 true
  let opposingPower = true;
  const override = unitAny.opposingPowerOverride;
  const evidence = unitAny.opposingPowerEvidence;
  if (override === false) {
    if (!evidence) {
      violations.push(
        '[T02] 대항력 부정 표기에는 근거가 필요합니다 (사업자등록 미신청 등).'
      );
    } else {
      opposingPower = false;
    }
  }

  // T03: 계약갱신요구권 — 최초 계약일부터 10년
  let renewalRightRemaining: number | null = null;
  const actualStartDate = (startDateObj && typeof startDateObj.getTime === 'function') 
    ? startDateObj 
    : (startDateStr ? new Date(startDateStr) : undefined);
  if (actualStartDate) {
    const yearsElapsed = (Date.now() - actualStartDate.getTime()) / (365.25 * 86400000);
    renewalRightRemaining = Math.max(0, 10 - yearsElapsed);
    renewalRightRemaining = parseFloat(renewalRightRemaining.toFixed(1));
  }

  // T04: 우선변제권 — 환산보증금 이하만
  const priorityRepayment = isProtected;

  // T05: 차임 인상률 5% 상한 — 환산보증금 이하만
  const rentCapApplied = isProtected;

  // T06: 권리금 회수기회 보호 — 환산보증금 무관 적용
  const premiumProtection = true;

  // increaseHeadroom 계산
  let increaseHeadroom: number | null = null;
  const marketRent = unitAny.marketRent;
  if (typeof marketRent === 'number' && marketRent > monthlyRent) {
    if (isProtected) {
      const maxRent = monthlyRent * 1.05;
      increaseHeadroom = Math.min(marketRent, maxRent) - monthlyRent;
    } else {
      increaseHeadroom = marketRent - monthlyRent;
    }
  }

  return {
    convertedDeposit,
    isProtected,
    opposingPower,
    renewalRightRemaining,
    priorityRepayment,
    rentCapApplied,
    premiumProtection,
    increaseHeadroom,
    violations,
  };
}

/**
 * 전체 임대차 단위에 대해 T 규칙을 일괄 평가하고
 * 상임법 적용 범위를 판정합니다.
 */
export function evaluateAllTenancy(
  units: (LeaseUnitInput | LeaseUnitPrecise)[],
  region: Region = 'seoul',
): {
  results: TenancyResult[];
  leaseActApplication: 'full' | 'partial';
  protectedCount: number;
  unprotectedCount: number;
} {
  const results = units.map(u => evaluateTenancy(u, region));
  const protectedCount = results.filter(r => r.isProtected).length;
  const unprotectedCount = results.length - protectedCount;

  return {
    results,
    leaseActApplication: unprotectedCount === 0 ? 'full' : 'partial',
    protectedCount,
    unprotectedCount,
  };
}
