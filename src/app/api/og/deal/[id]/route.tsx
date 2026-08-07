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
import { readWithMigration } from "@/lib/ssot-adapter";

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "deal";

  // Fetch building data + latest IM doc
  let building: Record<string, any> | null = null;
  let teaser: Record<string, any> | null = null;
  let imBody: Record<string, any> | null = null;

  try {
    const supabase = createServiceClient();

    // Fetch building info with migration fallback
    const { data: bData } = await readWithMigration(id);
    building = bData as Record<string, any>;

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
      teaser = tData.body as Record<string, any>;
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
      imBody = imDoc.body as Record<string, any>;
    }
  } catch {
    // Fall back to generic image
  }

  const region = building?.area_signal ?? "서울";
  const regionLabel = REGION_LABELS[region.toLowerCase()] ?? region;
  const priceBand = building?.price_band ?? "";
  const assetType = building?.asset_type ?? "상업용 부동산";
  const fitSummary = building?.fit_summary ?? "";

  // Prioritize custom ogTitle/ogDescription from teaser or imBody
  const customOgTitle = imBody?.ogTitle || teaser?.ogTitle;
  const customOgDescription = imBody?.ogDescription || teaser?.ogDescription;

  // Use teaser title or fallback to assetType, clean up awkward analysis patterns
  const rawTitle = customOgTitle || teaser?.title || `${regionLabel} ${assetType} 매물`;
  const displayTitle = rawTitle
    .replace(/\s*투자설명서$/, '')
    .replace(/\s*또는\s+[^\s]+\s*(계열로|계열)\s*(추정|)/g, '')
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, '')
    .trim();

  // Use teaser summary or a default
  const displaySubtitle = customOgDescription || teaser?.shortSummary || fitSummary || `${regionLabel} 권역 블라인드 투자 검토 매물`;
  
  // Hook copy & structure chips
  const hookCopy = imBody?.hookCopy || teaser?.hookCopy || "";
  const rawChips = imBody?.structureChips || teaser?.structureChips || [];
  const chips: string[] = Array.isArray(rawChips) ? rawChips.slice(0, 3) : [];

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
          padding: "44px 52px",
          background: "linear-gradient(135deg, #070A0F 0%, #111827 60%, #0F172A 100%)",
          color: "white",
          fontFamily: fontData ? "NotoSansKR" : "sans-serif",
          position: "relative",
        }}
      >
        {/* Top Gold Accent Bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "linear-gradient(90deg, #D4A853 0%, #F3EBDA 50%, #B98A2E 100%)",
          }}
        />

        {/* Top Header Row: Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              background: "rgba(185, 138, 46, 0.2)",
              border: "1px solid rgba(212, 168, 83, 0.5)",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: 16,
              fontWeight: 700,
              color: "#F3EBDA",
              display: "flex",
            }}
          >
            {`📍 ${regionLabel}`}
          </div>
          {assetType ? (
            <div
              style={{
                background: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: 16,
                fontWeight: 600,
                color: "#93c5fd",
                display: "flex",
              }}
            >
              {`🏢 ${assetType}`}
            </div>
          ) : null}
          {priceBand ? (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: 16,
                fontWeight: 700,
                color: "#6ee7b7",
                display: "flex",
              }}
            >
              {`💰 ${priceBand}`}
            </div>
          ) : null}
        </div>

        {/* Center Main Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Main Title */}
          <div style={{
            fontSize: displayTitle.length > 25 ? 30 : displayTitle.length > 18 ? 36 : 42,
            fontWeight: 700,
            lineHeight: 1.3,
            color: "#FFFFFF",
            display: "flex",
            maxWidth: "1100px",
          }}>
            {displayTitle}
          </div>

          {/* Hook Copy (Gold Banner) */}
          {hookCopy ? (
            <div style={{
              background: "rgba(212, 168, 83, 0.12)",
              borderLeft: "4px solid #D4A853",
              borderRadius: "0 8px 8px 0",
              padding: "8px 16px",
              fontSize: 22,
              fontWeight: 700,
              color: "#F8F1E1",
              display: "flex",
              width: "fit-content",
            }}>
              {`🎯 "${hookCopy}"`}
            </div>
          ) : null}

          {/* Subtitle / Fit summary */}
          <div
            style={{
              fontSize: 19,
              color: "#A0AEC0",
              display: "flex",
              lineHeight: 1.45,
              maxWidth: "1050px",
            }}
          >
            {displaySubtitle}
          </div>

          {/* Chips & Metric Pills Row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            {chips.map((chip, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  borderRadius: "20px",
                  padding: "4px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#E2E8F0",
                  display: "flex",
                }}
              >
                {`# ${chip}`}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Branding Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            paddingTop: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", display: "flex" }}>CRE</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#D4A853", display: "flex" }}>DEAL</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#718096", marginLeft: "8px", display: "flex" }}>
              {type === "im" ? "· Mobile Investment Memorandum" : "· Premium Blind DealCard"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#718096", display: "flex" }}>
              credeal.net
            </span>
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
    }
  );
}

