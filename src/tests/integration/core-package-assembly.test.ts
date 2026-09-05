import { describe, it, expect } from 'vitest';
import { buildEffectiveBaseline } from '@/domain/building/common-pipeline/baseline-builder';
import { CorePackageAssembler } from '@/domain/building/common-pipeline/core-assembler';

describe('Core Package Assembly & P-CORE-PACKAGE Profile (CIM-0406 / PR-M4-06)', () => {
  it('should assemble verified CorePackage and pass all P-CORE-PACKAGE gates', async () => {
    const baseline = buildEffectiveBaseline({
      dealId: 'deal-core-100',
      physical: {
        landAreaSqm: 330.5785,
        grossFloorAreaSqm: 1322.314,
        leasableAreaSqm: 991.7355,
      },
      commercial: {
        askingPriceKrw: 12000000000,
        monthlyRentKrw: 30000000,
      },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage, report } = await assembler.assembleCorePackage(baseline, 'run-core-001');

    expect(corePackage.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(corePackage.unitPrices.pricePerPyeongLand).toBe(120000000);
    expect(corePackage.unitPrices.pricePerPyeongGross).toBe(30000000);
    expect(report.blockerCount).toBe(0);
  });
});
