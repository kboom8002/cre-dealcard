import { describe, it, expect } from 'vitest';
import { parseMemoToObservations } from '@/domain/building/memo-intake/parser';
import { bandLocation, generateDealcardPackage } from '@/domain/building/dealcard-publication/banding-engine';
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

describe('bandLocation Korean administrative-unit-safe lot stripping (B-01)', () => {
  it('preserves numbered legal dongs (가) while stripping single and multi-lot parcel numbers', () => {
    expect(bandLocation('서울 영등포구 양평동4가 117, 134, 125-2')).toBe('서울 영등포구 양평동4가');
    expect(bandLocation('영등포구 당산동5가 11-47번지')).toBe('영등포구 당산동5가');
    expect(bandLocation('서울 성동구 성수동2가 315-4')).toBe('서울 성동구 성수동2가');
    expect(bandLocation('서울 종로구 종로3가 45-1')).toBe('서울 종로구 종로3가');
    expect(bandLocation('서울 중구 을지로3가 117, 125-2 외 2필지')).toBe('서울 중구 을지로3가');
  });

  it('preserves numbered subway station names and administrative dong/road digits', () => {
    expect(bandLocation('종로3가역')).toBe('종로3가역 인근');
    expect(bandLocation('서울 영등포구 당산역 인근 123-4')).toBe('서울 영등포구 당산역 인근');
    expect(bandLocation('서울 강북구 수유1동 123-4')).toBe('서울 강북구 수유1동');
    expect(bandLocation('서울 영등포구 당산로41길 11-2')).toBe('서울 영등포구 당산로41길');
    expect(bandLocation('2호선 당산역 123-4')).toBe('2호선 당산역 인근');
  });

  it('keeps numbered legal dongs intact inside generateDealcardPackage and passes P-DEALCARD-BLIND', async () => {
    const rawMemo = '서울 영등포구 양평동4가 117, 134, 125-2 대지 120평 근생 140억 매각.';
    const baseSet = parseMemoToObservations(rawMemo);
    const observationSet = {
      ...baseSet,
      observations: [
        ...baseSet.observations.filter((o) => o.candidateType !== 'address'),
        {
          id: '00000000-0000-4000-8000-000000000001',
          sourceText: '서울 영등포구 양평동4가 117, 134, 125-2',
          position: { start: 0, end: 25 },
          candidateType: 'address' as const,
          candidateValue: '서울 영등포구 양평동4가 117, 134, 125-2',
          confidence: 'confirmed' as const,
        },
      ],
    };
    const dealcardPkg = generateDealcardPackage(observationSet);

    expect(dealcardPkg.bandedLocation).toBe('서울 영등포구 양평동4가');
    expect(dealcardPkg.bandedLocation).not.toContain('117');
    expect(dealcardPkg.bandedLocation).not.toContain('125-2');

    const evaluator = new HarnessEvaluator('2026-08-31');
    registerDealcardBlindProfile(evaluator);
    const report = await evaluator.evaluateProfile('P-DEALCARD-BLIND', 'run-003', dealcardPkg);
    expect(report.blockerCount).toBe(0);
    expect(report.results.every((r) => r.status === 'PASS')).toBe(true);
  });
});
