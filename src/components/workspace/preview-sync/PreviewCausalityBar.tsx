"use client";

import React from "react";
import type { PreviewLifecycleState } from "./useEditorPreviewSync";

export interface PreviewCausalityBarProps {
  lifecycle: PreviewLifecycleState;
  /** Action triggered when user clicks [첫 항목 입력하기] in pre_generation state */
  onStartInput?: () => void;
  startButtonLabel?: string;
  /** Action triggered when user clicks [변경사항 바로 반영하기] in published_dirty state */
  onResyncPublished?: () => void;
  resyncButtonLabel?: string;
  isSyncing?: boolean;
  /** Optional public URL shown in published_clean state */
  liveUrl?: string | null;
  liveUrlLabel?: string;
  liveLinkTestId?: string;
  /** Optional auxiliary action (e.g. 전체화면 링크) shown inline on the right */
  auxActionSlot?: React.ReactNode;
}

export function PreviewCausalityBar({
  lifecycle,
  onStartInput,
  startButtonLabel = "첫 항목 입력하기",
  onResyncPublished,
  resyncButtonLabel = "변경사항 바로 반영하기",
  isSyncing = false,
  liveUrl,
  liveUrlLabel = "고객 화면 열기 ↗",
  liveLinkTestId,
  auxActionSlot,
}: PreviewCausalityBarProps) {
  if (lifecycle === "pre_generation") {
    return (
      <div
        data-testid="preview-causality-bar"
        data-lifecycle="pre_generation"
        role="status"
        aria-live="polite"
        className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 flex flex-col items-stretch gap-1.5 shadow-2xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900 min-w-0">
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full border-2 border-slate-500 bg-transparent shrink-0"
            />
            <span className="break-keep">미리보기 생성 전</span>
          </span>
          {auxActionSlot && <div className="shrink-0">{auxActionSlot}</div>}
        </div>
        <p className="text-sm text-slate-600 break-keep">
          핵심 항목을 입력하면 즉시 만들어집니다
        </p>
        {onStartInput && (
          <button
            type="button"
            data-testid="preview-causality-start-btn"
            onClick={onStartInput}
            className="w-full min-h-[44px] px-3.5 rounded-lg bg-[#007AFF] hover:bg-[#0062CC] text-white text-sm font-bold transition cursor-pointer"
          >
            {startButtonLabel}
          </button>
        )}
      </div>
    );
  }

  if (lifecycle === "published_dirty") {
    return (
      <div
        data-testid="preview-causality-bar"
        data-lifecycle="published_dirty"
        role="status"
        aria-live="polite"
        className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-3 flex flex-col items-stretch gap-2.5 shadow-xs"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-extrabold text-amber-950 break-keep">
              ▲ 고친 내용이 아직 고객 화면에는 반영 전입니다
            </p>
            <p className="text-sm text-amber-900 break-keep">
              미리보기에만 반영된 상태입니다. 아래 버튼을 누르면 고객 링크에도 적용됩니다.
            </p>
          </div>
          {auxActionSlot && <div className="shrink-0">{auxActionSlot}</div>}
        </div>
        {onResyncPublished && (
          <button
            type="button"
            data-testid="preview-causality-resync-btn"
            onClick={onResyncPublished}
            disabled={isSyncing}
            className="w-full min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-extrabold whitespace-nowrap transition cursor-pointer"
          >
            {isSyncing ? "반영 중…" : resyncButtonLabel}
          </button>
        )}
      </div>
    );
  }

  if (lifecycle === "published_clean") {
    return (
      <div
        data-testid="preview-causality-bar"
        data-lifecycle="published_clean"
        role="status"
        aria-live="polite"
        className="rounded-xl border border-emerald-300 bg-emerald-50/90 px-3.5 py-2.5 flex flex-col items-stretch gap-1.5 shadow-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-emerald-900 break-keep">
            ✓ 고객 화면과 일치
          </span>
          {auxActionSlot && <div className="shrink-0">{auxActionSlot}</div>}
        </div>
        <p className="text-sm text-emerald-800 break-keep">
          지금 보이는 내용 그대로 반영되어 있습니다
        </p>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={liveLinkTestId || "preview-causality-live-link"}
            className="min-h-[44px] w-full inline-flex items-center justify-center px-3 rounded-lg bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 text-sm font-bold whitespace-nowrap transition"
          >
            {liveUrlLabel}
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="preview-causality-bar"
      data-lifecycle="live_draft"
      role="status"
      aria-live="polite"
      className="rounded-xl border border-blue-200 bg-blue-50/85 px-3.5 py-2.5 flex flex-col items-stretch gap-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-extrabold text-blue-950 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full bg-[#007AFF] shrink-0"
          />
          <span className="break-keep">실시간 미리보기</span>
        </span>
        {auxActionSlot && <div className="shrink-0">{auxActionSlot}</div>}
      </div>
      <p className="text-sm text-blue-900 break-keep">
        항목을 누르면 해당 입력칸이 열립니다
      </p>
    </div>
  );
}
