/**
 * write-magazine-files.js
 * Writes all daily magazine feature files as UTF-8
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// FILE 1: Magazine Data API
// src/app/api/magazine/[brokerId]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
const magazineApiDir = path.join(root, 'src/app/api/magazine/[brokerId]');
fs.mkdirSync(magazineApiDir, { recursive: true });

const magazineApi = `import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── 브로커 ID → 권역 매핑 ────────────────────────────────────────────────────
const BROKER_REGION_MAP: Record<string, string> = {
  demo: "seongsu",
  "hong-gildong": "seongsu",
  "kim-chulsoo": "gbd",
  "lee-younghee": "ybd",
};

// ── 캐시 (Supabase magazine_issues 테이블) ────────────────────────────────────
async function getCachedMagazine(supabase: ReturnType<typeof createServiceClient>, brokerId: string, date: string) {
  const { data } = await supabase
    .from("magazine_issues")
    .select("*")
    .eq("broker_id", brokerId)
    .eq("issue_date", date)
    .maybeSingle();
  return data;
}

// ── 브로커 프로필 가져오기 ────────────────────────────────────────────────────
async function getBrokerProfile(supabase: ReturnType<typeof createServiceClient>, brokerId: string) {
  // Try slug-based lookup first
  const { data: bp } = await supabase
    .from("broker_profiles")
    .select("user_id, specialty_regions, specialty_assets, bio, total_deal_count_self, deal_size_range")
    .eq("slug", brokerId)
    .maybeSingle();

  if (!bp) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, company, phone, photo_url, tagline")
    .eq("id", bp.user_id)
    .single();

  if (!profile) return null;

  const { count: activeDealCount } = await supabase
    .from("building_ssot_lite")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", bp.user_id)
    .eq("status", "public_signal_ready");

  return { profile, broker: bp, activeDealCount: activeDealCount ?? 0 };
}

// ── 활성 딜카드 가져오기 ─────────────────────────────────────────────────────
async function getActiveDeals(supabase: ReturnType<typeof createServiceClient>, brokerId: string) {
  let userId: string | null = null;

  const { data: bp } = await supabase
    .from("broker_profiles")
    .select("user_id")
    .eq("slug", brokerId)
    .maybeSingle();

  if (bp) userId = bp.user_id;
  if (!userId) return [];

  const { data } = await supabase
    .from("building_ssot_lite")
    .select("id, address, area_signal, asset_type, price, status, photo_urls, buyer_interest_count")
    .eq("owner_id", userId)
    .in("status", ["public_signal_ready", "active"])
    .order("updated_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

// ── 시장 데이터 가져오기 ─────────────────────────────────────────────────────
async function getMarketIntelligence(supabase: ReturnType<typeof createServiceClient>, region: string) {
  const [{ data: news }, { data: sentiment }, { data: auctions }, { data: reports }] = await Promise.all([
    supabase.from("external_news").select("title, summary, source, sentiment").order("created_at", { ascending: false }).limit(5),
    supabase.from("social_sentiment").select("keyword, sentiment_score, mention_count, analysis_date").order("created_at", { ascending: false }).limit(3),
    supabase.from("auction_listings").select("case_number, address, minimum_bid, appraised_value, status, auction_date").order("auction_date", { ascending: true }).limit(3),
    supabase.from("external_reports").select("institution, title, summary, url").order("published_date", { ascending: false }).limit(2),
  ]);

  const avgSentiment = sentiment && sentiment.length > 0
    ? Math.round(sentiment.reduce((acc, s) => acc + (s.sentiment_score ?? 50), 0) / sentiment.length)
    : 62;

  return { news: news ?? [], sentiment: sentiment ?? [], auctions: auctions ?? [], reports: reports ?? [], avgSentiment };
}

// ── AI 매거진 편집 ────────────────────────────────────────────────────────────
async function composeMagazineBriefing(
  brokerName: string,
  regions: string[],
  assets: string[],
  newsItems: any[],
  avgSentiment: number,
  dealCount: number,
): Promise<{ headline: string; briefing: string; keyStats: { label: string; value: string; accent: string }[] }> {
  const newsText = newsItems.slice(0, 4).map(n => \`[\${n.source}] \${n.title}: \${n.summary}\`).join("\\n");
  const regionLabel = regions[0] ?? "강남·성수";
  const sentimentLabel = avgSentiment >= 70 ? "과열 주의" : avgSentiment >= 55 ? "탐욕 우세" : avgSentiment >= 40 ? "중립 관망" : "공포 저점";

  try {
    const res = await callLLM({
      systemPrompt: \`당신은 꼬마빌딩 전문 부동산 매거진 에디터입니다. 
브로커 \${brokerName} (전문: \${regionLabel} \${assets[0] ?? "꼬마빌딩"})를 위한 
오늘의 개인화 CRE 데일리 매거진 브리핑을 작성하세요.

형식 규칙:
- 제목(헤드라인): 15-25자, 오늘 시장의 핵심 한 문장
- 본문: 3-4 단락, 각 단락 2-3줄
- 단락 시작에 이모지 섹션 헤딩 사용 (🏢 시장 동향 / 📊 핵심 수치 / ⚡ 오늘의 기회 / 📍 \${regionLabel} 포커스)
- **굵은 글씨**로 핵심 수치 강조
- 브로커의 전문 권역과 자산유형에 맞게 개인화
- 톤: 전문적이되 읽기 쉬운 매거진 문체\`,
      userPrompt: \`오늘 뉴스: \${newsText}\\n\\n투자자 심리: \${avgSentiment}/100 (\${sentimentLabel})\\n브로커 활성 매물: \${dealCount}건\\n\\n헤드라인과 본문을 JSON으로 반환: {"headline": "...", "briefing": "..."}\`,
      model: "gpt-5.4",
      temperature: 0.7,
      maxTokens: 600,
    });

    const parsed = JSON.parse(res.content.trim().replace(/^```json\\n?|\\n?```$/g, "")|.replace(/^```json\\n?|\\n?```$/g, ""));
    const headline = parsed.headline || \`\${regionLabel} 시장, 오늘 주목할 변화\`;
    const briefing = parsed.briefing || res.content;

    const keyStats = [
      { label: "투자자 심리", value: \`\${avgSentiment}/100\`, accent: avgSentiment >= 60 ? "emerald" : avgSentiment >= 40 ? "amber" : "rose" },
      { label: "활성 매물", value: \`\${dealCount}건\`, accent: "indigo" },
      { label: "시장 상태", value: sentimentLabel, accent: "slate" },
    ];

    return { headline, briefing, keyStats };
  } catch {
    return {
      headline: \`\${regionLabel} 시장, 오늘 주목할 변화\`,
      briefing: newsItems.slice(0, 2).map(n => \`🏢 \${n.title}\\n\${n.summary}\`).join("\\n\\n"),
      keyStats: [
        { label: "투자자 심리", value: \`\${avgSentiment}/100\`, accent: "emerald" },
        { label: "활성 매물", value: \`\${dealCount}건\`, accent: "indigo" },
        { label: "시장 상태", value: sentimentLabel, accent: "slate" },
      ],
    };
  }
}

// ── DEMO 브로커 폴백 프로필 ───────────────────────────────────────────────────
const DEMO_PROFILES: Record<string, any> = {
  demo: {
    profile: { id: "demo", display_name: "김철수 대표", company: "JS 부동산", phone: "010-1234-5678", photo_url: null, tagline: "성수·강남 꼬마빌딩 10년 전문가" },
    broker: { specialty_regions: ["성수동", "강남 GBD"], specialty_assets: ["꼬마빌딩", "근생"], bio: "10년 경력의 꼬마빌딩 전문 중개인입니다.", total_deal_count_self: 47, deal_size_range: "30억~150억" },
    activeDealCount: 3,
  },
};

// ── 메인 GET 핸들러 ───────────────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ brokerId: string }> },
) {
  const { brokerId } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createServiceClient();

  // 1. 캐시 확인
  const cached = await getCachedMagazine(supabase, brokerId, today);
  if (cached) {
    return NextResponse.json({ data: cached.content, cached: true });
  }

  // 2. 브로커 프로필
  let brokerData = await getBrokerProfile(supabase, brokerId);
  if (!brokerData && DEMO_PROFILES[brokerId]) {
    brokerData = DEMO_PROFILES[brokerId];
  }
  if (!brokerData) {
    return NextResponse.json({ error: "Broker not found" }, { status: 404 });
  }

  const region = BROKER_REGION_MAP[brokerId] ?? brokerData.broker.specialty_regions?.[0]?.toLowerCase() ?? "seongsu";

  // 3. 데이터 병렬 수집
  const [deals, marketData] = await Promise.all([
    getActiveDeals(supabase, brokerId),
    getMarketIntelligence(supabase, region),
  ]);

  // 4. AI 편집
  const { headline, briefing, keyStats } = await composeMagazineBriefing(
    brokerData.profile.display_name ?? "브로커",
    brokerData.broker.specialty_regions ?? [],
    brokerData.broker.specialty_assets ?? [],
    marketData.news,
    marketData.avgSentiment,
    brokerData.activeDealCount,
  );

  // 5. 매거진 데이터 조합
  const magazineData = {
    issueDate: today,
    brokerId,
    brokerSlug: brokerId,

    // 브로커 프로필 (바이브카드 데이터)
    broker: {
      name: brokerData.profile.display_name ?? "",
      company: brokerData.profile.company ?? "",
      phone: brokerData.profile.phone ?? "",
      photoUrl: brokerData.profile.photo_url ?? null,
      tagline: brokerData.profile.tagline ?? brokerData.broker.bio ?? "",
      specialtyRegions: brokerData.broker.specialty_regions ?? [],
      specialtyAssets: brokerData.broker.specialty_assets ?? [],
      careerSummary: brokerData.broker.deal_size_range ?? "",
      totalDeals: brokerData.broker.total_deal_count_self ?? 0,
      activeDeals: brokerData.activeDealCount,
    },

    // AI 편집 브리핑
    headline,
    briefing,
    keyStats,

    // 시장 데이터
    topNews: marketData.news.slice(0, 4).map(n => ({
      title: n.title, summary: n.summary, source: n.source, sentiment: n.sentiment,
    })),
    sentiment: {
      score: marketData.avgSentiment,
      status: marketData.avgSentiment >= 70 ? "과열 주의" : marketData.avgSentiment >= 55 ? "탐욕 우세" : marketData.avgSentiment >= 40 ? "중립 관망" : "공포 저점",
      items: marketData.sentiment,
    },

    // 경매 픽
    auctionPicks: marketData.auctions.slice(0, 2).map(a => ({
      address: a.address, status: a.status, auctionDate: a.auction_date,
      minimumBid: a.minimum_bid, appraisedValue: a.appraised_value,
      discountPct: a.appraised_value > 0
        ? Math.round((1 - a.minimum_bid / a.appraised_value) * 100) : 0,
    })),

    // 활성 딜카드 하이라이트
    dealHighlights: deals.slice(0, 3).map(d => ({
      id: d.id, address: d.address, areaSignal: d.area_signal,
      assetType: d.asset_type, price: d.price,
      photoUrl: (d.photo_urls as string[] | null)?.[0] ?? null,
      buyerInterestCount: d.buyer_interest_count ?? 0,
    })),

    // 글로벌 리포트
    reports: marketData.reports.map(r => ({
      institution: r.institution, title: r.title, summary: r.summary, url: r.url,
    })),
  };

  // 6. DB 캐싱 (magazine_issues 테이블이 있을 때)
  try {
    await supabase.from("magazine_issues").upsert({
      broker_id: brokerId,
      issue_date: today,
      content: magazineData,
    }, { onConflict: "broker_id,issue_date" });
  } catch { /* 테이블 없으면 skip */ }

  return NextResponse.json({ data: magazineData, cached: false });
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// FILE 2: Magazine Page (Server Component)
// src/app/(public)/magazine/[brokerId]/[date]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
const magazinePageDir = path.join(root, 'src/app/(public)/magazine/[brokerId]/[date]');
fs.mkdirSync(magazinePageDir, { recursive: true });

const magazinePage = `import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { MagazineView } from "./magazine-view";

interface PageProps {
  params: Promise<{ brokerId: string; date: string }>;
}

async function getMagazineData(brokerId: string, date: string) {
  try {
    const supabase = createServiceClient();

    // 캐시 확인
    const { data: cached } = await supabase
      .from("magazine_issues")
      .select("content")
      .eq("broker_id", brokerId)
      .eq("issue_date", date)
      .maybeSingle();

    if (cached?.content) return cached.content as Record<string, any>;

    // 실시간 생성
    const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
    const res = await fetch(\`\${BASE}/api/magazine/\${brokerId}\`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId, date } = await params;
  const data = await getMagazineData(brokerId, date);

  if (!data) return { title: "CRE 데일리 매거진 | DealCard" };

  const broker = data.broker as any;
  const title = \`[\${date}] \${broker.name}의 CRE 데일리 매거진 | \${broker.specialtyRegions?.[0] ?? ""} 꼬마빌딩\`;
  const description = data.headline ?? \`\${broker.name} 중개사의 오늘 꼬마빌딩 시장 AI 맞춤 브리핑\`;
  const ogImageUrl = \`/api/og/magazine/\${brokerId}?date=\${date}\`;

  return {
    title,
    description,
    keywords: [
      "꼬마빌딩 매거진",
      "CRE 데일리",
      "부동산 시장 브리핑",
      broker.name,
      ...(broker.specialtyRegions ?? []),
      "DealCard",
    ],
    openGraph: {
      title,
      description,
      type: "article",
      url: \`https://dealcard.kr/magazine/\${brokerId}/\${date}\`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      publishedTime: date,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export const revalidate = 1800; // 30분 ISR

export default async function MagazinePage({ params }: PageProps) {
  const { brokerId, date } = await params;
  const data = await getMagazineData(brokerId, date);

  if (!data) return notFound();

  return <MagazineView data={data} brokerId={brokerId} date={date} />;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// FILE 3: OG Image Route
// src/app/api/og/magazine/route.tsx
// ─────────────────────────────────────────────────────────────────────────────
const ogMagazine = `import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brokerId = searchParams.get("brokerId") ?? searchParams.get("id") ?? "demo";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  // 매거진 데이터 fetch
  let data: any = null;
  try {
    const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
    const res = await fetch(\`\${BASE}/api/magazine/\${brokerId}\`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      data = json.data;
    }
  } catch { }

  const broker = data?.broker ?? {
    name: "CRE 전문 중개사",
    company: "JS 부동산",
    specialtyRegions: ["성수동", "강남 GBD"],
    photoUrl: null,
    totalDeals: 47,
    activeDeals: 3,
  };

  const headline = data?.headline ?? "\uc624\ub298\uc758 \uaf2c\ub9c8\ube4c\ub529 \uc2dc\uc7a5 \uc778\ud154\ub9ac\uc804\uc2a4";
  const keyStats = data?.keyStats ?? [
    { label: "\ud22c\uc790\uc790 \uc2ec\ub9ac", value: "62/100", accent: "emerald" },
    { label: "\ud65c\uc131 \ub9e4\ubb3c", value: "3\uac74", accent: "indigo" },
    { label: "\uc2dc\uc7a5 \uc0c1\ud0dc", value: "\ud0d0\uc695 \uc6b0\uc138", accent: "slate" },
  ];

  const [y, m, d] = date.split("-");
  const dateLabel = \`\${y}.\${m}.\${d}\`;
  const weekdays = ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"];
  const weekday = weekdays[new Date(date).getDay()];

  const accentColors: Record<string, string> = {
    emerald: "#10b981", indigo: "#6366f1", rose: "#f43f5e", amber: "#f59e0b", slate: "#94a3b8",
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 배경 글로우 */}
        <div style={{
          position: "absolute", top: "-100px", left: "200px",
          width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.25), transparent)",
          filter: "blur(60px)",
        }} />
        <div style={{
          position: "absolute", bottom: "-80px", right: "200px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.2), transparent)",
          filter: "blur(60px)",
        }} />

        {/* 좌측 패널 */}
        <div style={{
          width: "420px", height: "100%", padding: "50px 40px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}>
          {/* 상단: 브랜드 + 날짜 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              marginBottom: "8px",
            }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              }} />
              <span style={{ color: "#6366f1", fontSize: "11px", fontWeight: 700, letterSpacing: "2px" }}>
                CRE DAILY MAGAZINE
              </span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              {dateLabel} {weekday}
            </div>
          </div>

          {/* 중앙: 브로커 정보 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* 아바타 */}
            <div style={{
              width: "64px", height: "64px", borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid rgba(99,102,241,0.4)",
            }}>
              <span style={{ color: "white", fontSize: "24px", fontWeight: 800 }}>
                {(broker.name ?? "B").charAt(0)}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ color: "white", fontSize: "22px", fontWeight: 800 }}>{broker.name}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>{broker.company}</div>
              <div style={{
                marginTop: "4px",
                display: "flex", gap: "6px", flexWrap: "wrap",
              }}>
                {(broker.specialtyRegions ?? []).slice(0, 2).map((r: string, i: number) => (
                  <div key={i} style={{
                    background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                    color: "#a5b4fc", fontSize: "11px", fontWeight: 700,
                    padding: "3px 10px", borderRadius: "20px",
                  }}>{r}</div>
                ))}
              </div>
            </div>
          </div>

          {/* 하단: 통계 */}
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>\ub204\uc801 \uac70\ub798</span>
              <span style={{ color: "white", fontSize: "18px", fontWeight: 800 }}>{broker.totalDeals}\uac74</span>
            </div>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>\ud65c\uc131 \ub9e4\ubb3c</span>
              <span style={{ color: "#10b981", fontSize: "18px", fontWeight: 800 }}>{broker.activeDeals}\uac74</span>
            </div>
          </div>
        </div>

        {/* 우측 패널 */}
        <div style={{
          flex: 1, padding: "44px 48px 44px 44px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}>
          {/* 헤드라인 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
              padding: "5px 12px", borderRadius: "20px", width: "fit-content",
            }}>
              <span style={{ color: "#a5b4fc", fontSize: "10px", fontWeight: 700, letterSpacing: "1px" }}>
                \u2728 AI \uac1c\uc778\ud654 \ube0c\ub9ac\ud551
              </span>
            </div>
            <div style={{
              color: "white", fontSize: "22px", fontWeight: 800,
              lineHeight: 1.35, letterSpacing: "-0.5px",
            }}>
              {headline}
            </div>
          </div>

          {/* 핵심 수치 카드 3개 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
            {keyStats.map((stat: any, i: number) => {
              const accentColor = accentColors[stat.accent] ?? "#6366f1";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(255,255,255,0.04)", border: \`1px solid rgba(255,255,255,0.08)\`,
                  borderLeft: \`3px solid \${accentColor}\`,
                  borderRadius: "12px", padding: "14px 18px",
                }}>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>{stat.label}</span>
                  <span style={{ color: accentColor, fontSize: "18px", fontWeight: 800 }}>{stat.value}</span>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "16px", padding: "14px 20px",
          }}>
            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>
              \uc624\ub298\uc758 AI \ub9de\uc2a4\ud2b8 \ube0c\ub9ac\ud551 \ubcf4\uae30 \u2192
            </span>
            <span style={{
              color: "white", fontSize: "11px", fontWeight: 700,
              background: "rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: "8px",
            }}>DealCard</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// FILE 4: Magazine View Component
// src/app/(public)/magazine/[brokerId]/[date]/magazine-view.tsx
// ─────────────────────────────────────────────────────────────────────────────
const magazineView = `"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, useInView } from "motion/react";
import {
  Phone, Share2, Copy, Check, Building2, Hammer, TrendingUp,
  Flame, BookOpen, ArrowRight, ChevronRight, BarChart2, Sparkles,
  Globe, Newspaper,
} from "lucide-react";

interface MagazineViewProps {
  data: any;
  brokerId: string;
  date: string;
}

// ── 유틸 ───────────────────────────────────────────────────────────────────────
function fmt(price: number): string {
  if (!price) return "-";
  if (price >= 100000000) return \`\${(price / 100000000).toFixed(1)}\uc5b5\`;
  if (price >= 10000) return \`\${(price / 10000).toFixed(0)}\ub9cc\`;
  return price.toLocaleString();
}

// ── 섹션 래퍼 (Intersection Observer 진입 애니메이션) ─────────────────────────
function Section({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

// ── AI 브리핑 리치 파서 ────────────────────────────────────────────────────────
function RichBriefing({ text }: { text: string }) {
  const paras = text.split(/\\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3.5">
      {paras.map((para, i) => {
        const isHeading = /^[\\u{1F300}-\\u{1FFFF}\\u2600-\\u27FF]|^\\*\\*.*\\*\\*$/u.test(para);
        const html = para
          .replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="text-white font-bold">$1</strong>')
          .replace(/(\\d[\\d,.]+%)/g, '<span class="text-indigo-300 font-bold font-mono">$1</span>')
          .replace(/(\\d[\\d,.]+\uc5b5)/g, '<span class="text-emerald-300 font-bold">$1</span>');

        if (isHeading) return (
          <p key={i} className="text-[14px] font-extrabold text-white tracking-tight leading-snug pt-1"
             dangerouslySetInnerHTML={{ __html: html }} />
        );
        return (
          <p key={i} className="text-[13px] text-slate-300 leading-relaxed"
             dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </div>
  );
}

// ── 감성 지수 색상 ──────────────────────────────────────────────────────────────
function sentimentColor(score: number) {
  if (score >= 70) return { bar: "from-orange-500 to-rose-500", text: "text-rose-400" };
  if (score >= 50) return { bar: "from-emerald-500 to-teal-400", text: "text-emerald-400" };
  return { bar: "from-blue-600 to-cyan-400", text: "text-blue-400" };
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────────
export function MagazineView({ data, brokerId, date }: MagazineViewProps) {
  const [copied, setCopied] = useState(false);
  const broker = data.broker ?? {};
  const [y, m, d] = date.split("-");
  const dateLabel = \`\${y}년 \${m}월 \${d}일\`;
  const weekdays = ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"];
  const weekday = weekdays[new Date(date).getDay()];
  const sentiment = data.sentiment ?? { score: 62, status: "\ud0d0\uc695 \uc6b0\uc138" };
  const sc = sentimentColor(sentiment.score);

  const shareUrl = typeof window !== "undefined"
    ? \`\${window.location.origin}/magazine/\${brokerId}/\${date}\`
    : \`/magazine/\${brokerId}/\${date}\`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: \`[\${broker.name}] CRE \ub370\uc77c\ub9ac \ub9e4\uac70\uc9c4 \${dateLabel}\`,
          text: data.headline ?? "\uc624\ub298\uc758 \uaf2c\ub9c8\ube4c\ub529 \uc2dc\uc7a5 AI \uc778\ud154\ub9ac\uc804\uc2a4",
          url: shareUrl,
        });
        return;
      } catch { }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCallBroker = () => {
    if (broker.phone) window.location.href = \`tel:\${broker.phone.replace(/[^0-9]/g, "")}\`;
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)" }}
    >
      <div className="max-w-[440px] mx-auto px-4 pb-28">

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <div
          className="relative pt-10 pb-8 px-1"
          style={{
            background: "linear-gradient(160deg, rgba(99,102,241,0.15) 0%, transparent 60%)",
          }}
        >
          {/* 배경 글로우 */}
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20"
               style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />

          {/* 브로커 미니 뱃지 */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500/40 flex items-center justify-center shrink-0"
                 style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <span className="text-white font-extrabold text-base">{(broker.name ?? "B").charAt(0)}</span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-white">{broker.name}</p>
              <p className="text-[10px] text-slate-500">{broker.company}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-1 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
              <span className="text-[9px] font-bold text-indigo-300">AI \uac1c\uc778\ud654</span>
            </div>
          </motion.div>

          {/* 날짜 + 제목 */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <p className="text-[12px] text-slate-500 mb-1.5">{dateLabel} {weekday}요일</p>
            <h1 className="text-[26px] font-extrabold text-white leading-tight tracking-tight mb-2">
              CRE \ub370\uc77c\ub9ac 매거진
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(broker.specialtyRegions ?? []).map((r: string, i: number) => (
                <span key={i} className="text-[10px] font-bold text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                  {r}
                </span>
              ))}
            </div>
          </motion.div>

          {/* 핵심 수치 3개 */}
          {data.keyStats && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="mt-6 grid grid-cols-3 gap-2">
              {data.keyStats.map((stat: any, i: number) => {
                const accentClasses: Record<string, string> = {
                  emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",
                  indigo:  "text-indigo-400 border-indigo-500/20 bg-indigo-500/8",
                  rose:    "text-rose-400 border-rose-500/20 bg-rose-500/8",
                  amber:   "text-amber-400 border-amber-500/20 bg-amber-500/8",
                  slate:   "text-slate-400 border-slate-500/20 bg-slate-500/8",
                };
                const cls = accentClasses[stat.accent] ?? "text-slate-400 border-white/10 bg-white/4";
                return (
                  <div key={i} className={\`border rounded-xl p-2.5 text-center \${cls}\`}>
                    <div className="text-[15px] font-extrabold leading-none mb-1">{stat.value}</div>
                    <div className="text-[9px] opacity-70">{stat.label}</div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </div>

        <div className="space-y-5">

          {/* ── SECTION 1: AI 브리핑 ────────────────────────────────────────── */}
          <Section delay={0.05}>
            <div className="rounded-2xl border border-indigo-500/15 overflow-hidden"
                 style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(15,15,35,0.8) 100%)" }}>
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-300">AI 마켓 에디터 브리핑</span>
              </div>
              {data.headline && (
                <div className="px-4 pt-4 pb-0">
                  <h2 className="text-[16px] font-extrabold text-white leading-snug">
                    {data.headline}
                  </h2>
                </div>
              )}
              <div className="p-4">
                <RichBriefing text={data.briefing ?? ""} />
              </div>
            </div>
          </Section>

          {/* ── SECTION 2: 내 딜카드 하이라이트 (가로 스크롤) ──────────────── */}
          {data.dealHighlights && data.dealHighlights.length > 0 && (
            <Section delay={0.1}>
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-rose-400" />
                  <h3 className="text-[12px] font-bold text-white">\uad00\ub9ac \ub9e4\ubb3c \ud558\uc774\ub77c\uc774\ud2b8</h3>
                  <span className="ml-auto text-[10px] font-bold text-rose-300 bg-rose-500/12 border border-rose-500/20 px-2 py-0.5 rounded-full">
                    \ud65c\uc131 {data.dealHighlights.length}\uac74
                  </span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
                  {data.dealHighlights.map((deal: any, i: number) => (
                    <div key={i}
                      className="shrink-0 w-[200px] snap-start rounded-2xl border border-white/8 overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.03)" }}>
                      {/* 이미지 영역 */}
                      <div className="w-full h-[110px] relative"
                           style={{ background: deal.photoUrl ? \`url('\${deal.photoUrl}') center/cover\` : "linear-gradient(135deg, #1e1b4b, #312e81)" }}>
                        {!deal.photoUrl && (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="w-8 h-8 text-indigo-400/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-end">
                          <span className="text-[10px] font-bold text-white/80 bg-black/40 px-1.5 py-0.5 rounded-lg">{deal.areaSignal}</span>
                          {deal.buyerInterestCount > 0 && (
                            <span className="text-[9px] font-bold text-rose-300 bg-rose-500/25 border border-rose-500/30 px-1.5 py-0.5 rounded-lg">
                              \uad00\uc2ec {deal.buyerInterestCount}\uba85
                            </span>
                          )}
                        </div>
                      </div>
                      {/* 정보 */}
                      <div className="p-2.5">
                        <p className="text-[11px] font-bold text-white line-clamp-1 mb-0.5">{deal.assetType}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">{deal.address}</p>
                        <p className="text-[13px] font-extrabold text-indigo-300">{fmt(deal.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* ── SECTION 3: 투자자 심리 게이지 ──────────────────────────────── */}
          <Section delay={0.15}>
            <div className="rounded-2xl border border-white/8 p-4"
                 style={{ background: "rgba(255,255,255,0.025)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🌡️</span>
                  <h3 className="text-[12px] font-bold text-white">CRE \ud22c\uc790\uc790 \uc2ec\ub9ac \uc9c0\uc218</h3>
                </div>
                <span className={\`text-[11px] font-bold \${sc.text}\`}>{sentiment.status}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">Fear &amp; Greed</span>
                  <span className="text-[18px] font-extrabold text-white">{sentiment.score}
                    <span className="text-[12px] font-normal text-slate-500">/100</span>
                  </span>
                </div>
                <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: \`\${sentiment.score}%\` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className={\`h-full rounded-full bg-gradient-to-r \${sc.bar}\`} />
                  <motion.div initial={{ left: 0 }} animate={{ left: \`calc(\${sentiment.score}% - 4px)\` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white rounded-full shadow-lg shadow-white/30" />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600">
                  <span>극단 공포</span><span>중립 50</span><span>극단 탐욕</span>
                </div>
              </div>
            </div>
          </Section>

          {/* ── SECTION 4: 뉴스 피드 ─────────────────────────────────────────── */}
          {data.topNews && data.topNews.length > 0 && (
            <Section delay={0.2}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Newspaper className="w-3.5 h-3.5 text-slate-400" />
                  <h3 className="text-[12px] font-bold text-white">\uc624\ub298\uc758 CRE \ub274\uc2a4</h3>
                </div>
                {data.topNews.slice(0, 4).map((n: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/6"
                       style={{ background: "rgba(255,255,255,0.025)" }}>
                    <div className={\`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 \${
                      n.sentiment === "bullish" ? "bg-emerald-400" :
                      n.sentiment === "bearish" ? "bg-rose-400" : "bg-slate-400"
                    }\`} />
                    <div>
                      <p className="text-[11px] font-bold text-white leading-snug mb-0.5 line-clamp-2">{n.title?.replace(/^\\[.*?\\]\\s*/, "")}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{n.summary}</p>
                      <p className="text-[9px] text-slate-600 mt-0.5">{n.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── SECTION 5: 경매 픽 ───────────────────────────────────────────── */}
          {data.auctionPicks && data.auctionPicks.length > 0 && (
            <Section delay={0.25}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-[12px] font-bold text-white">이 주의 경매 픽</h3>
                  <span className="ml-auto text-[9px] font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-2 py-0.5 rounded-full">NPL \uc18c\uc2f1</span>
                </div>
                {data.auctionPicks.map((a: any, i: number) => (
                  <div key={i} className="rounded-xl border border-amber-500/12 p-3.5"
                       style={{ background: "rgba(245,158,11,0.04)" }}>
                    <div className="flex justify-between items-start mb-1.5">
                      <p className="text-[12px] font-bold text-white flex-1 mr-2 leading-snug">{a.address}</p>
                      {a.discountPct > 0 && (
                        <span className="text-[10px] font-extrabold text-rose-300 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-lg shrink-0">
                          -{a.discountPct}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span>\ucd5c\uc800\uc785\uc2e4\uac00 {fmt(a.minimumBid)}</span>
                      <span>·</span>
                      <span className="text-amber-400 font-bold">{a.auctionDate}</span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── SECTION 6: 바이브카드 미니 (브로커 프로필) ──────────────────── */}
          <Section delay={0.3}>
            <div className="rounded-2xl overflow-hidden border border-white/8"
                 style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(15,15,35,0.9))" }}>
              <div className="p-4">
                <p className="text-[10px] font-bold text-indigo-400 mb-3 tracking-wider">BROKER PROFILE</p>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 flex items-center justify-center shrink-0"
                       style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    <span className="text-white font-extrabold text-lg">{(broker.name ?? "B").charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-extrabold text-white">{broker.name}</p>
                    <p className="text-[11px] text-slate-400">{broker.company}</p>
                    {broker.tagline && (
                      <p className="text-[11px] text-slate-500 mt-0.5 italic">"{broker.tagline}"</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: "\ub204\uc801 \uac70\ub798", value: \`\${broker.totalDeals}\uac74\`, color: "text-indigo-300" },
                    { label: "\ud65c\uc131 \ub9e4\ubb3c", value: \`\${broker.activeDeals}\uac74\`, color: "text-emerald-300" },
                    { label: "\uc804\ubb38 \uc790\uc0b0", value: broker.specialtyAssets?.[0] ?? "\uaf2c\ub9c8\ube4c\ub529", color: "text-amber-300" },
                  ].map((s, i) => (
                    <div key={i} className="text-center bg-white/4 border border-white/8 rounded-xl py-2">
                      <p className={\`text-[14px] font-extrabold \${s.color}\`}>{s.value}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {broker.phone && (
                  <button onClick={handleCallBroker}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                    <Phone className="w-4 h-4" />
                    {broker.phone} \uc0c1\ub2f4\ud558\uae30
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* ── SECTION 7: 글로벌 리포트 ─────────────────────────────────────── */}
          {data.reports && data.reports.length > 0 && (
            <Section delay={0.35}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <h3 className="text-[12px] font-bold text-white">\uc804\ubb38 \ub9ac\uc11c\uce58 \ub9ac\ud3ec\ud2b8</h3>
                </div>
                {data.reports.map((r: any, i: number) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer"
                     className="group flex items-start gap-3 p-3.5 rounded-xl border border-white/6 hover:border-indigo-500/25 transition-all duration-300"
                     style={{ background: "rgba(255,255,255,0.02)" }}>
                    <BookOpen className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-indigo-400 mb-0.5">{r.institution}</p>
                      <p className="text-[11px] font-bold text-white line-clamp-1">{r.title}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">{r.summary}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
                  </a>
                ))}
              </div>
            </Section>
          )}

        </div>{/* /space-y-5 */}
      </div>{/* /container */}

      {/* ── 고정 하단 공유 바 ─────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{ background: "linear-gradient(to top, rgba(8,8,20,0.98) 0%, rgba(8,8,20,0.9) 70%, transparent 100%)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-[440px] mx-auto flex gap-3">
          {/* 카카오톡 공유 (전화번호 CTA) */}
          {broker.phone && (
            <button onClick={handleCallBroker}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }}>
              <Phone className="w-4 h-4" />
              {broker.phone} \uc0c1\ub2f4
            </button>
          )}
          {/* 공유 버튼 */}
          <button onClick={handleShare}
            className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-2xl border border-white/15 font-bold text-[12px] text-white transition-all duration-300 active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            {copied
              ? <><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">\ubcf5\uc0ac\ub428</span></>
              : <><Share2 className="w-4 h-4" /><span>\uacf5\uc720</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
`;

// WRITE ALL
const files = [
  { dir: magazineApiDir, name: 'route.ts', content: magazineApi },
  { dir: magazinePageDir, name: 'page.tsx', content: magazinePage },
  { dir: path.join(root, 'src/app/api/og/magazine'), name: 'route.tsx', content: ogMagazine },
  { dir: magazinePageDir, name: 'magazine-view.tsx', content: magazineView },
];

for (const { dir, name, content } of files) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Written:', path.relative(root, filePath));
}
console.log('\nAll magazine files written successfully!');
