/**
 * Pro IM 렌트롤(A03 `rentRollPartN`) 표 구성 — "사용자가 기입한 면적만 표기"
 *
 * Basic(10열 a24)과 같은 의미론을 Pro 표에 적용한다. 면적 열은 데이터가 정한다 (표 전체 기준, 호실별 아님):
 *  - 임대면적만 기입  → 임대면적(㎡)·임대면적(평)            (10열)
 *  - 전용면적만 기입  → 전용면적(㎡)·전용면적(평)            (10열)
 *  - 둘 다 기입       → 임대면적(㎡)·임대면적(평)·전용면적(㎡) (11열)
 *  - 둘 다 비어 있음  → 임대면적 열을 '-' 로 유지            (10열: 면적 미기재 사실을 표에 남긴다)
 *
 * 한 칸에 다른 면적을 대신 채워 넣지 않는다. 헤더·본문·소계·합계 행의 셀 수는 항상 같다 (rules/07 #68).
 * 순수 함수 — React/Next/Supabase 비의존.
 */

import type {
  InstitutionalTenantRosterItem,
  TenantRosterChunk,
  TenantRosterSubtotal,
} from '../../../im-core/pro-tenant-roster';

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

export function proRentRollHeaders(mode: ProAreaMode): string[] {
  const head = ['층', '호실', '임차인명', '주요업종'];
  const tail = ['보증금(만원)', '월임대료(만원)', '만기일자', '갱신옵션'];
  switch (mode) {
    case 'exclusive':
      return [...head, '전용면적(㎡)', '전용면적(평)', ...tail];
    case 'both':
      return [...head, '임대면적(㎡)', '임대면적(평)', '전용면적(㎡)', ...tail];
    default:
      return [...head, '임대면적(㎡)', '임대면적(평)', ...tail];
  }
}

const fmt = (v: number | undefined): string => (pos(v) ? (v as number).toLocaleString() : '-');

function areaCells(
  mode: ProAreaMode,
  leaseM2: number | undefined,
  leasePy: number | undefined,
  excM2: number | undefined,
  excPy: number | undefined,
): string[] {
  switch (mode) {
    case 'exclusive':
      return [fmt(excM2), fmt(excPy)];
    case 'both':
      return [fmt(leaseM2), fmt(leasePy), fmt(excM2)];
    default:
      return [fmt(leaseM2), fmt(leasePy)];
  }
}

const sum = (items: InstitutionalTenantRosterItem[], pick: (i: InstitutionalTenantRosterItem) => number | undefined): number | undefined => {
  let s = 0;
  let any = false;
  for (const i of items) {
    const v = pick(i);
    if (pos(v)) { s += v as number; any = true; }
  }
  return any ? Math.round(s * 100) / 100 : undefined;
};

export interface ProRentRollTableInput {
  chunk: TenantRosterChunk;
  mode: ProAreaMode;
  /** 마지막 페이지에 합계 행을 붙일 때 사용 (전체 호실 기준) */
  grandTotal?: TenantRosterSubtotal;
  allItems: InstitutionalTenantRosterItem[];
  /** 계약그룹 후행 행 판정 (금액 셀을 '〃' 로) */
  isGroupFollower?: (item: InstitutionalTenantRosterItem) => boolean;
}

export function buildProRentRollTable(input: ProRentRollTableInput): { tableHead: string[]; tableRows: string[][] } {
  const { chunk, mode, grandTotal, allItems, isGroupFollower } = input;
  const tableHead = proRentRollHeaders(mode);
  const manwon = (krw: number) => Math.round(krw / 10000).toLocaleString();

  const tableRows: string[][] = chunk.items.map((t) => {
    const follower = isGroupFollower?.(t) === true;
    return [
      t.floor,
      t.unitNumber,
      t.tenantName,
      t.industry,
      ...areaCells(mode, t.leasedAreaM2, t.leasedAreaPyeong, t.exclusiveAreaM2, t.exclusiveAreaPyeong),
      follower ? PRO_SAME_AS_ABOVE : manwon(t.depositKrw),
      follower ? PRO_SAME_AS_ABOVE : manwon(t.monthlyRentKrw),
      t.leaseEndDate,
      t.renewalOption || (t.statutoryProtection10Y ? '10년 보호' : '협의'),
    ];
  });

  const summaryRow = (label: string, items: InstitutionalTenantRosterItem[], s: TenantRosterSubtotal): string[] => [
    label,
    '-',
    `${s.tenantCount}개사`,
    '-',
    ...areaCells(
      mode,
      sum(items, (i) => i.leasedAreaM2),
      sum(items, (i) => i.leasedAreaPyeong),
      sum(items, (i) => i.exclusiveAreaM2),
      sum(items, (i) => i.exclusiveAreaPyeong),
    ),
    manwon(s.depositKrw),
    manwon(s.monthlyRentKrw),
    '-',
    '-',
  ];

  tableRows.push(summaryRow('소계', chunk.items, chunk.subtotal));
  if (chunk.isLastPage && grandTotal) {
    tableRows.push(summaryRow('합계', allItems, grandTotal));
  }
  return { tableHead, tableRows };
}
