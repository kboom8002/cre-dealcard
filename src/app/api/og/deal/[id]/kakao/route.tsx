import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration, buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("og-kakao");

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
    if (res.ok) {
      fontBuffer = await res.arrayBuffer();
    }
  } catch (e) {
    log.warn("[OG/kakao] Font fetch failed, falling back to system fonts", e);
  }
  return fontBuffer;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let building: Record<string, any> | null = null;
  let teaserDoc: Record<string, any> | null = null;
  let brokerProfile: Record<string, any> | null = null;

  try {
    const supabase = createServiceClient();
    const { data: bData } = await readWithMigration(id);
    building = bData as Record<string, any>;

    const { data: sData } = await supabase
      .from("building_signal_cards")
      .select("area_signal, asset_type, price_band, title")
      .eq("building_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: tData } = await supabase
      .from("document_objects")
      .select("*")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    teaserDoc = tData;

    if (sData && building) {
      building.area_signal = building.area_signal || sData.area_signal;
      building.asset_type = building.asset_type || sData.asset_type;
      building.price_band = building.price_band || sData.price_band;
    }

    // Try fetching broker profile if broker_id is known
    const brokerId = building?.broker_id || building?.created_by;
    if (brokerId) {
      const { data: pData } = await supabase
        .from("broker_profiles")
        .select("display_name, company_name")
        .eq("id", brokerId)
        .maybeSingle();
      brokerProfile = pData;
    }
  } catch (e) {
    log.warn("[OG/kakao] Data fetch warning:", e);
  }

  const safeBuilding = building || {
    id,
    area_signal: "서울 핵심권역",
    asset_type: "상업용 빌딩",
    price_band: "가격 협의",
  };
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);
  const attrs = {
    ...rawAttrs,
    areaSignal: rawAttrs.areaSignal || safeBuilding.area_signal,
    priceBand: rawAttrs.priceBand || safeBuilding.price_band,
    assetType: rawAttrs.assetType || safeBuilding.asset_type,
  };
  const teaserView = projectToTeaser(attrs);
  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;

  const hookCopy =
    imBody.hookCopy || teaserView.hookCopy || `${teaserView.region} 프라임 꼬마빌딩`;
  const postureLabel = teaserView.postureLabel || "임대수익형";
  const priceDisplay = teaserView.bandedPrice || safeBuilding.price_band || "가격 협의";
  const regionDisplay = teaserView.region || safeBuilding.area_signal || "서울권역";
  const assetTypeDisplay = teaserView.assetType || safeBuilding.asset_type || "근생·오피스";
  const brokerName = brokerProfile?.display_name || "담당 공인중개사";
  const brokerCompany = brokerProfile?.company_name || "CREDEAL 파트너스";

  const rawTiles = teaserView.postureHeroTiles || [
    { emoji: "💰", label: "매각가", value: priceDisplay },
    { emoji: "📍", label: "권역", value: regionDisplay },
  ];
  const heroTiles = filterValidTiles(rawTiles).slice(0, 2);

  const fontData = await getFontData();
  const fontsList: any[] = fontData
    ? [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "800px",
          height: "400px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0d131f 0%, #080b12 60%, #05070a 100%)",
          color: "#FFFFFF",
          fontFamily: "'Pretendard', sans-serif",
          padding: "36px 40px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Glow Accent */}
        <div
          style={{
            position: "absolute",
            top: "-50px",
            right: "-50px",
            width: "350px",
            height: "350px",
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            paddingBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              {postureLabel}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              {regionDisplay} · {assetTypeDisplay}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#cbd5e1" }}>
              {brokerName}
            </span>
            <span style={{ fontSize: "10px", color: "#64748b" }}>
              ({brokerCompany})
            </span>
          </div>
        </div>

        {/* Middle Content */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px" }}>
          {/* Main Title & Price */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span
              style={{
                fontSize: "26px",
                fontWeight: 900,
                color: "#FFFFFF",
                lineHeight: "1.25",
                marginBottom: "8px",
              }}
            >
              {hookCopy.length > 28 ? hookCopy.slice(0, 28) + "..." : hookCopy}
            </span>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "14px", color: "#94a3b8" }}>희망 매각가</span>
              <span
                style={{
                  fontSize: "38px",
                  fontWeight: 900,
                  color: "#34d399",
                  letterSpacing: "-0.5px",
                }}
              >
                {priceDisplay}
              </span>
            </div>
          </div>

          {/* Key Metric Tiles */}
          <div style={{ display: "flex", gap: "10px" }}>
            {heroTiles.map((tile, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "12px 18px",
                  minWidth: "90px",
                }}
              >
                <span style={{ fontSize: "18px", marginBottom: "4px" }}>{tile.emoji}</span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>{tile.label}</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#f1f5f9", marginTop: "2px" }}>
                  {tile.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom footer: Verified by CREDEAL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px" }}>🛡️</span>
            <span style={{ fontSize: "11px", color: "#6ee7b7", fontWeight: 700 }}>
              Data Verified by CREDEAL
            </span>
            <span style={{ fontSize: "10px", color: "#475569" }}>|</span>
            <span style={{ fontSize: "10px", color: "#64748b" }}>
              공적장부 교차검증 완료 · 매도자 정보 보안 처리
            </span>
          </div>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#38bdf8",
              background: "rgba(56, 189, 248, 0.1)",
              padding: "4px 10px",
              borderRadius: "8px",
            }}
          >
            모바일 딜카드 열람 탭 →
          </span>
        </div>
      </div>
    ),
    {
      width: 800,
      height: 400,
      fonts: fontsList,
    }
  );
}
