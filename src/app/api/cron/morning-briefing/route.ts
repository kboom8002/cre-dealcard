import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  crawlCreNews,
  ingestGlobalReports,
  trackSocialSentiment,
  trackYoutubeTrends,
  crawlAuctions,
  computeRentalMarketRates,
} from "@/domain/external/market-crawlers";
import {
  fetchRentalTrend,
  fetchEnergyRating,
  fetchCommercialDistrict,
  fetchOfficialLandPrice,
  fetchConstructionPermits,
  fetchCommercialTransactions,
} from "@/domain/external/gov-premium-apis";

/**
 * GET /api/cron/morning-briefing
 * Vercel Cron: UTC 23:00 (KST 08:00) 매일 자동 실행
 * 모든 외부 데이터를 수집하여 DB에 저장합니다.
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 인증 (CRON_SECRET 환경변수)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startedAt = Date.now();

  try {
    // 1. 뉴스 크롤링 + AI 요약
    const [news, reports, sentiments, youtube, auctions, rentals] = await Promise.all([
      crawlCreNews(supabase),
      ingestGlobalReports(supabase),
      trackSocialSentiment(supabase),
      trackYoutubeTrends(supabase),
      crawlAuctions(supabase),
      computeRentalMarketRates(supabase),
    ]);

    // 2. 보유 건물 중 대표 1개 (에너지 등급용)
    const { data: buildings } = await supabase.from("building_ssot_lite").select("id").limit(1);
    const targetBuildingId = buildings?.[0]?.id || "33333333-0000-0000-0000-000000000001";

    // 3. 정부 API — 3개 권역
    await Promise.all([
      fetchRentalTrend(supabase, "gbd"),
      fetchRentalTrend(supabase, "seongsu"),
      fetchRentalTrend(supabase, "ybd"),
      fetchEnergyRating(supabase, targetBuildingId),
      fetchCommercialDistrict(supabase, "D001"), // 성수
      fetchCommercialDistrict(supabase, "D002"), // 강남
      fetchCommercialDistrict(supabase, "D003"), // 여의도
      // 공시지가 3개 권역 × 2년치
      fetchOfficialLandPrice(supabase, "1168010100101230045", 2026), // GBD
      fetchOfficialLandPrice(supabase, "1120011400100450012", 2026), // 성수
      fetchOfficialLandPrice(supabase, "1156011000100340001", 2026), // 여의도
      fetchOfficialLandPrice(supabase, "1168010100101230045", 2025),
      fetchOfficialLandPrice(supabase, "1120011400100450012", 2025),
      fetchOfficialLandPrice(supabase, "1156011000100340001", 2025),
      // 건축허가 3개 권역
      fetchConstructionPermits(supabase, "gbd"),
      fetchConstructionPermits(supabase, "seongsu"),
      fetchConstructionPermits(supabase, "ybd"),
      // 실거래 ETL — 3개 권역 (당월)
      fetchCommercialTransactions(supabase, "gbd"),
      fetchCommercialTransactions(supabase, "seongsu"),
      fetchCommercialTransactions(supabase, "ybd"),
    ]);

    const elapsedMs = Date.now() - startedAt;
    console.log(`[cron/morning-briefing] Completed in ${elapsedMs}ms`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsedMs,
      summary: {
        newsFetched: news.length,
        reportsFetched: reports.length,
        sentimentsFetched: sentiments.length,
        youtubeFetched: youtube.length,
        auctionsFetched: auctions.length,
        rentalsFetched: rentals.length,
        govApisTriggered: true,
        transactionsFetched: true,
      },
    });
  } catch (err: unknown) {
    console.error("[cron/morning-briefing] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 오류" }, { status: 500 });
  }
}
