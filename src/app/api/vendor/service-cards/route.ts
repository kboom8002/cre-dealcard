/**
 * /api/vendor/service-cards
 * GET  — 공개 서비스 카드 목록 조회
 * POST — 서비스 카드 생성 (세션 인증 + 본인 vendor_profiles 소유권 검증 + tier 한도 체크)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canCreateServiceCard,
  VENDOR_CATEGORY_META,
  type VendorCategory,
  type VendorTier,
} from "@/domain/vendor/vendor-tier";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("vendor-service-cards-route");

async function authenticateSessionUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const authClient = await createServerSupabaseClient();
    const { data, error } = await authClient.auth.getUser();
    if (error || !data?.user?.id) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

/* ── GET: 서비스 카드 목록 ─────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category") ?? undefined;
    const region = searchParams.get("region") ?? undefined;
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);

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
    if (region) query = query.contains("service_regions", [region]);

    const { data, error } = await query;

    if (error) {
      log.error("[vendor-service-cards] GET error:", error.message);
      return NextResponse.json(
        { error: "서비스 카드 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ serviceCards: data ?? [] });
  } catch (err) {
    log.error(
      "[vendor-service-cards] GET unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "서비스 카드 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/* ── POST: 서비스 카드 생성 ────────────────────────────────────── */
const postSchema = z.object({
  vendorId: z.string().min(1).max(128).optional(),
  serviceCategory: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(4000),
  serviceRegions: z.array(z.string().max(64)).max(30).optional(),
  targetAssets: z.array(z.string().max(64)).max(30).optional(),
  priceRange: z.string().max(100).optional(),
  priceUnit: z.string().max(64).optional(),
  portfolioSummary: z.string().max(2000).optional(),
  matchConditions: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await authenticateSessionUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    const raw = await req.json();
    body = postSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "필수 필드가 누락되었거나 입력 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!VENDOR_CATEGORY_META[body.serviceCategory as VendorCategory]) {
    return NextResponse.json(
      { error: "유효하지 않은 서비스 카테고리입니다." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();

    // 본인 소유의 vendor_profiles 확인 (임의 body.vendorId 위조 차단)
    let vendorQuery = supabase
      .from("vendor_profiles")
      .select("id, user_id, vendor_tier");

    vendorQuery = body.vendorId
      ? vendorQuery.eq("id", body.vendorId)
      : vendorQuery.eq("user_id", user.id);

    const { data: vendor, error: vendorErr } = await vendorQuery.maybeSingle();

    if (vendorErr) {
      log.error("[vendor-service-cards] vendor lookup error:", vendorErr.message);
      return NextResponse.json(
        { error: "벤더 정보를 확인하지 못했습니다." },
        { status: 500 },
      );
    }

    if (!vendor) {
      return NextResponse.json(
        { error: "벤더 프로필을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (vendor.user_id !== user.id) {
      return NextResponse.json(
        { error: "본인의 벤더 프로필로만 서비스 카드를 등록할 수 있습니다." },
        { status: 403 },
      );
    }

    const { count: currentCount, error: countErr } = await supabase
      .from("service_cards")
      .select("*", { count: "exact", head: true })
      .eq("vendor_id", vendor.id)
      .neq("status", "archived");

    if (countErr) {
      log.error("[vendor-service-cards] count error:", countErr.message);
      return NextResponse.json(
        { error: "서비스 카드 한도를 확인하지 못했습니다." },
        { status: 500 },
      );
    }

    const tierCheck = canCreateServiceCard(
      vendor.vendor_tier as VendorTier,
      currentCount ?? 0,
    );

    if (!tierCheck.allowed) {
      return NextResponse.json({ error: tierCheck.reason }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("service_cards")
      .insert({
        vendor_id: vendor.id,
        service_category: body.serviceCategory,
        title: body.title,
        description: body.description,
        service_regions: body.serviceRegions ?? [],
        target_assets: body.targetAssets ?? [],
        price_range: body.priceRange ?? null,
        price_unit: body.priceUnit ?? null,
        portfolio_summary: body.portfolioSummary ?? null,
        match_conditions: body.matchConditions ?? {},
        status: "published",
      })
      .select("id, title, service_category")
      .single();

    if (error) {
      log.error("[vendor-service-cards] insert error:", error.message);
      return NextResponse.json(
        { error: "서비스 카드 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ serviceCard: data }, { status: 201 });
  } catch (err) {
    log.error(
      "[vendor-service-cards] POST unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "서비스 카드 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
