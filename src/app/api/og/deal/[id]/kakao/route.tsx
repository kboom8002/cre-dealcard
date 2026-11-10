import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";
import { cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  getInboxState,
  getQuickImRecord,
  isDealCardDeleted,
  isUuid,
  resolveOrSynthesizeQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import { isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("og-kakao");

export const runtime = "nodejs";

let fontBuffer: ArrayBuffer | null = null;

async function getFontData(): Promise<ArrayBuffer | null> {
  if (fontBuffer) return fontBuffer;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // reduced timeout for crawler
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
  if (
    isDealCardDeleted(id) ||
    getInboxState().revokedBuildings[id]?.revoked ||
    isBuildingShareLinkRevoked(id)
  ) {
    return new Response("Not Found", { status: 404 });
  }

  let building: Record<string, any> | null = null;
  let teaserDoc: Record<string, any> | null = null;
  let brokerProfile: Record<string, any> | null = null;
  let quickRec = getQuickImRecord(id);

  try {
    const supabase = createServiceClient();
    if (!quickRec) {
      quickRec = await resolveOrSynthesizeQuickImRecord(id, supabase);
    }
    if (quickRec?.isRevoked) {
      return new Response("Not Found", { status: 404 });
    }

    const bData = await readBuilding(id);
    building = bData as Record<string, any>;
    if (building?.status === "archived") {
      return new Response("Not Found", { status: 404 });
    }

    if (isUuid(id)) {
      const { data: ssotRow } = await supabase
        .from("building_ssot_lite")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      if (ssotRow?.status === "archived") {
        return new Response("Not Found", { status: 404 });
      }

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
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      teaserDoc = tData;

      const { data: imLiteData } = await supabase
        .from("document_objects")
        .select("body")
        .eq("building_id", id)
        .eq("document_type", "im_lite")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sData && building) {
        building.area_signal = building.area_signal || sData.area_signal;
        building.asset_type = building.asset_type || sData.asset_type;
        building.price_band = building.price_band || sData.price_band;
      }
      if (imLiteData?.body && building) {
        const imLiteBody = imLiteData.body as Record<string, any>;
        const imPosture = imLiteBody.investment_posture || imLiteBody.investmentPosture;
        if (imPosture) {
          building.investment_posture = imPosture;
        }
      }

      // Try fetching broker profile if broker_id is known
      const brokerId = building?.owner_id || quickRec?.ownerId;
      if (brokerId && isUuid(String(brokerId))) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("display_name, company")
          .eq("id", brokerId)
          .maybeSingle();
        if (pData) {
          brokerProfile = {
            ...pData,
            company_name: pData.company,
          };
        }
      }
    }
  } catch (e) {
    log.warn("[OG/kakao] Data fetch warning:", e);
  }

  if (teaserDoc?.body?.is_revoked === true) {
    return new Response("Not Found", { status: 404 });
  }

  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;
  const card4 = quickRec?.card4 || imBody?.card4;

  const safeBuilding = building || {
    id,
    area_signal: card4?.region || "서울 핵심권역",
    asset_type: card4?.use || "상업용 빌딩",
    price_band: card4?.priceBand || "가격 협의",
  };
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);
  const bLayers = (safeBuilding.layers || {}) as Record<string, any>;
  const assetAndUseText = `${card4?.use || safeBuilding.asset_type || ""} ${safeBuilding.current_use_signal || ""} ${safeBuilding.fit_summary || ""}`;
  const rawPosture =
    card4?.posture ||
    safeBuilding.investment_posture ||
    bLayers.investment_posture ||
    rawAttrs.investmentPosture;
  const inferredPosture =
    (!rawPosture || rawPosture === "income") && /나대지|토지|신축\s*부지|개발\s*부지/.test(assetAndUseText)
      ? "development"
      : (rawPosture || "income");

  const attrs = {
    ...rawAttrs,
    areaSignal: card4?.region || rawAttrs.areaSignal || safeBuilding.area_signal,
    priceBand: card4?.priceBand || rawAttrs.priceBand || safeBuilding.price_band,
    assetType: card4?.use || rawAttrs.assetType || safeBuilding.asset_type,
    investmentPosture: inferredPosture,
  };
  const teaserView = projectToTeaser(attrs);

  const rawRegionDisplay = card4?.region || teaserView.region || safeBuilding.area_signal || "서울권역";
  const regionDisplay = cleanBlindPoints([rawRegionDisplay])[0] || "서울권역";
  const rawAssetTypeDisplay = card4?.use || teaserView.assetType || safeBuilding.asset_type || "근생·오피스";
  const assetTypeDisplay = cleanBlindPoints([rawAssetTypeDisplay])[0] || "근생·오피스";

  const rawHookCopy =
    card4?.headline ||
    imBody?.card4?.headline ||
    teaserDoc?.body?.ogTitle ||
    imBody?.ogTitle ||
    teaserDoc?.body?.kakaoOgTitle ||
    imBody?.kakaoOgTitle ||
    imBody?.hookCopy ||
    teaserView.hookCopy ||
    `${regionDisplay} 프라임 ${assetTypeDisplay}`;
  const hookCopy = cleanBlindPoints([rawHookCopy])[0] || `${regionDisplay} 프라임 ${assetTypeDisplay}`;

  const postureLabel = teaserView.postureLabel || "임대수익형";
  const explicitBand =
    (typeof card4?.priceBand === "string" && card4.priceBand.trim() ? card4.priceBand.trim() : null) ||
    (typeof safeBuilding.price_band === "string" &&
    safeBuilding.price_band.trim() &&
    safeBuilding.price_band !== "가격 협의"
      ? safeBuilding.price_band.trim()
      : null);
  const priceDisplay =
    explicitBand ||
    (teaserView.bandedPrice && teaserView.bandedPrice !== "가격 미정" ? teaserView.bandedPrice : null) ||
    "가격 협의";

  const brokerName =
    brokerProfile?.display_name ||
    quickRec?.brokerProfile?.displayName ||
    "담당 공인중개사";
  const brokerCompany =
    brokerProfile?.company_name ||
    quickRec?.brokerProfile?.company ||
    "CREDEAL 파트너스";

  const rawTiles = (teaserView.postureHeroTiles || [
    { emoji: "💰", label: "매각가", value: priceDisplay },
    { emoji: "📍", label: "권역", value: regionDisplay },
  ]).map((tile) =>
    tile.label === "매각가"
      ? { ...tile, value: priceDisplay }
      : tile.label === "권역"
      ? { ...tile, value: regionDisplay }
      : tile
  );
  // Ensure no hardcoded dummy metrics (filter out 3.6%, 35%, 1,800만원 or fake metrics)
  const heroTiles = filterValidTiles(rawTiles)
    .filter((t) => !/3\.6%|35%|1,800만원/.test(t.value))
    .slice(0, 2);

  const isVerified = safeBuilding.verification_status === "VERIFIED" || safeBuilding.is_verified === true;

  const fontData = await getFontData();
  const fontsList: any[] = fontData
    ? [{ name: "Pretendard", data: fontData, style: "normal", weight: 700 }]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0d131f 0%, #080b12 60%, #05070a 100%)",
          color: "#FFFFFF",
          fontFamily: "'Pretendard', sans-serif",
          padding: "48px 56px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Glow Accent */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "500px",
            height: "500px",
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
            paddingBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "6px 12px",
                borderRadius: "8px",
              }}
            >
              {postureLabel}
            </span>
            <span
              style={{
                fontSize: "16px",
                color: "#94a3b8",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "6px 12px",
                borderRadius: "8px",
              }}
            >
              {regionDisplay} · {assetTypeDisplay}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#cbd5e1" }}>
              {brokerName}
            </span>
            <span style={{ fontSize: "14px", color: "#64748b" }}>
              ({brokerCompany})
            </span>
          </div>
        </div>

        {/* Middle Content */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "32px" }}>
          {/* Main Title & Price */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span
              style={{
                fontSize: "36px",
                fontWeight: 900,
                color: "#FFFFFF",
                lineHeight: "1.3",
                marginBottom: "12px",
              }}
            >
              {hookCopy.length > 32 ? hookCopy.slice(0, 32) + "..." : hookCopy}
            </span>

            <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
              <span style={{ fontSize: "20px", color: "#94a3b8" }}>희망 매각가</span>
              <span
                style={{
                  fontSize: "52px",
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
          <div style={{ display: "flex", gap: "16px" }}>
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
                  borderRadius: "16px",
                  padding: "18px 26px",
                  minWidth: "120px",
                }}
              >
                <span style={{ fontSize: "24px", marginBottom: "6px" }}>{tile.emoji}</span>
                <span style={{ fontSize: "14px", color: "#94a3b8" }}>{tile.label}</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "#f1f5f9", marginTop: "4px" }}>
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
            paddingTop: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isVerified ? (
              <>
                <span style={{ fontSize: "16px" }}>🛡️</span>
                <span style={{ fontSize: "15px", color: "#6ee7b7", fontWeight: 700 }}>
                  Data Verified by CREDEAL
                </span>
                <span style={{ fontSize: "14px", color: "#475569" }}>|</span>
                <span style={{ fontSize: "14px", color: "#64748b" }}>
                  공적장부 교차검증 완료 · 매도자 정보 보안 처리
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: "16px" }}>🔒</span>
                <span style={{ fontSize: "14px", color: "#64748b" }}>
                  매도자 정보 보안 처리
                </span>
              </>
            )}
          </div>

          <span
            style={{
              fontSize: "15px",
              fontWeight: 800,
              color: "#38bdf8",
              background: "rgba(56, 189, 248, 0.1)",
              padding: "6px 14px",
              borderRadius: "10px",
            }}
          >
            모바일 딜카드 열람 탭 →
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontsList,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
