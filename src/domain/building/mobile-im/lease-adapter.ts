// src/domain/building/mobile-im/lease-adapter.ts
// [A5] FloorLeaseInput 어댑터 패턴
//
// 문제: types.ts는 만원/평 단위 (deposit_manwon, rent_manwon, area_pyeong) 정의하지만
//       writer.ts:L619는 원/㎡ 단위 (deposit, monthly_rent, area_sqm) 접근하여 타입 불일치 발생
//
// 해결: 단위 정규화 어댑터를 도입하여 데이터 계층과 렌더링 계층을 분리

import type { FloorLeaseInput } from "./types";
import { createServiceClient } from '@/lib/supabase/service';

export interface NormalizedLease {
  floor: string;
  tenantType: string;
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
  note?: string;
}

const PYEONG_TO_SQM = 3.30578;
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
        ? r.area_pyeong * PYEONG_TO_SQM
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

    return {
      floor:          r.floor ?? "-",
      tenantType:     r.tenant_type ?? "미분류",
      areaSqm,
      depositKrw,
      monthlyRentKrw,
      mgmtFeeKrw,
      leaseStart:     r.lease_start ?? "",
      leaseEnd,
      isVacant:       r.is_vacant ?? false,
      note:           r.note,
    };
  });
}

/**
 * NormalizedLease 배열을 Rent Roll 마크다운 테이블로 변환
 */
export function formatRentRollMarkdown(leases: NormalizedLease[]): string {
  if (!leases || leases.length === 0) return '';
  const header = `### 층별 임대 현황\n| 층수 | 업종 | 전용면적 | 보증금 | 월 임대료 | 관리비 | 임대 만기 |\n|------|------|----------|--------|-----------|--------|-----------|`;
  const rows = leases.map((l) => {
    const tenantLabel =
      l.isVacant ? "🚫 공실"
      : l.tenantType === "office" ? "오피스"
      : l.tenantType === "retail" ? "리테일"
      : l.tenantType === "food" ? "F&B"
      : l.tenantType || "근생/업무";

    const areaPyeong = l.areaSqm > 0 ? `${(l.areaSqm / PYEONG_TO_SQM).toFixed(0)}평` : "-";
    const depositStr = l.depositKrw > 0 ? `${Math.round(l.depositKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const rentStr    = l.monthlyRentKrw > 0 ? `${Math.round(l.monthlyRentKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const mgmtStr    = l.mgmtFeeKrw > 0 ? `${Math.round(l.mgmtFeeKrw / MANWON_TO_WON).toLocaleString()}만` : "-";

    return `| ${l.floor} | ${tenantLabel} | ${areaPyeong} | ${depositStr} | ${rentStr} | ${mgmtStr} | ${l.leaseEnd || "미정"} |`;
  });
  return `${header}\n${rows.join("\n")}`;
}

/**
 * NormalizedLease 배열로부터 종합 임대 현황 요약 마크다운 테이블 생성
 */
export function formatRentRollSummary(leases: NormalizedLease[]): string {
  if (!leases || leases.length === 0) return '';
  const totalUnits = leases.length;
  const vacantUnits = leases.filter(l => l.isVacant).length;
  const vacancyRate = totalUnits > 0 ? ((vacantUnits / totalUnits) * 100).toFixed(1) : '0.0';
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

  return `### 임대차 종합 요약
| 구분 | 지표 분석 | 비고 |
|------|-----------|------|
| **공실 현황** | ${vacancyRate}% (${totalUnits - vacantUnits}개 호실 임대 중 / 총 ${totalUnits}실) | 공실 ${vacantUnits}실 |
| **월 임대료 합계** | ${monthlyRentStr} | 관리비 별도 (${Math.round(totalMgmtFee / MANWON_TO_WON).toLocaleString()}만 원) |
| **연 임대 수입** | ${annualRentStr} | 연간 총 임대료 수입 |
| **보증금 총액** | ${depositStr} | 임차인 보증금 합계 |
| **임차인 정보** | 실사 및 NDA 체결 후 상세 제공 | 개인정보 보호 처리 |`;
}

/**
 * Persists normalized lease units to the lease_units database table.
 * Upserts based on asset_id + floor combination.
 * @see SDD S2-T11
 */
export async function persistLeaseUnits(
  assetId: string,
  units: Array<{
    floor: string;
    tenant_sector?: string;
    area_pyung?: number;
    deposit_krw?: number;
    monthly_rent_krw?: number;
    mgmt_fee_krw?: number;
    lease_start?: string;
    lease_end?: string;
    source_tier?: string;
  }>
): Promise<{ inserted: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let inserted = 0;

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
      inserted++;
    }
  }

  return { inserted, errors };
}

// ── AUTH-04: T-C/T-R 법령 분기 통합 ──────────────────────────────────────

import { dispatchTenancy, type TenancyResult } from '@/domain/ontology';
import type { AssetIdentity } from './types';

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
