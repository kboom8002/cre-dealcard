// @vitest-environment jsdom
/**
 * @file src/tests/qa/tester-261124-v3-review-remediation.test.tsx
 * @description Master Regression Suite for 2026-11-24 이상덕 V3 Hold-out Review (20 Items)
 *   + SOTA Hybrid Col-1 Slim Ghost Icon Buttons & Col-2 Header Context Actions:
 *   - Wave 1: A-01..A-03 (DealCards ?new=1, refill specs override, newest-first), B-01 (양평동4가/당산동5가),
 *             D-01 (buyer PPTX/Studio removal on /im-lite), D-03 (차상혁 representative vs 진심 파트너 이상덕 assignee)
 *   - Wave 2: 1-floor SimpleListRow + RowIconActionButton + WorkspaceShell editorHeaderActions
 *   - Track 3A: C-01..C-05 (IM Studio manwon display, live RentRoll preview yield, segmented tabs, empty expected notice, axios empty banner)
 *   - Track 3B: E-01..E-05 (Newsletter 4-tab step bar, ?step=history, focus placeholder CSS, 44px [×] clear buttons, copyTextFromPromise, w-full DealCard)
 *   - Track 3C: F-01..F-03 (Inbox clientCompany badges + approval busy/toast, QA guide/workbench blue button parity)
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("@/platform/im-pipeline/realtime/use-dealcard-realtime-sync", () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

vi.mock("@/hooks/use-magazine-analytics", () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));

vi.mock("@/components/magazine/LazyIslands", async () => {
  const roi = await import("@/components/magazine/RoiIsland");
  const fwd = await import("@/components/magazine/ForwardSection");
  return {
    LazyRoiCalculator: roi.default,
    LazyForwardSection: fwd.ForwardSection,
  };
});

import { bandLocation } from "@/domain/building/dealcard-publication/banding-engine";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";
import {
  ImEditorPanels,
  type ImEditorPanelsProps,
} from "@/app/(broker)/broker/w/im/_components/ImEditorPanels";
import { BLANK_IM_HIGHLIGHTS } from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { buildBasicImDocument } from "@/domain/building/im-core/basic-im-document";
import { extractPureBuildingFacts } from "@/domain/building/im-core/facts";
import { MobileIMViewer } from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";
import {
  resolveMagazineQueryAction,
  type NewsletterStepKey,
} from "@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types";
import { copyTextFromPromise } from "@/lib/ux/clipboard";
import { IssueMetadataForm } from "@/components/magazine-editor/IssueMetadataForm";
import { MagazineQuickDraftCard } from "@/components/broker/studio/MagazineQuickDraftCard";
import { NewsletterContentStepPanel } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { InboxEditorColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxEditorColumn";
import type { InboxThreadItem } from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { FULL_LOOP_V3_CASES } from "@/lib/testguide/full-loop-v3-holdout-data";
import {
  DateGroupedList,
  EditorHeaderActionButton,
  RowIconActionButton,
  SimpleListRow,
} from "@/components/workspace/list/WorkspaceList";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, nextValue);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function makeBaseImEditorProps(
  overrides: Partial<ImEditorPanelsProps> = {},
): ImEditorPanelsProps {
  const postitStyles = {
    amber: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "01" },
    sky: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "02" },
    mint: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "03" },
  };
  return {
    currentItem: undefined,
    selectedId: "im-v3-test",
    activeEditorTab: "specs",
    onChangeEditorTab: vi.fn(),
    selectedItemActionsNode: null,
    isProvisioningSheet: false,
    onOpenBottomSheet: vi.fn(),
    isDownloadingPptx: false,
    actionAlert: null,
    actionAlertCode: null,
    onClearActionAlert: vi.fn(),
    onNotifyEditorFocus: vi.fn(),
    onCreateNew: vi.fn(),
    normalizedPosture: "core_income",
    onChangePosture: vi.fn(),
    imTitle: "양평동4가 프라임 빌딩",
    onChangeTitle: vi.fn(),
    address: "서울특별시 영등포구 양평동4가 37-1",
    onChangeAddress: vi.fn(),
    isLookingUpAddress: false,
    onLookupAddress: vi.fn(),
    askingPriceManwon: 2_500_000,
    priceBandStr: "240~260억",
    formattedWonDisplay: "25,000,000,000",
    onWonFocus: vi.fn(),
    onWonBlur: vi.fn(),
    onWonPriceChange: vi.fn(),
    isPriceCalcOpen: false,
    onTogglePriceCalc: vi.fn(),
    onSetDirectAskingPriceManwon: vi.fn(),
    priceEokPart: 250,
    priceManwonRemainder: 0,
    onSplitPriceChange: vi.fn(),
    gfaSqm: "2490.88",
    onChangeGfaSqm: vi.fn(),
    landAreaSqm: "518.7",
    onChangeLandAreaSqm: vi.fn(),
    onSwapGfaAndLand: vi.fn(),
    zoning: "준공업지역",
    onChangeZoning: vi.fn(),
    completionDate: "2019-06-15",
    onChangeCompletionDate: vi.fn(),
    rentRoll: [],
    onChangeRentRoll: vi.fn(),
    expectedRentRoll: [],
    onChangeExpectedRentRoll: vi.fn(),
    totalDepositManwon: 0,
    totalRentManwon: 0,
    calculatedYield: 0,
    isRentRollImportOpen: false,
    onToggleRentRollImport: vi.fn(),
    onExcelRentRollImport: vi.fn(),
    onExpectedExcelRentRollImport: vi.fn(),
    axiosHighlights: BLANK_IM_HIGHLIGHTS,
    onChangeAxiosHighlights: vi.fn(),
    postitStyles,
    isAiPointsBusy: false,
    onReclusterImAxios: vi.fn(),
    isBrokerSectionOpen: false,
    onToggleBrokerSection: vi.fn(),
    onMarkBrokerSectionTouched: vi.fn(),
    handoverNote: "",
    onChangeHandoverNote: vi.fn(),
    brokerageName: "",
    onChangeBrokerageName: vi.fn(),
    brokerName: "",
    onChangeBrokerName: vi.fn(),
    brokerPhone: "",
    onChangeBrokerPhone: vi.fn(),
    photoEntries: [],
    photoNames: [],
    isDraggingPhotos: false,
    onSetDraggingPhotos: vi.fn(),
    isCompressingPhotos: false,
    onFilesSelected: vi.fn(),
    onRemovePhotoAtIndex: vi.fn(),
    isGenerating: false,
    generateButtonLabel: "IM 만들기",
    onQuickGenerate: vi.fn(),
    ...overrides,
  };
}

function makeViewerDoc(overrides: Record<string, unknown> = {}) {
  const facts = extractPureBuildingFacts({
    id: "bld-v3-01",
    building_name: "양평동4가 메디컬타워",
    address: "서울특별시 영등포구 양평동4가 37-1",
    posture: "core_income",
    asking_price_manwon: 2_500_000,
    gross_floor_area_sqm: 2490.88,
    land_area_sqm: 518.7,
    zoning: "준공업지역",
    building_coverage_ratio_pct: 58,
    floor_area_ratio_pct: 360,
    floors_above: 10,
    floors_below: 2,
    completion_date: "2019-06-15",
    parking_spaces: 18,
    elevators: 2,
    monthly_rent_total_manwon: 5150,
    deposit_total_manwon: 68000,
    occupancy_rate_pct: 92,
    rent_roll: [
      {
        floor: "1F",
        tenantName: "메디컬 약국",
        areaSqm: 220,
        depositKrw: 150000000,
        rentKrw: 9000000,
        status: "occupied",
      },
    ],
    brokerOffice: {
      name: "제이에스부동산중개(주)",
      representativeName: "차상혁",
      phone: "010-2933-5482",
      registrationNo: "11680-2024-00111",
      officeAddress: "서울특별시 강남구 테헤란로 120",
    },
  });
  return {
    buildingId: "bld-v3-01",
    basicImDocument: buildBasicImDocument(facts),
    broker: {
      userId: "broker-v3-01",
      displayName: "진심 파트너 이상덕",
      representativeName: "차상혁",
      company: "제이에스부동산중개(주)",
      phone: "010-2933-5482",
      registrationNo: "11680-2024-00111",
      officeAddress: "서울특별시 강남구 테헤란로 120",
      tagline: "",
      photoUrl: "/default-avatar.png",
      slug: "yaky99-ba89ab",
      vibeTemplateId: "default",
    },
    ...overrides,
  };
}

describe("2026-11-24 이상덕 V3 Hold-out Review 20 Items + Col-1 SOTA Remediation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    if (typeof window.IntersectionObserver === "undefined") {
      (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (typeof Element.prototype.scrollIntoView !== "function") {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("A-01 & A-03: DealCards supports ?new=1, overrides IM-locked specs on explicit memo refill, and prioritizes ISO dates", async () => {
    const dealcardsSrc = readWorkspaceFile("src/app/(broker)/broker/w/dealcards/page.tsx");
    expect(dealcardsSrc).toContain('searchParams.get("new") === "1"');
    expect(dealcardsSrc).toContain("initialFreshParamRef");
    expect(dealcardsSrc).toContain("EMPTY_CARD4");
    expect(dealcardsSrc).toContain("pickNewestDealCard");
    expect(dealcardsSrc).toContain("sortDealCardsNewestFirst");

    // DateGroupedList + SimpleListRow prefers updatedAtIso over stale "방금" label
    const olderIso = "2026-11-22T09:15:00+09:00";
    const newerIso = "2026-11-24T10:30:00+09:00";
    const items = [
      { id: "old", updatedAtIso: olderIso, title: "이전 매물" },
      { id: "new", updatedAtIso: newerIso, title: "최신 매물" },
    ];

    await act(async () => {
      root.render(
        <DateGroupedList
          items={items}
          getDate={(it) => it.updatedAtIso}
          getKey={(it) => it.id}
          now={new Date("2026-11-24T12:00:00+09:00")}
          renderRow={(it) => (
            <SimpleListRow
              key={it.id}
              testId={`dc-${it.id}`}
              title={it.title}
              date={it.updatedAtIso}
              now={new Date("2026-11-24T12:00:00+09:00")}
              selected={it.id === "new"}
              onSelect={vi.fn()}
            />
          )}
        />,
      );
    });

    const rowIds = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="dc-"]'))
      .map((r) => r.getAttribute("data-testid"))
      .filter((id): id is string => Boolean(id && !id.endsWith("-date")));
    expect(rowIds).toEqual(["dc-new", "dc-old"]);
    expect(container.textContent).not.toContain("방금");
    expect(container.textContent).toContain("26-11-24 10:30:00");
  });

  it("B-01: bandLocation preserves 양평동4가 / 당산동5가 / 성수동2가 / 종로3가 and strips trailing lot numbers", () => {
    const cases: Array<[string, string, string]> = [
      ["서울특별시 영등포구 양평동4가 37-1", "양평동4가", "37-1"],
      ["서울 영등포구 당산동5가 11-47", "당산동5가", "11-47"],
      ["서울특별시 성동구 성수동2가 280-1", "성수동2가", "280-1"],
      ["서울 종로구 종로3가 123", "종로3가", "123"],
    ];

    for (const [raw, expectedDongGa, forbiddenLot] of cases) {
      const banded = bandLocation(raw);
      expect(banded).toContain(expectedDongGa);
      expect(banded).not.toContain(forbiddenLot);
      expect(banded).not.toContain("동가");
    }

    const quickGenSrc = readWorkspaceFile("src/app/api/broker/im-lite/quick-generate/route.ts");
    expect(quickGenSrc).toContain("stripLotNumbersSafe");
    expect(quickGenSrc).toContain("hasUnmaskedLotNumber");
  });

  it("C-01..C-05: IM Studio RentRollImporter shows live preview yield + blue CTA & ImEditorPanels renders subtabs, non-blocking expected notice & empty AI banner", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          monthlyRent: 4800,
          totalDeposit: 80000,
          mgmtFeeTotal: 300,
          vacancyPct: 0,
          floorLeases: [
            {
              floor: "1F",
              unit_label: "101호",
              tenant_type: "카페",
              area_sqm: 165,
              exclusive_area_sqm: 132,
              deposit_manwon: 80000,
              rent_manwon: 4800,
              mgmt_fee_manwon: 300,
              lease_state: "임대중",
              is_vacant: false,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    await act(async () => {
      root.render(
        <RentRollImporter askingPriceManwon={1_200_000} onImport={vi.fn()} />,
      );
    });

    const textModeBtn = container.querySelector(
      '[data-testid="rentroll-mode-text"]',
    ) as HTMLButtonElement | null;
    expect(textModeBtn).not.toBeNull();
    await act(async () => {
      textModeBtn!.click();
    });

    const ta = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
    await act(async () => {
      setNativeInputValue(ta!, "1F 101호 카페 보증금 80000 월세 4800");
    });

    const parseBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("AI 분석"),
    );
    expect(parseBtn).toBeDefined();
    await act(async () => {
      parseBtn!.click();
    });

    const previewYield = container.querySelector('[data-testid="rentroll-preview-yield"]');
    expect(previewYield).not.toBeNull();
    // (4800 * 12) / (1200000 - 80000) * 100 = 5.14%
    expect(previewYield!.textContent).toContain("5.14%");

    const confirmBtn = container.querySelector(
      '[data-testid="rent-roll-import-confirm-btn"]',
    ) as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.className).toContain("bg-blue-600");

    // ImEditorPanels: segmented subtabs + expected empty step notice + axios empty AI banner
    await act(async () => {
      root.render(<ImEditorPanels {...makeBaseImEditorProps({ activeEditorTab: "rentroll" })} />);
    });
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    const expectedTab = container.querySelector(
      '[data-testid="im-rentroll-subtab-expected"]',
    ) as HTMLButtonElement | null;
    expect(expectedTab).not.toBeNull();
    await act(async () => {
      expectedTab!.click();
    });
    const nextToAxiosBtn = container.querySelector(
      '[data-testid="im-next-to-axios-btn"]',
    ) as HTMLButtonElement | null;
    expect(nextToAxiosBtn).not.toBeNull();
    await act(async () => {
      nextToAxiosBtn!.click();
    });

    await act(async () => {
      root.render(<ImEditorPanels {...makeBaseImEditorProps({ activeEditorTab: "axios_brief" })} />);
    });
    expect(container.querySelector('[data-testid="im-expected-empty-step-notice"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="im-axios-empty-ai-banner"]')).not.toBeNull();

    const dismissBtn = container.querySelector(
      '[data-testid="im-expected-empty-step-notice-dismiss"]',
    ) as HTMLButtonElement | null;
    expect(dismissBtn).not.toBeNull();
    await act(async () => {
      dismissBtn!.click();
    });
    expect(container.querySelector('[data-testid="im-expected-empty-step-notice"]')).toBeNull();
  });

  it("D-01 & D-03: /im-lite?token= hides buyer PPTX & Studio buttons while displaying distinct 차상혁 representative vs 진심 파트너 이상덕 assignee", async () => {
    const doc = makeViewerDoc();

    // Buyer tokenized view: PPTX & Studio hidden; statutory representative 차상혁 kept separate from assignee
    await act(async () => {
      root.render(
        <MobileIMViewer
          document={doc as any}
          buildingId="bld-v3-01"
          isBroker={true}
          shareToken="tok-v3-buyer"
        />,
      );
    });

    expect(container.querySelector('[data-testid="mobile-im-download-pptx-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="mobile-im-open-studio-btn"]')).toBeNull();
    expect(container.textContent).toContain("대표 차상혁");
    expect(container.textContent).toContain("진심 파트너 이상덕");
    expect(container.textContent).not.toContain("대표 진심 파트너 이상덕");

    // Broker preview without shareToken exposes top broker toolbar
    await act(async () => {
      root.render(
        <MobileIMViewer
          document={doc as any}
          buildingId="bld-v3-01"
          isBroker={true}
        />,
      );
    });
    expect(container.querySelector('[data-testid="mobile-im-download-pptx-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mobile-im-open-studio-btn"]')).not.toBeNull();

    const dcPageSrc = readWorkspaceFile("src/app/(public)/dc/[id]/page.tsx");
    expect(dcPageSrc).toContain("fetchPublicBrokerProfile");
  });

  it("E-01..E-05: Newsletter 4-tab ?step=history, focus placeholder CSS, 44px [x] clear buttons, copyTextFromPromise fallback & w-full MagazineView DealCard", async () => {
    // E-02: step=history & tab=history resolution
    const histStep: NewsletterStepKey = "history";
    expect(histStep).toBe("history");
    expect(resolveMagazineQueryAction(new URLSearchParams("step=history")).step).toBe("history");
    expect(resolveMagazineQueryAction(new URLSearchParams("tab=history")).step).toBe("history");

    // E-01: focus placeholder hide rule
    const cssSrc = readWorkspaceFile("src/app/globals.css");
    expect(cssSrc).toContain(".broker-paper-theme input:focus::placeholder");

    // E-01: 44px [x] clear buttons in IssueMetadataForm, MagazineQuickDraftCard, NewsletterContentStepPanel
    const onChangeHeadline = vi.fn();
    const onChangeRegionFocus = vi.fn();
    const onChangeBriefingBody = vi.fn();

    await act(async () => {
      root.render(
        <>
          <IssueMetadataForm headline="양평동4가 이번 주 리포트" onChangeHeadline={onChangeHeadline} />
          <MagazineQuickDraftCard
            monthLabel="2026년 11월"
            regionFocus="영등포구 양평동4가"
            onChangeRegionFocus={onChangeRegionFocus}
            currentDraft={{ headline: "", summary: "", briefingTitle: "", briefingBody: "" }}
            onApplyDraft={vi.fn()}
          />
          <NewsletterContentStepPanel
            cadence="weekly"
            yearMonthLabel="2026년 11월 4주"
            regionFocus=""
            headline="제목"
            sections={[{ id: "briefing", enabled: true }]}
            isSectionEnabled={() => true}
            onToggleSection={vi.fn()}
            monthlyRegion="ybd"
            monthlyPairId="molit_bok"
            monthlyCharts={[]}
            monthlyLiveDbAvailable={true}
            onChangeMonthlyRegion={vi.fn()}
            onChangeMonthlyPair={vi.fn()}
            onUpdateMonthlyChartField={vi.fn()}
            onResetMonthlyCharts={vi.fn()}
            briefingBody="현장 브리핑 본문"
            onChangeBriefingBody={onChangeBriefingBody}
            unitIssues={[]}
            onChangeUnitIssues={vi.fn()}
            newsPool={[]}
            preferredRegions={[]}
            preferredChannels={[]}
            deals={[]}
            selectedDeals={[]}
            selectedDealIds={[]}
            onToggleDeal={vi.fn()}
            dealComments={{}}
            onChangeDealComment={vi.fn()}
            isAiClustering={false}
            onAiClusterIssues={vi.fn()}
            onRefreshLiveChannel={vi.fn(async () => {})}
            canUndoRecluster={false}
            onUndoRecluster={vi.fn()}
            onOpenPreferences={vi.fn()}
            onNotifyEditorFocus={vi.fn()}
            onBackToTitle={vi.fn()}
            onNextToSend={vi.fn()}
          />
        </>,
      );
    });

    const clearIds = ["clear-headline-btn", "clear-region-focus-btn", "clear-briefing-btn"] as const;
    for (const id of clearIds) {
      const btn = container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.className).toContain("min-h-[44px]");
      expect(btn!.className).toContain("min-w-[44px]");
      await act(async () => {
        btn!.click();
      });
    }
    expect(onChangeHeadline).toHaveBeenCalledWith("");
    expect(onChangeRegionFocus).toHaveBeenCalledWith("");
    expect(onChangeBriefingBody).toHaveBeenCalledWith("");

    // E-03: copyTextFromPromise fallback via execCommand when ClipboardItem is unavailable
    const origClipboardItem = (globalThis as Record<string, unknown>).ClipboardItem;
    const origExecCommand = document.execCommand;
    try {
      (globalThis as Record<string, unknown>).ClipboardItem = undefined;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn(async () => {}) },
        configurable: true,
      });
      document.execCommand = vi.fn(() => true);
      const copied = await copyTextFromPromise(async () => "https://www.credeal.net/magazine/test");
      expect(copied).toEqual({ ok: true, text: "https://www.credeal.net/magazine/test" });
    } finally {
      (globalThis as Record<string, unknown>).ClipboardItem = origClipboardItem;
      document.execCommand = origExecCommand;
    }

    // E-05: MagazineView DealCard card width is w-full (no 300px/320px squeeze)
    const magazineHtml = renderToStaticMarkup(
      <MagazineView
        brokerId="yaky99-ba89ab"
        brokerSlug="yaky99-ba89ab"
        date="2026-11-24"
        dateLabel="2026년 11월 24일 (화)"
        data={{
          broker: {
            name: "진심 파트너 이상덕",
            company: "제이에스부동산중개(주)",
            phone: "010-2933-5482",
          },
          headline: "11월 4주차 영등포 브리핑",
          featured_deals: [
            {
              id: "dc-mag-01",
              assetType: "근린생활시설",
              address: "서울특별시 영등포구 양평동4가",
              priceWon: 25_000_000_000,
              landAreaM2: 518.7,
              grossFloorAreaM2: 2490.88,
            },
          ],
        }}
      />,
    );
    expect(magazineHtml).toContain("block w-full shrink-0 snap-start");
    expect(magazineHtml).not.toContain("w-[300px] sm:w-[320px]");
  });

  it("F-01..F-03: Inbox renders high-contrast clientCompany badges & clear approval feedback, and QA guide uses 파란색 button label", async () => {
    const thread: InboxThreadItem = {
      id: "thr-v3-company",
      clientName: "강민호 이사",
      clientPhone: "010-5555-7777",
      clientCompany: "(주)한강파트너스",
      clientGrade: "VIP",
      buildingTitle: "양평동4가 프라임 빌딩",
      buildingId: "bld-v3-01",
      latestEvent: "IM 열람 승인 대기",
      gateStatus: "pending",
      updatedAt: "2026-11-24T09:00:00+09:00",
      openCount: 1,
      isRead: false,
      status: "pending_gate",
      shareToken: "tok-v3-gate",
      events: [],
      budget: "250억",
      preferredRegion: "영등포구",
    };

    await act(async () => {
      root.render(
        <InboxEditorColumn
          activeThread={thread}
          activeEditorTab="todo"
          inlineActionError={null}
          busyAction={null}
          kakaoHeadline="양평동4가 프라임"
          kakaoBrief="검토 요청"
          callNote=""
          onSelectEditorTab={vi.fn()}
          onKakaoHeadlineChange={vi.fn()}
          onKakaoBriefChange={vi.fn()}
          onCallNoteChange={vi.fn()}
          onSaveCallNote={vi.fn()}
          onApproveAndSendIm={vi.fn()}
          onRejectRequest={vi.fn()}
          onArchiveThread={vi.fn()}
        />,
      );
    });

    const headerCompanyBadge = container.querySelector(
      '[data-testid="inbox-editor-client-company-badge"]',
    );
    const gateCompanyBadge = container.querySelector(
      '[data-testid="inbox-pending-gate-company-badge"]',
    );
    expect(headerCompanyBadge?.textContent).toContain("(주)한강파트너스");
    expect(gateCompanyBadge?.textContent).toContain("(주)한강파트너스");

    await act(async () => {
      root.render(
        <InboxEditorColumn
          activeThread={thread}
          activeEditorTab="todo"
          inlineActionError={null}
          busyAction="approve:thr-v3-company"
          kakaoHeadline="양평동4가 프라임"
          kakaoBrief="검토 요청"
          callNote=""
          onSelectEditorTab={vi.fn()}
          onKakaoHeadlineChange={vi.fn()}
          onKakaoBriefChange={vi.fn()}
          onCallNoteChange={vi.fn()}
          onSaveCallNote={vi.fn()}
          onApproveAndSendIm={vi.fn()}
          onRejectRequest={vi.fn()}
          onArchiveThread={vi.fn()}
        />,
      );
    });
    expect(container.textContent).toContain("승인 처리 중…");

    const inboxPageSrc = readWorkspaceFile("src/app/(broker)/broker/w/inbox/page.tsx");
    expect(inboxPageSrc).toContain("showUndoToast");
    expect(inboxPageSrc).not.toContain("toast.success");

    const workbenchSrc = readWorkspaceFile(
      "src/app/qa-full-loop/_components/QaFullLoopWorkbenchClient.tsx",
    );
    expect(workbenchSrc).toContain("bg-blue-600");
    expect(workbenchSrc).toContain("파란색 버튼");
    expect(workbenchSrc).not.toContain("검은색 버튼");
    const v3StepsText = JSON.stringify(FULL_LOOP_V3_CASES);
    expect(v3StepsText).toContain("파란색");
    expect(v3StepsText).not.toContain("검은색");
  });

  it("Wave 2: SimpleListRow renders 1-floor inline ghost icons with 44x44px hit targets and WorkspaceShell renders Col-2 header actions", async () => {
    const onDup = vi.fn();
    const onDel = vi.fn();

    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          listTitle="① 매물 목록"
          editorTitle="② 4항목 작성"
          previewTitle="③ 카톡 말풍선 미리보기"
          editorHeaderActions={
            <EditorHeaderActionButton
              testId="header-dup-btn"
              label="복제"
              icon={<span aria-hidden="true">📄</span>}
              onClick={onDup}
            />
          }
          listSlot={
            <SimpleListRow
              testId="row-v3"
              title="영등포구 양평동4가"
              date="2026-11-24T09:30:00+09:00"
              now={new Date("2026-11-24T12:00:00+09:00")}
              selected={true}
              onSelect={vi.fn()}
              actions={
                <>
                  <RowIconActionButton
                    testId="row-dup-btn"
                    label="복제"
                    icon={<span aria-hidden="true">📄</span>}
                    onClick={onDup}
                  />
                  <RowIconActionButton
                    testId="row-del-btn"
                    label="삭제"
                    tone="danger"
                    icon={<span aria-hidden="true">🗑</span>}
                    onClick={onDel}
                  />
                </>
              }
            />
          }
          editorSlot={<div>에디터</div>}
          previewSlot={<div>미리보기</div>}
          primaryActionSlot={<button type="button">보내기</button>}
        />,
      );
    });

    const rowActions = container.querySelector('[data-row-actions="row-v3"]');
    expect(rowActions).not.toBeNull();
    // 1-floor inline layout: no second bottom border-t bar inside the row
    const rowEl = container.querySelector('[data-testid="row-v3"]');
    expect(rowEl?.querySelector(".border-t")).toBeNull();

    const rowDup = container.querySelector('[data-testid="row-dup-btn"]') as HTMLButtonElement | null;
    expect(rowDup?.className).toContain("h-[44px]");
    expect(rowDup?.className).toContain("w-[44px]");
    expect(rowDup?.className).toContain("min-h-[44px]");
    expect(rowDup?.className).toContain("min-w-[44px]");

    const headerActions = container.querySelector('[data-testid="ws-editor-header-actions"]');
    expect(headerActions).not.toBeNull();
    const headerDup = container.querySelector('[data-testid="header-dup-btn"]');
    expect(headerDup).not.toBeNull();
  });
});
