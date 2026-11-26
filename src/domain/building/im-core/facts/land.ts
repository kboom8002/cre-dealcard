/**
 * @file src/domain/building/im-core/facts/land.ts
 * @description Pure domain facts extraction for Land & Zoning.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

import { m2ToPyeong } from './area';

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

const UNVERIFIED_LEDGER_LABEL = '공적장부 확인 필요';

function cleanLedgerString(val: unknown): string | null {
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

export function extractLandFacts(raw: Record<string, any>): PureLandFacts {
  const ssot = raw?.ssot_summary || raw?.layers?.location || raw || {};
  const enrichment = raw?.enrichment && typeof raw.enrichment === 'object' ? raw.enrichment : null;
  const landUsePlan =
    (enrichment?.landUsePlan && typeof enrichment.landUsePlan === 'object' ? enrichment.landUsePlan : null) ||
    (raw?.landUsePlan && typeof raw.landUsePlan === 'object' ? raw.landUsePlan : null) ||
    (raw?.land_use_plan && typeof raw.land_use_plan === 'object' ? raw.land_use_plan : null);
  const officialLandPriceObj =
    (enrichment?.officialLandPrice && typeof enrichment.officialLandPrice === 'object'
      ? enrichment.officialLandPrice
      : null) ||
    (enrichment?.landPriceHistory && typeof enrichment.landPriceHistory === 'object'
      ? enrichment.landPriceHistory
      : null);
  const permitZoneObj =
    (enrichment?.permitZone && typeof enrichment.permitZone === 'object' ? enrichment.permitZone : null) ||
    (raw?.permitZone && typeof raw.permitZone === 'object' ? raw.permitZone : null) ||
    (raw?.permit_zone && typeof raw.permit_zone === 'object' ? raw.permit_zone : null);

  const landAreaSqm = Number(
    raw?.land_area_sqm ??
    ssot?.land_area_sqm ??
    ssot?.plat_area_sqm ??
    ssot?.site_area_sqm ??
    raw?.plat_area_sqm ??
    0
  );

  const landAreaPyeong = landAreaSqm > 0
    ? Math.round(m2ToPyeong(landAreaSqm) * 100) / 100
    : 0;

  const officialLandPriceWonSqm = Number(
    raw?.official_land_price_won_sqm ??
    ssot?.official_land_price_won_sqm ??
    ssot?.public_land_price_sqm ??
    officialLandPriceObj?.pricePerSqm ??
    officialLandPriceObj?.latestPricePerSqm ??
    0
  );

  const officialLandPricePyeong = officialLandPriceWonSqm > 0
    ? Math.round(officialLandPriceWonSqm * 3.305785)
    : 0;

  const officialTotalLandPriceWon = landAreaSqm > 0 && officialLandPriceWonSqm > 0
    ? Math.round(landAreaSqm * officialLandPriceWonSqm)
    : 0;

  const zoning =
    cleanLedgerString(
      raw?.zoning ??
      ssot?.zoning ??
      ssot?.land_use_zone ??
      ssot?.zoning_name ??
      landUsePlan?.zoningDistrict ??
      landUsePlan?.zoning ??
      landUsePlan?.mainZone
    ) ?? UNVERIFIED_LEDGER_LABEL;

  const roadConditions =
    cleanLedgerString(
      raw?.road_conditions ??
      raw?.roadConditions ??
      ssot?.road_conditions ??
      ssot?.road_width_desc ??
      landUsePlan?.roadConditions ??
      landUsePlan?.roadWidthDesc
    ) ?? '';

  const terrainShape =
    cleanLedgerString(
      raw?.terrain_shape ??
      raw?.terrainShape ??
      ssot?.terrain_shape ??
      landUsePlan?.terrainShape
    ) ?? UNVERIFIED_LEDGER_LABEL;

  const rawRegulationsSource = Array.isArray(raw?.usage_regulation)
    ? raw.usage_regulation
    : Array.isArray(raw?.usageRegulation)
    ? raw.usageRegulation
    : Array.isArray(ssot?.usage_regulation)
    ? ssot.usage_regulation
    : Array.isArray(landUsePlan?.regulations)
    ? landUsePlan.regulations
    : Array.isArray(landUsePlan?.usageRegulation)
    ? landUsePlan.usageRegulation
    : null;

  const cleanedRegulations: string[] = rawRegulationsSource
    ? (rawRegulationsSource as unknown[])
        .map((item: unknown) => cleanLedgerString(item))
        .filter((item: string | null): item is string => Boolean(item))
    : [];

  if (permitZoneObj && typeof permitZoneObj.isPermitZone === 'boolean') {
    const permitLabel = permitZoneObj.isPermitZone
      ? '토지거래허가구역 해당'
      : '토지거래허가구역 비해당';
    if (!cleanedRegulations.some((r: string) => r.includes('토지거래허가구역'))) {
      cleanedRegulations.push(permitLabel);
    }
  }

  const usageRegulation =
    cleanedRegulations.length > 0 ? cleanedRegulations : [UNVERIFIED_LEDGER_LABEL];

  const pnu = cleanLedgerString(raw?.pnu ?? ssot?.pnu ?? enrichment?.pnu) ?? undefined;

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
