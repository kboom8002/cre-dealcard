/**
 * @file src/domain/building/im-core/facts/rent.ts
 * @description Pure domain facts extraction for Rent Roll, Tenancy, and Income.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export interface PureRentUnit {
  floor: string;
  tenantName?: string;
  rentKrw: number;
  depositKrw: number;
  maintenanceFeeKrw?: number;
  areaSqm?: number;
  status: 'occupied' | 'vacant' | 'owner';
  expiryDate?: string;
}

export interface PureRentFacts {
  depositTotalKrw: number;
  depositTotalManwon: number;
  monthlyRentTotalKrw: number;
  monthlyRentTotalManwon: number;
  maintenanceFeeMonthlyKrw: number;
  annualRentKrw: number;
  unitCount: number;
  occupiedCount: number;
  vacantCount: number;
  occupancyRatePct: number;
  units: PureRentUnit[];
}

export function extractRentFacts(raw: Record<string, any>): PureRentFacts {
  const ssot = raw?.ssot_summary || raw?.layers?.lease_summary || raw || {};
  const rawUnits: any[] = Array.isArray(raw?.rent_roll)
    ? raw.rent_roll
    : Array.isArray(raw?.units)
    ? raw.units
    : Array.isArray(raw?.layers?.lease_units)
    ? raw.layers.lease_units
    : Array.isArray(ssot?.rent_roll)
    ? ssot.rent_roll
    : [];

  let calcDepositKrw = 0;
  let calcMonthlyRentKrw = 0;
  let calcMaintKrw = 0;
  let occupiedCount = 0;
  let vacantCount = 0;

  const units: PureRentUnit[] = rawUnits.map((u, idx) => {
    const rentKrw = Number(u.rent_krw ?? (u.rent_manwon ? u.rent_manwon * 10000 : 0));
    const depositKrw = Number(u.deposit_krw ?? (u.deposit_manwon ? u.deposit_manwon * 10000 : 0));
    const maintKrw = Number(u.maintenance_fee_krw ?? (u.maintenance_fee_manwon ? u.maintenance_fee_manwon * 10000 : 0));
    const status: 'occupied' | 'vacant' | 'owner' = u.status === 'vacant'
      ? 'vacant'
      : u.status === 'owner'
      ? 'owner'
      : 'occupied';

    if (status === 'occupied') {
      occupiedCount++;
      calcDepositKrw += depositKrw;
      calcMonthlyRentKrw += rentKrw;
      calcMaintKrw += maintKrw;
    } else {
      vacantCount++;
    }

    return {
      floor: String(u.floor || `${idx + 1}F`),
      tenantName: u.tenant_name || u.tenant || (status === 'occupied' ? '임차인' : undefined),
      rentKrw,
      depositKrw,
      maintenanceFeeKrw: maintKrw,
      areaSqm: u.area_sqm ? Number(u.area_sqm) : undefined,
      status,
      expiryDate: u.expiry_date || u.lease_expiry,
    };
  });

  // If rawUnits were provided, prioritize their sum; otherwise check summary totals
  const rawDeposit = raw?.deposit_total_krw ?? (raw?.total_deposit_manwon ? Number(raw.total_deposit_manwon) * 10000 : null);
  const ssotDeposit = ssot?.total_deposit_krw ?? (ssot?.total_deposit_manwon ? Number(ssot.total_deposit_manwon) * 10000 : 0);
  const depositTotalKrw = units.length > 0 ? calcDepositKrw : Number(rawDeposit ?? ssotDeposit);

  const rawRent = raw?.monthly_rent_total_krw ?? (raw?.monthly_rent_total_manwon ? Number(raw.monthly_rent_total_manwon) * 10000 : null);
  const ssotRent = ssot?.monthly_rent_total_krw ?? ssot?.noi_monthly_krw ?? (ssot?.monthly_rent_total_manwon ? Number(ssot.monthly_rent_total_manwon) * 10000 : 0);
  const monthlyRentTotalKrw = units.length > 0 ? calcMonthlyRentKrw : Number(rawRent ?? ssotRent);

  const maintenanceFeeMonthlyKrw = units.length > 0
    ? calcMaintKrw
    : Number(
        raw?.maintenance_fee_monthly_krw ??
        ssot?.maintenance_fee_monthly_krw ??
        0
      );

  const annualRentKrw = monthlyRentTotalKrw * 12;
  const unitCount = units.length > 0 ? units.length : Number(ssot?.unit_count ?? 1);
  const finalOccupiedCount = units.length > 0 ? occupiedCount : Number(ssot?.occupied_units ?? (monthlyRentTotalKrw > 0 ? 1 : 0));
  const finalVacantCount = units.length > 0 ? vacantCount : Math.max(0, unitCount - finalOccupiedCount);
  const occupancyRatePct = unitCount > 0
    ? Math.round((finalOccupiedCount / unitCount) * 1000) / 10
    : 100;

  return {
    depositTotalKrw,
    depositTotalManwon: Math.round(depositTotalKrw / 10000),
    monthlyRentTotalKrw,
    monthlyRentTotalManwon: Math.round(monthlyRentTotalKrw / 10000),
    maintenanceFeeMonthlyKrw,
    annualRentKrw,
    unitCount,
    occupiedCount: finalOccupiedCount,
    vacantCount: finalVacantCount,
    occupancyRatePct,
    units,
  };
}
