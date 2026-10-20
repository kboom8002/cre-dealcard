import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNELS,
  enrichNewsPoolWithChannels,
  recommendBalancedNewsMix,
  resolveNewsChannel,
} from "@/domain/magazine/news-channels";
import { NewsCurationPanel } from "@/components/magazine-editor/NewsCurationPanel";
import { SimpleNewsPicker } from "@/components/magazine-editor/simple/SimpleNewsPicker";
import { NewsSection } from "@/components/magazine/viewer-sections";
import { pickTopNews } from "@/lib/magazine/view-helpers";

const noop = () => {};

describe("5대 매수자 관심 뉴스 채널 분류 및 큐레이션 (news-channels.ts)", () => {
  it("5대 핵심 채널(부동산·경제·절세·문화·상권)이 정의되어 있고 기본 풀이 모든 채널을 포함한다", () => {
    const channelIds = NEWS_CHANNELS.map((c) => c.id);
    expect(channelIds).toEqual([
      "all",
      "real_estate",
      "economy_finance",
      "tax_wealth",
      "culture_lifestyle",
      "commercial_trend",
    ]);

    const poolChannels = new Set(CURATED_CHANNEL_POOL.map((item) => item.channel));
    expect(poolChannels.has("real_estate")).toBe(true);
    expect(poolChannels.has("economy_finance")).toBe(true);
    expect(poolChannels.has("tax_wealth")).toBe(true);
    expect(poolChannels.has("culture_lifestyle")).toBe(true);
    expect(poolChannels.has("commercial_trend")).toBe(true);
  });

  it("resolveNewsChannel: 명시적 채널·토픽·제목 키워드로 5대 채널을 정확히 판별한다", () => {
    expect(
      resolveNewsChannel({
        title: "한국은행 기준금리 동결…코픽스·주담대 금리 향방은",
        topic: "interest_rate",
      })
    ).toBe("economy_finance");

    expect(
      resolveNewsChannel({
        title: "꼬마빌딩 가족법인 증여·가업상속공제 절세 체크포인트",
        topic: "tax",
      })
    ).toBe("tax_wealth");

    expect(
      resolveNewsChannel({
        title: "프리즈 서울·국립현대미술관 가을 컬렉터 특별전 개막",
        summary: "건축가 설계 갤러리 투어와 클래식 공연",
      })
    ).toBe("culture_lifestyle");

    expect(
      resolveNewsChannel({
        title: "성수·한남 플래그십 스토어와 스페셜티 로스터리 팝업 트렌드",
        summary: "리테일 테넌트 유입으로 골목상권 체류시간 증가",
      })
    ).toBe("commercial_trend");

    expect(
      resolveNewsChannel({
        title: "강남·서초 중소형 빌딩 매매 실거래가 회복세",
        topic: "transaction",
      })
    ).toBe("real_estate");
  });

  it("enrichNewsPoolWithChannels: 부동산 편중 DB 뉴스만 있어도 5대 채널 기사를 보충한다", () => {
    const dbOnlyRealEstate = [
      {
        id: "db-1",
        title: "역삼동 오피스 빌딩 매매 거래 증가",
        summary: "수익형 빌딩 매수 문의 확대",
        source: "한국경제",
        topic: "transaction",
      },
    ];
    const enriched = enrichNewsPoolWithChannels(dbOnlyRealEstate);
    expect(enriched.length).toBeGreaterThan(dbOnlyRealEstate.length);

    const byChannel = new Set(enriched.map((item) => resolveNewsChannel(item)));
    expect(byChannel.size).toBe(5);
  });

  it("recommendBalancedNewsMix: 간편 모드(3건)와 상세 모드(5건)에서 다채널 황금배합을 자동 선별한다", () => {
    const pool = enrichNewsPoolWithChannels([]);

    const simplePickIds = recommendBalancedNewsMix(pool, 3);
    expect(simplePickIds).toHaveLength(3);
    const simpleChannels = new Set(
      simplePickIds.map((id) => {
        const found = pool.find((n) => String(n.id) === id)!;
        return resolveNewsChannel(found);
      })
    );
    // 3건을 뽑으면 최소 3개 서로 다른 채널(부동산 + 경제 + 문화/절세)이 섞여야 한다
    expect(simpleChannels.size).toBe(3);

    const fullPickIds = recommendBalancedNewsMix(pool, 5);
    expect(fullPickIds).toHaveLength(5);
    const fullChannels = new Set(
      fullPickIds.map((id) => {
        const found = pool.find((n) => String(n.id) === id)!;
        return resolveNewsChannel(found);
      })
    );
    expect(fullChannels.size).toBeGreaterThanOrEqual(4);
  });
});

describe("NewsCurationPanel & SimpleNewsPicker & NewsSection 다채널 UI 렌더링", () => {
  const pool = enrichNewsPoolWithChannels([]);

  it("NewsCurationPanel: 6개 채널 탭, 황금배합 자동 선별 버튼, 최신 뉴스 불러오기, 직접 기사 추가 버튼을 렌더한다", () => {
    const selected = new Set(recommendBalancedNewsMix(pool, 4));
    const html = renderToStaticMarkup(
      React.createElement(NewsCurationPanel, {
        allNews: pool,
        selectedNewsIds: selected,
        toggleNews: noop,
        onReplaceSelection: noop,
        onAppendNews: noop,
      })
    );

    expect(html).toContain("(4/6 선택)");
    expect(html).toContain("매수자 관심 황금배합 자동 선별");
    expect(html).toContain("최신 뉴스 불러오기");
    expect(html).toContain("직접 기사 추가");
    // 5대 채널 탭 확인
    expect(html).toContain("부동산·빌딩");
    expect(html).toContain("경제·금리");
    expect(html).toContain("절세·상속");
    expect(html).toContain("문화·라이프");
    expect(html).toContain("상권·트렌드");
    expect(html).toContain('data-testid="selected-channel-mix-bar"');
  });

  it("SimpleNewsPicker: 간편 모드에서 선택된 뉴스의 채널 배지와 황금배합 3선 버튼을 표시한다", () => {
    const selected = new Set(recommendBalancedNewsMix(pool, 3));
    const html = renderToStaticMarkup(
      React.createElement(SimpleNewsPicker, {
        allNews: pool,
        selectedNewsIds: selected,
        toggleNews: noop,
        onReplaceSelection: noop,
      })
    );

    expect(html).toContain("3 / 최대 3건 선택됨");
    expect(html).toContain("부동산·경제·문화 황금배합 3선 자동 맞춤");
    expect(html).toContain("5대 채널에서 다른 뉴스 고르기");
    expect(html).toContain('data-testid="simple-selected-news-preview"');
  });

  it("NewsSection(독자 뷰어): 채널 배지와 원문 보기 링크를 안전하게 렌더링한다", () => {
    const topNews = pickTopNews({
      topNews: [
        {
          id: "n-culture",
          title: "건축가가 설계한 성수·한남 복합문화공간 투어",
          summary: "도심 속 갤러리와 건축 재생 공간 소개",
          source: "한국경제 아르떼",
          sentiment: "positive",
          topic: "culture",
          channel: "culture_lifestyle",
          url: "https://www.arte.co.kr/sample",
        },
      ],
    });

    expect(topNews[0].channel).toBe("culture_lifestyle");
    expect(topNews[0].url).toBe("https://www.arte.co.kr/sample");

    const html = renderToStaticMarkup(React.createElement(NewsSection, { items: topNews }));
    expect(html).toContain('data-testid="viewer-news-channel-badge"');
    expect(html).toContain("문화·라이프");
    expect(html).toContain("문화·예술");
    expect(html).toContain("원문 보기 ↗");
    expect(html).toContain('href="https://www.arte.co.kr/sample"');
  });
});
