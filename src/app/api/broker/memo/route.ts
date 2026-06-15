import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { routeMemo } from "@/ai/agents/memo-router-agent";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { memo } = body;

    if (!memo || typeof memo !== "string") {
      return NextResponse.json({ ok: false, error: "Memo is required" }, { status: 400 });
    }

    // AI 라우팅 실행
    const routingResult = await routeMemo(memo);

    // TODO: 라우팅 결과에 따라 각 파이프라인으로 넘기는 로직을 프론트엔드가 하거나 여기서 직접 호출
    // 현재는 라우팅 결과만 프론트엔드에 반환하여, 프론트엔드가 적절한 엔드포인트로 리디렉션하거나 API를 쏘도록 함
    // (보안 및 확장성 측면에서 프론트엔드에게 위임)
    
    // 단순 메모일 경우 DB에 저장
    if (routingResult.type === "general_note" || routingResult.type === "update_building") {
       await supabase.from("activity_events").insert({
         user_id: user.id,
         event_type: "memo_added",
         event_data: { memo, routingResult },
       });
    }

    return NextResponse.json({
      ok: true,
      data: {
        originalMemo: memo,
        routing: routingResult
      }
    });

  } catch (error) {
    console.error("Memo API Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
