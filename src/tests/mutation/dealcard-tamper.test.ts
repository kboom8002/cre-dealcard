import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { DealcardPublicationService } from '@/domain/building/dealcard-publication/service';
import { adaptPackageToLegacyView } from '@/domain/building/dealcard-publication/compat-adapter';
import { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';

describe('Dealcard Tamper Defense & Withdrawal (CIM-0304 / PR-M3-04)', () => {
  it('should block publication when exact address or PII is injected through tampering', async () => {
    const repository = new InMemoryPipelineRepository();
    const service = new DealcardPublicationService(repository);

    // Malicious or accidental memo containing exact house number and tenant owner identity
    const maliciousMemo = '강남구 역삼동 649-4번지 홍길동 소유 빌딩 200억 매각';
    const result = await service.publishFromMemo('deal-hack', maliciousMemo, 'broker-1');

    // Verify location is generalized and does NOT contain exact bunji "649-4"
    expect(result.package.bandedLocation).not.toContain('649-4');
    expect(result.rendered.html).not.toContain('649-4');
    expect(result.rendered.html).not.toContain('홍길동');
  });

  it('should mark dealcard as non-published and block access when withdrawn or stale', async () => {
    const repository = new InMemoryPipelineRepository();
    const ledger = new ApprovalLedgerService();
    const service = new DealcardPublicationService(repository, ledger);

    const memo = '마포구 홍대입구역 인근 대지 80평 90억 매각';
    const result = await service.publishFromMemo('deal-withdraw', memo, 'broker-1');

    expect(result.release.status).toBe('PUBLISHED');

    // Withdraw the release (e.g., owner withdrew mandate)
    const withdrawnRelease = await ledger.updateReleaseStatus(result.release.id, 'WITHDRAWN');
    const legacyView = adaptPackageToLegacyView('deal-withdraw', result.package, withdrawnRelease);

    expect(legacyView.isPublished).toBe(false);
    expect(legacyView.status).toBe('WITHDRAWN');
  });
});
