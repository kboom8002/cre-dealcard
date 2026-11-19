/**
 * GET /api/public/broker-profile/[slug]
 *
 * 공개 설정(`broker_profiles.is_public = true`)된 공인중개사 프로필 + 검증된 공개 딜카드 통계를 반환합니다.
 * Auth: None (public endpoint, IP rate-limited, strict opt-in visibility).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { escapeIlike } from "@/lib/utils/postgrest-escape";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_BROKER_SLUG_RE = /^[a-zA-Z0-9가-힣._\s-]{1,80}$/;

interface BrokerProfilePublicRow {
  user_id: string;
  slug?: string | null;
  specialty_regions?: string[] | null;
  specialty_assets?: string[] | null;
  bio?: string | null;
  is_verified?: boolean | null;
  is_public?: boolean | null;
  created_at?: string | null;
}

async function findOptedInBrokerProfile(
  supabase: ReturnType<typeof createServiceClient>,
  column: "slug" | "user_id",
  value: string,
): Promise<BrokerProfilePublicRow | null> {
  const { data } = await supabase
    .from("broker_profiles")
    .select(
      "user_id, slug, specialty_regions, specialty_assets, bio, is_verified, is_public, created_at",
    )
    .eq(column, value)
    .eq("is_public", true)
    .limit(1)
    .maybeSingle();

  const row = (data as BrokerProfilePublicRow | null) ?? null;
  if (!row || row.is_public !== true || !row.user_id) {
    return null;
  }
  return row;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const ip = getClientIp(req) ?? "anonymous";
    const allowed = await checkRateLimit(ip, "public_broker_profile", 60, 60_000);
    if (!allowed) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          },
        },
        { status: 429 },
      );
    }

    const { slug } = await params;
    let decoded = "";
    try {
      decoded = decodeURIComponent(String(slug ?? "")).trim();
    } catch {
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "유효하지 않은 슬러그입니다." },
        },
        { status: 400 },
      );
    }

    if (
      !decoded ||
      decoded.length > 80 ||
      !SAFE_BROKER_SLUG_RE.test(decoded)
    ) {
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "유효하지 않은 슬러그입니다." },
        },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // 1) exact broker_profiles.slug (is_public = true)
    let brokerProfile = await findOptedInBrokerProfile(supabase, "slug", decoded);

    // 2) exact broker_profiles.user_id when UUID (is_public = true)
    if (!brokerProfile && UUID_REGEX.test(decoded)) {
      brokerProfile = await findOptedInBrokerProfile(
        supabase,
        "user_id",
        decoded.toLowerCase(),
      );
    }

    // 3) exact display_name match (NO substring .includes() scan; requires unique match + is_public = true)
    if (!brokerProfile) {
      const candidates = Array.from(
        new Set(
          [decoded, decoded.replace(/-/g, " ").replace(/\s+/g, " ").trim()].filter(
            Boolean,
          ),
        ),
      );
      const matchedIds = new Set<string>();
      for (const candidate of candidates) {
        const { data: nameMatches } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "broker")
          .ilike("display_name", escapeIlike(candidate))
          .limit(2);
        for (const row of (nameMatches as Array<{ id?: string }> | null) ?? []) {
          if (row?.id) matchedIds.add(row.id);
        }
      }
      if (matchedIds.size === 1) {
        brokerProfile = await findOptedInBrokerProfile(
          supabase,
          "user_id",
          [...matchedIds][0],
        );
      }
    }

    if (!brokerProfile || brokerProfile.is_public !== true) {
      return Response.json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "브로커를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    const userId = brokerProfile.user_id;
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, role, display_name, company, created_at")
      .eq("id", userId)
      .limit(1)
      .maybeSingle();

    const profile = profileRow as {
      id: string;
      role?: string | null;
      display_name?: string | null;
      company?: string | null;
      created_at?: string | null;
    } | null;

    if (
      !profile ||
      (profile.role !== "broker" && profile.role !== "admin")
    ) {
      return Response.json(
        {
          ok: false,
          error: { code: "NOT_FOUND", message: "브로커를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    const stats = await aggregateBrokerStats(userId);

    return Response.json({
      ok: true,
      data: {
        profile: {
          id: profile.id,
          displayName: profile.display_name ?? null,
          company: profile.company ?? null,
          createdAt: profile.created_at ?? null,
          broker: {
            slug: brokerProfile.slug ?? null,
            specialtyRegions: brokerProfile.specialty_regions ?? [],
            specialtyAssets: brokerProfile.specialty_assets ?? [],
            bio: brokerProfile.bio ?? null,
            isVerified: brokerProfile.is_verified === true,
          },
        },
        stats,
        recentDeals: stats.recentDeals,
      },
    });
  } catch (error) {
    log.error("Public Broker Profile Route Error:", error);
    return Response.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "프로필 정보를 불러오는 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
