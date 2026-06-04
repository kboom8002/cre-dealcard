import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const region = searchParams.get("region");
  const weeks = Math.min(parseInt(searchParams.get("weeks") ?? "12"), 52);

  if (!region) {
    return NextResponse.json({ error: "region is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    // Fetch last N weeks of stats for this region
    const { data: history, error } = await supabase
      .from("broker_sentiment_stats")
      .select("period_label, sentiment_index, vote_count, statistically_significant")
      .eq("region", region)
      .order("period_label", { ascending: false })
      .limit(weeks);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Reverse history to return chronological order
    const reversed = (history ?? []).reverse();

    return NextResponse.json({
      ok: true,
      history: reversed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
