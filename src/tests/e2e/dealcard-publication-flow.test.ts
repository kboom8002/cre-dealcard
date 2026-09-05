import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { DealcardPublicationService } from '@/domain/building/dealcard-publication/service';

describe('Dealcard End-to-End Publication Flow (CIM-0303 / PR-M3-03)', () => {
  it('should successfully parse memo, band, verify gates, record approval, and publish dealcard', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new DealcardPublicationService(repository);

    const rawMemo = '영등포 당산역 도보 3분 대지 100평 근생 125억 매각 의뢰. 위치 당산동 123-4. 연락처 010-1234-5678';
    const result = await service.publishFromMemo('deal-999', rawMemo, 'broker-007');

    expect(result.package.bandedPrice).toBe('120억~130억 원대');
    expect(result.package.bandedLocation).not.toContain('123-4');
    expect(result.package.bandedLocation).toContain('당산역');
    expect(result.rendered.html).toContain(result.package.bandedLocation);
    expect(result.rendered.html).not.toContain('010-1234-5678'); // PII completely stripped

    expect(result.report.blockerCount).toBe(0);
    expect(result.release.status).toBe('PUBLISHED');
    expect(result.release.channel).toBe('dealcard');
    expect(result.release.approvedApprovalId).toBeDefined();
  });
});
