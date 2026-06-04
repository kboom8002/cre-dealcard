import { NextResponse } from "next/server";
import { callLLM } from "@/ai/llm-client";

export async function POST(req: Request) {
  try {
    const { comment } = await req.json();
    if (!comment) {
      return NextResponse.json({ error: "코멘트 내용이 필요합니다." }, { status: 400 });
    }

    const systemPrompt = `당신은 상업용 부동산 전문 브로커를 위한 AI 화법 비서입니다.
사용자가 입력한 짧고 거친 메모나 핵심 아이디어를 바탕으로,
고객(김대표님 등)에게 보낼 수 있도록 전문적이고 설득력 있는 브로커 화법의 긴 코멘트 메시지를 작성해 주세요.
출력 텍스트는 친근하면서도 전문적인 존댓말이어야 하며, 적절한 시장 인사이트(예: 성수동 지산 권역의 거래량 상승, 밸류애드 리모델링 수요, 최고가 갱신 등)를 지어내거나 인용하여 신뢰감을 더해야 합니다.
반드시 한국어로 작성하고, 마크다운 기호 없이 가독성 좋은 줄바꿈으로만 출력해 주세요.`;

    const userPrompt = `입력 내용: "${comment}"`;

    const result = await callLLM({
      systemPrompt,
      userPrompt,
      model: "gpt-4o-mini",
      temperature: 0.7,
    });

    return NextResponse.json({ ok: true, data: result.content });
  } catch (error: any) {
    console.error("[studio/ai-comment] Error:", error);
    return NextResponse.json({ error: error.message || "AI 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
