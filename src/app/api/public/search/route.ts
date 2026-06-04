import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/public/search
 * Unified public search API for deals, spaces, market pulse, and brokers.
 * Params:
 *  - type: deal | space | market | broker (default: deal)
 *  - region: gbd | ybd | cbd | seongsu | pangyo | all (default: all)
 *  - q: keyword (default: "")
 *  - page: page number (default: 1)
 *  - limit: items per page (default: 24)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "deal";
  const region = searchParams.get("region") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "24", 10);

  const supabase = createServiceClient();

  try {
    // 1. DEAL SEARCH
    if (type === "deal") {
      let query = supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band, status, created_at")
        .eq("status", "public_signal_ready")
        .order("created_at", { ascending: false });

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
        query = query.or(`area_signal.ilike.%${q}%,asset_type.ilike.%${q}%`);
      }

      // Pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ 
        data: data ?? [], 
        total: count ?? data?.length ?? 0, 
        page, 
        limit 
      });
    }

    // 2. SPACE SEARCH (LEASING)
    if (type === "space") {
      let query = supabase
        .from("lease_spaces")
        .select("id, floor, area_sqm, space_type, deposit, monthly_rent, area_signal, title, status")
        .eq("status", "active")
        .order("created_at", { ascending: false });

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

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ 
        data: data ?? [], 
        total: count ?? data?.length ?? 0, 
        page, 
        limit 
      });
    }

    // 3. MARKET PULSE SEARCH
    if (type === "market") {
      let query = supabase
        .from("cre_pulses")
        .select("region, period_type, pulse_score, trend, summary_ko, period_label, seo_slug")
        .eq("status", "published")
        .eq("period_type", "weekly")
        .order("created_at", { ascending: false });

      if (region && region !== "all") {
        query = query.eq("region", region);
      }
      if (q) {
        query = query.ilike("summary_ko", `%${q}%`);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ 
        data: data ?? [], 
        total: count ?? data?.length ?? 0, 
        page, 
        limit 
      });
    }

    // 4. BROKER SEARCH
    if (type === "broker") {
      const { data: brokers, error } = await supabase
        .from("profiles")
        .select(`
          id,
          display_name,
          company,
          photo_url,
          tagline,
          broker_profiles!inner (
            slug,
            specialty_regions,
            specialty_assets,
            bio,
            vibe_vti,
            vibe_trust,
            vibe_valence,
            is_public,
            seo_summary,
            total_deal_count_self,
            is_verified
          )
        `)
        .eq("role", "broker")
        .eq("broker_profiles.is_public", true);

      if (error) throw error;

      let filtered = brokers ?? [];

      // A. Region filter
      if (region && region !== "all") {
        const reg = region.toLowerCase();
        filtered = filtered.filter((p: any) => {
          const bp = p.broker_profiles || {};
          const regions = bp.specialty_regions || [];
          return regions.some((r: string) => {
            const rLower = r.toLowerCase();
            return (
              rLower.includes(reg) ||
              (reg === "gbd" && (rLower.includes("강남") || rLower.includes("서초"))) ||
              (reg === "ybd" && (rLower.includes("여의도") || rLower.includes("영등포") || rLower.includes("마포"))) ||
              (reg === "cbd" && (rLower.includes("종로") || rLower.includes("중구") || rLower.includes("도심"))) ||
              (reg === "seongsu" && rLower.includes("성수")) ||
              (reg === "pangyo" && rLower.includes("판교"))
            );
          });
        });
      }

      // B. Keyword filter (q)
      if (q) {
        const qLower = q.toLowerCase();
        filtered = filtered.filter((p: any) => {
          const bp = p.broker_profiles || {};
          const displayName = (p.display_name ?? "").toLowerCase();
          const company = (p.company ?? "").toLowerCase();
          const tagline = (p.tagline ?? "").toLowerCase();
          const bio = (bp.bio ?? "").toLowerCase();
          const seoSummary = (bp.seo_summary ?? "").toLowerCase();
          
          const regions = (bp.specialty_regions ?? []).join(" ").toLowerCase();
          const assets = (bp.specialty_assets ?? []).join(" ").toLowerCase();
          const vti = (bp.vibe_vti ?? "").toLowerCase();
          
          return (
            displayName.includes(qLower) ||
            company.includes(qLower) ||
            tagline.includes(qLower) ||
            bio.includes(qLower) ||
            seoSummary.includes(qLower) ||
            regions.includes(qLower) ||
            assets.includes(qLower) ||
            vti.includes(qLower)
          );
        });
      }

      // C. Sort: Verified brokers first, then total deal count, then alphabetical
      filtered.sort((a: any, b: any) => {
        const aBp = a.broker_profiles || {};
        const bBp = b.broker_profiles || {};
        
        if (aBp.is_verified && !bBp.is_verified) return -1;
        if (!aBp.is_verified && bBp.is_verified) return 1;

        const aDeals = aBp.total_deal_count_self ?? 0;
        const bDeals = bBp.total_deal_count_self ?? 0;
        if (aDeals !== bDeals) return bDeals - aDeals;

        return (a.display_name ?? "").localeCompare(b.display_name ?? "");
      });

      // D. Paginate
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      const formatted = paginated.map((p: any) => {
        const bp = p.broker_profiles || {};
        return {
          id: p.id,
          displayName: p.display_name,
          company: p.company,
          photoUrl: p.photo_url,
          tagline: p.tagline,
          slug: bp.slug,
          specialtyRegions: bp.specialty_regions || [],
          specialtyAssets: bp.specialty_assets || [],
          bio: bp.bio,
          vibeVti: bp.vibe_vti,
          vibeTrust: bp.vibe_trust,
          vibeValence: bp.vibe_valence,
          totalDealCount: bp.total_deal_count_self || 0,
          isVerified: bp.is_verified,
          seoSummary: bp.seo_summary
        };
      });

      return NextResponse.json({
        data: formatted,
        total: filtered.length,
        page,
        limit
      });
    }

    return NextResponse.json({ data: [], total: 0, page, limit });
  } catch (err: any) {
    console.error("Search API Endpoint Error:", err);
    return NextResponse.json(
      { error: err.message ?? "검색 오류" }, 
      { status: 500 }
    );
  }
}
