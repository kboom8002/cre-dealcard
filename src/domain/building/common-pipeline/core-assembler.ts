import { randomUUID } from 'crypto';
import type { EffectiveBaseline } from './baseline-builder';
import { calculateUnitPriceMetrics, type UnitPriceMetrics } from './area-calculator';
import { classifyAndAnalyzeRentroll, type RentrollAnalysisResult, type RentrollUnitRow } from './rentroll-classifier';
import { HarnessEvaluator, type GateReport } from '@/assurance/im-harness/evaluator';
import { registerCorePackageProfile } from '@/assurance/im-harness/profiles/core-profile';
import { computeTargetHash } from '../im-core/target-hash';

export interface CorePackage {
  packageId: string;
  dealId: string;
  baselineHash: string;
  physical: EffectiveBaseline['physical'];
  commercial: EffectiveBaseline['commercial'];
  unitPrices: UnitPriceMetrics;
  rentroll: RentrollAnalysisResult;
  harnessReportId: string;
  packageHash: string;
  createdAt: string;
}

export class CorePackageAssembler {
  private evaluator: HarnessEvaluator;

  constructor(evaluator?: HarnessEvaluator) {
    this.evaluator = evaluator ?? new HarnessEvaluator('2026-08-31');
    registerCorePackageProfile(this.evaluator);
  }

  async assembleCorePackage(
    baseline: EffectiveBaseline,
    artifactRunId: string,
    rentrollRows?: RentrollUnitRow[]
  ): Promise<{ corePackage: CorePackage; report: GateReport }> {
    // 1. Calculate Unit Price Metrics
    const unitPrices = calculateUnitPriceMetrics(
      baseline.commercial.askingPriceKrw,
      {
        landAreaSqm: baseline.physical.landAreaSqm,
        grossFloorAreaSqm: baseline.physical.grossFloorAreaSqm,
        leasableAreaSqm: baseline.physical.leasableAreaSqm,
        exclusiveAreaSqm: baseline.physical.exclusiveAreaSqm,
      },
      baseline.commercial.monthlyRentKrw
    );

    // 2. Classify and Analyze Rent Roll
    const rentroll = classifyAndAnalyzeRentroll(rentrollRows, {
      depositKrw: baseline.commercial.totalDepositKrw,
      monthlyRentKrw: baseline.commercial.monthlyRentKrw,
    });

    const context = {
      physical: baseline.physical,
      commercial: baseline.commercial,
      unitPrices,
      rentroll,
    };

    // 3. Evaluate P-CORE-PACKAGE Harness Profile
    const report = await this.evaluator.evaluateProfile('P-CORE-PACKAGE', artifactRunId, context);

    if (report.blockerCount > 0) {
      throw new Error(`CORE_PACKAGE_BLOCKED: 공통 하네스 검증 차단 (${report.blockerCount}건 차단)`);
    }

    const packageId = randomUUID();
    const createdAt = new Date().toISOString();

    const packageHash = computeTargetHash({
      body: {
        packageId,
        dealId: baseline.dealId,
        baselineHash: baseline.baselineHash,
        physical: baseline.physical,
        commercial: baseline.commercial,
        unitPrices,
        rentroll,
        harnessReportId: report.reportId,
      },
      releaseTier: 'core_package',
      policyVersion: '2026-08-31',
    });

    const corePackage: CorePackage = {
      packageId,
      dealId: baseline.dealId,
      baselineHash: baseline.baselineHash,
      physical: baseline.physical,
      commercial: baseline.commercial,
      unitPrices,
      rentroll,
      harnessReportId: report.reportId,
      packageHash,
      createdAt,
    };

    return { corePackage, report };
  }
}
