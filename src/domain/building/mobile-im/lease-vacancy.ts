/**
 * @file lease-vacancy.ts
 * @description 렌트롤 호실의 점유 상태(임대중/공실/자가사용) 단일 판정 SSOT.
 *
 * 배경 (oracle income-dangsan-r3): 자가사용(B1·4F)·통합계약 후행(2F, 금액이 대표 행에만 기입되어 월세 0)이
 * '공실 B1·2F·4F' / 공실률 33.33% 로 표기됨. 원인은 텍스트 렌트롤 LLM 파서의 '월세 0원 → is_vacant:true' 추정이
 * is_vacant 플래그에 그대로 영속된 것. 이 모듈은
 *   1) 자가사용은 어떤 경우에도 공실이 아니며 공실률 분모에서도 제외 (parse-rentroll-sheet 와 동일 기준),
 *   2) 공실은 명시 근거(lease_state='공실' / '공실' 표기 / 계약 흔적 없는 is_vacant)가 있을 때만 인정,
 *   3) lease_state 가 없는(= 검증되지 않은 레거시·LLM) 행에서 is_vacant:true 인데 임차인명·계약일이 있으면
 *      '월세 0 추정'의 오판으로 보고 임대중으로 본다.
 * 모든 소비처(생성 경로 vacancy_pct, 렌트롤 표, PPTX 공실 층 하이라이트)는 이 함수를 쓴다.
 */

export type LeaseOccupancy = '임대중' | '공실' | '자가사용';

/** 자가사용 키워드 — handler.ts(isOwnerUse) 와 동일 집합 */
const OWNER_USE_RE = /자가|사옥|자사|본사|직영|owner/i;
const VACANT_RE = /공실|vacant/i;

type LeaseLike = Record<string, any> | null | undefined;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** 자가사용 판정에 쓰는 필드 (임차인 실명은 제외 — 상호에 '본사' 가 들어간 실제 임차인 오탐 방지) */
function ownerUseText(l: Record<string, any>): string {
  return [l.tenant_type, l.tenantType, l.tenant_sector, l.tenant, l.note, l.notes].map(str).join(' ');
}

function vacancyText(l: Record<string, any>): string {
  return [l.tenant_name, l.tenantName, l.tenant, l.tenant_type, l.tenantType, l.tenant_sector, l.note, l.notes].map(str).join(' ');
}

/** 호실 1건의 점유 상태 */
export function resolveLeaseOccupancy(lease: LeaseLike): LeaseOccupancy {
  if (!lease) return '임대중';
  const l = lease as Record<string, any>;
  const state = str(l.lease_state ?? l.leaseState);

  // 명시 lease_state(importer/UI 검증 입력)가 키워드 추정보다 우선한다.
  //  예: lease_state '공실' + 비고 '기존 자가사용. 희망 임대료…' → 공실 (비고의 '자가' 로 자가사용 오판 금지)
  if (state === '공실') return '공실';
  if (state === '자가사용') return '자가사용';
  if (state === '임대중') return '임대중';
  if (OWNER_USE_RE.test(ownerUseText(l))) return '자가사용';
  if (VACANT_RE.test(vacancyText(l))) return '공실';

  const flagged = l.is_vacant === true || l.isVacant === true;
  if (flagged) {
    // lease_state 가 있으면 검증된 입력(importer/UI) → 플래그 신뢰
    if (state) return '공실';
    // lease_state 없음(LLM·레거시): 임차인명/계약일이 있으면 '월세 0 → 공실' 추정 오판
    const hasContractTrace = !!(str(l.tenant_name ?? l.tenantName) || str(l.lease_end ?? l.contract_end) || str(l.lease_start));
    return hasContractTrace ? '임대중' : '공실';
  }
  // 레거시 추론 유지: 임차인·업종 정보가 전혀 없고 보증금·월세가 명시적 0인 행
  const noTenantInfo = !str(l.tenant_name ?? l.tenantName) && !str(l.tenant) && !str(l.tenant_type ?? l.tenantType) && !str(l.tenant_sector);
  if (noTenantInfo && l.rent_manwon === 0 && l.deposit_manwon === 0) return '공실';
  return '임대중';
}

export const isVacantLeaseRow = (lease: LeaseLike): boolean => resolveLeaseOccupancy(lease) === '공실';
export const isOwnerUseLeaseRow = (lease: LeaseLike): boolean => resolveLeaseOccupancy(lease) === '자가사용';

/** 공용·설비 공간 명칭 (괄호·공백 제거 후 완전 일치만 — '창고'는 임대 사례가 많아 제외) */
const NON_LEASABLE_RE = /^(기계실|전기실|발전기실|보일러실|주차장|주차|계단실|관리실|경비실|방재실|물탱크실|공용|공용부|화장실)$/;

/**
 * 비임대 행 — 렌트롤에 공간 구성으로 적힌 설비·공용 공간(기계실, 주차장 등).
 * 오탐 방지: 명칭이 완전 일치하고, 보증금·월세가 0/미기입이며, 계약일이 없고, 명시 상태가 '공실'이 아닐 때만.
 * (유료 주차 운영사처럼 금액·계약이 있으면 임대 호실로 본다)
 */
export function isNonLeasableLeaseRow(lease: LeaseLike): boolean {
  if (!lease) return false;
  const l = lease as Record<string, any>;
  if (str(l.lease_state ?? l.leaseState) === '공실') return false;
  const names = [l.tenant_name, l.tenantName, l.tenant_type, l.tenantType, l.use, l.usage]
    .map(v => str(v).replace(/[()（）\s]/g, ''))
    .filter(Boolean);
  if (names.length === 0 || !names.some(n => NON_LEASABLE_RE.test(n))) return false;
  const money = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(str(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  if (money(l.rent_manwon ?? l.monthly_rent_manwon) > 0 || money(l.deposit_manwon) > 0) return false;
  if (str(l.lease_start) || str(l.lease_end ?? l.contract_end)) return false;
  return true;
}

export interface LeaseOccupancySummary {
  /** 임대 대상 호실 수 (비임대 공용·설비 행 제외) */
  total: number;
  leased: number;
  vacant: number;
  ownerUse: number;
  /** 비임대(공용·설비) 행 수 — total 에 포함하지 않는다 */
  nonLeasable: number;
  /** 공실률 % (소수 1자리) — 분모는 자가사용 제외 임대 가능 호실. 임대 가능 호실이 0이면 null */
  vacancyPct: number | null;
  vacantFloors: string[];
}

export function summarizeLeaseOccupancy(leases: ReadonlyArray<LeaseLike> | null | undefined): LeaseOccupancySummary {
  const all = (Array.isArray(leases) ? leases : []).filter(Boolean) as Record<string, any>[];
  const rows = all.filter(r => !isNonLeasableLeaseRow(r));
  let vacant = 0;
  let ownerUse = 0;
  const vacantFloors: string[] = [];
  for (const r of rows) {
    const o = resolveLeaseOccupancy(r);
    if (o === '공실') {
      vacant++;
      const fl = str(r.floor ?? r.unit ?? r.unit_label);
      if (fl && !vacantFloors.includes(fl)) vacantFloors.push(fl);
    } else if (o === '자가사용') ownerUse++;
  }
  const leasable = rows.length - ownerUse;
  return {
    total: rows.length,
    leased: leasable - vacant,
    vacant,
    ownerUse,
    nonLeasable: all.length - rows.length,
    vacancyPct: leasable > 0 ? Math.round((vacant / leasable) * 1000) / 10 : null,
    vacantFloors,
  };
}

/**
 * 호실 행의 is_vacant / lease_state 를 점유 상태 SSOT 로 교정한 사본.
 * 영속·LLM 입력 이전에 한 번 적용해, 월세 0 추정으로 오염된 is_vacant(자가사용·통합계약 후행)가 하류로 전파되지 않게 한다.
 * - 기존 lease_state 는 보존, 없으면 판정값을 채운다.
 */
export function normalizeLeaseOccupancyFields<T extends Record<string, any>>(lease: T): T {
  if (!lease || typeof lease !== 'object') return lease;
  const occupancy = resolveLeaseOccupancy(lease);
  const out: Record<string, any> = { ...lease };
  if (occupancy === '공실') out.is_vacant = true;
  else if (out.is_vacant === true) out.is_vacant = false;
  if (!str(out.lease_state ?? out.leaseState)) out.lease_state = occupancy;
  return out as T;
}
