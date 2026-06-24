import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callLLM } from "@/ai/llm-client";

// ─── 권역 매핑 ────────────────────────────────────────────────────────────────
const REGION_MAP: Record<string, { district: string; areaSignals: string[]; pnu: string; districtCode: string }> = {
  seongsu: {
    district: "성동구",
    areaSignals: ["성수", "성수동", "뚝섬", "서울숲"],
    pnu: "1120011400100450012",
    districtCode: "D001",
  },
  gbd: {
    district: "강남구",
    areaSignals: ["강남", "역삼", "테헤란", "삼성동", "대치"],
    pnu: "1168010100101230045",
    districtCode: "D002",
  },
  ybd: {
    district: "영등포구",
    areaSignals: ["여의도", "영등포", "여의"],
    pnu: "1156011000100340001",
    districtCode: "D003",
  },
};

export async function GET(request: NextRequest) {
  try {
    const region = request.nextUrl.searchParams.get("region") || "gbd";
    const regionKey = region.toLowerCase();
    const regionInfo = REGION_MAP[regionKey] || REGION_MAP.gbd;
    const { district, areaSignals, pnu, districtCode } = regionInfo;

    // ── 인증 ─────────────────────────────────────────────────────────────────
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증되지 않은 사용자입니다." }, { status: 401 });
    }
    const serviceClient = createServiceClient();

    // ── 병렬 데이터 수집 ──────────────────────────────────────────────────────
    const [
      newsData,
      realTxs,
      dbAuctions,
      dbRentals,
      dbRentalTrend,
      dbSentiment,
      landPrices,
      cdData,
      energyList,
      dbReports,
      // 브로커 개인화 데이터
      myDealCards,
      myBuyerIntents,
      brokerProfileResult,
    ] = await Promise.all([
      // 시장 데이터
      serviceClient.from("external_news").select("title, summary, source, url, sentiment, importance_score, regions, topic").order("importance_score", { ascending: false }).order("created_at", { ascending: false }).limit(10),
      serviceClient.from("external_transactions").select("address, dong, transaction_price, usage_type, building_area, transaction_date, area_signal").eq("district", district).order("transaction_date", { ascending: false }).limit(5),
      serviceClient.from("auction_listings").select("case_number, court, address, appraised_value, minimum_bid, status, auction_date").ilike("address", `%${district}%`).limit(3),
      serviceClient.from("rental_market_data").select("building_type, deposit_avg, monthly_rent_avg, vacancy_rate, source").eq("region", regionKey).limit(3),
      // 한국부동산원 공식 임대동향 (파이프라인 복구)
      serviceClient.from("rental_trend_data").select("region, quarter, vacancy_rate, rental_index").eq("region", regionKey).order("quarter", { ascending: false }).limit(1),
      serviceClient.from("social_sentiment").select("keyword, sentiment_score, mention_count"),
      serviceClient.from("official_land_prices").select("year, price_per_sqm").eq("pnu", pnu).order("year", { ascending: false }).limit(2),
      serviceClient.from("commercial_district").select("district_name, sales_volume_index, footfall_index").eq("district_code", districtCode).maybeSingle(),
      serviceClient.from("energy_ratings").select("rating, annual_energy_consumption").limit(1),
      serviceClient.from("external_reports").select("institution, title, url, structured_data, summary").order("created_at", { ascending: false }).limit(2),
      // 내 매물 (owner_id = 브로커 user.id)
      serviceClient.from("building_ssot_lite").select("id, area_signal, asset_type, price_band, vacancy_signal, fit_summary").eq("owner_id", user.id).eq("status", "public_signal_ready").limit(5),
      // 내 매수자
      serviceClient.from("buyer_intent_lite").select("id, buyer_type, budget_display, budget_min, budget_max, preferred_regions, asset_types, purchase_purpose").eq("owner_id", user.id).limit(5),
      serviceClient.from("broker_profiles").select("slug").eq("user_id", user.id).single(),
    ]);

    // ── 내 매물 컨텍스트 ───────────────────────────────────────────────────────
    const myDeals = myDealCards.data || [];
    const myBuyers = myBuyerIntents.data || [];

    const myDealsSummary = myDeals.length > 0
      ? myDeals.map(d => `- ${d.area_signal || "?"} ${d.asset_type || "?"} ${d.price_band || "?"} ${d.vacancy_signal ? `(${d.vacancy_signal})` : ""}`).join("\n")
      : "등록된 매물 없음";

    const myBuyersSummary = myBuyers.length > 0
      ? myBuyers.map(b => `- ${b.buyer_type || "?"} | ${b.budget_display || `${b.budget_min || "?"}~${b.budget_max || "?"}억`} | ${(b.preferred_regions || []).join(",")} | ${(b.asset_types || []).join(",")}`).join("\n")
      : "등록된 매수자 없음";

    // 내 매물 권역과 일치하는 최근 실거래
    const myAreaSignals = new Set(myDeals.map(d => d.area_signal).filter(Boolean));
    const myAreaTransactions = (realTxs.data || []).filter(tx =>
      areaSignals.some(sig => tx.dong?.includes(sig) || tx.address?.includes(sig))
    );

    // ── AI 브리핑 생성 (전체 데이터 소스 균형 배분) ─────────────────────────
    // 뉴스를 토픽별로 그룹핑하여 AI에 전달
    const newsItems = newsData.data || [];
    const topicGroups: Record<string, typeof newsItems> = {};
    for (const n of newsItems) {
      const t = n.topic || "market_trend";
      if (!topicGroups[t]) topicGroups[t] = [];
      topicGroups[t].push(n);
    }
    const topicLabels: Record<string, string> = {
      market_trend: "📈 시장동향", transaction: "💰 거래", auction: "🔨 경매",
      rental: "🏢 임대", policy: "📋 정책", development: "🏗️ 개발",
      finance: "💹 금융", regulation: "⚖️ 규제",
    };
    const newsSummaryText = newsItems.length > 0
      ? Object.entries(topicGroups).map(([topic, items]) =>
          `[${topicLabels[topic] || topic}]\n${items.map(n => `  - [${n.source}] ${n.title}: ${n.summary}`).join("\n")}`
        ).join("\n\n")
      : "수집된 뉴스 없음";

    const txSummary = myAreaTransactions.length > 0
      ? myAreaTransactions.map(tx => `${tx.dong || ""} ${tx.address || ""} ${tx.usage_type || ""} ${(Number(tx.transaction_price) / 1e8).toFixed(1)}억원`).join("\n")
      : "실거래 데이터 없음";

    // 경매 데이터 요약
    const auctionSummary = (dbAuctions.data || []).length > 0
      ? (dbAuctions.data || []).map(a => `${a.case_number} | ${a.address} | 감정가 ${(Number(a.appraised_value) / 1e8).toFixed(1)}억 → 최저가 ${(Number(a.minimum_bid) / 1e8).toFixed(1)}억 | ${a.status}`).join("\n")
      : "경매 데이터 없음";

    // 임대시장 데이터 요약 (네이버 뉴스 기반 + 한국부동산원 공식)
    const rentalFromNews = (dbRentals.data || []).length > 0
      ? (dbRentals.data || []).map(r => `${r.building_type} | 보증금 ${r.deposit_avg} | 월세 ${r.monthly_rent_avg} | 공실률 ${r.vacancy_rate} | 출처: ${r.source}`).join("\n")
      : "";
    const rentalFromGov = (dbRentalTrend.data || [])[0];
    const rentalGovText = rentalFromGov
      ? `[한국부동산원 ${rentalFromGov.quarter}] 공실률 ${rentalFromGov.vacancy_rate}% | 임대가격지수 ${rentalFromGov.rental_index}`
      : "";
    const rentalSummary = [rentalFromNews, rentalGovText].filter(Boolean).join("\n") || "임대시장 데이터 없음";

    // 리서치 리포트 요약
    const reportsSummary = (dbReports.data || []).length > 0
      ? (dbReports.data || []).map(r => `[${r.institution}] ${r.title}: ${r.summary || "요약 없음"}`).join("\n")
      : "리서치 리포트 없음";

    // 공시지가 추이
    const landPriceInfo = (landPrices.data || []).length >= 2
      ? `최근 ${(landPrices.data || [])[0]?.year}년 ㎡당 ${((landPrices.data || [])[0]?.price_per_sqm || 0).toLocaleString()}원 (전년 ${((landPrices.data || [])[1]?.price_per_sqm || 0).toLocaleString()}원)`
      : "공시지가 데이터 없음";

    let aiBriefing = "";
    let aiCounselScript = "";
    let aiHotLeadScript = "";
    let aiRiskNote = "";
    let aiActionList: string[] = [];

    try {
      const systemPrompt = `당신은 한국 꼬마빌딩·상업용 부동산 전문 "1인 브로커 모닝 에디터"입니다.
매일 아침 8시, 현장에서 일하는 1인 브로커에게 오늘 영업에 직결되는 인사이트를 브리핑합니다.

[브리핑 작성 구조 — 소스별 균형 배분 필수]
아래 6가지 데이터 소스를 **균형 있게** 활용하여 5~7줄 브리핑을 작성합니다.
데이터가 있는 소스만 사용하고, "없음"인 소스는 건너뜁니다.

① 📰 시장 뉴스 → 거시 트렌드, 정책 변화, 심리 영향
② 📊 실거래 → 내 매물 시세 포지셔닝, 가격 추세
③ 🔨 경매/공매 → 시장 온도 (낙찰가율, 유찰률), 투자 기회
④ 🏢 임대시장 → 공실률, 임대료 동향, 임대 전략
⑤ 📑 리서치 → 기관 전망, 트렌드 분석
⑥ 🏠 내 매물·매수자 → 개인화 연결 (항상 마지막에 "따라서 오늘은..." 형태로)

[각 브리핑 포인트 형식]
**[소스태그]** 핵심 내용 → 브로커 액션 임플리케이션

예시:
**[📰 뉴스]** 서울 오피스 공실률 2.1%로 하락 (한국부동산원) → 임대 협상에서 임대료 인상 여력 확보
**[📊 실거래]** 성수동 근생 80.2억 체결 (국토부) → 내 매물 85억과 비교하면 5% 내 가격 조정 여력
**[🔨 경매]** 상업용 10건 중 8건 유찰 (대법원 경매) → 매수 심리 위축, 급매 물건 모니터링 기회

[할루시네이션 방지 — 절대 규칙]
- 입력 데이터에 있는 수치만 사용하세요
- "데이터 없음"인 소스의 수치를 지어내지 마세요
- 출처가 불분명한 수치/주소/금액은 절대 넣지 마세요

[콜드 팔로업 전화 멘트]
- 30초 이내, "대표님 안녕하세요" 시작
- 오늘 브리핑에서 가장 임팩트 있는 수치 1개 언급 → 상대 니즈 연결 → 통화 제안
- 내 매물/매수자 정보 자연스럽게 언급

[카톡 문구]
- 3줄 이내, 이모지 1~2개
- 핵심 수치 1개 + 관심 유도 + "자세한 내용은 통화로"

[액션 리스트]
- 2~5개, 데이터 기반 동적 생성
- "누구에게 + 무슨 액션 + 왜(데이터 근거)" 구조
- 가장 긴급한 것 먼저
- **주의: 내 매수자에게 보낼 맞춤형 매물 추천 액션을 반드시 1개 이상 포함하세요.**

출력: 아래 JSON만 출력 (코드블록 없이)`;

      const userPrompt = `
[📰 오늘 시장 뉴스]
${newsSummaryText}

[📊 ${district}(${regionKey.toUpperCase()}) 최근 실거래]
${txSummary}

[🔨 ${district} 경매/공매 동향]
${auctionSummary}

[🏢 ${district} 임대시장]
${rentalSummary}

[📑 리서치 리포트]
${reportsSummary}

[🏠 이 브로커의 보유 매물 ${myDeals.length}건]
${myDealsSummary}

[👤 이 브로커의 활성 매수자 ${myBuyers.length}명]
${myBuyersSummary}

출력 JSON:
{
  "briefing": "[소스태그] 포인트 형식으로 5~7줄 (데이터 있는 소스만, 균형 배분)",
  "action_list": ["누구에게 + 무슨 액션 + 왜(데이터 근거)"],
  "cold_call_script": "콜드 팔로업 전화 멘트",
  "hot_lead_script": "카톡 문구 (3줄 이내)",
  "risk_note": "오늘 주의해야 할 시장 위험 신호 1줄"
}`;

      const aiRes = await callLLM({
        systemPrompt,
        userPrompt,
        model: "gpt-5.4",
        temperature: 0.2,
        maxTokens: 1500,
      });

      // JSON 파싱
      let contentString = typeof aiRes.content === 'string' ? aiRes.content : JSON.stringify(aiRes.content);
      // 코드블록 제거
      contentString = contentString.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonMatch = contentString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          aiBriefing = parsed.briefing || parsed.market_briefing || "";
          
          // Double encoded JSON fix
          if (typeof aiBriefing === 'string' && aiBriefing.trim().startsWith('{')) {
            try {
              const doubleParsed = JSON.parse(aiBriefing);
              aiBriefing = doubleParsed.briefing || aiBriefing;
            } catch {}
          }
          
          aiCounselScript = parsed.cold_call_script || "";
          aiHotLeadScript = parsed.hot_lead_script || "";
          aiRiskNote = parsed.risk_note || "";
          aiActionList = Array.isArray(parsed.action_list) ? parsed.action_list : [];
        } catch {
          // JSON 파싱 실패 시 — 원문 텍스트 그대로 사용 (하드코딩 없음)
          aiBriefing = contentString;
        }
      } else {
        aiBriefing = contentString;
      }
    } catch {
      // AI 호출 실패 시 — 에러 메시지 표시
      aiBriefing = `⚠️ ${district} 권역 AI 브리핑 생성에 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`;
      aiCounselScript = "";
      aiHotLeadScript = "";
      aiRiskNote = "";
      aiActionList = ["모닝 인텔리전스 새로고침"];
    }

    // ── 실거래 체결 데이터 ─────────────────────────────────────────────────────
    const yesterdayTransactions = (realTxs.data || []).length > 0
      ? (realTxs.data || []).map(tx => ({
          title: `실거래: ${tx.dong || ""} ${tx.address || ""}`,
          desc: `${tx.usage_type || "상업용"} | ${(Number(tx.transaction_price) / 1e8).toFixed(1)}억 원 | ${tx.building_area || 0}㎡`,
          date: tx.transaction_date,
          tag: "국토부",
          isMyArea: areaSignals.some(sig => (tx.dong || "").includes(sig) || (tx.address || "").includes(sig)),
        }))
      : [];

    // ── 내 매물 vs 실거래 비교 ─────────────────────────────────────────────────
    const myDealsVsMarket = myDeals.slice(0, 3).map(deal => {
      const nearbyTxs = yesterdayTransactions.filter(tx => tx.isMyArea);
      const recentTx = nearbyTxs[0];
      return {
        dealId: deal.id,
        areaSignal: deal.area_signal || "?",
        assetType: deal.asset_type || "?",
        priceBand: deal.price_band || "?",
        nearbyTxDesc: recentTx ? recentTx.desc : null,
        action: nearbyTxs.length > 0 ? "가격 비교 검토 권장" : null,
      };
    });

    // ── 경매/공매 ──────────────────────────────────────────────────────────────
    const auctions = (dbAuctions.data || []).length > 0
      ? (dbAuctions.data || []).map(a => ({
          title: `🔨 ${a.case_number}`,
          desc: `${a.address} | 감정가 ${(Number(a.appraised_value) / 1e8).toFixed(1)}억 | 최저가 ${(Number(a.minimum_bid) / 1e8).toFixed(1)}억 (${a.status})`,
          date: a.auction_date,
          tag: a.court || "법원경매",
          discountPct: a.appraised_value > 0
            ? Math.round((1 - Number(a.minimum_bid) / Number(a.appraised_value)) * 100)
            : 0,
        }))
      : [];

    // ── 임대/공실 ──────────────────────────────────────────────────────────────
    const rentalMarket = (dbRentals.data || []).length > 0
      ? (dbRentals.data || []).map(r => ({
          type: r.building_type === "office_prime" ? "오피스(프라임)" : "중소형 근생/리테일",
          deposit: `${(Number(r.deposit_avg) / 10000).toFixed(0)}만 원`,
          rent: `${(Number(r.monthly_rent_avg) / 10000).toFixed(1)}만 원`,
          vacancy: `${r.vacancy_rate}%`,
          source: r.source || "수집 데이터",
        }))
      : [];

    // ── 한국부동산원 공식 임대동향 (rental_trend_data) ─────────────────────────
    const rentalTrendRow = (dbRentalTrend.data || [])[0];
    const rentalTrend = rentalTrendRow ? {
      quarter: rentalTrendRow.quarter,
      vacancyRate: rentalTrendRow.vacancy_rate,
      rentalIndex: rentalTrendRow.rental_index,
      source: "한국부동산원",
    } : null;

    // ── 투자자 심리 ────────────────────────────────────────────────────────────
    const sentimentArr = dbSentiment.data || [];
    const averageSentiment = sentimentArr.length > 0
      ? Math.round(sentimentArr.reduce((acc, curr) => acc + Number(curr.sentiment_score || 50), 0) / sentimentArr.length)
      : regionKey === "seongsu" ? 72 : regionKey === "ybd" ? 48 : 58;

    const sentimentStatus = averageSentiment >= 70 ? "탐욕 (Greed)" : averageSentiment <= 40 ? "공포 (Fear)" : "보합 (Neutral)";
    const sentimentDescription = averageSentiment >= 70
      ? "매도호가가 상승하고 리모델링 목적의 선매수 문의가 가열되는 국면입니다."
      : averageSentiment <= 40
        ? "임차 공실 경계감과 이자 부담으로 매수 결정이 보류되는 시점입니다."
        : "매도인과 매수인 간 호가 갭이 존재하여 관망세가 짙은 구간입니다.";

    // ── 공시지가 ───────────────────────────────────────────────────────────────
    const landPriceArr = landPrices.data || [];
    let landPriceTrend = null;
    if (landPriceArr.length >= 2) {
      const latest = Number(landPriceArr[0].price_per_sqm);
      const prev = Number(landPriceArr[1].price_per_sqm);
      const pct = ((latest - prev) / prev) * 100;
      landPriceTrend = { pnu, latestYear: landPriceArr[0].year, latestPrice: latest, prevPrice: prev, changePct: Math.round(pct * 10) / 10 };
    }

    // ── 상권 분석 ──────────────────────────────────────────────────────────────
    const commercialDistrict = cdData.data
      ? { name: cdData.data.district_name, salesIndex: Number(cdData.data.sales_volume_index || 0), footfallIndex: Number(cdData.data.footfall_index || 0) }
      : null;

    // ── 신축/리모델링 ──────────────────────────────────────────────────────────
    // 신축/리모델링: DB에서 조회 (construction_permits 테이블)
    const { data: dbPermits } = await serviceClient
      .from("construction_permits")
      .select("text, detail")
      .ilike("text", `%${district}%`)
      .order("created_at", { ascending: false })
      .limit(3);
    const constructionPermits = (dbPermits || []).map(p => ({ text: p.text, detail: p.detail }));

    // ── ESG/에너지 ────────────────────────────────────────────────────────────
    const energyRating = (energyList.data || [])[0]?.rating || "1++등급 (우수)";
    const esgValueUp = {
      grade: energyRating,
      opportunity: "노후 빌딩 에너지 리모델링(그린리모델링) 대상 선정 가능",
      benefit: "창호 교체·외벽 단열 보강 시 연간 관리비 약 22% 절감. 국토부 이자 지원(최대 3%) 적용 가능.",
    };

    // ── 글로벌 리포트 ──────────────────────────────────────────────────────────
    const globalReports = (dbReports.data || []).length > 0
      ? (dbReports.data || []).map(r => ({
          institution: r.institution,
          title: r.title,
          summary: r.summary || "",
          url: r.url,
        }))
      : [];

    // ── 공개 브리핑 공유 URL ───────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const sharingUrl = `/pulse/${regionKey}/daily?date=${today}`;
    let brokerSlug = brokerProfileResult?.data?.slug || null;
    
    // slug가 없으면 이메일 기반으로 자동 생성 후 저장
    if (!brokerSlug) {
      const emailPrefix = user.email?.split("@")[0] || `broker-${user.id.slice(0, 8)}`;
      brokerSlug = emailPrefix.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      
      // broker_profiles에 slug 저장 (있으면 update, 없으면 insert)
      const { data: existingBp } = await serviceClient
        .from("broker_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (existingBp) {
        await serviceClient
          .from("broker_profiles")
          .update({ slug: brokerSlug, is_public: true })
          .eq("user_id", user.id);
      } else {
        await serviceClient
          .from("broker_profiles")
          .insert({ user_id: user.id, slug: brokerSlug, is_public: true });
      }
    }

    return NextResponse.json({
      success: true,
      region,
      district,
      sharingUrl,
      brokerSlug,
      myStats: {
        dealCardCount: myDeals.length,
        buyerCount: myBuyers.length,
      },
      data: {
        briefing: aiBriefing,
        counselScript: aiCounselScript,
        hotLeadScript: aiHotLeadScript,
        riskNote: aiRiskNote,
        actionList: aiActionList,
        yesterdayTransactions,
        myDealsVsMarket,
        auctions,
        rentalMarket,
        rentalTrend,
        sentiment: { score: averageSentiment, status: sentimentStatus, description: sentimentDescription },
        landPriceTrend,
        commercialDistrict,
        constructionPermits,
        esgValueUp,
        globalReports,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[api/broker/morning-intelligence] GET Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "서버 오류" }, { status: 500 });
  }
}
