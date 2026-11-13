"use client";

import React, { useEffect } from "react";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Accessible two-step confirmation dialog before deleting DealCard, memo, or IM items.
 */
export function ConfirmDeleteModal({
  isOpen,
  title,
  description = "삭제한 항목은 하단 되돌리기 알림으로 잠시 복구할 수 있습니다.",
  confirmLabel = "삭제하기",
  cancelLabel = "취소",
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-modal-title"
      data-testid="confirm-delete-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h2
            id="confirm-delete-modal-title"
            className="text-lg font-extrabold text-[#1D1D1F] break-keep"
          >
            {title}
          </h2>
          {description && (
            <p className="text-sm text-[#515154] break-keep">{description}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="confirm-delete-cancel-btn"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1D1D1F] font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-delete-confirm-btn"
            onClick={onConfirm}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D70015] hover:bg-[#B80012] text-white font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
