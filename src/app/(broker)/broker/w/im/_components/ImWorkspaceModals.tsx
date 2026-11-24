"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { ImFullscreenModal } from "./ImFullscreenModal";
import {
  isSampleSeedImItem,
  type BasicImSlideSummary,
  type ImListItem,
} from "./im-workspace-types";

const ImDataBottomSheet = dynamic(
  () =>
    import("@/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet").then(
      (m) => m.ImDataBottomSheet
    ),
  { ssr: false, loading: () => null }
);

export interface ImWorkspaceModalsProps {
  bottomSheetBuildingId: string;
  isBottomSheetOpen: boolean;
  onCloseBottomSheet: () => void;
  address: string;
  askingPriceManwon: number;
  totalDepositManwon: number;
  totalRentManwon: number;
  normalizedPosture: string;
  pendingDeleteIm: ImListItem | null;
  onCancelDelete: () => void;
  onConfirmDelete: (target: ImListItem) => void;
  fullscreenModalUrl: string | null;
  fullscreenTitle: string;
  previewTab: "mobile" | "pptx";
  onChangePreviewTab: (tab: "mobile" | "pptx") => void;
  onCloseFullscreen: () => void;
  basicImSlides: BasicImSlideSummary[];
  renderSlideCard: (slide: BasicImSlideSummary) => React.ReactNode;
}

export function ImWorkspaceModals({
  bottomSheetBuildingId,
  isBottomSheetOpen,
  onCloseBottomSheet,
  address,
  askingPriceManwon,
  totalDepositManwon,
  totalRentManwon,
  normalizedPosture,
  pendingDeleteIm,
  onCancelDelete,
  onConfirmDelete,
  fullscreenModalUrl,
  fullscreenTitle,
  previewTab,
  onChangePreviewTab,
  onCloseFullscreen,
  basicImSlides,
  renderSlideCard,
}: ImWorkspaceModalsProps) {
  return (
    <>
      <ImDataBottomSheet
        key={bottomSheetBuildingId}
        buildingId={bottomSheetBuildingId}
        isOpen={isBottomSheetOpen}
        onClose={onCloseBottomSheet}
        initialAddress={address}
        prefillAskingPrice={askingPriceManwon}
        prefillTotalDeposit={totalDepositManwon}
        prefillMonthlyRent={totalRentManwon}
        initialInvestmentPosture={normalizedPosture}
      />

      <ConfirmDeleteModal
        isOpen={pendingDeleteIm !== null}
        title={`'${pendingDeleteIm?.title || "새 IM"}'을(를) 삭제할까요?`}
        description={
          pendingDeleteIm?.status === "published"
            ? "이미 발행된 IM 자료입니다. 삭제하더라도 하단 되돌리기 버튼으로 잠시 복구할 수 있습니다."
            : "삭제한 IM은 하단 되돌리기 버튼으로 잠시 복구할 수 있습니다."
        }
        requireMatchText={
          pendingDeleteIm &&
          pendingDeleteIm.status === "published" &&
          !isSampleSeedImItem(pendingDeleteIm) &&
          pendingDeleteIm.title?.trim() &&
          pendingDeleteIm.title.trim() !== "새 IM"
            ? pendingDeleteIm.title.trim()
            : undefined
        }
        matchInputLabel="삭제를 확정하려면 위 IM 제목을 그대로 입력해 주세요."
        onCancel={onCancelDelete}
        onConfirm={() => {
          if (pendingDeleteIm) {
            onConfirmDelete(pendingDeleteIm);
          }
          onCancelDelete();
        }}
      />

      <ImFullscreenModal
        fullscreenModalUrl={fullscreenModalUrl}
        title={fullscreenTitle}
        previewTab={previewTab}
        onChangePreviewTab={onChangePreviewTab}
        onClose={onCloseFullscreen}
        basicImSlides={basicImSlides}
        renderSlideCard={renderSlideCard}
      />
    </>
  );
}
