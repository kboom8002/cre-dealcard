import { describe, it, expect } from 'vitest';
import { parseMemoToObservations } from '@/domain/building/memo-intake/parser';
import { generateDealcardPackage } from '@/domain/building/dealcard-publication/banding-engine';
import { HarnessEvaluator } from '@/assurance/im-harness/evaluator';
import { registerDealcardBlindProfile } from '@/assurance/im-harness/profiles/dealcard-profile';

describe('Dealcard Banding & P-DEALCARD-BLIND Harness (CIM-0302 / PR-M3-02)', () => {
  it('should band price, generalize location, and pass P-DEALCARD-BLIND profile', async () => {
    const rawMemo = '영등포 당산역 인근 대지 100평 근생 120억 매각 의뢰. 당산동 123-4 위치.';
    const observationSet = parseMemoToObservations(rawMemo);
    const dealcardPkg = generateDealcardPackage(observationSet);

    expect(dealcardPkg.bandedPrice).toBe('120억~130억 원대');
    expect(dealcardPkg.bandedLocation).not.toContain('123-4');
    expect(dealcardPkg.bandedLocation).toContain('당산역 인근');
    expect(dealcardPkg.privacyGuaranteed).toBe(true);
    expect(dealcardPkg.bandedYield).toBeUndefined(); // 원문에 없으므로 날조 금지

    const evaluator = new HarnessEvaluator('2026-08-31');
    registerDealcardBlindProfile(evaluator);

    const report = await evaluator.evaluateProfile('P-DEALCARD-BLIND', 'run-001', dealcardPkg);
    expect(report.blockerCount).toBe(0);
    expect(report.results.every((r) => r.status === 'PASS')).toBe(true);
  });

  it('should block dealcard package if exact bunji is leaked into location', async () => {
    const evaluator = new HarnessEvaluator('2026-08-31');
    registerDealcardBlindProfile(evaluator);

    const leakedPkg = {
      packageId: 'test-pkg',
      memoRawHash: 'sha256:abc',
      bandedLocation: '영등포구 당산동 123-4번지',
      bandedPrice: '120억 원대',
      bandedLandArea: '대지 100평',
      highlights: ['핵심 거점'],
      privacyGuaranteed: true,
      packageHash: 'sha256:def',
      createdAt: new Date().toISOString(),
    };

    const report = await evaluator.evaluateProfile('P-DEALCARD-BLIND', 'run-002', leakedPkg);
    expect(report.blockerCount).toBe(1);
    const privacyGate = report.results.find((r) => r.gateId === 'GATE-BLIND-PRIVACY');
    expect(privacyGate?.status).toBe('FAIL');
  });
});
