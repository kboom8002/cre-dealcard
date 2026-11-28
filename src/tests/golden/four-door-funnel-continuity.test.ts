// @vitest-environment jsdom
/**
 * @file src/tests/golden/four-door-funnel-continuity.test.ts
 * @description G-UX-06 Ring 1 Golden Oracle ($0, Vitest):
 *   Verifies end-to-end 4-Door Funnel Continuity invariants across:
 *   1. DealCard -> Newsletter (`mergeAddedDealId` dedup, buildingId match, maxFeatured cap)
 *      & `DealCardPreviewColumn` handoff links + absence of extra 56px primary button.
 *   2. IM -> DealCard / Inbox handoff (`ImPreviewPane` in `published_clean`).
 *   3. Inbox inventory matching (`rankMatchingInventoryDeals` & `buildRecommendedDealOutreach`).
 *   4. Single-building cross-door projection continuity (`toPublicDealCard` blind guard +
 *      statutory broker disclosure parity without leaking street address).
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DealCardPreviewColumn } from "@/app/(broker)/broker/w/dealcards/_components/DealCardPreviewColumn";
import { ImPreviewPane } from "@/app/(broker)/broker/w/im/_components/ImPreviewPane";
import { mergeAddedDealId } from "@/app/(broker)/broker/magazine-editor/page";
import {
  buildRecommendedDealOutreach,
  rankMatchingInventoryDeals,
  type BrokerInventoryDeal,
} from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { toPublicDealCard } from "@/domain/public-projection/deal-card";
import { extractSanitizedStatutoryItems } from "@/lib/legal/broker-statutory-disclosure";
import type { Card4Data } from "@/lib/deal-card/card4-schema";
import {
  DEFAULT_IM_AXIOS_HIGHLIGHTS,
  type BasicImSlideSummary,
  type ImListItem,
} from "@/app/(broker)/broker/w/im/_components/im-workspace-types";

const SAMPLE_CARD4_CLEAN: Card4Data = {
  posture: "income",
  region: "강남구 역삼동",
  use: "근린생활시설",
  area: "연면적 520평",
  gfaPyung: 520,
  landAreaPyung: 145,
  priceBand: "120~130억",
  headline: "역세권 대로변 코너 빌딩",
  points: [
    "강남역 도보 4분 코너",
    "우량 임차인 전층 만실",
    "안정적인 임대수익 구조",
  ],
  pointTones: ["amber", "sky", "mint"],
  provenance: { points: ["public", "broker", "ai"] },
  card4_version: 2,
};

describe("G-UX-06: 4-Door Funnel Continuity Oracle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── 1. DealCard -> Newsletter & IM handoff ──
  describe("1. DealCard -> Newsletter & IM Handoff", () => {
    const availableDeals = [
      { id: "deal-uuid-1", buildingId: "bld-test-1", title: "역삼동 코너 빌딩" },
      { id: "deal-uuid-2", buildingId: "bld-test-2", title: "서교동 근생 빌딩" },
      { id: "deal-uuid-3", buildingId: "bld-test-3", title: "잠원동 사옥 빌딩" },
      { id: "deal-uuid-4", buildingId: "bld-test-4", title: "성수동 리모델링" },
    ];

    it("mergeAddedDealId resolves buildingId to canonical deal id and deduplicates", () => {
      const firstAdd = mergeAddedDealId(["deal-uuid-2"], "bld-test-1", availableDeals, 6);
      expect(firstAdd.addedId).toBe("deal-uuid-1");
      expect(firstAdd.alreadyIncluded).toBe(false);
      expect(firstAdd.matchedTitle).toBe("역삼동 코너 빌딩");
      expect(firstAdd.nextIds).toEqual(["deal-uuid-2", "deal-uuid-1"]);

      // Re-adding via either buildingId or canonical id deduplicates without mutation
      const dupByBuilding = mergeAddedDealId(firstAdd.nextIds, "bld-test-1", availableDeals, 6);
      expect(dupByBuilding.alreadyIncluded).toBe(true);
      expect(dupByBuilding.nextIds).toEqual(firstAdd.nextIds);

      const dupByCanonical = mergeAddedDealId(firstAdd.nextIds, "deal-uuid-1", availableDeals, 6);
      expect(dupByCanonical.alreadyIncluded).toBe(true);
      expect(dupByCanonical.nextIds).toEqual(firstAdd.nextIds);
    });

    it("mergeAddedDealId preserves maxFeatured cap by prepending new deal and trimming tail", () => {
      const capped = mergeAddedDealId(
        ["deal-uuid-1", "deal-uuid-2", "deal-uuid-3"],
        "bld-test-4",
        availableDeals,
        3
      );
      expect(capped.alreadyIncluded).toBe(false);
      expect(capped.addedId).toBe("deal-uuid-4");
      expect(capped.nextIds).toHaveLength(3);
      expect(capped.nextIds).toEqual(["deal-uuid-4", "deal-uuid-1", "deal-uuid-2"]);
    });

    it("DealCardPreviewColumn (published_clean) renders newsletter & IM handoff links without an extra 56px primary button", () => {
      const { container } = render(
        React.createElement(DealCardPreviewColumn, {
          lifecycle: "published_clean",
          liveUrl: "/dc/bld-test-1",
          isPreGeneration: false,
          effectiveCard4: SAMPLE_CARD4_CLEAN,
          dealId: "bld-test-1",
          brokerProfile: {
            displayName: "박준영",
            company: "한성빌딩부동산중개법인",
            phone: "010-3482-9104",
            registrationNo: "11680-2025-04719",
            slug: "hanseong-cre",
            photoUrl: null,
          },
          activeUnitId: null,
          selectedMemoOnly: null,
          onStartInput: vi.fn(),
          onResyncPublished: vi.fn(),
          onSkipMemoManual: vi.fn(),
          onFillSample: vi.fn(),
          onActivateUnit: vi.fn(),
        })
      );

      const handoff = screen.getByTestId("dealcard-cross-door-handoff");
      expect(handoff).toBeDefined();

      const newsletterLink = screen.getByTestId("dealcard-handoff-newsletter-link");
      expect(newsletterLink.getAttribute("href")).toBe("/broker/w/newsletter?addDealId=bld-test-1");

      const imLink = screen.getByTestId("dealcard-handoff-im-link");
      expect(imLink.getAttribute("href")).toBe("/broker/w/im?buildingId=bld-test-1");

      // Column 3 must not contain a competing 56px primary button
      const buttonsAndLinks = Array.from(container.querySelectorAll("button, a"));
      const primary56Elements = buttonsAndLinks.filter((el) =>
        (el.getAttribute("class") || "").includes("min-h-[56px]")
      );
      expect(primary56Elements).toHaveLength(0);
    });

    it("DealCardPreviewColumn hides cross-door handoff strip when lifecycle is not published_clean", () => {
      render(
        React.createElement(DealCardPreviewColumn, {
          lifecycle: "published_dirty",
          liveUrl: "/dc/bld-test-1",
          isPreGeneration: false,
          effectiveCard4: SAMPLE_CARD4_CLEAN,
          dealId: "bld-test-1",
          brokerProfile: null,
          activeUnitId: null,
          selectedMemoOnly: null,
          onStartInput: vi.fn(),
          onResyncPublished: vi.fn(),
          onSkipMemoManual: vi.fn(),
          onFillSample: vi.fn(),
          onActivateUnit: vi.fn(),
        })
      );
      expect(screen.queryByTestId("dealcard-cross-door-handoff")).toBeNull();
    });
  });

  // ── 2. IM -> DealCard / Inbox handoff ──
  describe("2. IM -> DealCard & Inbox Handoff", () => {
    const sampleImItem: ImListItem = {
      id: "im-doc-test-1",
      buildingId: "bld-test-1",
      documentId: "doc-uuid-1",
      title: "역삼동 코너 빌딩",
      address: "서울특별시 강남구 역삼동 823-14",
      askingPriceManwon: 1_250_000,
      grossYieldPct: 4.3,
      status: "published",
      versionLabel: "v1 공개 중",
      updatedAt: "2026-11-28T00:00:00.000Z",
    };

    const noopRenderSlide = (s: BasicImSlideSummary) =>
      React.createElement("div", { key: s.id || s.no }, s.title);

    it("ImPreviewPane (published_clean) renders DealCard and Inbox handoff links for currentItem.buildingId", () => {
      render(
        React.createElement(ImPreviewPane, {
          currentItem: sampleImItem,
          previewLifecycle: "published_clean",
          previewTab: "mobile",
          isGenerating: false,
          isProvisioningSheet: false,
          activeUnitId: null,
          onFocusEditorUnit: vi.fn(),
          onQuickGenerate: vi.fn(),
          onOpenFullscreen: vi.fn(),
          cleanCoverTitle: "역삼동 코너 빌딩",
          address: "서울특별시 강남구 역삼동 823-14",
          askingPriceManwon: 1_250_000,
          calculatedYield: 4.3,
          postureKoreanLabel: "임대수익용",
          photoEntries: [],
          axiosHighlights: DEFAULT_IM_AXIOS_HIGHLIGHTS,
          postitStyles: {
            amber: { bg: "#FEF9C3", border: "#FDE047", badgeBg: "#FEF08A", badgeText: "#854D0E", label: "입지" },
            sky: { bg: "#E0F2FE", border: "#7DD3FC", badgeBg: "#BAE6FD", badgeText: "#075985", label: "수익" },
            mint: { bg: "#DCFCE7", border: "#86EFAC", badgeBg: "#BBF7D0", badgeText: "#166534", label: "가치" },
          },
          gfaSqm: "1719",
          completionDate: "2019-05-01",
          landAreaSqm: "479",
          zoning: "일반상업지역",
          rentRoll: [],
          totalDepositManwon: 80_000,
          totalRentManwon: 4_200,
          brokerageName: "한성빌딩부동산중개법인",
          brokerName: "박준영",
          brokerPhone: "010-3482-9104",
          handoverNote: "협의 가능",
          activeSlideFilter: "all",
          onChangeSlideFilter: vi.fn(),
          basicImSlides: [],
          renderSlideCard: noopRenderSlide,
        })
      );

      const handoff = screen.getByTestId("im-cross-door-handoff");
      expect(handoff).toBeDefined();

      expect(screen.getByTestId("im-handoff-dealcard-link").getAttribute("href")).toBe(
        "/broker/w/dealcards?buildingId=bld-test-1"
      );
      expect(screen.getByTestId("im-handoff-inbox-link").getAttribute("href")).toBe(
        "/broker/w/inbox?buildingId=bld-test-1"
      );
    });

    it("ImPreviewPane hides handoff links when previewLifecycle is live_draft", () => {
      render(
        React.createElement(ImPreviewPane, {
          currentItem: sampleImItem,
          previewLifecycle: "live_draft",
          previewTab: "mobile",
          isGenerating: false,
          isProvisioningSheet: false,
          activeUnitId: null,
          onFocusEditorUnit: vi.fn(),
          onQuickGenerate: vi.fn(),
          onOpenFullscreen: vi.fn(),
          cleanCoverTitle: "역삼동 코너 빌딩",
          address: "서울특별시 강남구 역삼동 823-14",
          askingPriceManwon: 1_250_000,
          calculatedYield: 4.3,
          postureKoreanLabel: "임대수익용",
          photoEntries: [],
          axiosHighlights: DEFAULT_IM_AXIOS_HIGHLIGHTS,
          postitStyles: {
            amber: { bg: "#FEF9C3", border: "#FDE047", badgeBg: "#FEF08A", badgeText: "#854D0E", label: "입지" },
            sky: { bg: "#E0F2FE", border: "#7DD3FC", badgeBg: "#BAE6FD", badgeText: "#075985", label: "수익" },
            mint: { bg: "#DCFCE7", border: "#86EFAC", badgeBg: "#BBF7D0", badgeText: "#166534", label: "가치" },
          },
          gfaSqm: "1719",
          completionDate: "2019-05-01",
          landAreaSqm: "479",
          zoning: "일반상업지역",
          rentRoll: [],
          totalDepositManwon: 80_000,
          totalRentManwon: 4_200,
          brokerageName: "한성빌딩부동산중개법인",
          brokerName: "박준영",
          brokerPhone: "010-3482-9104",
          handoverNote: "협의 가능",
          activeSlideFilter: "all",
          onChangeSlideFilter: vi.fn(),
          basicImSlides: [],
          renderSlideCard: noopRenderSlide,
        })
      );

      expect(screen.queryByTestId("im-cross-door-handoff")).toBeNull();
    });
  });

  // ── 3. Inbox inventory matching & outreach builder ──
  describe("3. Inbox Inventory Matching & Recommended Deal Outreach", () => {
    const inventory: BrokerInventoryDeal[] = [
      {
        buildingId: "bld-current",
        title: "현재 문의 빌딩 (제외 대상)",
        region: "강남구 역삼동",
        priceBand: "100~110억",
        askingPriceManwon: 1_050_000,
        capRatePct: 4.1,
        hasIm: true,
        status: "published",
      },
      {
        buildingId: "bld-deleted",
        title: "삭제 처리된 매물",
        region: "강남구 논현동",
        priceBand: "100~110억",
        askingPriceManwon: 1_050_000,
        capRatePct: 4.5,
        hasIm: true,
        isDeleted: true,
      },
      {
        buildingId: "bld-match-im",
        title: "강남구 역삼동 코너 근생",
        region: "강남구 역삼동",
        address: "서울 강남구 역삼동",
        priceBand: "100~120억",
        askingPriceManwon: 1_100_000,
        capRatePct: 4.4,
        hasIm: true,
        hasDealCard: true,
        status: "published",
      },
      {
        buildingId: "bld-match-dc",
        title: "강남구 삼성동 사옥용 빌딩",
        region: "강남구 삼성동",
        priceBand: "95~105억",
        askingPriceManwon: 1_000_000,
        capRatePct: 3.9,
        hasIm: false,
        hasDealCard: true,
        status: "sent",
      },
      {
        buildingId: "bld-mismatch",
        title: "마포구 합정동 소형 빌딩",
        region: "마포구 합정동",
        priceBand: "30~40억",
        askingPriceManwon: 350_000,
        capRatePct: 3.2,
        hasIm: false,
        status: "draft",
      },
    ];

    it("rankMatchingInventoryDeals excludes thread.buildingId & deleted items and ranks regional+budget matches first", () => {
      const ranked = rankMatchingInventoryDeals(
        {
          buildingId: "bld-current",
          preferredRegion: "강남구, 역삼동",
          preferredRegions: ["강남구"],
          budget: "100~120억",
          cleanMessage: "역삼동 쪽 110억대 수익형 검토 중입니다.",
        },
        inventory,
        3
      );

      expect(ranked.map((d) => d.buildingId)).not.toContain("bld-current");
      expect(ranked.map((d) => d.buildingId)).not.toContain("bld-deleted");
      expect(ranked).toHaveLength(3);
      expect(ranked[0].buildingId).toBe("bld-match-im");
      expect(ranked[1].buildingId).toBe("bld-match-dc");
      expect(ranked[2].buildingId).toBe("bld-mismatch");
    });

    it("buildRecommendedDealOutreach emits /im-lite/ for hasIm=true and /dc/ for hasIm=false", () => {
      const imOutreach = buildRecommendedDealOutreach(
        inventory[2],
        "김매수",
        "https://credeal.net"
      );
      expect(imOutreach.url).toBe("https://credeal.net/im-lite/bld-match-im");
      expect(imOutreach.brief).toContain("/im-lite/bld-match-im");
      expect(imOutreach.brief).toContain("김매수님");
      expect(imOutreach.headline).toContain("강남구 역삼동 코너 근생");

      const dcOutreach = buildRecommendedDealOutreach(inventory[3], "익명 열람객");
      expect(dcOutreach.url).toBe("/dc/bld-match-dc");
      expect(dcOutreach.brief).toContain("/dc/bld-match-dc");
      expect(dcOutreach.brief).toContain("고객님");
    });
  });

  // ── 4. Single-building cross-door projection continuity ──
  describe("4. Single-Building Cross-Door Projection Continuity (toPublicDealCard)", () => {
    it("masks exact street address, jibun, building name, and tenant names while preserving statutory broker disclosure parity", () => {
      const brokerProfileInput = {
        display_name: "박준영",
        company: "한성빌딩부동산중개법인",
        office_address: "서울특별시 강남구 테헤란로 318",
        office_reg_number: "11680-2025-04719",
        representative_name: "박준영",
        phone: "010-3482-9104",
        slug: "hanseong-cre",
        is_licensed: true,
      };

      const rawBuilding = {
        id: "bld-continuity-1",
        area_signal: "강남구 역삼동",
        asset_type: "근린생활시설",
        price_band: "120~130억",
        raw_address: "서울특별시 강남구 역삼동 823-14",
        road_address: "서울특별시 강남구 테헤란로 152",
        jibun_address: "서울특별시 강남구 역삼동 823-14",
        building_name: "호산당빌딩",
        land_area_sqm: 479,
        total_area_sqm: 1719,
        zoning: "일반상업지역",
        completion_date: "2019-05-01",
        lease_summary: {
          tenants: [{ tenant_name: "스타벅스역삼점" }],
        },
        layers: {
          card4: {
            ...SAMPLE_CARD4_CLEAN,
            headline: "역삼동 823-14 호산당빌딩 코너",
            points: [
              "테헤란로 152 대로변 코너",
              "1층 스타벅스역삼점 장기 입점",
              "안정적인 임대수익 구조",
            ],
          },
        },
      };

      const dto = toPublicDealCard({
        id: "bld-continuity-1",
        building: rawBuilding,
        signalCard: {
          title: "역삼동 823-14 매각",
          area_signal: "강남구 역삼동",
          asset_type: "근린생활시설",
          price_band: "120~130억",
        },
        teaserDoc: {
          body: {
            hookCopy: "호산당빌딩 테헤란로 152 우량 매물",
          },
        },
        brokerProfile: brokerProfileInput,
        hasImDoc: true,
        isPptxApproved: true,
        pptxDownloadUrl: "/api/public/im-lite/bld-continuity-1/pptx",
      });

      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain("823-14");
      expect(serialized).not.toContain("테헤란로 152");
      expect(serialized).not.toContain("호산당빌딩");
      expect(serialized).not.toContain("스타벅스역삼점");
      expect(serialized).toContain("●●●");

      // Statutory broker disclosure parity with SSOT sanitizer
      const statutory = extractSanitizedStatutoryItems(brokerProfileInput);
      expect(dto.broker.officeName).toBe(statutory.officeName);
      expect(dto.broker.officeAddress).toBe(statutory.officeAddress);
      expect(dto.broker.officeRegNumber).toBe(statutory.officeRegNumber);
      expect(dto.broker.representativeName).toBe(statutory.representativeName);
      expect(dto.broker.phone).toBe(statutory.phone);
      expect(dto.broker.isLicensed).toBe(true);
    });
  });
});
