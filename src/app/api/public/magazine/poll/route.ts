import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/public/magazine/poll
 * Records a subscriber's vote on a magazine poll question
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerId, editionDate, choice, subscriberPhone } = body;

    if (!brokerId || !editionDate || choice === undefined) {
      return NextResponse.json(
        { error: "brokerId, editionDate, choice가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Check for duplicate vote
    if (subscriberPhone) {
      const { data: existing } = await supabase
        .from("magazine_poll_responses")
        .select("id")
        .eq("broker_id", brokerId)
        .eq("edition_date", editionDate)
        .eq("subscriber_phone", subscriberPhone)
        .maybeSingle();

      if (existing) {
        // Return current results without inserting duplicate
        const results = await getResults(supabase, brokerId, editionDate);
        return NextResponse.json({ ok: true, alreadyVoted: true, results });
      }
    }

    // Insert vote
    await supabase.from("magazine_poll_responses").insert({
      broker_id: brokerId,
      edition_date: editionDate,
      choice: choice,
      subscriber_phone: subscriberPhone || null,
    });

    const results = await getResults(supabase, brokerId, editionDate);
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    console.error("[api/public/magazine/poll] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/public/magazine/poll?brokerId=xxx&editionDate=yyyy-mm-dd
 * Returns aggregated poll results for a magazine edition
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brokerId = searchParams.get("brokerId");
    const editionDate = searchParams.get("editionDate");

    if (!brokerId || !editionDate) {
      return NextResponse.json(
        { error: "brokerId와 editionDate가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const results = await getResults(supabase, brokerId, editionDate);
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    console.error("[api/public/magazine/poll] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

async function getResults(supabase: any, brokerId: string, editionDate: string) {
  const { data: votes } = await supabase
    .from("magazine_poll_responses")
    .select("choice")
    .eq("broker_id", brokerId)
    .eq("edition_date", editionDate);

  const total = (votes || []).length;
  const counts: Record<number, number> = {};
  for (const v of votes || []) {
    counts[v.choice] = (counts[v.choice] || 0) + 1;
  }

  return { total, counts };
}
