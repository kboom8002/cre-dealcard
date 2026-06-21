/**
 * GET /api/og/deal/[id]
 *
 * Dynamic Open Graph image for deal cards.
 * Renders a 1200×630 PNG with building info + DealCard branding.
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Fetch building data
  let building: Record<string, string | null> | null = null;
  let teaser: Record<string, any> | null = null;
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
  } catch {
    // Fall back to generic image
  }

  const region = building?.area_signal ?? "서울";
  const regionLabel = REGION_LABELS[region.toLowerCase()] ?? region;
  const priceBand = building?.price_band ?? "";
  
  // Use teaser title or fallback to assetType
  const displayTitle = teaser?.title || building?.asset_type || "상업용 부동산";
  
  // Use teaser summary or a default
  const displaySubtitle = teaser?.shortSummary 
    ? teaser.shortSummary 
    : `${regionLabel} · ${priceBand || "가격 비공개"} · 투자 검토 가능`;

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
          background: "linear-gradient(135deg, #0b0f19 0%, #1a1f33 50%, #0f1729 100%)",
          color: "white",
          fontFamily: "sans-serif",
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
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: 20,
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
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: 20,
                color: "#6ee7b7",
                display: "flex",
              }}
            >
              💰 {priceBand}
            </div>
          )}
        </div>

        {/* Center: main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ 
            fontSize: displayTitle.length > 30 ? 42 : 52, 
            fontWeight: 700, 
            lineHeight: 1.3, 
            display: "flex" 
          }}>
            {displayTitle}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              lineHeight: 1.4,
            }}
          >
            {displaySubtitle}
          </div>
          <div
            style={{
              fontSize: 22,
              color: "rgba(255, 255, 255, 0.5)",
              display: "flex",
              marginTop: "8px",
            }}
          >
            💡 상세 자료는 중개사에게 요청하세요
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
              fontSize: 32,
              fontWeight: 700,
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            DealCard
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255, 255, 255, 0.4)",
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
    },
  );
}
