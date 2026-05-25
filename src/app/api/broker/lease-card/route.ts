/**
 * GET /api/broker/lease-card — 중개인이 등록한 임대 공간 목록 조회
 * Auth: Required (broker or admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireBroker } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const search = url.searchParams.get("search");

  // Fetch broker's lease spaces
  let query = supabase
    .from("lease_spaces")
    .select(`
      *,
      building:building_id (
        area_signal
      )
    `)
    .eq("broker_id", auth.user!.id)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("space_type", `%${search}%`);
  }

  const { data: spaces, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch matching count for each space
  const spaceIds = (spaces || []).map((s) => s.id);
  let matchCounts: Record<string, number> = {};

  if (spaceIds.length > 0) {
    const { data: matches } = await supabase
      .from("lease_match_results")
      .select("lease_space_id")
      .in("lease_space_id", spaceIds);

    if (matches) {
      matches.forEach((m) => {
        matchCounts[m.lease_space_id] = (matchCounts[m.lease_space_id] || 0) + 1;
      });
    }
  }

  const results = (spaces || []).map((space) => ({
    ...space,
    match_count: matchCounts[space.id] || 0,
  }));

  return NextResponse.json({ data: results });
}
