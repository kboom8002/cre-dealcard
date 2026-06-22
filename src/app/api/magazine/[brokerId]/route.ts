import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROKER_REGION_MAP: Record<string, string> = {
  demo: "seongsu",
  "hong-gildong": "seongsu",
  "kim-chulsoo": "gbd",
  "lee-younghee": "ybd",
  "hong-gildong-demo": "gbd", // Add testuser slug
};

const DEMO_PROFILES: Record<string, any> = {
  demo: {
    profile: {
      id: "demo",
      display_name: "김철수 대표",
      company: "JS 부동산",
      phone: "010-1234-5678",
      photo_url: null,
      tagline: "성수·강남 꼬마빌딩 10년 전문가",
    },
    broker: {
      specialty_regions: ["성수동", "강남 GBD"],
      specialty_assets: ["꼬마빌딩", "근생"],
      bio: "10년 경력의 꼬마빌딩 전문 중개인입니다.",
      total_deal_count_self: 47,
      deal_size_range: "30억~150억",
    },
    activeDealCount: 3,
  },
  "hong-gildong-demo": {
    profile: {
      id: "hong-gildong-demo",
      display_name: "testuser",
      company: "CRE DealCard",
      phone: "010-1234-5678",
      photo_url: null,
      tagline: "강남·서초 꼬마빌딩 전문 중개인",
    },
    broker: {
      specialty_regions: ["강남구 GBD", "서초구 GBD"],
      specialty_assets: ["꼬마빌딩", "근생"],
      bio: "강남·서초 권역 상업용 부동산 전문 중개인입니다.",
      total_deal_count_self: 12,
      deal_size_range: "20억~100억",
    },
    activeDealCount: 2,
  },
};

async function getCachedMagazine(supabase: any, brokerId: string, date: string) {
  try {
    const { data } = await supabase
      .from("magazine_issues")
      .select("content")
      .eq("broker_id", brokerId)
      .eq("issue_date", date)
      .maybeSingle();
    return data?.content ?? null;
  } catch {
    return null;
  }
}

async function getBrokerProfile(supabase: any, brokerId: string) {
  try {
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select(
        "user_id, specialty_regions, specialty_assets, bio, total_deal_count_self, deal_size_range"
      )
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
  } catch {
    return null;
  }
}

async function getActiveDeals(supabase: any, brokerId: string) {
  try {
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("user_id")
      .eq("slug", brokerId)
      .maybeSingle();

    if (!bp?.user_id) return [];

    const { data } = await supabase
      .from("building_ssot_lite")
      .select(
        "id, address, area_signal, asset_type, price, status, photo_urls, buyer_interest_count"
      )
      .eq("owner_id", bp.user_id)
      .in("status", ["public_signal_ready", "active"])
      .order("updated_at", { ascending: false })
      .limit(5);

    return data ?? [];
  } catch {
    return [];
  }
}

async function getMarketIntelligence(supabase: any, region: string) {
  const [{ data: news }, { data: sentiment }, { data: auctions }, { data: reports }, { data: realTxs }, { data: rentalTrend }, { data: commercialDistrict }] =
    await Promise.all([
      supabase
        .from("external_news")
        .select("id, title, summary, source, sentiment, importance_score, topic")
        .order("importance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("social_sentiment")
        .select("keyword, sentiment_score, mention_count, analysis_date")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("auction_listings")
        .select(
          "case_number, address, minimum_bid, appraised_value, status, auction_date"
        )
        .order("auction_date", { ascending: true })
        .limit(3),
      supabase
        .from("external_reports")
        .select("institution, title, summary, url")
        .order("published_date", { ascending: false })
        .limit(2),
      // 실거래 데이터
      supabase
        .from("external_transactions")
        .select("address, dong, transaction_price, usage_type, building_area, transaction_date")
        .order("transaction_date", { ascending: false })
        .limit(5),
      // 임대 동향
      supabase
        .from("rental_trend_data")
        .select("region, quarter, vacancy_rate, rental_index")
        .eq("region", region)
        .order("quarter", { ascending: false })
        .limit(1),
      // 상권 분석
      supabase
        .from("commercial_district")
        .select("district_name, sales_volume_index, footfall_index")
        .maybeSingle(),
    ]);

  const avgSentiment =
    sentiment && sentiment.length > 0
      ? Math.round(
          sentiment.reduce(
            (acc: number, s: any) => acc + (s.sentiment_score ?? 50),
            0
          ) / sentiment.length
        )
      : 62;

  return {
    news: news ?? [],
    sentiment: sentiment ?? [],
    auctions: auctions ?? [],
    reports: reports ?? [],
    realTxs: realTxs ?? [],
    rentalTrend: rentalTrend?.[0] ?? null,
    commercialDistrict: commercialDistrict ?? null,
    avgSentiment,
  };
}

async function composeMagazineBriefing(
  brokerName: string,
  regions: string[],
  assets: string[],
  newsItems: any[],
  avgSentiment: number,
  dealCount: number
): Promise<{
  headline: string;
  briefing: string;
  keyStats: { label: string; value: string; accent: string }[];
}> {
  const newsText = newsItems
    .slice(0, 4)
    .map((n: any) => `[${n.source}] ${n.title}: ${n.summary}`)
    .join("\n");
  const regionLabel = regions[0] ?? "강남·성수";
  const sentimentLabel =
    avgSentiment >= 70
      ? "과열 주의"
      : avgSentiment >= 55
      ? "탐욕 우세"
      : avgSentiment >= 40
      ? "중립 관망"
      : "공포 저점";

  try {
    const res = await callLLM({
      systemPrompt: `당신은 꼬마빌딩 전문 부동산 매거진 에디터입니다.
브로커 ${brokerName} (전문: ${regionLabel} ${assets[0] ?? "꼬마빌딩"})를 위한
오늘의 개인화 CRE 데일리 매거진 브리핑을 작성하세요.

■ 이 매거진은 브로커가 고객(투자자/자산관리자)에게 배포하는 콘텐츠입니다.
■ 독자는 꼬마빌딩·상업용 부동산에 관심 있는 전문 투자자입니다.

형식 규칙:
- 제목(헤드라인): 15-25자, 오늘 시장의 핵심 한 문장
- 본문: 3-4 단락, 각 단락 2-3줄
- 단락 시작에 이모지 섹션 헤딩 (활용: 🏢 시장 동향 / 📊 핵심 수치 / ⚡ 오늘의 기회 / 📍 ${regionLabel} 포커스)
- **굵은 글씨**로 핵심 수치 강조
- 브로커의 전문 권역과 자산유형에 맞게 개인화

톤앤매너 규칙:
- 전문적이면서도 읽기 쉬운 매거진 문체 (존댓말 사용)
- 과장하지 말고 데이터에 근거한 팩트 중심
- "~합니다", "~습니다" 존경체 사용 ("~임", "~함" 사용 금지)
- 고객이 신뢰할 수 있는 인사이트 제공
- 출처가 있는 뉴스의 경우 출처 명시
결과를 JSON으로 반환: {"headline": "...", "briefing": "..."}`,
      userPrompt: `오늘 뉴스:\n${newsText}\n\n투자자 심리: ${avgSentiment}/100 (${sentimentLabel})\n브로커 활성 매물: ${dealCount}건`,
      model: "gpt-5.4",
      temperature: 0.7,
      maxTokens: 600,
    });

    let parsed: any = null;
    try {
      const clean = res.content
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, "");
      parsed = JSON.parse(clean);
    } catch {
      // fallback
    }

    const headline =
      parsed?.headline ?? `${regionLabel} 시장, 오늘 주목할 변화`;
    const briefing = parsed?.briefing ?? res.content;
    const keyStats = [
      {
        label: "투자자 심리",
        value: `${avgSentiment}/100`,
        accent:
          avgSentiment >= 60
            ? "emerald"
            : avgSentiment >= 40
            ? "amber"
            : "rose",
      },
      { label: "활성 매물", value: `${dealCount}건`, accent: "indigo" },
      { label: "시장 상태", value: sentimentLabel, accent: "slate" },
    ];

    return { headline, briefing, keyStats };
  } catch {
    return {
      headline: `${regionLabel} 시장, 오늘 주목할 변화`,
      briefing: newsItems
        .slice(0, 2)
        .map((n: any) => `🏢 ${n.title}\n${n.summary}`)
        .join("\n\n"),
      keyStats: [
        { label: "투자자 심리", value: `${avgSentiment}/100`, accent: "emerald" },
        { label: "활성 매물", value: `${dealCount}건`, accent: "indigo" },
        { label: "시장 상태", value: sentimentLabel, accent: "slate" },
      ],
    };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brokerId: string }> }
) {
  const { brokerId } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createServiceClient();

  // 1. 캐시
  const cached = await getCachedMagazine(supabase, brokerId, today);
  if (cached) return NextResponse.json({ data: cached, cached: true });

  // 2. 브로커 프로필
  let brokerData = await getBrokerProfile(supabase, brokerId);
  if (!brokerData && DEMO_PROFILES[brokerId]) brokerData = DEMO_PROFILES[brokerId];
  if (!brokerData)
    return NextResponse.json({ error: "Broker not found" }, { status: 404 });

  const region =
    BROKER_REGION_MAP[brokerId] ??
    (brokerData.broker.specialty_regions?.[0] ?? "seongsu").toLowerCase();

  // 3. 병렬 수집
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
    brokerData.activeDealCount
  );

  // 5. 조합
  const magazineData = {
    issueDate: today,
    brokerId,
    broker: {
      name: brokerData.profile.display_name ?? "",
      company: brokerData.profile.company ?? "",
      phone: brokerData.profile.phone ?? "",
      photoUrl: brokerData.profile.photo_url ?? null,
      tagline: brokerData.profile.tagline ?? brokerData.broker.bio ?? "",
      specialtyRegions: brokerData.broker.specialty_regions ?? [],
      specialtyAssets: brokerData.broker.specialty_assets ?? [],
      totalDeals: brokerData.broker.total_deal_count_self ?? 0,
      activeDeals: brokerData.activeDealCount,
    },
    headline,
    briefing,
    keyStats,
    topNews: marketData.news.slice(0, 6).map((n: any) => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      source: n.source,
      sentiment: n.sentiment,
      topic: n.topic,
    })),
    sentiment: {
      score: marketData.avgSentiment,
      status:
        marketData.avgSentiment >= 70
          ? "과열 주의"
          : marketData.avgSentiment >= 55
          ? "탐욕 우세"
          : marketData.avgSentiment >= 40
          ? "중립 관망"
          : "공포 저점",
      items: marketData.sentiment,
    },
    auctionPicks: marketData.auctions.slice(0, 2).map((a: any) => ({
      address: a.address,
      status: a.status,
      auctionDate: a.auction_date,
      minimumBid: a.minimum_bid,
      appraisedValue: a.appraised_value,
      discountPct:
        a.appraised_value > 0
          ? Math.round((1 - a.minimum_bid / a.appraised_value) * 100)
          : 0,
    })),
    dealHighlights: deals.slice(0, 5).map((d: any) => ({
      id: d.id,
      address: d.address,
      areaSignal: d.area_signal,
      assetType: d.asset_type,
      price: d.price,
      photoUrl: (d.photo_urls as string[] | null)?.[0] ?? null,
      buyerInterestCount: d.buyer_interest_count ?? 0,
    })),
    reports: marketData.reports.map((r: any) => ({
      institution: r.institution,
      title: r.title,
      summary: r.summary,
      url: r.url,
    })),
    // 신규 데이터
    brokerComment: null,
    recentTransactions: marketData.realTxs.slice(0, 5).map((tx: any) => ({
      address: tx.address,
      dong: tx.dong,
      transaction_price: tx.transaction_price,
      usage_type: tx.usage_type,
      building_area: tx.building_area,
      transaction_date: tx.transaction_date,
    })),
    rentalTrend: marketData.rentalTrend,
    commercialDistrict: marketData.commercialDistrict,
    themeColor: "#6366f1",
  };

  // 6. 캐싱
  try {
    await supabase.from("magazine_issues").upsert(
      { broker_id: brokerId, issue_date: today, content: magazineData },
      { onConflict: "broker_id,issue_date" }
    );
  } catch { /* skip if table missing */ }

  return NextResponse.json({ data: magazineData, cached: false });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ brokerId: string }> }
) {
  try {
    const { brokerId } = await params;
    const body = await request.json();
    const today = body.issueDate || new Date().toISOString().slice(0, 10);
    const supabase = createServiceClient();

    await supabase.from("magazine_issues").upsert(
      { broker_id: brokerId, issue_date: today, content: body },
      { onConflict: "broker_id,issue_date" }
    );

    return NextResponse.json({ success: true, data: body });
  } catch (err: unknown) {
    console.error("[api/magazine/POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
