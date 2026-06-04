import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/public/explore/search
 * Unified search endpoint for the Explore page.
 * type=deal|space|market, region=gbd|ybd|..., q=keyword
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "deal";
  const region = searchParams.get("region") ?? "";
  const q = searchParams.get("q") ?? "";

  const supabase = createServiceClient();

  try {
    if (type === "deal") {
      let query = supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band, status, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24);

      if (region && region !== "all") {
        // Map slug to area_signal partial match
        const regionLabel = {
          gbd: "강남",
          ybd: "여의도",
          cbd: "종로",
          seongsu: "성수",
          pangyo: "판교",
          mapo: "마포",
          jongno: "종로",
          hongdae: "홍대",
        }[region];
        if (regionLabel) query = query.ilike("area_signal", `%${regionLabel}%`);
      }
      if (q) {
        query = query.or(`area_signal.ilike.%${q}%,asset_type.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    if (type === "space") {
      let query = supabase
        .from("lease_spaces")
        .select("id, floor, area_sqm, space_type, deposit, monthly_rent, area_signal, title, status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24);

      if (region && region !== "all") {
        const regionLabel = {
          gbd: "강남",
          ybd: "여의도",
          cbd: "종로",
          seongsu: "성수",
          pangyo: "판교",
          mapo: "마포",
          jongno: "종로",
          hongdae: "홍대",
        }[region];
        if (regionLabel) query = query.ilike("area_signal", `%${regionLabel}%`);
      }
      if (q) {
        query = query.or(`area_signal.ilike.%${q}%,title.ilike.%${q}%,space_type.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    if (type === "market") {
      let query = supabase
        .from("cre_pulses")
        .select("region, period_type, pulse_score, trend, summary_ko, period_label, seo_slug")
        .eq("status", "published")
        .eq("period_type", "weekly")
        .order("created_at", { ascending: false })
        .limit(16);

      if (region && region !== "all") {
        query = query.eq("region", region);
      }
      if (q) {
        query = query.ilike("summary_ko", `%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    return NextResponse.json({ data: [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "검색 오류" }, { status: 500 });
  }
}
