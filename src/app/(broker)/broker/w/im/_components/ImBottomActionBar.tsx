"use client";

import React from "react";
import type { PreviewLifecycleState } from "@/components/workspace/preview-sync";

export interface ImBottomActionBarProps {
  isGenerating: boolean;
  isProvisioningSheet: boolean;
  isDownloadingPptx: boolean;
  isDownloadingPdf?: boolean;
  previewLifecycle: PreviewLifecycleState;
  generateButtonLabel: string;
  onQuickGenerate: () => void;
  onDownloadPptx: (e: React.MouseEvent<HTMLElement>) => void;
  onDownloadPdf?: (e: React.MouseEvent<HTMLElement>) => void;
  onOpenStudio: (e: React.MouseEvent<HTMLElement>) => void;
}

/**
 * 390px Mobile Slimmed Bottom Footer + Desktop Column 3 Action Bar:
 * - 1 primary full-width CTA (`min-h-[48px]`)
 * - Compact 2-column secondary actions row (`min-h-[44px]`)
 * - Safe-area bottom padding (`pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-0`)
 *   so mobile viewports never lose 35% of screen height to 3 stacked full-width buttons.
 */
export function ImBottomActionBar({
  isGenerating,
  isProvisioningSheet,
  isDownloadingPptx,
  isDownloadingPdf = false,
  previewLifecycle,
  generateButtonLabel,
  onQuickGenerate,
  onDownloadPptx,
  onDownloadPdf,
  onOpenStudio,
}: ImBottomActionBarProps) {
  return (
    <div
      data-testid="im-bottom-action-bar"
      className="w-full space-y-1.5 md:space-y-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-0"
    >
      <button
        type="button"
        data-testid="im-quick-generate-btn"
        disabled={isGenerating}
        aria-busy={isGenerating}
        onClick={onQuickGenerate}
        className="w-full min-h-[48px] md:min-h-[52px] px-3.5 md:px-4 py-2.5 bg-[#1D4ED8] text-white rounded-xl md:rounded-2xl font-extrabold text-base leading-snug break-keep text-center hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
      >
        <span>{generateButtonLabel}</span>
      </button>

      <div
        data-testid="im-secondary-actions-row"
        className="grid grid-cols-3 gap-1.5 md:gap-2"
      >
        <button
          type="button"
          data-testid="im-download-pptx-btn"
          disabled={isProvisioningSheet || isDownloadingPptx || isDownloadingPdf}
          aria-busy={isDownloadingPptx}
          aria-disabled={
            isProvisioningSheet ||
            isDownloadingPptx ||
            isDownloadingPdf ||
            previewLifecycle === "pre_generation"
          }
          onClick={onDownloadPptx}
          className={`min-h-[44px] px-2 py-2 bg-[#ECFDF5] text-[#065F46] border border-[#10B981]/35 rounded-xl font-bold text-sm leading-tight break-keep text-center hover:bg-[#D1FAE5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            previewLifecycle === "pre_generation" ? "opacity-50" : ""
          }`}
        >
          <span>
            {isDownloadingPptx ? "PPTX 중…" : "📥 PPTX 받기"}
          </span>
        </button>

        <button
          type="button"
          data-testid="im-download-pdf-btn"
          disabled={isProvisioningSheet || isDownloadingPdf || isDownloadingPptx || !onDownloadPdf}
          aria-busy={isDownloadingPdf}
          aria-disabled={
            isProvisioningSheet ||
            isDownloadingPdf ||
            previewLifecycle === "pre_generation" ||
            !onDownloadPdf
          }
          onClick={onDownloadPdf}
          className={`min-h-[44px] px-2 py-2 bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] rounded-xl font-bold text-sm leading-tight break-keep text-center hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            previewLifecycle === "pre_generation" ? "opacity-50" : ""
          }`}
        >
          <span>
            {isDownloadingPdf ? "PDF 중…" : "📄 PDF 저장"}
          </span>
        </button>

        <button
          type="button"
          data-testid="im-open-studio-btn"
          disabled={isProvisioningSheet}
          aria-busy={isProvisioningSheet}
          onClick={onOpenStudio}
          className="min-h-[44px] px-2 py-2 bg-white text-[#1D4ED8] border border-[#1D4ED8] rounded-xl font-bold text-sm leading-tight break-keep text-center hover:bg-[#EFF6FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>
            {isProvisioningSheet ? "준비 중…" : "📐 발표자료 꾸미기"}
          </span>
        </button>
      </div>
    </div>
  );
}
