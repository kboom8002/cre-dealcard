// @vitest-environment jsdom
/**
 * @file src/tests/workspace/im-list-simple-view.test.tsx
 * @description IM workspace left-list redesign (간단히/자세히):
 *  - default "간단히" rows show title · date · status only (no buttons inside rows)
 *  - "자세히" restores the rich card (address, price, 복제/삭제) + thumbnail
 *  - posture filter tabs live in the folded 필터 panel and still filter, with a removable chip
 *  - SelectedItemActions (editor column) reuse the existing duplicate / confirm-delete flow
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import { formatListDate } from "@/lib/workspace/list-date";
import { LIST_VIEW_STORAGE_KEY } from "@/components/workspace/list/useListViewMode";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/broker/w/im",
  useSearchParams: () => mockSearchParams,
}));

const OLD_DATE = "2025-03-04T12:00:00";

function seedItems() {
  const now = Date.now();
  return [
    {
      id: "im-a",
      buildingId: "bld-a",
      title: "마포구 서교동 꼬마빌딩",
      address: "서울특별시 마포구 서교동 395-166",
      askingPriceManwon: 950000,
      grossYieldPct: 4.2,
      status: "draft",
      versionLabel: "작성 중",
      updatedAt: new Date(now - 60_000).toISOString(),
      investmentPosture: "core_income",
    },
    {
      id: "im-b",
      buildingId: "bld-b",
      title: "강남구 역삼동 사옥",
      address: "서울특별시 강남구 역삼동 648-23",
      askingPriceManwon: 1500000,
      grossYieldPct: 0,
      status: "published",
      versionLabel: "발행됨",
      updatedAt: new Date(now - 2 * 60_000).toISOString(),
      investmentPosture: "owner_occupied",
    },
    {
      id: "im-c",
      buildingId: "bld-c",
      title: "성수동 신축 부지",
      address: "서울특별시 성동구 성수동2가 300-1",
      askingPriceManwon: 800000,
      grossYieldPct: 0,
      status: "draft",
      versionLabel: "작성 중",
      updatedAt: OLD_DATE,
      investmentPosture: "development",
    },
  ];
}

describe("IM workspace left list — 간단히 / 자세히", () => {
  let root: Root;
  let container: HTMLDivElement;
  let originalFetch: typeof global.fetch;

  const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as T | null;
  const rows = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="im-item-"]')).filter(
      (el) => !/-date$/.test(el.getAttribute("data-testid") || "")
    );

  async function renderPage() {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });
  }

  beforeEach(() => {
    originalFetch = global.fetch;
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("credeal-w-im-v4", JSON.stringify(seedItems()));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        counts: { inboxPending: 0, buildings: 3, magazineTotal: 0, clients: 0 },
        items: [],
      }),
    }) as unknown as typeof fetch;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
  });

  it("defaults to 간단히: rows show title · date · status only, no row buttons, no black banner", async () => {
    await renderPage();

    const listSlot = q('[data-testid="im-list-slot"]');
    expect(listSlot).not.toBeNull();
    expect(listSlot?.textContent).toContain("보유 IM 목록");
    expect(q('[data-testid="ws-list-body-label"]')?.textContent).toBe("보유 IM 목록 3건");
    expect(listSlot?.textContent).not.toContain("총 3건");

    const rowA = q('[data-testid="im-item-im-a"]');
    const rowB = q('[data-testid="im-item-im-b"]');
    const rowC = q('[data-testid="im-item-im-c"]');
    expect(rowA?.getAttribute("data-list-row")).toBe("simple");
    expect(rowA?.textContent).toContain("마포구 서교동 꼬마빌딩");
    expect(rowA?.textContent).toContain("작성 중");
    expect(rowB?.textContent).toContain("발행됨");
    expect(q('[data-testid="im-item-im-c-date"]')?.textContent).toBe(formatListDate(OLD_DATE));
    expect(rowC?.textContent).not.toContain("서울특별시");

    for (const row of rows()) {
      expect(row.querySelectorAll("button").length).toBe(0);
    }
    expect(container.querySelector('[data-testid^="im-duplicate-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="im-delete-"]')).toBeNull();

    // Newest first, grouped by date
    expect(rows().map((r) => r.getAttribute("data-testid"))).toEqual([
      "im-item-im-a",
      "im-item-im-b",
      "im-item-im-c",
    ]);
    expect(q('[data-testid="ws-date-group-earlier"]')).not.toBeNull();

    // No nested scroller inside the panel
    expect(listSlot?.querySelector(".overflow-y-auto")).toBeNull();

    // Selected-item actions live in the editor column in simple mode
    const editor = q('[data-testid="im-editor-slot"]');
    expect(editor?.querySelector('[data-testid="ws-selected-item-actions"]')).not.toBeNull();

    // Bottom primary actions are untouched
    expect(q('[data-testid="im-quick-generate-btn"]')).not.toBeNull();
  });

  it("switching to 자세히 restores the rich card with 복제/삭제 + thumbnail and hides editor actions", async () => {
    await renderPage();

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-list-view-detailed"]')!.click();
    });

    expect(window.localStorage.getItem(LIST_VIEW_STORAGE_KEY)).toBe("detailed");
    const rowA = q('[data-testid="im-item-im-a"]');
    expect(rowA?.getAttribute("data-list-row")).toBeNull();
    expect(rowA?.textContent).toContain("서울특별시 마포구 서교동 395-166");
    expect(rowA?.textContent).toContain("수익률 4.2%");
    expect(q('[data-testid="im-duplicate-im-a"]')).not.toBeNull();
    expect(q('[data-testid="im-delete-im-a"]')).not.toBeNull();
    expect(rowA?.querySelector('[data-testid="ws-list-thumbnail"]')?.textContent).toBe("마포");
    expect(q('[data-testid="ws-selected-item-actions"]')).toBeNull();

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-list-view-simple"]')!.click();
    });
    expect(q('[data-testid="im-item-im-a"]')?.getAttribute("data-list-row")).toBe("simple");
  });

  it("posture tabs sit in the folded filter panel and still filter; active chip clears the filter", async () => {
    await renderPage();

    const panel = q('[data-testid="ws-list-filter-panel"]');
    expect(panel?.hasAttribute("hidden")).toBe(true);
    expect(panel?.querySelector('[data-testid="im-posture-switcher"]')).not.toBeNull();
    expect(panel?.textContent).toContain("매물 유형");

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-list-filter-toggle"]')!.click();
    });
    expect(panel?.hasAttribute("hidden")).toBe(false);

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="im-posture-tab-owner"]')!.click();
    });
    expect(rows().map((r) => r.getAttribute("data-testid"))).toEqual(["im-item-im-b"]);
    expect(q('[data-testid="ws-list-body-label"]')?.textContent).toBe("보유 IM 목록 1건");
    const chip = q<HTMLButtonElement>('[data-testid="ws-list-active-filter-im-posture"]');
    expect(chip?.textContent).toContain("사옥용");

    await act(async () => {
      chip!.click();
    });
    expect(rows().length).toBe(3);
    expect(q('[data-testid="ws-list-active-filter-im-posture"]')).toBeNull();
    expect(q('[data-testid="im-posture-tab-all"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("editor 복제하기 duplicates the selected IM via the existing flow", async () => {
    await renderPage();

    await act(async () => {
      q<HTMLElement>('[data-testid="im-item-im-b"]')!.click();
    });
    expect(q('[data-testid="im-item-im-b"]')?.getAttribute("aria-current")).toBe("true");

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-selected-duplicate-btn"]')!.click();
    });

    expect(rows().length).toBe(4);
    const copy = rows().find((r) => r.textContent?.includes("강남구 역삼동 사옥 (사본)"));
    expect(copy).toBeTruthy();
    expect(copy?.getAttribute("aria-current")).toBe("true");
    expect(copy?.textContent).toContain("작성 중");
    // Duplicates are stamped with a real ISO date (not "방금")
    const stored = JSON.parse(window.localStorage.getItem("credeal-w-im-v4") || "[]");
    const storedCopy = stored.find((it: { title: string }) => it.title === "강남구 역삼동 사옥 (사본)");
    expect(storedCopy?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("editor 삭제하기 still requires the existing confirmation modal before deleting", async () => {
    await renderPage();

    await act(async () => {
      q<HTMLElement>('[data-testid="im-item-im-c"]')!.click();
    });

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-selected-delete-btn"]')!.click();
    });
    expect(q('[data-testid="confirm-delete-modal"]')).not.toBeNull();
    expect(rows().length).toBe(3);

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="confirm-delete-cancel-btn"]')!.click();
    });
    expect(q('[data-testid="confirm-delete-modal"]')).toBeNull();
    expect(q('[data-testid="im-item-im-c"]')).not.toBeNull();

    await act(async () => {
      q<HTMLButtonElement>('[data-testid="ws-selected-delete-btn"]')!.click();
    });
    await act(async () => {
      q<HTMLButtonElement>('[data-testid="confirm-delete-confirm-btn"]')!.click();
    });
    expect(q('[data-testid="im-item-im-c"]')).toBeNull();
    expect(rows().length).toBe(2);
  });
});
