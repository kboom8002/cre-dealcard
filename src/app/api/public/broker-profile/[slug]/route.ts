/**
 * GET /api/public/broker-profile/[slug]
 *
 * 브로커 프로필 + 실적 통계를 공개 반환합니다.
 * slug = 이메일 prefix 또는 display_name 기반 매칭
 * Auth: None (public endpoint).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/api-error";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const decoded = decodeURIComponent(slug);

    if (!decoded || decoded.length > 100) {
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "유효하지 않은 슬러그입니다." },
        },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // 먼저 display_name으로 검색, 없으면 이메일 prefix로 검색
    let profile: Record<string, unknown> | null = null;
    let userId: string | null = null;

    // 1) display_name 기반 검색
    const { data: byName } = await supabase
      .from("profiles")
      .select("id, role, display_name, phone, company, created_at")
      .eq("display_name", decoded)
      .eq("role", "broker")
      .limit(1)
      .maybeSingle();

    if (byName) {
      profile = byName;
      userId = byName.id;
    }

    // 2) 이메일 prefix 기반 검색 (display_name으로 못 찾은 경우)
    if (!profile) {
      const { data: allBrokers } = await supabase
        .from("profiles")
        .select("id, role, display_name, phone, company, created_at")
        .eq("role", "broker");

      // Supabase auth에서 이메일을 조회하기 어려우므로
      // display_name이 slug를 포함하는 경우도 fallback으로 검색
      const match = (allBrokers ?? []).find((p) => {
        const name = (p.display_name ?? "").toLowerCase();
        return name.includes(decoded.toLowerCase());
      });

      if (match) {
        profile = match;
        userId = match.id;
      }
    }

    if (!profile || !userId) {
      return Response.json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "브로커를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    // 브로커 프로필 추가 정보
    const { data: brokerProfile } = await supabase
      .from("broker_profiles")
      .select("specialty_regions, specialty_assets, bio, is_verified, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    // 실적 통계
    const stats = await aggregateBrokerStats(userId);

    return Response.json({
      ok: true,
      data: {
        profile: {
          id: profile.id,
          displayName: profile.display_name,
          company: profile.company,
          createdAt: profile.created_at,
          broker: brokerProfile
            ? {
                specialtyRegions: brokerProfile.specialty_regions,
                specialtyAssets: brokerProfile.specialty_assets,
                bio: brokerProfile.bio,
                isVerified: brokerProfile.is_verified,
              }
            : null,
        },
        stats,
        recentDeals: stats.recentDeals,
      },
    });
  } catch (error) {
    console.error("Public Broker Profile Route Error:", error);
    return toApiError(error);
  }
}
