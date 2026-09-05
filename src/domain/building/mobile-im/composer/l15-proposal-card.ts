import type { ProposalUnit } from '../../im-core/proposals/proposal-unit';
import { applyLexiconFilter } from '../presentation/cre-lexicon-filter';
import { runRiskBoundaryCheck } from '../guardrails';

export interface ProposalCard {
  title: string;
  leadCopy: string;
  supportingEvidence: string[];
  buyerValueProposition: string;
}

export function buildL15ProposalCards(proposals: ProposalUnit[]): ProposalCard[] {
  const confirmed = proposals.filter((p) => p.approvalState === 'broker_confirmed');

  return confirmed.map((p) => {
    // 1. 한국 CRE 실무 표준 용어집 필터링
    const filter = applyLexiconFilter(p.finalCopy);
    if (filter.violations.length > 0) {
      throw new Error(`LEXICON_VIOLATION: ${filter.violations.join('; ')}`);
    }

    // 2. P0 금융/법적 가드레일 검사 (수익률 보장, 투자 추천 등 차단)
    const riskCheck = runRiskBoundaryCheck(filter.filteredText);
    if (riskCheck.status === 'blocked') {
      const msgs = riskCheck.issues.map((i) => i.message).join('; ');
      throw new Error(`RISK_BOUNDARY_BLOCKED: 공인중개사법상 금지된 위험 문구가 검출되었습니다 (${msgs})`);
    }

    return {
      title: '투자 핵심 전략 (Value Proposition)',
      leadCopy: riskCheck.safe_text ?? filter.filteredText,
      supportingEvidence: p.evidenceRefs,
      buyerValueProposition: p.buyerIntentMeaning,
    };
  });
}
