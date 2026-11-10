export interface ResolvedEnrichment {
  cadastralMapImage: any | null;
  locationMapImage: any | null;
  locationPoi: any | null;
  landPrice: any | null;
  landPriceHistory: any | null;
  landUsePlan: any | null;
  landUseRegulations: any | null;
  landUseByParcel: any | null;
  apartmentHouseholds: any | null;
  buildingRegister: any | null;
  registryData?: any | null;
  comparableTransactions: any[];
  commercialDistrict?: any | null;
  commercialData: any | null;
  schoolData: any | null;
  meta: {
    enrichedAt: string | null;
    hasPublicData: boolean;
    hasLandUsePlan: boolean;
    hasCadastralMap: boolean;
    address: string | null;
    errors: { api: string; message: string }[];
  };
}

export function resolveEnrichment(body: Record<string, any>): ResolvedEnrichment {
  const enrichment = body?.enrichment ?? {};
  const external = body?.external_data ?? {};

  return {
    cadastralMapImage: enrichment.cadastralMapImage ?? external.cadastralMapImage ?? null,
    locationMapImage: enrichment.locationMapImage ?? external.locationMapImage ?? null,
    locationPoi: enrichment.locationPoi ?? external.locationPoi ?? null,
    landPrice: enrichment.landPrice ?? external.landPrice ?? null,
    landPriceHistory: enrichment.landPriceHistory ?? external.landPriceHistory ?? null,
    landUsePlan: enrichment.landUsePlan ?? external.landUsePlan ?? null,
    landUseRegulations: enrichment.landUseRegulations ?? external.landUseRegulations ?? null,
    landUseByParcel: enrichment.landUseByParcel ?? external.landUseByParcel ?? null,
    apartmentHouseholds: enrichment.apartmentHouseholds ?? external.apartmentHouseholds ?? null,
    buildingRegister: enrichment.buildingRegister ?? external.buildingRegister ?? null,
    registryData: enrichment.registryData ?? external.registryData ?? null,
    comparableTransactions: enrichment.comparableTransactions ?? external.comparableTransactions ?? [],
    commercialDistrict: enrichment.commercialDistrict ?? external.commercialDistrict ?? null,
    commercialData:
      enrichment.commercialData
      ?? external.commercialData
      ?? enrichment.commercialDistrict
      ?? external.commercialDistrict
      ?? null,
    schoolData: enrichment.schoolData ?? external.schoolData ?? null,
    meta: {
      enrichedAt: enrichment.enrichedAt ?? external.enrichedAt ?? null,
      hasPublicData: enrichment.hasPublicData ?? external.hasPublicData
        ?? !!(enrichment.landUsePlan || enrichment.buildingRegister
              || external.landUsePlan || external.buildingRegister),
      hasLandUsePlan: !!(enrichment.landUsePlan ?? external.landUsePlan),
      hasCadastralMap: !!(enrichment.cadastralMapImage ?? external.cadastralMapImage),
      address: enrichment.address ?? external.address ?? null,
      errors: enrichment.errors ?? external.errors ?? [],
    },
  };
}

export function resolveEnrichmentPayload(
  externalData?: Record<string, any> | null,
  writerEnrichment?: Record<string, any> | null,
) {
  const ext = externalData ?? {};
  const wrt = writerEnrichment ?? {};

  return {
    landUsePlan: ext.landUsePlan ?? wrt.landUsePlan ?? null,
    landUseRegulations: ext.landUseRegulations ?? wrt.landUseRegulations ?? null,
    landUseByParcel: ext.landUseByParcel ?? wrt.landUseByParcel ?? null,
    landPrice: ext.landPrice ?? wrt.landPrice ?? null,
    landPriceHistory: ext.landPriceHistory ?? wrt.landPriceHistory ?? null,
    buildingRegister: ext.buildingRegister ?? wrt.buildingRegister ?? null,
    registryData: ext.registryData ?? wrt.registryData ?? null,
    comparableTransactions: ext.comparableTransactions ?? wrt.comparableTransactions ?? null,
    locationPoi: ext.locationPoi ?? wrt.locationPoi ?? null,
    apartmentHouseholds: ext.apartmentHouseholds ?? wrt.apartmentHouseholds ?? null,
    commercialDistrict: ext.commercialDistrict ?? wrt.commercialDistrict ?? null,
    commercialData:
      ext.commercialData
      ?? wrt.commercialData
      ?? ext.commercialDistrict
      ?? wrt.commercialDistrict
      ?? null,
    schoolData: ext.schoolData ?? wrt.schoolData ?? null,
    cadastralMapImage: ext.cadastralMapImage ?? wrt.cadastralMapImage ?? null,
    locationMapImage: ext.locationMapImage ?? wrt.locationMapImage ?? null,
  };
}
