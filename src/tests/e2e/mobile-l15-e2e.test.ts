import { describe, it, expect } from 'vitest';
import { MobileComposer } from '@/domain/building/mobile-im/composer/mobile-composer';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';
import type { ProposalUnit } from '@/domain/building/im-core/proposals/proposal-unit';
import { buildL15ProposalCards } from '@/domain/building/mobile-im/composer/l15-proposal-card';

describe('Mobile IM L1.5 Publication E2E Flow (PR-B2-04 / Negative-Pair Obligation)', () => {
  const builder = new PublicationPackageBuilder();

  const snapshot = buildEffectiveSnapshot({
    dealId: 'deal-dangsan-e2e',
    parcels: [{ parcelId: 'p-dangsan-1', address: '영등포구 당산동 123', landAreaSqm: 450, status: 'SUCCESS' }],
    grossFloorArea: 1350,
    pricing: {
      askingPriceKrw: 12500000000,
      monthlyRentKrw: 42000000,
      totalDepositKrw: 400000000,
    },
  });

  it('Positive Pair: Qualified Dangsan L1.5 proposal completes full M00-M50 pipeline and publishes', async () => {
    const proposals: ProposalUnit[] = [
      {
        id: 'prop-dangsan-1',
        dealId: 'deal-dangsan-e2e',
        brokerRawText: '당산역 초역세권 코너 건물로 사옥 및 전시장으로 최적',
        evidenceRefs: ['obs-loc-1', 'obs-corner-1'],
        buyerIntentMeaning: '기업 사옥 브랜딩 및 가시성 극대화',
        finalCopy: '당산역 인근 대로변 코너에 위치하여 기업 단독 브랜딩 및 사옥 단독 명칭 표기(간판 설치권)가 탁월합니다.',
        placementTarget: 'mobile.thesis',
        approvalState: 'broker_confirmed',
      },
    ];

    const pkg = builder.build({
      dealId: 'deal-dangsan-e2e',
      targetLevel: 'L1.5',
      snapshot,
      claims: {
        asking_price: {
          subject: 'asking_price',
          value: 12500000000,
          unit: 'KRW',
          basisLabel: '호가',
          status: 'confirmed',
        },
      },
      proposals,
      rentrollTier: 'standard',
    });

    const composer = new MobileComposer();
    const result = await composer.compose(pkg, 'L1.5', 'broker-senior-park');

    expect(result.level).toBe('L1.5');
    expect(result.sections.some((s) => s.sectionType === 'investment_thesis')).toBe(true);
    expect(result.report.blockerCount).toBe(0);
    expect(result.release.status).toBe('PUBLISHED');
    expect(result.release.publicUrl).toBe('/im-lite/deal-dangsan-e2e');
  });

  it('Negative Pair: Persona leak in external copy triggers gate block at Stage M30', async () => {
    const proposalsWithPersonaLeak: ProposalUnit[] = [
      {
        id: 'prop-leak',
        dealId: 'deal-dangsan-e2e',
        brokerRawText: '60대 자산가 맞춤형 상가빌딩',
        evidenceRefs: ['obs-loc-1'],
        buyerIntentMeaning: '개인 자산가 승계',
        finalCopy: '60대 자산가를 위한 맞춤형 안정 수익 자산입니다.', // Persona leak!
        placementTarget: 'mobile.thesis',
        approvalState: 'broker_confirmed',
      },
    ];

    const pkg = builder.build({
      dealId: 'deal-dangsan-e2e',
      targetLevel: 'L1.5',
      snapshot,
      claims: {},
      proposals: proposalsWithPersonaLeak,
      rentrollTier: 'standard',
    });

    const composer = new MobileComposer();
    // In M20, sanitizePersonaTerms strips demographic phrases, but if a raw un-sanitized persona escapes, M30 catches it.
    const result = await composer.compose(pkg, 'L1.5', 'broker-senior-park');
    // Ensure persona was completely cleansed
    const thesisSection = result.sections.find((s) => s.sectionType === 'investment_thesis');
    expect(thesisSection?.content).not.toContain('60대 자산가');
  });

  it('Negative Pair: Illegal investment guarantee (수익률 보장) is rejected during L1.5 card generation', () => {
    const proposalsWithGuarantee: ProposalUnit[] = [
      {
        id: 'prop-guarantee',
        dealId: 'deal-dangsan-e2e',
        brokerRawText: 'Cap Rate 7% 수익률 보장',
        evidenceRefs: ['obs-loc-1'],
        buyerIntentMeaning: '고수익 보장',
        finalCopy: '연 7% 고수익률 보장 매물입니다.',
        placementTarget: 'mobile.thesis',
        approvalState: 'broker_confirmed',
      },
    ];

    expect(() => buildL15ProposalCards(proposalsWithGuarantee)).toThrowError(
      /RISK_BOUNDARY_BLOCKED/
    );
  });
});
