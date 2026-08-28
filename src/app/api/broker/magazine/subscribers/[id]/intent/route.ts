import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateAutoIntents, type InterestProfile } from "@/domain/magazine/subscriber-profile";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: subscriberId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 1. 구독자 프로필 조회
    const { data: sub, error: subError } = await supabase
      .from("magazine_subscribers")
      .select("id, client_id, subscriber_name, subscriber_phone, subscriber_email, interest_profile, interest_tags")
      .eq("id", subscriberId)
      .eq("broker_id", user.id)
      .maybeSingle();

    if (subError || !sub) {
      return NextResponse.json({ error: "구독자 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // 2. InterestProfile 조합
    const rawProfile = sub.interest_profile || {};
    const rawTags = sub.interest_tags || {};

    const profile: InterestProfile = {
      assetTypes: rawTags.assetTypes || rawProfile.assetTypes || ["꼬마빌딩"],
      regions: rawTags.regions || rawProfile.regions || ["성수동"],
      budgetRange: rawProfile.budgetRange || { min: 2000000000, max: 5000000000 },
      preferredCapRate: rawProfile.preferredCapRate || { min: 4.0, max: 6.0 },
      readArticleCount: rawProfile.readArticleCount || 1,
      lastEngagedAt: rawProfile.lastEngagedAt || new Date().toISOString(),
      topics: rawTags.topics || [],
      hobbies: rawTags.hobbies || [],
    };

    // 3. AutoIntent 생성
    const autoIntents = generateAutoIntents(profile);
    const insertedIntents = [];

    for (const intent of autoIntents) {
      const budgetMinManwon = Math.round((intent.budgetKrw * 0.8) / 10000);
      const budgetMaxManwon = Math.round((intent.budgetKrw * 1.2) / 10000);
      const budgetDisplay = `${Math.round(budgetMinManwon / 10000)}억 ~ ${Math.round(budgetMaxManwon / 10000)}억`;

      const { data: intentRow, error: insertError } = await supabase
        .from("buyer_intent_lite")
        .insert({
          owner_id: user.id,
          buyer_type: "investor",
          preferred_regions: [intent.region],
          asset_types: [intent.assetType],
          budget_min: budgetMinManwon,
          budget_max: budgetMaxManwon,
          budget_display: budgetDisplay,
          purchase_purpose: "임대수익 및 시세차익 (매거진 분석 기반)",
          source: "magazine_auto_intent",
        })
        .select()
        .single();

      if (!insertError && intentRow) {
        insertedIntents.push(intentRow);
      }
    }

    // 4. client_id가 있으면 고객 레코드의 linked_buyer_intent_ids 갱신
    if (sub.client_id && insertedIntents.length > 0) {
      const newIntentIds = insertedIntents.map((i) => i.id);
      const { data: client } = await supabase
        .from("broker_clients")
        .select("linked_buyer_intent_ids")
        .eq("id", sub.client_id)
        .maybeSingle();

      const existingIds = (client?.linked_buyer_intent_ids || []) as string[];
      const mergedIds = [...new Set([...existingIds, ...newIntentIds])];

      await supabase
        .from("broker_clients")
        .update({ linked_buyer_intent_ids: mergedIds })
        .eq("id", sub.client_id);
    }

    return NextResponse.json({
      success: true,
      count: insertedIntents.length,
      intents: insertedIntents,
    });
  } catch (err: any) {
    console.error("[AutoIntent POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
