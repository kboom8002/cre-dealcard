import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";

/**
 * POST /api/broker/morning-intelligence/combine
 * HQ 브리핑 + 마이 인텔리전스 항목을 결합하여 커스텀 브리핑 생성
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      region = "gbd",
      hqBriefingText = "",
      hqSelectedSections = [],
      myIntelItems = [],
      myIntelContext = { overallInsight: "", actionItems: [] },
    } = body as {
      region: string;
      hqBriefingText: string;
      hqSelectedSections: string[];
      myIntelItems: { summary: string; implication: string }[];
      myIntelContext?: { overallInsight: string; actionItems: string[] };
    };

    if (!hqBriefingText && myIntelItems.length === 0) {
      return NextResponse.json({ error: "결합할 항목을 선택해주세요." }, { status: 400 });
    }

    // ── 결합 프롬프트 ──────────────────────────────────────────────────────
    let combinedInput = "";

    if (hqBriefingText) {
      combinedInput += `[본사 브리핑 (선택 항목: ${hqSelectedSections.join(", ")})]\n${hqBriefingText}\n\n`;
    }

    if (myIntelItems.length > 0 || myIntelContext?.overallInsight) {
      combinedInput += `[브로커 자체 수집 인텔리전스 (마이 인텔)]\n`;
      if (myIntelContext?.overallInsight) {
        combinedInput += `종합 인사이트: ${myIntelContext.overallInsight}\n\n`;
      }
      myIntelItems.forEach((item, i) => {
        combinedInput += `${i + 1}. ${item.summary} — ${item.implication}\n`;
      });
      if (myIntelContext?.actionItems && myIntelContext.actionItems.length > 0) {
        combinedInput += `\n권장 액션:\n`;
        myIntelContext.actionItems.forEach((action, i) => {
          combinedInput += `- ${action}\n`;
        });
      }
      combinedInput += `\n`;
    }

    const aiRes = await callLLM({
      systemPrompt: `당신은 꼬마빌딩 전문 브로커용 '커스텀 모닝 브리핑 에디터'입니다.
본사(HQ)의 자동 수집 시장 브리핑과 브로커가 직접 수집한 인텔리전스를 결합하여
오늘 영업에 즉시 활용할 수 있는 통합 브리핑을 작성합니다.

[작성 규칙]
1. 본사 데이터와 브로커 자체 데이터를 자연스럽게 결합하되, **브로커 자체 수집 인텔리전스(마이 인텔)의 내용을 브리핑 본문에 반드시 2~3줄 이상 명시적으로 포함**할 것.
2. 중복 내용은 하나로 통합, 상충 내용은 양측 시각 병기
3. 브로커 자체 수집 정보(종합 인사이트, 개별 항목)에 더 높은 가중치 부여 (현장감 최우선 반영)
4. 5~7줄 핵심 브리핑 + 오늘의 액션 3개 + 매수자/매도자 전화 멘트 1개
5. **없는 정보를 지어내지 마세요**

JSON 형식:
{
  "title": "오늘의 커스텀 브리핑 제목 (15자 이내)",
  "briefing": "통합 브리핑 본문",
  "actionList": ["액션1", "액션2", "액션3"],
  "callScript": "전화 멘트 (30초 이내)",
  "sentimentScore": 65
}`,
      userPrompt: combinedInput,
      model: "gpt-5.4",
      temperature: 0.35,
      maxTokens: 1000,
    });

    let result: any = null;
    const contentString = typeof aiRes.content === "string" ? aiRes.content : JSON.stringify(aiRes.content);
    const jsonMatch = contentString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          title: "커스텀 브리핑",
          briefing: contentString.replace(/```json/g, "").replace(/```/g, "").trim(),
          actionList: ["브리핑 재생성 시도"],
          callScript: "",
          sentimentScore: 50,
        };
      }
    } else {
      result = {
        title: "커스텀 브리핑",
        briefing: contentString.trim(),
        actionList: [],
        callScript: "",
        sentimentScore: 50,
      };
    }

    // ── DB 저장 시도 ──────────────────────────────────────────────────────
    const serviceClient = createServiceClient();
    const { data: saved, error } = await serviceClient
      .from("user_combined_briefing")
      .insert({
        user_id: user.id,
        region,
        hq_items: { briefingText: hqBriefingText, sections: hqSelectedSections },
        my_items: myIntelItems,
        combined_briefing: result.briefing,
        combined_action_list: result.actionList,
        title: result.title,
        status: "draft",
      })
      .select()
      .single();

    return NextResponse.json({
      success: true,
      combinedId: saved?.id || null,
      ...result,
      note: error ? "DB 저장 실패 — AI 결과만 반환" : undefined,
    });
  } catch (err: unknown) {
    console.error("[combine-intel] POST Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 오류" }, { status: 500 });
  }
}
