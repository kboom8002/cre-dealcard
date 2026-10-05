// src/domain/building/mobile-im/lease-adapter.ts
// [A5] FloorLeaseInput 어댑터 패턴
//
// 문제: types.ts는 만원/평 단위 (deposit_manwon, rent_manwon, area_pyeong) 정의하지만
//       writer.ts:L619는 원/㎡ 단위 (deposit, monthly_rent, area_sqm) 접근하여 타입 불일치 발생
//
// 해결: 단위 정규화 어댑터를 도입하여 데이터 계층과 렌더링 계층을 분리

import type { FloorLeaseInput } from "./types";
import { createServiceClient } from '@/lib/supabase/service';
import { pyeongToSqm, formatPyeong } from '@/lib/utils/area-conversion';
import { resolveLeaseOccupancy } from './lease-vacancy';

export interface NormalizedLease {
  floor: string;
  tenantType: string;
  /** 임차인 상호 (렌트롤 실명 — D1: IM 은 실명 표기). 미기재면 undefined */
  tenantName?: string;
  /** 전용면적 ㎡ (area_pyeong × 3.30578) */
  areaSqm: number;
  /** 보증금 원 (deposit_manwon × 10,000) */
  depositKrw: number;
  /** 월 임대료 원 (rent_manwon × 10,000) */
  monthlyRentKrw: number;
  /** 관리비 원 (mgmt_fee_manwon × 10,000) */
  mgmtFeeKrw: number;
  leaseStart: string;
  leaseEnd: string;
  isVacant: boolean;
  /** 자가사용 호실 (공실 아님, 공실률 분모 제외) */
  isOwnerUse?: boolean;
  note?: string;
}

const MANWON_TO_WON = 10_000;

/**
 * FloorLeaseInput (만원/평 단위) → NormalizedLease (원/㎡ 단위)
 *
 * legacy 필드 (deposit, monthly_rent, area_sqm) 와 표준 필드 (deposit_manwon 등) 모두 지원.
 * 표준 필드(만원/평)를 우선으로 사용하고, 없을 경우 legacy 필드로 폴백.
 */
export function normalizeFloorLeases(raw: FloorLeaseInput[]): NormalizedLease[] {
  return raw.map((r) => {
    // 면적: area_pyeong(평) 우선 → 없으면 area_sqm 그대로
    const legacyArea = (r as any).area_sqm;
    const areaSqm =
      r.area_pyeong != null
        ? pyeongToSqm(r.area_pyeong)
        : typeof legacyArea === "number"
        ? legacyArea
        : 0;

    // 보증금: deposit_manwon(만원) 우선 → 없으면 legacy deposit(원)
    const legacyDeposit = (r as any).deposit;
    const depositKrw =
      r.deposit_manwon != null
        ? r.deposit_manwon * MANWON_TO_WON
        : typeof legacyDeposit === "number"
        ? legacyDeposit
        : 0;

    // 월 임대료: rent_manwon(만원) 우선 → 없으면 legacy monthly_rent(원)
    const legacyRent = (r as any).monthly_rent;
    const monthlyRentKrw =
      r.rent_manwon != null
        ? r.rent_manwon * MANWON_TO_WON
        : typeof legacyRent === "number"
        ? legacyRent
        : 0;

    // 관리비: mgmt_fee_manwon(만원) 우선 → 없으면 0
    const mgmtFeeKrw = r.mgmt_fee_manwon != null ? r.mgmt_fee_manwon * MANWON_TO_WON : 0;

    // 임대 만료일: lease_end 우선 → legacy contract_end
    const leaseEnd = r.lease_end ?? (r as any).contract_end ?? "";

    // 점유 상태는 lease-vacancy SSOT 로 판정 — 자가사용·통합계약 후행(월세 0)을 공실로 오표기하지 않는다
    const occupancy = resolveLeaseOccupancy(r as any);
    const tenantName = String((r as any).tenant_name ?? (r as any).tenantName ?? '').trim();

    return {
      floor:          r.floor ?? "-",
      tenantType:     r.tenant_type ?? "미분류",
      tenantName:     tenantName || undefined,
      areaSqm,
      depositKrw,
      monthlyRentKrw,
      mgmtFeeKrw,
      leaseStart:     r.lease_start ?? "",
      leaseEnd,
      isVacant:       occupancy === '공실',
      isOwnerUse:     occupancy === '자가사용',
      note:           r.note,
    };
  });
}

/**
 * NormalizedLease 배열을 Rent Roll 마크다운 테이블로 변환
 */
export function formatRentRollMarkdown(leases: NormalizedLease[]): string {
  if (!leases || leases.length === 0) return '';
  // D1: 렌트롤에 임차인 상호가 하나라도 있으면 '임차인' 열을 추가해 실명을 그대로 표기 (없으면 기존 열 구성 유지 — 날조 금지)
  const hasTenantNames = leases.some((l) => !l.isVacant && !!l.tenantName);
  const header = hasTenantNames
    ? `### 층별 임대 현황\n| 층수 | 임차인 | 업종 | 전용면적 | 보증금 | 월 임대료 | 관리비 | 임대 만기 |\n|------|--------|------|----------|--------|-----------|--------|-----------|`
    : `### 층별 임대 현황\n| 층수 | 업종 | 전용면적 | 보증금 | 월 임대료 | 관리비 | 임대 만기 |\n|------|------|----------|--------|-----------|--------|-----------|`;
  const rows = leases.map((l) => {
    const tenantLabel =
      l.isVacant ? "🚫 공실"
      : l.tenantType === "office" ? "오피스"
      : l.tenantType === "retail" ? "리테일"
      : l.tenantType === "food" ? "F&B"
      : l.tenantType || "근생/업무";

    const areaPyeong = l.areaSqm > 0 ? `${formatPyeong(l.areaSqm, 0)}평` : "-";
    const depositStr = l.depositKrw > 0 ? `${Math.round(l.depositKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const rentStr    = l.monthlyRentKrw > 0 ? `${Math.round(l.monthlyRentKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const mgmtStr    = l.mgmtFeeKrw > 0 ? `${Math.round(l.mgmtFeeKrw / MANWON_TO_WON).toLocaleString()}만` : "-";

    const nameCell = l.isVacant ? '-' : (l.tenantName || '-');
    return hasTenantNames
      ? `| ${l.floor} | ${nameCell} | ${tenantLabel} | ${areaPyeong} | ${depositStr} | ${rentStr} | ${mgmtStr} | ${l.leaseEnd || "미정"} |`
      : `| ${l.floor} | ${tenantLabel} | ${areaPyeong} | ${depositStr} | ${rentStr} | ${mgmtStr} | ${l.leaseEnd || "미정"} |`;
  });
  return `${header}\n${rows.join("\n")}`;
}

/**
 * NormalizedLease 배열로부터 종합 임대 현황 요약 마크다운 테이블 생성
 */
export function formatRentRollSummary(leases: NormalizedLease[]): string {
  if (!leases || leases.length === 0) return '';
  const totalUnits = leases.length;
  const ownerOccupiedUnits = leases.filter(l =>
    l.isOwnerUse === true || l.tenantType === '자가사용' || (l.note && l.note.includes('자가사용'))
  ).length;
  const vacantUnits = leases.filter(l => l.isVacant).length;
  const leasableUnits = Math.max(1, totalUnits - ownerOccupiedUnits);
  const leasedUnits = Math.max(0, leasableUnits - vacantUnits);
  const vacancyRate = ((vacantUnits / leasableUnits) * 100).toFixed(1);

  const totalDeposit = leases.reduce((sum, l) => sum + (l.depositKrw || 0), 0);
  const totalMonthlyRent = leases.reduce((sum, l) => sum + (l.monthlyRentKrw || 0), 0);
  const totalMgmtFee = leases.reduce((sum, l) => sum + (l.mgmtFeeKrw || 0), 0);
  const annualRent = totalMonthlyRent * 12;

  const depositManwon = Math.round(totalDeposit / MANWON_TO_WON);
  const depositStr = depositManwon >= 10000 ? `약 ${(depositManwon / 10000).toFixed(1)}억 원` : `${depositManwon.toLocaleString()}만 원`;
  const monthlyRentManwon = Math.round(totalMonthlyRent / MANWON_TO_WON);
  const monthlyRentStr = monthlyRentManwon >= 10000 ? `약 ${(monthlyRentManwon / 10000).toFixed(1)}억 원/월` : `${monthlyRentManwon.toLocaleString()}만 원/월`;
  const annualRentManwon = Math.round(annualRent / MANWON_TO_WON);
  const annualRentStr = annualRentManwon >= 10000 ? `약 ${(annualRentManwon / 10000).toFixed(1)}억 원/년` : `${annualRentManwon.toLocaleString()}만 원/년`;

  const breakdownStr = ownerOccupiedUnits > 0
    ? `임대중 ${leasedUnits} · 자가사용 ${ownerOccupiedUnits} · 공실 ${vacantUnits}`
    : `임대중 ${leasedUnits} · 공실 ${vacantUnits}`;

  return `### 임대차 종합 요약
| 구분 | 지표 분석 | 비고 |
|------|-----------|------|
| **공실 현황** | ${vacancyRate}% (${breakdownStr}) | ${vacantUnits > 0 ? `공실 ${vacantUnits}실` : (ownerOccupiedUnits > 0 ? '자가사용 포함 가동 중' : '전 층 만실 운영')} |
| **월 임대료 합계** | ${monthlyRentStr} | 관리비 별도 (${Math.round(totalMgmtFee / MANWON_TO_WON).toLocaleString()}만 원) |
| **연 임대 수입** | ${annualRentStr} | 연간 총 임대료 수입 |
| **보증금 총액** | ${depositStr} | 임차인 보증금 합계 |`;
}

export interface LeaseUnitPersistInput {
  floor: string;
  tenant_sector?: string;
  area_pyung?: number;
  /** 임대면적 ㎡ — 있으면 area_pyung 환산보다 우선 (평↔㎡ 왕복 반올림 오차 방지) */
  lease_area_sqm?: number;
  /** 전용면적 ㎡ (lease_ledger.exclusive_area_sqm) */
  exclusive_area_sqm?: number;
  deposit_krw?: number;
  monthly_rent_krw?: number;
  mgmt_fee_krw?: number;
  lease_start?: string;
  lease_end?: string;
  /** 계약그룹 — 같은 값이면 하나의 통합계약 */
  contract_group?: string;
  legal_basis?: '상가' | '주택' | '미확인';
  first_contract_date?: string;
  renewal_exercised?: '있음' | '없음' | '모름';
  opposing_power?: '사업자등록' | '주민등록' | '미확인';
  lease_state?: '임대중' | '공실' | '자가사용';
  note?: string;
  source_tier?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LEASE_STATES = ['임대중', '공실', '자가사용'] as const;
const LEGAL_BASES = ['상가', '주택', '미확인'] as const;
const RENEWALS = ['있음', '없음', '모름'] as const;
const OPPOSING = ['사업자등록', '주민등록', '미확인'] as const;

const pickEnum = <T extends string>(allowed: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const positiveSqm = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? parseFloat(n.toFixed(2)) : null;
};

/**
 * 호실 입력 → lease_ledger 행 (순수 함수, DB 접근 없음).
 * - DATE/CHECK 컬럼은 허용값만 통과시켜 한 행의 오염이 일괄 upsert 전체를 실패시키지 않게 한다.
 * - 같은 unit_label 이 반복되면 "(2)", "(3)" 접미사로 구분한다 (충돌키가 (asset_id, unit_label) 이므로).
 */
export function buildLeaseLedgerRows(
  assetId: string,
  units: LeaseUnitPersistInput[],
  buildingId?: string,
): Array<Record<string, unknown>> {
  const seen = new Map<string, number>();
  return units.map((unit) => {
    const base = String(unit.floor ?? '-').trim() || '-';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const label = n === 1 ? base : `${base} (${n})`;

    const leaseSqm = positiveSqm(unit.lease_area_sqm)
      ?? (unit.area_pyung ? parseFloat(pyeongToSqm(unit.area_pyung).toFixed(2)) : null);

    return {
      building_id: buildingId || null,
      asset_id: assetId,
      unit_label: label,
      contract_group: unit.contract_group?.trim() || null,
      lease_area_sqm: leaseSqm,
      exclusive_area_sqm: positiveSqm(unit.exclusive_area_sqm),
      tenant_business: unit.tenant_sector || null,
      legal_basis: pickEnum(LEGAL_BASES, unit.legal_basis),
      deposit_krw: unit.deposit_krw || null,
      monthly_rent_krw: unit.monthly_rent_krw || null,
      mgmt_fee_krw: unit.mgmt_fee_krw || 0,
      first_contract_date: unit.first_contract_date && ISO_DATE.test(unit.first_contract_date) ? unit.first_contract_date : null,
      current_start_date: unit.lease_start && ISO_DATE.test(unit.lease_start) ? unit.lease_start : null,
      current_expiry_date: unit.lease_end && ISO_DATE.test(unit.lease_end) ? unit.lease_end : null,
      renewal_exercised: pickEnum(RENEWALS, unit.renewal_exercised),
      opposing_power: pickEnum(OPPOSING, unit.opposing_power),
      lease_state:
        pickEnum(LEASE_STATES, unit.lease_state) ?? (unit.tenant_sector?.includes('공실') ? '공실' : '임대중'),
      note: unit.note || null,
      source_tier: unit.source_tier || 'broker_input',
      updated_at: new Date().toISOString(),
    };
  });
}

/**
 * Persists normalized lease units to the lease_ledger database table (Phase 2).
 * Supports dual write to legacy lease_units table if LEASE_TABLE=legacy_dual.
 *
 * 충돌키는 (asset_id, unit_label) — 호출부는 building_ssot_lite id 를 asset_id 로 넘기며
 * lease_ledger.building_id(FK → buildings) 는 채우지 않는다. 마이그레이션
 * 20261005000000_lease_ledger_exclusive_area.sql 이 비-부분(unique) 인덱스를 제공해야 upsert 가 동작한다.
 * 이번 제출에 없는 호실은 렌트롤이 교체된 것으로 보고 같은 asset_id 에서 삭제한다.
 * @see SDD S2-T11
 */
export async function persistLeaseUnits(
  assetId: string,
  units: LeaseUnitPersistInput[],
  buildingId?: string,
): Promise<{ inserted: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let ledgerWritten = 0;
  let dualInserted = 0;
  const isDualMode = process.env.LEASE_TABLE === 'legacy_dual';

  // 1. Primary: lease_ledger 일괄 upsert
  const rows = buildLeaseLedgerRows(assetId, units, buildingId);
  if (rows.length > 0) {
    try {
      const { error: ledgerError } = await supabase
        .from('lease_ledger')
        .upsert(rows, { onConflict: 'asset_id,unit_label' });

      if (ledgerError) {
        errors.push(`lease_ledger: ${ledgerError.message}`);
        log.warn(`[lease-adapter] lease_ledger write failed: ${ledgerError.message}`);
      } else {
        ledgerWritten = rows.length;
        // 이번 제출에 없는 호실 정리 (PostgREST in-list: 따옴표/백슬래시 이스케이프)
        const keep = rows
          .map((r) => `"${String(r.unit_label).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
          .join(',');
        const { error: pruneError } = await supabase
          .from('lease_ledger')
          .delete()
          .eq('asset_id', assetId)
          .not('unit_label', 'in', `(${keep})`);
        if (pruneError) log.warn(`[lease-adapter] lease_ledger prune warning: ${pruneError.message}`);
      }
    } catch (e) {
      errors.push('lease_ledger: unexpected error');
      log.warn(`[lease-adapter] lease_ledger upsert warning:`, e);
    }
  }

  // 2. Legacy / Dual mode support — LEASE_TABLE=legacy_dual일 때만 구 테이블 동시 쓰기
  if (isDualMode) {
    for (const unit of units) {
      const { error } = await supabase
        .from('lease_units')
        .upsert({
          asset_id: assetId,
          floor: unit.floor,
          tenant_sector: unit.tenant_sector || null,
          area_pyung: unit.area_pyung || null,
          deposit_krw: unit.deposit_krw || null,
          monthly_rent_krw: unit.monthly_rent_krw || null,
          mgmt_fee_krw: unit.mgmt_fee_krw || 0,
          lease_start: unit.lease_start || null,
          lease_end: unit.lease_end || null,
          source_tier: unit.source_tier || 'broker_input',
        }, { onConflict: 'asset_id,floor' });

      if (error) {
        errors.push(`Floor ${unit.floor}: ${error.message}`);
      } else {
        dualInserted++;
      }
    }
  }

  return { inserted: Math.max(ledgerWritten, dualInserted), errors };
}

// ── AUTH-04: T-C/T-R 법령 분기 통합 ──────────────────────────────────────

import { dispatchTenancy, type TenancyResult } from '@/domain/ontology';
import type { AssetIdentity } from './types';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('lease-adapter');


/** 호실별 법령 분기 결과 */
export interface LeaseLegalDispatch {
  floor: string;
  regime: 'T-C' | 'T-R';
  maxTerm: number;
  renewalRight: boolean | 'unknown';
  note: string;
}

/** 물건의 혼합 용도 여부 */
export interface MixedUseResult {
  isMixed: boolean;
  dispatches: LeaseLegalDispatch[];
  conservativeRegime: 'T-C' | 'T-R';
}

/**
 * AUTH-04: buildingUse 기반 임대차 법령 자동 분기
 * - 상가 → T-C (상임법 10년)
 * - 주거 → T-R (주임법 4년)
 * - 혼합 → 호실별 분기 + 보수적 적용 (AUTH-04.1)
 */
export function adaptLeases(
  units: Array<{ floor: string; buildingUse?: string; renewalRight?: boolean | 'unknown' }>,
  identity?: AssetIdentity,
): MixedUseResult {
  const dispatches: LeaseLegalDispatch[] = units.map(u => {
    const use = u.buildingUse ?? identity?.buildingUse ?? 'commercial';
    const isResidential = use === 'residential' || use === 'multi_family' || use === 'officetel_residential';
    const regime = isResidential ? 'T-R' as const : 'T-C' as const;
    
    // AUTH-04.2: 갱신요구권 "모름" → '확인 필요'
    const renewalRight = u.renewalRight ?? 'unknown';
    const note = renewalRight === 'unknown' 
      ? '갱신요구권 확인 필요 (AUTH-04.2)'
      : '';

    return {
      floor: u.floor,
      regime,
      maxTerm: regime === 'T-R' ? 4 : 10,
      renewalRight,
      note,
    };
  });

  const regimes = new Set(dispatches.map(d => d.regime));
  const isMixed = regimes.size > 1;

  // AUTH-04.1: 모호한 경우 주택(4년) 보수적 적용
  const conservativeRegime = isMixed ? 'T-R' as const : (dispatches[0]?.regime ?? 'T-C');

  return { isMixed, dispatches, conservativeRegime };
}

// ── Development Posture: 명도 분석 ──

export interface EvictionAnalysis {
  /** 명도 대상 임차인 수 */
  totalTenants: number;
  /** 보증금 반환 총액 (원) */
  depositRefundKrw: number;
  /** 예상 명도 비용 (원) — 이사비 + 영업권/권리금 보상 추정 */
  estimatedEvictionCostKrw: number;
  /** 최장 만기일 */
  latestLeaseEnd: string | null;
  /** 예상 명도 완료 소요 기간 (월) */
  estimatedMonths: number;
  /** 명도 난이도 */
  frictionScore: 'low' | 'medium' | 'high';
}

/**
 * 개발형(development) 물건의 기존 임차인 명도 비용 및 일정 분석
 */
export function analyzeEviction(leases: NormalizedLease[]): EvictionAnalysis {
  const activeTenants = leases.filter(l => !l.isVacant);
  const totalTenants = activeTenants.length;
  const depositRefundKrw = activeTenants.reduce((sum, l) => sum + (l.depositKrw || 0), 0);

  // 예상 명도비: 세대당 이사비(300만원) + 예상 합의금/영업보상(월세 6개월분)
  const movingCost = totalTenants * 3_000_000;
  const keyMoneyCompensation = activeTenants.reduce((sum, l) => sum + ((l.monthlyRentKrw || 0) * 6), 0);
  const estimatedEvictionCostKrw = movingCost + keyMoneyCompensation;

  // 최장 만기일 찾기
  let latestLeaseEnd: string | null = null;
  for (const t of activeTenants) {
    if (t.leaseEnd && (!latestLeaseEnd || t.leaseEnd > latestLeaseEnd)) {
      latestLeaseEnd = t.leaseEnd;
    }
  }

  // 소요 기간 추정: 임차인 수 및 만기 기준 (기본 6~12개월)
  let estimatedMonths = totalTenants <= 2 ? 6 : totalTenants <= 5 ? 9 : 12;
  if (latestLeaseEnd) {
    const endDate = new Date(latestLeaseEnd);
    const now = new Date();
    const diffMonths = Math.max(0, Math.round((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    estimatedMonths = Math.max(estimatedMonths, diffMonths + 3);
  }

  const frictionScore: 'low' | 'medium' | 'high' =
    totalTenants === 0 ? 'low' : totalTenants <= 3 ? 'medium' : 'high';

  return {
    totalTenants,
    depositRefundKrw,
    estimatedEvictionCostKrw,
    latestLeaseEnd,
    estimatedMonths,
    frictionScore,
  };
}

/**
 * 명도 현황을 개발형 IM 전용 마크다운 테이블로 변환
 */
export function formatEvictionMarkdown(analysis: EvictionAnalysis): string {
  const depositBil = (analysis.depositRefundKrw / 1e8).toFixed(1);
  const evictionCostBil = (analysis.estimatedEvictionCostKrw / 1e8).toFixed(2);
  const frictionLabel =
    analysis.frictionScore === 'low' ? '🟢 용이 (공실/단순)'
    : analysis.frictionScore === 'medium' ? '🟡 보통 (협의 필요)'
    : '🔴 난이도 높음 (다수 임차인)';

  return `### 명도 및 철거 준비 현황
| 항목 | 분석 내용 | 비고 |
|------|-----------|------|
| **명도 대상 임차인** | **${analysis.totalTenants}세대** | 기존 점유자 |
| **반환 필요 보증금** | **약 ${depositBil}억 원** | 착공 전 즉시 유출 |
| **예상 명도 보상 비용** | **약 ${evictionCostBil}억 원** | 이사비 + 영업합의금 추정 |
| **명도 완료 예상 기간** | **약 ${analysis.estimatedMonths}개월** | 최장 만기일: ${analysis.latestLeaseEnd || '미정'} |
| **명도 난이도 평가** | ${frictionLabel} | 종합 리스크 |`;
}
