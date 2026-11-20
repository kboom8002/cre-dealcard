import { describe, expect, it, vi } from "vitest";
import {
  MULTI_CHANNEL_RSS_FEEDS,
  OFFICIAL_GOV_GOOGLE_QUERIES,
  OFFICIAL_PUBLIC_RSS_FEEDS,
  areArticlesSameEvent,
  enrichNewsPoolWithChannels,
  hasStrongCreOrChannelSignal,
  isCreRelevantArticle,
} from "@/domain/magazine/news-channels";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import {
  CRE_RESEARCH_REPORT_RE,
  selectBalancedTopNews,
  type ScoredNews,
} from "@/domain/external/market-crawlers";

describe("P0~P1 뉴스레터 소스 고도화 품질 · 순도 · 중복 병합 검증", () => {
  it("P0-1: 깨진 구 RSS URL 4종이 완전히 제거되고 검증된 다채널·공공 RSS가 등록되어 있다", () => {
    const allUrls = [
      ...MULTI_CHANNEL_RSS_FEEDS.map((f) => f.url),
      ...OFFICIAL_PUBLIC_RSS_FEEDS.map((f) => f.url),
    ];
    expect(allUrls).not.toContain("https://www.mk.co.kr/rss/estate");
    expect(allUrls).not.toContain("https://www.edaily.co.kr/rss/realestate");
    expect(allUrls).not.toContain("https://biz.chosun.com/rss/realty");
    expect(allUrls).not.toContain("https://news.mt.co.kr/rss/estate.xml");

    expect(allUrls).toContain("https://www.mk.co.kr/rss/50300009/");
    expect(allUrls).toContain("https://www.fnnews.com/rss/r20/fn_realnews_realestate.xml");
    expect(allUrls).toContain("https://news.seoul.go.kr/citybuild/feed");
    expect(OFFICIAL_GOV_GOOGLE_QUERIES.length).toBeGreaterThanOrEqual(3);
  });

  it("P0-2: 신간 출간 홍보·개별 주식 종목 리포트·순수 아파트 노이즈를 정확히 차단하고 직접 CRE는 통과시킨다", () => {
    // 실제 운영 DB(2026-11-19)에서 발견된 노이즈 사례 5건 전원 차단
    expect(
      isCreRelevantArticle({
        title: "“부동산 투자의 실전 원칙 제시” 박준연 정인부동산그룹 대표, 신간 출간",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "[핀포인트] [DB손보] 자본비율 복병은 금리상승…목표주가 유지",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "집 팔아 10억 남겨도…서울 '국평' 후보 19→15곳",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "서초구 “재초환 부과기한 국토부 해석 유감…제도 폐지해야”",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "한화, 하안주공5 시공…정비사업 2.5조 수주",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "87명 몰렸던 헬리오시티, 올해는 3명 응찰…열기 식는 서울 경매시장",
      }),
    ).toBe(false);

    // 실제 CRE·세무·금리·상권·문화 핵심 기사는 모두 통과
    expect(
      isCreRelevantArticle({
        title: "올해 7개월 간 전국 빌딩·건물·꼬마빌딩 40조 매매…서울 거래 비중 급증",
      }),
    ).toBe(true);
    expect(
      isCreRelevantArticle({
        title: "대법 '꼬마빌딩 상속세, 국세청 사후 감정평가로 시가산정 가능'",
      }),
    ).toBe(true);
    expect(
      isCreRelevantArticle({
        title: "서울 경부·경원선 철도 지하화…역사 39곳 역세권 복합 개발",
      }),
    ).toBe(true);
    expect(
      isCreRelevantArticle({
        title: "한국은행 기준금리 동결…코픽스·담보대출 금리 향방은",
      }),
    ).toBe(true);
  });

  it("P0-2b: hasStrongCreOrChannelSignal은 일반 종합지 잡음 기사를 걸러내고 CRE·자산가 신호만 남긴다", () => {
    expect(
      hasStrongCreOrChannelSignal({
        title: "농식품부, 김치의 날 기념행사 개최…김장 체험·김치 홍보",
      }),
    ).toBe(false);
    expect(
      hasStrongCreOrChannelSignal({
        title: "JLL 코리아, 2026년 2분기 서울 오피스 시장 동향 발표",
      }),
    ).toBe(true);
    expect(
      hasStrongCreOrChannelSignal({
        title: "세무법인 '꼬마빌딩' 증여세 감정평가 대응 전략",
      }),
    ).toBe(true);
  });

  it("P0-3: CRE_RESEARCH_REPORT_RE는 오피스·빌딩 리포트만 통과시키고 무관 홍보 기사를 배제한다", () => {
    expect(CRE_RESEARCH_REPORT_RE.test("서울 오피스 공실률 5.7%로 하락…거래액 7조4000억원")).toBe(true);
    expect(CRE_RESEARCH_REPORT_RE.test("JLL 코리아, 2026년 2분기 서울 오피스 시장 동향 발표")).toBe(true);
    expect(CRE_RESEARCH_REPORT_RE.test("공간정보 수치화해 유사 토지 찾는다…부동산플래닛 특허 등록")).toBe(false);
  });

  it("P1-6: 동일 사건 중복 보도를 토큰 유사도로 병합해 복수 출처로 묶고 5선 다양성을 유지한다", () => {
    const t1 = "경부·경원선 철도 지하화 본격화…서울 39개 역사 복합 개발";
    const t2 = "서울 경부·경원선 철도 지하화 추진…역사 39곳 복합 개발 속도";
    const t3 = "강남 테헤란로 오피스 공실률 3%대 안정세 유지";

    expect(areArticlesSameEvent(t1, t2)).toBe(true);
    expect(areArticlesSameEvent(t1, t3)).toBe(false);

    const pool = [
      {
        id: "dup-1",
        title: t1,
        summary: "도심 철도 지하화로 역세권 개발 기대감이 커지고 있습니다.",
        source: "한국경제",
        topic: "development",
        channel: "real_estate",
        importance_score: 9,
      },
      {
        id: "dup-2",
        title: t2,
        summary: "서울시와 국토부가 철도 지하화 선도사업을 확정했습니다.",
        source: "서울경제",
        topic: "policy",
        channel: "real_estate",
        importance_score: 8,
      },
      {
        id: "tax-1",
        title: "국세청 꼬마빌딩 증여 감정평가 기준 강화, 부담부증여 점검 필수",
        summary: "시가 기준 과세가 확대되며 사전 세무 시뮬레이션이 중요해졌습니다.",
        source: "매일경제",
        topic: "tax",
        channel: "tax_wealth",
        importance_score: 9,
      },
      {
        id: "eco-1",
        title: "한국은행 기준금리 동결 속 시중은행 상업용 담보대출 금리 하락",
        summary: "대출 이자 부담 완화로 우량 근생 빌딩 매수 문의가 늘고 있습니다.",
        source: "연합뉴스",
        topic: "finance",
        channel: "economy_finance",
        importance_score: 8,
      },
      {
        id: "com-1",
        title: "성수·한남 골목상권 글로벌 브랜드 플래그십 단독 임차 강세",
        summary: "전면 노출과 층고가 우수한 단독 건물의 임대료가 상승세입니다.",
        source: "파이낸셜뉴스",
        topic: "commercial_trend",
        channel: "commercial_trend",
        importance_score: 8,
      },
      {
        id: "cul-1",
        title: "노후 근생 빌딩 벽돌 외관 리모델링으로 임대 가치 상향",
        summary: "신축 대비 적은 비용으로 외관 품격을 높이는 공간 디자인이 인기입니다.",
        source: "한국경제 아르떼",
        topic: "architecture",
        channel: "culture_lifestyle",
        importance_score: 8,
      },
    ];

    const issues = clusterArticlesIntoFiveIssues(pool, { cadence: "weekly" });
    expect(issues).toHaveLength(5);

    const railIssues = issues.filter((i) => i.title.includes("지하화"));
    expect(railIssues).toHaveLength(1);
    expect(railIssues[0].sources).toEqual(expect.arrayContaining(["한국경제", "서울경제"]));
    expect(railIssues[0].articleCount).toBeGreaterThanOrEqual(2);

    const enriched = enrichNewsPoolWithChannels(pool, false);
    expect(enriched.filter((i) => i.title.includes("지하화"))).toHaveLength(1);
  });

  it("P0-1b: selectBalancedTopNews는 부동산 기사가 압도적이어도 5대 채널을 모두 균형 있게 보존한다", () => {
    const mk = (
      idx: number,
      channel: ScoredNews["channel"],
      topic: string,
      title: string,
      score: number,
    ): ScoredNews => ({
      title,
      link: `https://example.com/news/${idx}`,
      description: `${title} 상세 본문`,
      feedSource: "테스트언론",
      score,
      regions: ["gbd"],
      topic,
      channel,
      sentiment: "neutral",
      summary: `${title} 요약`,
    });

    const distinctReTitles = [
      "역삼동 테헤란로 오피스 빌딩 기관 매입 성사",
      "성수동 연무장길 근린생활시설 통건물 리모델링",
      "여의도 파크원 인근 법인 사옥 이전 수요 급증",
      "마포 합정동 이면도로 꼬마빌딩 공실률 하락",
      "서초 교대역 코너 근생 빌딩 신규 물건 출회",
      "광화문 도심권 프라임 오피스 임대료 강세",
      "송파 잠실권 메디컬 특화 빌딩 수익률 점검",
      "용산 한남동 단독 상가 건물 증축 인허가",
      "종로 을지로 리츠 편입 자산 운용 전략 변화",
      "판교 테크노밸리 지식산업센터 기업 임차 재개",
      "분당 서현역 역세권 지구단위계획 용적률 상향",
      "압구정 로데오 패션 플래그십 빌딩 매각 추진",
    ];

    const candidates: ScoredNews[] = [
      ...distinctReTitles.map((title, i) =>
        mk(i, "real_estate", "transaction", title, 9),
      ),
      mk(101, "economy_finance", "finance", "한국은행 기업대출 담보금리 4%대 안착", 8),
      mk(102, "tax_wealth", "tax", "꼬마빌딩 자녀 증여 국세청 감정평가 체크", 8),
      mk(103, "commercial_trend", "commercial_trend", "성수동 리테일 팝업 단독 빌딩 임차 급증", 7),
      mk(104, "culture_lifestyle", "culture", "도심 빌딩 로비 미술품 전시와 건축 리모델링", 7),
      // 노이즈 기사(점수 높게 들어와도 차단되어야 함)
      mk(105, "real_estate", "transaction", "부동산 투자 실전 원칙 신간 출간 기념 북토크", 10),
    ];

    const selected = selectBalancedTopNews(candidates, 15);
    expect(selected).toHaveLength(15);
    const channelSet = new Set(selected.map((s) => s.channel));
    expect(channelSet.size).toBe(5);
    expect(selected.some((s) => s.title.includes("신간 출간"))).toBe(false);
  });
});
