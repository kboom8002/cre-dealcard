import { computeTargetHash } from '../im-core/target-hash';

export interface PhysicalBaseline {
  landAreaSqm: number;
  grossFloorAreaSqm: number;
  exclusiveAreaSqm?: number;
  leasableAreaSqm?: number;
  buildingCoveragePct?: number;
  floorAreaRatioPct?: number;
  floorsAbove?: number;
  floorsBelow?: number;
}

export interface CommercialBaseline {
  askingPriceKrw: number;
  totalDepositKrw?: number;
  monthlyRentKrw?: number;
  monthlyAdminFeeKrw?: number;
}

export interface ZoningBaseline {
  useDistrict?: string;
  mainUsage?: string;
}

export interface EffectiveBaseline {
  dealId: string;
  baselineHash: string;
  physical: PhysicalBaseline;
  commercial: CommercialBaseline;
  zoning: ZoningBaseline;
  conflicts: any[];
  asOf: string;
  createdAt: string;
}

export function buildEffectiveBaseline(params: {
  dealId: string;
  physical: PhysicalBaseline;
  commercial: CommercialBaseline;
  zoning?: ZoningBaseline;
  conflicts?: any[];
  asOf?: string;
}): EffectiveBaseline {
  const asOf = params.asOf ?? new Date().toISOString();
  const createdAt = new Date().toISOString();
  const zoning = params.zoning ?? {};
  const conflicts = params.conflicts ?? [];

  const baselineHash = computeTargetHash({
    body: {
      dealId: params.dealId,
      physical: params.physical,
      commercial: params.commercial,
      zoning,
      asOf,
    },
    releaseTier: 'effective_baseline',
    policyVersion: '2026-08-31',
  });

  return {
    dealId: params.dealId,
    baselineHash,
    physical: params.physical,
    commercial: params.commercial,
    zoning,
    conflicts,
    asOf,
    createdAt,
  };
}
