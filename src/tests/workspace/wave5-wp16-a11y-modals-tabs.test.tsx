// @vitest-environment jsdom
import React, { useState } from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/broker/profile",
  useSearchParams: () => new URLSearchParams(),
}));

import { AccessibleTabs, AccessibleTabPanel } from "@/components/ui/accessible-tabs";
import PublicGateRequestForm from "@/app/(public)/dc/[id]/GateRequestForm";
import BrokerGateRequestForm from "@/components/broker/GateRequestForm";
import { IMInquiryBottomSheet } from "@/app/(public)/im-lite/[buildingId]/components/im-inquiry-bottom-sheet";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import { DealInquirySheet } from "@/components/magazine/DealInquirySheet";
import { BrokerHome4Doors } from "@/app/(broker)/broker/_components/BrokerHome4Doors";
import type { AggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  vi.restoreAllMocks();
});

const SAMPLE_HOME_DATA: AggregatedBrokerHomeData = {
  profile: {
    displayName: "박중개",
    photoUrl: null,
    role: "broker",
  },
  resumeItem: {
    id: "bld-01",
    title: "역삼동 코너 근생빌딩",
    timeAgo: "3분 전",
    href: "/broker/w/dealcards?buildingId=bld-01",
    statusText: "작성 중",
  },
  doors: {
    dealcards: {
      id: "dealcards",
      shortcutNumber: 1,
      title: "딜카드 만들기",
      subtitle: "카톡 1장 요약 브리핑",
      href: "/broker/w/dealcards",
      icon: "Building2",
      badge: {
        count: 2,
        label: "작성 중 2건",
        href: "/broker/w/dealcards?tab=list",
        highlight: true,
      },
    },
    im: {
      id: "im",
      shortcutNumber: 2,
      title: "기본 IM 제안서",
      subtitle: "모바일·PPT 투자설명서",
      href: "/broker/w/im",
      icon: "Presentation",
      badge: {
        count: 1,
        label: "검토 대기 1건",
        href: "/broker/w/im?tab=list",
        highlight: false,
      },
    },
    magazine: {
      id: "magazine",
      shortcutNumber: 3,
      title: "주간 매물 소식지",
      subtitle: "고객 안부 뉴스레터",
      href: "/broker/magazine-editor",
      icon: "Newspaper",
      badge: {
        count: 1,
        label: "이번 주 초안",
        href: "/broker/magazine-editor",
        highlight: true,
      },
    },
    inbox: {
      id: "inbox",
      shortcutNumber: 4,
      title: "고객 소통함",
      subtitle: "자료 요청 승인 · 열람 알림",
      href: "/broker/w/inbox",
      icon: "MessageSquareMore",
      badge: {
        count: 3,
        label: "열람 3명",
        href: "/broker/w/inbox",
        highlight: true,
      },
    },
  },
};

describe("Wave 5 — WP-16: AccessibleTabs, Consolidated Modals, >=16px Form Controls, Zero Native Dialogs & 44px Touch Targets", () => {
  describe("1. <AccessibleTabs> WAI-ARIA Tabs Pattern", () => {
    function TabsHarness() {
      const [active, setActive] = useState<"overview" | "leases" | "docs">("overview");
      return (
        <div>
          <AccessibleTabs
            idPrefix="test-tabs"
            ariaLabel="매물 정보 탭"
            value={active}
            onValueChange={setActive}
            tabs={[
              { id: "overview", label: "개요", testId: "tab-overview" },
              { id: "leases", label: "임대 현황", testId: "tab-leases" },
              { id: "docs", label: "공부 서류", testId: "tab-docs" },
            ]}
          />
          <AccessibleTabPanel idPrefix="test-tabs" tabId="overview" active={active === "overview"}>
            개요 패널
          </AccessibleTabPanel>
          <AccessibleTabPanel idPrefix="test-tabs" tabId="leases" active={active === "leases"}>
            임대 현황 패널
          </AccessibleTabPanel>
          <AccessibleTabPanel idPrefix="test-tabs" tabId="docs" active={active === "docs"}>
            공부 서류 패널
          </AccessibleTabPanel>
        </div>
      );
    }

    it("renders role=tablist/tab, aria-selected, aria-controls, roving tabIndex, >=44px touch targets, and ArrowRight/ArrowLeft/Home/End navigation", () => {
      render(<TabsHarness />);

      const tablist = screen.getByRole("tablist", { name: "매물 정보 탭" });
      expect(tablist).toBeTruthy();

      const tabOverview = screen.getByTestId("tab-overview");
      const tabLeases = screen.getByTestId("tab-leases");
      const tabDocs = screen.getByTestId("tab-docs");

      expect(tabOverview.getAttribute("role")).toBe("tab");
      expect(tabOverview.getAttribute("aria-selected")).toBe("true");
      expect(tabOverview.getAttribute("tabindex")).toBe("0");
      expect(tabOverview.getAttribute("aria-controls")).toBe("test-tabs-panel-overview");
      expect(tabOverview.className).toContain("min-h-[44px]");

      expect(tabLeases.getAttribute("aria-selected")).toBe("false");
      expect(tabLeases.getAttribute("tabindex")).toBe("-1");
      expect(tabDocs.getAttribute("aria-selected")).toBe("false");
      expect(tabDocs.getAttribute("tabindex")).toBe("-1");

      tabOverview.focus();
      expect(document.activeElement).toBe(tabOverview);

      // ArrowRight -> leases
      fireEvent.keyDown(tabOverview, { key: "ArrowRight" });
      expect(document.activeElement).toBe(tabLeases);
      expect(tabLeases.getAttribute("aria-selected")).toBe("true");
      expect(tabLeases.getAttribute("tabindex")).toBe("0");
      expect(tabOverview.getAttribute("tabindex")).toBe("-1");
      expect(screen.getByRole("tabpanel").textContent).toContain("임대 현황 패널");

      // End -> docs
      fireEvent.keyDown(tabLeases, { key: "End" });
      expect(document.activeElement).toBe(tabDocs);
      expect(tabDocs.getAttribute("aria-selected")).toBe("true");

      // ArrowRight wraps -> overview
      fireEvent.keyDown(tabDocs, { key: "ArrowRight" });
      expect(document.activeElement).toBe(tabOverview);
      expect(tabOverview.getAttribute("aria-selected")).toBe("true");

      // ArrowLeft wraps -> docs
      fireEvent.keyDown(tabOverview, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(tabDocs);
      expect(tabDocs.getAttribute("aria-selected")).toBe("true");

      // Home -> overview
      fireEvent.keyDown(tabDocs, { key: "Home" });
      expect(document.activeElement).toBe(tabOverview);
      expect(tabOverview.getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("2. >=16px Inputs + Explicit <label htmlFor> + Modal Escape / ARIA Dialog", () => {
    const findLabelFor = (root: ParentNode, id: string) =>
      Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(
        (lbl) => lbl.htmlFor === id
      ) ?? null;

    it("PublicGateRequestForm and BrokerGateRequestForm attach explicit <label htmlFor> and >=16px, min-h-[48px] classes on all inputs/textareas", () => {
      const { container: pubContainer } = render(
        <PublicGateRequestForm buildingId="bld-pub-1" />
      );
      const pubControls = Array.from(
        pubContainer.querySelectorAll<HTMLElement>("input, textarea, select")
      );
      expect(pubControls.length).toBeGreaterThanOrEqual(2);
      for (const ctrl of pubControls) {
        expect(ctrl.id).toBeTruthy();
        expect(findLabelFor(pubContainer, ctrl.id)).not.toBeNull();
        expect(ctrl.className).toMatch(/text-\[16px\]|text-\[max\(16px,1rem\)\]/);
        expect(ctrl.className).toContain("min-h-[48px]");
      }

      const { container: brokerContainer } = render(
        <BrokerGateRequestForm buildingId="bld-brk-1" initialStatus="none" />
      );
      const brokerControls = Array.from(
        brokerContainer.querySelectorAll<HTMLElement>("input, textarea, select")
      );
      expect(brokerControls.length).toBeGreaterThanOrEqual(4);
      for (const ctrl of brokerControls) {
        expect(ctrl.id).toBeTruthy();
        expect(findLabelFor(brokerContainer, ctrl.id)).not.toBeNull();
        expect(ctrl.className).toMatch(/text-\[16px\]|text-\[max\(16px,1rem\)\]/);
        expect(ctrl.className).toContain("min-h-[48px]");
      }
    });

    it("IMInquiryBottomSheet renders shared Modal with role=dialog, aria-modal, explicit <label htmlFor>, 16px inputs, and closes on Escape", () => {
      const onClose = vi.fn();
      render(
        <IMInquiryBottomSheet
          buildingId="bld-im-1"
          brokerUserId="brk-1"
          brokerName="박중개"
          blindName="역삼동 코너 빌딩"
          onClose={onClose}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();

      const sheet = screen.getByTestId("im-inquiry-bottom-sheet");
      const textControls = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'input:not([type="checkbox"]), textarea, select'
        )
      );
      expect(textControls.length).toBe(4);
      for (const ctrl of textControls) {
        expect(ctrl.id).toBeTruthy();
        expect(findLabelFor(sheet, ctrl.id)).not.toBeNull();
        expect(ctrl.className).toMatch(/text-\[16px\]|text-\[max\(16px,1rem\)\]/);
        expect(ctrl.className).toContain("min-h-[48px]");
      }

      const checkbox = sheet.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      expect(checkbox!.id).toBeTruthy();
      expect(findLabelFor(sheet, checkbox!.id)).not.toBeNull();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("MemoImportModal, ConfirmDeleteModal, and DealInquirySheet expose role=dialog + aria-modal + Escape close", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 })
        )
      );

      const onCloseMemo = vi.fn();
      const { unmount: unmountMemo } = render(
        <MemoImportModal
          isOpen={true}
          onClose={onCloseMemo}
          onSelectMemo={vi.fn()}
        />
      );
      expect(screen.getByTestId("memo-import-modal")).toBeTruthy();
      expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onCloseMemo).toHaveBeenCalledTimes(1);
      unmountMemo();

      const onCancelDelete = vi.fn();
      const { unmount: unmountDelete } = render(
        <ConfirmDeleteModal
          isOpen={true}
          title="항목 삭제"
          onCancel={onCancelDelete}
          onConfirm={vi.fn()}
        />
      );
      expect(screen.getByTestId("confirm-delete-modal").getAttribute("role")).toBe("dialog");
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onCancelDelete).toHaveBeenCalledTimes(1);
      unmountDelete();

      render(
        <div>
          <button
            type="button"
            data-deal-inquiry="1"
            data-deal-id="11111111-2222-3333-4444-555555555555"
            data-deal-asset="근생빌딩"
            data-deal-address="강남구 역삼동"
            data-deal-price="85억"
          >
            매물 문의 열기
          </button>
          <DealInquirySheet
            brokerName="박중개"
            brokerPhone="010-1234-5678"
            brokerSlug="park-cre"
          />
        </div>
      );

      fireEvent.click(screen.getByText("매물 문의 열기"));
      expect(screen.getByTestId("deal-inquiry-sheet")).toBeTruthy();
      expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("deal-inquiry-sheet")).toBeNull();
    });
  });

  describe("3. Zero Native Browser alert / confirm / prompt Calls", () => {
    const ASSIGNED_BROKER_FILES = [
      "src/components/broker/flat-profile-card.tsx",
      "src/components/broker/rent-roll-importer.tsx",
      "src/components/magazine-editor/EditorCoverTab.tsx",
      "src/components/pipeline/pipeline-status-bar.tsx",
      "src/app/(broker)/broker/clients/[id]/page.tsx",
      "src/app/(broker)/broker/golden-admin/page.tsx",
      "src/app/(broker)/broker/lease-card/[id]/page.tsx",
      "src/app/(broker)/broker/memos/page.tsx",
      "src/app/(broker)/broker/tenant-intents/[id]/page.tsx",
    ];

    it.each(ASSIGNED_BROKER_FILES)(
      "%s has zero native alert/confirm/prompt calls",
      (relPath) => {
        const absPath = path.resolve(process.cwd(), relPath);
        const raw = fs.readFileSync(absPath, "utf8");
        const stripped = raw
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
        const matches = stripped.match(/\b(window\.)?(alert|confirm|prompt)\s*\(/g) ?? [];
        expect(matches, `${relPath} contains native dialog call(s): ${matches.join(", ")}`).toEqual([]);
      }
    );
  });

  describe("4. BrokerHome4Doors Full-Card Click & >=44px Senior Touch Targets", () => {
    it("makes all 4 door cards clickable across their entire surface with >=44px touch targets and preserves BrokerSeniorLayout active pill contract", () => {
      const { container } = render(<BrokerHome4Doors data={SAMPLE_HOME_DATA} />);

      for (const id of ["dealcards", "im", "magazine", "inbox"] as const) {
        const card = screen.getByTestId(`home-door-card-${id}`);
        expect(card.className).toContain("min-h-[196px]");

        const mainLink = screen.getByTestId(`home-task-${id}`);
        expect(mainLink.className).toContain("min-h-[44px]");
        expect(mainLink.className).toContain("after:inset-0");

        const badgeLink = screen.getByTestId(`home-door-badge-${id}`);
        expect(badgeLink.className).toContain("min-h-[44px]");
      }

      // Clicking non-link card surface navigates to the door href
      fireEvent.click(screen.getByTestId("home-door-card-dealcards"));
      expect(mockPush).toHaveBeenCalledWith("/broker/w/dealcards");

      fireEvent.click(screen.getByTestId("home-door-card-inbox"));
      expect(mockPush).toHaveBeenCalledWith("/broker/w/inbox");

      // Every anchor/button inside BrokerHome4Doors has min-h >= 44px
      const interactive = Array.from(container.querySelectorAll<HTMLElement>("a, button"));
      for (const el of interactive) {
        if (el.getAttribute("data-testid")?.startsWith("workspace-font-scale-")) continue;
        expect(
          el.className,
          `Expected >=44px touch target on ${el.tagName} (${el.textContent})`
        ).toMatch(/min-h-\[(?:44|48|52|196)px\]|min-h-11|min-h-12/);
      }

      // Verify BrokerSeniorLayout preserves exact data-active-pill expression & >=44px pills
      const seniorLayoutSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/layout/BrokerSeniorLayout.tsx"),
        "utf8"
      );
      expect(seniorLayoutSrc).toContain(
        'data-active-pill={pathname.startsWith("/broker/profile") ? "true" : undefined}'
      );
      expect(seniorLayoutSrc).not.toMatch(/min-h-\[(?:38|40|42)px\]/);
    });
  });
});
