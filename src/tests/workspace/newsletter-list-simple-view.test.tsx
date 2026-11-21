// @vitest-environment jsdom
/**
 * 뉴스레터 작업공간 좌측 목록 개편 회귀 테스트
 *  - 기본 "간단히" 보기: 제목 · 날짜 · 상태 한 줄 (행 안 버튼 0개)
 *  - "자세히" 전환 시 기존 카드(주기 배지 · 슬러그 · 추천 매물 · 복제 · 삭제 + 썸네일) 복원
 *  - 접힌 "필터" 패널 안의 상태/주기 탭이 그대로 동작 + 활성 필터 칩 해제
 *  - 간단히 보기에서는 편집 화면 상단 SelectedItemActions 가 기존 복제/삭제 흐름을 호출
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";

const WEEKLY_ID = "ed-weekly-46";
const MONTHLY_ID = "aaaaaaaa-1111-4111-8111-111111111111";

const fetchCalls: Array<{ url: string; method: string }> = [];

beforeEach(() => {
  fetchCalls.length = 0;
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      fetchCalls.push({ url, method });
      if (url.startsWith("/api/magazine/editions") && method === "GET") {
        return Response.json({
          ok: true,
          brokerId: "11111111-1111-4111-8111-111111111111",
          brokerSlug: "gangnam-ace",
          brokerName: "에이스 중개",
          editions: [
            {
              id: WEEKLY_ID,
              edition_type: "weekly",
              edition_label: "W46-2026",
              status: "published",
              title: "이번 주 강남 빌딩 브리핑",
              content: { issueDate: "2026-11-10" },
            },
            {
              id: MONTHLY_ID,
              edition_type: "monthly",
              edition_label: "2026-11",
              status: "draft",
              title: "11월 월간 브리핑",
              updated_at: "2026-11-01T09:00:00Z",
              content: {},
            },
          ],
        });
      }
      if (url.startsWith("/api/broker/buildings")) {
        return Response.json({ ok: true, buildings: [] });
      }
      return Response.json({ ok: true });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function renderAndWaitForRows() {
  render(<MagazineEditorPage />);
  await waitFor(() => expect(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`)).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId(`magazine-edition-item-${MONTHLY_ID}`)).toBeTruthy());
}

describe("뉴스레터 좌측 목록 — 간단히/자세히 보기", () => {
  it("기본은 간단히 보기: 제목·날짜·상태와 1클릭 복제·삭제 인라인 액션을 노출하고 썸네일은 숨긴다", async () => {
    await renderAndWaitForRows();

    const listSlot = screen.getByTestId("magazine-list-slot");
    expect(within(listSlot).getByTestId("ws-list-control-zone")).toBeTruthy();
    expect(within(listSlot).getByTestId("ws-list-body-label").textContent).toBe("지난 뉴스레터 2건");

    // 기존 계약: 새로 쓰기 버튼 · 현재 호 라벨 · 발행 주기 선택 · 검색 입력
    expect(screen.getByTestId("new-newsletter-btn")).toBeTruthy();
    expect(screen.getByTestId("current-issue-label")).toBeTruthy();
    expect(screen.getByTestId("quickstart-cadence-selector")).toBeTruthy();
    expect(screen.getByTestId("edition-search-input")).toBeTruthy();

    // 설명 문단·카드 머리글 제거
    expect(listSlot.textContent).not.toContain("빠른 시작");
    expect(listSlot.textContent).not.toContain("이전 호 불러오기");

    const weeklyRow = screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`);
    expect(weeklyRow.getAttribute("data-list-row")).toBe("simple");
    expect(weeklyRow.textContent).toContain("이번 주 강남 빌딩 브리핑");
    expect(weeklyRow.textContent).toContain("발행됨");
    expect(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}-date`).textContent?.trim()).not.toBe("");
    expect(screen.getByTestId(`edition-cadence-badge-${WEEKLY_ID}`).textContent).toBe("주간");

    const monthlyRow = screen.getByTestId(`magazine-edition-item-${MONTHLY_ID}`);
    expect(monthlyRow.textContent).toContain("11월 월간 브리핑");
    expect(monthlyRow.textContent).toContain("작성 중");

    // 1클릭 인라인 복제·삭제 버튼이 행 내부에 제공되고 상단 중복 액션바는 제거됨
    expect(screen.getByTestId(`edition-duplicate-btn-${WEEKLY_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`edition-delete-btn-${WEEKLY_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`edition-delete-btn-${MONTHLY_ID}`)).toBeTruthy();
    expect(screen.queryByTestId("ws-selected-item-actions")).toBeNull();
    expect(screen.queryByTestId("ws-list-thumbnail")).toBeNull();
  });

  it("자세히로 바꾸면 기존 카드(주기 배지·추천 매물·복제·삭제)와 썸네일이 돌아오고 설정이 저장된다", async () => {
    await renderAndWaitForRows();

    await act(async () => {
      fireEvent.click(screen.getByTestId("ws-list-view-detailed"));
    });

    expect(window.localStorage.getItem("credeal-ws-list-view-v1")).toBe("detailed");
    const weeklyRow = screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`);
    expect(weeklyRow.getAttribute("data-list-row")).toBeNull();
    expect(weeklyRow.textContent).toContain("추천 매물");
    expect(screen.getByTestId(`edition-cadence-badge-${WEEKLY_ID}`).textContent).toBe("주간");
    expect(screen.getByTestId(`edition-duplicate-btn-${WEEKLY_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`edition-delete-btn-${MONTHLY_ID}`)).toBeTruthy();
    expect(screen.getAllByTestId("ws-list-thumbnail").length).toBe(2);

    // 자세히 보기에서는 편집 화면 상단 작업 막대를 띄우지 않음(testid 중복 방지)
    await act(async () => {
      fireEvent.click(weeklyRow);
    });
    expect(screen.queryByTestId("ws-selected-item-actions")).toBeNull();
  });
});

describe("뉴스레터 좌측 목록 — 접힌 필터 패널", () => {
  it("필터 패널은 접혀 있어도 상태·주기 탭이 동작하고, 활성 필터 칩으로 해제된다", async () => {
    await renderAndWaitForRows();

    const panel = screen.getByTestId("ws-list-filter-panel");
    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(within(panel).getByTestId("edition-status-filter-all")).toBeTruthy();
    expect(within(panel).getByTestId("edition-filter-weekly")).toBeTruthy();

    // 펼치기
    fireEvent.click(screen.getByTestId("ws-list-filter-toggle"));
    expect(panel.hasAttribute("hidden")).toBe(false);

    // 상태: 발행됨
    await act(async () => {
      fireEvent.click(screen.getByTestId("edition-status-filter-published"));
    });
    expect(screen.getByTestId("edition-status-filter-published").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`magazine-edition-item-${MONTHLY_ID}`)).toBeNull();
    expect(screen.getByTestId("ws-list-body-label").textContent).toBe("지난 뉴스레터 1건");
    const statusChip = screen.getByTestId("ws-list-active-filter-status");
    expect(statusChip.textContent).toContain("발행됨");

    await act(async () => {
      fireEvent.click(statusChip);
    });
    expect(screen.queryByTestId("ws-list-active-filter-status")).toBeNull();
    expect(screen.getByTestId(`magazine-edition-item-${MONTHLY_ID}`)).toBeTruthy();

    // 주기: 월간
    await act(async () => {
      fireEvent.click(screen.getByTestId("edition-filter-monthly"));
    });
    expect(screen.getByTestId("edition-filter-monthly").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId(`magazine-edition-item-${WEEKLY_ID}`)).toBeNull();
    expect(screen.getByTestId(`magazine-edition-item-${MONTHLY_ID}`)).toBeTruthy();
    const cadenceChip = screen.getByTestId("ws-list-active-filter-cadence");
    expect(cadenceChip.textContent).toContain("월간");

    await act(async () => {
      fireEvent.click(cadenceChip);
    });
    expect(screen.getByTestId("edition-filter-all").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`)).toBeTruthy();
  });
});

describe("뉴스레터 인라인 복제·삭제(Decision 1-B 안전망) — 상단 SelectedItemActions 제거", () => {
  it("인라인 복제 버튼 클릭 시 새 초안으로 복제되고 상단 작업 막대는 렌더되지 않는다", async () => {
    await renderAndWaitForRows();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`));
    });
    expect(
      screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.queryByTestId("ws-selected-item-actions")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId(`edition-duplicate-btn-${WEEKLY_ID}`));
    });
    await waitFor(() =>
      expect(document.body.textContent).toContain("선택한 뉴스레터를 새 초안으로 복제했어요"),
    );
    expect(screen.queryByTestId("ws-selected-item-actions")).toBeNull();
    expect(screen.getByTestId(`magazine-edition-item-${WEEKLY_ID}`).getAttribute("aria-current")).toBeNull();
  });

  it("작성 중 초안은 단일 확인 모달로 삭제되고, 발행 완료 호는 제목 재입력 안전망을 거친다", async () => {
    await renderAndWaitForRows();

    // 1) 초안(작성 중)은 재입력 칸 없이 단일 확인
    await act(async () => {
      fireEvent.click(screen.getByTestId(`edition-delete-btn-${MONTHLY_ID}`));
    });
    expect(screen.queryByTestId("confirm-delete-match-input")).toBeNull();
    const confirmBtn = await screen.findByTestId("confirm-delete-confirm-btn");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() =>
      expect(screen.queryByTestId(`magazine-edition-item-${MONTHLY_ID}`)).toBeNull(),
    );
    await waitFor(() =>
      expect(
        fetchCalls.some(
          (c) =>
            c.method === "DELETE" &&
            c.url === `/api/magazine/editions?id=${encodeURIComponent(MONTHLY_ID)}`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(document.body.textContent).toContain("\"11월 월간 브리핑\" 뉴스레터를 삭제했어요."),
    );

    // 2) 발행 완료 호는 제목 재입력 시에만 삭제 확정 버튼 활성화
    await act(async () => {
      fireEvent.click(screen.getByTestId(`edition-delete-btn-${WEEKLY_ID}`));
    });
    const matchInput = await screen.findByTestId("confirm-delete-match-input");
    const pubConfirmBtn = screen.getByTestId("confirm-delete-confirm-btn") as HTMLButtonElement;
    expect(pubConfirmBtn.disabled).toBe(true);
    await act(async () => {
      fireEvent.input(matchInput, { target: { value: "이번 주 강남 빌딩 브리핑" } });
      fireEvent.change(matchInput, { target: { value: "이번 주 강남 빌딩 브리핑" } });
    });
    expect(pubConfirmBtn.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(pubConfirmBtn);
    });
    await waitFor(() =>
      expect(screen.queryByTestId(`magazine-edition-item-${WEEKLY_ID}`)).toBeNull(),
    );
  });
});
