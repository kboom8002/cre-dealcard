import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// 간단한 한글 억대 예산 파서 유틸리티
function parseBudgetToNumeric(budgetText: string): { min: number; max: number } {
  const clean = budgetText.replace(/,/g, "").trim();
  const nums = clean.match(/\d+/g);

  if (!nums || nums.length === 0) {
    return { min: 10000000000, max: 20000000000 }; // 기본값 100억~200억
  }

  const parseValue = (valStr: string) => {
    let val = Number(valStr);
    if (clean.includes("억")) {
      val = val * 100000000; // 1억 = 10^8
    } else if (clean.includes("만")) {
      val = val * 10000;
    }
    return val;
  };

  if (nums.length === 1) {
    const val = parseValue(nums[0]);
    return { min: Math.round(val * 0.8), max: Math.round(val * 1.2) };
  }

  const val1 = parseValue(nums[0]);
  const val2 = parseValue(nums[1]);
  return { min: Math.min(val1, val2), max: Math.max(val1, val2) };
}

/**
 * 역방향 온보딩 API (F13-3)
 * 비로그인 외부 투자자가 블라인드 티저에서 보낸 매수 의향서를 가망 고객 의향서로 저장 및 E2E 매칭 결과를 강제 생성합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { buildingId, name, phone, company, budget, message } = json;

    if (!buildingId || !name || !phone || !budget) {
      return NextResponse.json({ ok: false, error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. 매물 정보 및 소유주(브로커) 확인
    const { data: building, error: bldgError } = await supabase
      .from("building_ssot_lite")
      .select("owner_id, area_signal, asset_type")
      .eq("id", buildingId)
      .single();

    if (bldgError || !building) {
      return NextResponse.json({ ok: false, error: "존재하지 않는 매물입니다." }, { status: 404 });
    }

    const brokerId = building.owner_id;

    // 2. 예산 파싱
    const { min: budgetMin, max: budgetMax } = parseBudgetToNumeric(budget);

    // 3. buyer_intent_lite 테이블에 임시 매수 의향서 저장
    const { data: buyerIntent, error: intentError } = await supabase
      .from("buyer_intent_lite")
      .insert({
        broker_id: brokerId,
        buyer_type: "외부가망고객",
        budget_min: budgetMin,
        budget_max: budgetMax,
        budget_display: budget,
        preferred_regions: [building.area_signal || "서울"],
        purchase_purpose: "임대수익형",
        preferred_asset_types: [building.asset_type || "오피스빌딩"],
        status: "active",
        metadata: {
          is_reverse_onboarded: true,
          external_name: name,
          external_phone: phone,
          external_company: company,
          external_message: message,
          source_building_id: buildingId,
        }
      })
      .select("id")
      .single();

    if (intentError || !buyerIntent) {
      throw intentError || new Error("매수 의향서 생성 중 실패");
    }

    // 4. E2E 매칭 결과 강제 생성 (A등급으로 바인딩)
    await supabase.from("match_results").insert({
      building_id: buildingId,
      buyer_intent_id: buyerIntent.id,
      broker_id: brokerId,
      grade: "A",
      score: 85,
      reasoning: `[역방향 온보딩] 외부 가망고객 ${name}님이 이 블라인드 매물에 대해 호가 ${budget} 수준의 강력한 인바운드 매수의향을 접수하셨습니다.`,
      stage1_passed: true,
      stage1_details: { region: true, budget: true, asset: true },
      stage2_similarity: 88,
      stage3_weights: { score: 85 }
    });

    // 5. 브로커 활동 감사 로그 이벤트 기록
    await supabase.from("activity_events").insert({
      actor_id: brokerId,
      event_type: "buyer_memo_generated", // 알림 수신용 이벤트
      entity_type: "buyer_intent_lite",
      entity_id: buyerIntent.id,
      metadata: {
        source: "reverse_onboarding",
        message: `외부 고객 ${name}님이 빌딩(${building.area_signal}) 매매 의향을 전달하셨습니다.`,
      }
    });

    return NextResponse.json({ ok: true, buyerIntentId: buyerIntent.id });
  } catch (err: any) {
    console.error("Reverse onboarding error:", err);
    return NextResponse.json({ ok: false, error: err.message || "서버 내부 오류" }, { status: 500 });
  }
}
