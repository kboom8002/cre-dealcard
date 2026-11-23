// @vitest-environment jsdom
/**
 * @file src/tests/qa/tester-261123-cognitive-v2-remediation.test.tsx
 * @description Regression suite for 2026-11-23 human review feedback (이상덕 12-slide review on Hold-out V2):
 *   1. Slide 8: ZeroBlankStarterCard '추천 1번' scrolls & highlights #im-address-input
 *   2. Slide 11: Expected Rent Roll subtab exposes [📁 엑셀 파일 불러오기 ▾] (.xlsx upload) + [📋 표 붙여넣기]
 *   3. Slide 7: handleGetWorkspaceSummary preserves dealcard_deleted tombstones across >120 autosave events
 *   4. Slides 2~10: Cognitive-ergonomic V2 contracts (zero jargon, <=18-char headlines, ?new=1/?fresh=1, inline URL fields)
 */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { ImEditorPanels } from "@/app/(broker)/broker/w/im/_components/ImEditorPanels";
import {
  BLANK_IM_HIGHLIGHTS,
  mapRentRollImportPayloadToRows,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { handleGetWorkspaceSummary } from "@/lib/workspace/summary/get-summary";
import { FULL_LOOP_V2_CASES } from "@/lib/testguide/full-loop-v2-holdout-data";
import { FULL_LOOP_CASES } from "@/lib/testguide/full-loop-2cases-data";
import { BROKER_FULL_LOOP_CASES } from "@/lib/testguide/broker-full-loop-data";

describe("Tester 이상덕 2026-11-23 Hold-out V2 Cognitive & Functional Remediation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("Slide 8 & 11: scrolls/highlights #im-address-input on starter click and renders Excel importer on Expected Rent Roll subtab", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const postitStyles = {
      amber: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "01" },
      sky: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "02" },
      mint: { bg: "#fff", border: "#eee", badgeBg: "#eee", badgeText: "#111", label: "03" },
    };

    const renderPanels = (activeTab: "specs" | "rentroll") => (
      <ImEditorPanels
        currentItem={undefined}
        selectedId="im-fresh-test"
        activeEditorTab={activeTab}
        onChangeEditorTab={vi.fn()}
        selectedItemActionsNode={null}
        isProvisioningSheet={false}
        onOpenBottomSheet={vi.fn()}
        isDownloadingPptx={false}
        actionAlert={null}
        actionAlertCode={null}
        onClearActionAlert={vi.fn()}
        onNotifyEditorFocus={vi.fn()}
        onCreateNew={vi.fn()}
        normalizedPosture="income"
        onChangePosture={vi.fn()}
        imTitle=""
        onChangeTitle={vi.fn()}
        address=""
        onChangeAddress={vi.fn()}
        isLookingUpAddress={false}
        onLookupAddress={vi.fn()}
        askingPriceManwon={0}
        priceBandStr="구간: 가격 협의"
        formattedWonDisplay=""
        onWonFocus={vi.fn()}
        onWonBlur={vi.fn()}
        onWonPriceChange={vi.fn()}
        isPriceCalcOpen={false}
        onTogglePriceCalc={vi.fn()}
        onSetDirectAskingPriceManwon={vi.fn()}
        priceEokPart={0}
        priceManwonRemainder={0}
        onSplitPriceChange={vi.fn()}
        gfaSqm=""
        onChangeGfaSqm={vi.fn()}
        landAreaSqm=""
        onChangeLandAreaSqm={vi.fn()}
        onSwapGfaAndLand={vi.fn()}
        zoning=""
        onChangeZoning={vi.fn()}
        completionDate=""
        onChangeCompletionDate={vi.fn()}
        rentRoll={[]}
        onChangeRentRoll={vi.fn()}
        expectedRentRoll={[]}
        onChangeExpectedRentRoll={vi.fn()}
        totalDepositManwon={0}
        totalRentManwon={0}
        calculatedYield={0}
        isRentRollImportOpen={false}
        onToggleRentRollImport={vi.fn()}
        onExcelRentRollImport={vi.fn()}
        onExpectedExcelRentRollImport={vi.fn()}
        axiosHighlights={BLANK_IM_HIGHLIGHTS}
        onChangeAxiosHighlights={vi.fn()}
        postitStyles={postitStyles}
        isAiPointsBusy={false}
        onReclusterImAxios={vi.fn()}
        isBrokerSectionOpen={false}
        onToggleBrokerSection={vi.fn()}
        onMarkBrokerSectionTouched={vi.fn()}
        handoverNote=""
        onChangeHandoverNote={vi.fn()}
        brokerageName=""
        onChangeBrokerageName={vi.fn()}
        brokerName=""
        onChangeBrokerName={vi.fn()}
        brokerPhone=""
        onChangeBrokerPhone={vi.fn()}
        photoEntries={[]}
        photoNames={[]}
        isDraggingPhotos={false}
        onSetDraggingPhotos={vi.fn()}
        isCompressingPhotos={false}
        onFilesSelected={vi.fn()}
        onRemovePhotoAtIndex={vi.fn()}
        isGenerating={false}
        generateButtonLabel="IM 만들기"
        onQuickGenerate={vi.fn()}
      />
    );

    await act(async () => {
      root.render(renderPanels("specs"));
    });

    const starterAddrBtn = container.querySelector(
      '[data-testid="im-starter-address-btn"]'
    ) as HTMLButtonElement | null;
    expect(starterAddrBtn).not.toBeNull();

    await act(async () => {
      starterAddrBtn!.click();
    });

    expect(scrollSpy).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="im-starter-address-guide"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe("im-address-input");

    await act(async () => {
      root.render(renderPanels("rentroll"));
    });

    const expectedSubtabBtn = container.querySelector(
      '[data-testid="im-rentroll-subtab-expected"]'
    ) as HTMLButtonElement | null;
    expect(expectedSubtabBtn).not.toBeNull();

    await act(async () => {
      expectedSubtabBtn!.click();
    });

    const expectedImportToggle = container.querySelector(
      '[data-testid="im-expected-rentroll-import-toggle"]'
    ) as HTMLButtonElement | null;
    expect(expectedImportToggle).not.toBeNull();
    expect(expectedImportToggle!.textContent).toContain("엑셀 파일 불러오기");
  });

  it("maps RentRollImportPayload v1.5 slash-delimited biz/tenant rows cleanly", () => {
    const rows = mapRentRollImportPayloadToRows({
      floorLeases: [
        {
          floor: "1F",
          unit_label: "101호",
          tenant_type: "약국 / 고은약국",
          tenant_name: "약국 / 고은약국",
          area_sqm: 65,
          exclusive_area_sqm: 52,
          deposit_manwon: 9000,
          rent_manwon: 450,
          mgmt_fee_manwon: 26,
          lease_end: "2029-02-28",
          lease_state: "임대중",
          is_vacant: false,
        },
        {
          floor: "2F",
          unit_label: "202호",
          tenant_type: "공실",
          area_sqm: 135,
          deposit_manwon: 0,
          rent_manwon: 0,
          mgmt_fee_manwon: 0,
          lease_state: "공실",
          is_vacant: true,
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].floor).toBe("2F");
    expect(rows[0].status).toBe("vacant");
    expect(rows[1].use).toBe("약국");
    expect(rows[1].tenantName).toBe("고은약국");
  });

  it("Slide 7: preserves dealcard_deleted tombstones via dedicated lifecycle query even after 200+ autosaves", async () => {
    const manyUpserts = Array.from({ length: 200 }, (_, i) => ({
      id: `act-up-${i}`,
      event_type: "dealcard_upserted",
      entity_id: "user-1",
      created_at: new Date(Date.UTC(2026, 10, 23, 0, 10, 0) - i * 1000).toISOString(),
      metadata: {
        building_id: "bld-active-card",
        card4: { region: "영등포구 당산동", use: "근린생활시설", priceBand: "100~120억", points: ["a", "b", "c"] },
      },
    }));

    const olderDeleteTombstone = {
      id: "act-del-old",
      event_type: "dealcard_deleted",
      entity_id: "bld-deleted-yesterday",
      created_at: "2026-11-22T23:00:00.000Z",
      metadata: { building_id: "bld-deleted-yesterday" },
    };

    const olderUpsertBeforeDelete = {
      id: "act-up-very-old",
      event_type: "dealcard_upserted",
      entity_id: "user-1",
      created_at: "2026-11-22T22:00:00.000Z",
      metadata: {
        building_id: "bld-deleted-yesterday",
        card4: { region: "마포구 동교동", use: "근린생활시설", priceBand: "70~80억", points: ["x", "y", "z"] },
      },
    };

    const mockSupabase = {
      from: (table: string) => {
        let filterTypes: string[] = [];
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          in: (_col: string, vals: string[]) => {
            filterTypes = vals;
            return chain;
          },
          order: () => chain,
          limit: () => {
            if (table === "activity_events") {
              if (filterTypes.length <= 10) {
                return Promise.resolve({ data: [olderDeleteTombstone] });
              }
              return Promise.resolve({ data: [...manyUpserts, olderUpsertBeforeDelete] });
            }
            return Promise.resolve({ data: [] });
          },
        };
        return chain;
      },
    };

    const summary = await handleGetWorkspaceSummary({
      supabase: mockSupabase,
      userId: "user-1",
      role: "broker",
      targetId: null,
      brokerProfile: null,
    });

    const returnedIds = summary.dealcards.map((d: Record<string, unknown>) =>
      String(d.id || "")
    );
    expect(returnedIds).toContain("bld-active-card");
    expect(returnedIds).not.toContain("bld-deleted-yesterday");
  });

  it("Slides 2~10: enforces cognitive-ergonomic contracts across all Full-Loop data suites", () => {
    // 1. All DealCard 18-char headline snippets across V1, V2, Broker <= 18 chars
    const allHeadlineSnippets = [
      ...FULL_LOOP_CASES,
      ...FULL_LOOP_V2_CASES,
      ...BROKER_FULL_LOOP_CASES,
    ]
      .flatMap((c) => c.steps)
      .flatMap((s) => s.copySnippets)
      .filter((sn) => sn.id.endsWith("dc-headline"));

    expect(allHeadlineSnippets.length).toBeGreaterThanOrEqual(4);
    for (const sn of allHeadlineSnippets) {
      expect(Array.from(sn.value).length).toBeLessThanOrEqual(18);
    }

    // 2. V2 steps open fresh workspaces (?new=1 / ?fresh=1), expose inline URL fields, and banish machine jargon
    const h1s2 = FULL_LOOP_V2_CASES[0].steps.find((s) => s.id === "H1-S2")!;
    const h1s3 = FULL_LOOP_V2_CASES[0].steps.find((s) => s.id === "H1-S3")!;
    expect(h1s2.workspaceHref).toBe("/broker/w/dealcards?new=1");
    expect(h1s2.actionChecklist.join(" ")).toContain("카톡으로 보내기");
    expect(h1s2.actionChecklist.join(" ")).toContain("링크 복사");
    expect(h1s2.inlineScratchFields?.[0]?.field).toBe("dealCardUrl");

    expect(h1s3.workspaceHref).toBe("/broker/w/im?fresh=1");
    expect(h1s3.actionChecklist.join(" ")).toContain("엑셀 파일 불러오기");
    expect(h1s3.actionChecklist.join(" ")).toContain("표 붙여넣기");
    expect(h1s3.inlineScratchFields?.[0]?.field).toBe("imShareUrl");

    const allV2Text = FULL_LOOP_V2_CASES.flatMap((c) => [
      ...c.domainTraps.map((t) => `${t.code} ${t.title} ${t.detail}`),
      ...c.steps.flatMap((s) => [s.title, ...s.actionChecklist, s.humanFocus, s.autoProbeFocus]),
    ]).join("\n");
    expect(allV2Text).not.toContain("TRAP-V2");
    expect(allV2Text).not.toContain("도메인 함정");
    expect(allV2Text).not.toContain("오라클 입력창");
  });
});
