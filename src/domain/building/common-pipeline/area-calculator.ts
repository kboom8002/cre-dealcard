/**
 * 4 Area Denominators & Accurate Price Unit Calculations
 * @see CREDEAL_IM_MODERNIZATION/references/upstream/pipeline/04_STAGE_CONTRACTS.md §P40
 * Invariant Rule #4:
 * 1. land_area (대지면적)
 * 2. gross_floor_area (연면적)
 * 3. exclusive_area (전용면적)
 * 4. leasable_area (임대면적 / 계약면적)
 */

import { sqmToPyeong, SQM_RATIO } from '@/lib/utils/area-conversion';

export const SQM_PER_PYEONG = SQM_RATIO;

export interface AreaDenominators {
  landAreaSqm: number;
  grossFloorAreaSqm: number;
  exclusiveAreaSqm?: number;
  leasableAreaSqm?: number;
}

export interface UnitPriceMetrics {
  pricePerPyeongLand: number;       // 매매가 / 대지평수
  pricePerPyeongGross: number;      // 매매가 / 연면적평수
  rentPerPyeongLeasable?: number;   // 월임대료 / 임대평수
  rentPerPyeongExclusive?: number;  // 월임대료 / 전용평수
}

export function calculateUnitPriceMetrics(
  askingPriceKrw: number,
  areas: AreaDenominators,
  monthlyRentKrw?: number
): UnitPriceMetrics {
  if (areas.landAreaSqm <= 0 || areas.grossFloorAreaSqm <= 0) {
    throw new Error('INVALID_DENOMINATOR: Land area and Gross Floor Area must be positive numbers');
  }

  const landPyeong = sqmToPyeong(areas.landAreaSqm);
  const grossPyeong = sqmToPyeong(areas.grossFloorAreaSqm);

  const pricePerPyeongLand = Math.round(askingPriceKrw / landPyeong);
  const pricePerPyeongGross = Math.round(askingPriceKrw / grossPyeong);

  let rentPerPyeongLeasable: number | undefined;
  if (monthlyRentKrw !== undefined && areas.leasableAreaSqm && areas.leasableAreaSqm > 0) {
    const leasablePyeong = sqmToPyeong(areas.leasableAreaSqm);
    rentPerPyeongLeasable = Math.round(monthlyRentKrw / leasablePyeong);
  }

  let rentPerPyeongExclusive: number | undefined;
  if (monthlyRentKrw !== undefined && areas.exclusiveAreaSqm && areas.exclusiveAreaSqm > 0) {
    const exclusivePyeong = sqmToPyeong(areas.exclusiveAreaSqm);
    rentPerPyeongExclusive = Math.round(monthlyRentKrw / exclusivePyeong);
  }

  return {
    pricePerPyeongLand,
    pricePerPyeongGross,
    rentPerPyeongLeasable,
    rentPerPyeongExclusive,
  };
}

/**
 * G37 Denominator Consistency Guard
 * Ensures unit price calculation explicitly identifies whether denominator is Land or Gross Area.
 */
export function validateDenominatorIntegrity(
  metricLabel: string,
  denominatorKind: 'land' | 'gross_floor' | 'leasable' | 'exclusive'
): boolean {
  if (metricLabel.includes('대지') && denominatorKind !== 'land') {
    return false;
  }
  if (metricLabel.includes('연면적') && denominatorKind !== 'gross_floor') {
    return false;
  }
  if (metricLabel.includes('전용') && denominatorKind !== 'exclusive') {
    return false;
  }
  if (metricLabel.includes('임대') && denominatorKind !== 'leasable') {
    return false;
  }
  return true;
}
