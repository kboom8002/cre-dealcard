export interface Parcel {
  parcelId: string;
  pnu?: string;
  address: string;
  landAreaSqm: number;
  status: 'SUCCESS' | 'FETCH_FAILED';
  errorMessage?: string;
}

export interface MultiParcelResult {
  dealId: string;
  parcels: Parcel[];
  totalLandAreaSqm: number;
  hasPartialFailure: boolean;
  successfulParcelCount: number;
  failedParcelCount: number;
}

export class ParcelManager {
  aggregateParcels(dealId: string, parcels: Parcel[]): MultiParcelResult {
    if (!parcels || parcels.length === 0) {
      throw new Error(`PARCEL_MANAGER_ERROR: No parcels provided for deal ${dealId}`);
    }

    const failed = parcels.filter((p) => p.status === 'FETCH_FAILED');
    const successful = parcels.filter((p) => p.status === 'SUCCESS');

    if (failed.length > 0) {
      // Partial failure protection: do not silently fabricate a whole-deal sum
      return {
        dealId,
        parcels,
        totalLandAreaSqm: 0,
        hasPartialFailure: true,
        successfulParcelCount: successful.length,
        failedParcelCount: failed.length,
      };
    }

    const totalLandAreaSqm = successful.reduce((sum, p) => sum + p.landAreaSqm, 0);

    return {
      dealId,
      parcels,
      totalLandAreaSqm: Math.round(totalLandAreaSqm * 100) / 100,
      hasPartialFailure: false,
      successfulParcelCount: successful.length,
      failedParcelCount: 0,
    };
  }
}
