export interface ResolvedEnrichment {
  landUsePlan: any | null;
  buildingRegister: any | null;
  locationPoi: any | null;
  comparableTransactions: any[];
  cadastralMapImage: any | null;
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
    landUsePlan: enrichment.landUsePlan ?? external.landUsePlan ?? null,
    buildingRegister: enrichment.buildingRegister ?? external.buildingRegister ?? null,
    locationPoi: enrichment.locationPoi ?? external.locationPoi ?? null,
    comparableTransactions: enrichment.comparableTransactions ?? external.comparableTransactions ?? [],
    cadastralMapImage: enrichment.cadastralMapImage ?? external.cadastralMapImage ?? null,
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
