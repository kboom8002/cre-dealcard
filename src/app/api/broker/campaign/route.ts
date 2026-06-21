import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const { format, target_audience, key_points, building_id } = await req.json();

    if (!format || !key_points) {
      return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    let systemPrompt = "당신은 상업용 부동산 전문 카피라이터입니다.";
    
    if (format === "instagram") {
      systemPrompt += " 제공된 정보를 바탕으로 인스타그램 포스팅용 카피를 작성하세요. 감각적이고 이모지를 적절히 사용하며, 해시태그를 포함하세요.";
    } else if (format === "blog") {
      systemPrompt += " 네이버 블로그 포스팅 형태의 상세하고 전문적인 카피를 작성하세요. 제목과 본문을 명확히 구분하고 가독성 좋게 작성하세요.";
    } else if (format === "sms") {
      systemPrompt += " 고객에게 발송할 문자(SMS) 형태의 카피를 작성하세요. 핵심만 간결하게 전달하며, 다음 행동(Call to Action)을 유도하세요.";
    } else {
      systemPrompt += " 제공된 정보를 바탕으로 매력적인 홍보 문구를 작성하세요.";
    }

    if (target_audience) {
      systemPrompt += `\n타겟 고객: ${target_audience}`;
    }

    const { text } = await generateText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      prompt: `다음 키포인트를 바탕으로 카피를 작성해주세요:\n${key_points}`,
      temperature: 0.7,
    });

    return NextResponse.json({ success: true, result: text });
  } catch (err: any) {
    console.error("[POST /api/broker/campaign]", err);
    return NextResponse.json({ error: "카피 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
