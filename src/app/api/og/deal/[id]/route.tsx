/**
 * GET /api/og/deal/[id]
 *
 * Dynamic Open Graph image for deal cards.
 * Renders a 1200×630 PNG with building info + key metrics + DealCard branding.
 *
 * Enhanced (C3): includes Cap Rate, WALE, asset type, data quality badge
 * sourced from the latest mobile_im document.
 */
import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Region slug → Korean display name */
const REGION_LABELS: Record<string, string> = {
  gbd: "강남 GBD",
  ybd: "여의도 YBD",
  cbd: "광화문 CBD",
  seongsu: "성수",
  pangyo: "판교",
  mapo: "마포",
  jongno: "종로",
  hongdae: "홍대",
};

/** Data quality tier → display info */
function qualityBadge(tier?: string): { label: string; bg: string; fg: string } {
  switch (tier) {
    case "verified":
      return { label: "✅ 검증 완료", bg: "rgba(16, 185, 129, 0.25)", fg: "#6ee7b7" };
    case "partial":
      return { label: "🔶 부분 검증", bg: "rgba(245, 158, 11, 0.25)", fg: "#fbbf24" };
    case "reference":
      return { label: "📋 참고용", bg: "rgba(59, 130, 246, 0.25)", fg: "#93c5fd" };
    default:
      return { label: "📝 초안", bg: "rgba(163, 163, 163, 0.2)", fg: "#a3a3a3" };
  }
}

let fontBuffer: ArrayBuffer | null = null;

async function getFontData() {
  if (!fontBuffer) {
    const res = await fetch("https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA4.woff");
    if (!res.ok) throw new Error("Failed to fetch font data");
    fontBuffer = await res.arrayBuffer();
  }
  return fontBuffer;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "deal";

  // Fetch building data + latest IM doc
  let building: Record<string, string | null> | null = null;
  let teaser: Record<string, any> | null = null;
  let imBody: Record<string, any> | null = null;
  try {
    const supabase = createServiceClient();

    // Fetch building info
    const { data: bData } = await supabase
      .from("building_ssot_lite")
      .select("id, area_signal, asset_type, price_band")
      .eq("id", id)
      .single();
    building = bData;

    // Fetch teaser document
    const { data: tData } = await supabase
      .from("document_objects")
      .select("body")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tData?.body && typeof tData.body === "object") {
      teaser = tData.body;
    }

    // Fetch latest mobile_im document for rich metrics
    const { data: imDoc } = await supabase
      .from("document_objects")
      .select("body")
      .eq("building_id", id)
      .eq("document_type", "mobile_im")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (imDoc?.body && typeof imDoc.body === "object") {
      imBody = imDoc.body;
    }
  } catch {
    // Fall back to generic image
  }

  const region = building?.area_signal ?? "서울";
  const regionLabel = REGION_LABELS[region.toLowerCase()] ?? region;
  const priceBand = building?.price_band ?? "";
  const assetType = building?.asset_type ?? "";

  // Prioritize custom ogTitle/ogDescription from teaser or imBody
  const customOgTitle = imBody?.ogTitle || teaser?.ogTitle;
  const customOgDescription = imBody?.ogDescription || teaser?.ogDescription;

  // Use teaser title or fallback to assetType, strip '투자설명서' suffix for cleaner display
  const rawTitle = customOgTitle || teaser?.title || assetType || "상업용 부동산";
  const displayTitle = rawTitle.replace(/\s*투자설명서$/, '');

  // Use teaser summary or a default
  const displaySubtitle = customOgDescription || teaser?.shortSummary || `${regionLabel} · ${priceBand || "가격 비공개"} · 투자 검토 가능`;

  // Extract metrics from IM document (heroCard or ssot_summary)
  const heroCard = imBody?.heroCard as Record<string, any> | undefined;
  const ssotSummary = (imBody?.ssot_summary ?? {}) as Record<string, any>;
  const capRate = heroCard?.capRateBase ?? null;
  const readinessScore = imBody?.readiness_score ?? ssotSummary?.readiness_score ?? 0;

  // Data quality badge
  const dqTier = (imBody?.data_quality_badge?.tier ?? ssotSummary?.data_quality_tier ?? "draft") as string;
  const badge = qualityBadge(dqTier);

  // Metric pills for the bottom section
  const metricPills: { label: string; value: string }[] = [];
  if (assetType) metricPills.push({ label: "유형", value: assetType });
  if (capRate !== null) metricPills.push({ label: "Cap Rate", value: `${capRate}%` });
  if (heroCard?.noiBaseBil) metricPills.push({ label: "NOI", value: `${heroCard.noiBaseBil}억` });

  let fontData: ArrayBuffer | null = null;
  try {
    fontData = await getFontData();
  } catch (err) {
    console.error("Font loading failed:", err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 44px",
          background: "linear-gradient(135deg, #0b0f19 0%, #1a1f33 50%, #0f1729 100%)",
          color: "white",
          fontFamily: fontData ? "NotoSansKR" : "sans-serif",
        }}
      >
        {/* Top: badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: "6px",
              padding: "5px 12px",
              fontSize: 15,
              color: "#93c5fd",
              display: "flex",
            }}
          >
            📍 {regionLabel}
          </div>
          {priceBand && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.2)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: 15,
                color: "#6ee7b7",
                display: "flex",
              }}
            >
              💰 {priceBand}
            </div>
          )}
          {/* Data quality badge */}
          <div
            style={{
              background: badge.bg,
              border: `1px solid ${badge.fg}40`,
              borderRadius: "6px",
              padding: "5px 12px",
              fontSize: 14,
              color: badge.fg,
              display: "flex",
              marginLeft: "auto",
            }}
          >
            {badge.label}
          </div>
        </div>

        {/* Center: main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{
            fontSize: displayTitle.length > 25 ? 28 : displayTitle.length > 20 ? 32 : displayTitle.length > 12 ? 38 : 44,
            fontWeight: 700,
            lineHeight: 1.35,
            display: "flex",
            flexWrap: "wrap" as const,
            maxWidth: "100%",
          }}>
            {displayTitle}
          </div>
          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: "rgba(147, 197, 253, 0.9)",
            display: "flex",
            marginTop: "4px",
          }}>
            {type === "im" ? "프리미엄 투자설명서" : "프리미엄 딜카드"}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              lineHeight: 1.4,
            }}
          >
            {displaySubtitle}
          </div>

          {/* Metric pills row */}
          {metricPills.length > 0 && (
            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
              {metricPills.map((pill) => (
                <div
                  key={pill.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "8px 14px",
                  }}
                >
                  <span style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.5)", display: "flex" }}>
                    {pill.label}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#e0e7ff", display: "flex" }}>
                    {pill.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: branding + readiness */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            {type === "im" ? "Mobile IM" : "DealCard"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {readinessScore > 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: readinessScore >= 80 ? "#6ee7b7" : readinessScore >= 50 ? "#fbbf24" : "#a3a3a3",
                  display: "flex",
                }}
              >
                완성도 {readinessScore}%
              </div>
            )}
            <div
              style={{
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.4)",
                display: "flex",
              }}
            >
              credeal.net
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontData
        ? [
            {
              name: "NotoSansKR",
              data: fontData,
              weight: 700,
              style: "normal",
            },
          ]
        : undefined,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

