import {
  classifyAndAnalyzeRentroll,
  type RentrollUnitRow,
  type RentrollAnalysisResult,
} from '../../common-pipeline/rentroll-classifier';

export type RentrollTier = 'none' | 'minimum' | 'standard' | 'complete';

export interface RentrollTierClassification {
  tier: RentrollTier;
  allowedMetrics: Array<'simple_rent_total' | 'noi' | 'gop' | 'cap_rate' | 'dcf_irr'>;
  analysis: RentrollAnalysisResult;
}

export class RentrollTierEngine {
  classify(
    rows?: RentrollUnitRow[],
    controlTotals?: { depositKrw?: number; monthlyRentKrw?: number },
    advancedMeta?: {
      hasAdminFeeSpecified?: boolean;
      hasContractDates?: boolean;
      hasRenewalRightsTracked?: boolean;
    }
  ): RentrollTierClassification {
    const analysis = classifyAndAnalyzeRentroll(rows, controlTotals);

    let tier: RentrollTier = 'none';

    if (analysis.tier === 'no_data') {
      tier = 'none';
    } else if (analysis.tier === 'total_aggregate') {
      tier = 'minimum';
    } else {
      // floor_summary or full_unit_level
      if (advancedMeta?.hasContractDates && advancedMeta?.hasRenewalRightsTracked) {
        tier = 'complete';
      } else if (advancedMeta?.hasAdminFeeSpecified || rows?.some((r) => (r.adminFeeKrw ?? 0) > 0)) {
        tier = 'standard';
      } else {
        tier = 'minimum';
      }
    }

    const allowedMetrics: Array<'simple_rent_total' | 'noi' | 'gop' | 'cap_rate' | 'dcf_irr'> = [];

    if (tier === 'minimum') {
      allowedMetrics.push('simple_rent_total');
    } else if (tier === 'standard') {
      allowedMetrics.push('simple_rent_total', 'noi', 'gop', 'cap_rate');
    } else if (tier === 'complete') {
      allowedMetrics.push('simple_rent_total', 'noi', 'gop', 'cap_rate', 'dcf_irr');
    }

    return {
      tier,
      allowedMetrics,
      analysis,
    };
  }

  assertMetricEligibility(
    metric: 'simple_rent_total' | 'noi' | 'gop' | 'cap_rate' | 'dcf_irr',
    tier: RentrollTier
  ): void {
    if (tier === 'none') {
      throw new Error(`INSUFFICIENT_RENTROLL_TIER: 임대차 정보 없음 (tier: none) — ${metric} 산출 불가`);
    }

    if (tier === 'minimum' && (metric === 'noi' || metric === 'gop' || metric === 'cap_rate' || metric === 'dcf_irr')) {
      throw new Error(
        `INSUFFICIENT_RENTROLL_TIER: 단순 임대수입만 존재 (tier: minimum) — 관리비 미확인으로 ${metric} 산출 불가`
      );
    }

    if (tier === 'standard' && metric === 'dcf_irr') {
      throw new Error(
        `INSUFFICIENT_RENTROLL_TIER: 계약만료일 미확인 (tier: standard) — 현금흐름(DCF/IRR) 산출 불가`
      );
    }
  }
}
