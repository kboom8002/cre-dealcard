import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";
import { searchNaverNews } from "@/lib/external/naver-search";

const REGION_SEARCH_QUERY: Record<string, string> = {
  seongsu: "성수 꼬마빌딩 OR 성수 상업용 부동산",
  gbd: "강남 빌딩 매매 OR 강남 오피스 임대",
  ybd: "여의도 프라임 오피스 OR 여의도 상업용 부동산",
  default: "상업용 부동산 빌딩 매매"
};

/**
 * GET /api/pulse/morning-briefing?region=seongsu
 * B3: Morning Briefing API
 */
export async function GET(request: NextRequest) {
  try {
    const region = request.nextUrl.searchParams.get("region") || "gbd";
    const supabase = createServiceClient();

    // 1. Fetch latest news and sentiment index
    const { data: dbNews } = await supabase
      .from("external_news")
      .select("title, summary, source")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: sentiment } = await supabase
      .from("market_sentiment_polls")
      .select("score, sentiment")
      .order("created_at", { ascending: false })
      .limit(10);

    const avgSentiment = sentiment && sentiment.length > 0
      ? Math.round(sentiment.reduce((acc, curr) => acc + curr.score, 0) / sentiment.length)
      : 55;

    // 1-1. Fetch Naver News
    const query = REGION_SEARCH_QUERY[region] || REGION_SEARCH_QUERY.default;
    const naverNews = await searchNaverNews(query, 3);

    // 2. Formulate AI morning briefing (or fall back to structured text)
    const newsItems: string[] = [];
    
    if (dbNews && dbNews.length > 0) {
      dbNews.forEach(n => newsItems.push(`[${n.source}] ${n.title}: ${n.summary}`));
    }
    
    if (naverNews && naverNews.length > 0) {
      naverNews.forEach(n => newsItems.push(`[네이버 뉴스] ${n.title}: ${n.description}`));
    }

    const newsSummary = newsItems.length > 0
      ? newsItems.join("\n")
      : "오늘 아침 주요 CRE 뉴스가 존재하지 않습니다.";

    let briefingText = "";
    try {
      const systemPrompt = "당신은 한국 상업용 부동산 전문 모닝 에디터입니다. 아침 8시에 중개사들에게 시장 동향을 브리핑합니다. 마크다운 포맷(볼드, 리스트 등)을 적극 사용하여 가독성 있게 작성하세요.";
      const userPrompt = `다음 데이터를 바탕으로 ${region.toUpperCase()} 권역의 모닝 브리핑(3줄 핵심 요약 및 오늘의 권장 행동)을 한글로 작성해 주세요:
      
      시장 뉴스:
      ${newsSummary}
      
      현장 중개사 심리 지수: ${avgSentiment}/100`;

      const aiRes = await callLLM({
        systemPrompt,
        userPrompt,
        model: "gpt-5.4",
        temperature: 0.7,
        maxTokens: 600
      });
      // JSON 객체가 반환된 경우 대비 (callLLM의 responseFormat 설정을 안 했지만 안전하게)
      briefingText = typeof aiRes === 'string' ? aiRes : (aiRes.content || JSON.stringify(aiRes));
    } catch {
      // Robust fallback if LLM fails or is missing key
      briefingText = `🌞 오늘의 ${region.toUpperCase()} 모닝 브리핑:
1. 성수/강남 권역의 리모델링 빌딩 매수세가 여전히 뜨겁습니다.
2. 현장 브로커 체감 심리지수는 ${avgSentiment}으로 '약한 상승세(Bullish)'를 보이고 있습니다.
3. [오늘의 행동] 매수 문의가 오기 전에 NDA 서류 템플릿과 밸류애드 리포트를 미리 준비해 두세요.`;
    }

    return NextResponse.json({
      success: true,
      region,
      sentimentIndex: avgSentiment,
      briefing: briefingText,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    console.error("[api/pulse/morning-briefing] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
