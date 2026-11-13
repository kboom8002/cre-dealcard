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
}: PreviewCausalityBarProps) {
  if (lifecycle === "pre_generation") {
    return (
      <div
        data-testid="preview-causality-bar"
        data-lifecycle="pre_generation"
        role="status"
        aria-live="polite"
        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full border-2 border-slate-500 bg-transparent shrink-0"
          />
          <span className="text-sm font-bold text-slate-900">미리보기 생성 전</span>
          <span className="text-sm text-slate-600 break-keep">
            · 핵심 항목을 입력하면 즉시 만들어집니다
          </span>
        </div>
        {onStartInput && (
          <button
            type="button"
            data-testid="preview-causality-start-btn"
            onClick={onStartInput}
            className="min-h-[44px] px-3.5 rounded-lg bg-[#007AFF] hover:bg-[#0062CC] text-white text-sm font-bold transition cursor-pointer shrink-0"
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
        className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs"
      >
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-amber-950 break-keep">
            ▲ 고친 내용이 아직 고객 화면에는 반영 전입니다
          </p>
          <p className="text-sm text-amber-900 mt-0.5 break-keep">
            미리보기에는 반영되었습니다. 고객 링크·자료에도 적용하려면 오른쪽 버튼을 눌러 주세요.
          </p>
        </div>
        {onResyncPublished && (
          <button
            type="button"
            data-testid="preview-causality-resync-btn"
            onClick={onResyncPublished}
            disabled={isSyncing}
            className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-extrabold whitespace-nowrap transition cursor-pointer shrink-0"
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
        className="rounded-xl border border-emerald-300 bg-emerald-50/90 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-extrabold text-emerald-900">
            ✓ 고객 화면과 일치
          </span>
          <span className="text-sm text-emerald-800 break-keep">
            · 지금 보이는 내용 그대로 반영되어 있습니다
          </span>
        </div>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={liveLinkTestId || "preview-causality-live-link"}
            className="min-h-[44px] inline-flex items-center px-3 rounded-lg bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 text-sm font-bold whitespace-nowrap transition shrink-0"
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
      className="rounded-xl border border-blue-200 bg-blue-50/85 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-1.5"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-full bg-[#007AFF] shrink-0"
        />
        <span className="text-sm font-extrabold text-blue-950">실시간 미리보기</span>
        <span className="text-sm text-blue-900 break-keep">
          · 편집 즉시 반영 · 항목을 누르면 해당 입력칸이 열립니다
        </span>
      </div>
    </div>
  );
}
