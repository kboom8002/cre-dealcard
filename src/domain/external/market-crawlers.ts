import type { SupabaseClient } from "@supabase/supabase-js";

// E2: News RSS/HTML Crawler and AI Summarizer
export async function crawlCreNews(supabase: SupabaseClient): Promise<any[]> {
  // Simulating RSS feeds from major CRE news sites: 집코노미, 매경, 조선비즈, 이데일리
  const dummyNews = [
    {
      title: "성수동 IT밸리 꼬마빌딩 거래 급증... 평당 1억5천 돌파",
      url: "https://www.hankyung.com/realestate/article/20260531001",
      source: "한경 집코노미",
      summary: "성수 권역 지식산업센터 인근 근린생활시설 거래량이 전월 대비 35% 상승. 리모델링을 전제로 한 매수세가 대거 몰리며 대지 평당 최고가를 경신하고 있음.",
      content: "성수동 IT밸리 꼬마빌딩 거래 급증하며 평당 1억5천을 넘었습니다. 리모델링 밸류애드 수요가 뜨겁습니다.",
      sentiment: "bullish"
    },
    {
      title: "강남 테헤란로 대형 오피스 공실률 2%대 유지... 임대료는 고공행진",
      url: "https://www.mk.co.kr/estate/20260531002",
      source: "매경 부동산",
      summary: "강남 GBD 내 프라임 오피스 공실률이 2.1%로 최저 수준을 유지. 대기업 유입과 스타트업 사옥 확보 경쟁이 심화되면서 NOC(전용면적당 임대비용)는 상승세.",
      content: "강남 테헤란로 대형 오피스 공실률 2%대 유지하고 있으며 임대료는 고공행진 중입니다.",
      sentiment: "bullish"
    },
    {
      title: "상가 분양 시장 찬바람... 고금리 장기화에 낙찰가율 하락",
      url: "https://www.chosun.com/realestate/20260531003",
      source: "조선비즈",
      summary: "수도권 신규 택지지구 구분상가 분양률이 40% 미만을 기록. 고금리가 지속되면서 대출 이자 부담을 감당하기 어려운 개인 투자자들의 진입이 급격히 감소함.",
      content: "상가 분양 시장 찬바람 불며 고금리 장기화에 낙찰가율 하락하고 있습니다.",
      sentiment: "bearish"
    }
  ];

  const results = [];
  for (const item of dummyNews) {
    const { data, error } = await supabase
      .from("external_news")
      .upsert(item, { onConflict: "url" })
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}

// E3: CBRE / Cushman Reports structure data
export async function ingestGlobalReports(supabase: SupabaseClient): Promise<any[]> {
  const dummyReports: any[] = [
    {
      institution: "CBRE Korea",
      title: "2026년 Q1 서울 오피스 시장 보고서",
      url: "https://www.cbre.co.kr/insights/reports/seoul-office-q1-2026",
      published_date: "2026-04-15",
      summary: "서울 A급 오피스 시장의 견조한 임차 수요와 자산가치 상승을 분석.",
      structured_data: {
        vacancyRate: 2.8,
        netAbsorptionSqm: 45000,
        averageRentPerSqmKrw: 32000,
        capRateRange: [4.2, 4.8]
      }
    },
    {
      institution: "Cushman & Wakefield",
      title: "2026년 1분기 서울 리테일 시장 동향",
      url: "https://www.cushmanwakefield.com/ko-kr/korea/insights/seoul-retail-q1-2026",
      published_date: "2026-04-20",
      summary: "명동, 강남, 성수 권역 리테일 공실률 감소와 신규 해외 브랜드 플래그십 스토어 진입 트렌드.",
      structured_data: {
        myeongdongVacancy: 8.5,
        seongsuVacancy: 1.2,
        rentGrowthPct: 3.5
      }
    }
  ];

  const results = [];
  for (const report of dummyReports) {
    const { data, error } = await supabase
      .from("external_reports")
      .insert(report)
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}

// E4: Naver Cafe / Forum sentiment tracker
export async function trackSocialSentiment(supabase: SupabaseClient): Promise<any[]> {
  const dummySentiments = [
    { keyword: "꼬마빌딩", source: "부동산스터디 카페", sentiment_score: 68.5, mention_count: 342, analysis_date: new Date().toISOString().slice(0, 10) },
    { keyword: "지식산업센터 공실", source: "지산투자 카페", sentiment_score: 22.0, mention_count: 185, analysis_date: new Date().toISOString().slice(0, 10) },
    { keyword: "성수 상가 권리금", source: "상가창업 카페", sentiment_score: 75.2, mention_count: 94, analysis_date: new Date().toISOString().slice(0, 10) }
  ];

  const results = [];
  for (const item of dummySentiments) {
    const { data, error } = await supabase
      .from("social_sentiment")
      .insert(item)
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}

// E5: Youtube CRE Trend Tracker
export async function trackYoutubeTrends(supabase: SupabaseClient): Promise<any[]> {
  const dummyVideos = [
    {
      video_id: "yt_cre_2026_01",
      title: "강남 꼬마빌딩 살 돈으로 미국 리츠? 2026 빌딩 투자 패러다임 변화",
      channel_title: "부동산 킹메이커",
      view_count: 45000,
      like_count: 2400,
      published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      summary: "강남 오피스 과열 진단 및 대체 투자처 분석 설명."
    },
    {
      video_id: "yt_cre_2026_02",
      title: "공실률 폭탄 맞은 가산동 지식산업센터, 탈출 전략은 딱 하나뿐입니다",
      channel_title: "상업부동산 스터디",
      view_count: 82000,
      like_count: 3900,
      published_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      summary: "지산 섹션 오피스 분할 임대 및 용도 전환 전략 강의."
    }
  ];

  const results = [];
  for (const item of dummyVideos) {
    const { data, error } = await supabase
      .from("youtube_trends")
      .upsert(item, { onConflict: "video_id" })
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}

// E6: Court / Kamco Auction Listing crawler
export async function crawlAuctions(supabase: SupabaseClient): Promise<any[]> {
  const dummyAuctions = [
    {
      case_number: "2026타경10045",
      court: "서울중앙지방법원",
      address: "서울특별시 서초구 서초동 1500-12",
      appraised_value: 12500000000,
      minimum_bid: 10000000000,
      status: "유찰 1회",
      auction_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    },
    {
      case_number: "2026타경50431",
      court: "서울동부지방법원",
      address: "서울특별시 성동구 성수동2가 310-45",
      appraised_value: 8500000000,
      minimum_bid: 8500000000,
      status: "신건",
      auction_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
    }
  ];

  const results = [];
  for (const item of dummyAuctions) {
    const { data, error } = await supabase
      .from("auction_listings")
      .upsert(item, { onConflict: "case_number" })
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}

// E7: Rental market rate averager
export async function computeRentalMarketRates(supabase: SupabaseClient): Promise<any[]> {
  const dummyRentals = [
    { region: "gbd", building_type: "office_prime", deposit_avg: 1500000, monthly_rent_avg: 150000, vacancy_rate: 2.5, source: "MOLIT / CBRE Blended" },
    { region: "seongsu", building_type: "retail", deposit_avg: 1200000, monthly_rent_avg: 120000, vacancy_rate: 1.8, source: "MOLIT / Local Broker Blended" },
    { region: "ybd", building_type: "office_prime", deposit_avg: 1300000, monthly_rent_avg: 130000, vacancy_rate: 3.1, source: "MOLIT / Cushman Blended" }
  ];

  const results = [];
  for (const item of dummyRentals) {
    const { data, error } = await supabase
      .from("rental_market_data")
      .insert(item)
      .select()
      .single();

    if (!error && data) {
      results.push(data);
    }
  }
  return results;
}
