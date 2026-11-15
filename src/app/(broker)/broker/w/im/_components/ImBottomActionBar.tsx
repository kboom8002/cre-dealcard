"use client";

import React from "react";
import type { PreviewLifecycleState } from "@/components/workspace/preview-sync";

export interface ImBottomActionBarProps {
  isGenerating: boolean;
  isProvisioningSheet: boolean;
  isDownloadingPptx: boolean;
  previewLifecycle: PreviewLifecycleState;
  generateButtonLabel: string;
  onQuickGenerate: () => void;
  onDownloadPptx: (e: React.MouseEvent<HTMLElement>) => void;
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
  previewLifecycle,
  generateButtonLabel,
  onQuickGenerate,
  onDownloadPptx,
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
        className="w-full min-h-[48px] md:min-h-[52px] px-4 md:px-5 py-2.5 md:py-3 bg-[#1D4ED8] text-white rounded-xl md:rounded-2xl font-extrabold text-base md:text-lg hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 whitespace-nowrap"
      >
        <span>{generateButtonLabel}</span>
      </button>

      <div
        data-testid="im-secondary-actions-row"
        className="grid grid-cols-2 gap-1.5 md:gap-2"
      >
        <button
          type="button"
          data-testid="im-download-pptx-btn"
          disabled={isProvisioningSheet || isDownloadingPptx}
          aria-busy={isDownloadingPptx}
          aria-disabled={
            isProvisioningSheet ||
            isDownloadingPptx ||
            previewLifecycle === "pre_generation"
          }
          onClick={onDownloadPptx}
          className={`min-h-[44px] px-2.5 md:px-3 py-1.5 md:py-2 bg-[#ECFDF5] text-[#065F46] border border-[#10B981]/35 rounded-xl font-bold text-sm hover:bg-[#D1FAE5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap truncate ${
            previewLifecycle === "pre_generation" ? "opacity-50" : ""
          }`}
        >
          <span className="truncate">
            {isDownloadingPptx ? "PPTX 생성 중…" : "📥 PPTX IM 받기"}
          </span>
        </button>

        <button
          type="button"
          data-testid="im-open-studio-btn"
          disabled={isProvisioningSheet}
          aria-busy={isProvisioningSheet}
          onClick={onOpenStudio}
          className="min-h-[44px] px-2.5 md:px-3 py-1.5 md:py-2 bg-white text-[#1D4ED8] border border-[#1D4ED8] rounded-xl font-bold text-sm hover:bg-[#EFF6FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap truncate"
        >
          <span className="truncate">
            {isProvisioningSheet ? "준비 중…" : "📐 발표자료 꾸미기"}
          </span>
        </button>
      </div>
    </div>
  );
}
