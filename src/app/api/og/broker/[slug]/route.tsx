/**
 * GET /api/og/broker/[slug]
 *
 * Dynamic Open Graph image for broker profile pages.
 * Renders a 1200×630 PNG with broker info + CREDEAL · 크리딜 branding.
 */
import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { loadOgFonts } from "@/lib/magazine/og-fonts";
import { PUBLIC_WORKSPACE_ITEM_STATUSES } from "@/domain/public-projection/visibility";

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Try to resolve the slug → broker profile
  let resolvedProfile = false;
  let brokerName = slug;
  let specialtyRegions: string[] = [];
  let dealCount = 0;

  try {
    const supabase = createServiceClient();

    // Resolve slug → profile
    let profileId: string | null = null;
    const decodedSlug = decodeURIComponent(slug);
    const nameFromSlug = decodedSlug.replace(/-/g, " ");

    const { data: bpBySlug } = await supabase
      .from("broker_profiles")
      .select("user_id")
      .eq("slug", decodedSlug)
      .limit(1)
      .maybeSingle();

    if (bpBySlug) {
      profileId = bpBySlug.user_id;
    }

    let query = supabase
      .from("profiles")
      .select("id, display_name, company")
      .eq("role", "broker");

    if (profileId) {
      query = query.eq("id", profileId);
    } else {
      const safeSlug = slug.replace(/[,()"\\]/g, '');
      const safeName = nameFromSlug.replace(/[,()"\\]/g, '');
      query = query.or(`id.eq.${safeSlug},display_name.ilike.${safeName}`);
    }

    const { data: profile } = await query.limit(1).single();

    if (profile) {
      resolvedProfile = true;
      brokerName = profile.display_name ?? slug;

      // Fetch broker_profiles for specialty regions
      const { data: bp } = await supabase
        .from("broker_profiles")
        .select("specialty_regions")
        .eq("user_id", profile.id)
        .single();

      if (bp?.specialty_regions) {
        specialtyRegions = bp.specialty_regions as string[];
      }

      // Count strictly public deals (public_signal_ready + public workspace dealcards, deduplicated)
      const { count: ssotCount } = await supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profile.id)
        .eq("status", "public_signal_ready");

      let extraWsCount = 0;
      try {
        const { data: wsRows } = await supabase
          .from("workspace_items")
          .select("id, building_id, legacy_id, deleted_at, revoked_at")
          .eq("owner_id", profile.id)
          .eq("kind", "dealcard")
          .in("status", [...PUBLIC_WORKSPACE_ITEM_STATUSES])
          .limit(200);
        if (Array.isArray(wsRows) && wsRows.length > 0) {
          const activeWs = wsRows.filter((r) => !r.deleted_at && !r.revoked_at);
          if (activeWs.length > 0) {
            const { data: ssotIdRows } = await supabase
              .from("building_ssot_lite")
              .select("id")
              .eq("owner_id", profile.id)
              .eq("status", "public_signal_ready")
              .limit(200);
            const knownSsotIds = new Set(
              Array.isArray(ssotIdRows) ? ssotIdRows.map((r) => String(r.id)) : [],
            );
            const seenExtra = new Set<string>();
            for (const w of activeWs) {
              const targetId = String(w.building_id || w.legacy_id || w.id);
              if (targetId && !knownSsotIds.has(targetId)) {
                seenExtra.add(targetId);
              }
            }
            extraWsCount = seenExtra.size;
          }
        }
      } catch {
        // non-blocking for test mocks without workspace_items
      }

      dealCount = (ssotCount ?? 0) + extraWsCount;
    }
  } catch {
    resolvedProfile = false;
  }

  if (!resolvedProfile) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const rawRegionsText =
    specialtyRegions.length > 0
      ? specialtyRegions.join(" · ")
      : "서울 전역";

  const fontData = await loadOgFonts();
  const fonts = fontData.fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: f.style,
  }));
  const headers = {
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  };

  const safeText = (text: string, fallback: string) => {
    if (!fontData.glyphs) return text || fallback;
    let out = "";
    for (const ch of text) {
      if (/\s/.test(ch) || fontData.glyphs.has(ch.codePointAt(0)!)) out += ch;
    }
    return out.replace(/\s+/g, " ").trim() || fallback;
  };

  const safeBrokerName = safeText(brokerName, "CRE Broker");
  const regionsText = safeText(rawRegionsText, "Seoul");
  const avatarInitial = safeBrokerName.charAt(0) || "C";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background:
            "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)",
          color: "white",
          fontFamily: '"Noto Sans KR", sans-serif',
        }}
      >
        {/* Top: badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              background: "rgba(139, 92, 246, 0.2)",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              borderRadius: "10px",
              padding: "10px 24px",
              fontSize: 36,
              fontWeight: 700,
              color: "#c4b5fd",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#a78bfa",
                display: "flex",
              }}
            />
            <span>CRE 전문 중개사</span>
          </div>
        </div>

        {/* Center: broker info */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Avatar circle + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
            <div
              style={{
                width: "92px",
                height: "92px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 42,
                fontWeight: 700,
              }}
            >
              {avatarInitial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: 60, fontWeight: 700, display: "flex" }}>
                {safeBrokerName}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "48px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  fontSize: 36,
                  color: "rgba(255,255,255,0.65)",
                  display: "flex",
                }}
              >
                전문 권역
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#93c5fd", display: "flex" }}>
                {regionsText}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  fontSize: 36,
                  color: "rgba(255,255,255,0.65)",
                  display: "flex",
                }}
              >
                등록 딜
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#6ee7b7", display: "flex" }}>
                {`${dealCount}건`}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: branding */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
            }}
          >
            CREDEAL · 크리딜
          </div>
          <div
            style={{
              fontSize: 36,
              color: "rgba(255, 255, 255, 0.55)",
              display: "flex",
            }}
          >
            credeal.net
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers,
    },
  );
}
