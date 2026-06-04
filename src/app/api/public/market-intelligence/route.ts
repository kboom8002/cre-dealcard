import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  crawlCreNews,
  ingestGlobalReports,
  trackSocialSentiment,
  trackYoutubeTrends,
  crawlAuctions,
  computeRentalMarketRates
} from "@/domain/external/market-crawlers";
import {
  fetchRentalTrend,
  fetchEnergyRating,
  fetchCommercialDistrict,
  fetchOfficialLandPrice
} from "@/domain/external/gov-premium-apis";

/**
 * GET /api/public/market-intelligence?action=crawl
 * Triggers all external market intelligence crawlers and populates the database (E2-E7)
 */
export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    const supabase = createServiceClient();

    if (action === "crawl") {
      // 1. Run basic market crawlers
      const [news, reports, sentiments, youtube, auctions, rentals] = await Promise.all([
        crawlCreNews(supabase),
        ingestGlobalReports(supabase),
        trackSocialSentiment(supabase),
        trackYoutubeTrends(supabase),
        crawlAuctions(supabase),
        computeRentalMarketRates(supabase)
      ]);

      // 2. Query for a building to attach energy ratings to (fallback to dummy UUID)
      const { data: buildings } = await supabase.from("building_ssot_lite").select("id").limit(1);
      const targetBuildingId = buildings?.[0]?.id || "33333333-0000-0000-0000-000000000001";

      // 3. Run government premium APIs
      await Promise.all([
        fetchRentalTrend(supabase, "gbd"),
        fetchRentalTrend(supabase, "seongsu"),
        fetchRentalTrend(supabase, "ybd"),
        fetchEnergyRating(supabase, targetBuildingId),
        fetchCommercialDistrict(supabase, "D001"), // Seongsu
        fetchCommercialDistrict(supabase, "D002"), // Gangnam
        fetchOfficialLandPrice(supabase, "1168010100101230045", 2026), // GBD
        fetchOfficialLandPrice(supabase, "1120011400100450012", 2026), // Seongsu
        fetchOfficialLandPrice(supabase, "1168010100101230045", 2025),
        fetchOfficialLandPrice(supabase, "1120011400100450012", 2025),
      ]);

      return NextResponse.json({
        success: true,
        summary: {
          newsFetched: news.length,
          reportsFetched: reports.length,
          sentimentsFetched: sentiments.length,
          youtubeFetched: youtube.length,
          auctionsFetched: auctions.length,
          rentalsFetched: rentals.length,
          govApisTriggered: true
        }
      });
    }

    // Default: fetch consolidated dashboard view
    const [news, reports, sentiments, youtube, auctions, rentals] = await Promise.all([
      supabase.from("external_news").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("external_reports").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("social_sentiment").select("*").order("analysis_date", { ascending: false }).limit(5),
      supabase.from("youtube_trends").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("auction_listings").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("rental_market_data").select("*").order("updated_at", { ascending: false }).limit(5)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        news: news.data || [],
        reports: reports.data || [],
        sentiments: sentiments.data || [],
        youtube: youtube.data || [],
        auctions: auctions.data || [],
        rentals: rentals.data || []
      }
    });
  } catch (err: unknown) {
    console.error("[api/public/market-intelligence] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
