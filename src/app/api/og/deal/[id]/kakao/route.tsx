import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";
import { collectSensitiveNeedles, maskNeedles } from "@/domain/public-projection/deal-card";
import { cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import { isUuid } from "@/lib/im-lite/quick-generate-store";
import { resolveOgDealGuard } from "@/lib/og/deal-public-guard";
import {
  isSignalCardStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
} from "@/domain/public-projection/visibility";
import { loadOgFonts } from "@/lib/magazine/og-fonts";
import { createModuleLogger } from "@/lib/logger";

const PUBLIC_OG_DOC_STATUSES = new Set<string>(["published", ...PUBLIC_IM_DOC_STATUSES]);

const log = createModuleLogger("og-kakao");

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let building: Record<string, any> | null = null;
  let teaserDoc: Record<string, any> | null = null;
  let brokerProfile: Record<string, any> | null = null;
  let snapshotBroker: Record<string, any> | null = null;
  let ssotStatus: string | null = null;
  let signalCardStatus: string | null = null;
  let isImLitePublic = false;
  let hasVerifiedSentEvent = false;
  let quickRec: Awaited<ReturnType<typeof resolveOgDealGuard>>["quickRec"] = null;
  let snapshotCard4: Record<string, any> | null = null;

  try {
    const supabase = createServiceClient();
    const ogGuard = await resolveOgDealGuard(id, supabase);
    if (ogGuard.blocked) {
      return new Response("Not Found", { status: 404 });
    }
    quickRec = ogGuard.quickRec;
    snapshotCard4 = ogGuard.snapshotCard4;
    if (ogGuard.snapshot && typeof ogGuard.snapshot === "object") {
      const rawBp = ogGuard.snapshot.brokerProfile ?? ogGuard.snapshot.broker_profile;
      if (rawBp && typeof rawBp === "object") {
        snapshotBroker = rawBp as Record<string, any>;
      }
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
      ssotStatus = ssotRow?.status ? String(ssotRow.status) : null;
      if (ssotRow?.status === "archived") {
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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      teaserDoc = tData;

      const { data: imLiteData } = await supabase
        .from("document_objects")
        .select("body, status, visibility")
        .eq("building_id", id)
        .eq("document_type", "im_lite")
        .in("status", Array.from(PUBLIC_OG_DOC_STATUSES))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sData && building) {
        building.area_signal = building.area_signal || sData.area_signal;
        building.asset_type = building.asset_type || sData.asset_type;
        building.price_band = building.price_band || sData.price_band;
      }
      if (
        imLiteData?.body &&
        imLiteData.visibility !== "internal_only" &&
        PUBLIC_OG_DOC_STATUSES.has(String(imLiteData.status || ""))
      ) {
        isImLitePublic = true;
        if (building) {
          const imLiteBody = imLiteData.body as Record<string, any>;
          const imPosture = imLiteBody.investment_posture || imLiteBody.investmentPosture;
          if (imPosture) {
            building.investment_posture = imPosture;
          }
        }
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
        !isImLitePublic &&
        !isSignalCardStatusPublic(signalCardStatus)
      ) {
        try {
          interface KakaoActivityQueryLike
            extends PromiseLike<{ data?: Array<Record<string, unknown>> | null }> {
            in?: (col: string, vals: string[]) => KakaoActivityQueryLike;
            contains?: (col: string, val: Record<string, unknown>) => KakaoActivityQueryLike;
            order?: (col: string, opts: { ascending: boolean }) => KakaoActivityQueryLike;
            limit?: (n: number) => KakaoActivityQueryLike;
          }
          let actQ = supabase
            .from("activity_events")
            .select("actor_id, event_type, metadata, created_at") as unknown as KakaoActivityQueryLike;
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
    !isImLitePublic &&
    !isSignalCardStatusPublic(signalCardStatus) &&
    !hasVerifiedSentEvent
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const imBody =
    isTeaserDocPublic && teaserDoc?.body && typeof teaserDoc.body === "object"
      ? (teaserDoc.body as Record<string, any>)
      : null;

  if (!imBody && !snapshotCard4 && !quickRec && !building) {
    return new Response("Not Found", { status: 404 });
  }

  const card4 = snapshotCard4 || quickRec?.card4 || imBody?.card4;

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
  const needles = collectSensitiveNeedles(safeBuilding);
  const sanitizeKakaoText = (text: string, fallback: string): string => {
    const masked = maskNeedles(String(text || ""), needles);
    return cleanBlindPoints([masked])[0] || fallback;
  };

  const rawRegionDisplay = card4?.region || teaserView.region || safeBuilding.area_signal || "서울권역";
  const regionDisplay = sanitizeKakaoText(rawRegionDisplay, "서울권역");
  const rawAssetTypeDisplay = card4?.use || teaserView.assetType || safeBuilding.asset_type || "근생·오피스";
  const assetTypeDisplay = sanitizeKakaoText(rawAssetTypeDisplay, "근생·오피스");

  const rawHookCopy =
    card4?.headline ||
    imBody?.card4?.headline ||
    imBody?.ogTitle ||
    imBody?.kakaoOgTitle ||
    imBody?.hookCopy ||
    teaserView.hookCopy ||
    `${regionDisplay} 프라임 ${assetTypeDisplay}`;
  const hookCopy = sanitizeKakaoText(rawHookCopy, `${regionDisplay} 프라임 ${assetTypeDisplay}`);

  const postureLabel = teaserView.postureLabel || "임대수익형";
  const explicitBand =
    (typeof card4?.priceBand === "string" && card4.priceBand.trim() ? card4.priceBand.trim() : null) ||
    (typeof safeBuilding.price_band === "string" &&
    safeBuilding.price_band.trim() &&
    safeBuilding.price_band !== "가격 협의"
      ? safeBuilding.price_band.trim()
      : null);
  const priceDisplay = maskNeedles(
    explicitBand ||
      (teaserView.bandedPrice && teaserView.bandedPrice !== "가격 미정" ? teaserView.bandedPrice : null) ||
      "가격 협의",
    needles
  );

  const brokerName = String(
    snapshotBroker?.displayName ||
      snapshotBroker?.display_name ||
      brokerProfile?.display_name ||
      quickRec?.brokerProfile?.displayName ||
      ""
  ).trim();
  const brokerCompany = String(
    snapshotBroker?.company ||
      snapshotBroker?.officeName ||
      brokerProfile?.company_name ||
      quickRec?.brokerProfile?.company ||
      ""
  ).trim();

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
  const safeRegionAsset = safeText(`${regionDisplay} · ${assetTypeDisplay}`, "Seoul CRE");
  const safeBrokerName = brokerName ? safeText(brokerName, "") : "";
  const safeBrokerCompany = brokerCompany ? safeText(`(${brokerCompany})`, "") : "";
  const truncatedHook = hookCopy.length > 32 ? hookCopy.slice(0, 32) + "..." : hookCopy;
  const safeHookCopy = safeText(truncatedHook, "CRE Deal");
  const safePriceDisplay = safeText(priceDisplay, "Price TBD");
  const safeCtaText = safeText("모바일 딜카드 열람 탭", "View DealCard");

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
          fontFamily: '"Noto Sans KR", sans-serif',
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
            display: "flex",
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
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "flex",
                fontSize: "34px",
                fontWeight: 800,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "8px 16px",
                borderRadius: "10px",
              }}
            >
              {safePostureLabel}
            </span>
            <span
              style={{
                display: "flex",
                fontSize: "34px",
                color: "#cbd5e1",
                background: "rgba(255, 255, 255, 0.06)",
                padding: "8px 16px",
                borderRadius: "10px",
              }}
            >
              {safeRegionAsset}
            </span>
          </div>

          {(safeBrokerName || safeBrokerCompany) ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {safeBrokerName ? (
                <span style={{ display: "flex", fontSize: "34px", fontWeight: 700, color: "#cbd5e1" }}>
                  {safeBrokerName}
                </span>
              ) : null}
              {!safeBrokerName && safeBrokerCompany ? (
                <span style={{ display: "flex", fontSize: "34px", color: "#94a3b8" }}>
                  {safeBrokerCompany}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Middle Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <span
            style={{
              display: "flex",
              fontSize: "54px",
              fontWeight: 900,
              color: "#FFFFFF",
              lineHeight: "1.2",
            }}
          >
            {safeHookCopy}
          </span>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}>
              <span style={{ display: "flex", fontSize: "34px", color: "#94a3b8", fontWeight: 700 }}>희망 매각가</span>
              <span
                style={{
                  display: "flex",
                  fontSize: "58px",
                  fontWeight: 900,
                  color: "#34d399",
                  letterSpacing: "-0.5px",
                }}
              >
                {safePriceDisplay}
              </span>
            </div>

            {/* Key Metric Tiles */}
            <div style={{ display: "flex", gap: "14px" }}>
              {heroTiles.map((tile, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "16px",
                    padding: "14px 22px",
                    minWidth: "150px",
                  }}
                >
                  <span style={{ display: "flex", fontSize: "34px", color: "#94a3b8", fontWeight: 600 }}>
                    {safeText(String(tile.label || ""), "지표")}
                  </span>
                  <span style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: "#f1f5f9", marginTop: "4px" }}>
                    {safeText(String(tile.value || ""), "-")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom footer: Verified by CREDEAL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {isVerified ? (
              <>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#6ee7b7",
                    display: "flex",
                  }}
                />
                <span style={{ display: "flex", fontSize: "34px", color: "#6ee7b7", fontWeight: 700 }}>
                  공적장부 교차검증 완료 · CREDEAL
                </span>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#64748b",
                    display: "flex",
                  }}
                />
                <span style={{ display: "flex", fontSize: "34px", color: "#94a3b8", fontWeight: 700 }}>
                  매도자 정보 보안 · CREDEAL
                </span>
              </>
            )}
          </div>

          <span
            style={{
              display: "flex",
              fontSize: "34px",
              fontWeight: 800,
              color: "#38bdf8",
              background: "rgba(56, 189, 248, 0.12)",
              padding: "8px 18px",
              borderRadius: "10px",
            }}
          >
            {safeCtaText}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // WP-7.3C P2: short CDN TTL so revoked/deleted cards stop rendering within minutes.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
