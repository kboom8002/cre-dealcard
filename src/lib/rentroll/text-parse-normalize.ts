/**
 * @file text-parse-normalize.ts
 * @description 텍스트 렌트롤 LLM 파서(/api/broker/rent-roll/parse-text) 결과의 결정론적 후처리.
 *
 * LLM 은 '월세 0원 → is_vacant:true' 규칙 때문에 자가사용·통합계약 후행(금액이 대표 행에만 있는 행)을 공실로 오표기하고,
 * 공실률·합계도 자체 산술로 틀릴 수 있다 (oracle income-dangsan-r3: 공실률 33.33%, '공실 B1·2F·4F').
 * 점유 상태는 lease-vacancy SSOT 로 재판정하고, 합계/공실률은 행에서 재계산한다
 * (parse-rentroll-sheet 와 동일 기준: 공실·자가사용 행 금액은 합계 제외, 자가사용은 공실률 분모 제외).
 */
import { normalizeLeaseOccupancyFields, resolveLeaseOccupancy, summarizeLeaseOccupancy } from '@/domain/building/mobile-im/lease-vacancy';

export interface TextParsedFloorLease {
  floor: string;
  tenant_type?: string;
  tenant_name?: string;
  deposit_manwon?: number;
  rent_manwon?: number;
  mgmt_fee_manwon?: number;
  is_vacant?: boolean;
  lease_state?: string;
  note?: string;
  area_sqm?: number;
  lease_start?: string;
  lease_end?: string;
}

export interface TextParsedRentRoll {
  floorLeases: TextParsedFloorLease[];
  monthlyRent: number;
  totalDeposit: number;
  mgmtFeeTotal: number;
  vacancyPct: number;
}

const LEASE_STATES = ['임대중', '공실', '자가사용'];

export function normalizeTextParsedRentRoll(parsed: TextParsedRentRoll): TextParsedRentRoll {
  const rows = parsed.floorLeases.map((l) => {
    const cleaned: TextParsedFloorLease = { ...l };
    if (cleaned.lease_state && !LEASE_STATES.includes(cleaned.lease_state)) delete cleaned.lease_state;
    return normalizeLeaseOccupancyFields(cleaned);
  });

  let monthlyRent = 0;
  let totalDeposit = 0;
  let mgmtFeeTotal = 0;
  for (const r of rows) {
    if (resolveLeaseOccupancy(r) !== '임대중') continue;
    monthlyRent += Number(r.rent_manwon) || 0;
    totalDeposit += Number(r.deposit_manwon) || 0;
    mgmtFeeTotal += Number(r.mgmt_fee_manwon) || 0;
  }
  const occ = summarizeLeaseOccupancy(rows);
  return {
    floorLeases: rows,
    monthlyRent,
    totalDeposit,
    mgmtFeeTotal,
    vacancyPct: occ.vacancyPct != null ? Math.round(occ.vacancyPct) : 0,
  };
}
