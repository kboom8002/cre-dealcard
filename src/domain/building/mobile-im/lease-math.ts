// src/domain/building/mobile-im/lease-math.ts
// 상가 vs 주택 갱신요구권 분리 산식, 임대차 원장 해상도(R0-R3) 및 기능(Capability) 판정
// Spec: API_TYPE_CONTRACT.md (D3 §3.3, §3.4, §3.5)

import type { LeaseRow, VacateVerdict, Resolution, Capability, FinancialInput } from '@/types/im';
import { resolveLeaseOccupancy, type LeaseOccupancy } from './lease-vacancy';
import { PYEONG_TO_SQM_V15, type ExpiryBucket, type AmountCheckResult } from './rentroll-meta';

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

/* ═══════════════════ v1.4/v1.5 — 평가일 · 계약 그룹 · AC/AD · NOC (순수 함수) ═══════════════════
 * 입력은 두 형태를 모두 받는다:
 *  - 프로덕션 floor_leases (snake_case, 금액 만원, 면적 ㎡): rent_manwon, mgmt_fee_manwon, area_sqm, …
 *  - LeaseRow (camelCase, 금액 원): monthlyRentKrw, mgmtFeeKrw, leaseAreaSqm, …
 * 내부 금액은 원. 엑셀 캐시값은 쓰지 않고 같은 규칙으로 재계산한다 (스펙 §8).
 */
export type LeaseInput = LeaseRow | Record<string, any>;

const YMD_RE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date | 'YYYY-MM-DD…' | 엑셀 serial → 'YYYY-MM-DD' (파싱 불가면 null). Date 는 UTC 기준 날짜. */
export function parseYmd(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 20000 || v > 80000) return null; // 엑셀 serial 범위(≈1954~2118)
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const m = YMD_RE.exec(String(v).trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** 엑셀 EDATE — 월 가감, 말일 초과 시 해당 월 말일로 (365일 환산 아님) */
export function edateYmd(ymd: string, months: number): string {
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const total = y * 12 + (mo - 1) + months;
  const ny = Math.floor(total / 12), nm = total - ny * 12;
  const dim = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad2(nm + 1)}-${pad2(Math.min(d, dim))}`;
}

/** 서울(KST) 기준 오늘 날짜 — 엑셀 TODAY() 와 같은 '현지 날짜' 의미 */
function todayKstYmd(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * §6.4-1 평가 기준일 = C5(렌트롤 기준일), 비어 있거나 파싱 불가면 오늘(KST).
 * 반환은 UTC 자정 Date — commercialVacatePoint 등 기존 `asOf: Date` 인자에 그대로 넣을 수 있다.
 */
export function resolveEvaluationDate(asOf?: string | Date | number | null, now: Date = new Date()): Date {
  const ymd = parseYmd(asOf) ?? todayKstYmd(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

interface NormLease {
  raw: Record<string, any>;
  state: LeaseOccupancy;
  /** trim(contract_group) — 빈 문자열이면 그룹 없음 */
  group: string;
  label: string;
  business: string;
  expiryYmd: string | null;
  rentKrw: number | null;
  mgmtKrw: number | null;
  depositKrw: number | null;
  areaSqm: number | null;
  exclSqm: number | null;
  legalBasis: string;
  firstContract: string;
  opposing: string;
}

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** 만원 키 우선(→ 원), 없으면 원 키. 값이 없으면 null (0 과 구분 — 엑셀 `<>""` 의미) */
function moneyKrw(manwon: unknown, krw: unknown): number | null {
  const m = numOrNull(manwon);
  if (m != null) return Math.round(m * 10_000);
  return numOrNull(krw);
}

function norm(row: LeaseInput): NormLease {
  const l = (row ?? {}) as Record<string, any>;
  return {
    raw: l,
    state: resolveLeaseOccupancy(l),
    group: s(l.contract_group ?? l.contractGroup),
    label: s(l.unitLabel ?? l.unit_label ?? l.floor ?? l.unit),
    business: s(l.tenantBusiness ?? l.tenant_type ?? l.tenant_sector ?? l.tenant_name ?? l.tenantName),
    expiryYmd: parseYmd(l.currentExpiryDate ?? l.lease_end ?? l.contract_end ?? l.leaseEnd),
    rentKrw: moneyKrw(l.rent_manwon ?? l.monthly_rent_manwon, l.monthlyRentKrw ?? l.monthly_rent_krw),
    mgmtKrw: moneyKrw(l.mgmt_fee_manwon ?? l.maintenance_manwon, l.mgmtFeeKrw ?? l.mgmt_fee_krw),
    depositKrw: moneyKrw(l.deposit_manwon, l.depositKrw ?? l.deposit_krw),
    areaSqm: numOrNull(l.area_sqm ?? l.leaseAreaSqm),
    exclSqm: numOrNull(l.exclusive_area_sqm ?? l.exclusiveAreaSqm),
    legalBasis: s(l.legal_basis ?? l.legalBasis),
    firstContract: s(l.first_contract_date ?? l.firstContractDate),
    opposing: s(l.opposing_power ?? l.opposingPower),
  };
}

/** 계약그룹 키 — trim(contract_group). 빈 값이면 '' (그룹 없음 = 행 자체가 계약 1건) */
export function contractGroupKey(row: LeaseInput): string {
  const l = (row ?? {}) as Record<string, any>;
  return s(l.contract_group ?? l.contractGroup);
}

export interface ContractGroup<T> {
  /** 그룹명. 그룹 없는 행은 `\u0000row:<index>` */
  key: string;
  /** contract_group 이 적힌 행 묶음인지 */
  named: boolean;
  rows: T[];
  indices: number[];
}

/**
 * 계약 단위 묶음 (§2.4). 그룹 키 = trim(contract_group), 비면 행 자체가 1건.
 * 등장 순서를 보존한다. 표 빌더의 "〃" 로직과 공유 가능.
 */
export function groupContracts<T extends LeaseInput>(rows: ReadonlyArray<T> | null | undefined): ContractGroup<T>[] {
  const out: ContractGroup<T>[] = [];
  const byKey = new Map<string, ContractGroup<T>>();
  (Array.isArray(rows) ? rows : []).forEach((r, i) => {
    const k = contractGroupKey(r);
    if (!k) {
      out.push({ key: `\u0000row:${i}`, named: false, rows: [r], indices: [i] });
      return;
    }
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, named: true, rows: [], indices: [] };
      byKey.set(k, g);
      out.push(g);
    }
    g.rows.push(r);
    g.indices.push(i);
  });
  return out;
}

/** row 가 속한 계약 단위의 모든 행 (그룹 없으면 [row]) */
function groupRowsOf(row: LeaseInput, rows: ReadonlyArray<LeaseInput>): NormLease[] {
  const key = contractGroupKey(row);
  if (!key) return [norm(row)];
  const mates = rows.filter(r => contractGroupKey(r) === key).map(norm);
  return mates.length ? mates : [norm(row)];
}

/**
 * 레거시 0 채움 비대표 행 — 그룹 안에 월세>0 행이 따로 있고, 이 행은 금액이 전부 0(보증금·관리비 0/없음).
 * (X4: 과거 저장분이 비대표 행 금액을 `0` 으로 채움) 엑셀 의미(빈 칸)로 취급해 '금액 중복' 오탐을 막는다.
 */
function isZeroFillNonRep(n: NormLease, mates: NormLease[]): boolean {
  if (!n.group || mates.length < 2) return false;
  if (n.rentKrw !== 0 || (n.mgmtKrw ?? 0) !== 0 || (n.depositKrw ?? 0) !== 0) return false;
  return mates.some(m => m !== n && (m.rentKrw ?? 0) > 0);
}

/**
 * AD열 — 금액 판정 (스펙 §2.3). 임대중 행만 판정, 그 외 ''.
 *  - 그룹 없음: 월세 없음 → '월세 누락', 관리비 없음 → '관리비 누락', 아니면 OK
 *  - 그룹: 금액 행 2개 이상 → '금액 중복', 0개 → '월세 누락', 그룹 관리비 0개 → '관리비 누락', 아니면 OK
 * rows 는 판정 대상 row 를 포함한 전체 렌트롤.
 */
export function amountCheck(row: LeaseInput, rows: ReadonlyArray<LeaseInput>): AmountCheckResult {
  if (!row) return '';
  const n = norm(row);
  if (n.state !== '임대중') return '';
  if (!n.group) {
    if (n.rentKrw == null) return '월세 누락';
    if (n.mgmtKrw == null) return '관리비 누락';
    return 'OK';
  }
  const mates = groupRowsOf(row, rows);
  const carriers = mates.filter(m => !isZeroFillNonRep(m, mates));
  const rentRows = carriers.filter(m => m.rentKrw != null).length;
  if (rentRows > 1) return '금액 중복';
  if (rentRows === 0) return '월세 누락';
  if (carriers.filter(m => m.mgmtKrw != null).length === 0) return '관리비 누락';
  return 'OK';
}

/**
 * AC열 — 만기 구간 (스펙 §2.3). 비교는 날짜 단위, 12개월은 EDATE(+12개월) 기준.
 *  공실/자가사용 → 그대로, 만료일 없음/파싱 불가 → '만료일 없음',
 *  만료일 < 기준일 → '만료 경과', ≤ EDATE(기준일,12) → '12개월 내', 그 외 '12개월 초과'.
 */
export function expiryBucket(row: LeaseInput, evalDate: Date | string | number | null | undefined): ExpiryBucket {
  if (!row) return '';
  const n = norm(row);
  if (n.state === '공실') return '공실';
  if (n.state === '자가사용') return '자가사용';
  if (!n.expiryYmd) return '만료일 없음';
  const base = parseYmd(evalDate) ?? resolveEvaluationDate(null).toISOString().slice(0, 10);
  if (n.expiryYmd < base) return '만료 경과';
  if (n.expiryYmd <= edateYmd(base, 12)) return '12개월 내';
  return '12개월 초과';
}

/** 행의 금액(원). 값이 비어 있으면 null — 0 과 구분한다 (엑셀 `<>""` 의미, 스펙 §8: 빈 금액을 0 으로 만들지 않는다). */
export function leaseAmountsKrw(row: LeaseInput): { rentKrw: number | null; mgmtKrw: number | null; depositKrw: number | null } {
  const n = norm(row);
  return { rentKrw: n.rentKrw, mgmtKrw: n.mgmtKrw, depositKrw: n.depositKrw };
}

/**
 * 계약 대표 행 — 임대중이고 월세가 적힌 행(계약 1건당 1행). 통합계약 비대표 행(금액 빈 칸)·레거시 0 채움 행은 false.
 * V07(근거)·V08(입금)·V09(렌트프리)의 '계약 단위' 집계 대상이다.
 */
export function isContractRepresentative(row: LeaseInput, rows: ReadonlyArray<LeaseInput>): boolean {
  if (!row) return false;
  const n = norm(row);
  if (n.state !== '임대중' || n.rentKrw == null) return false;
  return !isZeroFillNonRep(n, groupRowsOf(row, rows));
}

/**
 * Y열 — 전용평당 월비용(원/전용평). 계약 단위: (월세+관리비) ÷ (그룹 전용면적 합 ㎡ ÷ 3.305785).
 *  - 임대중이고 월세가 있는 행(= 그룹 대표 행)만 값을 낸다. 비대표 행·공실은 null.
 *  - 그룹 중 전용면적이 빈 행이 하나라도 있으면 null (보류) — 임대면적으로 대체하지 않는다.
 *  - 소수점 반올림(Math.round).
 */
export function nocPerExclusivePyeong(row: LeaseInput, rows: ReadonlyArray<LeaseInput>): number | null {
  if (!row) return null;
  const n = norm(row);
  if (n.state !== '임대중' || n.rentKrw == null) return null;
  const mates = groupRowsOf(row, rows);
  if (isZeroFillNonRep(n, mates)) return null;
  let sumExcl = 0;
  for (const m of mates) {
    if (m.exclSqm == null || !(m.exclSqm > 0)) return null;
    sumExcl += m.exclSqm;
  }
  if (!(sumExcl > 0)) return null;
  return Math.round((n.rentKrw + (n.mgmtKrw ?? 0)) / (sumExcl / PYEONG_TO_SQM_V15));
}

/**
 * 임대차 원장 해상도 판정 (R0~R3) — v1.4 계약 단위 규칙 (§6.4-2~4)
 * - R0: 기본 데이터 부족 (임대중 호실의 업종/만료일 누락, 또는 계약 단위 월세 누락/금액 중복)
 * - R1: 발행 최소선 (업종, 만료일, 계약 단위 월세 확보 — 그룹은 대표 행 1개)
 * - R2: R1 + 전 행 임대면적·적용법령 + 계약 단위 관리비
 * - R3: R2 + 임대중 행 전부(비대표 행 포함) 최초계약일·대항력(미확인 불가)
 *
 * v1.3 은 '임대중 모든 행에 월세' 를 요구해 통합계약 비대표 행 때문에 R0 로 잘못 판정했다.
 * opts.asOf 는 평가 기준일(C5) — 해상도 자체는 날짜 의존이 없지만 호출자 시그니처 통일을 위해 받는다.
 */
export function resolveLedger(
  rows: ReadonlyArray<LeaseInput>,
  _opts?: { asOf?: string | Date | number | null },
): Resolution {
  if (!rows || rows.length === 0) return 'R0';
  const all = rows.map(norm);
  const live = all.filter(r => r.state === '임대중');
  if (!live.length) {
    // 전 호실 공실 또는 자가사용인 경우 기본 요건 충족 시 R1
    return all.every(r => r.label) ? 'R1' : 'R0';
  }

  // R1 검증: 임대중인 호실의 업종·만료일 + 계약 단위 월세(그룹마다 금액 행 정확히 1개)
  const checks = rows.filter(r => norm(r).state === '임대중').map(r => amountCheck(r, rows));
  const rentOk = checks.every(c => c !== '월세 누락' && c !== '금액 중복');
  const r1 = live.every(r => (r.business || r.label) && r.expiryYmd) && rentOk;
  if (!r1) return 'R0';

  // R2 검증: 전 행 면적·법령 + 계약 단위 관리비
  const r2 = all.every(r => r.areaSqm != null && r.legalBasis !== '')
          && checks.every(c => c !== '관리비 누락');
  if (!r2) return 'R1';

  // R3 검증: 임대중 행 전부(비대표 행 포함) 최초계약일, 대항력
  const r3 = live.every(r => r.firstContract && r.opposing && r.opposing !== '미확인');
  return r3 ? 'R3' : 'R2';
}


/**
 * 렌더 가능 기능(Capability) 판정
 * 종합 등급으로 막지 않고, 개별 데이터가 허용하는 기능 집합을 산출
 */
export function resolveCapabilities(
  rows: LeaseRow[],
  fin?: FinancialInput,
  opts?: { asOf?: string | Date | number | null },
): Set<Capability> {
  const caps = new Set<Capability>();
  // 평가 기준일(C5) 미지정 시 기존과 동일하게 오늘 (calculateVacatePoint 기본값)
  const evalDate = opts?.asOf != null ? resolveEvaluationDate(opts.asOf) : undefined;

  if (rows && rows.some(r => r.monthlyRentKrw != null && r.monthlyRentKrw > 0)) {
    caps.add('yield_gross');
  }

  if (fin && fin.opexKrw != null) {
    caps.add('yield_noi');
  }

  if (rows && rows.length > 0) {
    const allVacateResolved = rows.every(r =>
      r.leaseState !== '임대중' || calculateVacatePoint(r, evalDate).state === 'determined'
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
