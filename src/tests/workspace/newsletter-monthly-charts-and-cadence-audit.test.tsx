// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { applySimplePreset } from "@/lib/magazine/simple-format";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import {
  getMonthlyChartsForRegion,
  MONTHLY_STATS_PLACEHOLDER_MESSAGE,
  MONTHLY_STATS_PREPARING_LABEL,
} from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
} from "@/domain/magazine/monthly-stats-hydration";

describe("월간 상단 통계 그래픽 2선 복원 및 일간·주간·월간 주기별 구성 정합성 감사", () => {
  let fetchCalls: Array<{ url: string; method: string; body: string | null }> = [];

  beforeEach(() => {
    fetchCalls = [];
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? init.body : null;
        fetchCalls.push({ url, method, body });

        if (url.includes("/api/magazine/editions")) {
          return Response.json({
            ok: true,
            brokerId: "11111111-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-ace",
            brokerName: "이상은 공인중개사",
            subscriberCount: 18,
            highInterestCount: 5,
            editions: [],
          });
        }
        if (url.includes("/api/broker/buildings")) {
          return Response.json({
            ok: true,
            buildings: [
              {
                id: "deal-1",
                building_name: "역삼 코너 근생빌딩",
                address: "서울 강남구 역삼동",
                sale_price: 8_500_000_000,
                cap_rate: 4.2,
                photo_url: null,
              },
            ],
          });
        }
        if (url.includes("/api/broker/magazine/monthly-stats")) {
          return Response.json({
            ok: true,
            regionKey: "gbd",
            liveDbAvailable: false,
            charts: buildDefaultMonthlyGraphicPair("gbd"),
          });
        }
        if (url.includes("/api/magazine/issues") && method === "POST") {
          return Response.json({
            ok: true,
            id: "ed-monthly-2026-11",
            editionId: "ed-monthly-2026-11",
            brokerSlug: "gangnam-ace",
            publicUrl:
              "http://localhost:3000/magazine/gangnam-ace/2026-11-01?edition=ed-monthly-2026-11",
          });
        }
        return Response.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("[T1] 월간 뉴스레터 기본 진입 시 상단 주요 통계 그래픽 2선(글래스모피즘 바 그래픽)이 핵심 이슈 5선보다 위에 표시된다", async () => {
    render(<MagazineEditorPage />);

    const statsSection = await screen.findByTestId("preview-monthly-stats-section");
    const issuesSection = await screen.findByTestId("preview-axios-postit-section");

    // 1. 그래픽 2개가 글래스모피즘 카드로 렌더링되고 막대 시리즈가 존재해야 함
    const chart0 = screen.getByTestId("preview-monthly-chart-card-0");
    const chart1 = screen.getByTestId("preview-monthly-chart-card-1");
    expect(chart0.getAttribute("data-card-style")).toBe("glass");
    expect(chart1.getAttribute("data-card-style")).toBe("glass");
    expect(statsSection.querySelectorAll('[data-testid="monthly-stat-bar"]').length).toBeGreaterThanOrEqual(8);

    // 2. 우측 미리보기에서 상단 통계 그래픽 2선이 반드시 핵심 이슈 5선보다 위(DOM 선행)에 위치해야 함
    const position = statsSection.compareDocumentPosition(issuesSection);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("[T2] 월간 에디터 ② 내용 단계에서 권역·지표 2종 조합 변경 및 시사점 수정이 미리보기와 POST /api/magazine/issues 저장 본문에 즉시 반영된다", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });

    render(<MagazineEditorPage />);

    // 표지 제목 입력
    fireEvent.change(screen.getByLabelText(/표지 제목/i), {
      target: { value: "11월 성수·광진 중소형 빌딩 수익률 및 시장 리포트" },
    });

    // ② 내용 단계 이동
    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-content"));
    });

    const authoringCard = await screen.findByTestId("monthly-stats-authoring-card");
    expect(authoringCard).toBeTruthy();

    // 성수·광진 권역으로 변경
    await act(async () => {
      fireEvent.click(screen.getByTestId("monthly-stat-region-seongsu"));
    });

    expect(screen.getByTestId("preview-monthly-stats-section").textContent).toContain("성수·광진");

    // ③ 보내기 → 링크 복사로 서버 발행 실행
    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-send"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-link-btn"));
    });

    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.includes("/api/magazine/issues") && c.method === "POST")).toBe(true),
    );
    const postCall = fetchCalls.find((c) => c.url.includes("/api/magazine/issues") && c.method === "POST");
    const payload = JSON.parse(postCall?.body ?? "{}") as Record<string, unknown>;

    expect(payload.editionType).toBe("monthly");
    expect(payload.monthlyRegion).toBe("seongsu");
    expect(Array.isArray(payload.monthlyCharts)).toBe(true);
    expect((payload.monthlyCharts as unknown[]).length).toBe(2);
  });

  it("[T3] 일간·주간·월간 전환 시 주기별 기획 구성과 AI 초안 카드 문구가 정확히 분리된다", async () => {
    render(<MagazineEditorPage />);

    // 초기(월간): AI 초안 카드에 '이번 달' 표시 + 미리보기에 상단 통계 그래픽 2선 존재
    expect(screen.getByTestId("magazine-quick-draft-card").textContent).toContain("이번 달");
    expect(screen.queryByTestId("preview-monthly-stats-section")).not.toBeNull();

    // 주간(weekly) 전환: AI 초안 카드가 '이번 주'로 바뀌고, 월간 통계 그래픽은 숨겨지며 주간 브리핑+이슈5선이 표시됨
    await act(async () => {
      fireEvent.click(screen.getByTestId("quickstart-cadence-weekly"));
    });
    expect(screen.getByTestId("magazine-quick-draft-card").textContent).toContain("이번 주");
    expect(screen.queryByTestId("preview-monthly-stats-section")).toBeNull();
    expect(screen.getByTestId("preview-axios-postit-section").textContent).toContain("주간 핵심 시장 이슈 5선");

    // 일간(daily) 전환: AI 초안 카드가 '오늘'로 바뀌고, 빈 장문 브리핑 박스 없이 일간 핵심 시장 이슈 5선이 바로 상단에 표시됨
    await act(async () => {
      fireEvent.click(screen.getByTestId("quickstart-cadence-daily"));
    });
    expect(screen.getByTestId("magazine-quick-draft-card").textContent).toContain("오늘");
    expect(screen.queryByTestId("preview-monthly-stats-section")).toBeNull();
    expect(screen.getByTestId("preview-axios-postit-section").textContent).toContain("일간 핵심 시장 이슈 5선");
    expect(screen.queryByTestId("preview-market-briefing-section")).toBeNull();
  });

  it("[T4] 고객 공개 뷰어(MagazineView)에서 format='simple'(applySimplePreset) 저장본이더라도 월간은 상단 통계 그래픽 2개가 최상단에 오고, 일간은 이슈 5선이 최상단에 온다", () => {
    const unitIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "monthly" });
    const monthlyCharts = buildDefaultMonthlyGraphicPair("gbd");

    const simpleMonthlyPayload = applySimplePreset(
      {
        kind: "monthly",
        edition_type: "monthly",
        headline: "2026년 11월 강남·서초 빌딩 시장 월간 리포트",
        briefing: "이번 달 강남권 중소형 빌딩 시장은 선별 매수 흐름이 뚜렷합니다.",
        field_note: { comment: "역세권 코너 사옥형 매물 문의가 꾸준합니다." },
        monthlyRegion: "gbd",
        monthlyCharts,
        monthly_charts: monthlyCharts,
        unitIssues,
        unit_issues: unitIssues,
        featured_deals: [
          { id: "deal-1", assetType: "근생빌딩", address: "강남구 역삼동", price: 8_500_000_000 },
        ],
      },
      { brokerName: "이상은" },
    );

    const monthlyHtml = renderToStaticMarkup(
      <MagazineView
        data={simpleMonthlyPayload}
        brokerId="gangnam-ace"
        brokerSlug="gangnam-ace"
        date="2026-11-01"
        dateLabel="2026년 11월호"
      />,
    );

    const statsIdx = monthlyHtml.indexOf('data-testid="monthly-regional-charts-section"');
    const issuesIdx = monthlyHtml.indexOf('data-testid="axios-postit-list"');
    expect(statsIdx).toBeGreaterThan(0);
    expect(issuesIdx).toBeGreaterThan(0);
    // 상단 주요 통계 그래픽 2개가 이슈 5선 및 매물보다 반드시 먼저 렌더링되어야 함
    expect(statsIdx).toBeLessThan(issuesIdx);
    expect((monthlyHtml.match(/data-testid="monthly-regional-chart-card"/g) ?? []).length).toBe(2);

    // 일간(daily) simple 발행본 검증: 월간 통계 미노출 + 일간 핵심 시장 이슈 5선 정상 노출
    const dailyIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "daily" });
    const simpleDailyPayload = applySimplePreset(
      {
        kind: "daily",
        edition_type: "daily",
        headline: "오늘의 강남 상업용 빌딩 핵심 브리핑",
        briefing: "",
        field_note: { comment: "" },
        unitIssues: dailyIssues,
        unit_issues: dailyIssues,
        featured_deals: [
          { id: "deal-1", assetType: "근생빌딩", address: "강남구 역삼동", price: 8_500_000_000 },
        ],
      },
      { brokerName: "이상은" },
    );

    const dailyHtml = renderToStaticMarkup(
      <MagazineView
        data={simpleDailyPayload}
        brokerId="gangnam-ace"
        brokerSlug="gangnam-ace"
        date="2026-11-11"
        dateLabel="2026년 11월 11일 (수)"
      />,
    );

    expect(dailyHtml).not.toContain('data-testid="monthly-regional-charts-section"');
    expect(dailyHtml).toContain("일간 핵심 시장 이슈 5선");
  });

  it("[T5] 실거래·임대동향 DB 집계(public_db)와 온톨로지 기준 참고치(reference_benchmark) 및 NL-01 정직성 계약이 모두 공존한다", () => {
    // 1. NL-01 기본 무연결 슬롯 정직성 유지
    const rawPlaceholders = getMonthlyChartsForRegion("gbd");
    expect(rawPlaceholders[0].isPlaceholder).toBe(true);
    expect(rawPlaceholders[0].asOf).toBe(MONTHLY_STATS_PREPARING_LABEL);
    expect(rawPlaceholders[0].placeholderNotice).toBe(MONTHLY_STATS_PLACEHOLDER_MESSAGE);

    // 2. 온톨로지 기준치 기반 참고 그래픽 2선(가짜 월간 거래건수 창작 없음 + 출처 명시)
    const refCharts = buildDefaultMonthlyGraphicPair("seongsu");
    expect(refCharts).toHaveLength(2);
    for (const c of refCharts) {
      expect(c.isPlaceholder).toBe(false);
      expect(c.sourceMode).toBe("reference_benchmark");
      expect(c.series.length).toBeGreaterThanOrEqual(4);
      expect(c.authorityLabel).toContain("기준");
    }

    // 3. 공공 DB 행이 존재할 때 public_db 실측 차트로 승격
    const dbHydrated = hydrateMonthlyChartsFromDbRows({
      regionKey: "gbd",
      yearMonth: "2026-11",
      transactions: [
        { transaction_date: "2026-09-10", transaction_price: 9_000_000_000, building_area: 660, district: "강남구" },
        { transaction_date: "2026-10-12", transaction_price: 11_000_000_000, building_area: 720, district: "서초구" },
        { transaction_date: "2026-11-05", transaction_price: 12_500_000_000, building_area: 790, district: "강남구" },
      ],
      rentalRows: [
        { region: "gbd", quarter: "2026Q2", vacancy_rate: 3.1, rental_index: 103.2 },
        { region: "gbd", quarter: "2026Q3", vacancy_rate: 2.9, rental_index: 104.1 },
      ],
    });
    expect(dbHydrated).toHaveLength(2);
    expect(dbHydrated[0].sourceMode).toBe("public_db");
    expect(dbHydrated[1].sourceMode).toBe("public_db");
    expect(dbHydrated[0].isPlaceholder).toBe(false);
    expect(dbHydrated[1].isPlaceholder).toBe(false);
  });
});
