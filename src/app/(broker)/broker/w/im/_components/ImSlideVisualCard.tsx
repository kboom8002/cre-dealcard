"use client";

import React from "react";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import {
  resolveRenderablePhotoSrc,
  type BasicImSlideSummary,
  type ImAxiosHighlight,
  type ImPhotoEntry,
} from "./im-workspace-types";

const SLIDE_NO_TO_UNIT_ID: Record<string, string> = {
  "01": "im-unit-cover",
  "02": "im-unit-highlights",
  "03": "im-unit-building",
  "04": "im-unit-location",
  "05": "im-unit-land",
  "06": "im-unit-rentroll",
  "07": "im-unit-yield",
  "08": "im-unit-comps",
  "09": "im-unit-photos",
  "10": "im-unit-broker",
};

export interface ImSlideVisualCardProps {
  slide: BasicImSlideSummary;
  activeUnitId?: string | null;
  onFocusUnit: (unitId: string) => void;
  onCloseFullscreenIfOpen?: () => void;
  postureKoreanLabel: string;
  axiosHighlights: ImAxiosHighlight[];
  rentRoll: RentRollRowItem[];
  photoEntries: ImPhotoEntry[];
  zoning: string;
  gfaSqm: string;
  totalRentManwon: number;
  brokerageName: string;
}

export function ImSlideVisualCard({
  slide,
  activeUnitId,
  onFocusUnit,
  onCloseFullscreenIfOpen,
  postureKoreanLabel,
  axiosHighlights,
  rentRoll,
  photoEntries,
  zoning,
  gfaSqm,
  totalRentManwon,
  brokerageName,
}: ImSlideVisualCardProps) {
  const slideUnitId = SLIDE_NO_TO_UNIT_ID[slide.no] || "im-unit-cover";
  const isSlideActive =
    activeUnitId === slideUnitId ||
    (slide.no === "02" && Boolean(activeUnitId?.startsWith("im-unit-highlight-")));
  const coverSrc = photoEntries[0]
    ? resolveRenderablePhotoSrc(photoEntries[0])
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`im-slide-preview-${slide.no}`}
      data-preview-unit-id={slideUnitId}
      data-preview-active={isSlideActive ? "true" : "false"}
      aria-label={`${slide.no} ${slide.title} 편집하기`}
      onClick={() => {
        onCloseFullscreenIfOpen?.();
        onFocusUnit(slideUnitId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCloseFullscreenIfOpen?.();
          onFocusUnit(slideUnitId);
        }
      }}
      title="클릭하면 해당 편집 칸으로 이동합니다"
      className={`aspect-video w-full bg-white hover:bg-[#FAF9F5] text-[#0F172A] rounded-xl border overflow-hidden flex flex-col justify-between shadow-sm cursor-pointer transition-all ${
        isSlideActive
          ? "border-[#007AFF] ring-2 ring-[#007AFF]"
          : "border-slate-300 hover:border-[#007AFF]"
      }`}
    >
      <div
        data-theme-lock="dark"
        className="bg-[#0F172A] text-white px-3 py-1.5 flex items-center justify-between shrink-0"
      >
        <span className="text-sm font-extrabold text-[#93C5FD] truncate">
          {slide.no} · {slide.title}
        </span>
        <span className="text-sm text-slate-300 font-mono shrink-0">
          {slide.no} / 10
        </span>
      </div>

      <div className="px-3 py-2 flex-1 min-h-0 flex flex-col justify-center gap-1.5 overflow-hidden">
        {slide.no === "01" && coverSrc ? (
          <div className="grid grid-cols-5 gap-2 items-center h-full min-h-0">
            <div className="col-span-3 space-y-1 min-w-0">
              <span className="inline-block text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                {postureKoreanLabel}
              </span>
              <p
                data-single-line-title="true"
                title={slide.summary}
                className="text-sm font-extrabold text-[#0F172A] leading-snug line-clamp-2 break-keep"
              >
                {slide.summary}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt="표지 슬라이드 사진"
              className="col-span-2 w-full h-16 object-cover rounded-lg border border-slate-200"
            />
          </div>
        ) : slide.no === "02" ? (
          <div className="space-y-1">
            <p data-single-line-title="true" title={slide.summary} className="sr-only">
              {slide.summary}
            </p>
            {axiosHighlights.slice(0, 3).map((hl, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-50 border-l-4 border-[#007AFF] text-sm font-semibold text-slate-800 truncate"
              >
                <span className="text-[#0040DD] font-extrabold">0{idx + 1}</span>
                <span className="truncate">
                  {hl.headline || `핵심 장점 ${idx + 1}`}
                </span>
              </div>
            ))}
          </div>
        ) : slide.no === "06" && rentRoll.length > 0 ? (
          <div className="space-y-1">
            <p
              data-single-line-title="true"
              title={slide.summary}
              className="text-sm font-bold text-[#0F172A] truncate"
            >
              {slide.summary}
            </p>
            <div className="rounded border border-slate-200 bg-slate-50/80 px-2 py-1 space-y-0.5 text-sm">
              {rentRoll.slice(0, 2).map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 truncate"
                >
                  <span className="font-bold text-slate-800">
                    {r.floor} · {r.use || "임대"}
                  </span>
                  <span className="font-mono text-slate-700 shrink-0">
                    {(r.depositManwon ?? 0).toLocaleString()}/
                    {(r.monthlyRentManwon ?? 0).toLocaleString()}만
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : slide.no === "09" && photoEntries.length > 0 ? (
          <div className="space-y-1">
            <p
              data-single-line-title="true"
              title={slide.summary}
              className="text-sm font-bold text-[#0F172A] truncate"
            >
              {slide.summary}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {photoEntries.slice(0, 3).map((pe, idx) => {
                const pSrc = resolveRenderablePhotoSrc(pe);
                return pSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={pSrc}
                    alt={pe.name}
                    className="w-full h-10 object-cover rounded border border-slate-200"
                  />
                ) : null;
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p
              data-single-line-title="true"
              title={slide.summary}
              className="text-base font-extrabold text-[#0F172A] leading-snug line-clamp-2 break-keep"
            >
              {slide.summary}
            </p>
            {(slide.no === "03" || slide.no === "05" || slide.no === "07") && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-sm font-semibold text-slate-700 truncate">
                  {slide.no === "03"
                    ? `연면적: ${gfaSqm || "—"}㎡`
                    : slide.no === "05"
                    ? `용도지역: ${zoning || "미입력"}`
                    : `월임대료 ${totalRentManwon.toLocaleString()}만원`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-sm shrink-0">
        <span className="text-[#065F46] font-extrabold truncate">{slide.metric}</span>
        <span className="text-slate-500 text-sm truncate max-w-[130px]">
          {brokerageName || "전담 중개사무소"}
        </span>
      </div>
    </div>
  );
}
