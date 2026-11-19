import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/service";
import { readBuilding } from "@/domain/building/im-core/read-building";
import { buildAttrsFromSsotLite } from "@/lib/ssot-adapter";
import { projectToTeaser } from "@/domain/deal/teaser/teaser-projector";
import { filterValidTiles } from "@/domain/teaser/filter-valid-tiles";
import { cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { collectSensitiveNeedles, maskNeedles } from "@/domain/public-projection/deal-card";
import { isUuid } from "@/lib/im-lite/quick-generate-store";
import { resolveOgDealGuard } from "@/lib/og/deal-public-guard";
import {
  isSignalCardStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
} from "@/domain/public-projection/visibility";
import { loadOgFonts } from "@/lib/magazine/og-fonts";

const PUBLIC_OG_DOC_STATUSES = new Set<string>(["published", ...PUBLIC_IM_DOC_STATUSES]);

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let building: Record<string, any> | null = null;
  let teaser: Record<string, any> | null = null;
  let imBody: Record<string, any> | null = null;
  let signalCard: Record<string, any> | null = null;
  let ssotStatus: string | null = null;
  let hasVerifiedSentEvent = false;
  let targetBuildingId = id;
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

    if (isUuid(id)) {
      // 1. id가 document_objects의 PK인지 확인
      const { data: directDoc } = await supabase
        .from("document_objects")
        .select("id, title, body, document_type, building_id, status, visibility")
        .eq("id", id)
        .maybeSingle();

      if (directDoc) {
        const directStatus = String(directDoc.status || "");
        if (
          directDoc.visibility === "internal_only" ||
          directDoc.document_type === "im_lite_draft" ||
          !PUBLIC_OG_DOC_STATUSES.has(directStatus)
        ) {
          return new Response("Not Found", { status: 404 });
        }
        if (directDoc.building_id) targetBuildingId = directDoc.building_id;
        if (directDoc.body && typeof directDoc.body === "object") {
          const bodyObj = directDoc.body as Record<string, any>;
          if (bodyObj.is_revoked === true) {
            return new Response("Not Found", { status: 404 });
          }
          if (
            ["im_lite", "mobile_im", "im_pro"].includes(directDoc.document_type) ||
            bodyObj.im_type === "mobile_im_lite"
          ) {
            imBody = bodyObj;
          } else {
            teaser = bodyObj;
          }
        }
      }
    }

    // 2. Building 데이터 조회 (순수 읽기)
    const bData = await readBuilding(targetBuildingId);
    building = bData as Record<string, any>;
    if (building?.status === "archived") {
      return new Response("Not Found", { status: 404 });
    }

    if (isUuid(targetBuildingId)) {
      const { data: ssotRow } = await supabase
        .from("building_ssot_lite")
        .select("id, status")
        .eq("id", targetBuildingId)
        .maybeSingle();
      ssotStatus = ssotRow?.status ? String(ssotRow.status) : null;
      if (ssotRow?.status === "archived") {
        return new Response("Not Found", { status: 404 });
      }

      // 3. building_signal_cards 조회 (최신 신호 데이터)
      const { data: sData } = await supabase
        .from("building_signal_cards")
        .select("area_signal, asset_type, price_band, title, visibility, status")
        .eq("building_id", targetBuildingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      signalCard = sData;
      if (signalCard?.visibility === "internal_only" || signalCard?.status === "archived") {
        return new Response("Not Found", { status: 404 });
      }

      // 4. document_objects 다중 조회 (PUBLIC allowlist만 허용 — draft/internal_only/archived 차단)
      const { data: docList } = await supabase
        .from("document_objects")
        .select("id, title, body, document_type, status, visibility")
        .eq("building_id", targetBuildingId)
        .in("document_type", ["blind_teaser", "im_lite", "mobile_im", "im_pro"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (docList && docList.length > 0) {
        if (docList.some((d: Record<string, any>) => d.document_type === "blind_teaser" && d.body?.is_revoked === true)) {
          return new Response("Not Found", { status: 404 });
        }
        const publicDocs = docList.filter((d: Record<string, any>) => {
          const st = String(d.status || "");
          return (
            PUBLIC_OG_DOC_STATUSES.has(st) &&
            d.visibility !== "internal_only" &&
            d.document_type !== "im_lite_draft"
          );
        });
        if (publicDocs.length === 0 && !snapshotCard4 && !quickRec) {
          return new Response("Not Found", { status: 404 });
        }
        for (const d of publicDocs) {
          const b = d.body as Record<string, any>;
          if (!imBody && (["im_lite", "mobile_im", "im_pro"].includes(d.document_type) || b?.im_type === "mobile_im_lite")) {
            imBody = b;
          }
          if (!teaser && d.document_type === "blind_teaser" && b?.im_type !== "mobile_im_lite") {
            teaser = b;
          }
        }
      }

      if (sData) {
        if (!building) building = { id: targetBuildingId };
        building.area_signal = building.area_signal || sData.area_signal;
        building.asset_type = building.asset_type || sData.asset_type;
        building.price_band = building.price_band || sData.price_band;
      }

      const effectiveDraftCheck = String(ssotStatus || building?.status || "");
      if (
        effectiveDraftCheck === "draft" &&
        !snapshotCard4 &&
        !quickRec &&
        !teaser &&
        !imBody &&
        !isSignalCardStatusPublic(signalCard?.status)
      ) {
        try {
          interface ActivityQueryLike
            extends PromiseLike<{ data?: Array<Record<string, unknown>> | null }> {
            in?: (col: string, vals: string[]) => ActivityQueryLike;
            contains?: (col: string, val: Record<string, unknown>) => ActivityQueryLike;
            order?: (col: string, opts: { ascending: boolean }) => ActivityQueryLike;
            limit?: (n: number) => ActivityQueryLike;
          }
          let actQ = supabase
            .from("activity_events")
            .select("actor_id, event_type, metadata, created_at") as unknown as ActivityQueryLike;
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
            actQ = actQ.contains("metadata", { building_id: targetBuildingId });
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
              String(meta.building_id || "").trim() === targetBuildingId &&
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
  } catch (err) {
    log.warn("[OG/deal] Fetch error:", err);
  }

  if (teaser?.is_revoked === true) {
    return new Response("Not Found", { status: 404 });
  }
  if (
    String(ssotStatus || building?.status || "") === "draft" &&
    !snapshotCard4 &&
    !quickRec &&
    !teaser &&
    !imBody &&
    !isSignalCardStatusPublic(signalCard?.status) &&
    !hasVerifiedSentEvent
  ) {
    return new Response("Not Found", { status: 404 });
  }
  if (!building && !snapshotCard4 && !quickRec && !teaser && !imBody && !signalCard) {
    return new Response("Not Found", { status: 404 });
  }

  const card4 = snapshotCard4 || quickRec?.card4 || teaser?.card4 || imBody?.card4;
  const safeBuilding = building || {
    id: targetBuildingId,
    area_signal: card4?.region,
    asset_type: card4?.use,
    price_band: card4?.priceBand,
  };
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);

  // imBody의 ssot_summary에서 값 우선 참조
  const imSsot = (imBody?.ssot_summary ?? {}) as Record<string, any>;
  const imAskingPriceManwon = imSsot.asking_price_manwon ? Number(imSsot.asking_price_manwon) : 0;
  const askingPriceKrw = imAskingPriceManwon > 0 ? imAskingPriceManwon * 10000 : Number(rawAttrs.askingPriceKrw || 0);

  const rawPosture =
    card4?.posture ||
    imBody?.investmentPosture ||
    imBody?.investment_posture ||
    safeBuilding.investment_posture ||
    rawAttrs.investmentPosture;
  const assetAndUseText = `${card4?.use || imSsot.asset_type || safeBuilding.asset_type || ""} ${safeBuilding.current_use_signal || ""} ${safeBuilding.fit_summary || ""}`;
  const resolvedPosture = (!rawPosture || rawPosture === "income") && /나대지|토지|신축\s*부지|개발\s*부지/.test(assetAndUseText)
    ? "development"
    : (rawPosture || "income");

  const attrs = {
    ...rawAttrs,
    askingPriceKrw,
    areaSignal: card4?.region || imSsot.area_signal || rawAttrs.areaSignal || safeBuilding.area_signal,
    priceBand:
      card4?.priceBand ||
      imSsot.price_band ||
      safeBuilding.price_band ||
      rawAttrs.priceBand ||
      (imAskingPriceManwon > 0 ? formatPriceRange(imAskingPriceManwon * 10000) : null),
    assetType: card4?.use || imSsot.asset_type || rawAttrs.assetType || safeBuilding.asset_type,
    investmentPosture: resolvedPosture,
  };
  const teaserView = projectToTeaser(attrs);

  const POSTURE_KOREAN_MAP: Record<string, string> = {
    income: "임대수익형",
    development: "개발형",
    value_add: "밸류애드형",
    owner_occupied: "자가사용형",
    trading: "단기매매형",
    operating: "운영형",
  };

  const needles = collectSensitiveNeedles(safeBuilding);
  const sanitizeOgText = (text: string, fallback: string): string => {
    const masked = maskNeedles(String(text || ""), needles);
    return cleanBlindPoints([masked])[0] || fallback;
  };

  const rawRegionLabel = card4?.region || attrs.areaSignal || teaserView.region || safeBuilding.area_signal || "서울";
  const regionLabel = sanitizeOgText(rawRegionLabel, "서울");
  const rawAssetType = card4?.use || attrs.assetType || teaserView.assetType || safeBuilding.asset_type || "상업용 부동산";
  const assetType = sanitizeOgText(rawAssetType, "상업용 부동산");
  const postureLabel = POSTURE_KOREAN_MAP[resolvedPosture] || teaserView.postureLabel || "임대수익형";
  const urgencyTag = teaserView.urgencyTag || (building?.urgency_tag as string);
  const bandedPrice = card4?.priceBand || attrs.priceBand || teaserView.bandedPrice || "가격 협의";

  // Hook copy & title priority: broker DealCard 한 줄 제목(card4.headline SSOT) > broker custom edit > fallback (blind-safe only)
  const rawMainHeadline =
    card4?.headline ||
    teaser?.card4?.headline ||
    teaser?.ogTitle ||
    imBody?.ogTitle ||
    teaser?.kakaoOgTitle ||
    imBody?.kakaoOgTitle ||
    teaser?.title ||
    `${regionLabel} ${assetType} 매각`;

  const mainHeadline = sanitizeOgText(rawMainHeadline, `${regionLabel} ${assetType} 매각`);

  const rawSubHeadline =
    (Array.isArray(card4?.points) && card4.points.length > 0 ? card4.points[0] : null) ||
    teaser?.ogDescription ||
    imBody?.ogDescription ||
    teaser?.kakaoOgDescription ||
    imBody?.kakaoOgDescription ||
    imBody?.heroSubtitle ||
    imBody?.keyInvestmentPoint ||
    imBody?.heroCard?.keyInvestmentPoint ||
    teaser?.shortSummary ||
    teaserView.hookCopy ||
    `${regionLabel} ${assetType} 핵심 투자 기회`;

  // 중복된 "권역 권역" 제거 및 공백 정제 + 민감정보 마스킹
  const normalizedSub = String(rawSubHeadline || "")
    .replace(/권역\s*권역/g, "권역")
    .replace(/권역\s*소재\s*소재/g, "권역 소재")
    .replace(/\s+/g, " ")
    .trim();
  const cleanedSub = sanitizeOgText(normalizedSub, `${regionLabel} ${assetType} 핵심 투자 기회`);

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

  const rawDisplayMain = mainHeadline.length > 36 ? mainHeadline.slice(0, 36) + "..." : mainHeadline;
  const rawDisplaySub = cleanedSub.length > 60 ? cleanedSub.slice(0, 58) + "..." : cleanedSub;

  const displayMain = safeText(rawDisplayMain, "CRE Deal");
  const displaySub = rawDisplaySub ? safeText(rawDisplaySub, "") : "";
  const safePostureLabel = safeText(postureLabel, "Income");
  const safeRegionLabel = safeText(regionLabel, "Seoul");
  const safeAssetType = assetType ? safeText(assetType, "") : "";
  const safeBandedPrice = safeText(bandedPrice, "Price TBD");

  // Hero tiles: 유효한 매각가와 권역 표시 보장 (이모지 CDN 호출 제거)
  const displayTiles = [
    { label: "매각가", value: safeBandedPrice },
    { label: "권역", value: safeRegionLabel },
  ];

  // Adjust font size based on text length — 2x larger for mobile thumbnail readability
  const headlineFontSize = displayMain.length > 28 ? 56 : displayMain.length > 18 ? 64 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 56px",
          background: "linear-gradient(135deg, #030712 0%, #0F172A 55%, #020617 100%)",
          color: "white",
          fontFamily: '"Noto Sans KR", sans-serif',
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
            height: "8px",
            background: "linear-gradient(90deg, #D4A853 0%, #F3EBDA 50%, #B98A2E 100%)",
            display: "flex",
          }}
        />

        {/* Subtle Ambient Glow */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(212, 168, 83, 0.18) 0%, transparent 70%)",
            borderRadius: "50%",
            display: "flex",
          }}
        />

        {/* Top Header Row: Badges — 2x larger */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: "8px",
          }}
        >
          <div
            style={{
              background: "rgba(185, 138, 46, 0.3)",
              border: "2px solid rgba(212, 168, 83, 0.7)",
              borderRadius: "12px",
              padding: "10px 22px",
              fontSize: 36,
              fontWeight: 800,
              color: "#F3EBDA",
              display: "flex",
            }}
          >
            {safePostureLabel}
          </div>
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "2px solid rgba(59, 130, 246, 0.5)",
              borderRadius: "12px",
              padding: "10px 22px",
              fontSize: 36,
              fontWeight: 700,
              color: "#93c5fd",
              display: "flex",
            }}
          >
            {safeRegionLabel}
          </div>
          {safeAssetType ? (
            <div
              style={{
                background: "rgba(148, 163, 184, 0.15)",
                border: "2px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "12px",
                padding: "10px 22px",
                fontSize: 36,
                fontWeight: 700,
                color: "#cbd5e1",
                display: "flex",
              }}
            >
              {safeAssetType}
            </div>
          ) : null}
          {urgencyTag === 'urgent' ? (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.25)",
                border: "2px solid rgba(239, 68, 68, 0.7)",
                borderRadius: "12px",
                padding: "10px 22px",
                fontSize: 36,
                fontWeight: 800,
                color: "#FCA5A5",
                display: "flex",
              }}
            >
              급매
            </div>
          ) : null}
        </div>

        {/* Center Main Section: 2x larger headline */}
        <div 
          style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "14px", 
            margin: "0",
            maxWidth: "1090px",
            flex: "1",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: headlineFontSize,
              fontWeight: 900,
              lineHeight: 1.25,
              color: "#FFFFFF",
              display: "flex",
              letterSpacing: "-0.03em",
              wordBreak: "keep-all",
              overflow: "hidden",
            }}
          >
            {displayMain}
          </div>
          {displaySub ? (
            <div
              style={{
                fontSize: displaySub.length > 34 ? 26 : 30,
                fontWeight: 600,
                color: "#E2E8F0",
                display: "flex",
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
                wordBreak: "keep-all",
                maxHeight: "76px",
                overflow: "hidden",
              }}
            >
              {displaySub}
            </div>
          ) : null}
        </div>

        {/* Bottom Section: 2x larger stat tiles + branding */}
        <div 
          style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "flex-end",
            paddingBottom: "4px",
          }}
        >
          <div style={{ display: "flex", gap: "24px" }}>
            {displayTiles.map((tile: { label: string; value: string }, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1.5px solid rgba(255, 255, 255, 0.18)",
                  borderRadius: "16px",
                  padding: "16px 32px",
                  minWidth: "260px",
                }}
              >
                <span style={{ display: "flex", fontSize: 28, color: "#9AA7B5", fontWeight: 600 }}>
                  {tile.label}
                </span>
                <span style={{ display: "flex", fontSize: 52, fontWeight: 900, color: i === 0 ? "#5EEAD4" : "#FFFFFF" }}>
                  {tile.value}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom Branding — larger */}
          <div 
            style={{ 
              fontSize: 30, 
              fontWeight: 700, 
              color: "#94A3B8", 
              display: "flex",
              alignItems: "center",
              gap: "10px",
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
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // WP-7.3C P2: short CDN TTL so revoked/deleted cards stop rendering within minutes.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}


