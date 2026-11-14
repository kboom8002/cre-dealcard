import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/hooks/use-magazine-analytics", () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));
vi.mock("@/components/magazine/LazyIslands", async () => {
  const roi = await import("@/components/magazine/RoiIsland");
  const fwd = await import("@/components/magazine/ForwardSection");
  return { LazyRoiCalculator: roi.default, LazyForwardSection: fwd.ForwardSection };
});

import {
  ISSUE_CARD_COUNT,
  POST_IT_TONES,
  POST_IT_TONE_META,
  clusterArticlesIntoFiveIssues,
  formatAxiosBrief,
  formatSingleLineTitle,
} from "@/domain/magazine/issue-clustering";
import {
  MONTHLY_REGION_PRESETS,
  MONTHLY_CHART_TYPE_META,
  getMonthlyChartsForRegion,
} from "@/domain/magazine/monthly-stats-charts";
import { EditionAirtableList, type AirtableEditionItem } from "@/components/magazine-editor/EditionAirtableList";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import { MonthlyStatsEditorPanel } from "@/components/magazine-editor/MonthlyStatsEditorPanel";
import { EditorCoverTab } from "@/components/magazine-editor/EditorCoverTab";
import { getPrimaryTabsForCadence } from "@/app/(broker)/broker/magazine-editor/page";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { editionContentDraftSchema } from "@/domain/magazine/edition-content.schema";
import { defaultLabelForEditionType, kindOfEditionType } from "@/lib/magazine/edition-draft";

const SAMPLE_NEWS_POOL = [
  {
    id: "n1",
    title: "[한국경제] 한은 기준금리 인하 기대감에 강남권 꼬마빌딩 매수세 회복",
    summary:
      "핵심 팩트: 기준금리 인하 기대감으로 강남·서초 중소형 빌딩 매수 문의가 전월 대비 18% 증가했습니다. | 브로커 임플리케이션: 대출 조달 금리 하락으로 레버리지 매수자의 자금 여력이 확대되고 있습니다. | 추천 액션: 4%대 Cap Rate 진입 가능 매물을 선점하세요.",
    source: "한국경제",
    topic: "finance",
    sentiment: "bullish",
  },
  {
    id: "n2",
    title: "성수·연무장길 플래그십 스토어 임대료 상승세 지속",
    summary:
      "성수동 연무장길 일대 리테일 공실률이 3.4%까지 낮아지며 핵심 상권 임대료가 강세를 보이고 있습니다. 글로벌 브랜드와 사옥 수요가 동시에 유입되며 평당 매매가도 견조한 흐름입니다.",
    source: "매일경제",
    topic: "commercial_trend",
    sentiment: "bullish",
  },
];

describe("Newsletter Service Advancement (7 Broker Requirements Verification)", () => {
  describe("1 & 2. 3-Column Layout & Airtable-Style Intelligent List", () => {
    it("renders 3-column workspace slots (list + editor + preview) in magazine-editor/page.tsx", () => {
      const pageSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(broker)/broker/magazine-editor/page.tsx"),
        "utf8"
      );
      const listSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/magazine-editor/EditionAirtableList.tsx"),
        "utf8"
      );
      expect(pageSrc).toContain('data-testid="magazine-three-column-layout"');
      expect(pageSrc).toContain("<EditionAirtableList");
      expect(listSrc).toContain('data-testid="magazine-list-slot"');
      expect(pageSrc).toContain('data-testid="magazine-editor-slot"');
      expect(pageSrc).toContain('data-testid="magazine-preview-slot"');
    });

    it("renders Airtable-style intelligent list with cadence switcher, formula banner, and completion pills", () => {
      const editions: AirtableEditionItem[] = [
        {
          id: "ed-daily-1",
          edition_type: "daily",
          edition_label: "2026-11-06",
          status: "draft",
          title: "[일간 브리핑] 강남 역세권 급매 포착",
          updated_at: "2026-11-06T09:00:00Z",
          published_at: null,
          hasBriefing: false,
          issueCount: 5,
          chartCount: 0,
          dealCount: 2,
        },
        {
          id: "ed-weekly-1",
          edition_type: "weekly",
          edition_label: "W45-2026",
          status: "published",
          title: "금리 인하 기대감 속 역삼동 꼬마빌딩 회복 신호",
          updated_at: "2026-11-05T10:00:00Z",
          published_at: "2026-11-05T10:00:00Z",
          hasBriefing: true,
          issueCount: 5,
          chartCount: 0,
          dealCount: 3,
          viewCount: 128,
        },
        {
          id: "ed-monthly-1",
          edition_type: "monthly",
          edition_label: "2026-11",
          status: "draft",
          title: "[월간 리포트] 강남·서초 실거래 및 공실률 분석",
          updated_at: "2026-11-01T09:00:00Z",
          published_at: null,
          hasBriefing: false,
          issueCount: 5,
          chartCount: 2,
          dealCount: 2,
        },
      ];

      const html = renderToStaticMarkup(
        <EditionAirtableList
          editions={editions}
          activeEditionId="ed-weekly-1"
          activeCadence="weekly"
          onSelectEdition={() => {}}
          onSwitchOrCreateCadence={() => {}}
          onDuplicateEdition={() => {}}
        />
      );

      expect(html).toContain('data-testid="magazine-list-slot"');
      expect(html).toContain('data-testid="cadence-btn-daily"');
      expect(html).toContain('data-testid="cadence-btn-weekly"');
      expect(html).toContain('data-testid="cadence-btn-monthly"');
      expect(html).toContain("헤더 + 제목 + 중개인 브리핑 + 이슈 5건 + 딜카드");
      expect(html).toContain("브리핑 ✓");
      expect(html).toContain("통계 2/2");
      expect(html).toContain("이슈 5/5");
      expect(html).toContain("딜 3건");
      expect(html).toContain("👁 128");
    });
  });

  describe("3. Minimalist Editor Top Navigation (<= 4 Tabs per Cadence)", () => {
    it("strictly enforces 4 or fewer primary tabs for Daily (3), Weekly (4), and Monthly (4)", () => {
      const dailyTabs = getPrimaryTabsForCadence("daily");
      const weeklyTabs = getPrimaryTabsForCadence("weekly");
      const monthlyTabs = getPrimaryTabsForCadence("monthly");

      expect(dailyTabs.length).toBe(3);
      expect(dailyTabs.length).toBeLessThanOrEqual(4);
      expect(dailyTabs.map((t) => t.key)).toEqual(["cover", "news", "theme_deals"]);

      expect(weeklyTabs.length).toBe(4);
      expect(weeklyTabs.length).toBeLessThanOrEqual(4);
      expect(weeklyTabs.map((t) => t.key)).toEqual([
        "cover",
        "field_note",
        "news",
        "theme_deals",
      ]);

      expect(monthlyTabs.length).toBe(4);
      expect(monthlyTabs.length).toBeLessThanOrEqual(4);
      expect(monthlyTabs.map((t) => t.key)).toEqual([
        "cover",
        "monthly_stats",
        "news",
        "theme_deals",
      ]);
    });
  });

  describe("4. 3 Separate Cadences (Daily / Weekly / Monthly) & Official MOLIT/KOSIS Regional Stats", () => {
    it("supports daily, weekly, and monthly edition labels and schema validation", () => {
      const d = new Date("2026-11-06T03:00:00Z");
      expect(kindOfEditionType("daily")).toBe("daily");
      expect(kindOfEditionType("weekly")).toBe("weekly");
      expect(kindOfEditionType("monthly")).toBe("monthly");

      expect(defaultLabelForEditionType("daily", d)).toBe("2026-11-06");
      expect(defaultLabelForEditionType("monthly", d)).toBe("2026-11");
      expect(defaultLabelForEditionType("weekly", d)).toMatch(/^W\d{2}-2026$/);

      const monthlyCharts = getMonthlyChartsForRegion("gbd");
      expect(monthlyCharts).toHaveLength(2);
      expect(monthlyCharts[0].authorityLabel).toContain("국토교통부");
      expect(monthlyCharts[1].authorityLabel).toContain("한국부동산원");

      const parsed = editionContentDraftSchema.safeParse({
        kind: "monthly",
        headline: "11월 강남권 빌딩 실거래 및 임대동향",
        monthlyRegion: "gbd",
        monthlyCharts,
        unitIssues: clusterArticlesIntoFiveIssues(SAMPLE_NEWS_POOL, { cadence: "monthly" }),
      });
      expect(parsed.success).toBe(true);
    });

    it("renders MonthlyStatsEditorPanel with 5 Seoul commercial regions and 3 official MOLIT/KOSIS chart presets", () => {
      const charts = getMonthlyChartsForRegion("seongsu");
      const html = renderToStaticMarkup(
        <MonthlyStatsEditorPanel
          monthlyRegion="seongsu"
          onChangeRegion={() => {}}
          monthlyCharts={charts}
          onChangeCharts={() => {}}
        />
      );

      expect(html).toContain('data-testid="monthly-stats-editor-panel"');
      for (const region of MONTHLY_REGION_PRESETS) {
        expect(html).toContain(region.shortLabel);
      }
      expect(html).toContain("국토부 실거래량·평당가");
      expect(html).toContain("부동산원 공실률·Cap Rate");
      expect(html).toContain("통계청(KOSIS) 상권 활력지수");
      expect(html).toContain("성수·광진");
    });
  });

  describe("5. AI-Clustered AXIOS Unit Issues (1-Line Title + 2~4 Sentence Brief + Wide Post-it Memo Cards)", () => {
    it("clusters articles into exactly 5 AXIOS issues with 1-line title, 2~4 sentence brief without pipes, and 5 pastel tones", () => {
      const issues = clusterArticlesIntoFiveIssues(SAMPLE_NEWS_POOL, { cadence: "weekly" });
      expect(issues).toHaveLength(ISSUE_CARD_COUNT);
      expect(issues.map((u) => u.memoTone)).toEqual([...POST_IT_TONES]);

      for (const issue of issues) {
        expect(issue.title).not.toContain("\n");
        expect(issue.brief).not.toContain("|");
        expect(issue.brief).not.toContain("핵심 팩트:");
        expect(issue.brief).not.toContain("브로커 임플리케이션:");
        const sentences = issue.brief
          .split(/(?<=[.!?。])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        // 2026-11 Overhaul: 제목 44자 이내(2줄 권장), 상세 해설 74자 이내(3줄 분량)
        expect(sentences.length).toBeGreaterThanOrEqual(1);
        expect(sentences.length).toBeLessThanOrEqual(2);
        expect(Array.from(issue.brief).length).toBeLessThanOrEqual(74);
        expect(Array.from(issue.title).length).toBeLessThanOrEqual(44);
      }

      const panelHtml = renderToStaticMarkup(
        <AxiosIssuesEditorPanel
          unitIssues={issues}
          onChangeUnitIssues={() => {}}
          newsPool={SAMPLE_NEWS_POOL}
          cadenceLabel="주간"
        />
      );
      expect(panelHtml).toContain('data-testid="axios-issues-editor-panel"');
      expect(panelHtml).toContain('data-testid="recluster-five-issues-btn"');
      expect(panelHtml).not.toContain("ISSUE 01");
      expect(panelHtml).not.toContain("ISSUE 05");
      expect(panelHtml).toContain('data-testid="axios-issue-channel-0"');
    });
  });

  describe("6 & 7. Single-Line Newsletter Title & Clean Uncluttered Reader Detail View", () => {
    it("enforces single-line title in EditorCoverTab and MagazineView, renders wide Post-it cards and Monthly 2-charts, and removes clutter", () => {
      const coverHtml = renderToStaticMarkup(
        <EditorCoverTab
          marketTemp="선별 매수"
          setMarketTemp={() => {}}
          coverKeywords={["금리 인하", "꼬마빌딩", "역세권"]}
          updateKeyword={() => {}}
          headline={formatSingleLineTitle("강남 오피스 거래 회복\n3분기 선별 매수 전략")}
          setHeadline={() => {}}
          briefing="이번 주 핵심 요약입니다."
          setBriefing={() => {}}
          coverImageUrl={null}
          setCoverImageUrl={() => {}}
        />
      );
      expect(coverHtml).toContain("뉴스레터 제목 (한 줄 표시)");
      expect(coverHtml).toContain("whitespace-nowrap");

      const unitIssues = clusterArticlesIntoFiveIssues(SAMPLE_NEWS_POOL, { cadence: "monthly" });
      const monthlyCharts = getMonthlyChartsForRegion("gbd");

      const viewHtml = renderToStaticMarkup(
        <MagazineView
          data={{
            kind: "monthly",
            broker: { name: "김중개", company: "딜카드부동산", phone: "010-1234-5678" },
            headline: "11월 강남·서초 빌딩 실거래 및 공실률 리포트",
            field_note: { comment: "이번 달 핵심 코멘트입니다." },
            monthly_region: "gbd",
            monthly_charts: monthlyCharts,
            unit_issues: unitIssues,
            featured_deals: [
              { id: "deal-1", assetType: "꼬마빌딩", address: "역삼동", price: 8_500_000_000 },
            ],
          }}
          brokerId="kim-jung-gae"
          brokerSlug="kim-jung-gae"
          date="2026-11-06"
          dateLabel="2026년 11월 6일 (금)"
        />
      );

      // 6. Clean break-keep title in h1 (avoid horizontal clipping on mobile)
      expect(viewHtml).toContain('data-single-line-title="true"');
      expect(viewHtml).toMatch(/<h1[^>]*break-keep[^>]*>11월 강남·서초 빌딩 실거래 및 공실률 리포트<\/h1>/);

      // 5. 5 AXIOS Glass Cards rendered with pastel tones and no ISSUE 01 numbering
      expect(viewHtml).toContain('data-testid="axios-postit-list"');
      expect((viewHtml.match(/data-testid="axios-postit-card"/g) ?? []).length).toBe(5);
      expect(viewHtml).not.toContain("ISSUE 01");
      for (const tone of POST_IT_TONES) {
        expect(viewHtml).toContain(`data-postit-tone="${tone}"`);
        // 2026-11 사용자 스펙: 포스트잇 → 글래스모피즘·그래디언트 카드뉴스 배경
        expect(viewHtml).toContain('data-card-style="glass"');
        expect(POST_IT_TONE_META[tone].glassBackground).toMatch(/linear-gradient/);
      }

      // 7. Uncluttered detail view: no bottom utility bar, no 6-button quick-scroll jump bar, no duplicate field_note quote in header
      expect(viewHtml).not.toContain("data-magazine-bottom-bar");
      expect(viewHtml).not.toContain("data-quick-scroll");
      expect(viewHtml).toContain('data-testid="minimal-subscribe-optin"');
      const headerHtml = viewHtml.slice(
        viewHtml.indexOf('data-section-id="cover"'),
        viewHtml.indexOf("</header>")
      );
      expect(headerHtml).not.toContain("이번 달 핵심 코멘트입니다.");
    });
  });
});
