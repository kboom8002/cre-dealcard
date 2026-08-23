// src/domain/building/mobile-im/lease-math.ts
// 상가 vs 주택 갱신요구권 분리 산식, 임대차 원장 해상도(R0-R3) 및 기능(Capability) 판정
// Spec: API_TYPE_CONTRACT.md (D3 §3.3, §3.4, §3.5)

import type { LeaseRow, VacateVerdict, Resolution, Capability, FinancialInput } from '@/types/im';

/** 날짜 간 연 단위 차이 계산 */
function yearsBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/** 날짜에 년 추가 */
function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** 날짜에 월 추가 */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * 상가건물임대차보호법 갱신요구권 산식:
 * 최초 계약일로부터 총 10년 보장
 */
export function commercialVacatePoint(u: LeaseRow, asOf: Date = new Date()): VacateVerdict {
  if (u.leaseState === '공실') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '현재 공실' };
  }
  if (u.leaseState === '자가사용') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '매도인 자가사용 (명도 협의)' };
  }
  if (!u.firstContractDate) {
    return { state: 'unknown', reason: '최초 계약일 확인 필요' };
  }
  const firstDate = new Date(u.firstContractDate);
  if (isNaN(firstDate.getTime())) {
    return { state: 'unknown', reason: '최초 계약일 형식 오류' };
  }
  const elapsed = yearsBetween(firstDate, asOf);
  const targetDate = addYears(u.firstContractDate, 10);
  const remainingYears = Math.max(0, 10 - elapsed);

  return {
    state: 'determined',
    at: targetDate,
    reason: `상임법 10년 (잔여 ${remainingYears.toFixed(1)}년)`,
  };
}

/**
 * 주택임대차보호법 갱신요구권 산식:
 * 1회에 한하여 2년 보장 (현 계약 만료일 기준)
 * 갱신요구권 행사 이력이 없으면 임의 산출 불가
 */
export function residentialVacatePoint(u: LeaseRow, asOf: Date = new Date()): VacateVerdict {
  if (u.leaseState === '공실') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '현재 공실' };
  }
  if (u.leaseState === '자가사용') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '매도인 자가사용 (명도 협의)' };
  }
  if (u.renewalExercised == null || u.renewalExercised === '모름') {
    return { state: 'unknown', reason: '갱신요구권 행사 이력 확인 필요' };
  }
  if (!u.currentExpiryDate) {
    return { state: 'unknown', reason: '현 계약 만료일 확인 필요' };
  }
  const expiryDate = new Date(u.currentExpiryDate);
  if (isNaN(expiryDate.getTime())) {
    return { state: 'unknown', reason: '현 계약 만료일 형식 오류' };
  }

  return u.renewalExercised === '있음'
    ? { state: 'determined', at: u.currentExpiryDate, reason: '갱신요구권 소진 (1회)' }
    : { state: 'determined', at: addMonths(u.currentExpiryDate, 24), reason: '갱신 청구 시 +2년' };
}

/** 적용 법령에 따른 자동 라우팅 */
export function calculateVacatePoint(u: LeaseRow, asOf: Date = new Date()): VacateVerdict {
  if (u.legalBasis === '주택') {
    return residentialVacatePoint(u, asOf);
  }
  return commercialVacatePoint(u, asOf);
}

/**
 * 임대차 원장 해상도 판정 (R0~R3)
 * - R0: 기본 데이터 부족 (임대중 호실의 업종/만료일 누락)
 * - R1: 발행 최소선 (업종, 보증금, 월세, 만료일 확보)
 * - R2: 분석 가능 (면적, 적용법령, 관리비 확보)
 * - R3: 정밀 실사 (최초계약일, 대항력 요건 확보)
 */
export function resolveLedger(rows: LeaseRow[]): Resolution {
  if (!rows || rows.length === 0) return 'R0';
  const live = rows.filter(r => r.leaseState === '임대중');
  if (!live.length) {
    // 전 호실 공실 또는 자가사용인 경우 기본 요건 충족 시 R1
    return rows.every(r => r.unitLabel) ? 'R1' : 'R0';
  }

  // R1 검증: 임대중인 호실의 필수값
  const r1 = live.every(r => (r.tenantBusiness || r.unitLabel) && r.currentExpiryDate && r.monthlyRentKrw !== null);
  if (!r1) return 'R0';

  // R2 검증: 면적, 법령, 관리비
  const r2 = rows.every(r => r.leaseAreaSqm != null && r.legalBasis != null)
          && live.every(r => r.mgmtFeeKrw != null);
  if (!r2) return 'R1';

  // R3 검증: 최초계약일, 대항력
  const r3 = live.every(r => r.firstContractDate && r.opposingPower && r.opposingPower !== '미확인');
  return r3 ? 'R3' : 'R2';
}

/**
 * 렌더 가능 기능(Capability) 판정
 * 종합 등급으로 막지 않고, 개별 데이터가 허용하는 기능 집합을 산출
 */
export function resolveCapabilities(rows: LeaseRow[], fin?: FinancialInput): Set<Capability> {
  const caps = new Set<Capability>();

  if (rows && rows.some(r => r.monthlyRentKrw != null && r.monthlyRentKrw > 0)) {
    caps.add('yield_gross');
  }

  if (fin && fin.opexKrw != null) {
    caps.add('yield_noi');
  }

  if (rows && rows.length > 0) {
    const allVacateResolved = rows.every(r =>
      r.leaseState !== '임대중' || calculateVacatePoint(r).state === 'determined'
    );
    if (allVacateResolved) {
      caps.add('vacate_schedule');
    }
  }

  if (rows && rows.every(r => r.leaseAreaSqm != null && r.leaseAreaSqm > 0)) {
    caps.add('rent_normalization');
  }

  return caps;
}
