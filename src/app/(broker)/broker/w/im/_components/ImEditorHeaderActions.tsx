"use client";

import React from "react";
import { Copy, Trash2 } from "lucide-react";
import { EditorHeaderActionButton } from "@/components/workspace/list/WorkspaceList";
import type { ImListItem } from "./im-workspace-types";

export function buildDuplicatedImItem(
  source: ImListItem,
  dupIds: { id: string; buildingId: string },
  ownerUserId?: string | null
): ImListItem {
  const sourceLabel = source.title?.trim() || "새 IM";
  return {
    ...source,
    id: dupIds.id,
    buildingId: dupIds.buildingId,
    ...(ownerUserId ? { ownerUserId } : {}),
    documentId: undefined,
    title: `${sourceLabel} (사본)`,
    status: "draft",
    versionLabel: "작성 중",
    updatedAt: new Date().toISOString(),
    isDirty: true,
    hasUnpublishedEdits: false,
    isSample: false,
  };
}

export interface ImEditorHeaderActionsProps {
  currentItem: ImListItem | null | undefined;
  onDuplicate: (item: ImListItem, e: React.MouseEvent) => void;
  onDelete: (item: ImListItem, e: React.MouseEvent) => void;
}

export function ImEditorHeaderActions({
  currentItem,
  onDuplicate,
  onDelete,
}: ImEditorHeaderActionsProps) {
  if (!currentItem) return null;
  const itemTitle = currentItem.title?.trim() || "새 IM";

  return (
    <>
      <EditorHeaderActionButton
        testId="im-header-duplicate-btn"
        label="복제"
        title={`${itemTitle} 복제`}
        icon={<Copy className="h-4 w-4" aria-hidden="true" />}
        onClick={(e) => onDuplicate(currentItem, e)}
      />
      <EditorHeaderActionButton
        testId="im-header-delete-btn"
        label="삭제"
        title={`${itemTitle} 삭제`}
        tone="danger"
        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
        onClick={(e) => onDelete(currentItem, e)}
      />
    </>
  );
}
