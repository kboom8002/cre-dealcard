/**
 * GET /api/marketplace/search
 * Public anonymous API route for leasing marketplace.
 * Enforces strict disclosure guard by only returning safe blind teaser details!
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const spaceType = url.searchParams.get("space_type");
    const region = url.searchParams.get("region");
    const depositMax = url.searchParams.get("deposit_max");
    const monthlyRentMax = url.searchParams.get("monthly_rent_max");
    const areaMin = url.searchParams.get("area_min");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Public key to strictly respect anon RLS!
      { auth: { persistSession: false } },
    );

    // Fetch active listed spaces
    let query = supabase
      .from("lease_spaces")
      .select(`
        id,
        floor,
        area_sqm,
        space_type,
        deposit,
        monthly_rent,
        maintenance_fee,
        available_from,
        lease_term_months,
        incentives,
        restrictions,
        building:building_id (
          id,
          area_signal,
          fit_summary,
          caution_summary
        )
      `)
      .eq("status", "active")
      .eq("is_marketplace_listed", true);

    if (spaceType && spaceType !== "all") {
      query = query.eq("space_type", spaceType);
    }

    if (depositMax) {
      query = query.lte("deposit", parseFloat(depositMax));
    }

    if (monthlyRentMax) {
      query = query.lte("monthly_rent", parseFloat(monthlyRentMax));
    }

    if (areaMin) {
      query = query.gte("area_sqm", parseFloat(areaMin));
    }

    const { data: spaces, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by region in JS since area_signal resides in building_ssot_lite
    let filteredSpaces = spaces || [];
    if (region && region.trim() !== "") {
      const normRegion = region.trim().toLowerCase();
      filteredSpaces = filteredSpaces.filter(s => {
        const b = Array.isArray(s.building) ? s.building[0] : s.building;
        const areaSignal = b?.area_signal?.toLowerCase() || "";
        return areaSignal.includes(normRegion);
      });
    }

    // For each space, fetch the public safe blind teaser document
    const spaceIds = filteredSpaces.map(s => s.id);
    let teasers: any[] = [];
    if (spaceIds.length > 0) {
      const { data: teaserDocs } = await supabase
        .from("document_objects")
        .select("source_id, title, body, markdown")
        .eq("document_type", "blind_teaser")
        .in("source_id", spaceIds);
      teasers = teaserDocs || [];
    }

    const results = filteredSpaces.map(space => {
      const teaser = teasers.find(t => t.source_id === space.id);
      const b = Array.isArray(space.building) ? space.building[0] : space.building;
      return {
        id: space.id,
        building_id: b?.id || null,
        floor: space.floor,
        area_sqm: space.area_sqm,
        space_type: space.space_type,
        deposit: space.deposit,
        monthly_rent: space.monthly_rent,
        maintenance_fee: space.maintenance_fee,
        incentives: space.incentives,
        restrictions: space.restrictions,
        // SAFE derived signal
        area_signal: b?.area_signal || "서울",
        fit_summary: b?.fit_summary || "",
        caution_summary: b?.caution_summary || "",
        // Derived teaser
        title: teaser?.title || `${b?.area_signal || "서울"} ${space.space_type === "office" ? "오피스" : "상가"} 임대`,
        shortSummary: teaser?.body?.shortSummary || "",
        dealPoints: teaser?.body?.dealPoints || [],
        cautionPoints: teaser?.body?.cautionPoints || [],
        hiddenInfoNotice: teaser?.body?.hiddenInfoNotice || [],
        kakaoText: teaser?.markdown || "",
      };
    });

    return NextResponse.json({
      ok: true,
      data: results,
    });
  } catch (error) {
    console.error("Public search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
