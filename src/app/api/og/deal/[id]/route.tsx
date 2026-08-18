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
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
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

  // Hook copy & title priority
  const rawTitle = teaser?.ogTitle || teaser?.title || "";
  const rawHookCopy = teaser?.hookCopy || imBody?.hookCopy || teaserView.hookCopy || `${regionLabel} ${assetType} 매물`;
  const mainHeadline = rawTitle || rawHookCopy;
  const subHeadline = rawTitle && rawHookCopy && rawTitle !== rawHookCopy 
    ? rawHookCopy 
    : (teaser?.ogDescription || teaser?.shortSummary || `${regionLabel} ${assetType} 핵심 투자 기회`);

  const displayMain = mainHeadline.length > 40 ? mainHeadline.slice(0, 40) + "..." : mainHeadline;
  const displaySub = subHeadline.length > 45 ? subHeadline.slice(0, 45) + "..." : subHeadline;

  // Hero tiles filtering: valid tiles only (max 2)
  const validTiles = filterValidTiles(teaserView.postureHeroTiles || []);
  const displayTiles = validTiles.length > 0 ? validTiles.slice(0, 2) : [
    { emoji: "💰", label: "매각가", value: teaserView.bandedPrice || building?.price_band || "가격 협의" },
    { emoji: "📍", label: "권역", value: regionLabel }
  ];

  let fontData: ArrayBuffer | null = null;
  try {
    fontData = await getFontData();
  } catch (err) {
    console.error("Font loading failed:", err);
  }

  // Adjust font size based on text length to prevent overflow
  const headlineFontSize = displayMain.length > 28 ? 34 : displayMain.length > 18 ? 38 : 42;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 72px",
          background: "linear-gradient(135deg, #070A0F 0%, #111827 55%, #0B132B 100%)",
          color: "white",
          fontFamily: fontData ? "Pretendard" : "sans-serif",
          position: "relative",
          boxSizing: "border-box",
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
            height: "6px",
            background: "linear-gradient(90deg, #D4A853 0%, #F3EBDA 50%, #B98A2E 100%)",
          }}
        />

        {/* Subtle Ambient Glow */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(212, 168, 83, 0.15) 0%, transparent 70%)",
            borderRadius: "50%",
            display: "flex",
          }}
        />

        {/* Top Header Row: Badges with Safe Margin */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "4px",
          }}
        >
          <div
            style={{
              background: "rgba(185, 138, 46, 0.25)",
              border: "1px solid rgba(212, 168, 83, 0.6)",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: 22,
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
              padding: "6px 14px",
              fontSize: 22,
              fontWeight: 700,
              color: "#93c5fd",
              display: "flex",
            }}
          >
            {`📍 ${regionLabel}`}
          </div>
          {assetType ? (
            <div
              style={{
                background: "rgba(148, 163, 184, 0.15)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: 22,
                fontWeight: 700,
                color: "#cbd5e1",
                display: "flex",
              }}
            >
              {assetType}
            </div>
          ) : null}
          {urgencyTag === 'urgent' ? (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.25)",
                border: "1px solid rgba(239, 68, 68, 0.7)",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: 22,
                fontWeight: 800,
                color: "#FCA5A5",
                display: "flex",
              }}
            >
              🔥 급매
            </div>
          ) : null}
        </div>

        {/* Center Main Section: 2-Line Resilient Typography */}
        <div 
          style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "10px", 
            margin: "8px 0",
            maxWidth: "1050px",
          }}
        >
          <div
            style={{
              fontSize: headlineFontSize,
              fontWeight: 900,
              lineHeight: 1.35,
              color: "#FFFFFF",
              display: "flex",
              letterSpacing: "-0.02em",
              wordBreak: "keep-all",
              overflow: "hidden",
            }}
          >
            {displayMain}
          </div>
          {displaySub ? (
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: "#94A3B8",
                display: "flex",
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displaySub}
            </div>
          ) : null}
        </div>

        {/* Bottom Section: 1x2 Key Metrics Tiles + Branding */}
        <div 
          style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "flex-end",
            paddingBottom: "4px",
          }}
        >
          <div style={{ display: "flex", gap: "24px" }}>
            {displayTiles.map((tile: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  minWidth: "220px",
                }}
              >
                <span style={{ fontSize: 17, color: "#9AA7B5", fontWeight: 600 }}>
                  {tile.emoji} {tile.label}
                </span>
                <span style={{ fontSize: 28, fontWeight: 900, color: i === 0 ? "#5EEAD4" : "#FFFFFF" }}>
                  {tile.value}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom Branding */}
          <div 
            style={{ 
              fontSize: 20, 
              fontWeight: 700, 
              color: "#94A3B8", 
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>CREDEAL</span>
            <span style={{ color: "#475569" }}>·</span>
            <span style={{ color: "#CBD5E1" }}>블라인드 딜카드</span>
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
              name: "Pretendard",
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


