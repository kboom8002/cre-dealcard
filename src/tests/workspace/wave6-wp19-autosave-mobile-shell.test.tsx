// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave6-wp19-autosave-mobile-shell.test.tsx
 * @description Wave 6 — WP-19 Verification Suite:
 * 1. useWorkspaceAutosave: <900ms unmount & pagehide flush with keepalive: true, plus cancelPending() delete safety.
 * 2. useEditionAutosave: <3s unmount & pagehide PATCH /api/magazine/editions with keepalive: true.
 * 3. WorkspaceShell: <768px mobile /broker/profile link + mobile font-scale control, lifted UndoToastProvider across mobile tabs, and ?qa=1-only QaFeedbackPinWidget.
 * 4. Newsletter route canonicalization (/broker/w/magazine query-preserving redirect & /broker/w/newsletter topbar canonical link).
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";

let mockPathname = "/broker/w/dealcards";
let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import {
  useWorkspaceAutosave,
  type UseWorkspaceAutosaveResult,
} from "@/lib/hooks/useWorkspaceAutosave";
import { useEditionAutosave } from "@/components/magazine-editor/useEditionAutosave";
import {
  WorkspaceShell,
  WS_TOPBAR_LINKS,
} from "@/components/workspace/WorkspaceShell";
import { useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { FONT_SCALE_STORAGE_KEY } from "@/components/workspace/FontScaleToggle";
import MagazineWorkspacePage, {
  buildCanonicalMagazineRedirectUrl,
} from "@/app/(broker)/broker/w/magazine/page";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Wave 6 — WP-19: <900ms Keepalive Autosave Flush, Mobile Shell Polish, & ?qa=1 Gate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/broker/w/dealcards";
    mockSearchParams = new URLSearchParams();
    mockReplace.mockReset();
    mockPush.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/broker/w/dealcards");
    delete document.documentElement.dataset.fontScale;
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. useWorkspaceAutosave (<900ms unmount & pagehide keepalive flush)", () => {
    it("flushes dirty payload immediately on unmount (<900ms before debounce fires) with keepalive: true", async () => {
      const onSave = vi.fn().mockResolvedValue({ version: 2 });
      const latestAutosaveRef: { current: UseWorkspaceAutosaveResult | null } = {
        current: null,
      };

      function Harness({ title }: { title: string }) {
        latestAutosaveRef.current = useWorkspaceAutosave({
          id: "deal-fast-unmount",
          data: { title },
          expectedVersion: 1,
          debounceMs: 900,
          onSave,
        });
        return <div>{title}</div>;
      }

      await act(async () => {
        root.render(<Harness title="초기 한 줄 제목" />);
      });
      expect(latestAutosaveRef.current?.status).toBe("idle");

      // Edit input
      await act(async () => {
        root.render(<Harness title="역삼역 도보 3분 코너 사옥 매물" />);
      });
      expect(latestAutosaveRef.current?.dirty).toBe(true);

      // Only 200ms elapsed (< 900ms debounce) — broker navigates away / unmounts!
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onSave).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({
        id: "deal-fast-unmount",
        data: { title: "역삼역 도보 3분 코너 사옥 매물" },
        expectedVersion: 1,
        keepalive: true,
      });

      // Re-create root for clean afterEach teardown
      root = createRoot(container);
    });

    it("flushes dirty payload immediately on pagehide with keepalive: true", async () => {
      const onSave = vi.fn().mockResolvedValue({ version: 5 });

      function Harness({ priceManwon }: { priceManwon: number }) {
        useWorkspaceAutosave({
          id: "im-pagehide-1",
          data: { priceManwon },
          expectedVersion: 4,
          debounceMs: 1200,
          onSave,
        });
        return null;
      }

      await act(async () => {
        root.render(<Harness priceManwon={500000} />);
      });
      await act(async () => {
        root.render(<Harness priceManwon={520000} />);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onSave).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new Event("pagehide"));
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({
        id: "im-pagehide-1",
        data: { priceManwon: 520000 },
        expectedVersion: 4,
        keepalive: true,
      });
    });

    it("does NOT flush on unmount or pagehide if cancelPending() was called (delete safety)", async () => {
      const onSave = vi.fn().mockResolvedValue({ version: 2 });
      let latestAutosave: UseWorkspaceAutosaveResult | null = null;

      function Harness({ title }: { title: string }) {
        latestAutosave = useWorkspaceAutosave({
          id: "deal-deleted-1",
          data: { title },
          expectedVersion: 1,
          debounceMs: 900,
          onSave,
        });
        return null;
      }

      await act(async () => {
        root.render(<Harness title="원본 제목" />);
      });
      await act(async () => {
        root.render(<Harness title="삭제 직전 수정본" />);
      });

      // Broker deletes the item -> cancelPending is invoked
      act(() => {
        latestAutosave?.cancelPending("deal-deleted-1");
      });

      await act(async () => {
        window.dispatchEvent(new Event("pagehide"));
        root.unmount();
      });

      expect(onSave).not.toHaveBeenCalled();
      root = createRoot(container);
    });
  });

  describe("2. useEditionAutosave (keepalive: true unmount & pagehide flush)", () => {
    it("fires PATCH /api/magazine/editions with keepalive: true when unmounted <3s while dirty", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          edition: { updated_at: "2026-11-15T10:05:00Z" },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      function EditionHarness({
        sig,
        headline,
      }: {
        sig: string;
        headline: string;
      }) {
        useEditionAutosave({
          editionId: "ed-keepalive-1",
          ready: true,
          enabled: true,
          signature: sig,
          getPayload: () => ({ cover_title: headline }) as never,
          initialUpdatedAt: "2026-11-15T10:00:00Z",
        });
        return <div>{headline}</div>;
      }

      await act(async () => {
        root.render(<EditionHarness sig="sig-1" headline="11월 3주차 브리핑" />);
      });
      await act(async () => {
        root.render(
          <EditionHarness
            sig="sig-2"
            headline="11월 3주차 강남·마포 금리 인하기 브리핑"
          />
        );
      });

      // Only 300ms elapsed (< 3000ms AUTOSAVE_DEBOUNCE_MS)
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      // Unmount immediately
      await act(async () => {
        root.unmount();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/magazine/editions");
      expect(init.method).toBe("PATCH");
      expect(init.keepalive).toBe(true);
      const parsedBody = JSON.parse(String(init.body));
      expect(parsedBody).toMatchObject({
        id: "ed-keepalive-1",
        cover_title: "11월 3주차 강남·마포 금리 인하기 브리핑",
        expected_updated_at: "2026-11-15T10:00:00Z",
      });

      root = createRoot(container);
    });
  });

  describe("3. WorkspaceShell (<768px mobile profile/font-scale, lifted UndoToastProvider, ?qa=1 pin gate)", () => {
    it("exposes /broker/profile link and mobile font-scale button at <768px while preserving desktop font-scale buttons", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: true, count: 0 }),
        })
      );
      Object.defineProperty(window, "innerWidth", {
        value: 390,
        configurable: true,
        writable: true,
      });

      await act(async () => {
        root.render(
          <WorkspaceShell
            workspace="dealcards"
            listSlot={<div>목록 영역</div>}
            editorSlot={<div>편집 영역</div>}
            previewSlot={<div>미리보기 영역</div>}
          />
        );
      });

      const profileLink = container.querySelector(
        '[data-testid="workspace-nav-profile"]'
      ) as HTMLAnchorElement | null;
      expect(profileLink).not.toBeNull();
      expect(profileLink?.getAttribute("href")).toBe("/broker/profile");
      // Must NOT hide profile link on <640px mobile via `hidden sm:inline-flex`
      expect(profileLink?.className).not.toContain("hidden");
      expect(profileLink?.className).toContain("min-h-[44px]");

      const mobileFontBtn = container.querySelector(
        '[data-testid="workspace-mobile-font-scale-btn"]'
      ) as HTMLButtonElement | null;
      expect(mobileFontBtn).not.toBeNull();
      expect(mobileFontBtn?.className).toContain("min-h-[44px]");

      // Desktop font scale testids remain intact
      expect(
        container.querySelector('[data-testid="workspace-font-scale-compact"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="workspace-font-scale-normal"]')
      ).not.toBeNull();

      // Clicking mobile font-scale button cycles normal -> large -> xlarge -> compact
      await act(async () => {
        mobileFontBtn!.click();
      });
      expect(document.documentElement.dataset.fontScale).toBe("large");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("large");
    });

    it("lifts UndoToastProvider to WorkspaceShell root so undo toasts survive mobile tab switches", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: true, count: 0 }),
        })
      );

      const undoSpy = vi.fn();
      function DeleteTriggerInList() {
        const { showUndoToast } = useUndoToast();
        return (
          <button
            type="button"
            data-testid="trigger-delete-toast-btn"
            onClick={() =>
              showUndoToast({
                message: "매물 초안을 삭제했습니다.",
                undoAction: undoSpy,
              })
            }
          >
            삭제 테스트
          </button>
        );
      }

      await act(async () => {
        root.render(
          <WorkspaceShell
            workspace="im"
            selectedBuildingId="bld-101"
            listSlot={<DeleteTriggerInList />}
            editorSlot={<div>편집 화면</div>}
            previewSlot={<div>미리보기 화면</div>}
          />
        );
      });

      const triggerBtn = container.querySelector(
        '[data-testid="trigger-delete-toast-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        triggerBtn.click();
      });

      expect(
        container.querySelector('[data-testid="undo-confirm-toast"]')
      ).not.toBeNull();

      // Switch mobile view editor -> preview -> toast stays mounted and clickable!
      const mobilePreviewTab = container.querySelector(
        '[data-testid="mobile-tab-preview"]'
      ) as HTMLButtonElement | null;
      expect(mobilePreviewTab).not.toBeNull();
      await act(async () => {
        mobilePreviewTab!.click();
      });

      const undoBtn = container.querySelector(
        '[data-testid="undo-action-btn"]'
      ) as HTMLButtonElement | null;
      expect(undoBtn).not.toBeNull();
      await act(async () => {
        undoBtn!.click();
      });
      expect(undoSpy).toHaveBeenCalledTimes(1);
    });

    it("hides QaFeedbackPinWidget by default (even if legacy localStorage key is set) and renders it when ?qa=1 is active", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: true, count: 0 }),
        })
      );

      // Even if legacy persistent localStorage key was left over, production broker must NOT see QA pin
      window.localStorage.setItem("credeal-qa-pin-active", "1");
      mockSearchParams = new URLSearchParams();
      window.history.replaceState({}, "", "/broker/w/im");

      await act(async () => {
        root.render(
          <WorkspaceShell
            workspace="im"
            listSlot={<div>목록</div>}
            editorSlot={<div>편집</div>}
            previewSlot={<div>미리보기</div>}
          />
        );
      });

      expect(
        container.querySelector('[data-testid="qa-pin-widget-root"]')
      ).toBeNull();

      // Activate ?qa=1 -> QA pin renders and records session-only flag
      mockSearchParams = new URLSearchParams("qa=1");
      window.history.replaceState({}, "", "/broker/w/im?qa=1");

      await act(async () => {
        root.render(
          <WorkspaceShell
            workspace="im"
            listSlot={<div>목록</div>}
            editorSlot={<div>편집</div>}
            previewSlot={<div>미리보기</div>}
          />
        );
      });

      expect(
        container.querySelector('[data-testid="qa-pin-widget-root"]')
      ).not.toBeNull();
      expect(window.sessionStorage.getItem("credeal_qa_mode")).toBe("1");
    });
  });

  describe("4. Newsletter Route Canonicalization", () => {
    it("points topbar newsletter link to /broker/w/newsletter and preserves ?edition=&step= on /broker/w/magazine redirect", async () => {
      const magLink = WS_TOPBAR_LINKS.find((item) => item.id === "magazine");
      expect(magLink?.href).toBe("/broker/w/newsletter");

      expect(
        buildCanonicalMagazineRedirectUrl("edition=ed-2026-11&step=publish", "")
      ).toBe("/broker/w/newsletter?edition=ed-2026-11&step=publish");

      mockPathname = "/broker/w/magazine";
      mockSearchParams = new URLSearchParams("edition=ed-77&step=deals");

      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(
        "/broker/w/newsletter?edition=ed-77&step=deals"
      );
    });
  });
});
