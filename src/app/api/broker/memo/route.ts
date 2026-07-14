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

    // 모든 메모를 broker_memos 또는 activity_events 에 저장
    let memoId = null;
    const { data: memoData, error: memoError } = await supabase
      .from("broker_memos")
      .insert({
        user_id: user.id,
        memo_text: memo,
        routing_type: routingResult.type,
        routing_summary: routingResult.summary,
        status: 'saved'
      })
      .select('id')
      .single();

    if (memoError) {
      // PostgREST returns PGRST205 when table doesn't exist in schema cache
      // PostgreSQL returns 42P01 for "relation does not exist"
      console.warn("broker_memos insert failed:", memoError.code, memoError.message);
      try {
        const { data: fallbackData } = await supabase.from("activity_events").insert({
          actor_id: user.id,
          event_type: "memo_saved",
          metadata: { memoText: memo, routingType: routingResult.type, routingSummary: routingResult.summary },
        }).select('id').single();
        if (fallbackData) memoId = fallbackData.id;
      } catch (fallbackErr) {
        console.error("activity_events fallback also failed:", fallbackErr);
      }
    } else if (memoData) {
      memoId = memoData.id;
    }

    return NextResponse.json({
      ok: true,
      data: {
        originalMemo: memo,
        routing: routingResult,
        memoId
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
