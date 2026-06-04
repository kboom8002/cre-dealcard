import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/public/sentiment-poll
 * Saves a broker's weekly market sentiment response
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerId, score, sentiment, comment } = body;

    if (score === undefined || !sentiment) {
      return NextResponse.json(
        { error: "score와 sentiment가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("market_sentiment_polls")
      .insert({
        broker_id: brokerId || null,
        score: score,
        sentiment: sentiment,
        comment: comment || ""
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error("[api/public/sentiment-poll] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/public/sentiment-poll
 * Aggregates all sentiment poll data to generate a general market sentiment index (G7)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("market_sentiment_polls")
      .select("score, sentiment, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({
        index: 50, // Neutral default
        totalResponses: 0,
        bullishPct: 0,
        neutralPct: 0,
        bearishPct: 0
      });
    }

    const total = data.length;
    let sumScore = 0;
    let bullishCount = 0;
    let neutralCount = 0;
    let bearishCount = 0;

    for (const row of data) {
      sumScore += row.score;
      if (row.sentiment === "bullish") bullishCount++;
      else if (row.sentiment === "neutral") neutralCount++;
      else if (row.sentiment === "bearish") bearishCount++;
    }

    const index = Math.round(sumScore / total);
    const bullishPct = Math.round((bullishCount / total) * 100);
    const neutralPct = Math.round((neutralCount / total) * 100);
    const bearishPct = Math.round((bearishCount / total) * 100);

    return NextResponse.json({
      index,
      totalResponses: total,
      bullishPct,
      neutralPct,
      bearishPct
    });
  } catch (err: unknown) {
    console.error("[api/public/sentiment-poll] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
