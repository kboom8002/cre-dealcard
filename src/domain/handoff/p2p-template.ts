/**
 * CREDEAL v3 P2P Deal Sharing Agreement Template Service (Stage 4 - Track P2P)
 * 
 * Generates co-brokerage agreement templates for P2P deal sharing.
 * 
 * STRICT LEGAL BOUNDARY: Real-time fee distribution, automated profit sharing, or commission splitting
 * logic is STRICTLY PROHIBITED until legal structures are finalized.
 * ONLY legal contract text templates are provided.
 */

export interface CoBrokerageAgreementPayload {
  listingBrokerName: string;
  coBrokerName: string;
  propertyTitle: string;
  commissionSplitRatio: string; // e.g. "50:50"
}

export interface CoBrokerageAgreementResult {
  agreementTitle: string;
  agreementMarkdown: string;
  isLegalTemplateOnly: true; // Strict legal boundary
  isAutomatedFeeDistributionEnabled: false; // Explicit prohibition
}

export function generateCoBrokerageAgreementTemplate(
  payload: CoBrokerageAgreementPayload
): CoBrokerageAgreementResult {
  const markdown = [
    `# 📜 공동중개 협약서 (표준 템플릿)`,
    ``,
    `본 협약은 **${payload.listingBrokerName}**(이하 "매물 중개사")와 **${payload.coBrokerName}**(이하 "바이어 중개사") 간에 아래 매물에 대한 공동중개 업무를 수행함에 있어 상호 신뢰와 협력을 바탕으로 다음과 같이 체결한다.`,
    ``,
    `### 1. 대상 매물`,
    `- **매물명**: ${payload.propertyTitle}`,
    ``,
    `### 2. 수수료 분배 비율`,
    `- **상호 협의 비율**: ${payload.commissionSplitRatio}`,
    `- 본 수수료 분배는 본 계약에 따른 거래 잔금 정산 시 당사자 간 직접 정산함을 원칙으로 한다.`,
    ``,
    `### 3. 비밀유지 의무`,
    `- 양 당사자는 본 공동중개를 통해 취득한 매도인/매수인 인적사항 및 거래 조건을 제3자에게 누설할 수 없다.`,
    ``,
    `> ⚠️ **안내**: 플랫폼은 본 협약서의 양식만을 제공하며, 중개보수 직접 수령 및 자동 정산 기능은 법적 정책에 따라 제공하지 않습니다.`,
  ].join('\n');

  return {
    agreementTitle: `[공동중개] ${payload.propertyTitle} 협약서`,
    agreementMarkdown: markdown,
    isLegalTemplateOnly: true,
    isAutomatedFeeDistributionEnabled: false,
  };
}
