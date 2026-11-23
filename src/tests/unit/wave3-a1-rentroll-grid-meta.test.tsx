// @vitest-environment jsdom
/**
 * @file src/tests/unit/wave3-a1-rentroll-grid-meta.test.tsx
 * @description Wave 3 Agent 1 comprehensive regression & unit test suite:
 *  - A1-06: RentRollImporter hideTextMode & overwrite protection + RentRollGrid AI drawer deterministic TSV/pipe table detection & overwrite confirm
 *  - A6-16: ImEditorPanels expected subtab summary badge switching (기대 전환 vs 현행)
 *  - A1-07 / A3-04 / A3-07 / A3-08: RentRollMeta / contractGroup / areaSqmIsProxy / legalBasis / firstContractDate persistence + xl:hidden published bar + copy hygiene
 *  - A1-08: RentRollGrid table min-w-[1080px], column min-w-* guards, zero <14px text, widened RentRollImporter preview inputs
 *  - A1-09: Area unit conversion (3.305785), stale areaPyeong clearing on edit, exclusiveAreaSqm toggle, slides-html-builder pyeong & proxy handling
 *  - A1-10: tsv-parser non-concatenation + rawStatus parenthetical note + unified '업종 / 상호' slash-splitting across layers
 *  - A6-01: Zero "배당" tokens in owned IM backend/domain files
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import {
  RentRollGrid,
  hasExistingRentRollData,
  parseAreaCellValue,
} from "@/components/workspace/RentRollGrid";
import { RentRollImporter } from "@/components/broker/rent-roll-importer";
import { ImEditorPanels, type ImEditorPanelsProps } from "@/app/(broker)/broker/w/im/_components/ImEditorPanels";
import {
  mapRentRollImportPayloadToRows,
  type ImListItem,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { parseTsvRentRoll, type RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { buildSlidesHtmlExport } from "@/lib/im-lite/slides-html-builder";
import { synthesizeQuickRecordFromImItem } from "@/lib/im-lite/quick-generate-store";
import { PYEONG_TO_SQM_V15, type RentRollMeta } from "@/domain/building/mobile-im/rentroll-meta";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string
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
  overrides: Partial<ImEditorPanelsProps> = {}
): ImEditorPanelsProps {
  const item: ImListItem = {
    id: "im-wave3-test",
    buildingId: "11111111-2222-4333-8444-555555555555",
    title: "당산 테스트 빌딩",
    address: "서울특별시 영등포구 당산동5가 11-47",
    askingPriceManwon: 1_150_000,
    grossYieldPct: 2.38,
    status: "published",
    versionLabel: "발행됨",
    updatedAt: "2026-11-23T00:00:00.000Z",
    floorsAbove: 5,
    floorsBelow: 1,
    ...(overrides.currentItem ?? {}),
  };

  return {
    currentItem: item,
    selectedId: item.id,
    activeEditorTab: "rentroll",
    onChangeEditorTab: vi.fn(),
    isProvisioningSheet: false,
    onOpenBottomSheet: vi.fn(),
    isDownloadingPptx: false,
    actionAlert: null,
    onClearActionAlert: vi.fn(),
    onNotifyEditorFocus: vi.fn(),
    onCreateNew: vi.fn(),
    normalizedPosture: "core_income",
    onChangePosture: vi.fn(),
    imTitle: item.title,
    onChangeTitle: vi.fn(),
    address: item.address,
    onChangeAddress: vi.fn(),
    isLookingUpAddress: false,
    onLookupAddress: vi.fn(),
    askingPriceManwon: 1_150_000,
    priceBandStr: "110~120억",
    formattedWonDisplay: "11,500,000,000",
    onWonFocus: vi.fn(),
    onWonBlur: vi.fn(),
    onWonPriceChange: vi.fn(),
    isPriceCalcOpen: false,
    onTogglePriceCalc: vi.fn(),
    onSetDirectAskingPriceManwon: vi.fn(),
    priceEokPart: 115,
    priceManwonRemainder: 0,
    onSplitPriceChange: vi.fn(),
    gfaSqm: "1441",
    onChangeGfaSqm: vi.fn(),
    landAreaSqm: "506",
    onChangeLandAreaSqm: vi.fn(),
    onSwapGfaAndLand: vi.fn(),
    zoning: "준공업지역",
    onChangeZoning: vi.fn(),
    completionDate: "2008-05-01",
    onChangeCompletionDate: vi.fn(),
    rentRoll: [
      {
        id: "r1",
        floor: "1F",
        unit: "101호",
        use: "약국",
        tenantName: "고은약국",
        areaSqm: 78.39,
        depositManwon: 6000,
        monthlyRentManwon: 183,
        maintenanceManwon: 20,
        leaseExpiry: "2026-08-31",
        status: "occupied",
      },
    ],
    onChangeRentRoll: vi.fn(),
    expectedRentRoll: [
      {
        id: "er1",
        floor: "1F",
        unit: "101호",
        use: "약국",
        tenantName: "고은약국",
        areaSqm: 78.39,
        depositManwon: 10000,
        monthlyRentManwon: 500,
        maintenanceManwon: 30,
        leaseExpiry: "2028-08-31",
        status: "occupied",
      },
    ],
    onChangeExpectedRentRoll: vi.fn(),
    onCopyActualToExpectedRentRoll: vi.fn(),
    totalDepositManwon: 6000,
    totalRentManwon: 183,
    calculatedYield: 0.19,
    isRentRollImportOpen: true,
    onToggleRentRollImport: vi.fn(),
    onExcelRentRollImport: vi.fn(),
    onExpectedExcelRentRollImport: vi.fn(),
    axiosHighlights: [],
    onChangeAxiosHighlights: vi.fn(),
    postitStyles: {
      amber: { bg: "bg-amber-50", border: "border-amber-200", badgeBg: "bg-amber-100", badgeText: "text-amber-900", label: "핵심" },
      sky: { bg: "bg-sky-50", border: "border-sky-200", badgeBg: "bg-sky-100", badgeText: "text-sky-900", label: "수익" },
      mint: { bg: "bg-emerald-50", border: "border-emerald-200", badgeBg: "bg-emerald-100", badgeText: "text-emerald-900", label: "가치" },
    },
    isAiPointsBusy: false,
    onReclusterImAxios: vi.fn(),
    isBrokerSectionOpen: false,
    onToggleBrokerSection: vi.fn(),
    onMarkBrokerSectionTouched: vi.fn(),
    handoverNote: "",
    onChangeHandoverNote: vi.fn(),
    brokerageName: "크리딜중개법인",
    onChangeBrokerageName: vi.fn(),
    brokerName: "홍길동",
    onChangeBrokerName: vi.fn(),
    brokerPhone: "010-1234-5678",
    onChangeBrokerPhone: vi.fn(),
    photoEntries: [],
    photoNames: [],
    isDraggingPhotos: false,
    onSetDraggingPhotos: vi.fn(),
    isCompressingPhotos: false,
    onFilesSelected: vi.fn(),
    onRemovePhotoAtIndex: vi.fn(),
    isGenerating: false,
    generateButtonLabel: "IM 발행",
    onQuickGenerate: vi.fn(),
    onCopyShareLink: vi.fn(),
    ...overrides,
  };
}

describe("Wave 3 Agent 1 — RentRollGrid, Meta, Area & Slash Consolidation", () => {
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

  it("A1-06: RentRollImporter hides text mode when hideTextMode is true, keeps it by default, and guards existing data", () => {
    const onImport = vi.fn();

    act(() => {
      root.render(<RentRollImporter hideTextMode hasExistingData={false} onImport={onImport} />);
    });
    expect(container.querySelector('[data-testid="rentroll-mode-text"]')).toBeNull();
    expect(container.querySelector('[data-testid="rentroll-file-input"]')).not.toBeNull();

    // Standalone default (hideTextMode=false) + overwrite confirmation when hasExistingData=true
    act(() => {
      root.render(<RentRollImporter hasExistingData onImport={onImport} />);
    });
    const textTabBtn = container.querySelector('[data-testid="rentroll-mode-text"]') as HTMLButtonElement;
    expect(textTabBtn).not.toBeNull();

    act(() => {
      textTabBtn.click();
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    act(() => {
      setNativeInputValue(textarea, "1층 약국 5000/400\n2층 사무실 3000/200");
    });

    const parseBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("AI 분석")
    ) as HTMLButtonElement;
    expect(parseBtn).toBeDefined();

    act(() => {
      parseBtn.click();
    });

    // Overwrite modal appears before calling onImport or parsing
    expect(container.textContent).toContain("기존 임대 현황 덮어쓰기");
    expect(onImport).not.toHaveBeenCalled();

    const confirmOverwriteBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("덮어쓰기 확인")
    ) as HTMLButtonElement;
    expect(confirmOverwriteBtn).not.toBeNull();
  });

  it("A1-06 & A1-08: RentRollGrid auto-detects structured TSV/pipe tables deterministically, protects existing rows, and prevents truncation", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onChange = vi.fn();
    const initialRows: RentRollRowItem[] = [
      {
        id: "existing-1",
        floor: "13F",
        unit: "1301호",
        use: "사무실",
        tenantName: "기존임차인",
        areaSqm: 120,
        areaPyeong: 36.3,
        depositManwon: 5000,
        monthlyRentManwon: 400,
        maintenanceManwon: 40,
        leaseExpiry: "2027-05-31",
        status: "occupied",
      },
    ];

    expect(hasExistingRentRollData(initialRows)).toBe(true);
    expect(
      hasExistingRentRollData([
        {
          id: "scaffold-1f",
          floor: "1F",
          unit: "101호",
          use: "근린생활시설",
          depositManwon: 0,
          monthlyRentManwon: 0,
          maintenanceManwon: 0,
          leaseExpiry: "",
          status: "occupied",
        },
      ])
    ).toBe(false);

    act(() => {
      root.render(
        <RentRollGrid rows={initialRows} onChange={onChange} askingPriceManwon={200000} />
      );
    });

    // A1-08: table min-w-[1080px] and explicit column min-widths
    const table = container.querySelector("table");
    expect(table?.className).toContain("min-w-[1080px]");
    const thHtml = container.querySelector("thead")?.innerHTML ?? "";
    for (const minW of [
      "min-w-[64px]",
      "min-w-[88px]",
      "min-w-[130px]",
      "min-w-[120px]",
      "min-w-[84px]",
      "min-w-[104px]",
      "min-w-[88px]",
      "min-w-[82px]",
      "min-w-[108px]",
      "min-w-[144px]",
    ]) {
      expect(thHtml).toContain(minW);
    }

    // Open AI text drawer & paste Markdown pipe table
    const aiOpenBtn = container.querySelector('[data-testid="rent-roll-ai-parse-btn"]') as HTMLButtonElement;
    act(() => {
      aiOpenBtn.click();
    });
    const aiTextarea = container.querySelector('[data-testid="rent-roll-ai-textarea"]') as HTMLTextAreaElement;
    act(() => {
      setNativeInputValue(
        aiTextarea,
        "| 층 | 호실 | 업종 / 상호 | 면적 | 보증금 | 월세 |\n| 1F | 101호 | 카페 / 스타벅스 | 99.17 | 10000 | 800 |\n| 2F | 201호 | 의원 / 연세내과 | 132.23 | 5000 | 450 |"
      );
    });

    const detectedBanner = container.querySelector('[data-testid="rent-roll-ai-table-detected"]');
    expect(detectedBanner?.textContent).toContain("2개 호실");

    const aiSubmitBtn = container.querySelector('[data-testid="rent-roll-ai-submit-btn"]') as HTMLButtonElement;
    act(() => {
      aiSubmitBtn.click();
    });

    // Should NOT call AI network endpoint for pipe table & should pause at overwrite confirmation
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    const overwriteConfirmBox = container.querySelector('[data-testid="rent-roll-ai-overwrite-confirm"]');
    expect(overwriteConfirmBox).not.toBeNull();

    const confirmBtn = container.querySelector('[data-testid="rent-roll-ai-confirm-overwrite-btn"]') as HTMLButtonElement;
    act(() => {
      confirmBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedRows = onChange.mock.calls[0][0] as RentRollRowItem[];
    expect(updatedRows).toHaveLength(2);
    expect(updatedRows[0].floor).toBe("2F"); // Top-down sort
  });

  it("A1-09: parseAreaCellValue converts pyeong via 3.305785 and RentRollGrid clears stale areaPyeong on edit", () => {
    expect(parseAreaCellValue("33평")).toBeCloseTo(Math.round(33 * PYEONG_TO_SQM_V15 * 100) / 100, 2);
    expect(parseAreaCellValue("109.09㎡")).toBe(109.09);

    const onChange = vi.fn();
    const initialRows: RentRollRowItem[] = [
      {
        id: "a1-09-row",
        floor: "1F",
        unit: "101호",
        use: "약국",
        tenantName: "고은약국",
        areaSqm: 66.12,
        areaPyeong: 20,
        areaSqmIsProxy: true,
        depositManwon: 6000,
        monthlyRentManwon: 183,
        maintenanceManwon: 0,
        leaseExpiry: "2026-08-31",
        status: "occupied",
      },
    ];

    act(() => {
      root.render(<RentRollGrid rows={initialRows} onChange={onChange} />);
    });

    const areaInput = container.querySelector('[data-rr-cell="0:areaSqm"]') as HTMLInputElement;
    expect(areaInput).not.toBeNull();
    act(() => {
      setNativeInputValue(areaInput, "30평");
    });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as RentRollRowItem[];
    expect(lastCall[0].areaSqm).toBe(99.17);
    expect(lastCall[0].areaPyeong).toBeUndefined();
    expect(lastCall[0].areaSqmIsProxy).toBeUndefined();

    // Exclusive area toggle & clear stale areaPyeong
    const exclToggleBtn = container.querySelector('[data-testid="rent-roll-exclusive-toggle"]') as HTMLButtonElement;
    act(() => {
      exclToggleBtn.click();
    });
    const exclInput = container.querySelector('[data-rr-cell="0:exclusiveAreaSqm"]') as HTMLInputElement;
    expect(exclInput).not.toBeNull();
    act(() => {
      setNativeInputValue(exclInput, "20평");
    });
    const afterExcl = onChange.mock.calls.at(-1)?.[0] as RentRollRowItem[];
    expect(afterExcl[0].exclusiveAreaSqm).toBe(66.12);
    expect(afterExcl[0].areaPyeong).toBeUndefined();
  });

  it("A6-16 & A3-08 & A1-06: ImEditorPanels switches summary badges on expected subtab, shows xl:hidden published URL bar, and passes hideTextMode & hasExistingData", () => {
    const props = makeBaseImEditorProps({
      expectedDepositManwon: 10000,
      expectedRentManwon: 500,
      expectedYieldPct: 0.53,
    });

    act(() => {
      root.render(<ImEditorPanels {...props} />);
    });

    // A3-08: Col 2 xl:hidden inline published URL bar
    const urlBar = container.querySelector('[data-testid="im-col2-published-url-bar"]');
    expect(urlBar).not.toBeNull();
    expect(urlBar?.className).toContain("xl:hidden");
    expect(urlBar?.textContent).toContain("/im-lite/11111111-2222-4333-8444-555555555555");

    // A1-06: ImEditorPanels hides text mode inside RentRollImporter
    const actualImporter = container.querySelector('[data-testid="im-rentroll-xlsx-importer"]');
    expect(actualImporter?.querySelector('[data-testid="rentroll-mode-text"]')).toBeNull();

    // Actual subtab shows actual totals
    const summaryBadgesBefore = container.querySelector('[data-testid="im-rentroll-summary-badges"]');
    expect(summaryBadgesBefore?.textContent).toContain("연 0.19%");

    // Switch to expected rent roll subtab -> summary badges switch to 기대 전환
    const expectedTabBtn = container.querySelector('[data-testid="im-rentroll-subtab-expected"]') as HTMLButtonElement;
    act(() => {
      expectedTabBtn.click();
    });
    const summaryBadgesAfter = container.querySelector('[data-testid="im-rentroll-summary-badges"]');
    expect(summaryBadgesAfter?.textContent).toContain("기대 전환 보증금");
    expect(summaryBadgesAfter?.textContent).toContain("기대 연 0.53%");
    expect(summaryBadgesAfter?.textContent).toContain("현행 연 0.19%");
  });

  it("A1-10 & A1-07 & A1-09: tsv-parser avoids concatenation, preserves rawStatus note, unifies '업종 / 상호' slash-split, and slides-html-builder renders pyeong & proxy", () => {
    // 1. tsv-parser separate 업종 & 임차인 + rawStatus paren note + 3.305785 + proxy
    const tsv = [
      "층\t호실\t업종\t임차인\t전용면적(평)\t보증금(만)\t월세(만)\t상태",
      "1F\t101호\t약국\t고은약국\t30\t6000\t183\t임대중(11년 장기미인상)",
    ].join("\n");
    const parsedTsv = parseTsvRentRoll(tsv);
    expect(parsedTsv.rows).toHaveLength(1);
    expect(parsedTsv.rows[0].use).toBe("약국");
    expect(parsedTsv.rows[0].tenantName).toBe("고은약국");
    expect(parsedTsv.rows[0].exclusiveAreaSqm).toBe(99.17);
    expect(parsedTsv.rows[0].areaSqm).toBe(99.17);
    expect(parsedTsv.rows[0].areaSqmIsProxy).toBe(true);
    expect(parsedTsv.rows[0].note).toContain("11년 장기미인상");

    // 2. mapRentRollImportPayloadToRows unifies 업종 / 상호 & preserves v1.5 meta/row fields
    const mappedRows = mapRentRollImportPayloadToRows({
      floorLeases: [
        {
          floor: "B1",
          unit_label: "B101호",
          tenant_type: "디저트카페 / 데이르젤라또",
          exclusive_area_sqm: 83.03,
          area_sqm: 83.03,
          area_sqm_is_proxy: true,
          contract_group: "GRP-1",
          legal_basis: "상가",
          first_contract_date: "2020-03-01",
          deposit_manwon: 0,
          rent_manwon: 0,
          lease_state: "자가사용",
          is_vacant: false,
        },
      ],
    });
    expect(mappedRows[0].use).toBe("디저트카페");
    expect(mappedRows[0].tenantName).toBe("데이르젤라또");
    expect(mappedRows[0].areaSqmIsProxy).toBe(true);
    expect(mappedRows[0].contractGroup).toBe("GRP-1");
    expect(mappedRows[0].legalBasis).toBe("상가");
    expect(mappedRows[0].firstContractDate).toBe("2020-03-01");

    // 3. synthesizeQuickRecordFromImItem preserves RentRollMeta & splits '업종 / 상호'
    const meta: RentRollMeta = {
      rentroll_version: "1.5",
      area_input_unit: "pyeong",
      rentroll_as_of: "2026-11-01",
      gfa_sqm: 1441.5,
      area_unit_override: { reason: "건축물대장 대조 완료" },
    };
    const quickRec = synthesizeQuickRecordFromImItem({
      id: "im-meta-sync",
      buildingId: "22222222-3333-4444-8555-666666666666",
      title: "성수 테스트 빌딩",
      address: "서울특별시 성동구 성수동2가 300-1",
      askingPriceManwon: 900000,
      rentRollMeta: meta,
      rentRoll: [
        {
          floor: "1F",
          unit: "101호",
          use: "약국 / 고은약국",
          areaSqm: 99.17,
          exclusiveAreaSqm: 78.39,
          areaSqmIsProxy: true,
          contractGroup: "G-1",
          legalBasis: "상가",
          firstContractDate: "2019-01-15",
          depositManwon: 6000,
          monthlyRentManwon: 183,
          maintenanceManwon: 20,
          status: "occupied",
        },
      ],
    });
    expect(quickRec.rentRollMeta).toEqual(meta);
    expect(quickRec.fullDocBody?.rent_roll_meta).toEqual(meta);
    expect(quickRec.fullDocBody?.floor_leases?.[0]?.tenant_type).toBe("약국");
    expect(quickRec.fullDocBody?.floor_leases?.[0]?.tenant_name).toBe("고은약국");
    expect(quickRec.fullDocBody?.floor_leases?.[0]?.contract_group).toBe("G-1");
    expect(quickRec.fullDocBody?.floor_leases?.[0]?.area_sqm_is_proxy).toBe(true);

    // 4. slides-html-builder respects area_input_unit="pyeong", exclusive_area_sqm, and proxy suppression
    const html = buildSlidesHtmlExport({
      buildingId: quickRec.buildingId,
      title: "성수 테스트 빌딩",
      content: quickRec.fullDocBody,
      building: {},
      brokerInfo: { displayName: "홍길동", company: "크리딜" },
    });
    expect(html).toContain("임대면적(평)");
    expect(html).toContain("전용면적(평)");
    expect(html).toContain("23.7평"); // 78.39 / 3.305785 = 23.713 -> 23.7평
  });

  it("A6-01 & A3-04/07 & A1-08: Zero '배당', zero '점검창', zero '오른쪽' guides, and zero <14px in RentRollGrid", () => {
    const readRepoFile = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

    expect(readRepoFile("src/app/api/broker/im-lite/quick-generate/route.ts")).not.toContain("배당");
    expect(readRepoFile("src/lib/im-lite/quick-generate-store.ts")).not.toContain("배당");
    expect(
      readRepoFile("src/app/(broker)/broker/w/im/_components/im-workspace-types.ts")
    ).not.toContain("배당");

    const pageSrc = readRepoFile("src/app/(broker)/broker/w/im/page.tsx");
    expect(pageSrc).not.toContain("점검창");
    expect(pageSrc).not.toContain("오른쪽에서 미리보거나");

    const panelsSrc = readRepoFile(
      "src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx"
    );
    expect(panelsSrc).not.toContain("오른쪽 [주소로 건물 정보 자동 채우기]");

    const gridSrc = readRepoFile("src/components/workspace/RentRollGrid.tsx");
    expect(gridSrc).not.toMatch(/text-xs|text-\[1[0-3]px\]/);
  });
});
