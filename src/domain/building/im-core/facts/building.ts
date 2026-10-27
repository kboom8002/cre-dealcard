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

export function extractBuildingSpecs(raw: Record<string, any>): PureBuildingSpecs {
  const ssot = raw?.ssot_summary || raw?.layers?.building || raw || {};

  const totalGrossAreaSqm = Number(
    raw?.total_gross_area_sqm ??
    ssot?.total_gross_area_sqm ??
    ssot?.total_area_sqm ??
    ssot?.gross_floor_area_sqm ??
    ssot?.total_area ??
    raw?.gross_floor_area_sqm ??
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
    ssot?.building_coverage_ratio_pct ??
    ssot?.building_coverage_ratio ??
    ssot?.bcr ??
    0
  );

  const floorAreaRatioPct = Number(
    raw?.floor_area_ratio_pct ??
    ssot?.floor_area_ratio_pct ??
    ssot?.floor_area_ratio ??
    ssot?.far ??
    0
  );

  const floorsAbove = Number(
    raw?.floors_above ??
    ssot?.floors_above ??
    ssot?.grnd_flr_cnt ??
    1
  );

  const floorsBelow = Number(
    raw?.floors_below ??
    ssot?.floors_below ??
    ssot?.ugrnd_flr_cnt ??
    0
  );

  const structure = String(
    raw?.structure ??
    ssot?.structure ??
    ssot?.strct_cd_nm ??
    '철근콘크리트구조'
  );

  const mainUsage = String(
    raw?.main_usage ??
    ssot?.main_usage ??
    ssot?.main_purps_cd_nm ??
    '제1·2종 근린생활시설'
  );

  const parkingSpaces = Number(
    raw?.parking_spaces ??
    ssot?.parking_spaces ??
    ssot?.parking_total ??
    0
  );

  const elevators = Number(
    raw?.elevators ??
    ssot?.elevators ??
    ssot?.elevator_total ??
    (floorsAbove >= 5 ? 1 : 0)
  );

  const completionDate = String(
    raw?.completion_date ??
    ssot?.completion_date ??
    ssot?.use_apr_day ??
    ssot?.completion_year ??
    '2015-06-01'
  );

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
