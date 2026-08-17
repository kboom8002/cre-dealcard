import { ImageResponse } from "next/og";
import QRCode from "qrcode";
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
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      "https://fonts.gstatic.com/s/notosanskr/v36/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA4.woff",
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      fontBuffer = await res.arrayBuffer();
    }
  } catch (e) {
    console.warn("[OG/card] Font fetch failed, falling back to system fonts", e);
  }
  return fontBuffer;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://credeal.net";
  const landingUrl = `${siteUrl}/dc/${id}`;

  let building: Record<string, any> | null = null;
  let teaserDoc: Record<string, any> | null = null;

  try {
    const supabase = createServiceClient();
    const { data: bData } = await readWithMigration(id);
    building = bData as Record<string, any>;

    const { data: tData } = await supabase
      .from("document_objects")
      .select("*")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    teaserDoc = tData;
  } catch (e) {
    console.warn("Data fetch warning in 1-page card generator:", e);
  }

  const safeBuilding = building || { id, area_signal: "서울 주요 권역", asset_type: "상업용 빌딩", price_band: "가격 협의" };
  const attrs = buildAttrsFromSsotLite(safeBuilding);
  const teaserView = projectToTeaser(attrs);
  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;

  const hookCopy = imBody.hookCopy || teaserView.hookCopy || `${teaserView.region} 핵심 상업용 빌딩`;
  const posture = teaserView.posture || "income";
  const postureLabel = teaserView.postureLabel || "임대수익형";

  const rawTiles = teaserView.postureHeroTiles || [
    { emoji: "💰", label: "매각가", value: teaserView.bandedPrice || "가격 협의" },
    { emoji: "📍", label: "권역", value: teaserView.region },
  ];
  const heroTiles = filterValidTiles(rawTiles).slice(0, 4);

  const dealPoints = imBody.dealPoints || [
    teaserView.highlightText || "안정적 임차 구성 및 우수한 접근성"
  ];

  // Generate QR Code Data URL
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(landingUrl, {
      margin: 1,
      width: 240,
      color: { dark: "#0B0F14", light: "#FFFFFF" },
    });
  } catch (err) {
    console.warn("QR generation failed, will show URL text instead", err);
  }

  const fontData = await getFontData();
  const fontsList: any[] = fontData ? [{ name: "Noto Sans KR", data: fontData, style: "normal", weight: 700 }] : [];

  // Theme Gradients based on Investment Posture
  let bgGradient = "linear-gradient(180deg, #182232 0%, #0F1622 50%, #0B0F14 100%)";
  let accentColor = "#D4A853"; // Brass Gold

  if (posture === "development") {
    bgGradient = "linear-gradient(180deg, #0D2620 0%, #0B1915 50%, #08100E 100%)";
    accentColor = "#34D399";
  } else if (posture === "owner_occupied") {
    bgGradient = "linear-gradient(180deg, #241A35 0%, #171124 50%, #0B0F14 100%)";
    accentColor = "#C084FC";
  } else if (posture === "operating") {
    bgGradient = "linear-gradient(180deg, #2E1C18 0%, #1C1210 50%, #0B0F14 100%)";
    accentColor = "#F59E0B";
  }

  const jsx = (
      <div
        style={{
          width: "1080px",
          height: "1920px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bgGradient,
          color: "#E7ECF2",
          fontFamily: "'Noto Sans KR', sans-serif",
          padding: "72px 64px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Background Subtle Accent Glowing Orbs */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "600px",
            height: "600px",
            background: `radial-gradient(circle, ${accentColor}25 0%, transparent 70%)`,
            borderRadius: "50%",
            display: "flex",
          }}
        />

        {/* Top Header: Branding + QR Code */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "2px solid rgba(255, 255, 255, 0.12)",
            paddingBottom: "40px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span
                style={{
                  fontSize: "36px",
                  fontWeight: 900,
                  letterSpacing: "2px",
                  color: "#FFFFFF",
                }}
              >
                CREDEAL
              </span>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  background: accentColor,
                  color: "#0B0F14",
                  padding: "4px 14px",
                  borderRadius: "8px",
                }}
              >
                {postureLabel}
              </span>
            </div>
            <span style={{ fontSize: "22px", color: "#9AA7B5", fontWeight: 500 }}>
              📍 {teaserView.region} · 블라인드 부동산 티저
            </span>
          </div>

          {/* QR Code Container */}
          {qrDataUrl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#FFFFFF", padding: "16px", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
              <img src={qrDataUrl} width={150} height={150} alt="QR Code" />
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#0B0F14", marginTop: "8px" }}>스캔 시 NDA/상세 열람</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.1)", padding: "16px 24px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.2)" }}>
              <span style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF" }}>credeal.net</span>
              <span style={{ fontSize: "14px", color: "#9AA7B5", marginTop: "4px" }}>에서 상세 요청</span>
            </div>
          )}
        </div>

        {/* Main Headline / Hero Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px", marginTop: "40px" }}>
          {teaserView.urgencyTag === "urgent" && (
            <div style={{ display: "flex" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#EF4444",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  padding: "6px 20px",
                  borderRadius: "30px",
                }}
              >
                🔥 급매물 (빠른 의사결정 필요)
              </span>
            </div>
          )}

          <h1
            style={{
              fontSize: "64px",
              fontWeight: 900,
              lineHeight: 1.3,
              color: "#FFFFFF",
              margin: 0,
              letterSpacing: "-1px",
            }}
          >
            {hookCopy}
          </h1>

          <p style={{ fontSize: "28px", color: "#9AA7B5", lineHeight: 1.5, margin: 0 }}>
            매도자 요청으로 지번 및 소유자는 보호됩니다. 비밀유지약정(NDA) 체결 후 상세 자료가 공개됩니다.
          </p>
        </div>

        {/* 4-Metric Grid with Glassmorphism */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            marginTop: "40px",
          }}
        >
          {heroTiles.map((tile, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: i === 0 ? "rgba(212, 168, 83, 0.15)" : "rgba(26, 35, 51, 0.75)",
                border: i === 0 ? `2px solid ${accentColor}` : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "24px",
                padding: "36px 32px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "28px" }}>{tile.emoji}</span>
                <span style={{ fontSize: "26px", color: "#9AA7B5", fontWeight: 600 }}>{tile.label}</span>
              </div>

              <div
                style={{
                  fontSize: i === 0 ? "48px" : "44px",
                  fontWeight: 900,
                  color: i === 0 ? "#5EEAD4" : "#FFFFFF",
                }}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {/* Deal Points Bullet Box */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            background: "rgba(20, 26, 33, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "24px",
            padding: "40px 36px",
            marginTop: "32px",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: 800, color: accentColor }}>
            💎 투자 핵심 포인트 (Deal Points)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {dealPoints.slice(0, 2).map((point: string, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <span style={{ fontSize: "30px", color: accentColor }}>•</span>
                <span style={{ fontSize: "30px", fontWeight: 600, color: "#E7ECF2", lineHeight: 1.4 }}>
                  {point}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer & Trust Verification Badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(31, 41, 55, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "24px",
            padding: "28px 36px",
            marginTop: "40px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "32px" }}>🛡️</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "26px", fontWeight: 800, color: "#FFFFFF" }}>
                크리딜 검증 전담 공인중개사
              </span>
              <span style={{ fontSize: "22px", color: "#9AA7B5" }}>
                비밀유지약정(NDA) 체결 후 정밀 IM 수지분석서 제공
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              color: "#0B0F14",
              background: accentColor,
              padding: "12px 28px",
              borderRadius: "14px",
            }}
          >
            상세 요청 가능
          </div>
        </div>
      </div>
  );

  const imageResponse = new ImageResponse(jsx, { width: 1080, height: 1920, fonts: fontsList });
  return new Response(imageResponse.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `attachment; filename="deal_card_${id}_teaser.png"`,
    },
  });
}

