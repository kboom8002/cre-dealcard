// @vitest-environment jsdom
/**
 * @file src/tests/unit/wave4-p2-rentroll-mobile-cta.test.tsx
 * @description Wave 4 Agent 1 P2 Polish Verification Suite:
 *  - A1-11: Stop vacant asking-rent regex re-hydration in mapRentRollImportPayloadToRows & disable deposit input on vacant/owner in RentRollGrid
 *  - A1-12: Tutorial v1.5 Row 13 auto-exclusion + Row 14 entry guidance, MobileRentRollCards tenantName & areaSqm inputs, CASE05 HTML full filename
 *  - A3-10: Hide <1280px inline step-footer primary CTAs (hidden xl:flex / hidden xl:inline-flex) while keeping non-primary actions accessible
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { mapRentRollImportPayloadToRows, type ImListItem } from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { RentRollGrid } from "@/components/workspace/RentRollGrid";
import { MobileRentRollCards } from "@/components/workspace/MobileRentRollCards";
import { ImEditorPanels, type ImEditorPanelsProps } from "@/app/(broker)/broker/w/im/_components/ImEditorPanels";
import { NewsletterSendStepPanel } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel";
import { BROKER_TUTORIAL_MODULES, BROKER_FAQ_LIST, BROKER_GLOSSARY_LIST } from "@/lib/tutorial/broker-tutorial-data";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { PYEONG_TO_SQM_V15 } from "@/domain/building/mobile-im/rentroll-meta";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/workspace/inbox/ContactBulkImportModal", () => ({
  ContactBulkImportModal: () => null,
}));

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

function makeImEditorProps(overrides: Partial<ImEditorPanelsProps> = {}): ImEditorPanelsProps {
  const item: ImListItem = {
    id: "im-wave4-p2-test",
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
    activeEditorTab: "media_publish",
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
    totalDepositManwon: 6000,
    totalRentManwon: 183,
    calculatedYield: 0.19,
    isRentRollImportOpen: false,
    onToggleRentRollImport: vi.fn(),
    onExcelRentRollImport: vi.fn(),
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

describe("Wave 4 Agent 1 P2 Polish (A1-11, A1-12, A3-10)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
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
    vi.restoreAllMocks();
  });

  it("A1-11: mapRentRollImportPayloadToRows never regex-rehydrates vacant/owner asking rents from note", () => {
    const rows = mapRentRollImportPayloadToRows({
      floorLeases: [
        {
          floor: "8F",
          unit_label: "801호",
          tenant_type: "공실",
          deposit_manwon: 0,
          rent_manwon: 0,
          mgmt_fee_manwon: 0,
          is_vacant: true,
          lease_state: "공실",
          note: "입력 금액(보증금 5,000 · 월세 450 · 관리비 40만원)은 공실 행이라 합계에서 제외 / 희망 보증 5,000만",
        },
        {
          floor: "B1",
          unit_label: "B101호",
          tenant_type: "공실",
          deposit_manwon: 4000,
          rent_manwon: 350,
          mgmt_fee_manwon: 30,
          is_vacant: true,
          lease_state: "공실",
          note: "보증금 4,000만 / 월세 350만 / 관리비 30만 희망",
        },
        {
          floor: "4F",
          unit_label: "401호",
          tenant_type: "사옥",
          deposit_manwon: 3000,
          rent_manwon: 200,
          mgmt_fee_manwon: 20,
          is_vacant: false,
          lease_state: "자가사용",
          note: "자가사용 · 보증금 3,000만 / 월세 200만 환산",
        },
        {
          floor: "1F",
          unit_label: "101호",
          tenant_type: "약국 / 고은약국",
          deposit_manwon: 9000,
          rent_manwon: 450,
          mgmt_fee_manwon: 25,
          is_vacant: false,
          lease_state: "임대중",
        },
      ],
    });

    expect(rows).toHaveLength(4);
    const r8f = rows.find((r) => r.floor === "8F")!;
    const rb1 = rows.find((r) => r.floor === "B1")!;
    const r4f = rows.find((r) => r.floor === "4F")!;
    const r1f = rows.find((r) => r.floor === "1F")!;

    expect(r8f.status).toBe("vacant");
    expect(r8f.depositManwon).toBe(0);
    expect(r8f.monthlyRentManwon).toBe(0);
    expect(r8f.maintenanceManwon).toBe(0);
    expect(r8f.note).toContain("합계에서 제외");

    expect(rb1.status).toBe("vacant");
    expect(rb1.depositManwon).toBe(0);
    expect(rb1.monthlyRentManwon).toBe(0);
    expect(rb1.maintenanceManwon).toBe(0);

    expect(r4f.status).toBe("owner");
    expect(r4f.depositManwon).toBe(0);
    expect(r4f.monthlyRentManwon).toBe(0);
    expect(r4f.maintenanceManwon).toBe(0);

    expect(r1f.status).toBe("occupied");
    expect(r1f.depositManwon).toBe(9000);
    expect(r1f.monthlyRentManwon).toBe(450);
    expect(r1f.maintenanceManwon).toBe(25);
  });

  it("A1-11: RentRollGrid disables deposit input and clears displayed deposit when status is vacant or owner", () => {
    const rows: RentRollRowItem[] = [
      {
        id: "r-occ",
        floor: "3F",
        unit: "301호",
        use: "사무실",
        tenantName: "한강소프트",
        depositManwon: 5000,
        monthlyRentManwon: 400,
        maintenanceManwon: 30,
        leaseExpiry: "2028-01",
        status: "occupied",
      },
      {
        id: "r-vac",
        floor: "2F",
        unit: "201호",
        use: "공실",
        depositManwon: 4000,
        monthlyRentManwon: 300,
        maintenanceManwon: 20,
        leaseExpiry: "",
        status: "vacant",
      },
      {
        id: "r-own",
        floor: "1F",
        unit: "101호",
        use: "사옥",
        depositManwon: 9999,
        monthlyRentManwon: 0,
        maintenanceManwon: 0,
        leaseExpiry: "",
        status: "owner",
      },
    ];

    act(() => {
      root.render(<RentRollGrid rows={rows} onChange={vi.fn()} />);
    });

    const occDep = container.querySelector('input[data-rr-cell="0:depositManwon"]') as HTMLInputElement;
    const vacDep = container.querySelector('input[data-rr-cell="1:depositManwon"]') as HTMLInputElement;
    const vacRent = container.querySelector('input[data-rr-cell="1:monthlyRentManwon"]') as HTMLInputElement;
    const ownDep = container.querySelector('input[data-rr-cell="2:depositManwon"]') as HTMLInputElement;

    expect(occDep.disabled).toBe(false);
    expect(occDep.value).toBe("5000");

    expect(vacDep.disabled).toBe(true);
    expect(vacDep.value).toBe("");
    expect(vacDep.className).toContain("text-[#94A3B8]");
    expect(vacRent.disabled).toBe(true);

    expect(ownDep.disabled).toBe(true);
    expect(ownDep.value).toBe("");
    expect(ownDep.className).toContain("text-[#94A3B8]");
  });

  it("A1-12: MobileRentRollCards exposes >=14px / >=44px tenantName and areaSqm inputs and disables vacant/owner deposit", () => {
    const onChange = vi.fn();
    const initialRows: RentRollRowItem[] = [
      {
        id: "m-1",
        floor: "1F",
        unit: "101호",
        use: "약국",
        tenantName: "고은약국",
        areaSqm: 66.12,
        areaPyeong: 20,
        areaSqmIsProxy: true,
        depositManwon: 6000,
        monthlyRentManwon: 350,
        maintenanceManwon: 20,
        leaseExpiry: "2028-06",
        status: "occupied",
      },
      {
        id: "m-2",
        floor: "2F",
        unit: "201호",
        use: "공실",
        depositManwon: 3000,
        monthlyRentManwon: 200,
        maintenanceManwon: 15,
        leaseExpiry: "",
        status: "vacant",
      },
      {
        id: "m-3",
        floor: "3F",
        unit: "301호",
        use: "사옥",
        depositManwon: 8000,
        monthlyRentManwon: 0,
        maintenanceManwon: 0,
        leaseExpiry: "",
        status: "owner",
      },
    ];

    act(() => {
      root.render(<MobileRentRollCards rows={initialRows} onChange={onChange} />);
    });

    const tenantInput = container.querySelector('[data-testid="mobile-rr-tenant-input"]') as HTMLInputElement;
    const areaInput = container.querySelector('[data-testid="mobile-rr-area-input"]') as HTMLInputElement;
    const depositInput = container.querySelector('[data-testid="mobile-rr-deposit-input"]') as HTMLInputElement;

    expect(tenantInput).not.toBeNull();
    expect(tenantInput.value).toBe("고은약국");
    expect(tenantInput.className).toContain("min-h-[48px]");
    expect(tenantInput.className).toContain("text-[max(16px,1rem)]");

    expect(areaInput).not.toBeNull();
    expect(areaInput.value).toBe("66.12");
    expect(areaInput.className).toContain("min-h-[48px]");
    expect(areaInput.className).toContain("text-[max(16px,1rem)]");

    expect(depositInput.disabled).toBe(false);
    expect(depositInput.value).toBe("6000");

    // Edit tenantName and areaSqm ("33평" -> 109.09㎡, clearing stale areaPyeong & proxy)
    act(() => {
      setNativeInputValue(tenantInput, "스타벅스");
    });
    const afterTenant = onChange.mock.calls.at(-1)?.[0] as RentRollRowItem[];
    expect(afterTenant[0].tenantName).toBe("스타벅스");

    act(() => {
      setNativeInputValue(areaInput, "33평");
    });
    const afterArea = onChange.mock.calls.at(-1)?.[0] as RentRollRowItem[];
    expect(afterArea[0].areaSqm).toBeCloseTo(Math.round(33 * PYEONG_TO_SQM_V15 * 100) / 100, 2);
    expect(afterArea[0].areaPyeong).toBeUndefined();
    expect(afterArea[0].areaSqmIsProxy).toBeUndefined();

    // Switch to vacant tab (2F) and verify deposit disabled & cleared
    const tabButtons = Array.from(container.querySelectorAll("button"));
    const vacantTab = tabButtons.find((b) => b.textContent?.includes("2F") && b.textContent?.includes("공실")) as HTMLButtonElement;
    act(() => {
      vacantTab.click();
    });
    const vacDeposit = container.querySelector('[data-testid="mobile-rr-deposit-input"]') as HTMLInputElement;
    const vacTenant = container.querySelector('[data-testid="mobile-rr-tenant-input"]') as HTMLInputElement;
    expect(vacDeposit.disabled).toBe(true);
    expect(vacDeposit.value).toBe("");
    expect(vacTenant.disabled).toBe(true);

    // Switch to owner tab (3F) and verify deposit disabled & cleared
    const ownerTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("3F") && b.textContent?.includes("자가")
    ) as HTMLButtonElement;
    act(() => {
      ownerTab.click();
    });
    const ownDeposit = container.querySelector('[data-testid="mobile-rr-deposit-input"]') as HTMLInputElement;
    expect(ownDeposit.disabled).toBe(true);
    expect(ownDeposit.value).toBe("");

    // Guard against <14px micro-pixel classes in MobileRentRollCards
    const mobileSrc = fs.readFileSync(
      path.join(process.cwd(), "src/components/workspace/MobileRentRollCards.tsx"),
      "utf8"
    );
    expect(mobileSrc).not.toMatch(/\btext-xs\b|text-\[(?:10|10\.5|11|12|13|14|15)px\]/);
  });

  it("A1-12: Tutorial explains v1.5 Row 13 '[예시] 1F 101호' auto-exclusion & Row 14 entry, and CASE05 HTML uses full filename", () => {
    const prepMod = BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-prep")!;
    const step4 = prepMod.steps.find((s) => s.id === "step-prep-4")!;
    const step5 = prepMod.steps.find((s) => s.id === "step-prep-5")!;

    expect(step4.title).toContain("A14");
    expect(step4.whereToClick).toContain("[예시] 1F 101호");
    expect(step4.whereToClick).toContain("자동 제외");
    expect(step4.whereToClick).toContain("A14");
    expect(step4.whereToClick).not.toContain("예시 행 '3F'");
    expect(step4.commonMistake).toContain("A14");
    expect(step4.commonMistake).not.toContain("A13이 아닌");

    expect(step5.tip).toContain("A14");
    expect(step5.copySample?.text).toContain("14행");
    expect(step5.copySample?.text).toContain("[예시] 1F 101호");
    expect(step5.copySample?.text).not.toContain("13행의 '예시 행'은 지우고");

    const q26 = BROKER_FAQ_LIST.find((q) => q.qNumber === "Q26")!;
    expect(q26.answer).toContain("A14");
    expect(q26.answer).toContain("[예시] 1F 101호");

    const v15Glossary = BROKER_GLOSSARY_LIST.find((g) => g.term.includes("v1.5"))!;
    expect(v15Glossary.easyMeaning).toContain("A14");

    const case05Html = fs.readFileSync(
      path.join(process.cwd(), "docs/finaltest/CASE05_E2E_HUMAN_TEST_GUIDE_AND_FEEDBACK.html"),
      "utf8"
    );
    expect(case05Html).toContain(">⬇️ 99_부록_V12_단위혼동_차단게이트_체험용.xlsx</a>");
    expect(case05Html).not.toContain("99_부록_V12_차단체험.xlsx");
  });

  it("A3-10: ImEditorPanels Step 4 & NewsletterSendStepPanel hide <1280px inline primary CTAs while preserving non-primary actions", () => {
    act(() => {
      root.render(<ImEditorPanels {...makeImEditorProps()} />);
    });

    const imStep4Footer = container.querySelector('[data-testid="im-step4-footer-cta-bar"]');
    expect(imStep4Footer).not.toBeNull();
    expect(imStep4Footer?.className).toContain("hidden");
    expect(imStep4Footer?.className).toContain("xl:flex");
    expect(container.querySelector('[data-testid="im-step4-generate-btn"]')).not.toBeNull();

    // Tabs 1-3 navigation buttons remain visible at all viewport sizes
    expect(
      container.querySelector('[data-testid="im-next-to-rentroll-btn"]')?.className
    ).not.toContain("xl:flex");
    expect(
      container.querySelector('[data-testid="im-next-to-axios-btn"]')?.className
    ).not.toContain("xl:flex");
    expect(
      container.querySelector('[data-testid="im-next-to-media-btn"]')?.className
    ).not.toContain("xl:flex");

    act(() => {
      root.render(
        <NewsletterSendStepPanel
          headline="11월 강남 오피스 브리핑"
          briefingBody="핵심 매물 요약입니다."
          selectedDealCount={1}
          enabledNewsCount={1}
          briefingEnabled
          dealsEnabled
          newsEnabled
          targetSegment="all"
          onChangeTargetSegment={vi.fn()}
          subscriberCount={5}
          highInterestCount={2}
          sending={false}
          quietHoursNow={false}
          onJumpToStep={vi.fn()}
          onNotifyEditorFocus={vi.fn()}
          onBulkSubscribersImported={vi.fn()}
          onKakaoShare={vi.fn()}
          onCopyLink={vi.fn()}
          onBackToContent={vi.fn()}
          onSendSelected={vi.fn()}
        />
      );
    });

    const nlSendBtn = container.querySelector('[data-testid="newsletter-step3-send-btn"]');
    const nlBackBtn = container.querySelector('[data-testid="newsletter-step3-back-btn"]');
    const nlCopyLinkBtn = container.querySelector('[data-testid="copy-link-btn"]');
    const nlKakaoBtn = container.querySelector('[data-testid="kakao-share-btn"]');

    expect(nlSendBtn?.className).toContain("hidden");
    expect(nlSendBtn?.className).toContain("xl:inline-flex");
    expect(nlBackBtn?.className).toContain("inline-flex");
    expect(nlBackBtn?.className).not.toContain("hidden");
    expect(nlCopyLinkBtn).not.toBeNull();
    expect(nlKakaoBtn).not.toBeNull();
  });
});
