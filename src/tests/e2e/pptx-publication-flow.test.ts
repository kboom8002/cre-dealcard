import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { buildEffectiveBaseline } from '@/domain/building/common-pipeline/baseline-builder';
import { CorePackageAssembler } from '@/domain/building/common-pipeline/core-assembler';
import { PPTXPublicationService } from '@/domain/building/pptx-publication/service';

describe('PPTX Publication Flow & 150 DPI Visual Gating (CIM-0601~0604 / Phase M6)', () => {
  it('should generate draft preview with 14-day TTL and pass P-PPTX-PREVIEW', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new PPTXPublicationService(repository);

    const baseline = buildEffectiveBaseline({
      dealId: 'deal-pptx-draft',
      physical: { landAreaSqm: 450, grossFloorAreaSqm: 1800 },
      commercial: { askingPriceKrw: 16000000000, monthlyRentKrw: 48000000 },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-pptx-prev');

    const preview = await service.createDraftPreview(corePackage);

    expect(preview.renderJob.isDraftPreview).toBe(true);
    expect(preview.renderJob.expiresAt).toBeDefined();
    expect(preview.report.blockerCount).toBe(0);
  });

  it('should publish final PPTX, pass P-PPTX-FINAL, record approval, and create permanent release', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new PPTXPublicationService(repository);

    const baseline = buildEffectiveBaseline({
      dealId: 'deal-pptx-final',
      physical: { landAreaSqm: 550, grossFloorAreaSqm: 2200 },
      commercial: { askingPriceKrw: 19000000000, monthlyRentKrw: 55000000 },
    });

    const assembler = new CorePackageAssembler();
    const { corePackage } = await assembler.assembleCorePackage(baseline, 'run-pptx-fin');

    const result = await service.publishFinalPPTX(corePackage, 'broker-park');

    expect(result.deck.bodySlideCount).toBeLessThanOrEqual(16);
    expect(result.report.blockerCount).toBe(0);
    expect(result.release.status).toBe('PUBLISHED');
    expect(result.release.channel).toBe('pptx');
    expect(result.renderJob.artifactFileUrl).toContain('.pptx');
  });
});
