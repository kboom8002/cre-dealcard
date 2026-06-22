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
      serviceClient.from("external_news").select("title, summary, source, url, sentiment").order("created_at", { ascending: false }).limit(5),
      serviceClient.from("external_transactions").select("address, dong, transaction_price, usage_type, building_area, transaction_date, area_signal").eq("district", district).order("transaction_date", { ascending: false }).limit(5),
      serviceClient.from("auction_listings").select("case_number, court, address, appraised_value, minimum_bid, status, auction_date").ilike("address", `%${district}%`).limit(3),
      serviceClient.from("rental_market_data").select("building_type, deposit_avg, monthly_rent_avg, vacancy_rate, source").eq("region", regionKey).limit(3),
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

    // ── AI 브리핑 생성 (강화된 꼬마빌딩 브로커 맥락) ──────────────────────────
    const newsSummaryText = (newsData.data || []).length > 0
      ? (newsData.data || []).map(n => `[${n.source}] ${n.title}: ${n.summary}`).join("\n")
      : "최근 수집된 뉴스 없음 — 현재 보유 매물 기반으로 브리핑을 작성하세요.";

    const txSummary = myAreaTransactions.length > 0
      ? myAreaTransactions.map(tx => `${tx.dong || ""} ${tx.address || ""} ${tx.usage_type || ""} ${(Number(tx.transaction_price) / 1e8).toFixed(1)}억원`).join(", ")
      : "실거래 데이터 없음";

    let aiBriefing = "";
    let aiCounselScript = "";
    let aiActionList: string[] = [];

    try {
      const systemPrompt = `당신은 한국 꼬마빌딩·상업용 부동산 전문 "1인 브로커 모닝 에디터"입니다.
매일 아침 8시, 현장에서 일하는 1인 브로커에게 오늘 영업에 직결되는 인사이트를 브리핑합니다.

[핵심 원칙]
1. 추상적 시장 뉴스가 아니라 "오늘 누구에게 먼저 전화할지", "내 매물 가격 협상에 어떤 영향인지" 직결로 연결
2. 꼬마빌딩(50억 미만~200억) 매도·임대·매입 중개 관점에서 해석
3. 실거래 체결 뉴스 → 내 매물 시세 포지셔닝에 즉시 연결
4. 경매 낙찰가율 → 시장 과열/냉각 온도계로 해석
5. 공실률 변동 → 임대 전략 또는 매각 타이밍으로 전환
6. **데이터가 "없음"이면 솔직하게 "수집된 정보 없음"이라고 말하세요. 절대 없는 데이터를 지어내지 마세요.**
7. 출력 형식: JSON (briefing, action_list, cold_call_script, hot_lead_script, risk_note)`;

      const userPrompt = `
[오늘 시장 뉴스]
${newsSummaryText}

[${district}(${regionKey.toUpperCase()}) 최근 실거래]
${txSummary}

[이 브로커의 현재 보유 매물 ${myDeals.length}건]
${myDealsSummary}

[이 브로커의 활성 매수자 ${myBuyers.length}명]
${myBuyersSummary}

[미션] 아래 JSON 형식으로 정확히 출력하세요:
{
  "briefing": "시장 동향 5줄 핵심 요약 (내 매물/매수자 맥락 연결 필수)",
  "action_list": ["오늘 할 일 1", "오늘 할 일 2", "오늘 할 일 3"],
  "cold_call_script": "콜드 팔로업용 전화 멘트 (30초 이내, 자연스러운 구어체)",
  "hot_lead_script": "관심 있는 매수자에게 보낼 카톡 문구",
  "risk_note": "오늘 주의해야 할 시장 위험 신호 1줄"
}`;

      const aiRes = await callLLM({
        systemPrompt,
        userPrompt,
        model: "gpt-5.4",
        temperature: 0.4,
        maxTokens: 900,
      });

      // JSON 파싱 시도
      let contentString = typeof aiRes.content === 'string' ? aiRes.content : JSON.stringify(aiRes.content);
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
            } catch (e) {}
          }
          
          aiCounselScript = parsed.cold_call_script || parsed.hot_lead_script || "";
          aiActionList = parsed.action_list || [];
        } catch (e) {
          // If JSON parse fails, maybe it's just raw text
          aiBriefing = contentString.replace(/```json/g, '').replace(/```/g, '').trim();
          if (aiBriefing.startsWith('{')) {
             aiBriefing = "1. 고금리와 공실 부담으로 시장 변동성이 커지고 있습니다.\n2. 실거래가 동향을 주시해야 합니다.";
          }
        }
      } else {
        aiBriefing = contentString.trim();
      }
    } catch {
      // AI 호출 실패 시 — 더미 데이터 없이 에러 메시지 표시
      aiBriefing = `⚠️ ${district} 권역 AI 브리핑 생성에 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`;
      aiCounselScript = "";
      aiActionList = ["모닝 인텔리전스 새로고침", "직접 시장 뉴스 확인"];
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
        actionList: aiActionList,
        yesterdayTransactions,
        myDealsVsMarket,
        auctions,
        rentalMarket,
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
