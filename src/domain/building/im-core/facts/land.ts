/**
 * @file src/domain/building/im-core/facts/land.ts
 * @description Pure domain facts extraction for Land & Zoning.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

export interface PureLandFacts {
  landAreaSqm: number;
  landAreaPyeong: number;
  officialLandPriceWonSqm: number;
  officialLandPricePyeong: number;
  officialTotalLandPriceWon: number;
  zoning: string;
  roadConditions: string;
  terrainShape: string;
  usageRegulation: string[];
  pnu?: string;
}

export function extractLandFacts(raw: Record<string, any>): PureLandFacts {
  const ssot = raw?.ssot_summary || raw?.layers?.location || raw || {};
  const landAreaSqm = Number(
    raw?.land_area_sqm ??
    ssot?.land_area_sqm ??
    ssot?.plat_area_sqm ??
    ssot?.site_area_sqm ??
    raw?.plat_area_sqm ??
    0
  );

  const landAreaPyeong = landAreaSqm > 0
    ? Math.round((landAreaSqm / 3.305785) * 100) / 100
    : 0;

  const officialLandPriceWonSqm = Number(
    raw?.official_land_price_won_sqm ??
    ssot?.official_land_price_won_sqm ??
    ssot?.public_land_price_sqm ??
    0
  );

  const officialLandPricePyeong = officialLandPriceWonSqm > 0
    ? Math.round(officialLandPriceWonSqm * 3.305785)
    : 0;

  const officialTotalLandPriceWon = landAreaSqm > 0 && officialLandPriceWonSqm > 0
    ? Math.round(landAreaSqm * officialLandPriceWonSqm)
    : 0;

  const zoning = String(
    raw?.zoning ??
    ssot?.zoning ??
    ssot?.land_use_zone ??
    ssot?.zoning_name ??
    '일반상업지역'
  );

  const roadConditions = String(
    raw?.road_conditions ??
    ssot?.road_conditions ??
    ssot?.road_width_desc ??
    '25m 광대로 접함'
  );

  const terrainShape = String(
    raw?.terrain_shape ??
    ssot?.terrain_shape ??
    '세로장방형 평지'
  );

  const usageRegulation = Array.isArray(raw?.usage_regulation)
    ? raw.usage_regulation
    : Array.isArray(ssot?.usage_regulation)
    ? ssot.usage_regulation
    : ['과밀억제권역', '토지거래허가구역 외'];

  const pnu = raw?.pnu ?? ssot?.pnu;

  return {
    landAreaSqm: Math.round(landAreaSqm * 100) / 100,
    landAreaPyeong,
    officialLandPriceWonSqm,
    officialLandPricePyeong,
    officialTotalLandPriceWon,
    zoning,
    roadConditions,
    terrainShape,
    usageRegulation,
    pnu,
  };
}
