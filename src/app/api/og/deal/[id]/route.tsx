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
  const urlObj = new URL(request.url);
  const isImType = urlObj.searchParams.get("type") === "im";

  let building: Record<string, any> | null = null;
  let teaser: Record<string, any> | null = null;
  let imBody: Record<string, any> | null = null;
  let imDocTitle: string | null = null;
  let targetBuildingId = id;

  try {
    const supabase = createServiceClient();

    // 1. id가 document_objects의 PK인지 확인
    const { data: directDoc } = await supabase
      .from("document_objects")
      .select("id, title, body, document_type, building_id")
      .eq("id", id)
      .maybeSingle();

    if (directDoc) {
      if (directDoc.building_id) targetBuildingId = directDoc.building_id;
      if (directDoc.body && typeof directDoc.body === "object") {
        const bodyObj = directDoc.body as Record<string, any>;
        if (["im_lite", "im_lite_draft", "mobile_im", "im_pro"].includes(directDoc.document_type) || bodyObj.im_type === "mobile_im_lite") {
          imBody = bodyObj;
          imDocTitle = directDoc.title;
        } else {
          teaser = bodyObj;
        }
      }
    }

    // 2. Building 데이터 조회
    const { data: bData } = await readWithMigration(targetBuildingId);
    building = bData as Record<string, any>;

    // 3. building_signal_cards 조회 (최신 신호 데이터)
    const { data: sData } = await supabase
      .from("building_signal_cards")
      .select("area_signal, asset_type, price_band, title")
      .eq("building_id", targetBuildingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. document_objects 다중 조회 (blind_teaser, im_lite, mobile_im 등)
    const { data: docList } = await supabase
      .from("document_objects")
      .select("id, title, body, document_type")
      .eq("building_id", targetBuildingId)
      .in("document_type", ["blind_teaser", "im_lite", "im_lite_draft", "mobile_im", "im_pro"])
      .order("created_at", { ascending: false })
      .limit(5);

    if (docList && docList.length > 0) {
      for (const d of docList) {
        const b = d.body as Record<string, any>;
        if (!imBody && (["im_lite", "im_lite_draft", "mobile_im", "im_pro"].includes(d.document_type) || b?.im_type === "mobile_im_lite")) {
          imBody = b;
          imDocTitle = d.title;
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
  } catch (err) {
    console.warn("[OG/deal] Fetch error:", err);
  }

  const safeBuilding = building || { id: targetBuildingId };
  const rawAttrs = buildAttrsFromSsotLite(safeBuilding);
  
  // imBody의 ssot_summary에서 값 우선 참조
  const imSsot = (imBody?.ssot_summary ?? {}) as Record<string, any>;
  const imAskingPriceManwon = imSsot.asking_price_manwon ? Number(imSsot.asking_price_manwon) : 0;
  const askingPriceKrw = imAskingPriceManwon > 0 ? imAskingPriceManwon * 10000 : Number(rawAttrs.askingPriceKrw || 0);

  const attrs = {
    ...rawAttrs,
    askingPriceKrw,
    areaSignal: imSsot.area_signal || rawAttrs.areaSignal || safeBuilding.area_signal,
    priceBand: imSsot.price_band || (imAskingPriceManwon > 0 ? `${Math.ceil(imAskingPriceManwon / 10000)}억대` : null) || rawAttrs.priceBand || safeBuilding.price_band,
    assetType: imSsot.asset_type || rawAttrs.assetType || safeBuilding.asset_type,
  };
  const teaserView = projectToTeaser(attrs);

  const regionLabel = attrs.areaSignal || teaserView.region || safeBuilding.area_signal || "서울";
  const assetType = attrs.assetType || teaserView.assetType || safeBuilding.asset_type || "상업용 부동산";
  const postureLabel = imBody?.investmentPosture || teaserView.postureLabel || "임대수익형";
  const urgencyTag = teaserView.urgencyTag || (building?.urgency_tag as string);
  const bandedPrice = attrs.priceBand || teaserView.bandedPrice || "가격 협의";

  // Hook copy & title priority: IM 메타 / 제목 우선
  const mainHeadline = 
    imBody?.ogTitle 
    || imBody?.heroTitle 
    || imDocTitle 
    || teaser?.ogTitle 
    || teaser?.title 
    || `${regionLabel} ${assetType} 매각`;

  const subHeadline = 
    imBody?.ogDescription 
    || imBody?.heroSubtitle 
    || imBody?.keyInvestmentPoint 
    || imBody?.heroCard?.keyInvestmentPoint 
    || (imBody?.sections?.[0]?.markdown ? imBody.sections[0].markdown.replace(/[#*`\n]/g, ' ').slice(0, 80).trim() : null)
    || teaser?.ogDescription 
    || teaser?.shortSummary 
    || teaserView.hookCopy 
    || `${regionLabel} ${assetType} 핵심 투자 기회`;

  const displayMain = mainHeadline.length > 40 ? mainHeadline.slice(0, 40) + "..." : mainHeadline;
  const displaySub = subHeadline.length > 55 ? subHeadline.slice(0, 55) + "..." : subHeadline;

  // Hero tiles: 유효한 매각가와 권역 표시 보장
  const displayTiles = [
    { emoji: "💰", label: "매각가", value: bandedPrice },
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


