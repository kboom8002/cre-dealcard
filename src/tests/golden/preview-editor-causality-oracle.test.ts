// @vitest-environment jsdom
/**
 * @file src/tests/golden/preview-editor-causality-oracle.test.ts
 * @description G-UX-03 Ring 1 Golden Oracle ($0, Vitest):
 *   1. JSDOM runtime contract tests for `validateEditorUnitTargets` (positive, missing, hidden, activeTab).
 *   2. Source-level + JSDOM selector-parity verification across all 4 workspaces:
 *      - DealCards (`DEALCARD_PREVIEW_UNITS` <-> `KakaoBubblePreview` <-> `PairedMemoTopCard` / `Card4ConfirmCard`)
 *      - IM (`buildImSyncUnits` <-> `ImPreviewPane` / `ImSlideVisualCard` <-> `ImEditorPanels` / `RentRollGrid` / `MobileRentRollCards`)
 *      - MagazineEditor (`buildNewsletterEditorSyncUnits` <-> `NewsletterPreviewCard` / `NewsletterPreviewSlot` <-> step panels)
 *      - Inbox (`inboxPreviewUnits` <-> `InboxPreviewColumn` <-> `InboxEditorColumn` / `InboxDispatchTimeline`)
 *   3. React `@testing-library/react` interactive harness for `<PreviewEditableUnit>` + `useEditorPreviewSync` focus transfer.
 *   4. `<PreviewCausalityBar>` `published_dirty` vs `published_clean` warning & 1-click re-publish callback verification.
 */

import React, { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  useEditorPreviewSync,
  validateEditorUnitTargets,
  type EditorUnitTarget,
} from "@/components/workspace/preview-sync/useEditorPreviewSync";
import { PreviewEditableUnit } from "@/components/workspace/preview-sync/PreviewEditableUnit";
import { PreviewCausalityBar } from "@/components/workspace/preview-sync/PreviewCausalityBar";
import { DEALCARD_PREVIEW_UNITS } from "@/app/(broker)/broker/w/dealcards/_components/dealcards-types";
import {
  buildBasicImSlides,
  buildImSyncUnits,
  DEFAULT_IM_AXIOS_HIGHLIGHTS,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { buildNewsletterEditorSyncUnits } from "@/app/(broker)/broker/magazine-editor/_lib/edition-helpers";

const ROOT = process.cwd();

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

/**
 * Checks whether a single CSS selector (or comma-separated fallback list) has a matching
 * DOM hook (`id="..."` or `data-testid="..."` or `[data-rr-cell="..."]`) in the combined
 * editor source files.
 */
function hasDynamicTemplateHook(token: string, combinedEditorSource: string): boolean {
  const m = token.match(/^(.+?-)(?:\d+|deal-\d+|income)$/);
  if (!m) return false;
  return combinedEditorSource.includes(`\`${m[1]}\${`);
}

function selectorExistsInSources(selector: string, combinedEditorSource: string): boolean {
  const parts = selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;

  return parts.every((part) => {
    const idMatch = part.match(/^#([A-Za-z0-9_-]+)$/);
    if (idMatch) {
      const id = idMatch[1];
      return (
        combinedEditorSource.includes(`id="${id}"`) ||
        combinedEditorSource.includes(`id='${id}'`) ||
        hasDynamicTemplateHook(id, combinedEditorSource)
      );
    }

    const testIdMatch = part.match(/^\[data-testid="([^"]+)"\]$/);
    if (testIdMatch) {
      const tid = testIdMatch[1];
      return (
        combinedEditorSource.includes(`data-testid="${tid}"`) ||
        combinedEditorSource.includes(`data-testid='${tid}'`) ||
        hasDynamicTemplateHook(tid, combinedEditorSource)
      );
    }

    const rrCellMatch = part.match(/^input\[data-rr-cell="0:([^"]+)"\]$/);
    if (rrCellMatch) {
      const col = rrCellMatch[1];
      return combinedEditorSource.includes(`data-rr-cell={\`\${idx}:${col}\`}`);
    }

    return combinedEditorSource.includes(part);
  });
}

function extractStaticUnitIds(source: string): string[] {
  const found = new Set<string>();
  const unitIdPropRe = /unitId=["']([a-z0-9-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = unitIdPropRe.exec(source)) !== null) {
    found.add(m[1]);
  }
  const wrapUnitRe = /wrapUnit\(\s*['"]([a-z0-9-]+)['"]/g;
  while ((m = wrapUnitRe.exec(source)) !== null) {
    found.add(m[1]);
  }
  const onFocusUnitRe = /onFocusEditorUnit\(["']([a-z0-9-]+)["']\)/g;
  while ((m = onFocusUnitRe.exec(source)) !== null) {
    found.add(m[1]);
  }
  return Array.from(found);
}

describe("G-UX-03: Preview <-> Editor Bidirectional Causality Oracle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── 1. JSDOM runtime tests on validateEditorUnitTargets ──
  describe("validateEditorUnitTargets JSDOM runtime contract", () => {
    it("returns ok: true when all editorSelector and focusSelector targets are present and visible", () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <section data-testid="ed-sec-1">
          <input id="ed-input-1" type="text" />
        </section>
        <section data-testid="ed-sec-2">
          <textarea id="ed-input-2"></textarea>
        </section>
      `;

      const units: Record<string, EditorUnitTarget<"tab1" | "tab2">> = {
        u1: {
          unitId: "u1",
          label: "섹션 1",
          tab: "tab1",
          editorSelector: '[data-testid="ed-sec-1"]',
          focusSelector: "#ed-input-1",
        },
        u2: {
          unitId: "u2",
          label: "섹션 2",
          tab: "tab2",
          editorSelector: '[data-testid="ed-sec-2"]',
          focusSelector: "#ed-input-2",
        },
      };

      const res = validateEditorUnitTargets(units, { root });
      expect(res.ok).toBe(true);
      expect(res.checkedCount).toBe(2);
      expect(res.missingEditorSelectors).toEqual([]);
      expect(res.missingFocusSelectors).toEqual([]);
      expect(res.hiddenSelectors).toEqual([]);
    });

    it("returns ok: false with missingEditorSelectors and missingFocusSelectors for broken selectors", () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <section data-testid="ed-sec-present">
          <!-- missing #ed-missing-input -->
        </section>
      `;

      const units: Record<string, EditorUnitTarget> = {
        brokenEditor: {
          unitId: "brokenEditor",
          label: "누락 컨테이너",
          editorSelector: '[data-testid="ed-sec-nonexistent"]',
          focusSelector: "#ed-input-missing-too",
        },
        brokenFocus: {
          unitId: "brokenFocus",
          label: "누락 입력칸",
          editorSelector: '[data-testid="ed-sec-present"]',
          focusSelector: "#ed-missing-input",
        },
      };

      const res = validateEditorUnitTargets(units, { root });
      expect(res.ok).toBe(false);
      expect(res.checkedCount).toBe(2);
      expect(res.missingEditorSelectors).toContain('[data-testid="ed-sec-nonexistent"]');
      expect(res.missingFocusSelectors).toContain("#ed-input-missing-too");
      expect(res.missingFocusSelectors).toContain("#ed-missing-input");
    });

    it("detects .hidden and [aria-hidden='true'] ancestors and respects activeTab filtering", () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="hidden" data-testid="tab1-panel">
          <section data-testid="hidden-sec">
            <input id="hidden-input" type="text" />
          </section>
        </div>
        <div aria-hidden="true" data-testid="tab2-panel">
          <section data-testid="aria-hidden-sec">
            <input id="aria-hidden-input" type="text" />
          </section>
        </div>
        <div data-testid="tab3-panel">
          <section data-testid="visible-sec">
            <input id="visible-input" type="text" />
          </section>
        </div>
      `;

      const units: Record<string, EditorUnitTarget<"t1" | "t2" | "t3">> = {
        uHidden: {
          unitId: "uHidden",
          label: "숨김 탭1",
          tab: "t1",
          editorSelector: '[data-testid="hidden-sec"]',
          focusSelector: "#hidden-input",
        },
        uAriaHidden: {
          unitId: "uAriaHidden",
          label: "비노출 탭2",
          tab: "t2",
          editorSelector: '[data-testid="aria-hidden-sec"]',
          focusSelector: "#aria-hidden-input",
        },
        uVisible: {
          unitId: "uVisible",
          label: "활성 탭3",
          tab: "t3",
          editorSelector: '[data-testid="visible-sec"]',
          focusSelector: "#visible-input",
        },
      };

      const allRes = validateEditorUnitTargets(units, { root });
      expect(allRes.ok).toBe(false);
      expect(allRes.checkedCount).toBe(3);
      expect(allRes.hiddenSelectors).toEqual(
        expect.arrayContaining([
          '[data-testid="hidden-sec"]',
          "#hidden-input",
          '[data-testid="aria-hidden-sec"]',
          "#aria-hidden-input",
        ])
      );

      // Filtering to activeTab="t3" ignores inactive t1/t2 hidden containers
      const activeOnlyRes = validateEditorUnitTargets(units, { root, activeTab: "t3" });
      expect(activeOnlyRes.ok).toBe(true);
      expect(activeOnlyRes.checkedCount).toBe(1);
      expect(activeOnlyRes.hiddenSelectors).toEqual([]);
    });
  });

  // ── 2. Cross-workspace unitId & selector contract parity across all 4 workspaces ──
  describe("4-Workspace Preview unitId & Editor Selector Parity", () => {
    it("DealCards: every PreviewEditableUnit unitId is wired and every DEALCARD_PREVIEW_UNITS selector exists in editor sources", () => {
      const previewSrc = readSrc("src/components/broker/deal-card/KakaoBubblePreview.tsx");
      const pageSrc = readSrc("src/app/(broker)/broker/w/dealcards/page.tsx");
      const editorSrc = [
        readSrc("src/components/broker/deal-card/PairedMemoTopCard.tsx"),
        readSrc("src/components/broker/deal-card/Card4ConfirmCard.tsx"),
      ].join("\n");

      const previewUnitIds = extractStaticUnitIds(previewSrc);
      expect(previewUnitIds).toEqual(
        expect.arrayContaining([
          "dc-unit-region",
          "dc-unit-use",
          "dc-unit-area",
          "dc-unit-price",
          "dc-unit-headline",
          "dc-unit-broker",
        ])
      );
      expect(previewSrc).toContain("dc-unit-point-${idx}");
      for (const idx of [0, 1, 2]) {
        expect(DEALCARD_PREVIEW_UNITS[`dc-unit-point-${idx}`]).toBeDefined();
      }

      for (const unitId of previewUnitIds) {
        if (unitId === "dc-unit-broker") {
          // Special-cased profile navigation in dealcards/page.tsx
          expect(pageSrc).toContain('unitId === "dc-unit-broker"');
        } else {
          expect(DEALCARD_PREVIEW_UNITS[unitId]).toBeDefined();
        }
      }

      for (const target of Object.values(DEALCARD_PREVIEW_UNITS)) {
        expect(
          selectorExistsInSources(target.editorSelector, editorSrc),
          `DealCards editorSelector missing in source: ${target.editorSelector}`
        ).toBe(true);
        if (target.focusSelector) {
          expect(
            selectorExistsInSources(target.focusSelector, editorSrc),
            `DealCards focusSelector missing in source: ${target.focusSelector}`
          ).toBe(true);
        }
      }
    });

    it("IM: every ImPreviewPane & ImSlideVisualCard unitId exists in buildImSyncUnits and every selector exists in IM editor sources", () => {
      const imSyncUnits = buildImSyncUnits({
        askingPriceManwon: 950_000,
        onOpenBrokerSection: () => {},
        onOpenCompsSection: () => {},
      });
      const imSyncUnitsZeroPrice = buildImSyncUnits({
        askingPriceManwon: 0,
        onOpenBrokerSection: () => {},
        onOpenCompsSection: () => {},
      });

      const imPreviewSrc = readSrc("src/app/(broker)/broker/w/im/_components/ImPreviewPane.tsx");
      const imSlideSrc = readSrc("src/app/(broker)/broker/w/im/_components/ImSlideVisualCard.tsx");
      const imEditorSrc = [
        readSrc("src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx"),
        readSrc("src/components/workspace/RentRollGrid.tsx"),
        readSrc("src/components/workspace/MobileRentRollCards.tsx"),
      ].join("\n");

      // Static unitIds in ImPreviewPane (including ImDeckReadinessBar jump unitIds)
      const previewUnitIds = extractStaticUnitIds(imPreviewSrc);
      for (const unitId of previewUnitIds) {
        expect(imSyncUnits[unitId], `IM preview unitId "${unitId}" missing in buildImSyncUnits`).toBeDefined();
      }
      for (const idx of [0, 1, 2]) {
        expect(imSyncUnits[`im-unit-highlight-${idx}`]).toBeDefined();
      }

      // Slide map in ImSlideVisualCard.tsx
      const slideMapMatches = Array.from(imSlideSrc.matchAll(/"\d{2}":\s*"(im-unit-[a-z0-9-]+)"/g));
      expect(slideMapMatches.length).toBe(10);
      for (const m of slideMapMatches) {
        expect(imSyncUnits[m[1]], `ImSlideVisualCard unitId "${m[1]}" missing in buildImSyncUnits`).toBeDefined();
      }

      // Dynamic slide builder output (including conditional 06-2 & 08 slides)
      const slides = buildBasicImSlides({
        cleanCoverTitle: "역삼동 테스트 빌딩",
        address: "서울특별시 강남구 역삼동 1-1",
        askingPriceManwon: 950_000,
        postureKoreanLabel: "임대수익용",
        axiosHighlights: DEFAULT_IM_AXIOS_HIGHLIGHTS,
        calculatedYield: 4.5,
        expectedYieldPct: 5.1,
        expectedRentRollLength: 3,
        compCount: 2,
        gfaSqm: "1400",
        completionDate: "2020-01-01",
        rentRollLength: 3,
        landAreaSqm: "400",
        zoning: "일반상업지역",
        totalDepositManwon: 50000,
        totalRentManwon: 3500,
        photoEntries: [],
        handoverNote: "협의 가능",
        brokerageName: "테스트중개법인",
        brokerName: "김테스트",
        brokerPhone: "010-1234-5678",
      });
      for (const slide of slides) {
        expect(slide.unitId).toBeTruthy();
        expect(imSyncUnits[slide.unitId!]).toBeDefined();
      }

      for (const target of [...Object.values(imSyncUnits), ...Object.values(imSyncUnitsZeroPrice)]) {
        expect(
          selectorExistsInSources(target.editorSelector, imEditorSrc),
          `IM editorSelector missing in source: ${target.editorSelector}`
        ).toBe(true);
        if (target.focusSelector) {
          expect(
            selectorExistsInSources(target.focusSelector, imEditorSrc),
            `IM focusSelector missing in source: ${target.focusSelector}`
          ).toBe(true);
        }
      }
    });

    it("MagazineEditor: every NewsletterPreviewCard & Slot unitId exists in buildNewsletterEditorSyncUnits and selectors exist in step panels", () => {
      const sampleDeals = [
        {
          id: "deal-1",
          title: "서초동 꼬마빌딩",
          address: "서울특별시 서초구 서초동 100-1",
          price: "90~100억",
          yield: "4.3%",
          photoUrl: null,
        },
      ];
      const nlSyncUnits = buildNewsletterEditorSyncUnits({
        deals: sampleDeals,
        selectedDealIds: ["deal-1"],
        isSectionEnabled: () => true,
        onEnableSection: () => {},
        onOpenStatTune: () => {},
        onShowBrokerProfileNotice: () => {},
      });
      const nlSyncUnitsUnselected = buildNewsletterEditorSyncUnits({
        deals: sampleDeals,
        selectedDealIds: [],
        isSectionEnabled: () => true,
        onEnableSection: () => {},
        onOpenStatTune: () => {},
        onShowBrokerProfileNotice: () => {},
      });

      const nlPreviewSrc = [
        readSrc("src/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewCard.tsx"),
        readSrc("src/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewSlot.tsx"),
      ].join("\n");

      const nlEditorSrc = [
        readSrc("src/components/broker/studio/MagazineQuickDraftCard.tsx"),
        readSrc("src/components/magazine-editor/IssueMetadataForm.tsx"),
        readSrc("src/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel.tsx"),
        readSrc("src/components/magazine-editor/AxiosIssuesEditorPanel.tsx"),
        readSrc("src/components/magazine-editor/DealSlotAssigner.tsx"),
        readSrc("src/components/broker/studio/SendListSummaryBar.tsx"),
        readSrc("src/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewSlot.tsx"),
      ].join("\n");

      const previewUnitIds = extractStaticUnitIds(nlPreviewSrc);
      for (const unitId of previewUnitIds) {
        expect(nlSyncUnits[unitId], `MagazineEditor preview unitId "${unitId}" missing`).toBeDefined();
      }
      // Template-interpolated units in NewsletterPreviewCard.tsx
      for (const idx of [0, 1]) {
        expect(nlSyncUnits[`nl-unit-stats-${idx}`]).toBeDefined();
      }
      for (const idx of [0, 1, 2, 3, 4]) {
        expect(nlSyncUnits[`nl-unit-issue-${idx}`]).toBeDefined();
      }
      expect(nlSyncUnits["nl-unit-deal-deal-1"]).toBeDefined();

      for (const target of [
        ...Object.values(nlSyncUnits),
        ...Object.values(nlSyncUnitsUnselected),
      ]) {
        expect(
          selectorExistsInSources(target.editorSelector, nlEditorSrc),
          `MagazineEditor editorSelector missing: ${target.editorSelector}`
        ).toBe(true);
        if (target.focusSelector) {
          expect(
            selectorExistsInSources(target.focusSelector, nlEditorSrc),
            `MagazineEditor focusSelector missing: ${target.focusSelector}`
          ).toBe(true);
        }
      }
    });

    it("Inbox: every InboxPreviewColumn unitId exists in inboxPreviewUnits and selectors exist in InboxEditorColumn/DispatchTimeline", () => {
      const inboxPageSrc = readSrc("src/app/(broker)/broker/w/inbox/page.tsx");
      const inboxPreviewSrc = readSrc("src/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn.tsx");
      const inboxEditorSrc = [
        readSrc("src/app/(broker)/broker/w/inbox/_components/InboxEditorColumn.tsx"),
        readSrc("src/app/(broker)/broker/w/inbox/_components/InboxDispatchTimeline.tsx"),
      ].join("\n");

      // Parse inboxPreviewUnits block from inbox/page.tsx
      const startIdx = inboxPageSrc.indexOf("const inboxPreviewUnits = useMemo");
      const endIdx = inboxPageSrc.indexOf("const {\n    activeUnitId: activeInboxUnitId");
      expect(startIdx).toBeGreaterThan(-1);
      expect(endIdx).toBeGreaterThan(startIdx);
      const unitsBlock = inboxPageSrc.slice(startIdx, endIdx);

      const definedUnitIds = Array.from(
        unitsBlock.matchAll(/"(ib-unit-[a-z0-9-]+)":\s*\{/g)
      ).map((m) => m[1]);
      expect(definedUnitIds).toEqual([
        "ib-unit-client",
        "ib-unit-todo",
        "ib-unit-message",
        "ib-unit-history",
      ]);

      const previewUnitIds = extractStaticUnitIds(inboxPreviewSrc);
      expect(previewUnitIds.length).toBe(4);
      for (const unitId of previewUnitIds) {
        expect(definedUnitIds).toContain(unitId);
      }

      const editorSelectors = Array.from(
        unitsBlock.matchAll(/editorSelector:\s*'([^']+)'/g)
      ).map((m) => m[1]);
      const focusSelectors = Array.from(
        unitsBlock.matchAll(/focusSelector:\s*['"]([^'"]+)['"]/g)
      ).map((m) => m[1]);

      expect(editorSelectors.length).toBeGreaterThanOrEqual(4);
      expect(focusSelectors.length).toBeGreaterThanOrEqual(4);

      for (const sel of [...editorSelectors, ...focusSelectors]) {
        expect(
          selectorExistsInSources(sel, inboxEditorSrc),
          `Inbox selector missing in editor/timeline sources: ${sel}`
        ).toBe(true);
      }
    });
  });

  // ── 3. @testing-library/react JSDOM Harness for PreviewEditableUnit + useEditorPreviewSync ──
  describe("PreviewEditableUnit + useEditorPreviewSync interactive focus transfer", () => {
    function SyncTestHarness() {
      const [tab, setTab] = useState<"t1" | "t2">("t1");
      const units: Record<string, EditorUnitTarget<"t1" | "t2">> = {
        "unit-headline": {
          unitId: "unit-headline",
          label: "표지 제목",
          tab: "t2",
          editorSelector: '[data-testid="harness-editor-card"]',
          focusSelector: "#harness-target-input",
        },
      };

      const { activeUnitId, focusEditorUnit } = useEditorPreviewSync({
        units,
        onSelectTab: (nextTab) => setTab(nextTab),
      });

      return React.createElement(
        "div",
        null,
        React.createElement("span", { "data-testid": "active-tab-label" }, tab),
        React.createElement(PreviewEditableUnit, {
          unitId: "unit-headline",
          label: "표지 제목",
          testId: "harness-preview-unit",
          isActive: activeUnitId === "unit-headline",
          onActivate: focusEditorUnit,
          children: [
            React.createElement("p", { key: "p" }, "미리보기 제목"),
            React.createElement(
              "a",
              { key: "a", href: "#nested-link", "data-testid": "nested-link" },
              "외부 링크"
            ),
          ],
        }),
        React.createElement(
          "div",
          {
            "data-testid": "harness-editor-card",
            className: tab === "t2" ? "block" : "hidden",
          },
          React.createElement("input", {
            id: "harness-target-input",
            "data-testid": "harness-target-input",
            type: "text",
            defaultValue: "초기값",
          })
        )
      );
    }

    it("clicking PreviewEditableUnit switches tab and moves document.activeElement onto the target input", async () => {
      render(React.createElement(SyncTestHarness));

      const previewUnit = screen.getByTestId("harness-preview-unit");
      const targetInput = screen.getByTestId("harness-target-input");
      expect(document.activeElement).not.toBe(targetInput);
      expect(previewUnit.getAttribute("data-preview-active")).toBe("false");

      fireEvent.click(previewUnit);

      expect(screen.getByTestId("active-tab-label").textContent).toBe("t2");
      expect(previewUnit.getAttribute("data-preview-active")).toBe("true");
      expect(document.activeElement).toBe(targetInput);
    });

    it("pressing Enter on PreviewEditableUnit moves focus onto the target input, while nested <a> click does not hijack", () => {
      render(React.createElement(SyncTestHarness));

      const previewUnit = screen.getByTestId("harness-preview-unit");
      const nestedLink = screen.getByTestId("nested-link");
      const targetInput = screen.getByTestId("harness-target-input");

      // Nested link click should not activate the unit
      fireEvent.click(nestedLink);
      expect(previewUnit.getAttribute("data-preview-active")).toBe("false");
      expect(document.activeElement).not.toBe(targetInput);

      // Keyboard Enter on PreviewEditableUnit should activate & focus target input
      fireEvent.keyDown(previewUnit, { key: "Enter" });
      expect(previewUnit.getAttribute("data-preview-active")).toBe("true");
      expect(document.activeElement).toBe(targetInput);
    });
  });

  // ── 4. PreviewCausalityBar published_dirty vs published_clean ──
  describe("PreviewCausalityBar lifecycle warning & 1-click re-publish", () => {
    it("renders dirty warning and fires onResyncPublished in published_dirty state", () => {
      const onResync = vi.fn();
      render(
        React.createElement(PreviewCausalityBar, {
          lifecycle: "published_dirty",
          onResyncPublished: onResync,
          resyncButtonLabel: "수정한 내용 고객 화면에 반영하기",
        })
      );

      const bar = screen.getByTestId("preview-causality-bar");
      expect(bar.getAttribute("data-lifecycle")).toBe("published_dirty");
      expect(bar.textContent).toContain("고친 내용이 아직 고객 화면에는 반영 전입니다");

      const resyncBtn = screen.getByTestId("preview-causality-resync-btn");
      expect(resyncBtn.textContent).toBe("수정한 내용 고객 화면에 반영하기");
      fireEvent.click(resyncBtn);
      expect(onResync).toHaveBeenCalledTimes(1);
    });

    it("renders clean parity status with liveUrl link and omits resync button in published_clean state", () => {
      const onResync = vi.fn();
      render(
        React.createElement(PreviewCausalityBar, {
          lifecycle: "published_clean",
          onResyncPublished: onResync,
          liveUrl: "/dc/bld-clean-1",
          liveLinkTestId: "dealcard-live-link",
        })
      );

      const bar = screen.getByTestId("preview-causality-bar");
      expect(bar.getAttribute("data-lifecycle")).toBe("published_clean");
      expect(bar.textContent).toContain("고객 화면과 일치");
      expect(screen.queryByTestId("preview-causality-resync-btn")).toBeNull();

      const liveLink = screen.getByTestId("dealcard-live-link");
      expect(liveLink.getAttribute("href")).toBe("/dc/bld-clean-1");
    });
  });
});
