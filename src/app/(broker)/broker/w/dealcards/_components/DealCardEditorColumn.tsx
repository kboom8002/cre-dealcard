"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { PairedMemoTopCard } from "@/components/broker/deal-card/PairedMemoTopCard";
import type { PreviewLifecycleState } from "@/components/workspace/preview-sync/useEditorPreviewSync";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import type { Card4Data, DealCardGenerationSource } from "@/lib/deal-card/card4-schema";
import type { UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import type { BuildingListItem } from "./dealcards-types";

export interface DealCardEditorColumnProps {
  viewMode?: ListViewMode;
  selectedMemoOnly: UnconvertedMemoItem | null;
  activeItem: BuildingListItem | null;
  isSampleCard: boolean;
  isBlankCard: boolean;
  isAwaitingMemoGeneration: boolean;
  activeMemoText: string;
  isGeneratingFromMemo: boolean;
  memoSaveStatus: "idle" | "saving" | "saved";
  activeGenerationSource: DealCardGenerationSource;
  memoTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  editorTargetId: string;
  effectiveCard4: Card4Data;
  previewLifecycle?: PreviewLifecycleState;
  liveUrl?: string | null;
  publishError?: { message: string; code?: string } | null;
  onResyncPublished?: () => void;
  onCopyLiveUrl?: (url: string) => void;
  onCreateNew: () => void;
  onFillSample: () => void;
  onMemoTextChange: (nextText: string) => void;
  onGenerateFromMemo: () => void;
  onSaveMemoOnly: () => void;
  onSkipMemoManual: () => void;
  onOpenMemoImportModal: () => void;
  onCardChange: (targetId: string, next: Card4Data) => void;
  onFocusEditorUnit: (unitId: string) => void;
  onDuplicateItem?: (item: BuildingListItem, e: React.MouseEvent) => void;
  onDeleteItem?: (item: BuildingListItem, e: React.MouseEvent) => void;
  onDeleteUnconvertedMemo?: (memo: UnconvertedMemoItem, e: React.MouseEvent) => void;
  onOpenImForBuilding: (buildingId: string) => void;
  isSingleUntouchedStarter?: boolean;
  justRefilledTick?: number;
}

export function DealCardEditorColumn({
  selectedMemoOnly,
  activeItem,
  isSampleCard,
  isBlankCard,
  isAwaitingMemoGeneration,
  activeMemoText,
  isGeneratingFromMemo,
  memoSaveStatus,
  activeGenerationSource,
  memoTextareaRef,
  editorTargetId,
  effectiveCard4,
  previewLifecycle,
  liveUrl,
  publishError,
  onResyncPublished,
  onCopyLiveUrl,
  onCreateNew,
  onFillSample,
  onMemoTextChange,
  onGenerateFromMemo,
  onSaveMemoOnly,
  onSkipMemoManual,
  onOpenMemoImportModal,
  onCardChange,
  onFocusEditorUnit,
  onOpenImForBuilding,
  justRefilledTick = 0,
}: DealCardEditorColumnProps) {
  const [showRefilledHighlight, setShowRefilledHighlight] = useState(false);

  useEffect(() => {
    if (!justRefilledTick || justRefilledTick <= 0) {
      setShowRefilledHighlight(false);
      return;
    }
    setShowRefilledHighlight(true);
    const timer = window.setTimeout(() => {
      setShowRefilledHighlight(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [justRefilledTick]);

  const showInlineStatusStrip = Boolean(
    activeItem?.status === "sent" || previewLifecycle === "published_dirty" || publishError
  );

  return (
    <div className="space-y-4">
      {showInlineStatusStrip && (
        <div
          data-testid="dealcard-inline-status-strip"
          className="xl:hidden space-y-2.5"
        >
          {(activeItem?.status === "sent" || previewLifecycle === "published_dirty") && (
            <div
              className={`rounded-2xl border p-3.5 space-y-2.5 ${
                previewLifecycle === "published_dirty"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-emerald-200 bg-emerald-50/80 text-emerald-950"
              }`}
            >
              {previewLifecycle === "published_dirty" ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-snug">
                    보낸 딜카드에 아직 반영되지 않은 수정 내용이 있습니다.
                  </p>
                  {onResyncPublished && (
                    <button
                      type="button"
                      data-testid="dealcard-inline-resync-btn"
                      onClick={onResyncPublished}
                      className="min-h-[44px] rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      수정한 내용 고객 화면에 반영하기
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm font-bold">
                  고객에게 보낸 공개 링크가 활성화되어 있습니다.
                </p>
              )}

              {liveUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-slate-800">
                    {liveUrl}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="dealcard-inline-live-link"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100 whitespace-nowrap"
                    >
                      열기 ↗
                    </a>
                    {onCopyLiveUrl && (
                      <button
                        type="button"
                        data-testid="dealcard-inline-copy-btn"
                        onClick={() => onCopyLiveUrl(liveUrl)}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                      >
                        복사
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {publishError && (
            <div
              role="alert"
              data-testid="dealcard-inline-publish-error"
              className="rounded-2xl border border-red-300 bg-red-50 p-3.5 text-red-900 space-y-2"
            >
              <p className="text-sm font-bold leading-relaxed">
                ⚠ {publishError.message}
              </p>
              {publishError.code === "STATUTORY_DISCLOSURE_INCOMPLETE" && (
                <Link
                  href="/broker/profile"
                  data-testid="dealcard-inline-publish-error-profile-link"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-red-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-800"
                >
                  중개사 프로필 완성하기 →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {isSampleCard && (
        <div
          data-testid="dealcard-sample-banner"
          className="px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2.5"
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-amber-950">
            <span
              data-testid="dealcard-sample-badge"
              className="inline-flex items-center rounded-md bg-amber-200 px-2 py-0.5 text-sm font-extrabold text-amber-950"
            >
              [체험 예시]
            </span>
            <span>💡 예시 딜카드(마포구 서교동)입니다.</span>
          </p>
          <button
            type="button"
            data-testid="dealcard-sample-reset-btn"
            data-theme-lock="dark"
            onClick={onCreateNew}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-sm font-extrabold transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            새 빈 딜카드
          </button>
        </div>
      )}

      <PairedMemoTopCard
        mode={isAwaitingMemoGeneration ? "capture" : "paired"}
        memoText={activeMemoText}
        onMemoTextChange={onMemoTextChange}
        onGenerateFromMemo={onGenerateFromMemo}
        onSaveMemoOnly={onSaveMemoOnly}
        onSkipMemoManual={onSkipMemoManual}
        onFillSample={!selectedMemoOnly ? onFillSample : undefined}
        onOpenMemoImportModal={onOpenMemoImportModal}
        isGenerating={isGeneratingFromMemo}
        memoSaveStatus={memoSaveStatus}
        generationSource={activeGenerationSource}
        textareaRef={memoTextareaRef}
      />

      {!isAwaitingMemoGeneration && (
        <div
          data-testid="dealcard-editor-toolbar"
          className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2.5"
        >
          <span className="text-sm font-bold text-[#3A3A3C]">
            블라인드 딜카드 편집
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {isBlankCard && (
              <button
                type="button"
                data-testid="dealcard-fill-sample-btn"
                onClick={onFillSample}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer"
              >
                예시 채우기
              </button>
            )}

            {activeItem && (
              <a
                href={`/broker/w/im?buildingId=${encodeURIComponent(activeItem.id)}`}
                data-testid="dealcard-open-im-link"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onOpenImForBuilding(activeItem.id);
                }}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#1D1D1F] border border-slate-300 text-sm font-bold transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>이 매물로 IM 편집</span>
                <ArrowRight className="h-4 w-4 text-[#515154]" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}

      <div
        data-testid="dealcard-card4-stage"
        data-collapsed={isAwaitingMemoGeneration ? "true" : "false"}
        aria-hidden={isAwaitingMemoGeneration ? "true" : undefined}
        className={
          isAwaitingMemoGeneration
            ? "hidden"
            : `space-y-4 rounded-2xl transition-all duration-300 ${
                showRefilledHighlight
                  ? "ring-2 ring-[#059669]/60 bg-white p-2 -m-2"
                  : ""
              }`
        }
      >
        {showRefilledHighlight && !isAwaitingMemoGeneration && (
          <div
            data-testid="dealcard-refilled-pill"
            role="status"
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-[#1D1D1F] text-sm font-bold leading-snug"
          >
            비공개 정보를 가린 딜카드가 채워졌습니다
          </div>
        )}
        <Card4ConfirmCard
          key={editorTargetId || "memo-only"}
          card4={effectiveCard4}
          memoText={activeMemoText}
          onChange={(next) => onCardChange(editorTargetId, next)}
          onFocusUnit={onFocusEditorUnit}
        />
      </div>
    </div>
  );
}
