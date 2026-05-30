/**
 * /api/vendor/profile
 * GET  — 본인 vendor profile 조회
 * POST — vendor profile 생성 (자격증 API 자동검증 + 관리자 최종 확인)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { VENDOR_CATEGORY_META, type VendorCategory } from "@/domain/vendor/vendor-tier";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 실제 JWT 파싱 생략 — service client로 조회
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "x-user-id header required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("vendor_profiles")
    .select(`
      *,
      vendor_subscriptions (*)
    `)
    .eq("user_id", userId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ vendor: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const body = await req.json() as {
    userId: string;
    vendorCategory: VendorCategory;
    companyName: string;
    companyDesc?: string;
    specialtyRegions?: string[];
    licenseNumber?: string;
    licenseInfo?: string;
    portfolioUrls?: string[];
  };

  if (!body.userId || !body.vendorCategory || !body.companyName) {
    return NextResponse.json(
      { error: "userId, vendorCategory, companyName은 필수입니다." },
      { status: 400 }
    );
  }

  if (!VENDOR_CATEGORY_META[body.vendorCategory]) {
    return NextResponse.json({ error: "유효하지 않은 서비스 카테고리입니다." }, { status: 400 });
  }

  // ── 자격증 자동 검증 (Phase 1: stub, Phase 2: 외부 API 연동) ──
  let licenseVerified = false;
  if (body.licenseNumber) {
    // TODO: 실제 자격증 API 연동 (국가자격증 정보시스템 등)
    // 현재는 번호 형식 검증만 수행
    licenseVerified = body.licenseNumber.length >= 5;
  }

  // profiles.role을 vendor로 업데이트
  await supabase
    .from("profiles")
    .update({ role: "vendor" })
    .eq("id", body.userId);

  // vendor_profiles 생성
  const { data, error } = await supabase
    .from("vendor_profiles")
    .insert({
      user_id:          body.userId,
      vendor_category:  body.vendorCategory,
      company_name:     body.companyName,
      company_desc:     body.companyDesc ?? null,
      specialty_regions: body.specialtyRegions ?? [],
      license_number:   body.licenseNumber ?? null,
      license_verified: licenseVerified,
      license_info:     body.licenseInfo ?? null,
      portfolio_urls:   body.portfolioUrls ?? [],
      is_verified:      false, // 관리자 최종 확인 필요
      vendor_tier:      "basic",
    })
    .select("id, vendor_category, company_name, is_verified, license_verified")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    vendor: data,
    message: licenseVerified
      ? "자격증이 자동 검증되었습니다. 관리자 최종 확인 후 입점이 완료됩니다."
      : "입점 신청이 접수되었습니다. 관리자 확인 후 활성화됩니다.",
  }, { status: 201 });
}

export const runtime = "nodejs";
