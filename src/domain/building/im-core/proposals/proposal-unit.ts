import { rewriteUnsafeText } from '../../../guardrails/safe-language';

export interface QualitativeBrokerObservation {
  id: string;
  dealId: string;
  sourceType: 'broker_input';
  category: 'market_opinion' | 'field_survey' | 'tenant_interview' | 'seller_statement';
  text: string;
  provenance: 'broker_opinion' | 'seller';
  recordedBy: string;
  recordedAt: string;
}

export function createQualitativeObservation(params: {
  dealId: string;
  category: 'market_opinion' | 'field_survey' | 'tenant_interview' | 'seller_statement';
  text: string;
  actor: string;
  provenance?: 'broker_opinion' | 'seller';
}): QualitativeBrokerObservation {
  if (!params.text || params.text.trim().length < 5) {
    throw new Error('INVALID_QUALITATIVE_OBSERVATION: 현장 탐문/의견 내용은 최소 5자 이상이어야 합니다.');
  }
  return {
    id: `obs-qual-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    dealId: params.dealId,
    sourceType: 'broker_input',
    category: params.category,
    text: params.text.trim(),
    provenance: params.provenance ?? 'broker_opinion',
    recordedBy: params.actor,
    recordedAt: new Date().toISOString(),
  };
}

export interface ProposalUnit {
  id: string;
  dealId: string;
  brokerRawText: string;          // 1. 원문 (수정 불가 보존)
  evidenceRefs: string[];         // 2. 근거 Claim/Observation IDs
  buyerIntentMeaning: string;     // 3. 매수자 측면의 실무적 해석
  finalCopy: string;              // 4. 정제된 외부 노출 문안
  placementTarget: string;        // 5. 모바일/PPTX 내 노출 슬롯 위치
  approvalState: 'draft' | 'broker_confirmed' | 'rejected';
  approvedAt?: string;
}

export function confirmProposalUnit(unit: ProposalUnit, actor: string): ProposalUnit {
  // 1. 근거 자료 필수 검증
  if (!unit.evidenceRefs || unit.evidenceRefs.length === 0) {
    throw new Error(
      `UNBACKED_PROPOSAL_BLOCKED: 근거 자료(evidenceRefs)가 없는 중개인 의견은 확정할 수 없습니다 (ID: ${unit.id})`
    );
  }

  // 2. 외부 노출 문안 필수 검증
  if (!unit.finalCopy || unit.finalCopy.trim().length === 0) {
    throw new Error(`INVALID_PROPOSAL_COPY: 정제된 외부 노출 문안(finalCopy)이 누락되었습니다`);
  }

  // 3. 공인중개사법 및 자본시장법상 P0 법적 금지 표현(확정·보장·투자추천) 차단
  const safeCheck = rewriteUnsafeText(unit.finalCopy);
  if (safeCheck.hadViolations) {
    throw new Error(
      `ILLEGAL_PERFORMANCE_GUARANTEE: 공인중개사법/자본시장법상 금지된 확정·보장 표현이 포함되어 있습니다 (${safeCheck.violations.join(', ')})`
    );
  }

  // 4. 시맨틱 일치성 검증 (수치/수익률 관련 주장 시 수치/재무 근거 필수 연결 확인)
  const containsFinancialYieldClaim = /수익률|Cap\s*Rate|순수익|NOI|임대수익|연\s*\d+%|\d+%\s*대/i.test(unit.finalCopy);
  if (containsFinancialYieldClaim) {
    const hasFinancialOrYieldEvidence = unit.evidenceRefs.some((ref) =>
      /(?:claim-(?:cap|noi|yield|rent|price)|obs-(?:rent|financial|qual))/i.test(ref)
    );
    if (!hasFinancialOrYieldEvidence) {
      throw new Error(
        `SEMANTIC_EVIDENCE_MISMATCH: 수익률/재무 관련 제안에는 재무 지표 또는 임대차 관측 근거가 연결되어야 합니다 (현재 연결: ${unit.evidenceRefs.join(', ')})`
      );
    }
  }

  return {
    ...unit,
    approvalState: 'broker_confirmed',
    approvedAt: new Date().toISOString(),
  };
}
