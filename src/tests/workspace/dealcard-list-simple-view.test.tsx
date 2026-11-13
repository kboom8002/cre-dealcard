// @vitest-environment jsdom
/**
 * @file src/tests/workspace/dealcard-list-simple-view.test.tsx
 * @description DealCard workspace left-list redesign (간단히 기본 / 자세히 선택):
 *  - default 간단히: one date-grouped list of dealcards + 미생성 메모, title · date · status only, no buttons in rows
 *  - 자세히: the existing grouped rich cards (group sections, memo preview, 복제/삭제, thumbnail) come back
 *  - folded 필터 ▾ panel keeps the legacy tab testids clickable and still filters, with removable chips
 *  - SelectedItemActions (editor column, 간단히 only) reuses the existing duplicate / confirm-delete flow
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import { LIST_VIEW_STORAGE_KEY } from "@/components/workspace/list/useListViewMode";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams(),
}));

const NOW_ISO = new Date().toISOString();

const SERVER_PAYLOAD = {
  ok: true,
  dealcards: [
    {
      id: "dc-ready-1",
      title: "마포구 서교동 근린생활시설",
      region: "마포구 서교동",
      use: "근린생활시설",
      priceBand: "90~100억",
      status: "draft",
      updatedAt: NOW_ISO,
      memoText: "서교동 395-166 김사장님 급매",
      generationSource: "ai_memo",
      card4: {
        headline: "합정역 코너 만실 빌딩",
        posture: "income",
        region: "마포구 서교동",
        use: "근린생활시설",
        area: "연면적 439평",
        priceBand: "90~100억",
        points: ["합정역 도보 3분 코너", "우량 임차인 전층 만실", "안정적인 임대수익 구조"],
        generationSource: "ai_memo",
        card4_version: 1,
      },
    },
    {
      id: "dc-owner-2",
      title: "강남구 역삼동 업무시설",
      region: "강남구 역삼동",
      use: "업무시설",
      priceBand: "",
      status: "draft",
      updatedAt: NOW_ISO,
      generationSource: "manual",
      card4: {
        headline: "",
        posture: "owner_occupied",
        region: "강남구 역삼동",
        use: "업무시설",
        area: "",
        priceBand: "",
        points: ["", "", ""],
        generationSource: "manual",
        card4_version: 1,
      },
    },
  ],
  unconvertedMemos: [
    {
      id: "memo-deal-1",
      memoText: "송파구 방이동 먹자골목 코너 상가 매가 68억",
      routingType: "new_deal",
      createdAt: NOW_ISO,
    },
  ],
};

const q = (container: HTMLElement, testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;

describe("DealCard left list — 간단히 / 자세히 redesign", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = global.fetch;
  let patchBodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    patchBodies = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/workspace/summary") && init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body || "{}")));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/api/broker/workspace/summary")) {
        return new Response(JSON.stringify(SERVER_PAYLOAD), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });
  };

  it("[SV-01] defaults to 간단히: date-grouped rows with title · date · status only and no buttons inside rows", async () => {
    await renderPage();

    const list = q(container, "dealcard-airtable-list");
    expect(list).not.toBeNull();
    expect(list?.textContent).toContain("내 딜카드 목록");
    expect(q(container, "ws-list-view-simple")?.getAttribute("aria-pressed")).toBe("true");
    expect(q(container, "ws-date-grouped-list")).not.toBeNull();

    const readyRow = q(container, "dealcard-item-dc-ready-1");
    const draftRow = q(container, "dealcard-item-dc-owner-2");
    const memoRow = q(container, "unconverted-memo-item-memo-deal-1");
    for (const row of [readyRow, draftRow, memoRow]) {
      expect(row).not.toBeNull();
      expect(row?.getAttribute("data-list-row")).toBe("simple");
      expect(row?.querySelectorAll("button").length).toBe(0);
    }

    expect(readyRow?.textContent).toContain("마포구 서교동 근린생활시설");
    expect(q(container, "dealcard-item-dc-ready-1-date")?.textContent).toMatch(/오전|오후/);
    expect(q(container, "dealcard-status-badge-dc-ready-1")?.textContent).toBe("준비 완료");
    expect(q(container, "dealcard-status-badge-dc-owner-2")?.textContent).toBe("작성 중");
    expect(q(container, "dealcard-status-badge-dc-ready-1")?.getAttribute("title")).toContain(
      "필수 항목 입력 완료"
    );
    expect(memoRow?.textContent).toContain("송파구 방이동");
    expect(memoRow?.textContent).toContain("메모만 저장");

    expect(readyRow?.getAttribute("data-origin-group")).toBe("ai_memo");
    expect(draftRow?.getAttribute("data-origin-group")).toBe("manual");
    expect(memoRow?.getAttribute("data-origin-group")).toBe("unconverted_memo");

    // Private memo text and row-level danger buttons are NOT shown in 간단히
    expect(q(container, "dealcard-paired-memo-preview-dc-ready-1")).toBeNull();
    expect(readyRow?.textContent).not.toContain("김사장");
    expect(q(container, "dealcard-delete-dc-ready-1")).toBeNull();
    expect(q(container, "dealcard-duplicate-dc-ready-1")).toBeNull();
    expect(q(container, "unconverted-memo-delete-memo-deal-1")).toBeNull();
    expect(q(container, "dealcard-group-section-ai_memo")).toBeNull();

    // First server dealcard is selected (selection semantics preserved)
    expect(readyRow?.getAttribute("data-selected")).toBe("true");
    expect(readyRow?.getAttribute("aria-current")).toBe("true");
  });

  it("[SV-02] switching to 자세히 restores the grouped rich cards with thumbnail and row buttons; editor actions disappear", async () => {
    await renderPage();
    expect(q(container, "ws-selected-item-actions")).not.toBeNull();

    await act(async () => {
      q(container, "ws-list-view-detailed")?.click();
    });

    expect(window.localStorage.getItem(LIST_VIEW_STORAGE_KEY)).toBe("detailed");
    expect(q(container, "dealcard-group-section-ai_memo")).not.toBeNull();
    expect(q(container, "dealcard-group-section-unconverted_memo")).not.toBeNull();
    expect(q(container, "dealcard-group-section-manual")).not.toBeNull();
    expect(q(container, "dealcard-paired-memo-preview-dc-ready-1")).not.toBeNull();
    expect(q(container, "dealcard-duplicate-dc-ready-1")).not.toBeNull();
    expect(q(container, "dealcard-delete-dc-ready-1")).not.toBeNull();
    expect(q(container, "unconverted-memo-generate-memo-deal-1")).not.toBeNull();
    expect(q(container, "dealcard-status-badge-dc-ready-1")?.textContent).toBe("준비 완료");

    const readyRow = q(container, "dealcard-item-dc-ready-1");
    const thumbImg = readyRow?.querySelector('[data-testid="ws-list-thumbnail"] img');
    expect(thumbImg?.getAttribute("src")).toBe("/api/og/deal/dc-ready-1/kakao-v2");
    expect(thumbImg?.getAttribute("loading")).toBe("lazy");

    // No duplicated action testids in 자세히 mode
    expect(q(container, "ws-selected-item-actions")).toBeNull();
  });

  it("[SV-03] folded 필터 ▾ panel still filters via legacy tab testids and shows removable chips", async () => {
    await renderPage();

    const panel = q(container, "ws-list-filter-panel");
    expect(panel?.hasAttribute("hidden")).toBe(true);
    expect(panel?.textContent).toContain("생성 방식");
    expect(panel?.textContent).toContain("매물 유형");
    expect(panel?.querySelector('[data-testid="dealcard-group-switcher"]')).not.toBeNull();
    expect(panel?.querySelector('[data-testid="dealcard-posture-switcher"]')).not.toBeNull();

    await act(async () => {
      q(container, "dealcard-posture-tab-owner_value")?.click();
    });
    expect(q(container, "dealcard-item-dc-ready-1")).toBeNull();
    expect(q(container, "dealcard-item-dc-owner-2")).not.toBeNull();
    expect(q(container, "dealcard-item-dc-owner-2")?.getAttribute("data-selected")).toBe("true");
    const postureChip = q(container, "ws-list-active-filter-posture");
    expect(postureChip?.textContent).toContain("사옥·개발");

    await act(async () => {
      postureChip?.click();
    });
    expect(q(container, "ws-list-active-filter-posture")).toBeNull();
    expect(q(container, "dealcard-item-dc-ready-1")).not.toBeNull();

    await act(async () => {
      q(container, "dealcard-group-tab-unconverted_memo")?.click();
    });
    expect(q(container, "dealcard-item-dc-ready-1")).toBeNull();
    expect(q(container, "unconverted-memo-item-memo-deal-1")).not.toBeNull();
    const originChip = q(container, "ws-list-active-filter-origin");
    expect(originChip?.textContent).toContain("미생성");
    expect(originChip?.textContent).not.toContain("📝");

    await act(async () => {
      originChip?.click();
    });
    expect(q(container, "dealcard-item-dc-ready-1")).not.toBeNull();
  });

  it("[SV-04] SelectedItemActions duplicates via the existing handler and deletes only after the existing confirmation", async () => {
    await renderPage();

    // Duplicate the selected dealcard
    await act(async () => {
      q(container, "ws-selected-duplicate-btn")?.click();
    });
    const copyRow = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="dealcard-item-"][data-list-row="simple"]')
    ).find((el) => el.textContent?.includes("(사본)"));
    expect(copyRow).toBeDefined();
    expect(copyRow?.getAttribute("data-selected")).toBe("true");
    expect(patchBodies.some((b) => b.action === "upsert")).toBe(true);

    // Select the original and delete: confirmation first, cancel keeps the item
    await act(async () => {
      q(container, "dealcard-item-dc-owner-2")?.click();
    });
    await act(async () => {
      q(container, "ws-selected-delete-btn")?.click();
    });
    expect(q(container, "confirm-delete-modal")).not.toBeNull();
    expect(q(container, "dealcard-item-dc-owner-2")).not.toBeNull();
    expect(patchBodies.some((b) => b.action === "delete")).toBe(false);

    await act(async () => {
      q(container, "confirm-delete-cancel-btn")?.click();
    });
    expect(q(container, "confirm-delete-modal")).toBeNull();
    expect(q(container, "dealcard-item-dc-owner-2")).not.toBeNull();

    await act(async () => {
      q(container, "ws-selected-delete-btn")?.click();
    });
    await act(async () => {
      q(container, "confirm-delete-confirm-btn")?.click();
    });
    expect(q(container, "dealcard-item-dc-owner-2")).toBeNull();
    expect(
      patchBodies.some((b) => b.action === "delete" && b.buildingId === "dc-owner-2")
    ).toBe(true);

    // Unconverted memo: delete only (no duplicate), still behind confirmation
    await act(async () => {
      q(container, "unconverted-memo-item-memo-deal-1")?.click();
    });
    expect(q(container, "ws-selected-duplicate-btn")).toBeNull();
    await act(async () => {
      q(container, "ws-selected-delete-btn")?.click();
    });
    expect(q(container, "confirm-delete-modal")).not.toBeNull();
    expect(q(container, "unconverted-memo-item-memo-deal-1")).not.toBeNull();
    await act(async () => {
      q(container, "confirm-delete-confirm-btn")?.click();
    });
    expect(q(container, "unconverted-memo-item-memo-deal-1")).toBeNull();
    expect(
      patchBodies.some((b) => b.action === "delete_memo" && b.memoId === "memo-deal-1")
    ).toBe(true);
  });

  it("[SV-05] runtime create writes an ISO updatedAt (no legacy '방금') and the new row lands in 오늘", async () => {
    await renderPage();
    await act(async () => {
      q(container, "workspace-new-dealcard-btn")?.click();
    });
    const stored = JSON.parse(window.localStorage.getItem("credeal-w-dealcards-v5") || "[]") as Array<{
      updatedAt: string;
    }>;
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].updatedAt).not.toBe("방금");
    expect(Number.isNaN(Date.parse(stored[0].updatedAt))).toBe(false);
    expect(q(container, "ws-date-group-today")).not.toBeNull();
  });
});
