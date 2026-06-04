/**
 * GET /api/og/vibe-card/[slug]
 *
 * Dynamic Open Graph image for Vibe AI business cards.
 * Renders a 1200×630 PNG with vibe-themed design.
 */
import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { VTI_PROTOTYPES } from "@/lib/vibe/vibe-vector";
import { getTemplateById } from "@/lib/vibe/vibe-templates";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Defaults
  let brokerName = slug.replace(/-/g, " ");
  let company = "";
  let specialtyRegions: string[] = [];
  let dealCount = 0;
  let vtiType = "";
  let vtiEmoji = "";
  let vtiLabel = "";
  let vtiColor = "#8b5cf6";
  let bgGradient = "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)";
  let ringColor = "#8b5cf6";
  let textColor = "#f1f5f9";
  let subtextColor = "#94a3b8";
  let accentColor = "#8b5cf6";
  let photoUrl = "";

  try {
    const supabase = createServiceClient();

    // Resolve slug → profile
    const nameFromSlug = slug.replace(/-/g, " ");
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, company, photo_url")
      .or(`id.eq.${slug},display_name.ilike.${nameFromSlug}`)
      .eq("role", "broker")
      .limit(1)
      .single();

    if (profile) {
      brokerName = profile.display_name ?? slug;
      company = profile.company ?? "";
      photoUrl = profile.photo_url ?? "";

      // Fetch broker_profiles with vibe data
      const { data: bp } = await supabase
        .from("broker_profiles")
        .select("specialty_regions, vibe_vti, vibe_template_id")
        .eq("user_id", profile.id)
        .single();

      if (bp) {
        specialtyRegions = (bp.specialty_regions as string[]) ?? [];

        if (bp.vibe_vti) {
          vtiType = bp.vibe_vti;
          const proto = VTI_PROTOTYPES.find((p) => p.meta.type === bp.vibe_vti);
          if (proto) {
            vtiEmoji = proto.meta.emoji;
            vtiLabel = proto.meta.label_en;
            vtiColor = proto.meta.color;
          }
        }

        if (bp.vibe_template_id) {
          const tmpl = getTemplateById(bp.vibe_template_id);
          if (tmpl) {
            bgGradient = tmpl.css.bgGradient;
            ringColor = tmpl.css.ringColor;
            textColor = tmpl.css.textColor;
            subtextColor = tmpl.css.subtextColor;
            accentColor = tmpl.css.accentColor;
          }
        }
      }

      // Count deals
      const { count } = await supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("broker_id", profile.id);
      dealCount = count ?? 0;
    }
  } catch {
    // Fall back to defaults
  }

  const regionsText =
    specialtyRegions.length > 0 ? specialtyRegions.join(" · ") : "서울 전역";
  const initial = brokerName.charAt(0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: bgGradient,
          fontFamily: "sans-serif",
          padding: "0",
        }}
      >
        {/* Left panel — avatar with VTI ring */}
        <div
          style={{
            width: "420px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {/* Ring */}
          <div
            style={{
              width: "260px",
              height: "260px",
              borderRadius: "50%",
              background: `conic-gradient(${ringColor}, ${accentColor}, ${ringColor})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 48px ${ringColor}40`,
            }}
          >
            {/* Inner circle */}
            <div
              style={{
                width: "236px",
                height: "236px",
                borderRadius: "50%",
                background: photoUrl
                  ? `url(${photoUrl})`
                  : `linear-gradient(135deg, ${ringColor}30, ${accentColor}30)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: photoUrl ? "0" : "96px",
                fontWeight: 700,
                color: textColor,
              }}
            >
              {!photoUrl && initial}
            </div>
          </div>
        </div>

        {/* Right panel — info */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 60px 60px 20px",
            gap: "20px",
          }}
        >
          {/* VTI badge */}
          {vtiType && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  background: `${vtiColor}20`,
                  border: `1px solid ${vtiColor}60`,
                  borderRadius: "20px",
                  padding: "6px 16px",
                  fontSize: 18,
                  color: vtiColor,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {vtiEmoji} {vtiLabel}
              </div>
            </div>
          )}

          {/* Name */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: textColor,
              display: "flex",
              lineHeight: 1.1,
            }}
          >
            {brokerName}
          </div>

          {/* Company */}
          {company && (
            <div
              style={{
                fontSize: 22,
                color: subtextColor,
                display: "flex",
              }}
            >
              {company}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "flex", gap: "36px", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                style={{
                  fontSize: 14,
                  color: subtextColor,
                  display: "flex",
                  opacity: 0.7,
                }}
              >
                등록 딜
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: accentColor,
                  display: "flex",
                }}
              >
                {dealCount}건
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                style={{
                  fontSize: 14,
                  color: subtextColor,
                  display: "flex",
                  opacity: 0.7,
                }}
              >
                전문 권역
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: textColor,
                  display: "flex",
                }}
              >
                {regionsText}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom branding bar */}
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            right: "0",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 60px",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              background: `linear-gradient(90deg, ${accentColor}, ${ringColor})`,
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            DealCard
          </div>
          <div
            style={{
              fontSize: 14,
              color: subtextColor,
              display: "flex",
              opacity: 0.6,
            }}
          >
            Vibe AI Business Card · dealcard.kr
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
