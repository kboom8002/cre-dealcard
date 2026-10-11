/**
 * Pro IM 렌트롤(A03 `rentRollPartN`) 표 구성 — "사용자가 기입한 면적만 표기"
 *
 * Basic(10열 a24)과 같은 의미론을 Pro 표에 적용한다. 면적 열은 데이터가 정한다 (표 전체 기준, 호실별 아님):
 *  - 임대면적만 기입  → 임대면적(단위)                        (9열)
 *  - 전용면적만 기입  → 전용면적(단위)                        (9열)
 *  - 둘 다 기입       → 임대면적(단위)·전용면적(단위)         (10열)
 *  - 둘 다 비어 있음  → 임대면적 열을 '-' 로 유지              (9열: 면적 미기재 사실을 표에 남긴다)
 *
 * v1.5 §9.1 / Q7: 단위(입력 단위 = ㎡ | 평)는 면적 종류당 **1열**. 이중 단위(㎡+평) 열을 쓰지 않는다.
 *  - 계산 정본은 ㎡. 표기만 입력 단위로 바꾼다 (평 = ㎡÷3.305785, 소수 2자리).
 *  - 소계·합계 행도 같은 단위 (행에 표시된 값의 합).
 * 한 칸에 다른 면적을 대신 채워 넣지 않는다. 헤더·본문·소계·합계 행의 셀 수는 항상 같다 (rules/07 #68).
 * 순수 함수 — React/Next/Supabase 비의존.
 */

import type {
  InstitutionalTenantRosterItem,
  TenantRosterChunk,
  TenantRosterSubtotal,
} from '../../../im-core/pro-tenant-roster';
import type { AreaInputUnit } from '../../rentroll-meta';
import {
  formatAreaNumber,
  formatLeaseAreaCell,
  leaseAreaHeaderLabel,
  sumLeaseAreaInUnit,
} from '../../lease-area-cell';

export type ProAreaMode = 'lease' | 'exclusive' | 'both' | 'none';

/** 통합계약(계약그룹) 후행 행 — 금액은 대표 행에만 있으므로 '〃' 로 표기 */
export const PRO_SAME_AS_ABOVE = '〃';

const pos = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function detectProAreaMode(items: InstitutionalTenantRosterItem[]): ProAreaMode {
  const hasLease = items.some((i) => pos(i.leasedAreaM2));
  const hasExclusive = items.some((i) => pos(i.exclusiveAreaM2));
  if (hasLease && hasExclusive) return 'both';
  if (hasExclusive) return 'exclusive';
  if (hasLease) return 'lease';
  return 'none';
}

export function proRentRollHeaders(mode: ProAreaMode, unit: AreaInputUnit = 'sqm'): string[] {
  const head = ['층', '호실', '임차인명', '주요업종'];
  const tail = ['보증금(만원)', '월임대료(만원)', '만기일자', '갱신옵션'];
  switch (mode) {
    case 'exclusive':
      return [...head, leaseAreaHeaderLabel('전용면적', unit), ...tail];
    case 'both':
      return [...head, leaseAreaHeaderLabel('임대면적', unit), leaseAreaHeaderLabel('전용면적', unit), ...tail];
    default:
      return [...head, leaseAreaHeaderLabel('임대면적', unit), ...tail];
  }
}

function areaCells(
  mode: ProAreaMode,
  unit: AreaInputUnit,
  leaseM2: number | undefined,
  excM2: number | undefined,
): string[] {
  switch (mode) {
    case 'exclusive':
      return [formatLeaseAreaCell(excM2, unit)];
    case 'both':
      return [formatLeaseAreaCell(leaseM2, unit), formatLeaseAreaCell(excM2, unit)];
    default:
      return [formatLeaseAreaCell(leaseM2, unit)];
  }
}

const sumCell = (
  items: InstitutionalTenantRosterItem[],
  unit: AreaInputUnit,
  pick: (i: InstitutionalTenantRosterItem) => number | undefined,
): number | undefined => sumLeaseAreaInUnit(items.map(pick), unit) ?? undefined;

export interface ProRentRollTableInput {
  chunk: TenantRosterChunk;
  mode: ProAreaMode;
  /** 렌트롤 입력 단위 (G9). 미지정 = 'sqm' */
  unit?: AreaInputUnit;
  /** 마지막 페이지에 합계 행을 붙일 때 사용 (전체 호실 기준) */
  grandTotal?: TenantRosterSubtotal;
  allItems: InstitutionalTenantRosterItem[];
  /** 계약그룹 후행 행 판정 (금액 셀을 '〃' 로) */
  isGroupFollower?: (item: InstitutionalTenantRosterItem) => boolean;
}

export function buildProRentRollTable(input: ProRentRollTableInput): { tableHead: string[]; tableRows: string[][] } {
  const { chunk, mode, grandTotal, allItems, isGroupFollower } = input;
  const unit: AreaInputUnit = input.unit ?? 'sqm';
  const tableHead = proRentRollHeaders(mode, unit);
  const manwon = (krw: number) => Math.round(krw / 10000).toLocaleString();

  const tableRows: string[][] = chunk.items.map((t) => {
    const follower = isGroupFollower?.(t) === true;
    // 공실·자가사용 행: 금액 없음 → '-' ('0' 으로 임대료가 있는 것처럼 보이지 않게)
    const nonLeased = t.occupancyType === 'vacant' || t.occupancyType === 'owner_occupied';
    return [
      t.floor,
      t.unitNumber,
      t.tenantName,
      t.industry,
      ...areaCells(mode, unit, t.leasedAreaM2, t.exclusiveAreaM2),
      nonLeased ? '-' : follower ? PRO_SAME_AS_ABOVE : manwon(t.depositKrw),
      nonLeased ? '-' : follower ? PRO_SAME_AS_ABOVE : manwon(t.monthlyRentKrw),
      nonLeased ? '-' : t.leaseEndDate,
      t.renewalOption || (t.statutoryProtection10Y ? '10년 보호' : '협의'),
    ];
  });

  const summaryRow = (label: string, items: InstitutionalTenantRosterItem[], s: TenantRosterSubtotal): string[] => {
    const leaseSum = sumCell(items, unit, (i) => i.leasedAreaM2);
    const excSum = sumCell(items, unit, (i) => i.exclusiveAreaM2);
    const cells =
      mode === 'exclusive'
        ? [formatAreaNumber(excSum)]
        : mode === 'both'
          ? [formatAreaNumber(leaseSum), formatAreaNumber(excSum)]
          : [formatAreaNumber(leaseSum)];
    return [label, '-', `${s.tenantCount}개사`, '-', ...cells, manwon(s.depositKrw), manwon(s.monthlyRentKrw), '-', '-'];
  };

  tableRows.push(summaryRow('소계', chunk.items, chunk.subtotal));
  if (chunk.isLastPage && grandTotal) {
    tableRows.push(summaryRow('합계', allItems, grandTotal));
  }
  return { tableHead, tableRows };
}
