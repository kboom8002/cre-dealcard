import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { buildEffectiveBaseline } from '@/domain/building/common-pipeline/baseline-builder';
import { CorePackageAssembler } from '@/domain/building/common-pipeline/core-assembler';
import { MobileIMPublicationService } from '@/domain/building/mobile-im-publication/service';

describe('Mobile IM Publication Flow & L1/L1.5 Gating (CIM-0501~0504 / Phase M5)', () => {
  it('should assemble L1 mobile package, evaluate P-MOBILE-L1, record approval and publish', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new MobileIMPublicationService(repository);

    const baseline = buildEffectiveBaseline({
      dealId: 'deal-mobile-001',
      physical: {
        landAreaSqm: 500,
        grossFloorAreaSqm: 2000,
      },
      commercial: {
        askingPriceKrw: 15000000000,
        monthlyRentKrw: 45000000,
      },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-m-001');

    const result = await service.publishMobileIM(
      corePackage,
      'L1',
      [{ subject: 'asking_price', value: 15000000000 }],
      'broker-kim'
    );

    expect(result.package.level).toBe('L1');
    expect(result.package.sections.some((s) => s.sectionType === 'property_overview')).toBe(true);
    expect(result.package.sections.some((s) => s.sectionType === 'investment_thesis')).toBe(false); // L1 has no thesis
    expect(result.report.blockerCount).toBe(0);
    expect(result.release.status).toBe('PUBLISHED');
  });

  it('should include investment thesis for L1.5 and pass P-MOBILE-L15', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new MobileIMPublicationService(repository);

    const baseline = buildEffectiveBaseline({
      dealId: 'deal-mobile-002',
      physical: {
        landAreaSqm: 600,
        grossFloorAreaSqm: 2400,
      },
      commercial: {
        askingPriceKrw: 20000000000,
        monthlyRentKrw: 60000000,
      },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-m-002');

    const result = await service.publishMobileIM(
      corePackage,
      'L1.5',
      [{ subject: 'asking_price', value: 20000000000 }],
      'broker-lee'
    );

    expect(result.package.level).toBe('L1.5');
    expect(result.package.sections.some((s) => s.sectionType === 'investment_thesis')).toBe(true);
    expect(result.report.blockerCount).toBe(0);
    expect(result.release.status).toBe('PUBLISHED');
  });

  it('should block publication and report failure if persona phrase is detected', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new MobileIMPublicationService(repository);

    const baseline = buildEffectiveBaseline({
      dealId: 'deal-mobile-persona',
      physical: { landAreaSqm: 500, grossFloorAreaSqm: 2000 },
      commercial: { askingPriceKrw: 10000000000, monthlyRentKrw: 30000000 },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-m-003');

    // Simulate manually corrupted section containing forbidden persona label
    const corruptService = new MobileIMPublicationService(repository);
    const evaluator = (corruptService as any).evaluator;

    const corruptedPkg = {
      packageId: 'pkg-persona',
      dealId: 'deal-mobile-persona',
      corePackageHash: corePackage.packageHash,
      level: 'L1' as const,
      sections: [
        {
          sectionType: 'property_overview',
          title: '60대 자산가를 위한 추천 매물',
          content: '본 물건은 은퇴 자산가 맞춤형입니다.',
        },
        { sectionType: 'financial_summary', title: '재무', content: '양호' },
        { sectionType: 'lease_status', title: '임대', content: '양호' },
        { sectionType: 'disclaimer', title: '면책', content: '안내' },
      ],
      claims: [],
      harnessReportId: 'rep-01',
      packageHash: 'sha256:abc',
      createdAt: new Date().toISOString(),
    };

    const report = await evaluator.evaluateProfile('P-MOBILE-L1', 'run-m-003', corruptedPkg);
    expect(report.blockerCount).toBeGreaterThan(0);
    const personaGate = report.results.find((r: any) => r.gateId === 'GATE-MOBILE-PERSONA-ISOLATION');
    expect(personaGate?.status).toBe('FAIL');
  });
});
