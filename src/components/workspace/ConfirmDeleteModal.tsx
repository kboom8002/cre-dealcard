"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  FOCUSABLE_SELECTOR,
  createLockCounter,
  getFocusableTrapTarget,
  getModalKeyAction,
  shouldCloseOnBackdropClick,
} from "@/components/ui/modal-logic";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  portal?: boolean;
  /** When non-empty, requires the user to type this exact trimmed text to enable deletion. */
  requireMatchText?: string;
  matchInputLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const inlineLockCounter = createLockCounter();
let savedOverflow = "";

function lockScroll() {
  if (!inlineLockCounter.acquire()) return;
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  if (!inlineLockCounter.release()) return;
  document.body.style.overflow = savedOverflow;
}

/**
 * Accessible two-step confirmation dialog using shared Modal / modal-logic primitives
 * (focus trap, Escape key close, initial focus on Cancel, body scroll lock, role="dialog", aria-modal="true").
 */
export function ConfirmDeleteModal({
  isOpen,
  title,
  description = "삭제한 항목은 하단 되돌리기 알림으로 잠시 복구할 수 있습니다.",
  confirmLabel = "삭제하기",
  cancelLabel = "취소",
  tone = "danger",
  portal = false,
  requireMatchText,
  matchInputLabel,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const uid = useId();
  const titleId = `confirm-delete-modal-title-${uid}`;
  const descId = `confirm-delete-modal-desc-${uid}`;
  const matchInputId = `confirm-delete-match-input-${uid}`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const [typedText, setTypedText] = useState("");

  const normalizedMatch = typeof requireMatchText === "string" ? requireMatchText.trim() : "";
  const needsMatch = normalizedMatch.length > 0;
  const isConfirmDisabled = needsMatch && typedText.trim() !== normalizedMatch;

  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!isOpen) {
      setTypedText("");
    }
  }, [isOpen, normalizedMatch]);

  useEffect(() => {
    if (!isOpen || portal) return;

    const trigger = document.activeElement as HTMLElement | null;
    lockScroll();

    if (!panelRef.current?.contains(document.activeElement)) {
      cancelBtnRef.current?.focus();
    }
    const raf = window.requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        cancelBtnRef.current?.focus();
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      const action = getModalKeyAction(e.key, { closeOnEscape: true });
      if (action === "close") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (action === "trap") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        const activeIndex = focusables.indexOf(
          document.activeElement as HTMLElement,
        );
        const target = getFocusableTrapTarget({
          count: focusables.length,
          activeIndex,
          shiftKey: e.shiftKey,
        });
        if (target === null) return;
        e.preventDefault();
        if (target === "container") panel.focus();
        else focusables[target]?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      unlockScroll();
      if (trigger && trigger.isConnected && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [isOpen, portal]);

  const confirmBtnClass =
    tone === "primary"
      ? "min-h-[44px] px-4 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
      : "min-h-[44px] px-4 py-2 rounded-xl bg-[#D70015] hover:bg-[#B80012] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors cursor-pointer whitespace-nowrap";

  const handleSafeConfirm = () => {
    if (isConfirmDisabled) return;
    onConfirm();
  };

  const matchConfirmationBlock = needsMatch ? (
    <div
      data-testid="confirm-delete-match-box"
      className="rounded-xl border border-rose-200 bg-rose-50/75 p-3.5 space-y-2.5"
    >
      <label
        htmlFor={matchInputId}
        className="block text-sm font-bold text-rose-950 break-keep"
      >
        {matchInputLabel || "외부에 공유된 항목입니다. 삭제하려면 아래 제목을 확인해 주세요."}
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-rose-200 px-2.5 py-1.5">
        <p
          data-testid="confirm-delete-match-target"
          className="text-sm font-extrabold text-slate-900 select-all break-keep"
        >
          {normalizedMatch}
        </p>
        <button
          type="button"
          data-testid="confirm-delete-autofill-btn"
          onClick={() => setTypedText(normalizedMatch)}
          className="min-h-[38px] px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 border border-rose-300 text-sm font-extrabold text-rose-950 shrink-0 cursor-pointer whitespace-nowrap"
        >
          제목 자동 채우기
        </button>
      </div>
      <input
        id={matchInputId}
        type="text"
        data-testid="confirm-delete-match-input"
        value={typedText}
        onChange={(e) => setTypedText(e.target.value)}
        placeholder="위 제목을 입력하거나 [제목 자동 채우기]를 누르세요"
        autoComplete="off"
        className="w-full min-h-[44px] px-3 rounded-lg bg-white border border-rose-300 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      {isConfirmDisabled && (
        <p className="text-sm font-semibold text-rose-900 break-keep">
          [제목 자동 채우기]를 누르거나 제목을 똑같이 입력하면 [삭제하기] 버튼이 켜집니다.
        </p>
      )}
    </div>
  ) : null;

  if (portal) {
    return (
      <Modal
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) onCancel();
        }}
        title={title}
        description={description}
        size="sm"
        initialFocusRef={cancelBtnRef}
      >
        <div data-testid="confirm-delete-modal" className="space-y-4">
          {matchConfirmationBlock}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              ref={cancelBtnRef}
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
              disabled={isConfirmDisabled}
              onClick={handleSafeConfirm}
              className={confirmBtnClass}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid="confirm-delete-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-xs"
        onMouseDown={(e) => {
          if (
            shouldCloseOnBackdropClick({
              enabled: true,
              targetIsBackdrop: e.target === e.currentTarget,
            })
          ) {
            onCancel();
          }
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xl space-y-4 outline-none"
      >
        <div className="space-y-1.5">
          <h2
            id={titleId}
            className="text-lg font-extrabold text-[#1D1D1F] break-keep"
          >
            {title}
          </h2>
          {description && (
            <p id={descId} className="text-sm text-[#515154] break-keep">
              {description}
            </p>
          )}
        </div>

        {matchConfirmationBlock}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            ref={cancelBtnRef}
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
            disabled={isConfirmDisabled}
            onClick={handleSafeConfirm}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
