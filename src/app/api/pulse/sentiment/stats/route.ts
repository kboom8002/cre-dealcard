import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWeekLabel } from "@/domain/pulse/cre-signal-aggregator";
import { verifyAuth } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const region = searchParams.get("region");
  const period = searchParams.get("period") ?? getWeekLabel();

  if (!region) {
    return NextResponse.json({ error: "region is required" }, { status: 400 });
  }

  // Optional auth: if the user is a broker, we also return their vote if any
  const auth = await verifyAuth(req);
  const userId = auth.user?.id;
  const isBroker = auth.role === "broker" || auth.role === "admin";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    // 1. Fetch aggregated stats from broker_sentiment_stats view
    const { data: stats, error: statsErr } = await supabase
      .from("broker_sentiment_stats")
      .select("*")
      .eq("region", region)
      .eq("period_label", period)
      .maybeSingle();

    if (statsErr) {
      return NextResponse.json({ error: statsErr.message }, { status: 500 });
    }

    // 2. Fetch current user's vote if they are an authenticated broker
    let myVote = null;
    if (userId && isBroker) {
      const { data: vote } = await supabase
        .from("broker_sentiment_votes")
        .select("q_transaction, q_lease, q_outlook, comment")
        .eq("user_id", userId)
        .eq("region", region)
        .eq("period_label", period)
        .maybeSingle();
      myVote = vote;
    }

    return NextResponse.json({
      ok: true,
      stats: stats ?? {
        region,
        period_label: period,
        vote_count: 0,
        avg_transaction: 0,
        avg_lease: 0,
        avg_outlook: 0,
        sentiment_index: null,
        statistically_significant: false,
      },
      myVote,
      isBroker,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
