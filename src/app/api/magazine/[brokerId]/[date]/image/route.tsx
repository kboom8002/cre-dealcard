import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MARKET_TEMP_CONFIG, type MarketTemperature } from "@/domain/magazine/types";

export const runtime = "nodejs";

const ACCENT: Record<string, string> = {
  emerald: "#10b981",
  indigo: "#6366f1",
  rose: "#f43f5e",
  amber: "#f59e0b",
  slate: "#94a3b8",
};

const SIZES = {
  story: { width: 1080, height: 1920 },
  card: { width: 1080, height: 1080 },
  og: { width: 1200, height: 630 },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brokerId: string; date: string }> }
) {
  const { brokerId, date } = await params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "story") as keyof typeof SIZES;
  const size = SIZES[format] || SIZES.story;

  const supabase = createServiceClient();

  // 1. 브로커 정보 조회
  let broker: any = {
    name: "CRE 전문 중개사",
    company: "CRE DealCard 파트너스",
    specialtyRegions: ["성수동", "강남권"],
    phone: "010-0000-0000",
  };

  try {
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("user_id, slug, specialty_regions, specialty_assets")
      .eq("slug", brokerId)
      .maybeSingle();

    if (bp) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, company, phone")
        .eq("id", bp.user_id)
        .maybeSingle();

      if (profile) {
        broker = {
          name: profile.display_name || broker.name,
          company: profile.company || broker.company,
          specialtyRegions: bp.specialty_regions || broker.specialtyRegions,
          phone: profile.phone || broker.phone,
        };
      }
    }
  } catch (err) {
    console.warn("[MagazineImage] Failed to fetch broker profile:", err);
  }

  // 2. 에디션 조회
  let edition: any = null;
  try {
    const { data: ed } = await supabase
      .from("magazine_editions")
      .select("title, market_temp, cover_keywords, content, theme_title, theme_body_md, featured_deal_ids")
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ed) {
      edition = ed;
    }
  } catch (err) {
    console.warn("[MagazineImage] Failed to fetch edition:", err);
  }

  const title = edition?.title || `${date} CRE 위클리 마켓 리포트`;
  const marketTemp: MarketTemperature = edition?.market_temp || "관망";
  const tempConfig = MARKET_TEMP_CONFIG[marketTemp] || MARKET_TEMP_CONFIG["관망"];
  const keywords = edition?.cover_keywords || ["수익률 분석", "금리 동향", "급매물 포착"];
  const themeTitle = edition?.theme_title || "서울 주요 권역 거래 동향 & 밸류업 전략";

  // AI 브리핑 본문 요약 (줄바꿈/헤딩 제거 후 3줄 추출)
  const rawBriefing =
    edition?.content?.ai_briefing ||
    edition?.theme_body_md ||
    "서울 상업용 부동산 시장의 주요 지표와 권역별 실거래 가격 변동을 종합 분석하여 핵심 인사이트를 전달합니다.";
  
  const cleanBriefing = String(rawBriefing)
    .replace(/[#*`_~]/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .slice(0, 3)
    .join(" ");

  const [y, m, d] = date.includes("-") ? date.split("-") : [new Date().getFullYear(), "01", "01"];
  const dateLabel = `${y}.${m}.${d}`;

  // Story Format (1080 x 1920)
  if (format === "story") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "1080px",
            height: "1920px",
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(180deg, #090a10 0%, #0f121d 50%, #06070b 100%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            position: "relative",
            padding: "80px 70px",
            color: "#ffffff",
          }}
        >
          {/* Top Background Glow */}
          <div
            style={{
              position: "absolute",
              top: "-100px",
              left: "15%",
              width: "700px",
              height: "700px",
              background: "radial-gradient(circle, rgba(99,102,241,0.25), transparent 70%)",
              filter: "blur(100px)",
            }}
          />

          {/* 1. Header (Brand & Date) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "4px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
              />
              <span style={{ color: "#a5b4fc", fontSize: "24px", fontWeight: 800, letterSpacing: "4px" }}>
                CRE WEEKLY INTELLIGENCE
              </span>
            </div>
            <div
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                padding: "8px 20px",
                borderRadius: "30px",
                fontSize: "22px",
                fontWeight: 700,
                color: "#e2e8f0",
              }}
            >
              {dateLabel}
            </div>
          </div>

          {/* 2. Main Title & Temperature Badge */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "80px", zIndex: 10 }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 24px",
                  borderRadius: "30px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: `1px solid ${tempConfig.color}40`,
                }}
              >
                <span style={{ fontSize: "24px" }}>{tempConfig.emoji}</span>
                <span style={{ color: tempConfig.color, fontSize: "20px", fontWeight: 800 }}>
                  시장 온도: {marketTemp}
                </span>
              </div>
              <div
                style={{
                  padding: "10px 20px",
                  borderRadius: "30px",
                  background: "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "#a5b4fc",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                ✨ AI 주간 분석
              </div>
            </div>

            <div
              style={{
                fontSize: "56px",
                fontWeight: 900,
                lineHeight: 1.25,
                letterSpacing: "-1.5px",
                wordBreak: "keep-all",
              }}
            >
              {title}
            </div>

            {/* Keyword Pills */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {keywords.map((kw: string, i: number) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#cbd5e1",
                    padding: "8px 18px",
                    borderRadius: "16px",
                    fontSize: "18px",
                    fontWeight: 600,
                  }}
                >
                  #{kw}
                </div>
              ))}
            </div>
          </div>

          {/* 3. AI Briefing Section Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "28px",
              padding: "40px",
              marginTop: "50px",
              gap: "18px",
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "26px" }}>💡</span>
              <span style={{ fontSize: "26px", fontWeight: 800, color: "#f8fafc" }}>
                {themeTitle}
              </span>
            </div>
            <div
              style={{
                fontSize: "22px",
                lineHeight: 1.6,
                color: "#94a3b8",
                wordBreak: "keep-all",
              }}
            >
              {cleanBriefing.slice(0, 240)}...
            </div>
          </div>

          {/* 4. Highlighted Strategy Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: "28px",
              padding: "36px 40px",
              marginTop: "36px",
              gap: "16px",
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "#a5b4fc", fontSize: "22px", fontWeight: 800 }}>
                  🏢 권역별 매수 검토 포인트
                </span>
              </div>
              <span style={{ color: "#818cf8", fontSize: "16px", fontWeight: 700 }}>
                실거래가 기반
              </span>
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
              <div
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.3)",
                  padding: "20px",
                  borderRadius: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <span style={{ color: "#94a3b8", fontSize: "16px" }}>주요 관심 권역</span>
                <span style={{ color: "#ffffff", fontSize: "24px", fontWeight: 800 }}>
                  {broker.specialtyRegions.join(", ")}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.3)",
                  padding: "20px",
                  borderRadius: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <span style={{ color: "#94a3b8", fontSize: "16px" }}>전략 포스처</span>
                <span style={{ color: "#34d399", fontSize: "24px", fontWeight: 800 }}>
                  선별적 가치투자
                </span>
              </div>
            </div>
          </div>

          {/* 5. Footer (Broker Branding & Contact) */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              paddingTop: "40px",
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
              <div
                style={{
                  width: "84px",
                  height: "84px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "36px",
                  fontWeight: 900,
                }}
              >
                {broker.name.charAt(0)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                  <span style={{ fontSize: "32px", fontWeight: 900 }}>{broker.name}</span>
                  <span style={{ fontSize: "20px", color: "#94a3b8" }}>{broker.company}</span>
                </div>
                <div style={{ fontSize: "18px", color: "#818cf8", fontWeight: 600 }}>
                  📞 {broker.phone} • 1:1 전담 부동산 자문
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "8px",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#ffffff",
                  padding: "12px 24px",
                  borderRadius: "20px",
                  fontSize: "18px",
                  fontWeight: 800,
                }}
              >
                credeal.net
              </div>
              <span style={{ fontSize: "14px", color: "#64748b" }}>상업용 부동산 인텔리전스</span>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1920 }
    );
  }

  // Fallback to square card or OG landscape
  return new ImageResponse(
    (
      <div
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0f111a 0%, #060810 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "50px 60px",
          color: "#ffffff",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#a5b4fc", fontSize: "18px", fontWeight: 800, letterSpacing: "3px" }}>
            CRE WEEKLY MAGAZINE
          </span>
          <span style={{ color: "#94a3b8", fontSize: "18px" }}>{dateLabel}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "20px" }}>{tempConfig.emoji}</span>
            <span style={{ color: tempConfig.color, fontSize: "18px", fontWeight: 800 }}>
              {marketTemp}
            </span>
          </div>
          <div style={{ fontSize: "42px", fontWeight: 900, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: "18px", color: "#94a3b8" }}>{cleanBriefing.slice(0, 140)}...</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
              {broker.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "20px" }}>{broker.name}</div>
              <div style={{ color: "#94a3b8", fontSize: "14px" }}>{broker.company}</div>
            </div>
          </div>
          <div style={{ color: "#818cf8", fontSize: "16px", fontWeight: 700 }}>
            {broker.phone}
          </div>
        </div>
      </div>
    ),
    size
  );
}
