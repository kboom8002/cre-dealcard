import type { EffectiveSnapshot } from '../evidence/effective-snapshot';
import type { ProposalUnit } from '../proposals/proposal-unit';
import type { RentrollTier } from '../evidence/rentroll-tier-engine';
import type { Conflict } from '../evidence/types';

export interface EligibilityResult {
  eligibleLevels: Array<'L1' | 'L1.5' | 'L2' | 'L3'>;
  highestLevel: 'L1' | 'L1.5' | 'L2' | 'L3';
  disqualifications: Record<string, string[]>;
}

export class EligibilityChecker {
  checkEligibility(
    snapshot: EffectiveSnapshot,
    proposals: ProposalUnit[] = [],
    rentrollTier: RentrollTier = 'none',
    conflicts: Conflict[] = []
  ): EligibilityResult {
    const eligible: Array<'L1' | 'L1.5' | 'L2' | 'L3'> = [];
    const disq: Record<string, string[]> = {
      L1: [],
      'L1.5': [],
      L2: [],
      L3: [],
    };

    // 1. L1 (Fact OM) check
    if (snapshot.areas.landAreaTotal <= 0) {
      disq.L1.push('대지면적이 0 이하입니다');
    }
    if (snapshot.areas.grossFloorArea <= 0) {
      disq.L1.push('연면적이 0 이하입니다');
    }
    if (snapshot.pricing.askingPriceKrw <= 0) {
      disq.L1.push('매매가가 0 이하입니다');
    }

    if (disq.L1.length === 0) {
      eligible.push('L1');
    }

    // 2. L1.5 (Decision IM) check
    if (!eligible.includes('L1')) {
      disq['L1.5'].push('L1 기본 요건 미충족');
    }
    const confirmedProposals = proposals.filter((p) => p.approvalState === 'broker_confirmed');
    if (confirmedProposals.length === 0) {
      disq['L1.5'].push('중개인 승인 완료된 투자 제안(ProposalUnit)이 최소 1건 이상 필요합니다');
    }
    if (rentrollTier === 'none') {
      disq['L1.5'].push('임대차 현황이 부재하여 제안형(L1.5) 발행이 제한됩니다');
    }

    if (disq['L1.5'].length === 0) {
      eligible.push('L1.5');
    }

    // 3. L2 (Detailed IM) check
    if (!eligible.includes('L1.5')) {
      disq.L2.push('L1.5 요건 미충족');
    }
    if (rentrollTier !== 'standard' && rentrollTier !== 'complete') {
      disq.L2.push('L2 발행을 위해서는 관리비/부가세가 분리된 표준 렌트롤(standard 이상)이 필요합니다');
    }
    const unresolvedConflicts = conflicts.filter((c) => c.resolution === null);
    if (unresolvedConflicts.length > 0) {
      disq.L2.push(`미해결된 상충(Conflict) ${unresolvedConflicts.length}건이 존재합니다`);
    }

    if (disq.L2.length === 0) {
      eligible.push('L2');
    }

    // 4. L3 (Executive IM) check
    if (!eligible.includes('L2')) {
      disq.L3.push('L2 요건 미충족');
    }
    if (rentrollTier !== 'complete') {
      disq.L3.push('L3 현금흐름 분석을 위해서는 계약만료일/갱신권이 포함된 완전 렌트롤(complete)이 필요합니다');
    }

    if (disq.L3.length === 0) {
      eligible.push('L3');
    }

    const highest = eligible[eligible.length - 1] ?? 'L1';

    return {
      eligibleLevels: eligible,
      highestLevel: highest,
      disqualifications: disq,
    };
  }
}
