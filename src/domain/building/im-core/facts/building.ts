/**
 * @file src/domain/building/im-core/facts/building.ts
 * @description Pure domain facts extraction for Building Physical Specs.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export interface PureBuildingSpecs {
  totalGrossAreaSqm: number;
  totalGrossAreaPyeong: number;
  exclusiveAreaSqm?: number;
  exclusiveAreaPyeong?: number;
  buildingCoverageRatioPct: number;
  floorAreaRatioPct: number;
  floorsAbove: number;
  floorsBelow: number;
  structure: string;
  mainUsage: string;
  parkingSpaces: number;
  elevators: number;
  completionDate: string;
}

const UNVERIFIED_LEDGER_LABEL = '공적장부 확인 필요';

function cleanBuildingLedgerString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed === '-' ||
    trimmed === '미상' ||
    trimmed === '확인 중' ||
    trimmed === '분석 중' ||
    trimmed === '수집 중'
  ) {
    return null;
  }
  return trimmed;
}

function normalizeCompletionDate(val: unknown): string | null {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    const numStr = String(Math.trunc(val));
    if (/^\d{8}$/.test(numStr)) {
      return `${numStr.slice(0, 4)}-${numStr.slice(4, 6)}-${numStr.slice(6, 8)}`;
    }
    return numStr;
  }
  const str = cleanBuildingLedgerString(val);
  if (!str) return null;
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  return str;
}

export function extractBuildingSpecs(raw: Record<string, any>): PureBuildingSpecs {
  const ssot = raw?.ssot_summary || raw?.layers?.building || raw || {};
  const enrichment = raw?.enrichment && typeof raw.enrichment === 'object' ? raw.enrichment : null;
  const br =
    (enrichment?.buildingRegister && typeof enrichment.buildingRegister === 'object'
      ? enrichment.buildingRegister
      : null) ||
    (raw?.buildingRegister && typeof raw.buildingRegister === 'object' ? raw.buildingRegister : null) ||
    (raw?.building_register && typeof raw.building_register === 'object' ? raw.building_register : null);

  const totalGrossAreaSqm = Number(
    raw?.total_gross_area_sqm ??
    ssot?.total_gross_area_sqm ??
    ssot?.total_area_sqm ??
    ssot?.gross_floor_area_sqm ??
    ssot?.total_area ??
    raw?.gross_floor_area_sqm ??
    br?.totalArea ??
    0
  );

  const totalGrossAreaPyeong = totalGrossAreaSqm > 0
    ? Math.round((totalGrossAreaSqm / 3.305785) * 100) / 100
    : 0;

  const exclusiveAreaSqm = raw?.exclusive_area_sqm ?? ssot?.exclusive_area_sqm;
  const exclusiveAreaPyeong = exclusiveAreaSqm
    ? Math.round((Number(exclusiveAreaSqm) / 3.305785) * 100) / 100
    : undefined;

  const buildingCoverageRatioPct = Number(
    raw?.building_coverage_ratio_pct ??
    raw?.bcr_pct ??
    raw?.bcrPct ??
    ssot?.building_coverage_ratio_pct ??
    ssot?.building_coverage_ratio ??
    ssot?.bcr_pct ??
    ssot?.bcr ??
    br?.bcRat ??
    br?.bcrPct ??
    0
  );

  const floorAreaRatioPct = Number(
    raw?.floor_area_ratio_pct ??
    raw?.far_pct ??
    raw?.farPct ??
    ssot?.floor_area_ratio_pct ??
    ssot?.floor_area_ratio ??
    ssot?.far_pct ??
    ssot?.far ??
    br?.vlRat ??
    br?.farPct ??
    0
  );

  const rawFloorsAbove = Number(
    raw?.floors_above ??
    raw?.floorsAbove ??
    ssot?.floors_above ??
    ssot?.grnd_flr_cnt ??
    br?.grndFlrCnt ??
    0
  );
  const floorsAbove = Number.isFinite(rawFloorsAbove) && rawFloorsAbove >= 0 ? rawFloorsAbove : 0;

  const rawFloorsBelow = Number(
    raw?.floors_below ??
    raw?.floorsBelow ??
    ssot?.floors_below ??
    ssot?.ugrnd_flr_cnt ??
    br?.ugrndFlrCnt ??
    0
  );
  const floorsBelow = Number.isFinite(rawFloorsBelow) && rawFloorsBelow >= 0 ? rawFloorsBelow : 0;

  const structure =
    cleanBuildingLedgerString(
      raw?.structure ??
      ssot?.structure ??
      ssot?.strct_cd_nm ??
      br?.strctCdNm
    ) ?? UNVERIFIED_LEDGER_LABEL;

  const mainUsage =
    cleanBuildingLedgerString(
      raw?.main_usage ??
      raw?.mainUsage ??
      ssot?.main_usage ??
      ssot?.main_purps_cd_nm ??
      ssot?.asset_type ??
      br?.mainPurpsCdNm
    ) ?? UNVERIFIED_LEDGER_LABEL;

  const rawParking = Number(
    raw?.parking_spaces ??
    raw?.parkingSpaces ??
    ssot?.parking_spaces ??
    ssot?.parking_total ??
    br?.totPkngCnt ??
    br?.parkingTotal ??
    0
  );
  const parkingSpaces = Number.isFinite(rawParking) && rawParking >= 0 ? rawParking : 0;

  const rawElevators = Number(
    raw?.elevators ??
    raw?.elevator_count ??
    ssot?.elevators ??
    ssot?.elevator_total ??
    ssot?.elevator_count ??
    br?.rideUseElvtCnt ??
    br?.elevatorTotal ??
    0
  );
  const elevators = Number.isFinite(rawElevators) && rawElevators >= 0 ? rawElevators : 0;

  const completionDate =
    normalizeCompletionDate(
      raw?.completion_date ??
      raw?.completionDate ??
      ssot?.completion_date ??
      ssot?.use_apr_day ??
      ssot?.completion_year ??
      br?.useAprDay
    ) ?? UNVERIFIED_LEDGER_LABEL;

  return {
    totalGrossAreaSqm: Math.round(totalGrossAreaSqm * 100) / 100,
    totalGrossAreaPyeong,
    exclusiveAreaSqm: exclusiveAreaSqm ? Number(exclusiveAreaSqm) : undefined,
    exclusiveAreaPyeong,
    buildingCoverageRatioPct: Math.round(buildingCoverageRatioPct * 100) / 100,
    floorAreaRatioPct: Math.round(floorAreaRatioPct * 100) / 100,
    floorsAbove,
    floorsBelow,
    structure,
    mainUsage,
    parkingSpaces,
    elevators,
    completionDate,
  };
}
