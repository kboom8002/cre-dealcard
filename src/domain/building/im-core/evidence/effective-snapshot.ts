import { randomUUID } from 'crypto';
import type { Parcel } from './parcel-manager';
import { ParcelManager } from './parcel-manager';
import {
  calculateUnitPriceMetrics,
  type UnitPriceMetrics,
} from '../../common-pipeline/area-calculator';
import { computeTargetHash } from '../target-hash';

export interface AreaDenominators {
  landAreaTotal: number;       // 1. 대지면적 합산
  buildingAreaTotal: number;   // 2. 건축면적 (표제부)
  grossFloorArea: number;      // 3. 연면적
  exclusiveLeaseArea: number;  // 4. 전용/임대면적
}

export interface EffectiveSnapshot {
  snapshotId: string;
  dealId: string;
  snapshotHash: string;
  areas: AreaDenominators;
  pricing: {
    askingPriceKrw: number;
    totalDepositKrw?: number;
    monthlyRentKrw?: number;
    monthlyAdminFeeKrw?: number;
  };
  parcels: Parcel[];
  unitPrices: UnitPriceMetrics;
  asOf: string;
  createdAt: string;
}

export function buildEffectiveSnapshot(params: {
  dealId: string;
  parcels: Parcel[];
  buildingAreaTotal?: number;
  grossFloorArea: number;
  exclusiveLeaseArea?: number;
  pricing: {
    askingPriceKrw: number;
    totalDepositKrw?: number;
    monthlyRentKrw?: number;
    monthlyAdminFeeKrw?: number;
  };
  asOf?: string;
}): EffectiveSnapshot {
  const parcelManager = new ParcelManager();
  const parcelResult = parcelManager.aggregateParcels(params.dealId, params.parcels);

  if (parcelResult.hasPartialFailure) {
    throw new Error(
      `PARTIAL_PARCEL_FAILURE: Cannot build snapshot due to ${parcelResult.failedParcelCount} failed parcel lookups`
    );
  }

  const areas: AreaDenominators = {
    landAreaTotal: parcelResult.totalLandAreaSqm,
    buildingAreaTotal: params.buildingAreaTotal ?? 0,
    grossFloorArea: params.grossFloorArea,
    exclusiveLeaseArea: params.exclusiveLeaseArea ?? 0,
  };

  const unitPrices = calculateUnitPriceMetrics(
    params.pricing.askingPriceKrw,
    {
      landAreaSqm: areas.landAreaTotal,
      grossFloorAreaSqm: areas.grossFloorArea,
      exclusiveAreaSqm: areas.exclusiveLeaseArea,
      leasableAreaSqm: areas.exclusiveLeaseArea,
    },
    params.pricing.monthlyRentKrw
  );

  const snapshotId = randomUUID();
  const asOf = params.asOf ?? new Date().toISOString();
  const createdAt = new Date().toISOString();

  const snapshotHash = computeTargetHash({
    body: {
      snapshotId,
      dealId: params.dealId,
      areas,
      pricing: params.pricing,
      unitPrices,
      asOf,
    },
    releaseTier: 'effective_baseline',
    policyVersion: '2026-08-31',
  });

  return {
    snapshotId,
    dealId: params.dealId,
    snapshotHash,
    areas,
    pricing: params.pricing,
    parcels: params.parcels,
    unitPrices,
    asOf,
    createdAt,
  };
}
