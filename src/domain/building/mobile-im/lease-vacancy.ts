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

  if (state === '자가사용' || OWNER_USE_RE.test(ownerUseText(l))) return '자가사용';
  if (state === '공실' || VACANT_RE.test(vacancyText(l))) return '공실';

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

export interface LeaseOccupancySummary {
  total: number;
  leased: number;
  vacant: number;
  ownerUse: number;
  /** 공실률 % (소수 1자리) — 분모는 자가사용 제외 임대 가능 호실. 임대 가능 호실이 0이면 null */
  vacancyPct: number | null;
  vacantFloors: string[];
}

export function summarizeLeaseOccupancy(leases: ReadonlyArray<LeaseLike> | null | undefined): LeaseOccupancySummary {
  const rows = (Array.isArray(leases) ? leases : []).filter(Boolean) as Record<string, any>[];
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
