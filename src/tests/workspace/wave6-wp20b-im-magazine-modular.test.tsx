// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave6-wp20b-im-magazine-modular.test.tsx
 * @description Wave 6 — WP-20B Regression & Modularization Suite:
 *   1. `im/page.tsx` & `magazine-editor/page.tsx` Domain Modularization + LOC Reduction
 *   2. `im/page.tsx` 390px Mobile Safe-Area Compact Footer + `[체험 예시]` Badge + Mandatory `ConfirmDeleteModal`
 *   3. `magazine-editor/page.tsx` Step 3 Zero-Subscriber Inline Bulk Import CTA (`step3-empty-subscriber-bulk-btn`)
 *   4. `magazine-editor/page.tsx` Mandatory `ConfirmDeleteModal` on Edition Delete (with Published-Link Warning)
 *   5. `magazine-editor/page.tsx` Cross-Device Server Draft Autosave & Hydration + Graceful 401/404 Handling
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { PUBLISHED_EDITION_DELETE_WARNING } from "@/app/(broker)/broker/magazine-editor/_components/EditionDeleteModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = "/broker/w/im";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/platform/im-pipeline/realtime/use-dealcard-realtime-sync", () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function flushMicrotasks(cycles = 4) {
  for (let i = 0; i < cycles; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("Wave 6 WP-20B: IM & Newsletter Domain Modularization + Mobile Footer + Delete Safety + Draft Sync", () => {
  const ROOT = process.cwd();
  let root: Root;
  let container: HTMLDivElement;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockPush.mockReset();
    mockReplace.mockReset();
    mockPathname = "/broker/w/im";
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
  });

  it("[WP20B-1] substantially reduces im/page.tsx & magazine-editor/page.tsx LOC via _components and _hooks modules", () => {
    const imPagePath = path.join(ROOT, "src/app/(broker)/broker/w/im/page.tsx");
    const magPagePath = path.join(
      ROOT,
      "src/app/(broker)/broker/magazine-editor/page.tsx",
    );

    const imLoc = fs.readFileSync(imPagePath, "utf8").split(/\r?\n/).length;
    const magLoc = fs.readFileSync(magPagePath, "utf8").split(/\r?\n/).length;

    // Previously 5,883 and 5,049 lines respectively
    expect(imLoc).toBeLessThan(3000);
    expect(magLoc).toBeLessThan(3800);

    const expectedImModules = [
      "src/app/(broker)/broker/w/im/_components/im-workspace-types.ts",
      "src/app/(broker)/broker/w/im/_components/ImListSidebar.tsx",
      "src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx",
      "src/app/(broker)/broker/w/im/_components/ImSlideVisualCard.tsx",
      "src/app/(broker)/broker/w/im/_components/ImPreviewPane.tsx",
      "src/app/(broker)/broker/w/im/_components/ImBottomActionBar.tsx",
      "src/app/(broker)/broker/w/im/_components/ImFullscreenModal.tsx",
      "src/app/(broker)/broker/w/im/_hooks/useImServerHydration.ts",
    ];
    for (const rel of expectedImModules) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }

    const expectedMagModules = [
      "src/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types.ts",
      "src/app/(broker)/broker/magazine-editor/_components/EditionDeleteModal.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/EditionListSidebar.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/BrokerPreferencesSection.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/NewsletterTitleStepPanel.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel.tsx",
      "src/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewCard.tsx",
      "src/app/(broker)/broker/magazine-editor/_hooks/useNewsletterServerDraftSync.ts",
    ];
    for (const rel of expectedMagModules) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("[WP20B-2] im/page.tsx renders 390px compact safe-area footer, [체험 예시] badge on Day-0 sample items, and mandatory ConfirmDeleteModal", async () => {
    const patchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/workspace/summary") && init?.method === "PATCH") {
        patchCalls.push({
          url,
          body: JSON.parse(String(init.body || "{}")),
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/api/broker/workspace/summary")) {
        return new Response(
          JSON.stringify({ ok: true, imItems: [], profile: {} }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof global.fetch;

    await act(async () => {
      root.render(<ImWorkspacePage />);
    });
    await flushMicrotasks();

    // 1) [체험 예시] badge on Day-0 sample item
    const sampleBadge = container.querySelector('[data-testid^="im-sample-badge-"]');
    expect(sampleBadge).not.toBeNull();
    expect(sampleBadge?.textContent).toContain("[체험 예시]");

    // 2) 390px Mobile Safe-Area Compact Footer (1 full-width primary CTA + 2-col secondary row)
    const bottomBars = Array.from(
      container.querySelectorAll('[data-testid="im-bottom-action-bar"]'),
    );
    expect(bottomBars.length).toBeGreaterThan(0);
    const bar = bottomBars[0] as HTMLElement;
    expect(bar.className).toContain("pb-[max(0.5rem,env(safe-area-inset-bottom))]");

    const primaryBtn = bar.querySelector(
      '[data-testid="im-quick-generate-btn"]',
    ) as HTMLButtonElement | null;
    expect(primaryBtn).not.toBeNull();
    expect(primaryBtn?.className).toContain("w-full");
    expect(primaryBtn?.className).toContain("min-h-[48px]");

    const secondaryRow = bar.querySelector(
      '[data-testid="im-secondary-actions-row"]',
    ) as HTMLElement | null;
    expect(secondaryRow).not.toBeNull();
    expect(secondaryRow?.className).toContain("grid-cols-3");

    const pptxBtn = secondaryRow?.querySelector(
      '[data-testid="im-download-pptx-btn"]',
    ) as HTMLButtonElement | null;
    const pdfBtn = secondaryRow?.querySelector(
      '[data-testid="im-download-pdf-btn"]',
    ) as HTMLButtonElement | null;
    const studioBtn = secondaryRow?.querySelector(
      '[data-testid="im-open-studio-btn"]',
    ) as HTMLButtonElement | null;
    expect(pptxBtn?.className).toContain("min-h-[44px]");
    expect(pdfBtn?.className).toContain("min-h-[44px]");
    expect(studioBtn?.className).toContain("min-h-[44px]");

    // 3) Mandatory ConfirmDeleteModal on delete
    const deleteTrigger = (container.querySelector(
      '[data-testid="ws-selected-delete-btn"]',
    ) ||
      container.querySelector('[data-testid^="im-delete-"]')) as HTMLButtonElement | null;
    expect(deleteTrigger).not.toBeNull();

    await act(async () => {
      deleteTrigger!.click();
    });

    const modalAfterOpen = document.querySelector(
      '[data-testid="confirm-delete-modal"]',
    );
    expect(modalAfterOpen).not.toBeNull();
    expect(patchCalls.length).toBe(0);

    // Cancel keeps item intact
    const cancelBtn = document.querySelector(
      '[data-testid="confirm-delete-cancel-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });
    expect(document.querySelector('[data-testid="confirm-delete-modal"]')).toBeNull();
    expect(patchCalls.length).toBe(0);

    // Confirm executes delete
    await act(async () => {
      deleteTrigger!.click();
    });
    const confirmBtn = document.querySelector(
      '[data-testid="confirm-delete-confirm-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });
    await flushMicrotasks();

    expect(patchCalls.some((c) => c.body.action === "delete_im")).toBe(true);
  });

  it("[WP20B-3] magazine-editor/page.tsx renders Step 3 zero-subscriber CTA and refreshes subscriberCount inline on ContactBulkImportModal import", async () => {
    mockPathname = "/broker/magazine-editor";
    let serverSubscriberCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/magazine/editions?")) {
        return new Response(
          JSON.stringify({
            brokerId: "11111111-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-partner",
            subscriberCount: serverSubscriberCount,
            highInterestCount: 0,
            editions: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/broker/buildings")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.includes("/api/broker/inbox/import-contacts") && init?.method === "POST") {
        serverSubscriberCount = 2;
        return new Response(
          JSON.stringify({
            ok: true,
            importedCount: 2,
            updatedCount: 0,
            skippedCount: 0,
            subscriberAddedCount: 2,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof global.fetch;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });
    await flushMicrotasks();

    const step3Tab = container.querySelector(
      '[data-testid="step-tab-send"]',
    ) as HTMLButtonElement;
    expect(step3Tab).not.toBeNull();
    await act(async () => {
      step3Tab.click();
    });

    const emptySubBtn = container.querySelector(
      '[data-testid="step3-empty-subscriber-bulk-btn"]',
    ) as HTMLButtonElement | null;
    expect(emptySubBtn).not.toBeNull();
    expect(emptySubBtn?.className).toContain("min-h-[48px]");
    expect(emptySubBtn?.textContent).toContain("📋 엑셀·명단으로 구독자 바로 등록하기");

    // Click opens ContactBulkImportModal inline without router navigation
    await act(async () => {
      emptySubBtn!.click();
    });
    expect(mockPush).not.toHaveBeenCalled();

    const bulkModal = document.querySelector(
      '[data-testid="contact-bulk-import-modal"]',
    );
    expect(bulkModal).not.toBeNull();

    // Complete paste import flow inside the inline modal
    const pasteModeBtn = document.querySelector(
      '[data-testid="bulk-input-mode-paste"]',
    ) as HTMLButtonElement;
    await act(async () => {
      pasteModeBtn.click();
    });

    const pasteTextarea = document.querySelector(
      '[data-testid="bulk-contact-paste-textarea"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      setNativeInputValue(
        pasteTextarea,
        "김투자\t010-1234-5678\tkim@example.com\t매수\t수신동의\n이자산\t010-2222-3333\tlee@example.com\t매수\t수신동의",
      );
    });

    const parseNextBtn = document.querySelector(
      '[data-testid="bulk-parse-paste-next-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      parseNextBtn.click();
    });

    const step2NextBtn = document.querySelector(
      '[data-testid="step2-next-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      step2NextBtn.click();
    });

    // defaultNewsletterSync={true} pre-checks newsletter-sync-checkbox
    const nlSyncCheckbox = document.querySelector(
      '[data-testid="newsletter-sync-checkbox"]',
    ) as HTMLInputElement;
    expect(nlSyncCheckbox?.checked).toBe(true);

    const complianceCheckbox = document.querySelector(
      '[data-testid="compliance-confirm-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => {
      complianceCheckbox.click();
    });

    const submitBtn = document.querySelector(
      '[data-testid="bulk-import-submit-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });
    await flushMicrotasks();

    // Zero-subscriber CTA disappears once subscriberCount refreshes > 0
    expect(
      container.querySelector('[data-testid="step3-empty-subscriber-bulk-btn"]'),
    ).toBeNull();
  });

  it("[WP20B-4] magazine-editor/page.tsx opens ConfirmDeleteModal with published-link warning before deleting a published edition", async () => {
    mockPathname = "/broker/magazine-editor";
    const publishedId = "22222222-2222-4222-8222-222222222222";
    const deleteRequests: string[] = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "DELETE" && url.includes("/api/magazine/editions")) {
        deleteRequests.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("/api/magazine/editions?")) {
        return new Response(
          JSON.stringify({
            brokerId: "11111111-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-partner",
            subscriberCount: 12,
            highInterestCount: 4,
            editions: [
              {
                id: publishedId,
                edition_type: "monthly",
                edition_label: "2026-11",
                title: "강남권 11월 빌딩 시장 브리핑",
                status: "published",
                published_at: "2026-11-10T09:00:00.000Z",
                updated_at: "2026-11-10T09:00:00.000Z",
                featured_deal_ids: [],
                content: {
                  headline: "강남권 11월 빌딩 시장 브리핑",
                  issueDate: "2026-11-10",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/broker/buildings")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof global.fetch;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });
    await flushMicrotasks();

    // Select the published edition row
    const editionRow = container.querySelector(
      `[data-testid="magazine-edition-item-${publishedId}"]`,
    ) as HTMLElement | null;
    expect(editionRow).not.toBeNull();
    await act(async () => {
      editionRow!.click();
    });

    const deleteBtn = (container.querySelector(
      '[data-testid="ws-selected-delete-btn"]',
    ) ||
      container.querySelector(
        `[data-testid="edition-delete-btn-${publishedId}"]`,
      )) as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      deleteBtn!.click();
    });

    const confirmModal = document.querySelector(
      '[data-testid="confirm-delete-modal"]',
    );
    expect(confirmModal).not.toBeNull();
    expect(confirmModal?.textContent).toContain(PUBLISHED_EDITION_DELETE_WARNING);
    expect(deleteRequests.length).toBe(0);

    // Cancel aborts deletion
    const cancelBtn = document.querySelector(
      '[data-testid="confirm-delete-cancel-btn"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });
    expect(document.querySelector('[data-testid="confirm-delete-modal"]')).toBeNull();
    expect(deleteRequests.length).toBe(0);
    expect(
      container.querySelector(`[data-testid="magazine-edition-item-${publishedId}"]`),
    ).not.toBeNull();

    // Confirm published edition deletion (Decision 1-B requires title match before confirming)
    await act(async () => {
      deleteBtn!.click();
    });
    const confirmBtn = document.querySelector(
      '[data-testid="confirm-delete-confirm-btn"]',
    ) as HTMLButtonElement;
    const matchInput = document.querySelector(
      '[data-testid="confirm-delete-match-input"]',
    ) as HTMLInputElement | null;
    expect(matchInput).not.toBeNull();
    expect(confirmBtn.disabled).toBe(true);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(matchInput, "강남권 11월 빌딩 시장 브리핑");
      matchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      matchInput!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(confirmBtn.disabled).toBe(false);
    await act(async () => {
      confirmBtn.click();
    });
    await flushMicrotasks();

    expect(deleteRequests.length).toBe(1);
    expect(deleteRequests[0]).toContain(publishedId);
    expect(
      container.querySelector(`[data-testid="magazine-edition-item-${publishedId}"]`),
    ).toBeNull();
  });

  it("[WP20B-5] magazine-editor/page.tsx syncs PC draft edits to server, hydrates server drafts on fresh smartphone, and gracefully ignores 401/404 mocks", async () => {
    vi.useFakeTimers();
    mockPathname = "/broker/magazine-editor";
    const draftUuid = "33333333-3333-4333-8333-333333333333";
    const patchPayloads: Array<Record<string, unknown>> = [];

    // Part A: PC authoring -> debounced server draft bootstrap + PATCH
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/magazine/editions/draft") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            edition: {
              id: draftUuid,
              edition_label: "2026-11",
              status: "draft",
              updated_at: "2026-11-15T10:00:00.000Z",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/magazine/editions") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body || "{}"));
        patchPayloads.push(body);
        return new Response(
          JSON.stringify({
            edition: {
              id: draftUuid,
              updated_at: "2026-11-15T10:00:02.000Z",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/magazine/editions?")) {
        return new Response(
          JSON.stringify({
            brokerId: "11111111-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-partner",
            subscriberCount: 5,
            highInterestCount: 2,
            editions: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/broker/buildings")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof global.fetch;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });
    await flushMicrotasks();

    const headlineInput = container.querySelector(
      "#newsletter-headline-input",
    ) as HTMLInputElement;
    expect(headlineInput).not.toBeNull();

    await act(async () => {
      setNativeInputValue(headlineInput, "PC에서 작성 시작한 11월 빌딩 리포트");
    });

    expect(
      container.querySelector("[data-local-draft-mode]")?.getAttribute(
        "data-local-draft-mode",
      ),
    ).toBe("local_only");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    await flushMicrotasks();

    expect(patchPayloads.length).toBeGreaterThanOrEqual(1);
    expect(patchPayloads[0]?.id).toBe(draftUuid);
    expect(patchPayloads[0]?.title).toBe("PC에서 작성 시작한 11월 빌딩 리포트");
    expect(
      container.querySelector("[data-local-draft-mode]")?.getAttribute(
        "data-local-draft-mode",
      ),
    ).toBe("none");

    // Part B: Fresh smartphone (empty localStorage) hydrates the saved server draft
    act(() => {
      root.unmount();
    });
    window.localStorage.clear();
    root = createRoot(container);

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/magazine/editions") && init?.method === "PATCH") {
        // Simulate 404 in restricted unit-test mock on subsequent edits -> graceful no-op
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
      }
      if (url.includes("/api/magazine/editions?")) {
        return new Response(
          JSON.stringify({
            brokerId: "11111111-1111-4111-8111-111111111111",
            brokerSlug: "gangnam-partner",
            subscriberCount: 5,
            highInterestCount: 2,
            editions: [
              {
                id: draftUuid,
                edition_type: "monthly",
                edition_label: "2026-11",
                title: "PC에서 작성 시작한 11월 빌딩 리포트",
                status: "draft",
                updated_at: "2026-11-15T10:00:02.000Z",
                featured_deal_ids: [],
                content: {
                  headline: "PC에서 작성 시작한 11월 빌딩 리포트",
                  briefing_body_md: "강남 오피스 임대차 수요 분석",
                  issueDate: "2026-11-15",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/broker/buildings")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof global.fetch;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });
    await flushMicrotasks();

    const phoneHeadline = container.querySelector(
      "#newsletter-headline-input",
    ) as HTMLInputElement;
    expect(phoneHeadline?.value).toBe("PC에서 작성 시작한 11월 빌딩 리포트");

    // Editing when PATCH returns 404 gracefully preserves local_only without error banner
    await act(async () => {
      setNativeInputValue(phoneHeadline, "스마트폰에서 이어 쓰는 11월 빌딩 리포트");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flushMicrotasks();

    expect(
      container.querySelector("[data-local-draft-mode]")?.getAttribute(
        "data-local-draft-mode",
      ),
    ).toBe("local_only");
    expect(
      container.querySelector('[data-testid="newsletter-status-banner"][role="alert"]'),
    ).toBeNull();
  });
});
