/**
 * /api/vendor/service-cards
 * GET  — 서비스 카드 목록 (공개 + 본인)
 * POST — 서비스 카드 생성 (vendor tier 한도 체크)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCreateServiceCard } from "@/domain/vendor/vendor-tier";
import type { VendorTier } from "@/domain/vendor/vendor-tier";

/* ── GET: 서비스 카드 목록 ─────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category") ?? undefined;
  const region   = searchParams.get("region")   ?? undefined;
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const supabase = createServiceClient();

  let query = supabase
    .from("service_cards")
    .select(`
      id, service_category, title, description,
      service_regions, target_assets,
      price_range, price_unit,
      completion_count, avg_rating,
      vendor_id,
      vendor_profiles!inner (
        id, company_name, vendor_category, vendor_tier,
        is_verified, specialty_regions
      ),
      status, created_at
    `)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category) query = query.eq("service_category", category);
  if (region)   query = query.contains("service_regions", [region]);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ serviceCards: data ?? [] });
}

/* ── POST: 서비스 카드 생성 ────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    vendorId: string;
    serviceCategory: string;
    title: string;
    description: string;
    serviceRegions?: string[];
    targetAssets?: string[];
    priceRange?: string;
    priceUnit?: string;
    portfolioSummary?: string;
    matchConditions?: Record<string, unknown>;
  };

  if (!body.vendorId || !body.title || !body.description || !body.serviceCategory) {
    return NextResponse.json({ error: "필수 필드가 누락되었습니다." }, { status: 400 });
  }

  // vendor tier 한도 체크
  const { data: vendor } = await supabase
    .from("vendor_profiles")
    .select("vendor_tier")
    .eq("id", body.vendorId)
    .single();

  if (!vendor) {
    return NextResponse.json({ error: "벤더 프로필을 찾을 수 없습니다." }, { status: 404 });
  }

  const { count: currentCount } = await supabase
    .from("service_cards")
    .select("*", { count: "exact", head: true })
    .eq("vendor_id", body.vendorId)
    .neq("status", "archived");

  const tierCheck = canCreateServiceCard(
    vendor.vendor_tier as VendorTier,
    currentCount ?? 0
  );

  if (!tierCheck.allowed) {
    return NextResponse.json({ error: tierCheck.reason }, { status: 403 });
  }

  // 서비스 카드 생성
  const { data, error } = await supabase
    .from("service_cards")
    .insert({
      vendor_id:         body.vendorId,
      service_category:  body.serviceCategory,
      title:             body.title,
      description:       body.description,
      service_regions:   body.serviceRegions ?? [],
      target_assets:     body.targetAssets ?? [],
      price_range:       body.priceRange ?? null,
      price_unit:        body.priceUnit ?? null,
      portfolio_summary: body.portfolioSummary ?? null,
      match_conditions:  body.matchConditions ?? {},
      status:            "published",
    })
    .select("id, title, service_category")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ serviceCard: data }, { status: 201 });
}

export const runtime = "nodejs";
