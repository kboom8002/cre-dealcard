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
  const header = `### 층별 임대 현황\n| 층수 | 업종 | 전용면적 | 보증금 | 월 임대료 | 관리비 | 임대 만기 |\n|------|------|----------|--------|-----------|--------|-----------|`;
  const rows = leases.map((l) => {
    const tenantLabel =
      l.isVacant ? "🚫 공실"
      : l.tenantType === "office" ? "오피스"
      : l.tenantType === "retail" ? "리테일"
      : l.tenantType === "food" ? "F&B"
      : l.tenantType;

    const areaPyeong = l.areaSqm > 0 ? `${(l.areaSqm / PYEONG_TO_SQM).toFixed(0)}평` : "-";
    const depositStr = l.depositKrw > 0 ? `${Math.round(l.depositKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const rentStr    = l.monthlyRentKrw > 0 ? `${Math.round(l.monthlyRentKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const mgmtStr    = l.mgmtFeeKrw > 0 ? `${Math.round(l.mgmtFeeKrw / MANWON_TO_WON).toLocaleString()}만` : "-";

    return `| ${l.floor} | ${tenantLabel} | ${areaPyeong} | ${depositStr} | ${rentStr} | ${mgmtStr} | ${l.leaseEnd || "미정"} |`;
  });
  return `${header}\n${rows.join("\n")}`;
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
