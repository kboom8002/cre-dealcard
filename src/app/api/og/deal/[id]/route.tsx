import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration, buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";

export const runtime = "nodejs";

let fontBuffer: ArrayBuffer | null = null;

async function getFontData(): Promise<ArrayBuffer | null> {
  if (fontBuffer) return fontBuffer;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(
      "https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA4.woff",
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
    fontBuffer = await res.arrayBuffer();
    return fontBuffer;
  } catch (err) {
    console.error("[OG] Font loading failed, using fallback:", err);
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let building: Record<string, any> | null = null;
  let teaser: Record<string, any> | null = null;
  let imBody: Record<string, any> | null = null;

  try {
    const supabase = createServiceClient();
    const { data: bData } = await readWithMigration(id);
    building = bData as Record<string, any>;

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
    // Fallback
  }

  const safeBuilding = building || { id };
  const attrs = buildAttrsFromSsotLite(safeBuilding);
  const teaserView = projectToTeaser(attrs);

  const regionLabel = teaserView.region || building?.area_signal || "서울";
  const assetType = teaserView.assetType || building?.asset_type || "상업용 부동산";
  const postureLabel = teaserView.postureLabel || "임대수익형";
  const urgencyTag = teaserView.urgencyTag || (building?.urgency_tag as string);

  // Hook copy priority
  const rawHookCopy = imBody?.hookCopy || teaser?.hookCopy || teaserView.hookCopy || `${regionLabel} ${assetType} 매물`;
  const hookCopy = rawHookCopy.length > 35 ? rawHookCopy.slice(0, 35) + "..." : rawHookCopy;

  // Hero tiles filtering: valid tiles only (max 2)
  const validTiles = filterValidTiles(teaserView.postureHeroTiles || []);
  const displayTiles = validTiles.length > 0 ? validTiles.slice(0, 2) : [
    { emoji: "💰", label: "매각가", value: teaserView.bandedPrice || "가격 협의" },
    { emoji: "📍", label: "권역", value: regionLabel }
  ];

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
          padding: "36px 64px",
          background: "linear-gradient(135deg, #070A0F 0%, #111827 60%, #0F172A 100%)",
          color: "white",
          fontFamily: fontData ? "Noto Sans KR" : "sans-serif",
          position: "relative",
          maxHeight: "630px",
          overflow: "hidden",
        }}
      >
        {/* Top Gold Accent Bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "8px",
            background: "linear-gradient(90deg, #D4A853 0%, #F3EBDA 50%, #B98A2E 100%)",
          }}
        />

        {/* Top Header Row: Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              background: "rgba(185, 138, 46, 0.25)",
              border: "1px solid rgba(212, 168, 83, 0.6)",
              borderRadius: "8px",
              padding: "8px 18px",
              fontSize: 26,
              fontWeight: 800,
              color: "#F3EBDA",
              display: "flex",
            }}
          >
            {postureLabel}
          </div>
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(59, 130, 246, 0.5)",
              borderRadius: "8px",
              padding: "8px 18px",
              fontSize: 26,
              fontWeight: 700,
              color: "#93c5fd",
              display: "flex",
            }}
          >
            {`📍 ${regionLabel}`}
          </div>
          {urgencyTag === 'urgent' ? (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.25)",
                border: "1px solid rgba(239, 68, 68, 0.7)",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: 26,
                fontWeight: 800,
                color: "#FCA5A5",
                display: "flex",
              }}
            >
              🔥 급매
            </div>
          ) : null}
        </div>

        {/* Center Main Section: Enlarged Hook Copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "12px 0", maxHeight: "100px", overflow: "hidden" }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.35,
              color: "#FFFFFF",
              display: "flex",
              maxWidth: "1080px",
              letterSpacing: "-0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {hookCopy}
          </div>
        </div>

        {/* Bottom Section: 1x2 Tiles + Branding */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "48px" }}>
            {displayTiles.map((tile: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "14px",
                  padding: "16px 28px",
                  minWidth: "260px",
                }}
              >
                <span style={{ fontSize: 20, color: "#9AA7B5", fontWeight: 600 }}>
                  {tile.emoji} {tile.label}
                </span>
                <span style={{ fontSize: 32, fontWeight: 900, color: i === 0 ? "#5EEAD4" : "#FFFFFF" }}>
                  {tile.value}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom Branding */}
          <div style={{ fontSize: 22, fontWeight: 700, color: "#94A3B8", display: "flex", paddingBottom: "0px" }}>
            CREDEAL · 블라인드 딜카드
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
              name: "Noto Sans KR",
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


