"use client";

import React from "react";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { PairedMemoTopCard } from "@/components/broker/deal-card/PairedMemoTopCard";
import { ZeroBlankStarterCard } from "@/components/workspace/ZeroBlankStarterCard";
import { SelectedItemActions } from "@/components/workspace/list/WorkspaceList";
import type { ListViewMode } from "@/components/workspace/list/useListViewMode";
import type { Card4Data, DealCardGenerationSource } from "@/lib/deal-card/card4-schema";
import type { UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import type { BuildingListItem } from "./dealcards-types";

export interface DealCardEditorColumnProps {
  viewMode: ListViewMode;
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
  onCreateNew: () => void;
  onFillSample: () => void;
  onMemoTextChange: (nextText: string) => void;
  onGenerateFromMemo: () => void;
  onSaveMemoOnly: () => void;
  onSkipMemoManual: () => void;
  onOpenMemoImportModal: () => void;
  onCardChange: (targetId: string, next: Card4Data) => void;
  onFocusEditorUnit: (unitId: string) => void;
  onDuplicateItem: (item: BuildingListItem, e: React.MouseEvent) => void;
  onDeleteItem: (item: BuildingListItem, e: React.MouseEvent) => void;
  onDeleteUnconvertedMemo: (memo: UnconvertedMemoItem, e: React.MouseEvent) => void;
  onOpenImForBuilding: (buildingId: string) => void;
  isSingleUntouchedStarter?: boolean;
}

export function DealCardEditorColumn({
  viewMode,
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
  onCreateNew,
  onFillSample,
  onMemoTextChange,
  onGenerateFromMemo,
  onSaveMemoOnly,
  onSkipMemoManual,
  onOpenMemoImportModal,
  onCardChange,
  onFocusEditorUnit,
  onDuplicateItem,
  onDeleteItem,
  onDeleteUnconvertedMemo,
  onOpenImForBuilding,
  isSingleUntouchedStarter = false,
}: DealCardEditorColumnProps) {
  return (
    <div className="space-y-4">
      {viewMode === "simple" &&
        (selectedMemoOnly ? (
          <SelectedItemActions
            itemLabel="미생성 매물 메모"
            onDelete={(e) => onDeleteUnconvertedMemo(selectedMemoOnly, e)}
          />
        ) : activeItem ? (
          <SelectedItemActions
            itemLabel={activeItem.title || "새 딜카드"}
            onDuplicate={(e) => onDuplicateItem(activeItem, e)}
            onDelete={(e) => onDeleteItem(activeItem, e)}
            deleteLabel={isSingleUntouchedStarter ? "입력 비우기" : "삭제하기"}
          />
        ) : null)}

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

      {(isBlankCard || isAwaitingMemoGeneration) &&
        !activeMemoText.trim() &&
        !isSampleCard && (
          <ZeroBlankStarterCard
            testId="dealcard-zero-blank-starter"
            heading="어떻게 시작하시겠어요? 가장 편한 방법 1가지를 누르세요"
            subheading="빈 칸이 부담스러우면 아래 3가지 중 하나만 고르시면 바로 이어집니다."
            options={[
              {
                id: "paste_memo",
                badge: "가장 빠름",
                title: "📋 내 메모 붙여넣기로 10초 시작",
                subtitle: "카톡·문자·수첩 메모를 넣으면 4칸 요약과 문구를 자동 정리합니다",
                testId: "dealcard-starter-paste-btn",
                onClick: () => {
                  memoTextareaRef.current?.focus();
                  memoTextareaRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                },
              },
              {
                id: "manual_4fields",
                badge: "직접 입력",
                title: "✍️ 메모 없이 직접 4칸 채우기",
                subtitle: "지역·용도·면적·가격대만 간단히 적고 바로 시작합니다",
                testId: "dealcard-starter-manual-btn",
                onClick: onSkipMemoManual,
              },
              {
                id: "try_sample",
                badge: "둘러보기",
                title: "✨ 연습 예시 넣어보기",
                subtitle: "샘플 매물로 딜카드 화면이 어떻게 나오는지 먼저 확인합니다",
                testId: "dealcard-starter-sample-btn",
                onClick: onFillSample,
              },
            ]}
          />
        )}

      <PairedMemoTopCard
        mode={isAwaitingMemoGeneration ? "capture" : "paired"}
        memoText={activeMemoText}
        onMemoTextChange={onMemoTextChange}
        onGenerateFromMemo={onGenerateFromMemo}
        onSaveMemoOnly={onSaveMemoOnly}
        onSkipMemoManual={onSkipMemoManual}
        onOpenMemoImportModal={onOpenMemoImportModal}
        isGenerating={isGeneratingFromMemo}
        memoSaveStatus={memoSaveStatus}
        generationSource={activeGenerationSource}
        textareaRef={memoTextareaRef}
      />

      {isAwaitingMemoGeneration ? (
        <div
          data-testid="dealcard-awaiting-memo-guide"
          className="p-4 rounded-2xl bg-white/92 border border-dashed border-slate-300 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm font-extrabold text-[#1D1D1F] break-keep">
            위 메모창에 매물 메모를 적고 [✨ 메모로 딜카드 생성하기]를 눌러 주세요.
          </p>
          {!selectedMemoOnly && (
            <button
              type="button"
              data-testid="dealcard-fill-sample-btn"
              onClick={onFillSample}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-sm font-extrabold transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              예시 채우기
            </button>
          )}
        </div>
      ) : (
        <div
          data-testid="dealcard-editor-toolbar"
          className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5"
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
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
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
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-sm font-extrabold transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>📊 이 매물로 IM 편집 →</span>
              </a>
            )}
          </div>
        </div>
      )}

      <div
        data-testid="dealcard-card4-stage"
        data-collapsed={isAwaitingMemoGeneration ? "true" : "false"}
        aria-hidden={isAwaitingMemoGeneration ? "true" : undefined}
        className={isAwaitingMemoGeneration ? "hidden" : "space-y-4"}
      >
        <Card4ConfirmCard
          key={editorTargetId || "memo-only"}
          card4={effectiveCard4}
          onChange={(next) => onCardChange(editorTargetId, next)}
          onFocusUnit={onFocusEditorUnit}
        />
      </div>
    </div>
  );
}
