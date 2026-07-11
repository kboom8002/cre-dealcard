import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";

/**
 * POST /api/broker/morning-intelligence/custom
 * 사용자 복붙 자료 1~10건 → AI 정리 → 저장
 *
 * GET /api/broker/morning-intelligence/custom
 * 사용자의 최근 마이 인텔리전스 목록 조회
 */

// ── POST: 마이 인텔리전스 생성 ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }

    const body = await request.json();
    const { region = "gbd", rawInputs } = body as { region: string; rawInputs: string[] };

    if (!rawInputs || !Array.isArray(rawInputs) || rawInputs.length === 0) {
      return NextResponse.json({ error: "자료를 1건 이상 입력해주세요." }, { status: 400 });
    }
    if (rawInputs.length > 10) {
      return NextResponse.json({ error: "최대 10건까지 입력 가능합니다." }, { status: 400 });
    }

    // 빈 항목 필터링
    const cleanInputs = rawInputs.map(s => s.trim()).filter(s => s.length > 0);
    if (cleanInputs.length === 0) {
      return NextResponse.json({ error: "유효한 자료가 없습니다." }, { status: 400 });
    }

    // ── AI 정리 ──────────────────────────────────────────────────────────────
    const inputText = cleanInputs.map((text, i) => `[자료 ${i + 1}]\n${text}`).join("\n\n");

    const aiRes = await callLLM({
      systemPrompt: `당신은 꼬마빌딩·상업용 부동산 전문 AI 에디터입니다.
브로커가 복붙한 뉴스/기사/메모를 분석하여 구조화합니다.

[출력 규칙]
1. 각 자료별: 1줄 요약(30자 이내) + 시장 의미(브로커 관점, 50자 이내)
2. 전체 종합 인사이트: 3줄 이내
3. 오늘의 액션 아이템: 2~3개
4. 투자 감성 점수: 0(극단적 위축)~100(극단적 과열)
5. **없는 정보를 지어내지 마세요**

JSON 형식으로 정확히 출력:
{
  "items": [{"original_index": 0, "summary": "요약", "implication": "시장 의미"}],
  "overallInsight": "종합 인사이트",
  "actionItems": ["액션1", "액션2"],
  "sentimentScore": 65
}`,
      userPrompt: inputText,
      model: "gpt-5.4",
      temperature: 0.3,
      maxTokens: 1200,
    });

    let aiSummary: any = null;
    const contentString = typeof aiRes.content === "string" ? aiRes.content : JSON.stringify(aiRes.content);
    const jsonMatch = contentString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        aiSummary = JSON.parse(jsonMatch[0]);
      } catch {
        aiSummary = {
          items: cleanInputs.map((text, i) => ({
            original_index: i,
            summary: text.slice(0, 30) + "...",
            implication: "AI 파싱 오류 — 원문을 확인하세요.",
          })),
          overallInsight: "AI 정리에 실패했습니다. 다시 시도해주세요.",
          actionItems: ["자료를 재입력 후 다시 시도"],
          sentimentScore: 50,
        };
      }
    }

    // ── DB 저장 ──────────────────────────────────────────────────────────────
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("user_custom_intel")
      .insert({
        user_id: user.id,
        region,
        raw_inputs: cleanInputs,
        ai_summary: aiSummary,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("[custom-intel] Insert error:", error);
      // 테이블이 없을 수 있으므로 테이블 없이도 응답 반환
      return NextResponse.json({
        success: true,
        customIntelId: null,
        aiSummary,
        note: "DB 저장 실패 (테이블 미생성 가능) — AI 결과만 반환",
      });
    }

    return NextResponse.json({
      success: true,
      customIntelId: data.id,
      aiSummary,
    });
  } catch (err: unknown) {
    console.error("[custom-intel] POST Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 오류" }, { status: 500 });
  }
}

// ── GET: 최근 마이 인텔리전스 목록 ──────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("user_custom_intel")
      .select("id, region, ai_summary, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      // 테이블 미존재 시 빈 배열
      return NextResponse.json({ success: true, items: [] });
    }

    return NextResponse.json({ success: true, items: data || [] });
  } catch (err: unknown) {
    console.error("[custom-intel] GET Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 오류" }, { status: 500 });
  }
}
