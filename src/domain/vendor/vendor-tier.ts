/**
 * Vendor Tier — 입점 구독 Tier별 기능 한도 정의
 *
 * 수익 모델: 입점료(월정액) + 리드 전환 건당 수수료
 * user_subscriptions와 별도 분리 운영
 */

export type VendorCategory =
  | "interior"   // 인테리어 / 리모델링
  | "legal"      // 법률 (부동산 법무)
  | "tax"        // 세무 / 회계
  | "pm_fm"      // PM/FM 건물관리
  | "finance"    // 금융 (PF, 브릿지)
  | "appraisal"  // 감정평가
  | "insurance"; // 보험

export type VendorTier = "basic" | "pro" | "premium";

export interface VendorTierConfig {
  tier: VendorTier;
  label: string;
  monthlyFee: number;           // 원/월
  maxServiceCards: number;
  maxMonthlyLeads: number | null; // null = 무제한
  agoraExpertBadge: boolean;
  featuredPlacement: boolean;
  leadFeePerContact: number;    // 원/건
  leadReport: boolean;
  conversionAnalytics: boolean;
}

export const VENDOR_TIER_CONFIGS: Record<VendorTier, VendorTierConfig> = {
  basic: {
    tier: "basic",
    label: "Basic",
    monthlyFee: 0,
    maxServiceCards: 3,
    maxMonthlyLeads: 10,
    agoraExpertBadge: false,
    featuredPlacement: false,
    leadFeePerContact: 50000,
    leadReport: false,
    conversionAnalytics: false,
  },
  pro: {
    tier: "pro",
    label: "Pro",
    monthlyFee: 290000,
    maxServiceCards: 10,
    maxMonthlyLeads: 50,
    agoraExpertBadge: true,
    featuredPlacement: false,
    leadFeePerContact: 50000,
    leadReport: true,
    conversionAnalytics: false,
  },
  premium: {
    tier: "premium",
    label: "Premium",
    monthlyFee: 790000,
    maxServiceCards: Infinity,
    maxMonthlyLeads: null,
    agoraExpertBadge: true,
    featuredPlacement: true,
    leadFeePerContact: 30000, // 할인
    leadReport: true,
    conversionAnalytics: true,
  },
};

export const VENDOR_CATEGORY_META: Record<VendorCategory, {
  label: string;
  emoji: string;
  desc: string;
  agoraRole: string;
}> = {
  interior:  { label: "인테리어",  emoji: "🔨", desc: "오피스·상가·빌딩 인테리어 및 리모델링",         agoraRole: "vendor_interior" },
  legal:     { label: "법률",      emoji: "⚖️", desc: "부동산 거래·임대차·등기 법률 자문",             agoraRole: "vendor_legal" },
  tax:       { label: "세무",      emoji: "🧮", desc: "양도세·취득세·법인세 세무 상담",                agoraRole: "vendor_tax" },
  pm_fm:     { label: "건물관리",  emoji: "🔧", desc: "PM/FM 위탁관리·시설유지·에너지관리",           agoraRole: "vendor_pm" },
  finance:   { label: "금융",      emoji: "🏦", desc: "PF대출·브릿지론·리파이낸싱 자문",              agoraRole: "vendor_finance" },
  appraisal: { label: "감정평가",  emoji: "📋", desc: "상업용 부동산 감정평가·시가산정",              agoraRole: "vendor_appraisal" },
  insurance: { label: "보험",      emoji: "🛡️", desc: "건물종합보험·화재보험·배상책임보험",           agoraRole: "vendor_insurance" },
};

/**
 * 서비스 카드 등록 가능 여부 체크
 */
export function canCreateServiceCard(
  tier: VendorTier,
  currentCardCount: number
): { allowed: boolean; reason?: string } {
  const config = VENDOR_TIER_CONFIGS[tier];
  if (currentCardCount >= config.maxServiceCards) {
    return {
      allowed: false,
      reason: `${config.label} 등급은 서비스 카드 ${config.maxServiceCards}개까지 등록 가능합니다. 업그레이드를 고려해 주세요.`,
    };
  }
  return { allowed: true };
}

/**
 * 월 리드 한도 체크
 */
export function canContactLead(
  tier: VendorTier,
  currentMonthlyLeads: number
): { allowed: boolean; reason?: string } {
  const config = VENDOR_TIER_CONFIGS[tier];
  if (config.maxMonthlyLeads !== null && currentMonthlyLeads >= config.maxMonthlyLeads) {
    return {
      allowed: false,
      reason: `${config.label} 등급의 월 리드 한도(${config.maxMonthlyLeads}건)에 도달했습니다.`,
    };
  }
  return { allowed: true };
}
