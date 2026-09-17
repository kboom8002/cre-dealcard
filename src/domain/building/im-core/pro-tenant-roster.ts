/**
 * pro-tenant-roster.ts
 *
 * Institutional Pro IM Multi-Page Tenant Roster & Lease Expiry Engine:
 * 1. InstitutionalTenantRosterItem interface
 * 2. Multi-Page Chunking for 30+ slide presentations (12 items/slide, running subtotals, grand total)
 * 3. WALE (Weighted Average Lease Expiry) calculation helper
 *
 * Compliant with AGENTS.md Rule 12 (pure domain logic, no React/Next/Supabase).
 */

// ============================================================================
// 1. Interfaces & Types
// ============================================================================

export interface InstitutionalTenantRosterItem {
  floor: string; // e.g., 'B1', '1F', '2F', 'PH'
  unitNumber: string; // e.g., '101호', '201-A호'
  tenantName: string; // e.g., '스타벅스 코리아', '법무법인 율촌'
  industry: string; // e.g., 'F&B/카페', '법률서비스', 'IT/소프트웨어'
  leasedAreaM2: number; // 계약/임대 면적 (㎡)
  leasedAreaPyeong: number; // 계약/임대 면적 (평)
  depositKrw: number; // 보증금 (원)
  monthlyRentKrw: number; // 월 임대료 (원)
  monthlyMaintenanceKrw: number; // 월 관리비 (원)
  leaseStartDate: string; // YYYY-MM-DD
  leaseEndDate: string; // YYYY-MM-DD
  renewalOption?: string; // e.g., '행사 가능', '만료 예정', '협의 중'
  statutoryProtection10Y: boolean; // 상임법 10년 갱신요구권 적용 여부
  // Optional convenience attributes
  exclusiveAreaM2?: number; // 전용 면적 (㎡)
  exclusiveAreaPyeong?: number; // 전용 면적 (평)
  isAnchor?: boolean; // 앵커 테넌트 여부
  occupancyType?: 'leased' | 'vacant' | 'owner_occupied';
}

export interface TenantRosterSubtotal {
  leasedAreaM2: number;
  leasedAreaPyeong: number;
  depositKrw: number;
  monthlyRentKrw: number;
  monthlyMaintenanceKrw: number;
  annualRentKrw: number; // monthlyRentKrw * 12
  tenantCount: number;
}

export interface TenantRosterChunk {
  pageIndex: number; // 1-based (e.g. 1, 2, 3)
  totalPages: number; // total page count
  isFirstPage: boolean;
  isLastPage: boolean;
  items: InstitutionalTenantRosterItem[];
  subtotal: TenantRosterSubtotal;
  grandTotal?: TenantRosterSubtotal; // Included on final chunk (and available overall)
}

export interface ProWaleResult {
  waleByRentYears: number; // rent-weighted WALE (years)
  waleByAreaYears: number; // area-weighted WALE (years)
  expiringWithin12mPct: number; // % of monthly rent expiring within 1 year
  expiringWithin24mPct: number; // % of monthly rent expiring within 2 years
  totalMonthlyRentKrw: number;
  totalAnnualRentKrw: number;
  totalDepositKrw: number;
  totalLeasedAreaM2: number;
  totalLeasedAreaPyeong: number;
  averageRentPerPyeongKrw: number; // monthly rent per pyeong
  activeTenantCount: number;
}

// ============================================================================
// 2. Subtotal & Grand Total Aggregation
// ============================================================================

export function calculateTenantRosterSubtotal(
  items: InstitutionalTenantRosterItem[]
): TenantRosterSubtotal {
  let leasedAreaM2 = 0;
  let leasedAreaPyeong = 0;
  let depositKrw = 0;
  let monthlyRentKrw = 0;
  let monthlyMaintenanceKrw = 0;

  for (const item of items) {
    leasedAreaM2 += item.leasedAreaM2 || 0;
    leasedAreaPyeong += item.leasedAreaPyeong || 0;
    depositKrw += item.depositKrw || 0;
    monthlyRentKrw += item.monthlyRentKrw || 0;
    monthlyMaintenanceKrw += item.monthlyMaintenanceKrw || 0;
  }

  return {
    leasedAreaM2: Number(leasedAreaM2.toFixed(2)),
    leasedAreaPyeong: Number(leasedAreaPyeong.toFixed(2)),
    depositKrw,
    monthlyRentKrw,
    monthlyMaintenanceKrw,
    annualRentKrw: monthlyRentKrw * 12,
    tenantCount: items.length,
  };
}

// ============================================================================
// 3. Multi-Page Chunking Engine
// ============================================================================

/**
 * Splits an institutional tenant roster into slide-friendly chunks (e.g. max 12 items per slide).
 * Computes individual page subtotals and includes the grand total on the final chunk.
 */
export function chunkTenantRoster(
  items: InstitutionalTenantRosterItem[],
  maxPerSlide: number = 12
): TenantRosterChunk[] {
  if (!items || items.length === 0) {
    const emptySubtotal: TenantRosterSubtotal = {
      leasedAreaM2: 0,
      leasedAreaPyeong: 0,
      depositKrw: 0,
      monthlyRentKrw: 0,
      monthlyMaintenanceKrw: 0,
      annualRentKrw: 0,
      tenantCount: 0,
    };
    return [
      {
        pageIndex: 1,
        totalPages: 1,
        isFirstPage: true,
        isLastPage: true,
        items: [],
        subtotal: emptySubtotal,
        grandTotal: emptySubtotal,
      },
    ];
  }

  const limit = Math.max(1, maxPerSlide);
  const totalPages = Math.ceil(items.length / limit);
  const grandTotal = calculateTenantRosterSubtotal(items);

  const chunks: TenantRosterChunk[] = [];

  for (let p = 0; p < totalPages; p++) {
    const pageIndex = p + 1;
    const sliceStart = p * limit;
    const sliceEnd = Math.min(sliceStart + limit, items.length);
    const pageItems = items.slice(sliceStart, sliceEnd);
    const isFirstPage = pageIndex === 1;
    const isLastPage = pageIndex === totalPages;

    const subtotal = calculateTenantRosterSubtotal(pageItems);

    chunks.push({
      pageIndex,
      totalPages,
      isFirstPage,
      isLastPage,
      items: pageItems,
      subtotal,
      grandTotal: isLastPage ? grandTotal : undefined,
    });
  }

  return chunks;
}

// ============================================================================
// 4. WALE (Weighted Average Lease Expiry) Engine
// ============================================================================

/**
 * Calculates institutional WALE (Weighted Average Lease Expiry) by rent and area,
 * along with rollover cliff risks (12-month and 24-month expirations).
 */
export function calculateProWALE(
  items: InstitutionalTenantRosterItem[],
  asOfDateStr?: string
): ProWaleResult {
  const asOf = asOfDateStr ? new Date(asOfDateStr) : new Date();

  let totalRent = 0;
  let totalAreaM2 = 0;
  let totalAreaPyeong = 0;
  let totalDeposit = 0;
  let weightedRentDays = 0;
  let weightedAreaDays = 0;
  let expiring12mRent = 0;
  let expiring24mRent = 0;
  let activeTenantCount = 0;

  for (const item of items) {
    if (!item.leaseEndDate) continue;

    const endDate = new Date(item.leaseEndDate);
    if (isNaN(endDate.getTime())) continue;

    const diffDays = (endDate.getTime() - asOf.getTime()) / (1000 * 3600 * 24);
    // Ignore already expired leases for future remaining life
    const remainingDays = Math.max(0, diffDays);

    const rent = item.monthlyRentKrw || 0;
    const areaM2 = item.leasedAreaM2 || 0;
    const areaPyeong = item.leasedAreaPyeong || 0;

    totalRent += rent;
    totalAreaM2 += areaM2;
    totalAreaPyeong += areaPyeong;
    totalDeposit += item.depositKrw || 0;

    weightedRentDays += rent * remainingDays;
    weightedAreaDays += areaM2 * remainingDays;

    if (diffDays > 0 && diffDays <= 365) {
      expiring12mRent += rent;
    }
    if (diffDays > 0 && diffDays <= 730) {
      expiring24mRent += rent;
    }

    if (diffDays > 0) {
      activeTenantCount++;
    }
  }

  const daysInYear = 365.25;

  const waleByRentYears =
    totalRent > 0 ? Number((weightedRentDays / totalRent / daysInYear).toFixed(2)) : 0;

  const waleByAreaYears =
    totalAreaM2 > 0 ? Number((weightedAreaDays / totalAreaM2 / daysInYear).toFixed(2)) : 0;

  const expiringWithin12mPct =
    totalRent > 0 ? Number(((expiring12mRent / totalRent) * 100).toFixed(2)) : 0;

  const expiringWithin24mPct =
    totalRent > 0 ? Number(((expiring24mRent / totalRent) * 100).toFixed(2)) : 0;

  const averageRentPerPyeongKrw =
    totalAreaPyeong > 0 ? Math.round(totalRent / totalAreaPyeong) : 0;

  return {
    waleByRentYears,
    waleByAreaYears,
    expiringWithin12mPct,
    expiringWithin24mPct,
    totalMonthlyRentKrw: totalRent,
    totalAnnualRentKrw: totalRent * 12,
    totalDepositKrw: totalDeposit,
    totalLeasedAreaM2: Number(totalAreaM2.toFixed(2)),
    totalLeasedAreaPyeong: Number(totalAreaPyeong.toFixed(2)),
    averageRentPerPyeongKrw,
    activeTenantCount,
  };
}
