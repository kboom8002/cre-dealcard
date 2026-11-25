"use client";

import React from "react";
import { hasExistingRentRollData } from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import {
  PreviewCausalityBar,
  PreviewPregenerationCard,
  PreviewEditableUnit,
  type PreviewLifecycleState,
} from "@/components/workspace/preview-sync";
import { m2ToPyeong } from "@/domain/building/im-core/facts/area";
import type { BrokerCompRowForm } from "@/domain/building/mobile-im/broker-extras";
import { KakaoStaticMap } from "@/app/(public)/im-lite/[buildingId]/components/kakao-static-map";
import { ImDeckReadinessBar } from "./ImDeckReadinessBar";
import {
  UUID_REGEX,
  resolveKnownTestAssetUrl,
  resolveRenderablePhotoSrc,
  type BasicImSlideSummary,
  type ImAxiosHighlight,
  type ImListItem,
  type ImPhotoEntry,
} from "./im-workspace-types";

export interface ImPostitStyle {
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}

export interface ImPreviewTabSwitcherProps {
  previewTab: "mobile" | "pptx";
  onChangePreviewTab: (tab: "mobile" | "pptx") => void;
  slideCount?: number;
}

export function ImPreviewTabSwitcher({
  previewTab,
  onChangePreviewTab,
  slideCount,
}: ImPreviewTabSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="IM 미리보기 방식"
      className="inline-flex rounded-[12px] ios-segmented-track bg-[#767680]/[0.11] border border-white/60 p-[3px] overflow-hidden shrink-0"
    >
      <button
        type="button"
        role="tab"
        aria-selected={previewTab === "mobile"}
        onClick={() => onChangePreviewTab("mobile")}
        className={`min-h-[44px] px-3.5 py-1 text-sm font-semibold rounded-[9px] transition-all cursor-pointer shrink-0 ${
          previewTab === "mobile"
            ? "ios-segmented-pill bg-white text-[#007AFF]"
            : "text-[#3A3A3C] hover:text-[#1D1D1F]"
        }`}
      >
        모바일 IM
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={previewTab === "pptx"}
        onClick={() => onChangePreviewTab("pptx")}
        className={`min-h-[44px] px-3.5 py-1 text-sm font-semibold rounded-[9px] transition-all cursor-pointer shrink-0 ${
          previewTab === "pptx"
            ? "ios-segmented-pill bg-white text-[#007AFF]"
            : "text-[#3A3A3C] hover:text-[#1D1D1F]"
        }`}
      >
        {typeof slideCount === "number" ? `발표자료 ${slideCount}면` : "발표자료"}
      </button>
    </div>
  );
}

export interface ImPreviewPaneProps {
  currentItem: ImListItem | undefined;
  previewLifecycle: PreviewLifecycleState;
  previewTab: "mobile" | "pptx";
  isGenerating: boolean;
  isProvisioningSheet: boolean;
  activeUnitId?: string | null;
  onFocusEditorUnit: (unitId: string) => void;
  onQuickGenerate: () => void;
  onOpenFullscreen: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  cleanCoverTitle: string;
  address: string;
  askingPriceManwon: number;
  calculatedYield: number;
  postureKoreanLabel: string;
  photoEntries: ImPhotoEntry[];
  axiosHighlights: ImAxiosHighlight[];
  postitStyles: Record<"amber" | "sky" | "mint", ImPostitStyle>;
  gfaSqm: string;
  completionDate: string;
  landAreaSqm: string;
  zoning: string;
  rentRoll: RentRollRowItem[];
  expectedRentRoll?: RentRollRowItem[];
  totalDepositManwon: number;
  totalRentManwon: number;
  expectedDepositManwon?: number;
  expectedRentManwon?: number;
  expectedYieldPct?: number;
  compRows?: BrokerCompRowForm[];
  lat?: number;
  lng?: number;
  cadastralImageUrl?: string;
  brokerageName: string;
  brokerName: string;
  brokerPhone: string;
  handoverNote: string;
  activeSlideFilter: string;
  onChangeSlideFilter: (next: string) => void;
  basicImSlides: BasicImSlideSummary[];
  renderSlideCard: (slide: BasicImSlideSummary) => React.ReactNode;
}

export function ImPreviewPane({
  currentItem,
  previewLifecycle,
  previewTab,
  isGenerating,
  isProvisioningSheet,
  activeUnitId,
  onFocusEditorUnit,
  onQuickGenerate,
  onOpenFullscreen,
  cleanCoverTitle,
  address,
  askingPriceManwon,
  calculatedYield,
  postureKoreanLabel,
  photoEntries,
  axiosHighlights,
  postitStyles,
  gfaSqm,
  completionDate,
  landAreaSqm,
  zoning,
  rentRoll,
  expectedRentRoll = [],
  totalDepositManwon,
  totalRentManwon,
  expectedDepositManwon = 0,
  expectedRentManwon = 0,
  expectedYieldPct = 0,
  compRows = [],
  lat,
  lng,
  cadastralImageUrl,
  brokerageName,
  brokerName,
  brokerPhone,
  handoverNote,
  activeSlideFilter,
  onChangeSlideFilter,
  basicImSlides,
  renderSlideCard,
}: ImPreviewPaneProps) {
  const hasExpectedRentRoll = hasExistingRentRollData(expectedRentRoll);
  const hasComps = compRows.length > 0;

  // 순차 번호 동적 할당 (표지 미번호 -> 본문 01, 02, ...)
  const visibleSectionOrder: string[] = [
    "02",
    "03",
    "04",
    "05",
    "06",
    ...(hasExpectedRentRoll ? ["06-2"] : []),
    "07",
    ...(hasComps ? ["08"] : []),
    "09",
    "10",
  ];
  const secNo = (id: string) => {
    const idx = visibleSectionOrder.indexOf(id);
    return idx >= 0 ? String(idx + 1).padStart(2, "0") : "";
  };
  return (
    <div className="w-full min-w-0 max-w-sm mx-auto p-3 sm:p-3.5 space-y-3.5 overflow-x-hidden" data-testid="im-preview-slot">
      <div className="sticky top-0 z-20 bg-[#F5F5F7]/95 backdrop-blur-md py-1 -my-1">
        <PreviewCausalityBar
          lifecycle={previewLifecycle}
          onResyncPublished={onQuickGenerate}
          resyncButtonLabel="변경사항 IM에 다시 반영하기"
          isSyncing={isGenerating}
          auxActionSlot={
            <a
              href={`/im-lite/${encodeURIComponent(currentItem?.buildingId || "bld-01")}${
                currentItem?.documentId
                  ? `?doc=${encodeURIComponent(currentItem.documentId)}`
                  : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="im-open-fullscreen-link"
              aria-disabled={
                isProvisioningSheet || previewLifecycle === "pre_generation"
              }
              onClick={onOpenFullscreen}
              className={`min-h-[44px] text-sm font-bold text-[#1D4ED8] hover:underline inline-flex items-center gap-1 px-2 whitespace-nowrap ${
                isProvisioningSheet
                  ? "opacity-50 pointer-events-none"
                  : previewLifecycle === "pre_generation"
                  ? "opacity-50"
                  : ""
              }`}
            >
              <span>큰 화면 ↗</span>
            </a>
          }
        />
      </div>

      <ImDeckReadinessBar
        address={address}
        askingPriceManwon={askingPriceManwon}
        gfaSqm={gfaSqm}
        landAreaSqm={landAreaSqm}
        hasRentRollRow={rentRoll.some(
          (r) =>
            (r.depositManwon || 0) > 0 ||
            (r.monthlyRentManwon || 0) > 0 ||
            r.status === "owner" ||
            Boolean(r.tenantName?.trim())
        )}
        photoCount={photoEntries.length}
        onFocusEditorUnit={onFocusEditorUnit}
      />

      {previewLifecycle === "pre_generation" ? (
        <PreviewPregenerationCard
          testId="im-preview-pregeneration-state"
          badge="생성 전 · 입력 대기"
          title="건물 주소와 희망 매매가를 입력하면 IM 미리보기가 만들어집니다"
          description="아직 입력된 매물 정보가 없어 빈 표 대신 안내를 보여 드립니다. 주소와 가격만 적어도 10개 섹션 미리보기가 즉시 열립니다."
          checklist={[
            {
              label: "1. 건물 주소 입력",
              done: Boolean(address.trim()),
              onClick: () => onFocusEditorUnit("im-unit-address"),
            },
            {
              label: "2. 희망 매매가 입력",
              done: (askingPriceManwon ?? 0) > 0,
              onClick: () => onFocusEditorUnit("im-unit-price"),
            },
          ]}
          primaryActionLabel="① 주소·가격 입력하러 가기"
          onPrimaryAction={() => onFocusEditorUnit("im-unit-address")}
        />
      ) : previewTab === "mobile" ? (
        <div
          data-testid="im-mobile-preview-frame"
          className="bg-[#FAF9F5] rounded-[20px] border-2 border-[#334155] p-3 pt-4 shadow-md flex flex-col"
        >
          <div data-testid="im-mobile-preview-scroll" className="space-y-4">
            {/* Section Cover */}
            <PreviewEditableUnit
              testId="im-mobile-section-01"
              unitId="im-unit-cover"
              label="표지"
              isActive={
                activeUnitId === "im-unit-cover" || activeUnitId === "im-unit-price"
              }
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded">
                  표지 · {postureKoreanLabel}
                </span>
              </div>
              {photoEntries[0] && resolveRenderablePhotoSrc(photoEntries[0]) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveRenderablePhotoSrc(photoEntries[0])}
                  alt="표지 대표 사진"
                  onError={(e) => {
                    const fallback = resolveKnownTestAssetUrl(photoEntries[0]?.name);
                    if (
                      fallback &&
                      e.currentTarget.src !== window.location.origin + fallback
                    ) {
                      e.currentTarget.src = fallback;
                    } else {
                      e.currentTarget.style.display = "none";
                    }
                  }}
                  className="w-full h-36 object-cover rounded-lg border border-slate-200"
                />
              )}
              <h3
                data-single-line-title="true"
                title={cleanCoverTitle}
                className="text-lg font-extrabold text-[#0F172A] break-keep"
              >
                {cleanCoverTitle || "표지 제목을 입력해 주세요"}
              </h3>
              <p className="text-sm text-[#475569] break-keep">
                {address || "주소 미입력"}
              </p>
              <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-base font-bold">
                <span className="text-[#0F172A]">
                  {askingPriceManwon > 0
                    ? formatKoreanCurrencyReadout(askingPriceManwon).replace(
                        /^=\s*/,
                        ""
                      )
                    : "가격 미입력"}
                </span>
                <span className="text-[#065F46]">
                  {calculatedYield > 0 ? `연 ${calculatedYield.toFixed(2)}%` : "—"}
                </span>
              </div>
            </PreviewEditableUnit>

            {/* Section: Investment Highlights (Body 01) */}
            <PreviewEditableUnit
              testId="im-mobile-section-02"
              unitId="im-unit-highlights"
              label={`${secNo("02")} 핵심 장점`}
              isActive={activeUnitId === "im-unit-highlights"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded">
                  {secNo("02")} 핵심 장점
                </span>
              </div>
              <div className="space-y-2 pt-0.5" data-testid="im-preview-axios-list">
                {axiosHighlights.map((hl, idx) => {
                  const st = postitStyles[hl.tone] || postitStyles.amber;
                  const hlUnitId = `im-unit-highlight-${idx}`;
                  return (
                    <PreviewEditableUnit
                      key={idx}
                      testId={`im-preview-axios-item-${idx}`}
                      unitId={hlUnitId}
                      label={`핵심 장점 0${idx + 1}`}
                      isActive={activeUnitId === hlUnitId}
                      onActivate={onFocusEditorUnit}
                      className="rounded-lg"
                    >
                      <div
                        style={{ backgroundColor: st.bg, borderColor: st.border }}
                        className="rounded-lg border border-l-4 p-3 space-y-1"
                      >
                        <p
                          data-single-line-title="true"
                          title={hl.headline}
                          className="text-base font-extrabold text-slate-950 break-keep"
                        >
                          {hl.headline || `핵심 장점 ${idx + 1}`}
                        </p>
                        <p className="text-sm text-slate-700 leading-snug break-keep">
                          {hl.brief || "설명을 입력해 주세요"}
                        </p>
                      </div>
                    </PreviewEditableUnit>
                  );
                })}
              </div>
            </PreviewEditableUnit>

            {/* Section: Building Overview */}
            <PreviewEditableUnit
              testId="im-mobile-section-03"
              unitId="im-unit-building"
              label={`${secNo("03")} 건축물 개요`}
              isActive={activeUnitId === "im-unit-building"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("03")} 건축물 개요
              </span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">연면적</span>
                  <strong className="text-slate-900">
                    {gfaSqm
                      ? `${gfaSqm}㎡ (약 ${Math.round(
                          m2ToPyeong(Number(String(gfaSqm || "").replace(/,/g, "")))
                        )}평)`
                      : "—"}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">사용승인일</span>
                  <strong className="text-slate-900">{completionDate || "—"}</strong>
                </div>
              </div>
            </PreviewEditableUnit>

            {/* Section: Location & Transit */}
            <PreviewEditableUnit
              testId="im-mobile-section-04"
              unitId="im-unit-location"
              label={`${secNo("04")} 입지 및 교통`}
              isActive={
                activeUnitId === "im-unit-location" ||
                activeUnitId === "im-unit-address"
              }
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("04")} 입지 및 교통
              </span>
              <p className="text-sm font-semibold text-slate-900 break-keep">
                {address || "주소 미입력"}
              </p>
              {typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && (
                <div className="h-32 rounded-lg overflow-hidden border border-slate-200">
                  <KakaoStaticMap lat={lat} lng={lng} name={cleanCoverTitle || address || "본건"} />
                </div>
              )}
            </PreviewEditableUnit>

            {/* Section: Land & Zoning */}
            <PreviewEditableUnit
              testId="im-mobile-section-05"
              unitId="im-unit-land"
              label={`${secNo("05")} 토지 및 도시계획`}
              isActive={activeUnitId === "im-unit-land"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("05")} 토지 및 도시계획
              </span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">대지면적</span>
                  <strong className="text-slate-900">
                    {landAreaSqm
                      ? `${landAreaSqm}㎡ (약 ${Math.round(
                          m2ToPyeong(Number(String(landAreaSqm || "").replace(/,/g, "")))
                        )}평)`
                      : "—"}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">용도지역</span>
                  <strong className="text-slate-900 block break-keep">
                    {zoning || "—"}
                  </strong>
                </div>
              </div>
              {cadastralImageUrl && (
                <div className="pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cadastralImageUrl}
                    alt="지적도 미리보기"
                    className="w-full h-36 object-contain bg-[#F8F5EB] rounded-lg border border-slate-200"
                  />
                </div>
              )}
            </PreviewEditableUnit>

            {/* Section: Rent Roll preview */}
            <PreviewEditableUnit
              testId="im-mobile-section-06"
              unitId="im-unit-rentroll"
              label={`${secNo("06")} 층별 임대차 현황`}
              isActive={activeUnitId === "im-unit-rentroll"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded">
                  {secNo("06")} 층별 임대차 현황
                </span>
                <span className="text-sm font-bold text-[#065F46]">
                  총 {rentRoll.length}개 호실
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="py-1.5 px-2">층</th>
                      <th className="py-1.5 px-2">임차인·업종</th>
                      <th className="py-1.5 px-2 text-right">보증금/월세(만)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rentRoll.slice(0, 6).map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-2 font-bold text-slate-900">
                          {r.floor}
                        </td>
                        <td className="py-1.5 px-2 text-slate-700">
                          {r.tenantName ? `${r.tenantName} (${r.use || "—"})` : r.use || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-900">
                          {(r.depositManwon ?? 0).toLocaleString()} /{" "}
                          {(r.monthlyRentManwon ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PreviewEditableUnit>

            {/* Conditional Section: Expected Rent Roll */}
            {hasExpectedRentRoll && (
              <PreviewEditableUnit
                testId="im-mobile-section-06-expected"
                unitId="im-unit-rentroll"
                label={`${secNo("06-2")} 기대수익률 임대차 현황`}
                isActive={activeUnitId === "im-unit-rentroll"}
                onActivate={onFocusEditorUnit}
                className="bg-white rounded-xl p-3.5 border border-amber-300 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                    {secNo("06-2")} 기대수익률 임대차 현황
                  </span>
                  <span className="text-sm font-extrabold text-amber-800">
                    {expectedRentRoll.length}개 호실 가정
                  </span>
                </div>
                <div className="rounded-lg border border-amber-200 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-amber-50/70 border-b border-amber-200 text-amber-950 font-bold">
                      <tr>
                        <th className="py-1.5 px-2">층</th>
                        <th className="py-1.5 px-2">임차인·업종</th>
                        <th className="py-1.5 px-2 text-right">보증금/월세(만)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {expectedRentRoll.slice(0, 6).map((r, i) => {
                        const baseMatch = rentRoll.find((b) => b.floor === r.floor);
                        const changed =
                          baseMatch &&
                          (baseMatch.monthlyRentManwon !== r.monthlyRentManwon ||
                            baseMatch.depositManwon !== r.depositManwon ||
                            baseMatch.use !== r.use);
                        return (
                          <tr key={i} className={changed ? "bg-amber-50/40 italic" : ""}>
                            <td className="py-1.5 px-2 font-bold text-slate-900">{r.floor}</td>
                            <td className={`py-1.5 px-2 ${changed ? "text-amber-900 font-semibold" : "text-slate-700"}`}>
                              {r.tenantName ? `${r.tenantName} (${r.use || "—"})` : r.use || "—"}
                            </td>
                            <td className={`py-1.5 px-2 text-right font-mono ${changed ? "text-amber-900 font-bold" : "text-slate-900"}`}>
                              {(r.depositManwon ?? 0).toLocaleString()} /{" "}
                              {(r.monthlyRentManwon ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </PreviewEditableUnit>
            )}

            {/* Section: Yield & Cash Flow */}
            <PreviewEditableUnit
              testId="im-mobile-section-07"
              unitId="im-unit-yield"
              label={`${secNo("07")} 수지 및 수익률 분석`}
              isActive={activeUnitId === "im-unit-yield"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("07")} 수지 및 수익률 분석
              </span>
              <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-700">현행 보증금 / 월 임대료</span>
                  <strong className="text-slate-900">
                    {totalDepositManwon.toLocaleString()}만 /{" "}
                    {totalRentManwon.toLocaleString()}만
                  </strong>
                </div>
                <div className="flex justify-between font-extrabold text-[#065F46] pt-1 border-t border-emerald-200/80">
                  <span>현행 임대수익률</span>
                  <span>{calculatedYield.toFixed(2)}%</span>
                </div>
                {hasExpectedRentRoll && expectedYieldPct > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-slate-600 pt-1 border-t border-emerald-200/60">
                      <span>정상화 후 보증금 / 월 임대료</span>
                      <strong>
                        {expectedDepositManwon.toLocaleString()}만 /{" "}
                        {expectedRentManwon.toLocaleString()}만
                      </strong>
                    </div>
                    <div className="flex justify-between font-extrabold text-[#B45309]">
                      <span>기대수익률 (조건 정상화 가정)</span>
                      <span>
                        {expectedYieldPct.toFixed(2)}%
                        {calculatedYield > 0 && expectedYieldPct > calculatedYield
                          ? ` (+${(expectedYieldPct - calculatedYield).toFixed(2)}%p)`
                          : ""}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </PreviewEditableUnit>

            {/* Conditional Section: Comparable Transactions (only shown when >= 1 comp) */}
            {hasComps && (
              <PreviewEditableUnit
                testId="im-mobile-section-08"
                unitId="im-unit-comps"
                label={`${secNo("08")} 인근 실거래 비교`}
                isActive={activeUnitId === "im-unit-comps"}
                onActivate={onFocusEditorUnit}
                className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
              >
                <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                  {secNo("08")} 인근 실거래 비교 ({compRows.length}건)
                </span>
                <div className="space-y-1.5 text-sm">
                  {compRows.slice(0, 4).map((c, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FAF9F5] border border-slate-200"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{c.location || "인근 사례"}</div>
                        {c.note && <div className="text-slate-500 truncate">{c.note}</div>}
                      </div>
                      <div className="font-extrabold text-[#1D4ED8] shrink-0">
                        {c.price_eok ? `${c.price_eok}억` : ""}
                        {c.land_price_per_pyeong_manwon
                          ? ` · 평당 ${Number(c.land_price_per_pyeong_manwon).toLocaleString()}만`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </PreviewEditableUnit>
            )}

            {/* Section: Photos & Cadastral Map */}
            <PreviewEditableUnit
              testId="im-mobile-section-09"
              unitId="im-unit-photos"
              label={`${secNo("09")} 현장 사진 및 지적도`}
              isActive={activeUnitId === "im-unit-photos"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("09")} 현장 사진 및 지적도
              </span>
              <p className="text-sm text-slate-700">
                {photoEntries.length > 0
                  ? `첨부 사진 ${photoEntries.length}장${cadastralImageUrl ? " · 지적도 포함" : ""}`
                  : "외관 사진 및 지적도 자동 배치"}
              </p>
              {photoEntries.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {photoEntries.slice(0, 4).map((pe, idx) => {
                    const src = resolveRenderablePhotoSrc(pe);
                    if (!src) return null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${pe.name}-${idx}`}
                        src={src}
                        alt={pe.name}
                        onError={(e) => {
                          const fallback = resolveKnownTestAssetUrl(pe.name);
                          if (
                            fallback &&
                            e.currentTarget.src !== window.location.origin + fallback
                          ) {
                            e.currentTarget.src = fallback;
                          } else {
                            e.currentTarget.style.display = "none";
                          }
                        }}
                        className="w-full h-20 object-cover rounded-lg border border-slate-200"
                      />
                    );
                  })}
                </div>
              )}
            </PreviewEditableUnit>

            {/* Section: Contact & Deal Terms */}
            <PreviewEditableUnit
              testId="im-mobile-section-10"
              unitId="im-unit-broker"
              label={`${secNo("10")} 거래 조건 및 담당 중개인`}
              isActive={activeUnitId === "im-unit-broker"}
              onActivate={onFocusEditorUnit}
              className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-1.5"
            >
              <span className="text-sm font-bold text-[#515154] bg-slate-100 px-2.5 py-0.5 rounded inline-block">
                {secNo("10")} 거래 조건 및 담당 중개인
              </span>
              <p className="text-sm font-bold text-slate-900 break-keep">
                {[brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") ||
                  "담당 공인중개사 안내"}
              </p>
              <p className="text-sm text-slate-600 break-keep">
                {handoverNote || "명도 일정 협의 가능"}
              </p>
            </PreviewEditableUnit>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5" data-testid="im-pptx-deck-preview">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => onChangeSlideFilter("all")}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-sm font-extrabold shrink-0 cursor-pointer ${
                activeSlideFilter === "all"
                  ? "bg-[#0F172A] text-white"
                  : "bg-white text-slate-700 border border-slate-300"
              }`}
            >
              전체 {basicImSlides.length}면
            </button>
            {basicImSlides.map((s) => (
              <button
                key={s.id || s.no}
                type="button"
                onClick={() => onChangeSlideFilter(s.no)}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-sm font-bold shrink-0 cursor-pointer ${
                  activeSlideFilter === s.no
                    ? "bg-[#1D4ED8] text-white"
                    : "bg-white text-slate-700 border border-slate-300"
                }`}
              >
                {s.no}
              </button>
            ))}
          </div>

          <div className="pt-2 space-y-4">
            {(activeSlideFilter === "all"
              ? basicImSlides
              : basicImSlides.filter((s) => s.no === activeSlideFilter)
            ).map((slide) => (
              <React.Fragment key={slide.id || slide.no}>{renderSlideCard(slide)}</React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
