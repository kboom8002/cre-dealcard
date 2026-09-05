/**
 * Rent Roll 4-Tier Classifier & G34/G35/G36 Invariant Engine
 */

export type RentrollTier = 'full_unit_level' | 'floor_summary' | 'total_aggregate' | 'no_data';

export type UnitOccupancyType = 'leased' | 'vacant' | 'owner_occupied';

export interface RentrollUnitRow {
  floor: string;
  unit?: string;
  tenantIndustry?: string;
  occupancyType: UnitOccupancyType;
  areaSqm: number;
  depositKrw: number;
  monthlyRentKrw: number;
  adminFeeKrw?: number;
}

export interface RentrollAnalysisResult {
  tier: RentrollTier;
  rowCount: number;
  totalDepositKrw: number;
  totalMonthlyRentKrw: number;
  totalAreaSqm: number;
  vacantAreaSqm: number;
  ownerOccupiedAreaSqm: number;
  physicalVacancyRatePct: number; // 공실면적 / 전체면적
  hasG35Discrepancy: boolean;
  discrepancyNote?: string;
}

export function classifyAndAnalyzeRentroll(
  rows?: RentrollUnitRow[],
  controlTotals?: { depositKrw?: number; monthlyRentKrw?: number }
): RentrollAnalysisResult {
  if (!rows || rows.length === 0) {
    if (controlTotals && (controlTotals.depositKrw || controlTotals.monthlyRentKrw)) {
      return {
        tier: 'total_aggregate',
        rowCount: 0,
        totalDepositKrw: controlTotals.depositKrw ?? 0,
        totalMonthlyRentKrw: controlTotals.monthlyRentKrw ?? 0,
        totalAreaSqm: 0,
        vacantAreaSqm: 0,
        ownerOccupiedAreaSqm: 0,
        physicalVacancyRatePct: 0,
        hasG35Discrepancy: false,
      };
    }
    return {
      tier: 'no_data',
      rowCount: 0,
      totalDepositKrw: 0,
      totalMonthlyRentKrw: 0,
      totalAreaSqm: 0,
      vacantAreaSqm: 0,
      ownerOccupiedAreaSqm: 0,
      physicalVacancyRatePct: 0,
      hasG35Discrepancy: false,
    };
  }

  const hasUnitDetails = rows.some((r) => r.unit && r.unit.length > 0);
  const tier: RentrollTier = hasUnitDetails ? 'full_unit_level' : 'floor_summary';

  let sumDeposit = 0;
  let sumRent = 0;
  let sumArea = 0;
  let vacantArea = 0;
  let ownerArea = 0;

  for (const row of rows) {
    sumDeposit += row.depositKrw;
    sumRent += row.monthlyRentKrw;
    sumArea += row.areaSqm;

    if (row.occupancyType === 'vacant') {
      vacantArea += row.areaSqm;
    } else if (row.occupancyType === 'owner_occupied') {
      ownerArea += row.areaSqm;
    }
  }

  const physicalVacancyRatePct = sumArea > 0
    ? Math.round((vacantArea / sumArea) * 1000) / 10
    : 0;

  let hasG35Discrepancy = false;
  let discrepancyNote: string | undefined;

  if (controlTotals?.monthlyRentKrw && controlTotals.monthlyRentKrw > 0) {
    const diff = Math.abs(sumRent - controlTotals.monthlyRentKrw);
    const diffRate = (diff / controlTotals.monthlyRentKrw) * 100;
    if (diffRate > 1.0) {
      hasG35Discrepancy = true;
      discrepancyNote = `렌트롤 합계(월 ${sumRent.toLocaleString()}원)와 마스터 총액(월 ${controlTotals.monthlyRentKrw.toLocaleString()}원) 편차 ${diffRate.toFixed(1)}% 발생`;
    }
  }

  return {
    tier,
    rowCount: rows.length,
    totalDepositKrw: sumDeposit,
    totalMonthlyRentKrw: sumRent,
    totalAreaSqm: sumArea,
    vacantAreaSqm: vacantArea,
    ownerOccupiedAreaSqm: ownerArea,
    physicalVacancyRatePct,
    hasG35Discrepancy,
    discrepancyNote,
  };
}
