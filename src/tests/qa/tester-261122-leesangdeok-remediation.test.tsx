// @vitest-environment jsdom
/**
 * @file src/tests/qa/tester-261122-leesangdeok-remediation.test.tsx
 * @description Regression suite for 2026-11-22 human review feedback (이상덕 PDF p.4~p.9):
 *   - P0-1: ConfirmDeleteModal non-deceptive placeholder + 1-click autofill chip + draft 1-click delete
 *   - P0-2: IM photo inline dataUrl preservation + /api/public/testguide-assets broker session auth
 *   - P1-1: WorkspaceBottomNav 390px xlarge badge containment + InboxListColumn toggle nowrap
 *   - P1-2: Tall full-page mobile screenshot 1:1 scrollable lightbox aspect detection
 */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRequireBroker = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/w/inbox",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import {
  applyUploadedPhotoBatchResult,
  resolveKnownTestAssetUrl,
  sanitizePhotosForSync,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { WorkspaceBottomNav, DEFAULT_WORKSPACE_TABS } from "@/components/workspace/WorkspaceBottomNav";
import { InboxListColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxListColumn";
import { isTallMobileCaptureAspect } from "@/components/qa-showcase/ShowcaseDeliverableViewer";
import { GET as getTestguideAsset } from "@/app/api/public/testguide-assets/[...slug]/route";

describe("Tester 이상덕 2026-11-22 Human Review Remediation Suite", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockRequireBroker.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete process.env.CRE_ENFORCE_QA_GATE;
  });

  it("P0-1: prevents placeholder illusion and supports 1-click autofill in ConfirmDeleteModal", async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(
        <ConfirmDeleteModal
          isOpen={true}
          title="발행된 IM을 삭제할까요?"
          requireMatchText="역삼동 여삼빌딩"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );
    });

    const input = document.body.querySelector(
      '[data-testid="confirm-delete-match-input"]'
    ) as HTMLInputElement | null;
    const confirmBtn = document.body.querySelector(
      '[data-testid="confirm-delete-confirm-btn"]'
    ) as HTMLButtonElement | null;
    const autofillBtn = document.body.querySelector(
      '[data-testid="confirm-delete-autofill-btn"]'
    ) as HTMLButtonElement | null;

    expect(input).not.toBeNull();
    expect(confirmBtn).not.toBeNull();
    expect(autofillBtn).not.toBeNull();

    // Must never echo exact target text inside placeholder (prevents grey placeholder illusion)
    expect(input!.placeholder).not.toBe("역삼동 여삼빌딩");
    expect(confirmBtn!.disabled).toBe(true);

    await act(async () => {
      autofillBtn!.click();
    });

    expect(input!.value).toBe("역삼동 여삼빌딩");
    expect(confirmBtn!.disabled).toBe(false);

    await act(async () => {
      confirmBtn!.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("P0-2a: preserves inline dataUrl when no direct remote URL exists, and resolves V1/V2/Broker test asset filenames", () => {
    const sampleDataUrl =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2Q==";

    const batchResolved = applyUploadedPhotoBatchResult(
      [{ id: "p-1", name: "01_동교동_THEPARK_전면외관.jpg", category: "exterior" }],
      [
        {
          id: "p-1",
          name: "01_동교동_THEPARK_전면외관.jpg",
          dataUrl: sampleDataUrl,
          remoteUrl: null,
        },
      ]
    );
    expect(batchResolved.entries).toHaveLength(1);
    expect(batchResolved.entries[0].dataUrl).toBe(sampleDataUrl);

    const syncedWithoutRemote = sanitizePhotosForSync([
      {
        name: "01_동교동_THEPARK_전면외관.jpg",
        dataUrl: sampleDataUrl,
        category: "exterior",
      },
    ]);
    expect(syncedWithoutRemote).toHaveLength(1);
    expect(syncedWithoutRemote[0].dataUrl).toBe(sampleDataUrl);

    const syncedWithRemote = sanitizePhotosForSync([
      {
        name: "01_동교동_THEPARK_전면외관.jpg",
        url: "https://example.supabase.co/storage/v1/object/public/im-photos/01.jpg",
        dataUrl: sampleDataUrl,
        category: "exterior",
      },
    ]);
    expect(syncedWithRemote).toHaveLength(1);
    expect(syncedWithRemote[0].url).toContain("https://example.supabase.co/");
    expect(syncedWithRemote[0].dataUrl).toBeUndefined();

    expect(resolveKnownTestAssetUrl("dangsan_01_exterior.jpg")).toContain(
      "/api/public/testguide-assets/images/v2-case04/"
    );
    expect(resolveKnownTestAssetUrl("jamwon_01_exterior.jpg")).toContain(
      "/api/public/testguide-assets/images/v2-case03/"
    );
    expect(resolveKnownTestAssetUrl("seocho_01_exterior.jpg")).toContain(
      "/api/public/testguide-assets/images/broker-case02/"
    );
  });

  it("P0-2b: /api/public/testguide-assets blocks anonymous requests under QA gate but allows authenticated broker sessions", async () => {
    process.env.CRE_ENFORCE_QA_GATE = "1";

    mockRequireBroker.mockResolvedValueOnce({
      user: null,
      error: new Response("Unauthorized", { status: 401 }),
    });
    const unauthReq = new NextRequest(
      "https://www.credeal.net/api/public/testguide-assets/images/01_%EB%8F%99%EA%B5%90%EB%8F%99_THEPARK/01_%EB%8F%99%EA%B5%90%EB%8F%99_THEPARK_%EC%A0%84%EB%A9%B4%EC%99%B8%EA%B4%80.jpg"
    );
    const unauthRes = await getTestguideAsset(unauthReq, {
      params: Promise.resolve({
        slug: [
          "images",
          "01_동교동_THEPARK",
          "01_동교동_THEPARK_전면외관.jpg",
        ],
      }),
    });
    expect(unauthRes.status).toBe(404);
    expect(unauthRes.headers.get("X-Robots-Tag")).toContain("noindex");

    mockRequireBroker.mockResolvedValueOnce({
      user: { id: "broker-session-123" },
      error: null,
    });
    const brokerReq = new NextRequest(
      "https://www.credeal.net/api/public/testguide-assets/images/01_%EB%8F%99%EA%B5%90%EB%8F%99_THEPARK/01_%EB%8F%99%EA%B5%90%EB%8F%99_THEPARK_%EC%A0%84%EB%A9%B4%EC%99%B8%EA%B4%80.jpg"
    );
    const brokerRes = await getTestguideAsset(brokerReq, {
      params: Promise.resolve({
        slug: [
          "images",
          "01_동교동_THEPARK",
          "01_동교동_THEPARK_전면외관.jpg",
        ],
      }),
    });
    expect(brokerRes.status).toBe(200);
    expect(brokerRes.headers.get("Content-Type")).toContain("image/jpeg");
  });

  it("P1-1: WorkspaceBottomNav contains badge cleanly with flexible height and InboxListColumn keeps toggle indicator nowrap", async () => {
    const tabsWithBadge = DEFAULT_WORKSPACE_TABS.map((t) =>
      t.id === "inbox" ? { ...t, badge: 39 } : t
    );

    await act(async () => {
      root.render(
        <div>
          <WorkspaceBottomNav tabs={tabsWithBadge} activeTabId="inbox" />
          <InboxListColumn
            threads={[]}
            filteredThreads={[]}
            pendingCount={0}
            activeThread={null}
            activeFilter="all"
            searchQuery=""
            viewMode="simple"
            busyAction={null}
            onFilterChange={vi.fn()}
            onSearchChange={vi.fn()}
            onViewModeChange={vi.fn()}
            onSelectThread={vi.fn()}
            onApproveAndSendIm={vi.fn()}
            onOpenNewClientModal={vi.fn()}
            onOpenBulkImportModal={vi.fn()}
          />
        </div>
      );
    });

    const nav = container.querySelector('[data-testid="workspace-bottom-nav"]');
    expect(nav).not.toBeNull();
    const grid = nav!.firstElementChild as HTMLElement | null;
    expect(grid?.className).toContain("min-h-16");
    expect(grid?.className).toContain("h-auto");

    const inboxTab = container.querySelector(
      '[data-testid="workspace-tab-inbox"]'
    ) as HTMLElement | null;
    expect(inboxTab?.className).toContain("min-w-0");
    expect(inboxTab?.className).toContain("overflow-hidden");
    expect(inboxTab?.textContent).toContain("39");

    const mobileToggle = container.querySelector(
      '[data-testid="inbox-mobile-controls-toggle"]'
    ) as HTMLButtonElement | null;
    expect(mobileToggle).not.toBeNull();
    const indicatorSpan = mobileToggle!.querySelector('span[aria-hidden="true"]');
    expect(indicatorSpan?.className).toContain("whitespace-nowrap");
    expect(indicatorSpan?.className).toContain("shrink-0");
  });

  it("P1-2: detects tall full-page mobile screenshots vs landscape 16:9 slides", () => {
    expect(isTallMobileCaptureAspect(390, 8840)).toBe(true);
    expect(isTallMobileCaptureAspect(780, 3200)).toBe(true);
    expect(isTallMobileCaptureAspect(1920, 1080)).toBe(false);
    expect(isTallMobileCaptureAspect(1280, 853)).toBe(false);
    expect(isTallMobileCaptureAspect(0, 0)).toBe(false);
  });
});
