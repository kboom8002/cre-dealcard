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
  areaPyeong?: number;
  status: 'occupied' | 'vacant' | 'owner';
  expiryDate?: string;
}

export interface PureRentFacts {
  depositTotalKrw: number;
  depositTotalManwon: number;
  monthlyRentTotalKrw: number;
  monthlyRentTotalManwon: number;
  maintenanceFeeMonthlyKrw: number;
  otherIncomeMonthlyKrw?: number;
  otherIncomeMonthlyManwon?: number;
  annualRentKrw: number;
  unitCount: number;
  occupiedCount: number;
  ownerOccupiedCount?: number;
  vacantCount: number;
  occupancyRatePct: number;
  units: PureRentUnit[];
}

export function extractRentFacts(raw: Record<string, any>): PureRentFacts {
  const rawBody = raw?.body || raw || {};
  const ssot = raw?.ssot_summary || rawBody?.ssot_summary || raw?.layers?.lease_summary || raw || {};
  const candidateUnits =
    raw?.rent_roll ||
    rawBody?.rent_roll ||
    raw?.rentRoll ||
    rawBody?.rentRoll ||
    raw?.floor_leases ||
    rawBody?.floor_leases ||
    raw?.units ||
    rawBody?.units ||
    raw?.layers?.lease_units ||
    ssot?.rent_roll ||
    ssot?.rentRoll ||
    ssot?.floor_leases ||
    [];
  const rawUnits: any[] = Array.isArray(candidateUnits) ? candidateUnits : [];

  let calcDepositKrw = 0;
  let calcMonthlyRentKrw = 0;
  let calcMaintKrw = 0;
  let occupiedCount = 0;
  let ownerOccupiedCount = 0;
  let vacantCount = 0;

  const units: PureRentUnit[] = rawUnits.map((u, idx) => {
    const rawRent = u.rent_krw ?? u.rent_manwon ?? u.monthlyRentManwon ?? u.monthlyRentKrw ?? u.monthlyRent ?? u.rent ?? 0;
    const rentKrw = Number(
      u.rent_krw != null || u.monthlyRentKrw != null
        ? (u.rent_krw ?? u.monthlyRentKrw)
        : Number(rawRent) * 10000
    );

    const rawDeposit = u.deposit_krw ?? u.deposit_manwon ?? u.depositManwon ?? u.depositKrw ?? u.deposit ?? 0;
    const depositKrw = Number(
      u.deposit_krw != null || u.depositKrw != null
        ? (u.deposit_krw ?? u.depositKrw)
        : Number(rawDeposit) * 10000
    );

    const rawMaint =
      u.maintenance_fee_krw ??
      u.maintenance_fee_manwon ??
      u.maintenance_manwon ??
      u.maintenanceManwon ??
      u.mgmt_fee_manwon ??
      u.maintenanceFeeKrw ??
      0;
    const maintKrw = Number(
      u.maintenance_fee_krw != null || u.maintenanceFeeKrw != null
        ? (u.maintenance_fee_krw ?? u.maintenanceFeeKrw)
        : Number(rawMaint) * 10000
    );

    const isVacantRaw =
      u.status === 'vacant' ||
      u.is_vacant === true ||
      u.lease_state === '공실' ||
      u.tenant_type === '공실' ||
      u.tenant_name === '공실' ||
      u.use === '공실';
    const isOwnerRaw =
      !isVacantRaw &&
      (u.status === 'owner' ||
        u.is_owner === true ||
        u.occupancy_status === 'owner_occupied' ||
        u.lease_state === '자가사용' ||
        u.lease_state === '자가' ||
        u.tenant_type === '자가' ||
        u.tenant_type === '자가사용' ||
        u.tenant_name === '자가' ||
        u.tenant_name === '자가사용' ||
        u.use === '자가사용');

    const status: 'occupied' | 'vacant' | 'owner' = isVacantRaw
      ? 'vacant'
      : isOwnerRaw
      ? 'owner'
      : 'occupied';
    const isVacant = status === 'vacant';

    if (status === 'occupied') {
      occupiedCount++;
      calcDepositKrw += depositKrw;
      calcMonthlyRentKrw += rentKrw;
      calcMaintKrw += maintKrw;
    } else if (status === 'owner') {
      // Rule 75: 자가사용은 공실(vacant)이 아닌 실점유(occupied)에 포함하되 임대료 합산에서는 0원 처리
      occupiedCount++;
      ownerOccupiedCount++;
    } else {
      vacantCount++;
    }

    const explicitSqm = Number(u.area_sqm ?? u.area_m2 ?? u.areaSqm ?? 0);
    const explicitPy = Number(u.area_pyeong ?? u.areaPyeong ?? 0);
    const areaSqm =
      explicitSqm > 0
        ? explicitSqm
        : explicitPy > 0
        ? Math.round(explicitPy * 3.305785 * 100) / 100
        : 0;
    const areaPyeong =
      explicitPy > 0
        ? explicitPy
        : areaSqm > 0
        ? Math.round((areaSqm / 3.305785) * 10) / 10
        : 0;

    return {
      floor: String(u.floor || `${idx + 1}F`),
      tenantName: String(
        u.tenant_name ||
          u.tenantName ||
          u.tenant ||
          u.use ||
          u.tenant_type ||
          u.tenantOrUse ||
          (isVacant ? '공실' : status === 'owner' ? '자가사용' : '근린생활시설')
      ),
      rentKrw,
      depositKrw,
      maintenanceFeeKrw: maintKrw,
      areaSqm: areaSqm > 0 ? areaSqm : undefined,
      areaPyeong: areaPyeong > 0 ? areaPyeong : undefined,
      status,
      expiryDate: u.expiry_date || u.lease_expiry || u.lease_end || u.leaseExpiry || u.expiryDate || undefined,
    };
  });

  // If rawUnits were provided, prioritize their sum; otherwise check summary totals
  const rawDeposit =
    raw?.deposit_total_krw ??
    (raw?.deposit_total_manwon ? Number(raw.deposit_total_manwon) * 10000 : null) ??
    (raw?.total_deposit_manwon ? Number(raw.total_deposit_manwon) * 10000 : null);
  const ssotDeposit =
    ssot?.total_deposit_krw ??
    ssot?.deposit_total_krw ??
    (ssot?.total_deposit_manwon
      ? Number(ssot.total_deposit_manwon) * 10000
      : ssot?.deposit_total_manwon
      ? Number(ssot.deposit_total_manwon) * 10000
      : 0);
  const depositTotalKrw = units.length > 0 ? calcDepositKrw : Number(rawDeposit ?? ssotDeposit);

  const rawRent =
    raw?.monthly_rent_total_krw ??
    (raw?.monthly_rent_total_manwon ? Number(raw.monthly_rent_total_manwon) * 10000 : null);
  const ssotRent =
    ssot?.monthly_rent_total_krw ??
    ssot?.noi_monthly_krw ??
    (ssot?.monthly_rent_total_manwon ? Number(ssot.monthly_rent_total_manwon) * 10000 : 0);
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
    : 0;

  const otherIncomeManwon = Number(
    raw?.other_income_monthly_manwon ??
      raw?.otherIncomeMonthlyManwon ??
      rawBody?.other_income_monthly_manwon ??
      rawBody?.otherIncomeMonthlyManwon ??
      ssot?.other_income_monthly_manwon ??
      ssot?.otherIncomeMonthlyManwon ??
      0
  );
  const otherIncomeMonthlyKrw =
    Number(
      raw?.other_income_monthly_krw ??
        rawBody?.rent_roll_meta?.other_income_krw ??
        ssot?.other_income_monthly_krw ??
        0
    ) || Math.round(otherIncomeManwon * 10000);

  return {
    depositTotalKrw,
    depositTotalManwon: Math.round(depositTotalKrw / 10000),
    monthlyRentTotalKrw,
    monthlyRentTotalManwon: Math.round(monthlyRentTotalKrw / 10000),
    maintenanceFeeMonthlyKrw,
    ...(otherIncomeMonthlyKrw > 0
      ? {
          otherIncomeMonthlyKrw,
          otherIncomeMonthlyManwon: Math.round(otherIncomeMonthlyKrw / 10000),
        }
      : {}),
    annualRentKrw,
    unitCount,
    occupiedCount: finalOccupiedCount,
    ...(ownerOccupiedCount > 0 ? { ownerOccupiedCount } : {}),
    vacantCount: finalVacantCount,
    occupancyRatePct,
    units,
  };
}
