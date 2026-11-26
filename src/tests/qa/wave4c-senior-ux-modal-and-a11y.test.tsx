// @vitest-environment jsdom
/**
 * Wave 4 Track 4C — Senior Readability 14px Expansion, WAI-ARIA Modal Focus Traps
 * & Semantic Keyboard Accessibility Regression Suite
 *
 * Verifies:
 *  1. `SUB14_LOCKED_FILES` in `eslint.config.mjs` & `.github/workflows/ci.yml` lock all 10 newly
 *     added active public/landing/shared UI paths with zero drift and 0 sub-14px tokens.
 *  2. `InboxNewClientModal` & `InboxEditClientModal` render `role="dialog"` + `aria-modal="true"`
 *     + `aria-labelledby`, close on `Escape`, trap `Tab` / `Shift+Tab` focus, restore focus on
 *     unmount, and set explicit `type="button"` on all non-submit buttons.
 *  3. `ConfirmDeleteModal` & `PhotoGallery` lightbox satisfy WAI-ARIA dialog semantics, Escape
 *     close, ArrowLeft/ArrowRight navigation, Tab focus trap, and `renderToStaticMarkup` safety.
 *  4. `InboxListColumn` thread items support keyboard `Enter` and `Space` (with `preventDefault()`
 *     on Space) activation across both detailed and simple views with zero nested interactive buttons.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

import {
  InboxNewClientModal,
  InboxEditClientModal,
  type InboxClientFormValues,
} from "@/app/(broker)/broker/w/inbox/_components/InboxClientModals";
import { InboxListColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxListColumn";
import type { InboxThreadItem } from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { PhotoGallery } from "@/app/(public)/im-lite/[buildingId]/components/photo-gallery";
import { FOCUSABLE_SELECTOR } from "@/components/ui/modal-logic";

const REPO_ROOT = process.cwd();

const WAVE4C_NEW_LOCKED_ENTRIES = [
  "src/app/page.tsx",
  "src/components/landing/**/*.{ts,tsx}",
  "src/components/common/**/*.{ts,tsx}",
  "src/components/forms/**/*.{ts,tsx}",
  "src/components/cards/**/*.{ts,tsx}",
  "src/app/(public)/privacy/**/*.{ts,tsx}",
  "src/app/(public)/terms/**/*.{ts,tsx}",
  "src/app/(public)/owner-readiness/**/*.{ts,tsx}",
  "src/app/(public)/explore/**/*.{ts,tsx}",
  "src/app/(public)/insight/**/*.{ts,tsx}",
] as const;

const SUB14_TOKEN_RE =
  /(?:^|\s|"|'|`)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/|"|'|`)/;

function collectTsFiles(relTarget: string): string[] {
  const cleanRel = relTarget.replace(/\/\*\*\/\*\.\\?\{ts,tsx\\?\}$/, "").replace(/\/\*\*\/\*\.{ts,tsx}$/, "");
  const abs = path.resolve(REPO_ROOT, cleanRel);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(abs);
  return results;
}

function parseSub14LockedFilesFromEslintConfig(): string[] {
  const src = fs.readFileSync(path.resolve(REPO_ROOT, "eslint.config.mjs"), "utf8");
  const match = src.match(/export\s+const\s+SUB14_LOCKED_FILES\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (m) => m[1]);
}

function makeSampleClientValues(): InboxClientFormValues {
  return {
    name: "박상훈 대표",
    phone: "010-1234-5678",
    email: "park@credeal.kr",
    company: "한강홀딩스",
    basis: "im_request",
    grade: "VIP",
    role: "buyer",
    buildingTitle: "역삼동 코너 근생빌딩",
    budget: "80~100억",
    region: "강남구",
    freeMemo: "현장 답사 희망",
    newsletterOptIn: true,
  };
}

function makeSampleThread(id: string, name: string): InboxThreadItem {
  return {
    id,
    clientName: name,
    clientPhone: "010-2222-3333",
    clientEmail: "client@example.co.kr",
    clientCompany: "미래에셋",
    clientGrade: "VIP",
    isVip: true,
    clientRole: "buyer",
    buildingId: "bld-wave4c-1",
    buildingTitle: "역삼동 코너 근생빌딩",
    latestEvent: "딜카드를 열람했습니다",
    shareToken: "tok-wave4c",
    shareUrl: "/dc/bld-wave4c-1",
    status: "active",
    openCount: 2,
    isRead: false,
    budget: "90억",
    preferredRegion: "강남구",
    updatedAt: "2026-11-26T06:00:00Z",
    lastActivityAt: "2026-11-26T06:00:00Z",
    hasIm: true,
    hasDealCard: true,
    events: [],
    dispatchHistory: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 4C — Senior Readability 14px Guard Expansion, WAI-ARIA Modal Focus Traps & Keyboard Semantics", () => {
  describe("1. SUB14_LOCKED_FILES Expansion, CI Sync & Zero Sub-14px Tokens", () => {
    it("includes all 10 newly locked public/landing/shared UI paths in SUB14_LOCKED_FILES and keeps .github/workflows/ci.yml 100% in sync", () => {
      const lockedEntries = parseSub14LockedFilesFromEslintConfig();
      expect(lockedEntries.length).toBeGreaterThanOrEqual(64);

      for (const expected of WAVE4C_NEW_LOCKED_ENTRIES) {
        expect(lockedEntries).toContain(expected);
      }

      const ciSrc = fs.readFileSync(
        path.resolve(REPO_ROOT, ".github", "workflows", "ci.yml"),
        "utf8"
      );
      expect(ciSrc).toContain("SUB14_LOCKED_FILES");

      for (const entry of lockedEntries) {
        const ciTarget = entry.replace("/**/*.{ts,tsx}", "");
        expect(
          ciSrc,
          `Expected .github/workflows/ci.yml to include "${ciTarget}"`
        ).toContain(`"${ciTarget}"`);
      }
    });

    it("enforces 0 sub-14px text tokens across all files in the 10 newly locked paths", () => {
      const allFiles = WAVE4C_NEW_LOCKED_ENTRIES.flatMap((entry) =>
        collectTsFiles(entry)
      );
      expect(allFiles.length).toBeGreaterThanOrEqual(13);

      for (const absFile of allFiles) {
        const rel = path.relative(REPO_ROOT, absFile).replace(/\\/g, "/");
        const content = fs.readFileSync(absFile, "utf8");
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
        const match = stripped.match(SUB14_TOKEN_RE);
        expect(
          match,
          `${rel} contains forbidden sub-14px token: ${match?.[0] ?? ""}`
        ).toBeNull();
      }
    });
  });

  describe("2. WAI-ARIA Modal Focus Traps, Escape Key Close & Focus Restoration", () => {
    it("InboxNewClientModal renders role=dialog + aria-modal=true + aria-labelledby, closes on Escape, traps Tab/Shift+Tab focus, and restores trigger focus on unmount", () => {
      const onClose = vi.fn();
      const onSwitchBulk = vi.fn();

      const triggerBtn = document.createElement("button");
      triggerBtn.type = "button";
      triggerBtn.textContent = "고객 등록 열기";
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      const { unmount } = render(
        <InboxNewClientModal
          open={true}
          values={makeSampleClientValues()}
          inventory={[]}
          busyAction={null}
          onSwitchToBulkImport={onSwitchBulk}
          onChange={vi.fn()}
          onClose={onClose}
          onSubmit={vi.fn()}
        />
      );

      const dialog = screen.getByTestId("inbox-new-client-dialog");
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      const labelId = dialog.getAttribute("aria-labelledby");
      expect(labelId).toBe("inbox-new-client-dialog-title");
      expect(document.getElementById(labelId!)?.textContent).toBe("신규 고객 등록");

      // Initial focus moved inside the modal
      expect(dialog.contains(document.activeElement)).toBe(true);

      // Every non-submit button inside modal has explicit type="button"
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
      expect(buttons.length).toBeGreaterThanOrEqual(4);
      for (const btn of buttons) {
        const rawType = btn.getAttribute("type");
        expect(["button", "submit"]).toContain(rawType);
      }

      // Tab wraps from last focusable -> first focusable; Shift+Tab wraps first -> last
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      expect(focusables.length).toBeGreaterThan(3);
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];

      lastFocusable.focus();
      expect(document.activeElement).toBe(lastFocusable);
      fireEvent.keyDown(lastFocusable, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(firstFocusable);

      fireEvent.keyDown(firstFocusable, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(lastFocusable);

      // Escape invokes onClose
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Unmount restores focus to triggerBtn
      unmount();
      expect(document.activeElement).toBe(triggerBtn);
      triggerBtn.remove();
    });

    it("InboxEditClientModal renders role=dialog + aria-modal=true + aria-labelledby, closes on Escape, traps Tab/Shift+Tab focus, and restores trigger focus on unmount", () => {
      const onClose = vi.fn();
      const { newsletterOptIn: _unused, ...editValues } = makeSampleClientValues();
      void _unused;

      const triggerBtn = document.createElement("button");
      triggerBtn.type = "button";
      triggerBtn.textContent = "고객 수정 열기";
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();

      const { unmount } = render(
        <InboxEditClientModal
          open={true}
          values={editValues}
          busyAction={null}
          onChange={vi.fn()}
          onClose={onClose}
          onSubmit={vi.fn()}
        />
      );

      const dialog = screen.getByTestId("inbox-edit-client-dialog");
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("inbox-edit-client-dialog-title");
      expect(dialog.contains(document.activeElement)).toBe(true);

      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
      for (const btn of buttons) {
        expect(["button", "submit"]).toContain(btn.getAttribute("type"));
      }

      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];

      lastFocusable.focus();
      fireEvent.keyDown(lastFocusable, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(firstFocusable);

      fireEvent.keyDown(firstFocusable, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(lastFocusable);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);

      unmount();
      expect(document.activeElement).toBe(triggerBtn);
      triggerBtn.remove();
    });

    it("ConfirmDeleteModal preserves synchronous renderToStaticMarkup compatibility and enforces role=dialog, Escape close, Tab trap, and explicit type=button", () => {
      const staticHtml = renderToStaticMarkup(
        <ConfirmDeleteModal
          isOpen={true}
          title="매물 삭제 확인"
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      );
      expect(staticHtml).toContain('role="dialog"');
      expect(staticHtml).toContain('aria-modal="true"');

      const onCancel = vi.fn();
      render(
        <ConfirmDeleteModal
          isOpen={true}
          title="매물 삭제 확인"
          requireMatchText="역삼동 빌딩"
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
      );

      const modal = screen.getByTestId("confirm-delete-modal");
      expect(modal.getAttribute("role")).toBe("dialog");
      expect(modal.getAttribute("aria-modal")).toBe("true");

      for (const btn of Array.from(modal.querySelectorAll("button"))) {
        expect(btn.getAttribute("type")).toBe("button");
      }

      fireEvent.keyDown(modal, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("PhotoGallery lightbox exposes role=dialog + aria-modal=true + aria-label, ArrowLeft/ArrowRight navigation, Tab focus trap, and Escape close", () => {
      render(
        <PhotoGallery
          blindName="역삼동 코너 빌딩"
          photos={[
            { url: "/demo-photo-1.jpg", label: "전면 외관", type: "exterior", order: 1 },
            { url: "/demo-photo-2.jpg", label: "1층 로비", type: "interior", order: 2 },
          ]}
        />
      );

      const thumbButtons = screen.getAllByRole("button", { name: /크게 보기/ });
      expect(thumbButtons).toHaveLength(2);

      // Open lightbox via keyboard Enter on first photo
      thumbButtons[0].focus();
      fireEvent.keyDown(thumbButtons[0], { key: "Enter" });

      const lightbox = screen.getByRole("dialog", { name: "매물 사진 크게 보기" });
      expect(lightbox.getAttribute("aria-modal")).toBe("true");

      const lightboxButtons = Array.from(lightbox.querySelectorAll("button"));
      expect(lightboxButtons.length).toBe(3);
      for (const btn of lightboxButtons) {
        expect(btn.getAttribute("type")).toBe("button");
      }

      // ArrowRight advances 1 / 2 -> 2 / 2, ArrowLeft returns 2 / 2 -> 1 / 2
      expect(lightbox.textContent).toContain("1 / 2");
      fireEvent.keyDown(lightbox, { key: "ArrowRight" });
      expect(lightbox.textContent).toContain("2 / 2");
      fireEvent.keyDown(lightbox, { key: "ArrowLeft" });
      expect(lightbox.textContent).toContain("1 / 2");

      // Tab focus trap cycles inside lightbox
      const firstBtn = lightboxButtons[0];
      const lastBtn = lightboxButtons[lightboxButtons.length - 1];
      lastBtn.focus();
      fireEvent.keyDown(lastBtn, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(firstBtn);

      // Escape closes lightbox and restores focus to thumbnail trigger
      fireEvent.keyDown(lightbox, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "매물 사진 크게 보기" })).toBeNull();
      expect(document.activeElement).toBe(thumbButtons[0]);
    });
  });

  describe("3. InboxListColumn Keyboard Enter / Space Activation & Semantic Buttons", () => {
    it("activates thread selection on Enter and Space (preventing default scroll on Space) in both detailed and simple view modes", () => {
      const threadA = makeSampleThread("thr-a11y-1", "김영수 회장");
      const threadB = makeSampleThread("thr-a11y-2", "이정훈 대표");
      const onSelectThread = vi.fn();

      const { container, rerender } = render(
        <InboxListColumn
          threads={[threadA, threadB]}
          filteredThreads={[threadA, threadB]}
          pendingCount={1}
          firstPendingThread={threadA}
          activeThread={threadA}
          activeFilter="all"
          searchQuery=""
          viewMode="detailed"
          busyAction={null}
          onFilterChange={vi.fn()}
          onSearchChange={vi.fn()}
          onViewModeChange={vi.fn()}
          onSelectThread={onSelectThread}
          onOpenNewClientModal={vi.fn()}
          onOpenBulkImportModal={vi.fn()}
        />
      );

      // Zero nested <button> inside [role="button"] and explicit type="button" on all buttons
      expect(container.querySelectorAll('[role="button"] button')).toHaveLength(0);
      for (const btn of Array.from(container.querySelectorAll("button"))) {
        expect(btn.getAttribute("type")).toBe("button");
      }

      const detailedRowB = screen.getByTestId("inbox-thread-row-thr-a11y-2");
      expect(detailedRowB.getAttribute("role")).toBe("button");
      expect(detailedRowB.getAttribute("tabindex")).toBe("0");

      // Enter activates selection
      fireEvent.keyDown(detailedRowB, { key: "Enter" });
      expect(onSelectThread).toHaveBeenCalledWith("thr-a11y-2");

      // Space activates selection AND calls preventDefault()
      onSelectThread.mockClear();
      const spaceEvtDetailed = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      const notCancelledDetailed = detailedRowB.dispatchEvent(spaceEvtDetailed);
      expect(notCancelledDetailed).toBe(false);
      expect(spaceEvtDetailed.defaultPrevented).toBe(true);
      expect(onSelectThread).toHaveBeenCalledWith("thr-a11y-2");

      // Switch to simple view mode and verify semantic <button type="button"> + Enter/Space activation
      onSelectThread.mockClear();
      rerender(
        <InboxListColumn
          threads={[threadA, threadB]}
          filteredThreads={[threadA, threadB]}
          pendingCount={1}
          firstPendingThread={threadA}
          activeThread={threadA}
          activeFilter="all"
          searchQuery=""
          viewMode="simple"
          busyAction={null}
          onFilterChange={vi.fn()}
          onSearchChange={vi.fn()}
          onViewModeChange={vi.fn()}
          onSelectThread={onSelectThread}
          onOpenNewClientModal={vi.fn()}
          onOpenBulkImportModal={vi.fn()}
        />
      );

      const simpleRowB = screen.getByTestId("inbox-thread-row-thr-a11y-2");
      expect(simpleRowB.tagName).toBe("BUTTON");
      expect(simpleRowB.getAttribute("type")).toBe("button");

      fireEvent.keyDown(simpleRowB, { key: "Enter" });
      expect(onSelectThread).toHaveBeenCalledWith("thr-a11y-2");

      onSelectThread.mockClear();
      const spaceEvtSimple = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      simpleRowB.dispatchEvent(spaceEvtSimple);
      expect(spaceEvtSimple.defaultPrevented).toBe(true);
      expect(onSelectThread).toHaveBeenCalledWith("thr-a11y-2");
    });
  });
});
