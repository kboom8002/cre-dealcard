"use client";

import React, { useRef } from "react";
import { RentRollGrid } from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import {
  RentRollImporter,
  type RentRollImportPayload,
} from "@/components/broker/rent-roll-importer";
import { TERMS } from "@/lib/ux/lexicon";
import { ZeroBlankStarterCard } from "@/components/workspace/ZeroBlankStarterCard";
import { m2ToPyeong } from "@/domain/building/im-core/facts/area";
import type { ImPostitStyle } from "./ImPreviewPane";
import {
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
  selectedItemActionsNode: React.ReactNode;
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
  isLookingUpAddress: boolean;
  onLookupAddress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcels?: any[];
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
  totalDepositManwon: number;
  totalRentManwon: number;
  calculatedYield: number;
  isRentRollImportOpen: boolean;
  onToggleRentRollImport: () => void;
  onExcelRentRollImport: (payload: RentRollImportPayload) => void;

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
  onFilesSelected: (files: File[]) => void;
  onRemovePhotoAtIndex: (entry: ImPhotoEntry, idx: number) => void;
  isGenerating: boolean;
  generateButtonLabel: string;
  onQuickGenerate: () => void;
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
  isLookingUpAddress,
  onLookupAddress,
  parcels,
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
  totalDepositManwon,
  totalRentManwon,
  calculatedYield,
  isRentRollImportOpen,
  onToggleRentRollImport,
  onExcelRentRollImport,
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
  onRemovePhotoAtIndex,
  isGenerating,
  generateButtonLabel,
  onQuickGenerate,
}: ImEditorPanelsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showSampleBanner = isSampleSeedImItem(
    currentItem ? { ...currentItem, address } : null
  );

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
                  if (typeof document !== "undefined") {
                    document.getElementById("im-address-input")?.focus();
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
          <h2 className="text-xl font-extrabold text-[#0F172A]">① 건물 기본 정보</h2>
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

        <div
          className="p-4 rounded-xl bg-[#FAF9F5] border border-[#CBD5E1] space-y-2.5"
          data-testid="im-posture-selector-section"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-cover")}
        >
          <span className="block text-base font-extrabold text-[#0F172A]">
            {TERMS.postureSectionTitle}
          </span>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            role="group"
            aria-label={TERMS.postureSectionTitle}
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
                  className={`min-h-[56px] px-4 py-3 rounded-lg border-2 text-left transition cursor-pointer ${
                    active
                      ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                      : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-base font-extrabold">{opt.title}</div>
                  <div
                    className={`text-sm mt-0.5 ${
                      active ? "text-blue-100" : "text-slate-600"
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
          className="space-y-1.5"
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
            className="w-full min-h-[48px] px-3.5 text-lg font-extrabold rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        <div
          className="space-y-1.5"
          data-testid="im-address-section"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-location")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="im-address-input"
              className="block text-base font-bold text-[#0F172A]"
            >
              1. 건물 주소 <span className="text-[#991B1B]">*</span>
            </label>
            <button
              type="button"
              data-testid="im-address-lookup-btn"
              disabled={isLookingUpAddress}
              onClick={onLookupAddress}
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
            placeholder="예: 서울특별시 마포구 서교동 395-166"
            className="w-full min-h-[48px] px-3.5 text-lg rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
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
                      className="inline-flex items-center rounded-md bg-white border border-[#93C5FD] px-2.5 py-1 text-sm font-semibold text-[#0F172A] tabular-nums"
                    >
                      {jibunLabel}
                      {catLabel}
                      {areaLabel}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div
          className="space-y-2.5"
          data-testid="im-price-section"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-cover")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="im-price-won-input"
              className="text-base font-bold text-[#0F172A]"
            >
              2. 희망 매매가 (&apos;원&apos; 단위){" "}
              <span className="text-[#991B1B]">*</span>
            </label>
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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 flex items-center gap-2">
              <input
                id="im-price-won-input"
                type="text"
                inputMode="numeric"
                data-testid="im-price-won-input"
                value={formattedWonDisplay}
                onFocus={onWonFocus}
                onBlur={onWonBlur}
                onChange={(e) => onWonPriceChange(e.target.value)}
                placeholder="예: 7,700,000,000 (원 단위로 입력하거나 붙여넣기)"
                className="w-full min-h-[48px] px-3.5 text-lg font-extrabold tabular-nums rounded-xl border-2 border-[#1D4ED8] bg-white focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
              />
              <span className="text-base font-extrabold text-slate-900 shrink-0">
                원
              </span>
            </div>
            <button
              type="button"
              data-testid="im-price-calculator-toggle"
              aria-expanded={isPriceCalcOpen}
              onClick={onTogglePriceCalc}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold cursor-pointer shrink-0 whitespace-nowrap transition-colors"
            >
              {isPriceCalcOpen ? "간편 계산기 접기 ▴" : "간편 계산기로 입력 ▾"}
            </button>
          </div>

          <div
            data-testid="im-price-calculator-panel"
            className={
              isPriceCalcOpen
                ? "p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
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
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-sm font-extrabold cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onSetDirectAskingPriceManwon(0)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-bold cursor-pointer"
              >
                0원 초기화
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="im-price-eok-input"
                  className="text-sm font-bold text-slate-700 shrink-0"
                >
                  억 단위 간편입력
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
                  className="w-full min-h-[44px] px-3 text-base font-bold tabular-nums rounded-xl bg-white border border-[#CBD5E1] focus:border-[#1D4ED8] outline-none"
                />
                <span className="text-sm font-extrabold text-slate-800 shrink-0">
                  억
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="im-price-man-input"
                  className="text-sm font-bold text-slate-700 shrink-0"
                >
                  만원 단위
                </label>
                <input
                  id="im-price-man-input"
                  type="number"
                  min={0}
                  max={9999}
                  data-testid="im-price-man-input"
                  value={priceManwonRemainder || ""}
                  onChange={(e) =>
                    onSplitPriceChange(priceEokPart, Number(e.target.value))
                  }
                  placeholder="0"
                  className="w-full min-h-[44px] px-3 text-base font-bold tabular-nums rounded-xl bg-white border border-[#CBD5E1] focus:border-[#1D4ED8] outline-none"
                />
                <span className="text-sm font-extrabold text-slate-800 shrink-0">
                  만원
                </span>
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
            <h2 className="text-xl font-extrabold text-[#0F172A]">② 층별 임대 현황</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
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
            </div>
          </div>
          {activeEditorTab === "rentroll" && selectedItemActionsNode}
        </div>

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
            hasExistingData={false}
            onImport={onExcelRentRollImport}
          />
        </div>

        <div onFocusCapture={() => onNotifyEditorFocus("im-unit-rentroll")}>
          <RentRollGrid
            rows={rentRoll}
            onChange={onChangeRentRoll}
            floorsAbove={currentItem?.floorsAbove}
            floorsBelow={currentItem?.floorsBelow}
            askingPriceManwon={askingPriceManwon}
            extraToolbarAction={
              <button
                type="button"
                data-testid="im-rentroll-import-toggle"
                aria-expanded={isRentRollImportOpen}
                onClick={onToggleRentRollImport}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-slate-900 text-sm font-extrabold cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
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

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-axios-btn"
            onClick={() => {
              onClearActionAlert();
              onChangeEditorTab("axios_brief");
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <h2 className="text-xl font-extrabold text-[#0F172A]">
            ③ 핵심 장점 3가지 · 담당 중개사 안내
          </h2>
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

        <div className="space-y-3">
          {axiosHighlights.map((item, idx) => {
            const style = postitStyles[item.tone] || postitStyles.amber;
            return (
              <div
                key={idx}
                data-testid={`im-axios-postit-${idx}`}
                onFocusCapture={() => onNotifyEditorFocus(`im-unit-highlight-${idx}`)}
                style={{ backgroundColor: style.bg, borderColor: style.border }}
                className="rounded-xl border border-l-4 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`im-axios-point-title-${idx}`}
                    style={{ backgroundColor: style.badgeBg, color: style.badgeText }}
                    className="text-sm font-extrabold px-2.5 py-0.5 rounded"
                  >
                    {style.label}
                  </label>
                  <span
                    data-testid={`im-axios-point-char-count-${idx}`}
                    className="text-sm font-semibold text-slate-600 tabular-nums"
                  >
                    {(item.brief || "").length}/300자
                  </span>
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
                  className="w-full min-h-[48px] px-3.5 text-lg font-extrabold text-slate-950 bg-white/95 rounded-lg border border-slate-400/80 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="핵심 장점 소제목"
                />
                <label htmlFor={`im-axios-point-brief-${idx}`} className="sr-only">
                  장점 {idx + 1} 상세 설명
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
                  className="w-full px-3.5 py-2 text-base font-medium text-slate-800 bg-white/90 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                  placeholder="매수자가 주목할 근거를 2~3문장으로 적어 주세요"
                />
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
          <h2 className="text-xl font-extrabold text-[#0F172A]">④ 건물 사진 첨부</h2>
          {activeEditorTab === "media_publish" && selectedItemActionsNode}
        </div>

        <div
          data-testid="im-photo-dropzone"
          onFocusCapture={() => onNotifyEditorFocus("im-unit-photos")}
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
          className={`p-6 rounded-2xl border-2 border-dashed text-center space-y-4 transition-colors ${
            isDraggingPhotos
              ? "bg-blue-50 border-[#1D4ED8]"
              : "bg-[#FAF9F5] border-[#64748B]"
          }`}
        >
          <p className="text-base font-semibold text-[#334155] break-keep">
            건물 외관·내부 사진을 올려 주세요 (휴대폰 사진 그대로 가능 · 지적도는 주소로 자동 생성됩니다)
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
            className="min-h-[48px] px-5 py-2.5 bg-white border border-[#64748B] rounded-xl text-base font-bold text-[#0F172A] hover:bg-[#F3F2EE] cursor-pointer"
          >
            + 사진 파일 선택
          </button>

          {(photoEntries.length > 0 || photoNames.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
              {(photoEntries.length > 0
                ? photoEntries
                : photoNames.map(
                    (n, idx): ImPhotoEntry => ({
                      id: `legacy-${idx}-${n}`,
                      name: n,
                      url: resolveKnownTestAssetUrl(n),
                    })
                  )
              ).map((entry, idx) => {
                const name = entry.name;
                const thumbSrc = resolveRenderablePhotoSrc(entry);
                return (
                  <div
                    key={entry.id || `${name}-${idx}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#CBD5E1]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {thumbSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbSrc}
                          alt={name}
                          onError={(e) => {
                            const fallback = resolveKnownTestAssetUrl(name);
                            if (
                              fallback &&
                              e.currentTarget.src !==
                                window.location.origin + fallback
                            ) {
                              e.currentTarget.src = fallback;
                            } else {
                              e.currentTarget.style.display = "none";
                            }
                          }}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                          사진
                        </div>
                      )}
                      <span className="text-sm font-semibold text-[#0F172A] truncate">
                        {name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemovePhotoAtIndex(entry, idx)}
                      className="min-h-[44px] px-3.5 text-sm text-[#991B1B] font-extrabold hover:bg-red-50 rounded-lg cursor-pointer"
                      aria-label={`${name} 삭제`}
                    >
                      삭제
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-base font-extrabold text-[#0F172A] break-keep">
              입력을 마쳤다면 바로 IM을 만들어 보세요
            </p>
            <p className="text-sm text-[#475569] break-keep">
              모바일 IM 링크와 10면 발표자료가 함께 준비됩니다.
            </p>
          </div>
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
        </div>
      </div>
    </div>
  );
}
