/**
 * GET /api/og/vibe-card/[slug]
 *
 * Dynamic Open Graph image for Vibe AI business cards.
 * Renders a 1200×630 PNG with vibe-themed design.
 */
import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { VTI_PROTOTYPES, type Vibe7D } from "@/lib/vibe/vibe-vector";
import { getTemplateById, ALL_VIBE_TEMPLATES } from "@/lib/vibe/vibe-templates";
import { matchTemplates } from "@/lib/vibe/vibe-complement";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Defaults
  let brokerName = slug.replace(/-/g, " ");
  let company = "";
  let cardTitle = "공인중개사";
  let specialtyRegions: string[] = [];
  let dealCount = 0;
  let vtiType = "";
  let vtiEmoji = "";
  let vtiLabel = "";
  let vtiColor = "#8b5cf6";
  let bgGradient = "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)";
  let bgImageUrl = "";
  let ringColor = "#8b5cf6";
  let textColor = "#f1f5f9";
  let subtextColor = "#94a3b8";
  let accentColor = "#8b5cf6";
  let photoUrl = "";
  let trust = 0.8;
  let valence = 0.75;
  let isVerified = false;

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
      .select("id, display_name, company, photo_url")
      .eq("role", "broker");

    if (profileId) {
      query = query.eq("id", profileId);
    } else {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
      if (isUuid) {
        query = query.eq("id", slug);
      } else {
        query = query.ilike("display_name", nameFromSlug);
      }
    }

    const { data: profile } = await query.limit(1).maybeSingle();

    if (profile) {
      brokerName = profile.display_name ?? slug;
      company = profile.company ?? "";
      photoUrl = profile.photo_url ?? "";

      // Fetch broker_profiles with vibe data
      const { data: bp } = await supabase
        .from("broker_profiles")
        .select("specialty_regions, vibe_vti, vibe_template_id, vibe_valence, vibe_trust, is_verified, vibe_vector, vibe_complement, card_title, card_name")
        .eq("user_id", profile.id)
        .single();

      if (bp) {
        if (bp.card_title) cardTitle = bp.card_title as string;
        if (bp.card_name) brokerName = bp.card_name as string;
        specialtyRegions = (bp.specialty_regions as string[]) ?? [];
        isVerified = !!bp.is_verified;
        trust = bp.vibe_trust ?? 0.8;
        valence = bp.vibe_valence ?? 0.75;

        if (bp.vibe_vti) {
          vtiType = bp.vibe_vti;
          const proto = VTI_PROTOTYPES.find((p) => p.meta.type === bp.vibe_vti);
          if (proto) {
            vtiEmoji = proto.meta.emoji;
            vtiLabel = proto.meta.label_ko; // Use Korean VTI label
            vtiColor = proto.meta.color;
          }
        }

        let tmpl = bp.vibe_template_id ? getTemplateById(bp.vibe_template_id) : null;

        if (!tmpl && bp.vibe_vector && bp.vibe_complement) {
          const photoVibe = bp.vibe_vector as Vibe7D;
          const complementVibe = bp.vibe_complement as Vibe7D;
          const matches = matchTemplates(photoVibe, complementVibe, ALL_VIBE_TEMPLATES, 1);
          if (matches[0]) {
            tmpl = matches[0].template;
          }
        }

        if (tmpl) {
          bgGradient = tmpl.css.bgGradient;
          bgImageUrl = tmpl.css.bgImageUrl || "";
          ringColor = tmpl.css.ringColor;
          textColor = tmpl.css.textColor;
          subtextColor = tmpl.css.subtextColor;
          accentColor = tmpl.css.accentColor;
        }
      }

      // Count deals
      const { count } = await supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profile.id);
      dealCount = count ?? 0;
    }
  } catch {
    // Fall back to defaults
  }

  const regionsText =
    specialtyRegions.length > 0 ? specialtyRegions.join(" · ") : "서울 전역";
  const initial = brokerName.charAt(0);

  const trustPct = Math.round(trust * 100);
  const valencePct = Math.round(valence * 100);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: bgGradient,
          fontFamily: "sans-serif",
          padding: "50px 60px",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        {/* Preset Background Image */}
        {bgImageUrl && (
          <img
            src={bgImageUrl}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1200px",
              height: "630px",
              opacity: 0.35,
            }}
          />
        )}

        {/* Decorative background grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.05,
            backgroundImage: `radial-gradient(circle, ${accentColor} 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Left Side: Business Card Miniature */}
        <div
          style={{
            width: "400px",
            height: "530px",
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(20px)",
            borderRadius: "32px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: `0 30px 60px -15px rgba(0,0,0,0.5), 0 0 50px -10px ${accentColor}30`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "36px 30px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Card Shine Effect */}
          <div
            style={{
              position: "absolute",
              top: "-50%",
              left: "-50%",
              width: "200%",
              height: "200%",
              background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
              pointerEvents: "none",
            }}
          />

          {/* Card Top: Photo + Badge */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            {/* Ring */}
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                background: `conic-gradient(${ringColor}, ${accentColor}, ${ringColor})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 24px ${ringColor}30`,
              }}
            >
              <div
                style={{
                  width: "108px",
                  height: "108px",
                  borderRadius: "50%",
                  background: photoUrl
                    ? `url(${photoUrl})`
                    : `linear-gradient(135deg, ${ringColor}30, ${accentColor}30)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: photoUrl ? "0" : "44px",
                  fontWeight: 700,
                  color: textColor,
                }}
              >
                {!photoUrl && initial}
              </div>
            </div>

            <div style={{ marginTop: "16px", fontSize: 24, fontWeight: 700, color: textColor }}>
              {brokerName}
            </div>
            {company && (
              <div style={{ marginTop: "4px", fontSize: 14, color: subtextColor, fontWeight: 500 }}>
                {company}
              </div>
            )}
            {vtiLabel && (
              <div
                style={{
                  marginTop: "12px",
                  background: `${vtiColor}16`,
                  border: `1px solid ${vtiColor}30`,
                  borderRadius: "20px",
                  padding: "4px 12px",
                  fontSize: 12,
                  color: vtiColor,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{vtiEmoji}</span>
                <span>{vtiLabel}</span>
              </div>
            )}
          </div>

          {/* Card Bottom: Scores */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            {/* Trust Score */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: subtextColor }}>
                <span>신뢰 지수</span>
                <span style={{ color: ringColor, fontWeight: 700 }}>{trustPct}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${trustPct}%`, height: "100%", background: ringColor, borderRadius: "3px" }} />
              </div>
            </div>

            {/* Valence Score */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: subtextColor }}>
                <span>호감 지수</span>
                <span style={{ color: accentColor, fontWeight: 700 }}>{valencePct}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${valencePct}%`, height: "100%", background: accentColor, borderRadius: "3px" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Information Panels */}
        <div
          style={{
            width: "620px",
            height: "530px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: "30px",
            gap: "28px",
          }}
        >
          {/* Tag / Badge */}
          <div style={{ display: "flex", gap: "8px" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "30px",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: accentColor,
                display: "flex",
              }}
            >
              ✨ DealCard AI Vibe
            </div>
            {isVerified && (
              <div
                style={{
                  background: `${accentColor}12`,
                  border: `1px solid ${accentColor}25`,
                  borderRadius: "30px",
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: accentColor,
                  display: "flex",
                }}
              >
                ✓ 인증 공인중개사
              </div>
            )}
          </div>

          {/* Headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: 50, fontWeight: 800, color: textColor, lineHeight: 1.25 }}>
              {brokerName}
            </span>
            <span style={{ fontSize: 22, fontWeight: 500, color: subtextColor }}>
              {cardTitle} · {regionsText}
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: "100%", height: "1px", background: "rgba(255,255,255,0.08)" }} />

          {/* Highlight Stats Blocks */}
          <div style={{ display: "flex", gap: "24px" }}>
            {/* Stat Item 1 */}
            <div
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "20px",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: 13, color: subtextColor, opacity: 0.6 }}>전문 분야</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: accentColor }}>{specialtyRegions[0] || "CRE"}</span>
            </div>

            {/* Stat Item 2 */}
            <div
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "20px",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: 13, color: subtextColor, opacity: 0.6 }}>주요 전문 지역</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: textColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {specialtyRegions[0] || "서울"}
              </span>
            </div>
          </div>
        </div>

        {/* Absolute branding bottom banner */}
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
            background: "rgba(0,0,0,0.25)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: textColor,
              display: "flex",
            }}
          >
            DealCard <span style={{ color: accentColor, marginLeft: "4px" }}>Vibe AI</span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: subtextColor,
              display: "flex",
              opacity: 0.6,
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
    },
  );
}
