import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

const VerifyGateSchema = z.object({
  targetType: z.enum(["general", "qualified", "professional"]),
  kycVerified: z.boolean().optional(),
  kyc_verified: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;
  const isAdmin = guard.role === "admin";

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_gate_verify", 15, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = VerifyGateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "유효한 targetType이 필요합니다." }, { status: 400 });
    }

    const { targetType } = parsed.data;
    // Never trust client kycVerified / kyc_verified: true unless caller is admin
    const resolvedKycVerified =
      isAdmin && (parsed.data.kycVerified === true || parsed.data.kyc_verified === true);
    const resolvedKycVerifiedAt = resolvedKycVerified ? new Date().toISOString() : null;

    const supabase = await createServerSupabaseClient();

    const { data: profile, error } = await supabase
      .from("investor_profiles")
      .update({
        investor_type: targetType,
        kyc_verified: resolvedKycVerified,
        kyc_verified_at: resolvedKycVerifiedAt,
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      const { data: newProfile, error: insErr } = await supabase
        .from("investor_profiles")
        .insert({
          user_id: user.id,
          investor_type: targetType,
          kyc_verified: resolvedKycVerified,
          kyc_verified_at: resolvedKycVerifiedAt,
          investment_preference: [],
          preferred_sectors: [],
        })
        .select("*")
        .single();

      if (insErr) throw insErr;
      return NextResponse.json({ ok: true, data: newProfile });
    }

    return NextResponse.json({ ok: true, data: profile });
  } catch (error: unknown) {
    log.error("[POST /api/funding/gate/verify]", error);
    return NextResponse.json(
      { ok: false, error: "투자자 등급 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
