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
};

const DEMO_PROFILES: Record<string, any> = {
  demo: {
    profile: {
      id: "demo",
      display_name: "\uae40\ucca0\uc218 \ub300\ud45c",
      company: "JS \ubd80\ub3d9\uc0b0",
      phone: "010-1234-5678",
      photo_url: null,
      tagline: "\uc131\uc218\u00b7\uac15\ub0a8 \uaf2c\ub9c8\ube4c\ub529 10\ub144 \uc804\ubb38\uac00",
    },
    broker: {
      specialty_regions: ["\uc131\uc218\ub3d9", "\uac15\ub0a8 GBD"],
      specialty_assets: ["\uaf2c\ub9c8\ube4c\ub529", "\uadfc\uc0dd"],
      bio: "10\ub144 \uacbd\ub825\uc758 \uaf2c\ub9c8\ube4c\ub529 \uc804\ubb38 \uc911\uac1c\uc778\uc785\ub2c8\ub2e4.",
      total_deal_count_self: 47,
      deal_size_range: "30\uc5b5~150\uc5b5",
    },
    activeDealCount: 3,
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

async function getMarketIntelligence(supabase: any, _region: string) {
  const [{ data: news }, { data: sentiment }, { data: auctions }, { data: reports }] =
    await Promise.all([
      supabase
        .from("external_news")
        .select("title, summary, source, sentiment")
        .order("created_at", { ascending: false })
        .limit(5),
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
  const regionLabel = regions[0] ?? "\uac15\ub0a8\u00b7\uc131\uc218";
  const sentimentLabel =
    avgSentiment >= 70
      ? "\uacfc\uc5f4 \uc8fc\uc758"
      : avgSentiment >= 55
      ? "\ud0d0\uc695 \uc6b0\uc138"
      : avgSentiment >= 40
      ? "\uc911\ub9bd \uad00\ub9dd"
      : "\uacf5\ud3ec \uc800\uc810";

  try {
    const res = await callLLM({
      systemPrompt: `\ub2f9\uc2e0\uc740 \uaf2c\ub9c8\ube4c\ub529 \uc804\ubb38 \ubd80\ub3d9\uc0b0 \ub9e4\uac70\uc9c4 \uc5d0\ub514\ud130\uc785\ub2c8\ub2e4.
\ube0c\ub85c\ucee4 ${brokerName} (\uc804\ubb38: ${regionLabel} ${assets[0] ?? "\uaf2c\ub9c8\ube4c\ub529"})\ub97c \uc704\ud55c
\uc624\ub298\uc758 \uac1c\uc778\ud654 CRE \ub370\uc77c\ub9ac \ub9e4\uac70\uc9c4 \ube0c\ub9ac\ud551\uc744 \uc791\uc131\ud558\uc138\uc694.

\ud615\uc2dd \uaddc\uce59:
- \uc81c\ubaa9(\ud5e4\ub4dc\ub77c\uc778): 15-25\uc790, \uc624\ub298 \uc2dc\uc7a5\uc758 \ud575\uc2ec \ud55c \ubb38\uc7a5
- \ubcf8\ubb38: 3-4 \ub2e8\ub77d, \uac01 \ub2e8\ub77d 2-3\uc904
- \ub2e8\ub77d \uc2dc\uc791\uc5d0 \uc774\ubaa8\uc9c0 \uc139\uc158 \ud5e4\ub529 (\ud65c\uc6a9: \uD83C\uDFE2 \uc2dc\uc7a5 \ub3d9\ud5a5 / \uD83D\uDCCA \ud575\uc2ec \uc218\uce58 / \u26A1 \uc624\ub298\uc758 \uae30\ud68c / \uD83D\uDCCD ${regionLabel} \ud3ec\ucee4\uc2a4)
- **\uad75\uc740 \uae00\uc528**\ub85c \ud575\uc2ec \uc218\uce58 \uac15\uc870
- \ube0c\ub85c\ucee4\uc758 \uc804\ubb38 \uad8c\uc5ed\uacfc \uc790\uc0b0\uc720\ud615\uc5d0 \ub9de\uac8c \uac1c\uc778\ud654
- \ud1a4: \uc804\ubb38\uc801\uc774\ub418 \uc77d\uae30 \uc26c\uc6b4 \ub9e4\uac70\uc9c4 \ubb38\uccb4
\uacb0\uacfc\ub97c JSON\uc73c\ub85c \ubc18\ud658: {"headline": "...", "briefing": "..."}`,
      userPrompt: `\uc624\ub298 \ub274\uc2a4: ${newsText}\n\n\ud22c\uc790\uc790 \uc2ec\ub9ac: ${avgSentiment}/100 (${sentimentLabel})\n\ube0c\ub85c\ucee4 \ud65c\uc131 \ub9e4\ubb3c: ${dealCount}\uac74`,
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
      parsed?.headline ?? `${regionLabel} \uc2dc\uc7a5, \uc624\ub298 \uc8fc\ubaa9\ud560 \ubcc0\ud654`;
    const briefing = parsed?.briefing ?? res.content;
    const keyStats = [
      {
        label: "\ud22c\uc790\uc790 \uc2ec\ub9ac",
        value: `${avgSentiment}/100`,
        accent:
          avgSentiment >= 60
            ? "emerald"
            : avgSentiment >= 40
            ? "amber"
            : "rose",
      },
      { label: "\ud65c\uc131 \ub9e4\ubb3c", value: `${dealCount}\uac74`, accent: "indigo" },
      { label: "\uc2dc\uc7a5 \uc0c1\ud0dc", value: sentimentLabel, accent: "slate" },
    ];

    return { headline, briefing, keyStats };
  } catch {
    return {
      headline: `${regionLabel} \uc2dc\uc7a5, \uc624\ub298 \uc8fc\ubaa9\ud560 \ubcc0\ud654`,
      briefing: newsItems
        .slice(0, 2)
        .map((n: any) => `\uD83C\uDFE2 ${n.title}\n${n.summary}`)
        .join("\n\n"),
      keyStats: [
        { label: "\ud22c\uc790\uc790 \uc2ec\ub9ac", value: `${avgSentiment}/100`, accent: "emerald" },
        { label: "\ud65c\uc131 \ub9e4\ubb3c", value: `${dealCount}\uac74`, accent: "indigo" },
        { label: "\uc2dc\uc7a5 \uc0c1\ud0dc", value: sentimentLabel, accent: "slate" },
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
    brokerData.profile.display_name ?? "\ube0c\ub85c\ucee4",
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
    topNews: marketData.news.slice(0, 4).map((n: any) => ({
      title: n.title,
      summary: n.summary,
      source: n.source,
      sentiment: n.sentiment,
    })),
    sentiment: {
      score: marketData.avgSentiment,
      status:
        marketData.avgSentiment >= 70
          ? "\uacfc\uc5f4 \uc8fc\uc758"
          : marketData.avgSentiment >= 55
          ? "\ud0d0\uc695 \uc6b0\uc138"
          : marketData.avgSentiment >= 40
          ? "\uc911\ub9bd \uad00\ub9dd"
          : "\uacf5\ud3ec \uc800\uc810",
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
    dealHighlights: deals.slice(0, 3).map((d: any) => ({
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
