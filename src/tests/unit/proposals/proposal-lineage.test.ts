import { describe, it, expect } from 'vitest';
import {
  confirmProposalUnit,
  createQualitativeObservation,
  type ProposalUnit,
} from '@/domain/building/im-core/proposals/proposal-unit';

describe('ProposalUnit Lineage (PR-B1-05 / Negative-Pair Obligation)', () => {
  it('Positive Pair: 5-step proposal chain backed by evidence passes broker confirmation', () => {
    const proposal: ProposalUnit = {
      id: 'prop-1',
      dealId: 'deal-prop-pos',
      brokerRawText: '대로변 코너 건물이라 사옥으로 간판 달기 아주 좋음',
      evidenceRefs: ['obs-road-corner-1', 'claim-facade-width'],
      buyerIntentMeaning: '기업 브랜드 가치 제고를 위한 간판 시인성 확보',
      finalCopy: '대로변 코너에 입지하여 사옥 단독 명칭 표기(간판 설치권)가 우수합니다.',
      placementTarget: 'mobile.investment_thesis',
      approvalState: 'draft',
    };

    const confirmed = confirmProposalUnit(proposal, 'broker-kim');
    expect(confirmed.approvalState).toBe('broker_confirmed');
    expect(confirmed.approvedAt).toBeDefined();
    expect(confirmed.evidenceRefs.length).toBe(2);
  });

  it('Positive Pair: Proposal backed by legitimate qualitative broker observation succeeds', () => {
    const qualObs = createQualitativeObservation({
      dealId: 'deal-prop-qual',
      category: 'tenant_interview',
      text: '현 임차인 대표 면담 결과 재계약 시 임대료 현실화에 매우 긍정적 태도를 확인',
      actor: 'broker-park',
    });

    expect(qualObs.id).toContain('obs-qual-');
    expect(qualObs.provenance).toBe('broker_opinion');

    const proposal: ProposalUnit = {
      id: 'prop-qual-1',
      dealId: 'deal-prop-qual',
      brokerRawText: '임차인과 구두 협의 완료하여 임대 안정성 높음',
      evidenceRefs: [qualObs.id],
      buyerIntentMeaning: '임차인 유지 및 향후 안정적 현금흐름 보전',
      finalCopy: '현 임차인 인터뷰 결과 우호적인 임대 협의가 진행 중입니다.',
      placementTarget: 'mobile.investment_thesis',
      approvalState: 'draft',
    };

    const confirmed = confirmProposalUnit(proposal, 'broker-park');
    expect(confirmed.approvalState).toBe('broker_confirmed');
  });

  it('Negative Pair: Unbacked proposal without evidenceRefs is blocked from publication confirmation', () => {
    const unbackedProposal: ProposalUnit = {
      id: 'prop-2',
      dealId: 'deal-prop-neg',
      brokerRawText: '수익률 무조건 10% 이상 나오는 초대박 매물',
      evidenceRefs: [], // Missing evidence!
      buyerIntentMeaning: '고수익률 달성',
      finalCopy: '안정적인 수익률 기대 자산',
      placementTarget: 'mobile.investment_thesis',
      approvalState: 'draft',
    };

    expect(() => confirmProposalUnit(unbackedProposal, 'broker-kim')).toThrowError(
      /UNBACKED_PROPOSAL_BLOCKED/
    );
  });

  it('Negative Pair: Illegal performance guarantee (수익률 보장) is blocked even with evidenceRefs', () => {
    const illegalProposal: ProposalUnit = {
      id: 'prop-illegal',
      dealId: 'deal-prop-illegal',
      brokerRawText: 'Cap Rate 7% 수익률 보장',
      evidenceRefs: ['claim-cap-rate-7'],
      buyerIntentMeaning: '수익 확정 강조',
      finalCopy: '연 7% 고수익률 보장 매물입니다.', // Illegal guarantee!
      placementTarget: 'mobile.investment_thesis',
      approvalState: 'draft',
    };

    expect(() => confirmProposalUnit(illegalProposal, 'broker-kim')).toThrowError(
      /ILLEGAL_PERFORMANCE_GUARANTEE/
    );
  });

  it('Negative Pair: Financial yield claims without financial evidence (Semantic Mismatch) is blocked', () => {
    const mismatchedProposal: ProposalUnit = {
      id: 'prop-mismatch',
      dealId: 'deal-prop-mismatch',
      brokerRawText: '주차대수가 넉넉해서 연 6% 순수익 가능',
      evidenceRefs: ['obs-parking-count-10'], // Only parking evidence!
      buyerIntentMeaning: '고수익 달성',
      finalCopy: '연 6% 대 순수익 실현이 기대되는 자산입니다.',
      placementTarget: 'mobile.investment_thesis',
      approvalState: 'draft',
    };

    expect(() => confirmProposalUnit(mismatchedProposal, 'broker-kim')).toThrowError(
      /SEMANTIC_EVIDENCE_MISMATCH/
    );
  });
});
