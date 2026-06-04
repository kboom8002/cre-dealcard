import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchRentalTrend,
  fetchLandUsePlan,
  fetchRegisterSummary,
  fetchEnergyRating,
  fetchCommercialDistrict,
  fetchOfficialLandPrice
} from "@/domain/external/gov-premium-apis";

/**
 * GET /api/public/gov-data?action=verify&region=seongsu&pnu=1120011400100450012&buildingId=test-building-id&districtCode=D001
 * Triggers premium government API integration (A1, A2, A4, A5, A6) and returns stubs (A3)
 */
export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    const region = request.nextUrl.searchParams.get("region") || "seongsu";
    const pnu = request.nextUrl.searchParams.get("pnu") || "1120011400100450012";
    const buildingId = request.nextUrl.searchParams.get("buildingId") || "test-building-id";
    const districtCode = request.nextUrl.searchParams.get("districtCode") || "D001";

    const supabase = createServiceClient();

    if (action === "verify") {
      const [rentalTrend, landUse, registerSummary, energyRating, district, officialPrice] = await Promise.all([
        fetchRentalTrend(supabase, region),
        fetchLandUsePlan(supabase, pnu),
        fetchRegisterSummary(buildingId),
        fetchEnergyRating(supabase, buildingId),
        fetchCommercialDistrict(supabase, districtCode),
        fetchOfficialLandPrice(supabase, pnu, 2026)
      ]);

      // JSON serializable structure (converting BigInt to string)
      const officialPriceSerialized = officialPrice ? {
        ...officialPrice,
        price_per_sqm: officialPrice.price_per_sqm.toString()
      } : null;

      return NextResponse.json({
        success: true,
        data: {
          rentalTrend,
          landUse,
          registerSummary,
          energyRating,
          district,
          officialPrice: officialPriceSerialized
        }
      });
    }

    return NextResponse.json({
      success: false,
      message: "action=verify 파라미터가 필요합니다."
    });
  } catch (err: unknown) {
    console.error("[api/public/gov-data] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
