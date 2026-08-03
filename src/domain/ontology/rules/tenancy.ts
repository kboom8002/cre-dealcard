/**
 * tenancy.ts — T 규칙군 (임대차 법적 지위)
 * Spec: ONTOLOGY_V0.2_SPEC.md §5.3
 * 
 * v0.2에서 R10을 폐기하고 T01~T06으로 재편.
 * 임대차의 법적 지위를 아키타입 판정에서 분리합니다.
 */

// ── 서울 기준 환산보증금 기준액 (2026년) ──────────────────────────
const THRESHOLD_SEOUL = 9_0000_0000; // 9억원 (2024 기준, 시행령 갱신 시 업데이트)
const THRESHOLD_METRO = 6_9000_0000; // 6.9억원
const THRESHOLD_OTHER = 5_4000_0000; // 5.4억원

export type Region = 'seoul' | 'metro' | 'other';

export function getThreshold(region: Region): number {
  switch (region) {
    case 'seoul': return THRESHOLD_SEOUL;
    case 'metro': return THRESHOLD_METRO;
    case 'other': return THRESHOLD_OTHER;
  }
}

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
  /** T01: 환산보증금 */
  convertedDeposit: number;
  /** T01: 상임법 적용 여부 */
  isProtected: boolean;
  /** T02: 대항력 */
  opposingPower: boolean;
  /** T03: 계약갱신요구권 잔여 년수 */
  renewalRightRemaining: number | null;
  /** T04: 우선변제권 */
  priorityRepayment: boolean;
  /** T05: 차임 인상률 5% 상한 적용 */
  rentCapApplied: boolean;
  /** T06: 권리금 회수기회 보호 */
  premiumProtection: boolean;
  /** 위반/경고 메시지 */
  violations: string[];
}

/**
 * T01~T06을 일괄 평가합니다.
 * 
 * T01: 환산보증금 = 보증금 + 월세 × 100
 * T02: 대항력 — 기본값 true (부정 시 근거 필수)
 * T03: 계약갱신요구권 — 최초 계약일부터 10년, 잔여 산출
 * T04: 우선변제권 — 환산보증금 이하 + 확정일자
 * T05: 차임 인상률 5% 상한 — 환산보증금 이하만
 * T06: 권리금 회수기회 보호 — 환산보증금 무관 적용
 */
export function evaluateTenancy(
  unit: LeaseUnitInput,
  region: Region = 'seoul',
): TenancyResult {
  const violations: string[] = [];

  // T01: 환산보증금
  const convertedDeposit = unit.depositKrw + unit.monthlyRentKrw * 100;
  const threshold = getThreshold(region);
  const isProtected = convertedDeposit <= threshold;

  // T02: 대항력 — 기본값 true
  let opposingPower = true;
  if (unit.opposingPowerOverride === false) {
    if (!unit.opposingPowerEvidence) {
      violations.push(
        '[T02] 대항력 부정 표기에는 근거가 필요합니다 (사업자등록 미신청 등).'
      );
      opposingPower = true; // 근거 없으면 true 유지
    } else {
      opposingPower = false;
    }
  }

  // T03: 계약갱신요구권 — 최초 계약일부터 10년
  let renewalRightRemaining: number | null = null;
  if (unit.leaseStartDate) {
    const startDate = new Date(unit.leaseStartDate);
    const yearsElapsed = (Date.now() - startDate.getTime()) / (365.25 * 86400000);
    renewalRightRemaining = Math.max(0, 10 - yearsElapsed);
    renewalRightRemaining = parseFloat(renewalRightRemaining.toFixed(1));
  }

  // T04: 우선변제권 — 환산보증금 이하만
  const priorityRepayment = isProtected;

  // T05: 차임 인상률 5% 상한 — 환산보증금 이하만
  const rentCapApplied = isProtected;

  // T06: 권리금 회수기회 보호 — 환산보증금 무관 적용
  const premiumProtection = true;

  return {
    convertedDeposit,
    isProtected,
    opposingPower,
    renewalRightRemaining,
    priorityRepayment,
    rentCapApplied,
    premiumProtection,
    violations,
  };
}

/**
 * 전체 임대차 단위에 대해 T 규칙을 일괄 평가하고
 * 상임법 적용 범위를 판정합니다.
 */
export function evaluateAllTenancy(
  units: LeaseUnitInput[],
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
