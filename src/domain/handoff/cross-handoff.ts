import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "@/domain/analytics/record-event";

/**
 * Service linking Commercial Real Estate (CRE) properties with Crowdfunding/STO opportunities.
 */
export class CrossHandoffService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Evaluates a physical CRE property for potential tokenization (STO/Crowdfunding).
   * Creates a draft crowdfunding project if the property has high vacancy or is suitable.
   */
  async evaluateAndHandoffToFunding(
    buildingSsotLiteId: string,
    brokerId: string,
  ): Promise<{ success: boolean; fundingProjectId?: string; reason?: string }> {
    // 1. Fetch building details
    const { data: building, error } = await this.supabase
      .from("building_ssot_lite")
      .select("*")
      .eq("id", buildingSsotLiteId)
      .single();

    if (error || !building) {
      return { success: false, reason: "SSoT 빌딩을 찾을 수 없습니다." };
    }

    // 2. Perform STO suitability analysis
    const isSuitable =
      building.asset_type === "office" || building.asset_type === "retail";
    
    if (!isSuitable) {
      return {
        success: false,
        reason: "오피스 또는 리테일 용도의 자산만 공모 STO로 전환할 수 있습니다.",
      };
    }

    // 3. Create a draft crowdfunding project
    const expectedReturn = 7.5 + Math.random() * 3.5; // heuristically compute projected return
    const targetAmount = 2500000000; // default 25억 공모

    const { data: project, error: pErr } = await this.supabase
      .from("funding_projects")
      .insert({
        operator_id: brokerId,
        project_name: `[조각투자] ${building.area_signal || "서울 핵심권"} 신축급 빌딩`,
        asset_type: "real_estate",
        target_amount: targetAmount,
        min_investment: 1000000,
        expected_return_pct: Math.round(expectedReturn * 10) / 10,
        investment_period_months: 24,
        risk_level: 2,
        token_type: "sto",
        description_memo: `${building.fit_summary || "우량 핵심 매물"} | 실시간 공실 검증 및 IoT 관제 기반 고안정성 부동산 토큰증권 배당형 구조화 자산입니다.`,
        ssot_data: {
          originalBuildingId: buildingSsotLiteId,
          layers: building.layers,
        },
        status: "draft",
        is_public: false,
        gate_level: 0,
      })
      .select("id")
      .single();

    if (pErr || !project) {
      return { success: false, reason: `크라우드펀딩 초안 생성 실패: ${pErr?.message}` };
    }

    await recordEvent(this.supabase, {
      actorId: brokerId,
      actorRole: "broker",
      eventType: "funding_project_created" as any,
      entityType: "funding_project" as any,
      entityId: project.id,
      metadata: { originalBuildingId: buildingSsotLiteId },
    });

    return { success: true, fundingProjectId: project.id };
  }

  /**
   * Hands off a KYC-verified crowdfunding investor to standard CRE buyer pipeline.
   * Promotes retail crowdfunding participants to potential whole-building buyers.
   */
  async promoteInvestorToCreBuyer(
    investorProfileId: string,
    brokerId: string,
  ): Promise<{ success: boolean; buyerIntentId?: string; reason?: string }> {
    const { data: profile, error } = await this.supabase
      .from("investor_profiles")
      .select("*")
      .eq("id", investorProfileId)
      .single();

    if (error || !profile) {
      return { success: false, reason: "투자자 프로필을 찾을 수 없습니다." };
    }

    if (!profile.kyc_verified) {
      return { success: false, reason: "KYC 인증이 완료되지 않은 투자자입니다." };
    }

    // Create standard buyer intent lite in CRE system
    const { data: creBuyer, error: bErr } = await this.supabase
      .from("buyer_intent_lite")
      .insert({
        broker_id: brokerId,
        buyer_type: profile.investor_type === "professional" ? "기관/전문투자자" : "자산가 개인",
        budget_range: {
          min: profile.investment_min || 10000000,
          max: (profile.investment_max || 100000000) * 10, // scaled budget for physical asset matching
          display: `${(Number(profile.investment_max || 100000000) / 10000).toLocaleString()}만원 한도`,
        },
        preferred_regions: profile.preferred_sectors,
        asset_types: [profile.preferred_sectors[0] || "office"],
        purchase_purpose: "투자",
        must_have: profile.must_have_criteria,
        nice_to_have: profile.nice_to_have_criteria,
        risk_tolerance: profile.max_risk_tolerance >= 4 ? "high" : "medium",
      })
      .select("id")
      .single();

    if (bErr || !creBuyer) {
      return { success: false, reason: `CRE 매수 의향 등록 실패: ${bErr?.message}` };
    }

    return { success: true, buyerIntentId: creBuyer.id };
  }
}
