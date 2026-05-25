export type InvestorGateLevel = 0 | 1 | 2 | 3 | 4;

export const GATE_LEVELS = {
  G0: 0, // 미가입 / 공개 티저 (비로그인)
  G1: 1, // 가입 회원
  G2: 2, // 일반투자자 (KYC 완료)
  G3: 3, // 소득적격투자자 (Accredited)
  G4: 4, // 전문투자자 (Professional / Institutional)
};

/**
 * Resolves investor's gate level based on profile and KYC status.
 */
export function getInvestorGateLevel(
  investorType: "general" | "qualified" | "professional" | null | undefined,
  kycVerified: boolean
): InvestorGateLevel {
  if (!investorType) return 0;
  if (!kycVerified) return 1;

  if (investorType === "professional") return 4;
  if (investorType === "qualified") return 3;
  return 2;
}

/**
 * Filters the crowdfunding project data based on the investor's gate level.
 * Replaces restricted fields with placeholders to prevent information leakage before verification.
 */
export function filterProjectByGate(project: any, investorLevel: InvestorGateLevel) {
  const filtered = { ...project };

  // G0 fields are always public: id, projectName, assetType, expectedReturnPct, minInvestment, is_public, status, current_amount, investor_count
  
  // G1 required for total target amount and risk level
  if (investorLevel < 1) {
    filtered.target_amount = "🔐 가입 회원에게만 공개";
    filtered.targetAmount = "🔐 가입 회원에게만 공개";
    filtered.risk_level = "🔐 가입 회원에게만 공개";
    filtered.riskLevel = "🔐 가입 회원에게만 공개";
    filtered.token_type = "🔐 가입 회원에게만 공개";
    filtered.tokenType = "🔐 가입 회원에게만 공개";
  }

  // G2 required for detailed description memo and investment period
  if (investorLevel < 2) {
    filtered.description_memo = "🔐 KYC 신원 인증 후 열람 가능";
    filtered.descriptionMemo = "🔐 KYC 신원 인증 후 열람 가능";
    filtered.investment_period_months = "🔐 KYC 신원 인증 후 열람 가능";
    filtered.investmentPeriodMonths = "🔐 KYC 신원 인증 후 열람 가능";
  }

  // G3 required for structured SSoT data / detailed financial models
  if (investorLevel < 3) {
    filtered.ssot_data = { notice: "🔐 소득적격투자자(증빙 완료) 전용 상세 재무 분석 정보입니다." };
    filtered.ssotData = { notice: "🔐 소득적격투자자(증빙 완료) 전용 상세 재무 분석 정보입니다." };
  }

  // G4 required for hidden fields / regulatory compliance opinion files / legal due diligence
  if (investorLevel < 4) {
    filtered.hidden_fields = [];
    filtered.hiddenFields = [];
    filtered.regulatory_status = "🔐 전문투자자(Institutional) 자격 취득 후 전체 준법 문서 열람 가능";
    filtered.regulatoryStatus = "🔐 전문투자자(Institutional) 자격 취득 후 전체 준법 문서 열람 가능";
  }

  return filtered;
}
