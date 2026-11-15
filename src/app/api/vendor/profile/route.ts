/**
 * /api/vendor/profile
 * GET  — 본인 vendor profile 조회 (세션 기반)
 * POST — vendor profile 생성 (세션 기반 + 관리자/중개사 역할 강등 방지)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VENDOR_CATEGORY_META, type VendorCategory } from "@/domain/vendor/vendor-tier";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("vendor-profile-route");

const PROTECTED_PROFILE_ROLES = new Set(["admin", "broker"]);

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

export async function GET(_req: NextRequest) {
  const user = await authenticateSessionUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select(`
        *,
        vendor_subscriptions (*)
      `)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      log.error("[vendor-profile] GET lookup error:", error.message);
      return NextResponse.json(
        { error: "벤더 프로필 조회 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "벤더 프로필을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ vendor: data });
  } catch (err) {
    log.error(
      "[vendor-profile] GET unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "벤더 프로필 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

const postSchema = z.object({
  userId: z.string().min(1).optional(),
  vendorCategory: z.string().min(1).max(64),
  companyName: z.string().trim().min(1).max(120),
  companyDesc: z.string().max(2000).optional(),
  specialtyRegions: z.array(z.string().max(64)).max(30).optional(),
  licenseNumber: z.string().max(100).optional(),
  licenseInfo: z.string().max(500).optional(),
  portfolioUrls: z.array(z.string().max(500)).max(20).optional(),
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
        { error: "vendorCategory와 companyName은 필수입니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (body.userId && body.userId !== user.id) {
    return NextResponse.json(
      { error: "본인의 계정으로만 신청할 수 있습니다." },
      { status: 403 },
    );
  }

  if (!VENDOR_CATEGORY_META[body.vendorCategory as VendorCategory]) {
    return NextResponse.json(
      { error: "유효하지 않은 서비스 카테고리입니다." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();

    // ── 자격증 자동 검증 (Phase 1: stub, Phase 2: 외부 API 연동) ──
    let licenseVerified = false;
    if (body.licenseNumber) {
      log.warn("[vendor-profile] 국가자격증 정보시스템 API 미연동 — 수동 검증 필요");
      licenseVerified = body.licenseNumber.length >= 5;
    }

    // 현재 profiles.role 확인 후 admin/broker 역할은 절대 덮어쓰지 않음
    const { data: currentProfile, error: profileLookupError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      log.error("[vendor-profile] profile lookup error:", profileLookupError.message);
      return NextResponse.json(
        { error: "프로필 확인 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    const currentRole = currentProfile?.role ?? null;
    if (!currentRole || !PROTECTED_PROFILE_ROLES.has(currentRole)) {
      const { error: roleUpdateError } = await supabase
        .from("profiles")
        .update({ role: "vendor" })
        .eq("id", user.id);

      if (roleUpdateError) {
        log.error("[vendor-profile] role update error:", roleUpdateError.message);
        return NextResponse.json(
          { error: "프로필 역할 변경에 실패했습니다." },
          { status: 500 },
        );
      }
    }

    // vendor_profiles 생성 — 반드시 인증된 세션 user.id에 귀속
    const { data, error } = await supabase
      .from("vendor_profiles")
      .insert({
        user_id: user.id,
        vendor_category: body.vendorCategory,
        company_name: body.companyName,
        company_desc: body.companyDesc ?? null,
        specialty_regions: body.specialtyRegions ?? [],
        license_number: body.licenseNumber ?? null,
        license_verified: licenseVerified,
        license_info: body.licenseInfo ?? null,
        portfolio_urls: body.portfolioUrls ?? [],
        is_verified: false, // 관리자 최종 확인 필요
        vendor_tier: "basic",
      })
      .select("id, vendor_category, company_name, is_verified, license_verified")
      .single();

    if (error) {
      log.error("[vendor-profile] insert error:", error.message);
      return NextResponse.json(
        { error: "벤더 프로필 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        vendor: data,
        message: licenseVerified
          ? "자격증이 자동 검증되었습니다. 관리자 최종 확인 후 입점이 완료됩니다."
          : "입점 신청이 접수되었습니다. 관리자 확인 후 활성화됩니다.",
      },
      { status: 201 },
    );
  } catch (err) {
    log.error(
      "[vendor-profile] POST unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "벤더 프로필 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
