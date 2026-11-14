// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { buildDefaultMonthlyGraphicPair } from "@/domain/magazine/monthly-stats-hydration";

describe("P2 뉴스레터 에디터 미니멀리스트 인지 최적화 & 양방향 에디터 ↔ 미리보기 동기화", () => {
  let fetchCalls: Array<{ url: string; method: string; body: string | null }> = [];
  let mockEditionsResponse: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    fetchCalls = [];
    mockEditionsResponse = [];
    window.localStorage.clear();

    // jsdom scrollIntoView 폴리필
    Element.prototype.scrollIntoView = vi.fn();

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
            brokerOffice: "에이스빌딩중개법인",
            brokerPhone: "02-555-1234",
            subscriberCount: 24,
            highInterestCount: 6,
            editions: mockEditionsResponse,
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
            id: "eeeeeeee-1111-4111-8111-111111111111",
            editionId: "eeeeeeee-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-ace",
            publicUrl:
              "http://localhost:3000/magazine/gangnam-ace/2026-11-01?edition=eeeeeeee-1111-4111-8111-111111111111",
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

  it("1. 초기 빈 상태에서 newsletter-preview-pregeneration-card 와 pre_generation 상태바를 표시하고, DOM 순서 계약을 지키며, [① 표지 제목 입력하기] 클릭 시 #newsletter-headline-input 에 포커스한다", async () => {
    render(<MagazineEditorPage />);

    const causalityBar = await screen.findByTestId("preview-causality-bar");
    expect(causalityBar.getAttribute("data-lifecycle")).toBe("pre_generation");

    const pregenCard = screen.getByTestId("newsletter-preview-pregeneration-card");
    expect(pregenCard.textContent).toContain("내 뉴스레터가 완성됩니다");
    expect(pregenCard.textContent).toContain("표지 제목");
    expect(screen.getByTestId("preview-sample-framing-banner").textContent).toContain(
      "기본 예시 구성 · 제목을 입력하면 내 뉴스레터로 전환됩니다",
    );

    // 초기 빈 상태에서도 <article aria-label="실시간 뉴스레터 미리보기"> 및 필수 섹션 DOM 순서 보장
    const article = screen.getByRole("article", { name: "실시간 뉴스레터 미리보기" });
    expect(article).toBeTruthy();

    const statsSection = screen.getByTestId("preview-monthly-stats-section");
    const issuesSection = screen.getByTestId("preview-axios-postit-section");
    const dealsSection = screen.getByTestId("preview-featured-deals-section");
    const brokerSection = screen.getByTestId("preview-broker-contact-section");

    // 빈 브리핑일 때 preview-market-briefing-section 은 null 이어야 함
    expect(screen.queryByTestId("preview-market-briefing-section")).toBeNull();

    expect(
      Boolean(statsSection.compareDocumentPosition(issuesSection) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(issuesSection.compareDocumentPosition(dealsSection) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(dealsSection.compareDocumentPosition(brokerSection) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    // [① 표지 제목 입력하기] 클릭 -> #newsletter-headline-input 포커스
    const primaryBtn = within(pregenCard).getByRole("button", { name: "① 표지 제목 입력하기" });
    await act(async () => {
      fireEvent.click(primaryBtn);
    });

    const headlineInput = document.querySelector<HTMLInputElement>("#newsletter-headline-input");
    expect(headlineInput).not.toBeNull();
    expect(document.activeElement).toBe(headlineInput);
  });

  it("2. 표지 제목을 입력하면 즉시 live_draft 로 전환되어 미리보기 <h2> 가 갱신되고 pregeneration 카드가 제거된다", async () => {
    render(<MagazineEditorPage />);

    const headlineInput = await screen.findByLabelText(/표지 제목/i);
    await act(async () => {
      fireEvent.change(headlineInput, {
        target: { value: "11월 강남 역세권 꼬마빌딩 매수 타이밍 점검" },
      });
    });

    expect(screen.getByTestId("preview-causality-bar").getAttribute("data-lifecycle")).toBe(
      "live_draft",
    );
    expect(screen.queryByTestId("newsletter-preview-pregeneration-card")).toBeNull();
    expect(screen.queryByTestId("preview-sample-framing-banner")).toBeNull();

    const previewArticle = screen.getByRole("article", { name: "실시간 뉴스레터 미리보기" });
    const h2 = previewArticle.querySelector("h2");
    expect(h2?.textContent).toBe("11월 강남 역세권 꼬마빌딩 매수 타이밍 점검");
  });

  it("3. 미리보기 항목 클릭 시 해당 에디터 탭 전환 및 정확한 입력칸 포커스(이슈 #3, 통계 #2, 중개사 프로필 안내)와 역방향 포커스 하이라이트가 동작한다", async () => {
    render(<MagazineEditorPage />);

    // 초기 탭은 ① 제목("title")
    expect(screen.getByTestId("step-tab-title").getAttribute("aria-selected")).toBe("true");

    // (a) 미리보기에서 이슈 3번 카드(preview-postit-card-2) 클릭 -> ② 내용 탭 전환 & #axios-issue-title-2 포커스
    const issueCard2 = await screen.findByTestId("preview-postit-card-2");
    await act(async () => {
      fireEvent.click(issueCard2);
    });

    expect(screen.getByTestId("step-tab-content").getAttribute("aria-selected")).toBe("true");
    const issueInput2 = document.querySelector<HTMLInputElement>("#axios-issue-title-2");
    expect(issueInput2).not.toBeNull();
    expect(document.activeElement).toBe(issueInput2);

    // (b) 미리보기에서 월간 통계 그래픽 2번(preview-monthly-chart-card-1) 클릭 -> #monthly-stat-val-1 포커스
    const chartCard1 = screen.getByTestId("preview-monthly-chart-card-1");
    await act(async () => {
      fireEvent.click(chartCard1);
    });

    const statVal1 = document.querySelector<HTMLInputElement>("#monthly-stat-val-1");
    expect(statVal1).not.toBeNull();
    expect(document.activeElement).toBe(statVal1);

    // (c) 에디터 입력칸(#axios-issue-title-0)에 포커스하면 우측 미리보기 유닛(nl-unit-issue-0)이 활성화된다
    const issueInput0 = document.querySelector<HTMLInputElement>("#axios-issue-title-0");
    expect(issueInput0).not.toBeNull();
    await act(async () => {
      fireEvent.focus(issueInput0!);
    });
    const previewUnit0 = document.querySelector('[data-preview-unit-id="nl-unit-issue-0"]');
    expect(previewUnit0?.getAttribute("data-preview-active")).toBe("true");

    // (d) 미리보기 하단 중개사 정보(preview-broker-contact-section) 클릭 -> 프로필 안내 배너 노출
    const brokerSection = screen.getByTestId("preview-broker-contact-section");
    await act(async () => {
      fireEvent.click(brokerSection);
    });

    const banner = await screen.findByTestId("newsletter-status-banner");
    expect(banner.textContent).toContain("/broker/profile");
  });

  it("4. 중복 설정 카드 제거(Tab ① 1회 마운트 + hidden 접기) 및 Tab ② 최상단 BlockSelectionGrid 배치·비활성 코너 보호·단일 체크리스트가 적용된다", async () => {
    render(<MagazineEditorPage />);

    // Tab ①에서 broker-newsletter-preferences-card 는 정확히 1개이며 기본 접힘(hidden) 상태지만 칩은 DOM에 존재
    const prefCardsInTab1 = screen.getAllByTestId("broker-newsletter-preferences-card");
    expect(prefCardsInTab1).toHaveLength(1);
    expect(screen.getByTestId("toggle-broker-prefs-btn").textContent).toContain("설정 바꾸기");

    const savePrefsBtn = screen.getByTestId("save-broker-prefs-btn");
    expect(savePrefsBtn.closest(".hidden")).not.toBeNull();
    expect(document.querySelectorAll('[data-testid^="pref-region-chip-"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-testid^="pref-channel-chip-"]').length).toBeGreaterThan(0);

    // 시장 분위기 칩 역시 기본 접힘(hidden) 상태이나 DOM에는 마운트 유지
    const moodGroup = document.querySelector('[aria-label="이번 달 시장 분위기 선택"]');
    expect(moodGroup).not.toBeNull();
    expect(moodGroup?.closest(".hidden")).not.toBeNull();

    // Tab ②로 이동 -> broker-newsletter-preferences-card 중복 마운트가 없어야 함 (0개)
    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-content"));
    });
    expect(screen.queryAllByTestId("broker-newsletter-preferences-card")).toHaveLength(0);

    // Tab ② 최상단에 block-selection-grid 가 market-briefing-editor 보다 먼저 위치
    const blockGrid = screen.getByTestId("block-selection-grid");
    const briefingEditor = screen.getByTestId("market-briefing-editor");
    expect(
      Boolean(blockGrid.compareDocumentPosition(briefingEditor) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    // 시장 브리핑(field_note) 코너 OFF 시 안내 배너 표시 + 입력 본문 hidden 보호 + 입력 요소 DOM 유지
    const briefingSwitch = within(blockGrid).getByRole("switch", { name: /시장 브리핑/ });
    await act(async () => {
      fireEvent.click(briefingSwitch);
    });
    expect(screen.getByTestId("briefing-section-disabled-notice")).toBeTruthy();
    expect(screen.getByTestId("market-briefing-editor-body").classList.contains("hidden")).toBe(
      true,
    );
    expect(document.querySelector("#newsletter-briefing-title")).toBeNull();
    expect(document.querySelector("#newsletter-summary-input")).toBeNull();
    expect(document.querySelector("#newsletter-briefing-body")).not.toBeNull();

    // DealSlotAssigner 행 내부에는 중복 <button>("담기"/"선택됨") 없이 단일 체크박스 라벨만 존재
    await waitFor(() => expect(screen.getByTestId("deal-slot-item-deal-1")).toBeTruthy());
    const dealRow = screen.getByTestId("deal-slot-item-deal-1");
    expect(dealRow.querySelectorAll("button")).toHaveLength(0);
    expect(dealRow.querySelector('#deal-checkbox-deal-1')).not.toBeNull();

    // Tab ③ 이동 시 MagazinePublishChecklist 가 좌우 중복(2개)으로 뜨지 않고 정확히 1개만 표시 + 하단 발송 버튼 존재
    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-send"));
    });
    expect(screen.getAllByTestId("magazine-publish-checklist")).toHaveLength(1);
    expect(screen.getByTestId("newsletter-step3-send-btn").textContent).toContain(
      "구독자에게 보내기",
    );
  });

  it("5. 발행 완료 후 편집(Post-publish edit) 시 preview-causality-bar 가 published_dirty 로 전환되고 저장 버튼이 '발행본에 수정 반영'으로 바뀐다", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });

    render(<MagazineEditorPage />);

    // 제목·브리핑 입력 및 추천 매물 1건 선택 후 링크 복사로 서버 발행(isPublished = true) 실행
    await act(async () => {
      fireEvent.change(await screen.findByLabelText(/표지 제목/i), {
        target: { value: "11월 강남권 빌딩 발행본 초기 제목" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-send"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-link-btn"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("preview-causality-bar").getAttribute("data-lifecycle")).toBe(
        "published_clean",
      ),
    );
    expect(screen.getByTestId("newsletter-draft-save-btn").textContent).toContain("저장됨 ✓");
    expect(screen.getByTestId("preview-live-reader-link")).toBeTruthy();

    // 발행 후 다시 ① 제목 탭으로 돌아가 제목을 수정하면 즉시 published_dirty 로 전환
    await act(async () => {
      fireEvent.click(screen.getByTestId("step-tab-title"));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/표지 제목/i), {
        target: { value: "11월 강남권 빌딩 발행본 수정된 제목" },
      });
    });

    expect(screen.getByTestId("preview-causality-bar").getAttribute("data-lifecycle")).toBe(
      "published_dirty",
    );
    expect(screen.getByTestId("newsletter-draft-save-btn").textContent).toContain(
      "발행본에 수정 반영",
    );

    // [발행본에 수정 반영] 클릭 시 서버 저장 후 다시 published_clean 으로 복귀
    await act(async () => {
      fireEvent.click(screen.getByTestId("newsletter-draft-save-btn"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("preview-causality-bar").getAttribute("data-lifecycle")).toBe(
        "published_clean",
      ),
    );
    expect(screen.getByTestId("newsletter-draft-save-btn").textContent).toContain("저장됨 ✓");
  });
});
