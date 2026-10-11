// src/domain/building/mobile-im/lease-adapter.ts
// [A5] FloorLeaseInput 어댑터 패턴
//
// 문제: types.ts는 만원/평 단위 (deposit_manwon, rent_manwon, area_pyeong) 정의하지만
//       writer.ts:L619는 원/㎡ 단위 (deposit, monthly_rent, area_sqm) 접근하여 타입 불일치 발생
//
// 해결: 단위 정규화 어댑터를 도입하여 데이터 계층과 렌더링 계층을 분리

import type { FloorLeaseInput } from "./types";
// createServiceClient 는 persistLeaseUnits 안에서 lazy import (서버 env 검증을 import 시점에 일으키지 않기 위함)
import { pyeongToSqm, formatPyeong, sqmToPyeong } from '@/lib/utils/area-conversion';
import { resolveLeaseOccupancy } from './lease-vacancy';
import { EVIDENCE_LEVELS, PAYMENT_STATUSES, areaUnitLabel, resolveAreaInputUnit, type AreaInputUnit, type RentRollMeta } from './rentroll-meta';
import { formatLeaseAreaCell } from './lease-area-cell';
import { groupContracts, resolveEvaluationDate } from './lease-math';

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
  /** 임대면적 ㎡ 가 레거시 단일 '전용면적' 열 대용값(area_sqm_is_proxy)이면 true — 표에 임대면적으로 표기하지 않는다 */
  areaIsProxy?: boolean;
  /** 전용면적 ㎡ 정본 (v1.4+ D열). 없으면 undefined — 임대면적으로 대체하지 않는다 */
  exclusiveAreaSqm?: number;
  /** 계약그룹 (통합계약 — 같은 값이면 하나의 계약) */
  contractGroup?: string;
  /** v1.4 AA — 렌트프리 잔여(개월, 정수 ≥ 0) */
  rentFreeMonths?: number;
  /** v1.4 AB — 입금 확인 (정상/연체/미확인) */
  paymentStatus?: string;
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

    const exclusiveRaw = Number((r as any).exclusive_area_sqm);
    const contractGroup = String((r as any).contract_group ?? (r as any).contractGroup ?? '').trim();
    const rentFreeRaw = (r as any).rent_free_months;
    const paymentStatus = (r as any).payment_status;

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
      ...((r as any).area_sqm_is_proxy ? { areaIsProxy: true } : {}),
      ...(Number.isFinite(exclusiveRaw) && exclusiveRaw > 0 ? { exclusiveAreaSqm: exclusiveRaw } : {}),
      ...(contractGroup ? { contractGroup } : {}),
      ...(typeof rentFreeRaw === 'number' && Number.isFinite(rentFreeRaw) && rentFreeRaw > 0 ? { rentFreeMonths: Math.round(rentFreeRaw) } : {}),
      ...(typeof paymentStatus === 'string' && paymentStatus ? { paymentStatus } : {}),
    };
  });
}

/**
 * 렌트롤 비고 — 신규 필드(v1.4 AA/AB)에서 사실만 표기. 값이 없으면 빈 문자열 (지어내지 않는다).
 *  - 렌트프리 N개월 / 입금 연체 / 입금 미확인 (정상은 표기하지 않음)
 */
export function resolveRentRollNote(l: NormalizedLease): string {
  const parts: string[] = [];
  if (!l.isVacant && typeof l.rentFreeMonths === 'number' && l.rentFreeMonths > 0) parts.push(`렌트프리 ${l.rentFreeMonths}개월`);
  if (!l.isVacant && l.paymentStatus === '연체') parts.push('입금 연체');
  else if (!l.isVacant && l.paymentStatus === '미확인') parts.push('입금 미확인');
  return parts.join(', ');
}

/**
 * NormalizedLease 배열을 Rent Roll 마크다운 테이블로 변환
 *
 * v1.5 §9.1: 면적 열은 입력 단위(㎡|평) 단일 단위 — 머리글 '임대면적(㎡)'/'임대면적(평)', 값은 ㎡ 정본 → 입력 단위(소수 2자리).
 * 전용면적은 값이 있는 호실이 하나라도 있을 때만 '전용면적(단위)' 열을 추가한다 (임대면적으로 대체하지 않음).
 * 렌트프리/입금 상태는 해당 사실이 있을 때만 '비고' 열에 표기한다.
 * @param unitOrMeta 'sqm'|'pyeong' 또는 rent_roll_meta({area_input_unit}) — 없으면 ㎡
 */
export function formatRentRollMarkdown(
  leases: NormalizedLease[],
  unitOrMeta?: AreaInputUnit | { area_input_unit?: unknown } | null,
): string {
  if (!leases || leases.length === 0) return '';
  const unit: AreaInputUnit = typeof unitOrMeta === 'string' ? (unitOrMeta === 'pyeong' ? 'pyeong' : 'sqm') : resolveAreaInputUnit(unitOrMeta);
  const unitText = areaUnitLabel(unit);
  // D1: 렌트롤에 임차인 상호가 하나라도 있으면 '임차인' 열을 추가해 실명을 그대로 표기 (없으면 기존 열 구성 유지 — 날조 금지)
  const hasTenantNames = leases.some((l) => !l.isVacant && !!l.tenantName);
  const hasExclusive = leases.some((l) => typeof l.exclusiveAreaSqm === 'number' && l.exclusiveAreaSqm > 0);
  const hasNotes = leases.some((l) => resolveRentRollNote(l) !== '');

  const cols: string[] = ['층수'];
  if (hasTenantNames) cols.push('임차인');
  cols.push('업종', `임대면적(${unitText})`);
  if (hasExclusive) cols.push(`전용면적(${unitText})`);
  cols.push('보증금', '월 임대료', '관리비', '임대 만기');
  if (hasNotes) cols.push('비고');
  const header = `### 층별 임대 현황\n| ${cols.join(' | ')} |\n|${cols.map(() => '------').join('|')}|`;

  const rows = leases.map((l) => {
    const tenantLabel =
      l.isVacant ? "🚫 공실"
      : l.tenantType === "office" ? "오피스"
      : l.tenantType === "retail" ? "리테일"
      : l.tenantType === "food" ? "F&B"
      : l.tenantType || "근생/업무";

    const leaseArea = formatLeaseAreaCell(l.areaIsProxy ? undefined : l.areaSqm, unit);
    const excArea = formatLeaseAreaCell(l.exclusiveAreaSqm, unit);
    const depositStr = l.depositKrw > 0 ? `${Math.round(l.depositKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const rentStr    = l.monthlyRentKrw > 0 ? `${Math.round(l.monthlyRentKrw / MANWON_TO_WON).toLocaleString()}만` : "-";
    const mgmtStr    = l.mgmtFeeKrw > 0 ? `${Math.round(l.mgmtFeeKrw / MANWON_TO_WON).toLocaleString()}만` : "-";

    const nameCell = l.isVacant ? '-' : (l.tenantName || '-');
    const cells: string[] = [l.floor];
    if (hasTenantNames) cells.push(nameCell);
    cells.push(tenantLabel, leaseArea);
    if (hasExclusive) cells.push(excArea);
    cells.push(depositStr, rentStr, mgmtStr, l.leaseEnd || "미정");
    if (hasNotes) cells.push(resolveRentRollNote(l) || '-');
    return `| ${cells.join(' | ')} |`;
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
  /** v1.4 Z — 근거 (허용값 밖은 null 로 저장) */
  evidence_level?: string | null;
  /** v1.4 AA — 렌트프리 잔여(개월, 정수 ≥ 0) */
  rent_free_months?: number | null;
  /** v1.4 AB — 입금 확인(최근 12개월) */
  payment_status?: string | null;
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
const nonNegativeInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
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
      // X4 / 스펙 §8: 통합계약 비대표 행의 빈 관리비를 0원으로 저장하지 않는다 (null = 미기재). DB DEFAULT 도 제거됨.
      mgmt_fee_krw: unit.mgmt_fee_krw ?? null,
      first_contract_date: unit.first_contract_date && ISO_DATE.test(unit.first_contract_date) ? unit.first_contract_date : null,
      current_start_date: unit.lease_start && ISO_DATE.test(unit.lease_start) ? unit.lease_start : null,
      current_expiry_date: unit.lease_end && ISO_DATE.test(unit.lease_end) ? unit.lease_end : null,
      renewal_exercised: pickEnum(RENEWALS, unit.renewal_exercised),
      opposing_power: pickEnum(OPPOSING, unit.opposing_power),
      lease_state:
        pickEnum(LEASE_STATES, unit.lease_state) ?? (unit.tenant_sector?.includes('공실') ? '공실' : '임대중'),
      note: unit.note || null,
      // v1.4 Z/AA/AB — CHECK 제약과 같은 허용값만 통과 (밖은 null). 추측해서 채우지 않는다.
      evidence_level: pickEnum(EVIDENCE_LEVELS, unit.evidence_level),
      rent_free_months: nonNegativeInt(unit.rent_free_months),
      payment_status: pickEnum(PAYMENT_STATUSES, unit.payment_status),
      source_tier: unit.source_tier || 'broker_input',
      updated_at: new Date().toISOString(),
    };
  });
}

/**
 * 바텀시트/임포터의 floor_leases 행(만원 단위, snake_case) → persistLeaseUnits 입력(원 단위).
 * generate-async 라우트가 쓰던 인라인 매핑을 이곳으로 옮겼다 (동작 동일 + v1.4 필드 contract_group/evidence/렌트프리/입금확인).
 *  - 금액은 truthy 값만 환산한다: 0·빈 값은 undefined → 원장 null (통합계약 비대표 행의 빈 금액을 0원으로 저장하지 않는다, 스펙 §8).
 *  - 레거시 단일 '전용면적' 열에서 복사된 대용 area_sqm(area_sqm_is_proxy)은 임대면적으로 저장하지 않는다.
 */
export function floorLeaseToPersistUnit(fl: any): LeaseUnitPersistInput {
  const occupancy = resolveLeaseOccupancy(fl);
  return {
    floor: fl?.floor,
    tenant_sector: fl?.tenant_type || fl?.tenant_sector || undefined,
    deposit_krw: fl?.deposit_manwon ? Number(fl.deposit_manwon) * 10000 : (fl?.deposit_krw || undefined),
    monthly_rent_krw: fl?.rent_manwon ? Number(fl.rent_manwon) * 10000 : (fl?.monthly_rent_krw || undefined),
    mgmt_fee_krw: fl?.mgmt_fee_manwon ? Number(fl.mgmt_fee_manwon) * 10000 : (fl?.mgmt_fee_krw || undefined),
    area_pyung: fl?.area_pyung || (!fl?.area_sqm_is_proxy && Number(fl?.area_sqm) > 0 ? sqmToPyeong(Number(fl.area_sqm)) : undefined),
    lease_area_sqm: fl?.area_sqm_is_proxy ? undefined : (Number(fl?.area_sqm) > 0 ? Number(fl.area_sqm) : undefined),
    exclusive_area_sqm: Number(fl?.exclusive_area_sqm) > 0 ? Number(fl.exclusive_area_sqm) : undefined,
    contract_group: fl?.contract_group || undefined,
    legal_basis: fl?.legal_basis || undefined,
    first_contract_date: fl?.first_contract_date || undefined,
    renewal_exercised: fl?.renewal_exercised || undefined,
    opposing_power: fl?.opposing_power || undefined,
    // 점유 상태 SSOT: is_vacant 플래그(월세 0 추정 오염 가능)를 그대로 '공실' 로 영속하지 않는다
    lease_state: fl?.lease_state || (occupancy !== '임대중' ? occupancy : undefined),
    note: fl?.note || undefined,
    lease_start: fl?.lease_start || undefined,
    lease_end: fl?.lease_end || undefined,
    evidence_level: fl?.evidence_level ?? undefined,
    rent_free_months: fl?.rent_free_months ?? undefined,
    payment_status: fl?.payment_status ?? undefined,
    source_tier: 'broker_input',
  };
}

const finitePositive = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
};
const trimmedOrNull = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * rent_roll_meta → lease_ledger_meta 행 (순수 함수, DB 접근 없음). 물건(asset_id)당 1행.
 * 환산하지 않는다: gfa_sqm(J4)·market_rent_*(J5~J7)는 입력값 그대로 (스펙 §8).
 */
export function buildLeaseLedgerMetaRow(assetId: string, meta: RentRollMeta): Record<string, unknown> {
  const ov = meta.area_unit_override;
  const at = ov?.at ? new Date(ov.at) : null;
  const other = Number(meta.other_income_krw);
  return {
    asset_id: assetId,
    area_input_unit: resolveAreaInputUnit(meta),
    rentroll_version: trimmedOrNull(meta.rentroll_version, 10),
    rentroll_as_of: meta.rentroll_as_of && ISO_DATE.test(meta.rentroll_as_of) ? meta.rentroll_as_of : null,
    asking_price_krw: finitePositive(meta.asking_price_krw),
    gfa_sqm: positiveSqm(meta.gfa_sqm),
    market_rent_1f: finitePositive(meta.market_rent_1f),
    market_rent_1f_source: trimmedOrNull(meta.market_rent_1f_source, 200),
    market_rent_upper: finitePositive(meta.market_rent_upper),
    market_rent_upper_source: trimmedOrNull(meta.market_rent_upper_source, 200),
    market_rent_basement: finitePositive(meta.market_rent_basement),
    market_rent_basement_source: trimmedOrNull(meta.market_rent_basement_source, 200),
    other_income_krw: meta.other_income_krw != null && Number.isFinite(other) && other >= 0 ? Math.round(other) : null,
    other_income_note: trimmedOrNull(meta.other_income_note, 200),
    area_unit_override_reason: trimmedOrNull(ov?.reason, 200),
    area_unit_override_by: trimmedOrNull(ov?.by, 100),
    area_unit_override_at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

export interface PersistLeaseOptions {
  /** 렌트롤 메타 — 있을 때만 lease_ledger_meta 를 upsert (없으면 기존 메타를 건드리지 않는다) */
  meta?: RentRollMeta | null;
  /**
   * true 면 이번 호출의 모든 행에서 값이 전부 null 인 컬럼은 upsert 페이로드에서 뺀다 →
   * 이 작성자가 모르는 컬럼(계약그룹·전용면적·적용법령·v1.4 필드 등)을 다른 작성자가 저장한 값 위에 null 로 덮어쓰지 않는다.
   * (스튜디오 lease route 처럼 일부 필드만 아는 작성자용)
   */
  sparse?: boolean;
  /** 지정하면 prune 을 이 source_tier 의 행으로 한정한다 (다른 작성자가 만든 행을 지우지 않는다) */
  pruneSourceTier?: string;
}

const NEW_LEDGER_COLUMNS = ['evidence_level', 'rent_free_months', 'payment_status'] as const;
/** 마이그레이션 20261011000000 미적용 DB 에서 새 컬럼 때문에 원장 전체 쓰기가 실패하지 않도록 판별 */
const mentionsNewLedgerColumn = (msg: string): boolean => NEW_LEDGER_COLUMNS.some((c) => msg.includes(c));

function omitKeys(rows: Array<Record<string, unknown>>, keys: readonly string[]): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const next = { ...r };
    for (const k of keys) delete next[k];
    return next;
  });
}

function toSparseRows(rows: Array<Record<string, unknown>>, units: LeaseUnitPersistInput[]): Array<Record<string, unknown>> {
  if (rows.length === 0) return rows;
  const always = new Set(['asset_id', 'unit_label', 'updated_at', 'source_tier']);
  const explicitState = units.some((u) => pickEnum(LEASE_STATES, u.lease_state) != null);
  const keys = Object.keys(rows[0]).filter((k) => {
    if (always.has(k)) return true;
    if (k === 'lease_state') return explicitState; // 기본값('임대중')이 다른 작성자의 '자가사용'/'공실'을 덮지 않게
    return rows.some((r) => r[k] !== null && r[k] !== undefined);
  });
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
}

/**
 * Persists normalized lease units to the lease_ledger database table (Phase 2).
 * Supports dual write to legacy lease_units table if LEASE_TABLE=legacy_dual.
 *
 * 충돌키는 (asset_id, unit_label) — 호출부는 building_ssot_lite id 를 asset_id 로 넘기며
 * lease_ledger.building_id(FK → buildings) 는 채우지 않는다. 마이그레이션
 * 20261005000000_lease_ledger_exclusive_area.sql 이 비-부분(unique) 인덱스를 제공해야 upsert 가 동작한다.
 * 이번 제출에 없는 호실은 렌트롤이 교체된 것으로 보고 같은 asset_id 에서 삭제한다
 * (opts.pruneSourceTier 지정 시 해당 source_tier 행만 — 두 작성자 간 prune 충돌 방지).
 * opts.meta 가 있으면 물건 단위 메타(lease_ledger_meta: G9 면적 입력 단위·C5·J3~J8·V12 해제 기록)도 upsert 한다.
 * @see SDD S2-T11
 */
export async function persistLeaseUnits(
  assetId: string,
  units: LeaseUnitPersistInput[],
  buildingId?: string,
  opts?: PersistLeaseOptions,
): Promise<{ inserted: number; errors: string[] }> {
  const { createServiceClient } = await import('@/lib/supabase/service'); // lazy: 순수 헬퍼만 쓰는 PPTX/오프라인 경로에서 서버 env 검증이 import 시점에 터지지 않도록
  const supabase = createServiceClient();
  const errors: string[] = [];
  let ledgerWritten = 0;
  let dualInserted = 0;
  const isDualMode = process.env.LEASE_TABLE === 'legacy_dual';

  // 1. Primary: lease_ledger 일괄 upsert
  let rows = buildLeaseLedgerRows(assetId, units, buildingId);
  if (opts?.sparse) rows = toSparseRows(rows, units);
  if (rows.length > 0) {
    try {
      let { error: ledgerError } = await supabase
        .from('lease_ledger')
        .upsert(rows, { onConflict: 'asset_id,unit_label' });

      // 마이그레이션(20261011000000) 적용 전 DB: 새 컬럼 없이 재시도 (기존 쓰기가 회귀하지 않도록)
      if (ledgerError && mentionsNewLedgerColumn(ledgerError.message ?? '')) {
        log.warn(`[lease-adapter] 새 컬럼 미적용 DB — v1.4 컬럼을 빼고 재시도: ${ledgerError.message}`);
        rows = omitKeys(rows, NEW_LEDGER_COLUMNS);
        ({ error: ledgerError } = await supabase
          .from('lease_ledger')
          .upsert(rows, { onConflict: 'asset_id,unit_label' }));
      }

      if (ledgerError) {
        errors.push(`lease_ledger: ${ledgerError.message}`);
        log.warn(`[lease-adapter] lease_ledger write failed: ${ledgerError.message}`);
      } else {
        ledgerWritten = rows.length;
        // 이번 제출에 없는 호실 정리 (PostgREST in-list: 따옴표/백슬래시 이스케이프)
        const keep = rows
          .map((r) => `"${String(r.unit_label).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
          .join(',');
        let prune = supabase
          .from('lease_ledger')
          .delete()
          .eq('asset_id', assetId);
        if (opts?.pruneSourceTier) prune = prune.eq('source_tier', opts.pruneSourceTier);
        const { error: pruneError } = await prune.not('unit_label', 'in', `(${keep})`);
        if (pruneError) log.warn(`[lease-adapter] lease_ledger prune warning: ${pruneError.message}`);
      }
    } catch (e) {
      errors.push('lease_ledger: unexpected error');
      log.warn(`[lease-adapter] lease_ledger upsert warning:`, e);
    }
  }

  // 1-b. 물건 단위 메타 (G9 면적 입력 단위 등) — 실패해도 호실 저장은 유지 (비차단)
  if (opts?.meta) {
    try {
      const { error: metaError } = await supabase
        .from('lease_ledger_meta')
        .upsert(buildLeaseLedgerMetaRow(assetId, opts.meta), { onConflict: 'asset_id' });
      if (metaError) {
        errors.push(`lease_ledger_meta: ${metaError.message}`);
        log.warn(`[lease-adapter] lease_ledger_meta write failed: ${metaError.message}`);
      }
    } catch (e) {
      errors.push('lease_ledger_meta: unexpected error');
      log.warn(`[lease-adapter] lease_ledger_meta upsert warning:`, e);
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
 * @param asOf 평가 기준일(렌트롤 C5 등). 없으면 오늘(기존 동작 유지)
 */
export function analyzeEviction(leases: NormalizedLease[], asOf?: string | Date | number | null): EvictionAnalysis {
  const activeTenants = leases.filter(l => !l.isVacant);
  // §6.4 계약 단위: 같은 contract_group 은 하나의 계약 — 비대표 행을 별도 임차인으로 세지 않는다 (그룹 없는 행은 행=계약)
  const totalTenants = groupContracts(leases).filter(g => g.rows.some(r => !r.isVacant)).length;
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
    const now = asOf == null ? new Date() : resolveEvaluationDate(asOf);
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
| **명도 난이도 평가** | ${frictionLabel} | 종합 리스크 |

※ 명도 보상 비용은 가정 기반 추정입니다(이사비 계약당 300만원 + 월세 6개월분 영업합의금 가정). 실제 협의 결과와 다를 수 있습니다.`;
}
