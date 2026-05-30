import { SupabaseClient } from "@supabase/supabase-js";

export interface SeedingSummary {
  seededCount: number;
  buyers: Array<{ id: string; name: string; budget: string }>;
}

const GHOST_BUYER_TEMPLATES = [
  {
    name: "(주)한강코퍼레이션 (IT 사옥 수요)",
    buyer_type: "법인사옥수요",
    budget_min: 30000000000, // 300억
    budget_max: 60000000000, // 600억
    budget_display: "300억 ~ 600억",
    preferred_regions: ["강남구", "서초구", "송파구"],
    purchase_purpose: "사옥용",
    preferred_asset_types: ["오피스빌딩", "오피스"],
    rejection_tolerance: 0.1,
  },
  {
    name: "벨류에이션 자산운용 (수익형 밸류애드)",
    buyer_type: "자산운용사",
    budget_min: 50000000000, // 500억
    budget_max: 100000000000, // 1000억
    budget_display: "500억 ~ 1000억",
    preferred_regions: ["마포구", "성동구", "영등포구"],
    purchase_purpose: "임대수익형",
    preferred_asset_types: ["오피스빌딩", "상가", "리테일"],
    rejection_tolerance: 0.2,
  },
  {
    name: "성수크리에이티브 파트너스 (리모델링 개발)",
    buyer_type: "개인투자자",
    budget_min: 8000000000, // 80억
    budget_max: 20000000000, // 200억
    budget_display: "80억 ~ 200억",
    preferred_regions: ["성동구", "용산구", "중구"],
    purchase_purpose: "개발용",
    preferred_asset_types: ["오피스빌딩", "꼬마빌딩", "공장"],
    rejection_tolerance: 0.3,
  },
  {
    name: "넥스트스페이스 리츠 (코어 자산 인수)",
    buyer_type: "자산운용사",
    budget_min: 100000000000, // 1000억
    budget_max: 300000000000, // 3000억
    budget_display: "1000억 ~ 3000억",
    preferred_regions: ["강남구", "중구", "종로구"],
    purchase_purpose: "임대수익형",
    preferred_asset_types: ["오피스빌딩"],
    rejection_tolerance: 0.05,
  },
  {
    name: "에이치스타 인베스트 (꼬마빌딩 증축)",
    buyer_type: "개인투자자",
    budget_min: 5000000000, // 50억
    budget_max: 12000000000, // 120억
    budget_display: "50억 ~ 120억",
    preferred_regions: ["서초구", "강남구", "송파구"],
    purchase_purpose: "개발용",
    preferred_asset_types: ["꼬마빌딩", "상가"],
    rejection_tolerance: 0.25,
  }
];

/**
 * Ghost Demand Seeding 엔진 (F13-2)
 * 신규 브로커 가입 시 가상의 현실적인 매수 수요를 5건 시딩해 매칭 성공을 즉시 체험하게 합니다.
 * 실제 국토교통부 주요 거래 패턴 권역과 예산 밴드를 역산해 리얼리티를 극대화했습니다.
 */
export async function seedGhostDemands(
  supabase: SupabaseClient,
  brokerId: string
): Promise<SeedingSummary> {
  const seededBuyers: Array<{ id: string; name: string; budget: string }> = [];

  for (const template of GHOST_BUYER_TEMPLATES) {
    // 이미 시딩되었는지 중복 검사 (broker_id + name 기준으로 1회만 시딩)
    const { data: existing } = await supabase
      .from("buyer_intent_lite")
      .select("id")
      .eq("broker_id", brokerId)
      .eq("buyer_type", template.buyer_type)
      .contains("preferred_regions", template.preferred_regions)
      .maybeSingle();

    if (existing) continue;

    // 가상 바이어 등록
    const { data: newBuyer, error: dbError } = await supabase
      .from("buyer_intent_lite")
      .insert({
        broker_id: brokerId,
        buyer_type: template.buyer_type,
        budget_min: template.budget_min,
        budget_max: template.budget_max,
        budget_display: template.budget_display,
        preferred_regions: template.preferred_regions,
        purchase_purpose: template.purchase_purpose,
        preferred_asset_types: template.preferred_asset_types,
        status: "active",
        metadata: {
          is_ghost: true,
          company_name: template.name,
          rejection_tolerance: template.rejection_tolerance,
          seeded_at: new Date().toISOString(),
        }
      })
      .select("id")
      .single();

    if (dbError) {
      console.error(`Failed to seed ghost buyer ${template.name}:`, dbError);
      continue;
    }

    seededBuyers.push({
      id: newBuyer.id,
      name: template.name,
      budget: template.budget_display,
    });
  }

  return {
    seededCount: seededBuyers.length,
    buyers: seededBuyers,
  };
}
