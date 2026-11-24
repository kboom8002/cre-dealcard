"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  RentRollGrid,
  hasExistingRentRollData,
  type BuildingRegisterFloorItem,
} from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import {
  RentRollImporter,
  type RentRollImportPayload,
} from "@/components/broker/rent-roll-importer";
import { TERMS } from "@/lib/ux/lexicon";
import { ZeroBlankStarterCard } from "@/components/workspace/ZeroBlankStarterCard";
import { m2ToPyeong } from "@/domain/building/im-core/facts/area";
import {
  appendSecondaryLotsToAddress,
  removeSecondaryLotFromAddress,
  splitMultiParcelAddressPure,
} from "@/lib/address/multi-parcel-format";
import type { BrokerCompRowForm } from "@/domain/building/mobile-im/broker-extras";
import type { ImPostitStyle } from "./ImPreviewPane";
import {
  UUID_REGEX,
  formatPhoneHyphen,
  isSampleSeedImItem,
  resolveKnownTestAssetUrl,
  resolveRenderablePhotoSrc,
  type ImAxiosHighlight,
  type ImEditorTabKey,
  type ImListItem,
  type ImPhotoEntry,
} from "./im-workspace-types";

export interface ImEditorPanelsProps {
  currentItem: ImListItem | undefined;
  selectedId: string;
  activeEditorTab: ImEditorTabKey;
  onChangeEditorTab: (tab: ImEditorTabKey) => void;
  selectedItemActionsNode?: React.ReactNode;
  isProvisioningSheet: boolean;
  onOpenBottomSheet: () => void;
  isDownloadingPptx: boolean;
  actionAlert: string | null;
  actionAlertCode?: string | null;
  onClearActionAlert: () => void;
  onNotifyEditorFocus: (unitId: string) => void;
  onCreateNew: () => void;

  // Step 1: Specs & Price
  normalizedPosture: string;
  onChangePosture: (postureId: string) => void;
  imTitle: string;
  onChangeTitle: (next: string) => void;
  address: string;
  onChangeAddress: (next: string) => void;
  pnu?: string;
  isLookingUpAddress: boolean;
  onLookupAddress: (overrideAddress?: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcels?: any[];
  buildingFloors?: BuildingRegisterFloorItem[];
  askingPriceManwon: number;
  priceBandStr: string;
  formattedWonDisplay: string;
  onWonFocus: () => void;
  onWonBlur: () => void;
  onWonPriceChange: (rawText: string) => void;
  isPriceCalcOpen: boolean;
  onTogglePriceCalc: () => void;
  onSetDirectAskingPriceManwon: (nextPrice: number) => void;
  priceEokPart: number;
  priceManwonRemainder: number;
  onSplitPriceChange: (eok: number, man: number) => void;
  gfaSqm: string;
  onChangeGfaSqm: (next: string) => void;
  landAreaSqm: string;
  onChangeLandAreaSqm: (next: string) => void;
  onSwapGfaAndLand: () => void;
  zoning: string;
  onChangeZoning: (next: string) => void;
  completionDate: string;
  onChangeCompletionDate: (next: string) => void;

  // Step 2: Rent Roll
  rentRoll: RentRollRowItem[];
  onChangeRentRoll: (rows: RentRollRowItem[]) => void;
  expectedRentRoll?: RentRollRowItem[];
  onChangeExpectedRentRoll?: (rows: RentRollRowItem[]) => void;
  onCopyActualToExpectedRentRoll?: () => void;
  totalDepositManwon: number;
  totalRentManwon: number;
  calculatedYield: number;
  expectedDepositManwon?: number;
  expectedRentManwon?: number;
  expectedYieldPct?: number;
  isRentRollImportOpen: boolean;
  onToggleRentRollImport: () => void;
  onExcelRentRollImport: (payload: RentRollImportPayload) => void;
  onExpectedExcelRentRollImport?: (payload: RentRollImportPayload) => void;
  compRows?: BrokerCompRowForm[];
  onChangeCompRows?: (rows: BrokerCompRowForm[]) => void;

  // Step 3: Highlights & Broker Info
  axiosHighlights: ImAxiosHighlight[];
  onChangeAxiosHighlights: (next: ImAxiosHighlight[]) => void;
  postitStyles: Record<"amber" | "sky" | "mint", ImPostitStyle>;
  isAiPointsBusy: boolean;
  onReclusterImAxios: () => void;
  isBrokerSectionOpen: boolean;
  onToggleBrokerSection: () => void;
  onMarkBrokerSectionTouched: () => void;
  handoverNote: string;
  onChangeHandoverNote: (next: string) => void;
  brokerageName: string;
  onChangeBrokerageName: (next: string) => void;
  brokerName: string;
  onChangeBrokerName: (next: string) => void;
  brokerPhone: string;
  onChangeBrokerPhone: (next: string) => void;

  // Step 4: Photos & Publish
  photoEntries: ImPhotoEntry[];
  photoNames: string[];
  isDraggingPhotos: boolean;
  onSetDraggingPhotos: (dragging: boolean) => void;
  isCompressingPhotos: boolean;
  onFilesSelected: (files: File[], forcedCategory?: "exterior" | "interior") => void;
  onUpdatePhotoMeta?: (idx: number, patch: { caption?: string; category?: "exterior" | "interior" }) => void;
  onReorderPhoto?: (fromIdx: number, toIdx: number) => void;
  onRemovePhotoAtIndex: (entry: ImPhotoEntry, idx: number) => void;
  isGenerating: boolean;
  isShareLinkCopied?: boolean;
  generateButtonLabel: string;
  onQuickGenerate: () => void;
  onCopyShareLink?: () => void;
}

export function ImEditorPanels({
  currentItem,
  selectedId,
  activeEditorTab,
  onChangeEditorTab,
  selectedItemActionsNode,
  isProvisioningSheet,
  onOpenBottomSheet,
  isDownloadingPptx,
  actionAlert,
  actionAlertCode,
  onClearActionAlert,
  onNotifyEditorFocus,
  onCreateNew,
  normalizedPosture,
  onChangePosture,
  imTitle,
  onChangeTitle,
  address,
  onChangeAddress,
  pnu,
  isLookingUpAddress,
  onLookupAddress,
  parcels,
  buildingFloors,
  askingPriceManwon,
  priceBandStr,
  formattedWonDisplay,
  onWonFocus,
  onWonBlur,
  onWonPriceChange,
  isPriceCalcOpen,
  onTogglePriceCalc,
  onSetDirectAskingPriceManwon,
  priceEokPart,
  priceManwonRemainder,
  onSplitPriceChange,
  gfaSqm,
  onChangeGfaSqm,
  landAreaSqm,
  onChangeLandAreaSqm,
  onSwapGfaAndLand,
  zoning,
  onChangeZoning,
  completionDate,
  onChangeCompletionDate,
  rentRoll,
  onChangeRentRoll,
  expectedRentRoll = [],
  onChangeExpectedRentRoll,
  onCopyActualToExpectedRentRoll,
  totalDepositManwon,
  totalRentManwon,
  calculatedYield,
  expectedDepositManwon,
  expectedRentManwon,
  expectedYieldPct,
  isRentRollImportOpen,
  onToggleRentRollImport,
  onExcelRentRollImport,
  onExpectedExcelRentRollImport,
  compRows = [],
  onChangeCompRows,
  axiosHighlights,
  onChangeAxiosHighlights,
  postitStyles,
  isAiPointsBusy,
  onReclusterImAxios,
  isBrokerSectionOpen,
  onToggleBrokerSection,
  onMarkBrokerSectionTouched,
  handoverNote,
  onChangeHandoverNote,
  brokerageName,
  onChangeBrokerageName,
  brokerName,
  onChangeBrokerName,
  brokerPhone,
  onChangeBrokerPhone,
  photoEntries,
  photoNames,
  isDraggingPhotos,
  onSetDraggingPhotos,
  isCompressingPhotos,
  onFilesSelected,
  onUpdatePhotoMeta,
  onReorderPhoto,
  onRemovePhotoAtIndex,
  isGenerating,
  isShareLinkCopied = false,
  generateButtonLabel,
  onQuickGenerate,
  onCopyShareLink,
}: ImEditorPanelsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exteriorFileInputRef = useRef<HTMLInputElement>(null);
  const interiorFileInputRef = useRef<HTMLInputElement>(null);
  const [rentRollSubTab, setRentRollSubTab] = useState<"actual" | "expected">("actual");
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [isAddSubLotOpen, setIsAddSubLotOpen] = useState<boolean>(false);
  const [subLotDraft, setSubLotDraft] = useState<string>("");
  const [subLotHintError, setSubLotHintError] = useState<string | null>(null);
  const [manwonFocused, setManwonFocused] = useState<boolean>(false);
  const [expectedEmptyStepNotice, setExpectedEmptyStepNotice] = useState<boolean>(false);

  const allAxiosHighlightsEmpty = axiosHighlights.every(
    (h) => !(h.headline || "").trim() && !(h.brief || "").trim()
  );

  const parsedAddrLots = useMemo(
    () => splitMultiParcelAddressPure(address),
    [address]
  );

  const handleCommitSubLot = () => {
    if (!address.trim()) {
      setSubLotHintError("먼저 대표 주소(예: 서초구 잠원동 26-14)를 입력한 뒤 번지를 추가해 주세요.");
      return;
    }
    const { nextAddress, addedLots } = appendSecondaryLotsToAddress(address, subLotDraft);
    if (addedLots.length === 0) {
      setSubLotHintError("유효한 부속 번지 숫자(예: 26-16 또는 134, 125-2)를 입력해 주세요.");
      return;
    }
    setSubLotHintError(null);
    setSubLotDraft("");
    setIsAddSubLotOpen(false);
    onChangeAddress(nextAddress);
    onLookupAddress(nextAddress);
  };

  const handleRemoveSecondaryLot = (target: { lotLabel?: string; pnu?: string }) => {
    const nextAddr = removeSecondaryLotFromAddress(address, target);
    if (nextAddr.trim() === address.trim()) return;
    onChangeAddress(nextAddr);
    if (nextAddr.trim()) {
      onLookupAddress(nextAddr);
    }
  };
  const [isCompsSectionOpen, setIsCompsSectionOpen] = useState<boolean>(compRows.length > 0);
  const [isLoadingNearbyComps, setIsLoadingNearbyComps] = useState<boolean>(false);
  const [nearbyCompNotice, setNearbyCompNotice] = useState<string | null>(null);
  const [nearbyCompCandidates, setNearbyCompCandidates] = useState<
    Array<{
      id: string;
      location: string;
      dealDate: string;
      price_eok: number;
      land_area_pyeong?: number;
      gfa_pyeong?: number;
      land_price_per_pyeong_manwon?: number;
      building_use: string;
      note: string;
    }>
  >([]);
  const [dragZoneOver, setDragZoneOver] = useState<"exterior" | "interior" | null>(null);
  const [dragPhotoIdx, setDragPhotoIdx] = useState<number | null>(null);
  const [expandedPhotoKey, setExpandedPhotoKey] = useState<string | null>(null);
  const [brokenThumbMap, setBrokenThumbMap] = useState<Record<string, boolean>>({});
  const [starterHighlightAddress, setStarterHighlightAddress] = useState<boolean>(false);
  const [isExpectedImportOpen, setIsExpectedImportOpen] = useState<boolean>(false);

  const showSampleBanner = isSampleSeedImItem(
    currentItem ? { ...currentItem, address } : null
  );

  const computedExpectedDeposit = useMemo(() => {
    if (typeof expectedDepositManwon === "number") return expectedDepositManwon;
    return (
      Math.round(
        expectedRentRoll.reduce(
          (s, r) =>
            s + (r.status !== "vacant" && r.status !== "owner" ? Number(r.depositManwon ?? 0) : 0),
          0
        ) * 10
      ) / 10
    );
  }, [expectedDepositManwon, expectedRentRoll]);

  const computedExpectedRent = useMemo(() => {
    if (typeof expectedRentManwon === "number") return expectedRentManwon;
    return (
      Math.round(
        expectedRentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant" && r.status !== "owner" ? Number(r.monthlyRentManwon ?? 0) : 0),
          0
        ) * 10
      ) / 10
    );
  }, [expectedRentManwon, expectedRentRoll]);

  const hasExpectedData = hasExistingRentRollData(expectedRentRoll);

  const computedExpectedYield = useMemo(() => {
    if (typeof expectedYieldPct === "number") return expectedYieldPct;
    if (!askingPriceManwon || askingPriceManwon <= 0 || !hasExpectedData) return 0;
    const netInv = askingPriceManwon - computedExpectedDeposit;
    if (netInv <= 0 || computedExpectedRent <= 0) return 0;
    return ((computedExpectedRent * 12) / netInv) * 100;
  }, [
    expectedYieldPct,
    askingPriceManwon,
    hasExpectedData,
    computedExpectedDeposit,
    computedExpectedRent,
  ]);

  return (
    <div className="space-y-4 w-full" data-testid="im-editor-slot">
      <button
        type="button"
        data-testid="im-open-bottom-sheet-btn"
        disabled={isProvisioningSheet}
        onClick={onOpenBottomSheet}
        className="sr-only"
      >
        <span>{isProvisioningSheet ? "열고 있어요…" : "상세 입력 창 열기"}</span>
      </button>

      {isDownloadingPptx && (
        <div
          role="status"
          aria-live="polite"
          data-testid="im-pptx-downloading-banner"
          className="fixed bottom-24 right-5 z-50 px-4 py-3 rounded-2xl bg-[#0F172A] text-white text-sm font-extrabold shadow-xl border border-slate-700 flex items-center gap-2"
        >
          <span>📊 PPTX 자료 다운로드 중입니다...</span>
        </div>
      )}

      {actionAlert && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-base font-bold space-y-2.5"
        >
          <div>⚠ {actionAlert}</div>
          {(actionAlertCode === "STATUTORY_DISCLOSURE_INCOMPLETE" ||
            /공인중개사법|개설등록번호|법정 정보/.test(actionAlert)) && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/broker/profile"
                data-testid="im-statutory-profile-cta"
                className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-extrabold transition"
              >
                프로필에서 법정 표시사항 입력하기 →
              </a>
            </div>
          )}
        </div>
      )}

      {currentItem?.status === "published" && UUID_REGEX.test(currentItem.buildingId) && (
        <div
          data-testid="im-col2-published-url-bar"
          className="xl:hidden rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0 text-sm">
            <span className="font-extrabold text-emerald-900">✓ 공개 IM 발행됨</span>
            <a
              href={`/im-lite/${encodeURIComponent(currentItem.buildingId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#1D4ED8] underline truncate"
            >
              /im-lite/{currentItem.buildingId}
            </a>
          </div>
          {onCopyShareLink && (
            <button
              type="button"
              onClick={onCopyShareLink}
              data-testid="im-col2-copy-share-btn"
              className="min-h-[44px] px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-extrabold cursor-pointer shrink-0"
            >
              {isShareLinkCopied ? "✓ 링크 복사됨" : "링크 복사"}
            </button>
          )}
        </div>
      )}

      {!showSampleBanner &&
        !imTitle.trim() &&
        !address.trim() &&
        activeEditorTab === "specs" && (
          <ZeroBlankStarterCard
            testId="im-zero-blank-starter"
            heading="처음 작성하시는 매물인가요? 편한 순서부터 시작하세요"
            subheading="주소·엑셀·사진 중 가지고 계신 자료 1가지만 먼저 올리시면 나머지도 쉽게 채워집니다."
            options={[
              {
                id: "lookup_address",
                badge: "추천 1번",
                title: "🏢 매물 주소로 대장·토지 자동 조회",
                subtitle: "지번이나 도로명 주소를 넣으면 건축물대장·공시지가를 불러옵니다",
                testId: "im-starter-address-btn",
                onClick: () => {
                  onChangeEditorTab("specs");
                  onNotifyEditorFocus("im-unit-address");
                  setStarterHighlightAddress(true);
                  if (typeof window !== "undefined") {
                    window.requestAnimationFrame(() => {
                      const el = document.getElementById("im-address-input");
                      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                      el?.focus({ preventScroll: true });
                    });
                    window.setTimeout(() => setStarterHighlightAddress(false), 3200);
                  }
                },
              },
              {
                id: "upload_rentroll",
                badge: "엑셀 보유 시",
                title: "📊 엑셀 임대현황표 먼저 올리기",
                subtitle: "가지고 계신 임대차 내역표(.xlsx·.csv)나 표 텍스트를 바로 반영합니다",
                testId: "im-starter-rentroll-btn",
                onClick: () => {
                  onChangeEditorTab("rentroll");
                  if (!isRentRollImportOpen) {
                    onToggleRentRollImport();
                  }
                  if (typeof window !== "undefined") {
                    window.requestAnimationFrame(() => {
                      document
                        .querySelector('[data-testid="im-rentroll-xlsx-importer"]')
                        ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                    });
                  }
                },
              },
              {
                id: "upload_photos",
                badge: "사진 보유 시",
                title: "📷 현장 사진 먼저 올리기",
                subtitle: "외관·내부 사진을 올리면 표지와 사진 슬라이드에 자동 배치됩니다",
                testId: "im-starter-photos-btn",
                onClick: () => {
                  onChangeEditorTab("media_publish");
                  if (typeof window !== "undefined") {
                    window.requestAnimationFrame(() => {
                      document
                        .querySelector('[data-testid="im-tab-panel-photos"]')
                        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                    });
                  }
                },
              },
            ]}
          />
        )}

      {/* Top 4 Primary Tabs */}
      <div
        role="tablist"
        aria-label="IM 작성 단계"
        data-testid="im-editor-primary-tabs"
        className="sticky top-2 z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl bg-slate-200/95 backdrop-blur-xs border border-slate-300 shadow-xs"
      >
        {(
          [
            {
              id: "specs",
              label: "① 표지·기본정보",
              sub: "제목·주소·희망가",
              done: Boolean(address.trim() && askingPriceManwon > 0),
            },
            {
              id: "rentroll",
              label: "② 층별 임대현황",
              sub: `총 ${rentRoll.length}층·엑셀 불러오기`,
              done: rentRoll.some(
                (r) =>
                  (r.depositManwon || 0) > 0 ||
                  (r.monthlyRentManwon || 0) > 0 ||
                  r.status === "owner"
              ),
            },
            {
              id: "axios_brief",
              label: "③ 장점 3가지",
              sub: "장점 3가지·중개의견",
              done:
                axiosHighlights.filter((h) => h.headline.trim().length > 0).length >= 3,
            },
            {
              id: "media_publish",
              label: "④ 사진·위치·만들기",
              sub: `사진 ${photoNames.length}장`,
              done: photoNames.length > 0 || currentItem?.status === "published",
            },
          ] as const
        ).map((tab) => {
          const isActive = activeEditorTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`im-editor-tab-${tab.id}`}
              onClick={() => {
                onClearActionAlert();
                onChangeEditorTab(tab.id);
              }}
              className={`min-h-[56px] px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer min-w-0 overflow-hidden ${
                isActive
                  ? "bg-[#0F172A] text-white shadow-sm"
                  : "bg-white/90 text-slate-800 hover:bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-extrabold leading-tight break-keep">
                  {tab.label}
                </span>
                {tab.done && (
                  <span
                    className={`text-sm font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isActive
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    ✓ 완료
                  </span>
                )}
              </div>
              <div
                className={`text-sm mt-0.5 font-medium break-keep ${
                  isActive ? "text-amber-300" : "text-slate-600"
                }`}
              >
                {tab.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1 PANEL: ① 표지·핵심제원 ── */}
      <div
        data-testid="im-tab-panel-specs"
        className={
          activeEditorTab === "specs"
            ? "bg-white rounded-xl border border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <h2 className="text-xl font-extrabold text-[#0F172A]">건물 기본 정보</h2>
          {activeEditorTab === "specs" && selectedItemActionsNode}
        </div>

        {showSampleBanner && (
          <div
            data-testid="im-sample-seed-banner"
            className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="text-sm font-semibold text-amber-950">
              💡 처음 둘러보기를 위한 <strong>[체험 예시]</strong> 매물입니다. 실제 매물과 혼동하지 않도록 새 매물을 추가해 주세요.
            </div>
            <button
              type="button"
              data-testid="im-reset-sample-btn"
              onClick={onCreateNew}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-extrabold transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              🔄 새 매물 입력
            </button>
          </div>
        )}

        {/* 카드 A: 매물 유형 및 표지 제목 */}
        <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-4">
          <div
            className="space-y-2.5"
            data-testid="im-posture-selector-section"
            onFocusCapture={() => onNotifyEditorFocus("im-unit-cover")}
          >
            <span className="block text-base font-extrabold text-[#0F172A]">
              어떤 매물인가요?
            </span>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
              role="group"
              aria-label="어떤 매물인가요?"
            >
              {(
                [
                  {
                    id: "core_income",
                    norm: "income",
                    title: "임대수익용",
                    desc: "안정적인 월세 수익",
                  },
                  {
                    id: "owner_occupier",
                    norm: "owner_occupied",
                    title: "사옥용",
                    desc: "직접 입주·주차·접근성",
                  },
                  {
                    id: "development",
                    norm: "development",
                    title: "신축·개발용",
                    desc: "리모델링·신축·토지 활용",
                  },
                ] as const
              ).map((opt) => {
                const active = normalizedPosture === opt.norm;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangePosture(opt.id)}
                    className={`min-h-[56px] px-4 py-3 rounded-xl border-2 text-left transition cursor-pointer ${
                      active
                        ? "bg-blue-50 text-blue-950 border-blue-600 ring-1 ring-blue-200 shadow-2xs"
                        : "bg-white text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-base font-extrabold">
                      <span>{opt.title}</span>
                      {active && (
                        <span className="text-sm font-extrabold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          ✓ 선택
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-sm mt-0.5 ${
                        active ? "text-blue-800 font-semibold" : "text-slate-600"
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="space-y-1.5 pt-2 border-t border-slate-200/80"
            data-testid="im-cover-title-section"
            onFocusCapture={() => onNotifyEditorFocus("im-unit-cover")}
          >
            <label
              htmlFor="im-title-single-line-input"
              className="block text-base font-bold text-[#0F172A]"
            >
              표지 제목
            </label>
            <input
              id="im-title-single-line-input"
              type="text"
              data-testid="im-title-single-line-input"
              value={imTitle}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder="비워 두면 주소에 맞춰 자동 입력됩니다 (예: 마포구 서교동 근생빌딩)"
              className="w-full min-h-[48px] px-3.5 text-lg font-extrabold rounded-xl bg-white border border-slate-300 focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none shadow-2xs"
            />
          </div>
        </div>

        {/* 카드 B: 희망 매매가 (억 · 만원 기본 + 원 단위 보조 + 단위 오기 가드) */}
        <div
          className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-3"
          data-testid="im-price-section"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-cover")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-extrabold text-[#0F172A]">
              희망 매매가 (억 · 만원 단위) <span className="text-[#991B1B]">*</span>
            </span>
            <div className="flex items-center gap-2">
              <span
                className="text-base font-extrabold text-[#1D4ED8]"
                data-testid="im-price-readout"
              >
                {formatKoreanCurrencyReadout(askingPriceManwon)}
              </span>
              <span className="text-sm font-semibold text-[#065F46] bg-[#D1FAE5] px-2.5 py-0.5 rounded">
                구간: {priceBandStr}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="im-price-eok-input"
                className="text-sm font-extrabold text-slate-800 shrink-0"
              >
                억 단위
              </label>
              <input
                id="im-price-eok-input"
                type="number"
                min={0}
                data-testid="im-price-eok-input"
                value={priceEokPart || ""}
                onChange={(e) =>
                  onSplitPriceChange(Number(e.target.value), priceManwonRemainder)
                }
                placeholder="예: 77"
                className="w-full min-h-[48px] px-3.5 text-lg font-extrabold tabular-nums rounded-xl bg-white border-2 border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none shadow-2xs"
              />
              <span className="text-base font-extrabold text-slate-900 shrink-0">
                억 원
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="im-price-man-input"
                className="text-sm font-extrabold text-slate-800 shrink-0"
              >
                만원 단위
              </label>
              <input
                id="im-price-man-input"
                type="number"
                min={0}
                max={9999}
                data-testid="im-price-man-input"
                value={
                  priceManwonRemainder > 0
                    ? priceManwonRemainder
                    : manwonFocused || priceEokPart <= 0
                    ? priceManwonRemainder || ""
                    : "0"
                }
                onFocus={(e) => {
                  setManwonFocused(true);
                  if (priceManwonRemainder > 0) {
                    e.currentTarget.select();
                  }
                }}
                onBlur={() => setManwonFocused(false)}
                onChange={(e) =>
                  onSplitPriceChange(priceEokPart, Number(e.target.value))
                }
                placeholder={priceEokPart > 0 ? "0 (만원 단위 없음)" : "0"}
                className={`w-full min-h-[48px] px-3.5 text-lg font-extrabold tabular-nums rounded-xl bg-white border focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none shadow-2xs ${
                  priceEokPart > 0 && priceManwonRemainder === 0
                    ? "border-slate-400 text-slate-900 placeholder:text-slate-600 placeholder:font-semibold"
                    : "border-slate-300 text-slate-900"
                }`}
              />
              <span className="text-base font-extrabold text-slate-900 shrink-0">
                만 원
              </span>
            </div>
          </div>

          {askingPriceManwon >= 1 && askingPriceManwon < 10_000 && (
            <div
              data-testid="im-price-unit-warning"
              className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm text-amber-950 font-bold"
            >
              <span>
                ⚠️ 현재{" "}
                <strong>
                  {formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}
                </strong>
                으로 입력되어 있습니다. 혹시 &lsquo;만원&rsquo; 기준으로 입력하셨나요?
              </span>
              {askingPriceManwon * 10_000 <= 50_000_000 && (
                <button
                  type="button"
                  data-testid="im-price-unit-fix-btn"
                  onClick={() =>
                    onSetDirectAskingPriceManwon(Math.round(askingPriceManwon * 10_000))
                  }
                  className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold cursor-pointer shrink-0"
                >
                  {formatKoreanCurrencyReadout(
                    Math.round(askingPriceManwon * 10_000)
                  ).replace(/^=\s*/, "")}
                  으로 변경
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <div className="relative flex-1 flex items-center gap-2">
              <label
                htmlFor="im-price-won-input"
                className="text-sm font-bold text-slate-600 shrink-0"
              >
                &lsquo;원&rsquo; 직접 입력
              </label>
              <input
                id="im-price-won-input"
                type="text"
                inputMode="numeric"
                data-testid="im-price-won-input"
                value={formattedWonDisplay}
                onFocus={onWonFocus}
                onBlur={onWonBlur}
                onChange={(e) => onWonPriceChange(e.target.value)}
                placeholder="예: 7,700,000,000 (원 단위 붙여넣기 가능)"
                className="w-full min-h-[44px] px-3 text-sm font-bold tabular-nums rounded-xl border border-slate-300 bg-white focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
              />
              <span className="text-sm font-bold text-slate-700 shrink-0">원</span>
            </div>
            <button
              type="button"
              data-testid="im-price-calculator-toggle"
              aria-expanded={isPriceCalcOpen}
              onClick={onTogglePriceCalc}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-sm font-bold cursor-pointer shrink-0 whitespace-nowrap transition-colors"
            >
              {isPriceCalcOpen ? "간편 금액 버튼 접기 ▴" : "간편 금액 버튼 ▾"}
            </button>
          </div>

          <div
            data-testid="im-price-calculator-panel"
            className={
              isPriceCalcOpen
                ? "p-3 rounded-xl bg-white border border-slate-200 space-y-2.5"
                : "hidden"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: "+100억", addManwon: 1000000 },
                { label: "+10억", addManwon: 100000 },
                { label: "+1억", addManwon: 10000 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() =>
                    onSetDirectAskingPriceManwon(
                      (askingPriceManwon || 0) + btn.addManwon
                    )
                  }
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-sm font-extrabold cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onSetDirectAskingPriceManwon(0)}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-bold cursor-pointer"
              >
                0원 초기화
              </button>
            </div>

            <div className="sr-only">
              <input
                id="im-asking-price-input"
                type="number"
                data-testid="im-asking-price-input"
                value={askingPriceManwon || ""}
                onChange={(e) =>
                  onSetDirectAskingPriceManwon(Number(e.target.value))
                }
                placeholder="총액(만원): 950000"
                aria-label="희망 매매가 총액(만원 단위)"
              />
            </div>
          </div>
        </div>

        {/* 카드 C: 건물 주소 및 공부 제원 */}
        <div
          data-highlighted={starterHighlightAddress ? "true" : undefined}
          className={`p-4 rounded-2xl border space-y-4 transition-all ${
            starterHighlightAddress
              ? "bg-blue-50/60 border-[#1D4ED8] ring-4 ring-blue-400/40"
              : "bg-[#F8FAFC] border-slate-200"
          }`}
        >
          {starterHighlightAddress && (
            <div
              data-testid="im-starter-address-guide"
              className="rounded-xl bg-[#1D4ED8] text-white px-3.5 py-2 text-sm font-extrabold"
            >
              👇 아래 칸에 주소를 붙여넣고 [주소로 건물 정보 자동 채우기] 버튼을 누르세요
            </div>
          )}
          <div
            className="space-y-1.5"
            data-testid="im-address-section"
            onFocusCapture={() => onNotifyEditorFocus("im-unit-location")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="im-address-input"
                className="block text-base font-extrabold text-[#0F172A]"
              >
                건물 주소 <span className="text-[#991B1B]">*</span>
              </label>
              <button
                type="button"
                data-testid="im-address-lookup-btn"
                disabled={isLookingUpAddress}
                onClick={() => onLookupAddress()}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-sm font-extrabold transition cursor-pointer"
              >
                {isLookingUpAddress ? "불러오는 중…" : "주소로 건물 정보 자동 채우기"}
              </button>
            </div>
            <input
              id="im-address-input"
              type="text"
              data-testid="im-address-input"
              value={address}
              onChange={(e) => onChangeAddress(e.target.value)}
              placeholder="예: 서울특별시 서초구 잠원동 26-14, 26-16 (여러 번지는 쉼표 또는 '외 2필지')"
              className="w-full min-h-[48px] px-3.5 text-lg rounded-xl bg-white border border-slate-300 focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none shadow-2xs"
            />
            <div
              data-testid="im-multiparcel-helper-bar"
              className="flex flex-wrap items-center justify-between gap-2 pt-0.5"
            >
              <span className="text-sm font-medium text-slate-600">
                여러 필지 매물은 쉼표(<code className="font-semibold text-slate-800">26-14, 26-16</code>)나{" "}
                <code className="font-semibold text-slate-800">외 2필지</code>로 적으면 대지면적·공시지가가 자동 합산됩니다.
              </span>
              <button
                type="button"
                data-testid="im-add-subparcel-toggle-btn"
                onClick={() => {
                  setSubLotHintError(null);
                  setIsAddSubLotOpen((prev) => !prev);
                }}
                className="min-h-[40px] shrink-0 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-800 transition cursor-pointer"
              >
                {isAddSubLotOpen ? "닫기" : "+ 부속 번지 추가"}
              </button>
            </div>
            {isAddSubLotOpen && (
              <div
                data-testid="im-add-subparcel-form"
                className="mt-1.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    data-testid="im-add-subparcel-input"
                    value={subLotDraft}
                    onChange={(e) => {
                      setSubLotDraft(e.target.value);
                      if (subLotHintError) setSubLotHintError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCommitSubLot();
                      }
                    }}
                    placeholder="추가할 번지 입력 (예: 26-16 또는 134, 125-2)"
                    aria-label="추가할 부속 번지"
                    className="min-w-[200px] flex-1 min-h-[44px] rounded-lg border border-blue-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                  />
                  <button
                    type="button"
                    data-testid="im-add-subparcel-submit-btn"
                    disabled={isLookingUpAddress}
                    onClick={handleCommitSubLot}
                    className="min-h-[44px] rounded-lg bg-[#1D4ED8] hover:bg-blue-800 px-4 py-2 text-sm font-extrabold text-white transition disabled:opacity-50 cursor-pointer"
                  >
                    번지 추가·조회
                  </button>
                </div>
                {subLotHintError && (
                  <p role="alert" className="text-sm font-bold text-[#991B1B]">
                    {subLotHintError}
                  </p>
                )}
              </div>
            )}
            {!(Array.isArray(parcels) && parcels.length >= 2) &&
              parsedAddrLots.secondaryLots.length > 0 && (
                <div
                  data-testid="im-pending-subparcels-strip"
                  className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-700"
                >
                  <span className="font-bold text-slate-800">입력된 부속 번지:</span>
                  {parsedAddrLots.secondaryLots.map((lot) => (
                    <span
                      key={lot.label}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-800"
                    >
                      <span>{lot.label}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSecondaryLot({ lotLabel: lot.label })}
                        aria-label={`${lot.label} 번지 제외`}
                        className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            {Array.isArray(parcels) && parcels.length >= 2 && (
              <div
                data-testid="im-multiparcel-summary"
                className="mt-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2.5 text-sm text-[#1E3A8A] space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold">
                    여러 필지 자동 합산 ({parcels.length}개 필지)
                  </span>
                  <span className="text-sm font-semibold text-[#1D4ED8]">
                    합산 경계와 평균 공시지가가 자동 반영됩니다
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {parcels.map((p: any, idx: number) => {
                    const jibunLabel =
                      p?.jibun ||
                      (typeof p?.pnu === "string" && /^\d{19}$/.test(p.pnu)
                        ? `${parseInt(p.pnu.slice(11, 15), 10)}${
                            parseInt(p.pnu.slice(15, 19), 10) > 0
                              ? `-${parseInt(p.pnu.slice(15, 19), 10)}`
                              : ""
                          }`
                        : `필지 ${idx + 1}`);
                    const catLabel = p?.landCategory ? ` · ${p.landCategory}` : "";
                    const areaLabel =
                      typeof p?.areaM2 === "number" && p.areaM2 > 0
                        ? ` · ${Number(p.areaM2).toLocaleString()}㎡`
                        : "";
                    return (
                      <span
                        key={p?.pnu || idx}
                        className="inline-flex items-center gap-1 rounded-md bg-white border border-[#93C5FD] px-2.5 py-1 text-sm font-semibold text-[#0F172A] tabular-nums"
                      >
                        <span>
                          {jibunLabel}
                          {catLabel}
                          {areaLabel}
                        </span>
                        {idx >= 1 && (
                          <button
                            type="button"
                            data-testid={`im-remove-subparcel-btn-${idx}`}
                            onClick={() =>
                              handleRemoveSecondaryLot({
                                lotLabel: jibunLabel,
                                pnu: typeof p?.pnu === "string" ? p.pnu : undefined,
                              })
                            }
                            aria-label={`${jibunLabel} 번지 제외`}
                            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-blue-100 hover:text-[#991B1B] cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        <div
          data-testid="im-building-specs-section"
          className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3.5"
        >
          <div onFocusCapture={() => onNotifyEditorFocus("im-unit-building")}>
            <div className="min-h-[28px] flex items-center justify-between mb-1">
              <label htmlFor="im-gfa-input" className="text-sm font-bold text-[#334155]">
                연면적 (㎡)
              </label>
              {Number(String(gfaSqm || "").replace(/,/g, "")) > 0 && (
                <span
                  data-testid="im-gfa-pyeong-badge"
                  className="text-sm font-extrabold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded"
                >
                  약{" "}
                  {Math.round(
                    m2ToPyeong(Number(String(gfaSqm || "").replace(/,/g, "")))
                  ).toLocaleString()}
                  평
                </span>
              )}
            </div>
            <input
              id="im-gfa-input"
              type="number"
              data-testid="im-gfa-input"
              value={gfaSqm}
              onChange={(e) => onChangeGfaSqm(e.target.value)}
              placeholder="예: 1450.2"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
            />
          </div>
          <div onFocusCapture={() => onNotifyEditorFocus("im-unit-land")}>
            <div className="min-h-[28px] flex items-center justify-between mb-1">
              <label
                htmlFor="im-land-area-input"
                className="text-sm font-bold text-[#334155]"
              >
                대지면적 (㎡)
              </label>
              {Number(String(landAreaSqm || "").replace(/,/g, "")) > 0 && (
                <span
                  data-testid="im-land-pyeong-badge"
                  className="text-sm font-extrabold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded"
                >
                  약{" "}
                  {Math.round(
                    m2ToPyeong(Number(String(landAreaSqm || "").replace(/,/g, "")))
                  ).toLocaleString()}
                  평
                </span>
              )}
            </div>
            <input
              id="im-land-area-input"
              type="number"
              data-testid="im-land-area-input"
              value={landAreaSqm}
              onChange={(e) => onChangeLandAreaSqm(e.target.value)}
              placeholder="예: 420.5"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
            />
          </div>
          <div onFocusCapture={() => onNotifyEditorFocus("im-unit-land")}>
            <div className="min-h-[28px] flex items-center justify-between mb-1">
              <label
                htmlFor="im-zoning-input"
                className="text-sm font-bold text-[#334155]"
              >
                용도지역
              </label>
            </div>
            <input
              id="im-zoning-input"
              type="text"
              data-testid="im-zoning-input"
              value={zoning}
              onChange={(e) => onChangeZoning(e.target.value)}
              placeholder="예: 제3종일반주거지역"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
            />
          </div>
          <div onFocusCapture={() => onNotifyEditorFocus("im-unit-building")}>
            <div className="min-h-[28px] flex items-center justify-between mb-1">
              <label
                htmlFor="im-completion-date-input"
                className="text-sm font-bold text-[#334155]"
              >
                준공일 (사용승인일)
              </label>
            </div>
            <input
              id="im-completion-date-input"
              type="text"
              data-testid="im-completion-date-input"
              value={completionDate}
              onChange={(e) => onChangeCompletionDate(e.target.value)}
              placeholder="예: 2018-06-15"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
            />
          </div>
        </div>

        {Number(gfaSqm) > 0 &&
          Number(landAreaSqm) > 0 &&
          Number(gfaSqm) < Number(landAreaSqm) && (
            <div
              data-testid="im-area-swap-warning"
              className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-sm text-amber-950 font-semibold"
            >
              <span>
                ⚠️ 연면적({gfaSqm}㎡)이 대지면적({landAreaSqm}㎡)보다 작게 입력되었습니다. 두 칸의 순서가 바뀌었는지 확인해 주세요.
              </span>
              <button
                type="button"
                data-testid="im-area-swap-btn"
                onClick={onSwapGfaAndLand}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold cursor-pointer shrink-0"
              >
                ⇄ 연면적·대지면적 값 서로 바꾸기
              </button>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">
            {!address.trim() || askingPriceManwon <= 0
              ? "💡 건물 주소와 희망 매매가를 입력하면 다음 단계로 넘어갈 수 있습니다."
              : "✓ 기본 정보 입력이 완료되었습니다."}
          </span>
          <button
            type="button"
            data-testid="im-next-to-rentroll-btn"
            disabled={!address.trim() || askingPriceManwon <= 0}
            onClick={() => {
              onClearActionAlert();
              onChangeEditorTab("rentroll");
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (② 층별 임대현황) →
          </button>
        </div>
      </div>

      {/* ── TAB 2 PANEL: ② 층별 임대 현황 ── */}
      <div
        data-testid="im-tab-panel-rentroll"
        className={
          activeEditorTab === "rentroll"
            ? "bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-4 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-[#0F172A]">층별 임대차 현황</h2>
            <div
              data-testid="im-rentroll-summary-badges"
              className="flex flex-wrap items-center gap-1.5 text-sm font-bold"
            >
              {rentRollSubTab === "expected" ? (
                <>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-950">
                    기대 전환 보증금{" "}
                    {formatKoreanCurrencyReadout(computedExpectedDeposit).replace(
                      /^=\s*/,
                      ""
                    ) || "0원"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900">
                    기대 월세{" "}
                    {formatKoreanCurrencyReadout(computedExpectedRent).replace(/^=\s*/, "") ||
                      "0원"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900">
                    기대 연 {computedExpectedYield.toFixed(2)}%
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                    현행 연 {calculatedYield.toFixed(2)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                    보증금{" "}
                    {formatKoreanCurrencyReadout(totalDepositManwon).replace(
                      /^=\s*/,
                      ""
                    ) || "0원"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900">
                    월세{" "}
                    {formatKoreanCurrencyReadout(totalRentManwon).replace(/^=\s*/, "") ||
                      "0원"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900">
                    연 {calculatedYield.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          </div>
          {activeEditorTab === "rentroll" && selectedItemActionsNode}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div
            role="tablist"
            aria-label="임대차 현황 구분"
            className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={rentRollSubTab === "actual"}
              data-testid="im-rentroll-subtab-actual"
              onClick={() => setRentRollSubTab("actual")}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-extrabold border transition-all cursor-pointer ${
                rentRollSubTab === "actual"
                  ? "bg-white text-slate-950 shadow-sm border-slate-300"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/70 border-transparent"
              }`}
            >
              📊 현행 임대차 현황 ({rentRoll.length}행)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rentRollSubTab === "expected"}
              data-testid="im-rentroll-subtab-expected"
              onClick={() => setRentRollSubTab("expected")}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-extrabold border transition-all cursor-pointer ${
                rentRollSubTab === "expected"
                  ? "bg-white text-slate-950 shadow-sm border-slate-300"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/70 border-transparent"
              }`}
            >
              ✨ 기대수익률 임대차 현황{" "}
              {hasExpectedData ? `(${expectedRentRoll.length}행 · 별도 면 반영)` : "(선택)"}
            </button>
          </div>
          {rentRollSubTab === "expected" && onCopyActualToExpectedRentRoll && (
            <button
              type="button"
              data-testid="im-expected-rentroll-copy-btn"
              onClick={onCopyActualToExpectedRentRoll}
              className="ml-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-sm font-extrabold cursor-pointer transition-colors"
            >
              현행 현황에서 복사
            </button>
          )}
        </div>

        {rentRollSubTab === "actual" ? (
          <>
            <div
              className={isRentRollImportOpen ? "block" : "hidden"}
              data-testid="im-rentroll-xlsx-importer"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const droppedFile = e.dataTransfer?.files?.[0];
                if (!droppedFile) return;
                const fileInput = e.currentTarget.querySelector(
                  'input[data-testid="rentroll-file-input"]'
                ) as HTMLInputElement | null;
                if (fileInput && typeof DataTransfer !== "undefined") {
                  const dt = new DataTransfer();
                  dt.items.add(droppedFile);
                  fileInput.files = dt.files;
                  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }}
            >
              <RentRollImporter
                key={currentItem?.id || selectedId}
                hideTextMode
                hasExistingData={hasExistingRentRollData(rentRoll)}
                askingPriceManwon={askingPriceManwon}
                onImport={onExcelRentRollImport}
              />
            </div>

            <div onFocusCapture={() => onNotifyEditorFocus("im-unit-rentroll")}>
              <RentRollGrid
                rows={rentRoll}
                onChange={onChangeRentRoll}
                floorsAbove={currentItem?.floorsAbove}
                floorsBelow={currentItem?.floorsBelow}
                buildingFloors={buildingFloors}
                askingPriceManwon={askingPriceManwon}
                extraToolbarAction={
                  <button
                    type="button"
                    data-testid="im-rentroll-import-toggle"
                    aria-expanded={isRentRollImportOpen}
                    onClick={onToggleRentRollImport}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-slate-900 text-sm font-extrabold cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <span>
                      {isRentRollImportOpen
                        ? "📁 엑셀 파일 접기 ▴"
                        : "📁 엑셀 파일 불러오기 ▾"}
                    </span>
                  </button>
                }
              />
            </div>
          </>
        ) : (
          <div className="space-y-3" data-testid="im-expected-rentroll-panel">
            <div className="rounded-xl bg-blue-50/70 border border-blue-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-800">
              <span className="font-semibold break-keep">
                공실 해소·임대조건 정상화 후 가정을 입력하면 IM <strong>기대수익률 임대차 현황</strong> 슬라이드와 <strong>기대수익률</strong>이 자동 반영됩니다. 엑셀(.xlsx·.csv)은 <strong>[📁 엑셀 파일 불러오기 ▾]</strong>를, 복사한 표는 파란 <strong>[📋 표 붙여넣기]</strong> 버튼만 누르세요.
              </span>
              {expectedRentRoll.length > 0 && onChangeExpectedRentRoll && (
                <button
                  type="button"
                  onClick={() => onChangeExpectedRentRoll([])}
                  className="min-h-[44px] px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  초기화
                </button>
              )}
            </div>
            {onExpectedExcelRentRollImport && (
              <div
                className={isExpectedImportOpen ? "block" : "hidden"}
                data-testid="im-expected-rentroll-xlsx-importer"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const droppedFile = e.dataTransfer?.files?.[0];
                  if (!droppedFile) return;
                  const fileInput = e.currentTarget.querySelector(
                    'input[data-testid="rentroll-file-input"]'
                  ) as HTMLInputElement | null;
                  if (fileInput && typeof DataTransfer !== "undefined") {
                    const dt = new DataTransfer();
                    dt.items.add(droppedFile);
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                }}
              >
                <RentRollImporter
                  key={`expected-${currentItem?.id || selectedId}`}
                  hideTextMode
                  hasExistingData={hasExistingRentRollData(expectedRentRoll)}
                  askingPriceManwon={askingPriceManwon}
                  onImport={(payload) => {
                    onExpectedExcelRentRollImport(payload);
                    setIsExpectedImportOpen(false);
                  }}
                />
              </div>
            )}
            <RentRollGrid
              rows={expectedRentRoll}
              onChange={(rows) => onChangeExpectedRentRoll?.(rows)}
              floorsAbove={currentItem?.floorsAbove}
              floorsBelow={currentItem?.floorsBelow}
              buildingFloors={buildingFloors}
              askingPriceManwon={askingPriceManwon}
              disableAutoScaffold={true}
              extraToolbarAction={
                onExpectedExcelRentRollImport ? (
                  <button
                    type="button"
                    data-testid="im-expected-rentroll-import-toggle"
                    aria-expanded={isExpectedImportOpen}
                    onClick={() => setIsExpectedImportOpen((prev) => !prev)}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-slate-900 text-sm font-extrabold cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <span>
                      {isExpectedImportOpen
                        ? "📁 엑셀 파일 접기 ▴"
                        : "📁 엑셀 파일 불러오기 ▾"}
                    </span>
                  </button>
                ) : undefined
              }
            />
          </div>
        )}

        {/* 선택: 인근 실거래 비교 (1건 이상 선택/입력 시에만 IM에 노출) */}
        <div
          data-testid="im-comps-selector-section"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-comps")}
          className="rounded-2xl border border-slate-200 bg-[#F8FAFC] overflow-hidden"
        >
          <button
            type="button"
            data-testid="im-comps-toggle-btn"
            aria-expanded={isCompsSectionOpen}
            onClick={() => setIsCompsSectionOpen((prev) => !prev)}
            className="w-full min-h-[48px] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-slate-100/80 transition cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-[#0F172A]">
                인근 실거래 비교 (선택)
              </span>
              <span className="text-sm font-extrabold px-2 py-0.5 rounded-full bg-white border border-slate-300 text-slate-700">
                {compRows.length > 0
                  ? `${compRows.length}건 선택됨 · IM 반영`
                  : "0건 · 미선택 시 IM에서 자동 숨김"}
              </span>
            </div>
            <span className="text-sm font-bold text-[#1D4ED8]">
              {isCompsSectionOpen ? "접기 ▴" : "공공 실거래 선택 · 직접 추가 ▾"}
            </span>
          </button>

          {isCompsSectionOpen && (
            <div className="p-4 border-t border-slate-200 bg-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600 font-medium break-keep">
                  인근 유사 매각 사례를 선택하거나 직접 입력하면 IM 미리보기와 발표자료에 비교 면이 자동 추가됩니다.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="im-fetch-nearby-comps-btn"
                    disabled={isLoadingNearbyComps}
                    onClick={async () => {
                      setIsLoadingNearbyComps(true);
                      setNearbyCompNotice(null);
                      try {
                        const qs = new URLSearchParams();
                        if (pnu) qs.set("pnu", pnu);
                        if (address.trim()) qs.set("address", address.trim());
                        const res = await fetch(
                          `/api/broker/im-lite/nearby-comps?${qs.toString()}`
                        );
                        const data = await res.json().catch(() => null);
                        if (res.ok && Array.isArray(data?.items)) {
                          setNearbyCompCandidates(data.items);
                          if (data.items.length === 0) {
                            setNearbyCompNotice(
                              data.message ||
                                "최근 3개월 내 조회된 인근 통건물 실거래가 없습니다."
                            );
                          }
                        } else {
                          setNearbyCompNotice("인근 실거래를 불러오지 못했습니다.");
                        }
                      } catch {
                        setNearbyCompNotice("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
                      } finally {
                        setIsLoadingNearbyComps(false);
                      }
                    }}
                    className="min-h-[44px] px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 text-sm font-extrabold cursor-pointer"
                  >
                    {isLoadingNearbyComps ? "조회 중…" : "🔍 공공 실거래 사례 불러오기"}
                  </button>
                  <button
                    type="button"
                    data-testid="im-add-manual-comp-btn"
                    onClick={() => {
                      onChangeCompRows?.([
                        ...compRows,
                        {
                          kind: "transaction",
                          location: "",
                          price_eok: "",
                          land_price_per_pyeong_manwon: "",
                          note: "",
                          land_area_pyeong: "",
                          as_of: "",
                        },
                      ]);
                    }}
                    className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 text-sm font-extrabold cursor-pointer"
                  >
                    + 직접 추가
                  </button>
                </div>
              </div>

              {nearbyCompNotice && (
                <div className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {nearbyCompNotice}
                </div>
              )}

              {nearbyCompCandidates.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-2.5 space-y-1.5 max-h-56 overflow-y-auto">
                  <div className="text-sm font-extrabold text-blue-950 px-1">
                    국토교통부 상업·업무용 실거래 (체크하여 비교 목록에 반영)
                  </div>
                  {nearbyCompCandidates.map((cand, cIdx) => {
                    const checked = compRows.some(
                      (r) =>
                        r.location === cand.location &&
                        r.price_eok === String(cand.price_eok) &&
                        (r.as_of || "") === cand.dealDate
                    );
                    return (
                      <label
                        key={cand.id}
                        data-testid={`im-nearby-comp-checkbox-${cIdx}`}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200 hover:border-blue-400 cursor-pointer text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onChangeCompRows?.([
                                  ...compRows,
                                  {
                                    kind: "transaction",
                                    location: cand.location,
                                    price_eok: String(cand.price_eok),
                                    land_price_per_pyeong_manwon: cand.land_price_per_pyeong_manwon
                                      ? String(cand.land_price_per_pyeong_manwon)
                                      : "",
                                    note: cand.note,
                                    land_area_pyeong: cand.land_area_pyeong
                                      ? String(cand.land_area_pyeong)
                                      : "",
                                    gfa_pyeong: cand.gfa_pyeong ? String(cand.gfa_pyeong) : "",
                                    as_of: cand.dealDate,
                                    selected: true,
                                  },
                                ]);
                              } else {
                                onChangeCompRows?.(
                                  compRows.filter(
                                    (r) =>
                                      !(
                                        r.location === cand.location &&
                                        r.price_eok === String(cand.price_eok) &&
                                        (r.as_of || "") === cand.dealDate
                                      )
                                  )
                                );
                              }
                            }}
                            className="h-4 w-4 rounded accent-[#1D4ED8]"
                          />
                          <span className="font-bold text-slate-900 truncate">
                            {cand.location}
                          </span>
                          <span className="text-slate-500 shrink-0">{cand.dealDate}</span>
                        </div>
                        <div className="font-extrabold text-[#1D4ED8] shrink-0 tabular-nums">
                          {cand.price_eok}억
                          {cand.land_price_per_pyeong_manwon
                            ? ` (평당 ${cand.land_price_per_pyeong_manwon.toLocaleString()}만)`
                            : ""}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {compRows.length > 0 && (
                <div className="space-y-2">
                  {compRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-1.5 items-center rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-sm"
                    >
                      <input
                        type="text"
                        placeholder="소재지 (예: 동교동 188-4)"
                        value={row.location}
                        onChange={(e) => {
                          const next = compRows.map((r, i) =>
                            i === idx ? { ...r, location: e.target.value } : r
                          );
                          onChangeCompRows?.(next);
                        }}
                        className="col-span-4 min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white font-semibold"
                      />
                      <input
                        type="text"
                        placeholder="거래가(억)"
                        value={row.price_eok}
                        onChange={(e) => {
                          const next = compRows.map((r, i) =>
                            i === idx ? { ...r, price_eok: e.target.value } : r
                          );
                          onChangeCompRows?.(next);
                        }}
                        className="col-span-2 min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white text-right font-bold"
                      />
                      <input
                        type="text"
                        placeholder="대지평당(만)"
                        value={row.land_price_per_pyeong_manwon}
                        onChange={(e) => {
                          const next = compRows.map((r, i) =>
                            i === idx
                              ? { ...r, land_price_per_pyeong_manwon: e.target.value }
                              : r
                          );
                          onChangeCompRows?.(next);
                        }}
                        className="col-span-2 min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white text-right font-semibold"
                      />
                      <input
                        type="text"
                        placeholder="거래일/특이사항"
                        value={row.note}
                        onChange={(e) => {
                          const next = compRows.map((r, i) =>
                            i === idx ? { ...r, note: e.target.value } : r
                          );
                          onChangeCompRows?.(next);
                        }}
                        className="col-span-3 min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChangeCompRows?.(compRows.filter((_, i) => i !== idx))
                        }
                        aria-label="비교 사례 삭제"
                        className="col-span-1 min-h-[44px] rounded-lg text-rose-700 hover:bg-rose-50 font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-axios-btn"
            onClick={() => {
              onClearActionAlert();
              onChangeEditorTab("axios_brief");
              setExpectedEmptyStepNotice(!hasExpectedData);
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (③ 장점 3가지) →
          </button>
        </div>
      </div>

      {/* ── TAB 3 PANEL: ③ 핵심 장점·중개의견 ── */}
      <div
        data-testid="im-tab-panel-axios-brief"
        className={
          activeEditorTab === "axios_brief"
            ? "bg-white rounded-xl border border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        {expectedEmptyStepNotice && !hasExpectedData && (
          <div
            data-testid="im-expected-empty-step-notice"
            role="status"
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start justify-between gap-3 text-sm font-semibold text-blue-950"
          >
            <span className="leading-relaxed">
              ✓ 현행 임대차 기준으로 ③ 장점 3가지 단계로 이동했습니다. (선택 사항인 기대수익률 임대차는 필요할 때 언제든 ②단계 상단 탭에서 추가할 수 있습니다.)
            </span>
            <button
              type="button"
              data-testid="im-expected-empty-step-notice-dismiss"
              aria-label="안내 닫기"
              onClick={() => setExpectedEmptyStepNotice(false)}
              className="min-h-[44px] min-w-[44px] -my-1.5 -mr-1.5 inline-flex items-center justify-center rounded-lg text-blue-800 hover:bg-blue-100 text-base font-extrabold cursor-pointer shrink-0 transition-colors"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              핵심 장점 3가지 · 담당 중개사 안내
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              명사형 종결 개조식으로 자동 작성되며, 요약 슬라이드에는 <strong>소제목 + 상세 설명</strong>이 함께 표시됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeEditorTab === "axios_brief" && selectedItemActionsNode}
            <button
              type="button"
              data-testid="im-axios-ai-recluster-btn"
              disabled={isAiPointsBusy}
              aria-busy={isAiPointsBusy}
              onClick={onReclusterImAxios}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white text-sm font-extrabold shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>{isAiPointsBusy ? TERMS.aiWriting : TERMS.aiWriteButton}</span>
            </button>
          </div>
        </div>

        {allAxiosHighlightsEmpty && (
          <div
            data-testid="im-axios-empty-ai-banner"
            className="rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-4 sm:p-5 space-y-3 shadow-2xs"
          >
            <p className="text-base font-extrabold text-slate-950 leading-snug">
              비어 있는 장점 3가지를 입력된 건물·수익률 데이터로 3초 만에 자동 작성할 수 있습니다
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="im-axios-empty-ai-btn"
                disabled={isAiPointsBusy}
                aria-busy={isAiPointsBusy}
                onClick={onReclusterImAxios}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-700 to-blue-700 hover:from-purple-800 hover:to-blue-800 disabled:opacity-60 text-white text-base font-extrabold shadow-sm transition cursor-pointer inline-flex items-center gap-2"
              >
                <span>
                  {isAiPointsBusy
                    ? TERMS.aiWriting
                    : "✨ 건물·수익률 정보로 장점 3가지 자동 작성하기"}
                </span>
              </button>
            </div>
            <p className="text-sm font-medium text-slate-700 leading-relaxed">
              직접 적거나 [AI로 쓰기]를 누르지 않아도, 다음 ④단계에서 [IM 만들기]를 누르면 기본 요약이 함께 채워집니다.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {axiosHighlights.map((item, idx) => {
            const style = postitStyles[item.tone] || postitStyles.amber;
            const handleSyncHeadlineFromBrief = () => {
              const rawBrief = (item.brief || "").trim();
              if (!rawBrief) return;
              const firstSeg = rawBrief
                .split(/[.。\n·—]|,\s+/)[0]
                .replace(/^[•·\-*]\s*/, "")
                .trim()
                .slice(0, 28);
              if (!firstSeg) return;
              const next = axiosHighlights.map((h, i) =>
                i === idx ? { ...h, headline: firstSeg } : h
              );
              onChangeAxiosHighlights(next);
            };
            return (
              <div
                key={idx}
                data-testid={`im-axios-postit-${idx}`}
                onFocusCapture={() => onNotifyEditorFocus(`im-unit-highlight-${idx}`)}
                style={{ backgroundColor: style.bg, borderColor: style.border }}
                className="rounded-xl border border-l-4 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                      포인트 0{idx + 1} 가이드 · 슬라이드 미표시
                    </span>
                    <span
                      style={{ backgroundColor: style.badgeBg, color: style.badgeText }}
                      className="text-sm font-extrabold px-2 py-0.5 rounded"
                    >
                      {style.label}
                    </span>
                  </div>
                  <span
                    data-testid={`im-axios-point-char-count-${idx}`}
                    className="text-sm font-semibold text-slate-600 tabular-nums"
                  >
                    {(item.brief || "").length}/300자
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`im-axios-point-title-${idx}`}
                      className="text-sm font-extrabold text-slate-700"
                    >
                      요약 소제목 (슬라이드 굵게 표시됨)
                    </label>
                    {item.brief?.trim() && (
                      <button
                        type="button"
                        onClick={handleSyncHeadlineFromBrief}
                        className="min-h-[44px] inline-flex items-center px-2 text-sm font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                      >
                        ↻ 본문 요약으로 소제목 맞춤
                      </button>
                    )}
                  </div>
                  <input
                    id={`im-axios-point-title-${idx}`}
                    type="text"
                    maxLength={60}
                    data-testid={`im-axios-point-title-${idx}`}
                    value={item.headline}
                    onChange={(e) => {
                      const next = axiosHighlights.map((h, i) =>
                        i === idx ? { ...h, headline: e.target.value } : h
                      );
                      onChangeAxiosHighlights(next);
                    }}
                    className="w-full min-h-[44px] px-3.5 text-base sm:text-lg font-extrabold text-slate-950 bg-white rounded-lg border border-slate-400/80 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="핵심 장점 소제목 (예: 홍대입구역 도보 4분 역세권 코너)"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`im-axios-point-brief-${idx}`}
                    className="text-sm font-extrabold text-slate-700 block"
                  >
                    상세 설명 (개조식 표시됨 · 예: ~확보, ~기대)
                  </label>
                  <textarea
                    id={`im-axios-point-brief-${idx}`}
                    rows={2}
                    maxLength={300}
                    data-testid={`im-axios-point-brief-${idx}`}
                    value={item.brief}
                    onChange={(e) => {
                      const next = axiosHighlights.map((h, i) =>
                        i === idx ? { ...h, brief: e.target.value.slice(0, 300) } : h
                      );
                      onChangeAxiosHighlights(next);
                    }}
                    className="w-full px-3.5 py-2 text-base font-medium text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                    placeholder="매수자가 주목할 핵심 근거를 간결한 개조식으로 적어 주세요"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-200 space-y-3">
          <button
            type="button"
            data-testid="im-broker-handover-toggle"
            aria-expanded={isBrokerSectionOpen}
            onClick={() => {
              onMarkBrokerSectionTouched();
              onToggleBrokerSection();
            }}
            className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-[#CBD5E1] text-left text-sm font-extrabold text-[#0F172A] flex flex-wrap items-center justify-between gap-2 cursor-pointer transition-colors"
          >
            <span>
              {isBrokerSectionOpen
                ? "담당 중개사 · 명도 조건 접기 ▴"
                : brokerName.trim() || brokerPhone.trim()
                ? `담당 중개사 · 명도 조건 (${brokerName.trim() || "입력됨"}) · 수정 ▾`
                : "담당 중개사 · 명도 조건 입력 ▾"}
            </span>
            {!isBrokerSectionOpen &&
              (brokerageName.trim() || brokerPhone.trim()) && (
                <span className="text-sm font-semibold text-slate-600 truncate">
                  {[brokerageName.trim(), brokerPhone.trim()]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
          </button>

          <div
            data-testid="im-broker-handover-panel"
            onFocusCapture={() => {
              onMarkBrokerSectionTouched();
              onNotifyEditorFocus("im-unit-broker");
            }}
            className={isBrokerSectionOpen ? "space-y-4 pt-1" : "hidden"}
          >
            <div>
              <label
                htmlFor="im-handover-note-input"
                className="block text-base font-bold text-[#334155] mb-1.5"
              >
                명도 및 인도 조건
              </label>
              <textarea
                id="im-handover-note-input"
                rows={2}
                data-testid="im-handover-note-input"
                value={handoverNote}
                onChange={(e) => onChangeHandoverNote(e.target.value)}
                placeholder="예: 현 임대차 승계 또는 잔금 시 명도 협의 가능"
                className="w-full p-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
              />
            </div>

            <div
              className="bg-slate-50 rounded-2xl border border-[#CBD5E1] p-4 space-y-4"
              data-testid="im-broker-info-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-base text-[#0F172A]">
                  담당 공인중개사 정보
                </div>
                <span className="text-sm font-semibold text-slate-600">
                  💡 내 프로필 정보가 기본 적용되며, 칸을 클릭하면 바로 바꿀 수 있습니다
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="im-brokerage-name-input"
                    className="block text-sm font-semibold text-[#334155] mb-1"
                  >
                    중개법인 / 사무소명
                  </label>
                  <input
                    id="im-brokerage-name-input"
                    type="text"
                    data-testid="im-brokerage-name-input"
                    value={brokerageName}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => onChangeBrokerageName(e.target.value)}
                    placeholder="예: 크리딜 부동산중개법인"
                    className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="im-broker-name-input"
                    className="block text-sm font-semibold text-[#334155] mb-1"
                  >
                    담당 공인중개사 성명
                  </label>
                  <input
                    id="im-broker-name-input"
                    type="text"
                    data-testid="im-broker-name-input"
                    value={brokerName}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => onChangeBrokerName(e.target.value)}
                    placeholder="예: 김크리 대표공인중개사"
                    className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="im-broker-phone-input"
                    className="block text-sm font-semibold text-[#334155] mb-1"
                  >
                    문의 연락처
                  </label>
                  <input
                    id="im-broker-phone-input"
                    type="tel"
                    data-testid="im-broker-phone-input"
                    value={brokerPhone}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      onChangeBrokerPhone(formatPhoneHyphen(e.target.value))
                    }
                    placeholder="예: 010-2345-6789"
                    className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-media-btn"
            onClick={() => {
              onClearActionAlert();
              onChangeEditorTab("media_publish");
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (④ 사진·위치·만들기) →
          </button>
        </div>
      </div>

      {/* ── TAB 4 PANEL: ④ 사진·지적도·발행 ── */}
      <div
        data-testid="im-tab-panel-media-publish"
        className={
          activeEditorTab === "media_publish"
            ? "bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <h2 className="text-xl font-extrabold text-[#0F172A]">건물 사진 첨부 · 발행</h2>
          {activeEditorTab === "media_publish" && selectedItemActionsNode}
        </div>

        <div
          data-testid="im-photo-dropzone"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-photos")}
          onPaste={(e) => {
            const clipboardFiles: File[] = [];
            const items = Array.from(e.clipboardData?.items || []);
            items.forEach((it, idx) => {
              if (it.kind === "file" && it.type.startsWith("image/")) {
                const blob = it.getAsFile();
                if (blob) {
                  clipboardFiles.push(
                    new File([blob], `roadview_${Date.now()}_${idx}.png`, {
                      type: blob.type || "image/png",
                    })
                  );
                }
              }
            });
            if (clipboardFiles.length === 0 && e.clipboardData?.files?.length) {
              Array.from(e.clipboardData.files).forEach((f, idx) => {
                if (f.type.startsWith("image/")) {
                  clipboardFiles.push(
                    new File([f], `roadview_${Date.now()}_${idx}.png`, {
                      type: f.type || "image/png",
                    })
                  );
                }
              });
            }
            if (clipboardFiles.length > 0) {
              e.preventDefault();
              onFilesSelected(clipboardFiles, "exterior");
              setPasteNotice(`로드뷰/외부 사진 ${clipboardFiles.length}장을 붙여넣었습니다.`);
              setTimeout(() => setPasteNotice(null), 4000);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingPhotos) onSetDraggingPhotos(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSetDraggingPhotos(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSetDraggingPhotos(false);
            const droppedFiles = Array.from(e.dataTransfer?.files || []).filter(
              (f) =>
                f.type.startsWith("image/") ||
                /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)
            );
            if (droppedFiles.length > 0) {
              onFilesSelected(droppedFiles);
            }
          }}
          data-compressing={isCompressingPhotos ? "true" : "false"}
          className={`p-5 rounded-2xl border-2 border-dashed space-y-4 transition-colors ${
            isDraggingPhotos
              ? "bg-blue-50 border-[#1D4ED8]"
              : "bg-[#FAF9F5] border-[#64748B]"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold text-[#334155] break-keep">
              외부·내부 사진을 구분해 올려 주세요 (0장일 때는 위성·지적 위치도가 자동 삽입됩니다)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  onFilesSelected(files);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              data-testid="im-photo-select-btn"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 bg-white border border-[#64748B] rounded-xl text-sm font-bold text-[#0F172A] hover:bg-[#F3F2EE] cursor-pointer"
            >
              + 전체 사진 일괄 선택
            </button>
          </div>

          {pasteNotice && (
            <div
              data-testid="im-photo-paste-notice"
              className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-900"
            >
              ✓ {pasteNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div
              data-testid="im-photo-dropzone-exterior"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragZoneOver !== "exterior") setDragZoneOver("exterior");
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragZoneOver((prev) => (prev === "exterior" ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragZoneOver(null);
                const droppedFiles = Array.from(e.dataTransfer?.files || []).filter(
                  (f) =>
                    f.type.startsWith("image/") ||
                    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)
                );
                if (droppedFiles.length > 0) {
                  onFilesSelected(droppedFiles, "exterior");
                }
              }}
              className={`rounded-xl border-2 border-dashed p-3.5 space-y-2.5 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition-colors ${
                dragZoneOver === "exterior"
                  ? "border-blue-600 bg-blue-50/90"
                  : "border-blue-300 bg-white hover:border-blue-400"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-[#0F172A]">
                  외부·전경 사진 (1번 = 대표 외관)
                </span>
                <span className="text-sm font-bold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded">
                  드래그 · Ctrl+V
                </span>
              </div>
              <div
                onClick={() => exteriorFileInputRef.current?.click()}
                className="rounded-lg bg-[#F8FAFC] border border-dashed border-blue-200 px-3 py-3 text-center text-sm text-slate-600 cursor-pointer hover:bg-blue-50/50"
              >
                {dragZoneOver === "exterior"
                  ? "여기에 놓으면 외부 사진으로 즉시 추가됩니다"
                  : "파일을 여기로 끌어다 놓거나 클릭하여 여러 장 선택하세요"}
              </div>
              <input
                ref={exteriorFileInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    onFilesSelected(files, "exterior");
                  }
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                data-testid="im-photo-select-exterior-btn"
                onClick={() => exteriorFileInputRef.current?.click()}
                className="w-full min-h-[44px] px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-blue-300 text-sm font-extrabold text-[#1E3A8A] hover:bg-blue-100 cursor-pointer"
              >
                + 외부·전경 사진 파일 선택
              </button>
            </div>

            <div
              data-testid="im-photo-dropzone-interior"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragZoneOver !== "interior") setDragZoneOver("interior");
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragZoneOver((prev) => (prev === "interior" ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragZoneOver(null);
                const droppedFiles = Array.from(e.dataTransfer?.files || []).filter(
                  (f) =>
                    f.type.startsWith("image/") ||
                    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)
                );
                if (droppedFiles.length > 0) {
                  onFilesSelected(droppedFiles, "interior");
                }
              }}
              className={`rounded-xl border-2 border-dashed p-3.5 space-y-2.5 transition-colors ${
                dragZoneOver === "interior"
                  ? "border-blue-600 bg-blue-50/90"
                  : "border-slate-300 bg-white hover:border-slate-400"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-[#0F172A]">
                  내부·층별 사진
                </span>
                <span className="text-sm font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  각 2장+ 슬라이드 분리
                </span>
              </div>
              <div
                onClick={() => interiorFileInputRef.current?.click()}
                className="rounded-lg bg-[#F8FAFC] border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-600 cursor-pointer hover:bg-slate-100/70"
              >
                {dragZoneOver === "interior"
                  ? "여기에 놓으면 내부 사진으로 즉시 추가됩니다"
                  : "로비·승강기·매장 내부 사진을 끌어다 놓거나 클릭하세요"}
              </div>
              <input
                ref={interiorFileInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    onFilesSelected(files, "interior");
                  }
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                data-testid="im-photo-select-interior-btn"
                onClick={() => interiorFileInputRef.current?.click()}
                className="w-full min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-sm font-extrabold text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                + 내부·층별 사진 파일 선택
              </button>
            </div>
          </div>

          {(photoEntries.length > 0 || photoNames.length > 0) && (() => {
            const resolvedPhotos: ImPhotoEntry[] =
              photoEntries.length > 0
                ? photoEntries
                : photoNames.map(
                    (n, idx): ImPhotoEntry => ({
                      id: `legacy-${idx}-${n}`,
                      name: n,
                      url: resolveKnownTestAssetUrl(n),
                      category: idx === 0 ? "exterior" : "interior",
                    })
                  );
            const firstTwelve = resolvedPhotos.slice(0, 12);
            const extCount = firstTwelve.filter(
              (p, i) => p.category === "exterior" || (!p.category && i === 0)
            ).length;
            const intCount = firstTwelve.length - extCount;
            const pptSlideCount =
              (extCount >= 2 && intCount >= 2) || firstTwelve.length > 6 ? 2 : 1;

            return (
              <div className="space-y-3 pt-2 text-left">
                <div
                  data-testid="im-photo-slide-allocation-banner"
                  className="rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-sm font-bold text-[#1E3A8A] flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    📄 현재 총 {resolvedPhotos.length}장 (외부 {extCount} · 내부 {intCount}) → 발표자료(PPT) 사진 {pptSlideCount}면({firstTwelve.length}장)으로 자동 배치됩니다
                  </span>
                  {resolvedPhotos.length > 12 && (
                    <span className="text-sm font-semibold text-amber-900">
                      모바일 IM에는 {resolvedPhotos.length}장 전체가 보이며, 발표자료(PPT)에는 앞쪽 12장까지 실립니다
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {resolvedPhotos.map((entry, idx, arr) => {
                const name = entry.name;
                const thumbSrc = resolveRenderablePhotoSrc(entry);
                const isExt = entry.category === "exterior" || (!entry.category && idx === 0);
                const defaultCap = isExt
                  ? idx === 0
                    ? "전면 외관(대표)"
                    : `외관 전경 ${idx + 1}`
                  : `내부 공간 ${idx + 1}`;
                const captionChips = isExt
                  ? [
                      "전면 외관(대표)",
                      "코너·측면 외관",
                      "주출입구",
                      "접면 도로·상권",
                      "주차장 외관",
                      "옥상·루프탑",
                    ]
                  : [
                      "1층 로비·출입구",
                      "승강기 홀",
                      "기준층 내부",
                      "1층 매장 내부",
                      "지층 매장 내부",
                      "공용부·화장실",
                    ];
                const cardKey = entry.id || `${name}-${idx}`;
                const isCardExpanded = expandedPhotoKey === cardKey;
                return (
                  <div
                    key={cardKey}
                    data-testid={`im-photo-card-${idx}`}
                    draggable={Boolean(onReorderPhoto)}
                    onDragStart={() => setDragPhotoIdx(idx)}
                    onDragOver={(e) => {
                      if (dragPhotoIdx !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (dragPhotoIdx !== null && dragPhotoIdx !== idx) {
                        e.preventDefault();
                        e.stopPropagation();
                        onReorderPhoto?.(dragPhotoIdx, idx);
                      }
                      setDragPhotoIdx(null);
                    }}
                    onDragEnd={() => setDragPhotoIdx(null)}
                    className={`p-3 rounded-xl bg-white border space-y-2.5 transition ${
                      dragPhotoIdx === idx
                        ? "border-blue-500 ring-2 ring-blue-200 opacity-75"
                        : "border-[#CBD5E1]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {thumbSrc && !brokenThumbMap[`${cardKey}::${thumbSrc}`] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbSrc}
                            alt={name}
                            onError={(e) => {
                              const fallback = resolveKnownTestAssetUrl(name);
                              const origin =
                                typeof window !== "undefined"
                                  ? window.location.origin
                                  : "";
                              if (
                                fallback &&
                                e.currentTarget.src !== fallback &&
                                e.currentTarget.src !== origin + fallback
                              ) {
                                e.currentTarget.src = fallback;
                              } else {
                                setBrokenThumbMap((prev) => ({
                                  ...prev,
                                  [`${cardKey}::${thumbSrc}`]: true,
                                }));
                              }
                            }}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div
                            data-testid={`im-photo-fallback-${idx}`}
                            className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0"
                          >
                            사진
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-sm font-extrabold px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                                isExt
                                  ? "bg-blue-50 text-[#1D4ED8]"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {isExt ? "외부·전경" : "내부·층별"}
                            </span>
                            <span className="text-sm font-bold text-[#0F172A] truncate">
                              {entry.caption?.trim() || defaultCap}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-slate-500 truncate">
                            {name}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`im-photo-edit-toggle-${idx}`}
                        aria-expanded={isCardExpanded}
                        onClick={() =>
                          setExpandedPhotoKey((prev) => (prev === cardKey ? null : cardKey))
                        }
                        className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm font-bold text-[#0F172A] hover:bg-slate-100 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        {isCardExpanded ? "접기" : "편집"}
                      </button>
                    </div>

                    {isCardExpanded && (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {onUpdatePhotoMeta && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdatePhotoMeta(idx, {
                                    category: isExt ? "interior" : "exterior",
                                  })
                                }
                                className="min-h-[44px] inline-flex items-center px-2.5 rounded-md text-sm font-bold text-[#1D4ED8] hover:bg-blue-50 cursor-pointer"
                              >
                                {isExt ? "내부로 변경" : "외부로 변경"}
                              </button>
                            )}
                            {onReorderPhoto && (
                              <>
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    data-testid={`im-photo-make-hero-${idx}`}
                                    onClick={() => {
                                      if (!isExt && onUpdatePhotoMeta) {
                                        onUpdatePhotoMeta(idx, { category: "exterior" });
                                      }
                                      onReorderPhoto(idx, 0);
                                    }}
                                    className="min-h-[44px] inline-flex items-center px-2.5 rounded-md text-sm font-extrabold border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                                  >
                                    ★ 1번 대표로
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => onReorderPhoto(idx, idx - 1)}
                                  title="앞으로 이동"
                                  className="min-h-[44px] min-w-[44px] px-2 rounded-md text-sm font-bold border border-slate-200 text-slate-700 disabled:opacity-30 hover:bg-slate-100 cursor-pointer"
                                >
                                  ←
                                </button>
                                <button
                                  type="button"
                                  disabled={idx >= arr.length - 1}
                                  onClick={() => onReorderPhoto(idx, idx + 1)}
                                  title="뒤로 이동"
                                  className="min-h-[44px] min-w-[44px] px-2 rounded-md text-sm font-bold border border-slate-200 text-slate-700 disabled:opacity-30 hover:bg-slate-100 cursor-pointer"
                                >
                                  →
                                </button>
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemovePhotoAtIndex(entry, idx)}
                            className="min-h-[44px] px-3 text-sm text-[#991B1B] font-extrabold hover:bg-red-50 rounded-lg cursor-pointer shrink-0"
                            aria-label={`${name} 삭제`}
                          >
                            삭제
                          </button>
                        </div>
                        <input
                          type="text"
                          aria-label={`${name} 캡션`}
                          data-testid={`im-photo-caption-input-${idx}`}
                          value={entry.caption ?? ""}
                          placeholder={defaultCap}
                          onChange={(e) =>
                            onUpdatePhotoMeta?.(idx, { caption: e.target.value })
                          }
                          className="w-full min-h-[44px] px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50/70 text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                        />
                        {onUpdatePhotoMeta && (
                          <div className="pt-0.5">
                            <select
                              aria-label={`${name} 빠른 캡션 선택`}
                              data-testid={`im-photo-caption-select-${idx}`}
                              value={captionChips.includes(entry.caption || "") ? entry.caption : ""}
                              onChange={(e) => {
                                if (e.target.value) {
                                  onUpdatePhotoMeta(idx, { caption: e.target.value });
                                }
                              }}
                              className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                            >
                              <option value="">빠른 캡션 선택...</option>
                              {captionChips.map((chipText) => (
                                <option key={chipText} value={chipText}>
                                  {chipText}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </div>
            );
          })()}
        </div>

        <div
          data-testid="im-step4-footer-cta-bar"
          className="hidden xl:flex p-4 rounded-xl bg-blue-50/60 border border-blue-200 flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-base font-extrabold text-[#0F172A] break-keep">
              입력을 마쳤다면 바로 IM을 만들어 보세요
            </p>
            <p className="text-sm text-[#475569] break-keep">
              모바일 IM 링크와 10면 발표자료가 함께 준비됩니다. 완료 후 [🔗 IM 링크 복사]로 바로 전달할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="im-step4-generate-btn"
              disabled={isGenerating}
              aria-busy={isGenerating}
              onClick={onQuickGenerate}
              className="min-h-[52px] px-6 py-3 bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 text-white rounded-xl font-extrabold text-base transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            >
              <span>{generateButtonLabel}</span>
            </button>
            {onCopyShareLink && (
              <button
                type="button"
                data-testid="im-step4-copy-link-btn"
                disabled={isGenerating || isProvisioningSheet}
                onClick={onCopyShareLink}
                className={`min-h-[52px] px-4 py-3 rounded-xl font-extrabold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer border shrink-0 whitespace-nowrap ${
                  isShareLinkCopied
                    ? "bg-emerald-600 text-white border-emerald-700"
                    : "bg-white hover:bg-emerald-50 text-emerald-950 border-emerald-400"
                }`}
              >
                <span>
                  {isShareLinkCopied ? "✓ IM 링크 복사됨" : "🔗 IM 링크 복사"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
