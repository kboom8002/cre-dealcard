"use client";

import React from "react";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import type { SavedEditionSummary } from "./magazine-workspace-types";

export const PUBLISHED_EDITION_DELETE_WARNING =
  "이미 발행된 소식지입니다. 삭제하면 고객에게 보낸 열람 링크도 더 이상 열리지 않습니다. 정말 삭제하시겠습니까?";

export interface EditionDeleteModalProps {
  targetEdition: SavedEditionSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EditionDeleteModal({
  targetEdition,
  onCancel,
  onConfirm,
}: EditionDeleteModalProps) {
  const isPublishedEdition = targetEdition?.status === "published";
  const displayLabel = targetEdition
    ? targetEdition.title || `${targetEdition.slug} 뉴스레터`
    : "";

  return (
    <ConfirmDeleteModal
      isOpen={targetEdition !== null}
      title={
        isPublishedEdition
          ? `발행된 "${displayLabel}" 항목을 삭제할까요?`
          : `"${displayLabel}" 초안을 삭제할까요?`
      }
      description={
        isPublishedEdition
          ? PUBLISHED_EDITION_DELETE_WARNING
          : "삭제한 항목은 하단 되돌리기 알림으로 잠시 복구할 수 있습니다."
      }
      confirmLabel="삭제하기"
      cancelLabel="취소"
      tone="danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
