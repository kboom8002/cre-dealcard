import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/public/surveys
 * {
 *   "userId": "uuid",
 *   "stepIndex": 1,
 *   "answers": { "preferredType": "꼬마빌딩", ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, stepIndex, answers } = body;

    if (stepIndex === undefined || !answers) {
      return NextResponse.json(
        { error: "stepIndex와 answers가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("poc_surveys")
      .insert({
        user_id: userId || null,
        step_index: stepIndex,
        answers: answers
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error("[api/public/surveys] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("poc_surveys")
      .select("*")
      .order("completed_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[api/public/surveys] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
