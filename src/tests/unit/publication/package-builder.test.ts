import { describe, it, expect } from 'vitest';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import type { ProposalUnit } from '@/domain/building/im-core/proposals/proposal-unit';

describe('PublicationPackageBuilder (PR-B1-06 / Negative-Pair Obligation)', () => {
  const builder = new PublicationPackageBuilder();

  const snapshot = buildEffectiveSnapshot({
    dealId: 'deal-pub-test',
    parcels: [{ parcelId: 'p-1', address: '당산동 1', landAreaSqm: 400, status: 'SUCCESS' }],
    grossFloorArea: 1000,
    pricing: {
      askingPriceKrw: 12000000000,
      monthlyRentKrw: 40000000,
    },
  });

  it('Positive Pair: Qualified data builds L1.5 PublicationPackage with triple cryptographic hash', () => {
    const proposals: ProposalUnit[] = [
      {
        id: 'prop-1',
        dealId: 'deal-pub-test',
        brokerRawText: '사옥 적합',
        evidenceRefs: ['obs-1'],
        buyerIntentMeaning: '사옥 브랜딩',
        finalCopy: '기업 단독 브랜딩 및 사옥 활용에 최적화된 입지입니다.',
        placementTarget: 'mobile.thesis',
        approvalState: 'broker_confirmed',
      },
    ];

    const pkg = builder.build({
      dealId: 'deal-pub-test',
      targetLevel: 'L1.5',
      snapshot,
      claims: {
        asking_price: {
          subject: 'asking_price',
          value: 12000000000,
          unit: 'KRW',
          basisLabel: '호가',
          status: 'confirmed',
        },
      },
      proposals,
      rentrollTier: 'standard',
    });

    expect(pkg.level).toBe('L1.5');
    expect(pkg.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(pkg.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(pkg.claimsHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('Negative Pair: Disqualified attempt to build L1.5 without proposals is rejected by eligibility check', () => {
    expect(() =>
      builder.build({
        dealId: 'deal-pub-test',
        targetLevel: 'L1.5',
        snapshot,
        claims: {},
        proposals: [], // Missing required proposal!
        rentrollTier: 'standard',
      })
    ).toThrowError(/ELIGIBILITY_CHECK_FAILED/);
  });
});
