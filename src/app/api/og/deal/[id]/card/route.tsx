import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";
import { collectSensitiveNeedles, maskNeedles } from "@/domain/public-projection/deal-card";
import { cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import { healCorruptedRegionLabel } from "@/domain/building/dealcard-publication/banding-engine";
import { isUuid } from "@/lib/im-lite/quick-generate-store";
import { resolveOgDealGuard } from "@/lib/og/deal-public-guard";
import {
  isBuildingStatusPublic,
  isSignalCardStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
} from "@/domain/public-projection/visibility";
import { loadOgFonts } from "@/lib/magazine/og-fonts";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const PUBLIC_OG_DOC_STATUSES = new Set<string>(["published", ...PUBLIC_IM_DOC_STATUSES]);

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const siteUrl = getCanonicalSiteUrl();
  const landingUrl = `${siteUrl}/dc/${id}`;

  let building: Record<string, unknown> | null = null;
  let teaserDoc: Record<string, unknown> | null = null;
  let ssotStatus: string | null = null;
  let signalCardStatus: string | null = null;
  let hasVerifiedSentEvent = false;
  let quickRec: Awaited<ReturnType<typeof resolveOgDealGuard>>["quickRec"] = null;
  let snapshotCard4: Record<string, unknown> | null = null;

  try {
    const supabase = createServiceClient();
    const ogGuard = await resolveOgDealGuard(id, supabase);
    if (ogGuard.blocked) {
      return new Response("Not Found", { status: 404 });
    }
    quickRec = ogGuard.quickRec;
    snapshotCard4 = ogGuard.snapshotCard4;

    const bData = await readBuilding(id);
    building = (bData && typeof bData === "object" ? (bData as Record<string, unknown>) : null);
    if (building && !isBuildingStatusPublic(building.status as string | null | undefined)) {
      return new Response("Not Found", { status: 404 });
    }

    if (isUuid(id)) {
      const { data: ssotRow } = await supabase
        .from("building_ssot_lite")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      ssotStatus = ssotRow?.status ? String(ssotRow.status) : null;
      if (ssotRow && !isBuildingStatusPublic(ssotRow.status)) {
        return new Response("Not Found", { status: 404 });
      }

      const { data: sData } = await supabase
        .from("building_signal_cards")
        .select("area_signal, asset_type, price_band, title, status, visibility")
        .eq("building_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      signalCardStatus = sData?.status ? String(sData.status) : null;

      if (sData?.visibility === "internal_only" || sData?.status === "archived") {
        return new Response("Not Found", { status: 404 });
      }

      const { data: tData } = await supabase
        .from("document_objects")
        .select("*")
        .eq("building_id", id)
        .eq("document_type", "blind_teaser")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      teaserDoc = (tData && typeof tData === "object" ? (tData as Record<string, unknown>) : null);

      if (sData) {
        if (!building) building = { id };
        building.area_signal = building.area_signal || sData.area_signal;
        building.asset_type = building.asset_type || sData.asset_type;
        building.price_band = building.price_band || sData.price_band;
      }

      const isTeaserPublicEarly =
        Boolean(teaserDoc) &&
        teaserDoc?.visibility !== "internal_only" &&
        PUBLIC_OG_DOC_STATUSES.has(String(teaserDoc?.status || ""));
      if (
        String(ssotStatus || building?.status || "") === "draft" &&
        !snapshotCard4 &&
        !quickRec &&
        !isTeaserPublicEarly &&
        !isSignalCardStatusPublic(signalCardStatus)
      ) {
        try {
          interface CardActivityQueryLike
            extends PromiseLike<{ data?: Array<Record<string, unknown>> | null }> {
            in?: (col: string, vals: string[]) => CardActivityQueryLike;
            contains?: (col: string, val: Record<string, unknown>) => CardActivityQueryLike;
            order?: (col: string, opts: { ascending: boolean }) => CardActivityQueryLike;
            limit?: (n: number) => CardActivityQueryLike;
          }
          let actQ = supabase
            .from("activity_events")
            .select("actor_id, event_type, metadata, created_at") as unknown as CardActivityQueryLike;
          if (typeof actQ?.in === "function") {
            actQ = actQ.in("event_type", [
              "dealcard_sent",
              "dealcard_restored",
              "dealcard_deleted",
              "link_revoked",
              "link_restored",
            ]);
          }
          if (typeof actQ?.contains === "function") {
            actQ = actQ.contains("metadata", { building_id: id });
          }
          if (typeof actQ?.order === "function") {
            actQ = actQ.order("created_at", { ascending: false });
          }
          if (typeof actQ?.limit === "function") {
            actQ = actQ.limit(50);
          }
          const { data: acts } = await actQ;
          const matching = (Array.isArray(acts) ? acts : []).filter((a) => {
            const meta = (a?.metadata as Record<string, unknown> | undefined) || {};
            return (
              String(meta.building_id || "").trim() === id &&
              (["link_revoked", "link_restored"].includes(String(a?.event_type || "")) ||
                Boolean(a?.actor_id))
            );
          });
          const latestRevoke = matching.find((a) =>
            ["link_revoked", "link_restored"].includes(String(a?.event_type || ""))
          );
          const latestTransition = matching.find((a) =>
            ["dealcard_sent", "dealcard_restored", "dealcard_deleted"].includes(
              String(a?.event_type || "")
            )
          );
          if (
            latestRevoke?.event_type !== "link_revoked" &&
            latestTransition?.event_type === "dealcard_sent" &&
            Boolean(latestTransition?.actor_id)
          ) {
            hasVerifiedSentEvent = true;
          }
        } catch {
          // Ignore if activity_events unavailable
        }
      }
    }
  } catch (e) {
    log.warn("Data fetch warning in 1-page card generator:", e);
  }

  const teaserDocBody =
    teaserDoc?.body && typeof teaserDoc.body === "object"
      ? (teaserDoc.body as Record<string, unknown>)
      : null;

  if (teaserDocBody?.is_revoked === true || teaserDoc?.status === "archived") {
    return new Response("Not Found", { status: 404 });
  }

  const isTeaserDocPublic =
    Boolean(teaserDoc) &&
    teaserDoc?.visibility !== "internal_only" &&
    PUBLIC_OG_DOC_STATUSES.has(String(teaserDoc?.status || ""));

  if (teaserDoc && !isTeaserDocPublic && !snapshotCard4 && !quickRec) {
    return new Response("Not Found", { status: 404 });
  }

  if (
    String(ssotStatus || building?.status || "") === "draft" &&
    !snapshotCard4 &&
    !quickRec &&
    !isTeaserDocPublic &&
    !isSignalCardStatusPublic(signalCardStatus) &&
    !hasVerifiedSentEvent
  ) {
    return new Response("Not Found", { status: 404 });
  }

  if (!building && !snapshotCard4 && !quickRec && !isTeaserDocPublic) {
    return new Response("Not Found", { status: 404 });
  }

  const publishedTeaserCard4 =
    isTeaserDocPublic && teaserDocBody?.card4 && typeof teaserDocBody.card4 === "object"
      ? (teaserDocBody.card4 as Record<string, unknown>)
      : undefined;
  const card4 = (snapshotCard4 || (quickRec?.card4 as Record<string, unknown> | undefined) || publishedTeaserCard4);
  const safeBuilding: Record<string, unknown> = building || {
    id,
    area_signal: (card4?.region as string | undefined) || "서울 주요 권역",
    asset_type: (card4?.use as string | undefined) || "상업용 빌딩",
    price_band: (card4?.priceBand as string | undefined) || "가격 협의",
  };
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);
  const regionFallbackSources: Array<string | null | undefined> = [
    typeof safeBuilding.raw_address === "string" ? safeBuilding.raw_address : undefined,
    typeof safeBuilding.raw_input === "string" ? safeBuilding.raw_input : undefined,
    typeof safeBuilding.address === "string" ? safeBuilding.address : undefined,
    typeof safeBuilding.road_address === "string" ? safeBuilding.road_address : undefined,
    typeof safeBuilding.jibun_address === "string" ? safeBuilding.jibun_address : undefined,
    typeof safeBuilding.building_name === "string" ? safeBuilding.building_name : undefined,
    typeof safeBuilding.title === "string" ? safeBuilding.title : undefined,
    typeof (safeBuilding.attrs as Record<string, unknown> | undefined)?.rawAddress === "string"
      ? ((safeBuilding.attrs as Record<string, unknown>).rawAddress as string)
      : undefined,
    typeof (safeBuilding.attrs as Record<string, unknown> | undefined)?.address === "string"
      ? ((safeBuilding.attrs as Record<string, unknown>).address as string)
      : undefined,
    quickRec?.address,
    quickRec?.buildingName,
    typeof card4?.headline === "string" ? card4.headline : undefined,
    typeof teaserDocBody?.title === "string" ? teaserDocBody.title : undefined,
    typeof teaserDocBody?.ogTitle === "string" ? teaserDocBody.ogTitle : undefined,
  ];
  const rawAreaSignalInput =
    (card4?.region as string | undefined) || rawAttrs.areaSignal || (safeBuilding.area_signal as string | undefined);
  const healedAreaSignal =
    typeof rawAreaSignalInput === "string"
      ? healCorruptedRegionLabel(rawAreaSignalInput, regionFallbackSources)
      : rawAreaSignalInput;
  const attrs = {
    ...rawAttrs,
    areaSignal: healedAreaSignal,
    priceBand: (card4?.priceBand as string | undefined) || rawAttrs.priceBand || (safeBuilding.price_band as string | undefined),
    assetType: (card4?.use as string | undefined) || rawAttrs.assetType || (safeBuilding.asset_type as string | undefined),
    investmentPosture: ((card4?.posture as string | undefined) || rawAttrs.investmentPosture) as typeof rawAttrs.investmentPosture,
  };
  const teaserView = projectToTeaser(attrs);
  const imBody: Record<string, unknown> = teaserDocBody ?? {};
  const rawRegionDisplay = healCorruptedRegionLabel(
    String(card4?.region || attrs.areaSignal || teaserView.region || "서울 주요 권역"),
    regionFallbackSources
  );
  const needles = collectSensitiveNeedles(safeBuilding, rawRegionDisplay);
  const sanitizeCardText = (text: string, fallback: string): string => {
    const masked = maskNeedles(String(text || ""), needles);
    return cleanBlindPoints([masked])[0] || fallback;
  };

  const regionDisplay = sanitizeCardText(rawRegionDisplay, "서울 주요 권역");
  const useDisplay = sanitizeCardText(String(card4?.use || teaserView.assetType || "상업용 빌딩"), "상업용 빌딩");
  const priceBandDisplay = maskNeedles(String(card4?.priceBand || teaserView.bandedPrice || "가격 협의"), needles);

  const rawHookCopy = String(
    card4?.headline ||
    imBody.hookCopy ||
    teaserView.hookCopy ||
    `${regionDisplay} 핵심 ${useDisplay}`
  );
  const hookCopy = sanitizeCardText(rawHookCopy, `${regionDisplay} 핵심 ${useDisplay}`);
  const posture = String(card4?.posture || teaserView.posture || "income");
  const postureLabel = teaserView.postureLabel || "임대수익형";

  const rawTiles = (teaserView.postureHeroTiles || [
    { emoji: "💰", label: "매각가", value: priceBandDisplay },
    { emoji: "📍", label: "권역", value: regionDisplay },
  ]).map((tile) => {
    if (tile.label === "매각가") return { ...tile, value: priceBandDisplay };
    if (tile.label === "권역") return { ...tile, value: regionDisplay };
    return { ...tile, value: maskNeedles(String(tile.value || ""), needles) };
  });
  const heroTiles = filterValidTiles(rawTiles).slice(0, 4);

  const rawDealPointsSource = Array.isArray(card4?.points) && card4.points.length > 0
    ? (card4.points as string[])
    : Array.isArray(imBody.dealPoints)
    ? (imBody.dealPoints as string[])
    : [teaserView.highlightText || "안정적 임차 구성 및 우수한 접근성"];
  const rawDealPoints = rawDealPointsSource.map((p) => maskNeedles(String(p || ""), needles));
  const dealPoints = cleanBlindPoints(rawDealPoints);
  if (dealPoints.length === 0) {
    dealPoints.push("안정적 임차 구성 및 우수한 접근성");
  }

  // Generate QR Code Data URL
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(landingUrl, {
      margin: 1,
      width: 240,
      color: { dark: "#0B0F14", light: "#FFFFFF" },
    });
  } catch (err) {
    log.warn("QR generation failed, will show URL text instead", err);
  }

  const fontData = await loadOgFonts();
  const fonts = fontData.fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: f.style,
  }));
  const safeText = (text: string, fallback: string) => {
    if (!fontData.glyphs) return text || fallback;
    let out = "";
    for (const ch of text) {
      if (/\s/.test(ch) || fontData.glyphs.has(ch.codePointAt(0)!)) out += ch;
    }
    return out.replace(/\s+/g, " ").trim() || fallback;
  };

  const safePostureLabel = safeText(postureLabel, "Income");
  const safeRegionSubtitle = safeText(`${regionDisplay} · 블라인드 부동산 티저`, "Seoul CRE Teaser");
  const safeHookCopy = safeText(hookCopy, "CRE Deal");

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

  // WP-7.3C P2: short CDN TTL so revoked/deleted cards stop rendering within minutes.
  const cacheControl = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

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
          fontFamily: '"Noto Sans KR", sans-serif',
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
                  display: "flex",
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
                  display: "flex",
                  fontSize: "20px",
                  fontWeight: 700,
                  background: accentColor,
                  color: "#0B0F14",
                  padding: "4px 14px",
                  borderRadius: "8px",
                }}
              >
                {safePostureLabel}
              </span>
            </div>
            <span style={{ display: "flex", fontSize: "22px", color: "#9AA7B5", fontWeight: 500 }}>
              {safeRegionSubtitle}
            </span>
          </div>

          {/* QR Code Container */}
          {qrDataUrl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#FFFFFF", padding: "16px", borderRadius: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} width={150} height={150} alt="QR Code" />
              <span style={{ display: "flex", fontSize: "14px", fontWeight: 700, color: "#0B0F14", marginTop: "8px" }}>스캔 시 NDA/상세 열람</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.1)", padding: "16px 24px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.2)" }}>
              <span style={{ display: "flex", fontSize: "18px", fontWeight: 700, color: "#FFFFFF" }}>credeal.net</span>
              <span style={{ display: "flex", fontSize: "14px", color: "#9AA7B5", marginTop: "4px" }}>에서 상세 요청</span>
            </div>
          )}
        </div>

        {/* Main Headline / Hero Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px", marginTop: "40px" }}>
          {teaserView.urgencyTag === "urgent" && (
            <div style={{ display: "flex" }}>
              <span
                style={{
                  display: "flex",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#EF4444",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  padding: "6px 20px",
                  borderRadius: "30px",
                }}
              >
                급매물 (빠른 의사결정 필요)
              </span>
            </div>
          )}

          <h1
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 900,
              lineHeight: 1.3,
              color: "#FFFFFF",
              margin: 0,
              letterSpacing: "-1px",
            }}
          >
            {safeHookCopy}
          </h1>

          <p style={{ display: "flex", fontSize: "28px", color: "#9AA7B5", lineHeight: 1.5, margin: 0 }}>
            매도자 요청으로 지번 및 소유자는 보호됩니다. 비밀유지약정(NDA) 체결 후 상세 자료가 공개됩니다.
          </p>
        </div>

        {/* 4-Metric Grid with Glassmorphism */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "24px",
            marginTop: "40px",
          }}
        >
          {heroTiles.map((tile, i) => (
            <div
              key={i}
              style={{
                width: "460px",
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
                <span style={{ display: "flex", fontSize: "26px", color: "#9AA7B5", fontWeight: 600 }}>
                  {safeText(String(tile.label || ""), "지표")}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: i === 0 ? "48px" : "44px",
                  fontWeight: 900,
                  color: i === 0 ? "#5EEAD4" : "#FFFFFF",
                }}
              >
                {safeText(String(tile.value || ""), "-")}
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
          <div style={{ display: "flex", fontSize: "24px", fontWeight: 800, color: accentColor }}>
            투자 핵심 포인트 (Deal Points)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {dealPoints.slice(0, 2).map((point: string, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <span style={{ display: "flex", fontSize: "30px", color: accentColor }}>·</span>
                <span style={{ display: "flex", fontSize: "30px", fontWeight: 600, color: "#E7ECF2", lineHeight: 1.4 }}>
                  {safeText(point, "-")}
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
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: accentColor,
                display: "flex",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", fontSize: "26px", fontWeight: 800, color: "#FFFFFF" }}>
                크리딜 검증 전담 공인중개사
              </span>
              <span style={{ display: "flex", fontSize: "22px", color: "#9AA7B5" }}>
                비밀유지약정(NDA) 체결 후 정밀 IM 수지분석서 제공
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
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

  const imageResponse = new ImageResponse(jsx, {
    width: 1080,
    height: 1920,
    fonts: fonts.length > 0 ? fonts : undefined,
    headers: {
      "Cache-Control": cacheControl,
    },
  });
  return new Response(imageResponse.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
      "Content-Disposition": `attachment; filename="deal_card_${id}_teaser.png"`,
    },
  });
}

