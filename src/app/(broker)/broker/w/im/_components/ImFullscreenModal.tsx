"use client";

import React, { useEffect, useRef } from "react";
import type { BasicImSlideSummary } from "./im-workspace-types";

export interface ImFullscreenModalProps {
  fullscreenModalUrl: string | null;
  title: string;
  previewTab: "mobile" | "pptx";
  onChangePreviewTab: (tab: "mobile" | "pptx") => void;
  onClose: () => void;
  basicImSlides: BasicImSlideSummary[];
  renderSlideCard: (slide: BasicImSlideSummary) => React.ReactNode;
}

export function ImFullscreenModal({
  fullscreenModalUrl,
  title,
  previewTab,
  onChangePreviewTab,
  onClose,
  basicImSlides,
  renderSlideCard,
}: ImFullscreenModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!fullscreenModalUrl || typeof document === "undefined") return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [fullscreenModalUrl]);

  if (!fullscreenModalUrl) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="IM 전체화면 미리보기"
      data-testid="im-fullscreen-preview-modal"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#F5F5F7] rounded-3xl border border-white/80 shadow-2xl w-full max-w-6xl h-[90dvh] flex flex-col overflow-hidden">
        <div className="min-h-16 py-2 px-4 sm:px-6 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-[#0F172A] truncate">
              {title}
            </h3>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => onChangePreviewTab("mobile")}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-sm font-bold cursor-pointer ${
                  previewTab === "mobile"
                    ? "bg-white text-[#0055D4] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                모바일 IM
              </button>
              <button
                type="button"
                onClick={() => onChangePreviewTab("pptx")}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-sm font-bold cursor-pointer ${
                  previewTab === "pptx"
                    ? "bg-white text-[#0055D4] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                발표자료 10면
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={fullscreenModalUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="im-fullscreen-open-newtab-link"
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] border border-blue-200 text-sm font-extrabold flex items-center gap-1"
            >
              <span>새 탭에서 열기 ↗</span>
            </a>
            <button
              ref={closeBtnRef}
              type="button"
              data-testid="im-fullscreen-close-btn"
              onClick={onClose}
              className="min-h-[44px] px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {previewTab === "mobile" ? (
            <iframe
              src={fullscreenModalUrl}
              title="모바일 IM 전체화면 미리보기"
              data-testid="im-fullscreen-iframe"
              className="w-full h-full min-h-[560px] rounded-2xl border border-slate-300 bg-white shadow-sm"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto">
              {basicImSlides.map((slide) => (
                <React.Fragment key={slide.no}>
                  {renderSlideCard(slide)}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
