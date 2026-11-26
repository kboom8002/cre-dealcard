"use client";

import React, { useEffect, useId, useRef } from "react";
import {
  FOCUSABLE_SELECTOR,
  createModalStack,
  getFocusableTrapTarget,
  getModalKeyAction,
} from "@/components/ui/modal-logic";
import { formatKrPhoneInput } from "@/lib/format/phone";
import type {
  BrokerInventoryDeal,
  InboxClientRole,
  InboxThreadItem,
  InboxTransactionalBasis,
} from "./inbox-types";

const inboxModalStack = createModalStack();

function useInboxModalA11y(
  open: boolean,
  onClose: () => void,
  dialogRef: React.RefObject<HTMLDivElement | null>,
  initialFocusRef?: React.RefObject<HTMLElement | null>
) {
  const modalId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    inboxModalStack.push(modalId);

    const panel = dialogRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const targetFocus =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (targetFocus) {
        targetFocus.focus();
      } else {
        panel.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!inboxModalStack.isTop(modalId)) return;
      const action = getModalKeyAction(e.key, { closeOnEscape: true });
      if (action === "close") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (action === "trap") {
        const currentPanel = dialogRef.current;
        if (!currentPanel) return;
        const focusables = Array.from(
          currentPanel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        const activeIndex = focusables.indexOf(
          document.activeElement as HTMLElement
        );
        const target = getFocusableTrapTarget({
          count: focusables.length,
          activeIndex,
          shiftKey: e.shiftKey,
        });
        if (target === null) return;
        e.preventDefault();
        if (target === "container") {
          currentPanel.focus();
        } else {
          focusables[target]?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      inboxModalStack.remove(modalId);
      if (
        previousActive &&
        previousActive.isConnected &&
        typeof previousActive.focus === "function"
      ) {
        previousActive.focus();
      }
    };
  }, [open, modalId, dialogRef, initialFocusRef]);
}

export interface InboxClientFormValues {
  name: string;
  phone: string;
  email: string;
  company?: string;
  basis: "" | InboxTransactionalBasis;
  grade: "VIP" | "일반" | "잠재";
  role: InboxClientRole;
  buildingTitle: string;
  budget: string;
  region: string;
  freeMemo: string;
  newsletterOptIn: boolean;
}

export interface InboxNewClientModalProps {
  open: boolean;
  values: InboxClientFormValues;
  inventory: BrokerInventoryDeal[];
  existingThreads?: InboxThreadItem[];
  busyAction: string | null;
  dialogTitle?: string;
  onSwitchToBulkImport?: () => void;
  onChange: (patch: Partial<InboxClientFormValues>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function InboxNewClientModal({
  open,
  values,
  inventory,
  existingThreads = [],
  busyAction,
  dialogTitle = "신규 고객 등록",
  onSwitchToBulkImport,
  onChange,
  onClose,
  onSubmit,
}: InboxNewClientModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useInboxModalA11y(open, onClose, dialogRef, nameInputRef);

  if (!open) return null;

  const phoneDigits = values.phone.replace(/\D/g, "");
  const emailLower = values.email.trim().toLowerCase();
  const duplicateClientMatch = existingThreads.find((thread) => {
    const tPhone = (thread.clientPhone || "").replace(/\D/g, "");
    const tEmail = (thread.clientEmail || "").trim().toLowerCase();
    const matchedPhone = phoneDigits.length >= 9 && tPhone.length >= 9 && tPhone === phoneDigits;
    const matchedEmail = emailLower.includes("@") && tEmail.length > 0 && tEmail === emailLower;
    return matchedPhone || matchedEmail;
  });

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-new-client-dialog-title"
        tabIndex={-1}
        data-testid="inbox-new-client-dialog"
        className="my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 p-6 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="inbox-new-client-dialog-title"
            className="text-lg font-extrabold text-slate-900"
          >
            {dialogTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            닫기
          </button>
        </div>

        {onSwitchToBulkImport && (
          <div
            role="tablist"
            aria-label="고객 등록 방식 선택"
            className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="min-h-[44px] rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-blue-700 shadow-2xs cursor-pointer"
            >
              직접 등록
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              data-testid="inbox-open-bulk-import-btn"
              onClick={() => {
                onClose();
                onSwitchToBulkImport();
              }}
              className="min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-white/70 cursor-pointer"
            >
              📋 엑셀·명단 대량 등록
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="new-client-name"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              고객 성함 (필수)
            </label>
            <input
              ref={nameInputRef}
              id="new-client-name"
              data-testid="new-client-name-input"
              type="text"
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="예: 홍길동 대표"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-client-phone"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                연락처 (선택)
              </label>
              <input
                id="new-client-phone"
                data-testid="new-client-phone-input"
                type="tel"
                value={values.phone}
                onChange={(e) => onChange({ phone: formatKrPhoneInput(e.target.value) })}
                placeholder="예: 010-1234-5678"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="new-client-email"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                이메일 (선택)
              </label>
              <input
                id="new-client-email"
                data-testid="new-client-email-input"
                type="email"
                value={values.email}
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="예: buyer@company.co.kr"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-client-company"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              소속·회사 <span className="text-sm font-normal text-slate-500">(선택)</span>
            </label>
            <input
              id="new-client-company"
              data-testid="new-client-company-input"
              type="text"
              value={values.company ?? ""}
              onChange={(e) => onChange({ company: e.target.value })}
              placeholder="예: OO자산운용 / 개인 투자자"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {duplicateClientMatch && (
            <div
              data-testid="new-client-duplicate-warning"
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900"
            >
              이미 등록된 고객과 연락처 또는 이메일이 같습니다:{" "}
              <strong className="font-extrabold">{duplicateClientMatch.clientName}</strong>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-client-role"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                거래 역할
              </label>
              <select
                id="new-client-role"
                data-testid="new-client-role-select"
                value={values.role}
                onChange={(e) =>
                  onChange({ role: e.target.value as InboxClientRole })
                }
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="buyer">매수</option>
                <option value="seller">매도</option>
                <option value="tenant">임차</option>
                <option value="partner">공동중개</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="new-client-grade"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                고객 등급
              </label>
              <select
                id="new-client-grade"
                data-testid="new-client-grade-select"
                value={values.grade}
                onChange={(e) =>
                  onChange({ grade: e.target.value as "VIP" | "일반" | "잠재" })
                }
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="VIP">VIP</option>
                <option value="일반">일반</option>
                <option value="잠재">잠재</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-client-basis"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              상담·안내 근거 (선택)
            </label>
            <select
              id="new-client-basis"
              data-testid="new-client-basis-select"
              value={values.basis}
              onChange={(e) =>
                onChange({
                  basis: e.target.value as "" | InboxTransactionalBasis,
                })
              }
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="">미확인 (상담 전)</option>
              <option value="im_request">고객 IM 열람 요청</option>
              <option value="property_inquiry">고객 매물 문의 접수</option>
              <option value="tour_booking">현장 임장·미팅 예약</option>
              <option value="broker_manual">기존 상담 고객 1:1 안내</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="new-client-building"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              관심 매물명 (선택)
            </label>
            {inventory.length > 0 && (
              <select
                data-testid="new-client-building-select"
                aria-label="보유 매물에서 선택"
                value={
                  inventory.some((deal) => deal.title === values.buildingTitle)
                    ? values.buildingTitle
                    : ""
                }
                onChange={(e) => {
                  if (e.target.value) {
                    onChange({ buildingTitle: e.target.value });
                  }
                }}
                className="mb-2 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="">보유 매물 목록에서 선택하거나 아래에 직접 입력</option>
                {inventory.map((deal) => (
                  <option key={deal.buildingId} value={deal.title}>
                    {deal.title}
                  </option>
                ))}
              </select>
            )}
            <input
              id="new-client-building"
              list="inbox-inventory-buildings"
              type="text"
              value={values.buildingTitle}
              onChange={(e) => onChange({ buildingTitle: e.target.value })}
              placeholder="예: 역삼동 코너 근생빌딩"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {inventory.length > 0 && (
              <datalist id="inbox-inventory-buildings">
                {inventory.map((deal) => (
                  <option key={deal.buildingId} value={deal.title} />
                ))}
              </datalist>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-client-budget"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                희망 예산 (선택)
              </label>
              <input
                id="new-client-budget"
                data-testid="new-client-budget-input"
                type="text"
                value={values.budget}
                onChange={(e) => onChange({ budget: e.target.value })}
                placeholder="예: 100~130억"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-client-region"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                선호 권역 (선택)
              </label>
              <input
                id="new-client-region"
                data-testid="new-client-region-input"
                type="text"
                value={values.region}
                onChange={(e) => onChange({ region: e.target.value })}
                placeholder="예: 강남구, 영등포구"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-client-free-memo"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              상담 메모 (선택)
            </label>
            <textarea
              id="new-client-free-memo"
              data-testid="new-client-free-memo-input"
              rows={2}
              value={values.freeMemo}
              onChange={(e) => onChange({ freeMemo: e.target.value })}
              placeholder="예: 역세권 30~50억대 신축 우선, 이번 주 현장 답사 희망"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <input
              id="new-client-newsletter"
              data-testid="new-client-newsletter-checkbox"
              type="checkbox"
              checked={values.newsletterOptIn}
              onChange={(e) => onChange({ newsletterOptIn: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="new-client-newsletter"
              className="text-sm font-semibold text-slate-800 cursor-pointer"
            >
              시장 브리핑 뉴스레터 수신에 동의한 고객입니다 (선택)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              data-testid="submit-new-client-btn"
              disabled={Boolean(busyAction)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              고객 등록하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface InboxEditClientModalProps {
  open: boolean;
  values: Omit<InboxClientFormValues, "newsletterOptIn">;
  busyAction: string | null;
  onChange: (patch: Partial<Omit<InboxClientFormValues, "newsletterOptIn">>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function InboxEditClientModal({
  open,
  values,
  busyAction,
  onChange,
  onClose,
  onSubmit,
}: InboxEditClientModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useInboxModalA11y(open, onClose, dialogRef, nameInputRef);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-edit-client-dialog-title"
        tabIndex={-1}
        data-testid="inbox-edit-client-dialog"
        className="my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 p-6 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="inbox-edit-client-dialog-title"
            className="text-lg font-extrabold text-slate-900"
          >
            고객 정보 수정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            닫기
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="edit-client-name"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              고객 성함 (필수)
            </label>
            <input
              ref={nameInputRef}
              id="edit-client-name"
              data-testid="edit-client-name-input"
              type="text"
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-client-phone"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                연락처
              </label>
              <input
                id="edit-client-phone"
                data-testid="edit-client-phone-input"
                type="tel"
                value={values.phone}
                onChange={(e) => onChange({ phone: formatKrPhoneInput(e.target.value) })}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-client-email"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                이메일 (선택)
              </label>
              <input
                id="edit-client-email"
                data-testid="edit-client-email-input"
                type="email"
                value={values.email}
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="예: buyer@company.co.kr"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-client-company"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              소속·회사 <span className="text-sm font-normal text-slate-500">(선택)</span>
            </label>
            <input
              id="edit-client-company"
              data-testid="edit-client-company-input"
              type="text"
              value={values.company ?? ""}
              onChange={(e) => onChange({ company: e.target.value })}
              placeholder="예: OO자산운용 / 개인 투자자"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-client-role"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                거래 역할
              </label>
              <select
                id="edit-client-role"
                data-testid="edit-client-role-select"
                value={values.role}
                onChange={(e) =>
                  onChange({ role: e.target.value as InboxClientRole })
                }
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="buyer">매수</option>
                <option value="seller">매도</option>
                <option value="tenant">임차</option>
                <option value="partner">공동중개</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-client-grade"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                고객 등급
              </label>
              <select
                id="edit-client-grade"
                data-testid="edit-client-grade-select"
                value={values.grade}
                onChange={(e) =>
                  onChange({ grade: e.target.value as "VIP" | "일반" | "잠재" })
                }
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="VIP">VIP</option>
                <option value="일반">일반</option>
                <option value="잠재">잠재</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-client-basis"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              상담·안내 근거
            </label>
            <select
              id="edit-client-basis"
              data-testid="edit-client-basis-select"
              value={values.basis}
              onChange={(e) =>
                onChange({
                  basis: e.target.value as "" | InboxTransactionalBasis,
                })
              }
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="">미확인 (상담 전)</option>
              <option value="im_request">고객 IM 열람 요청</option>
              <option value="property_inquiry">고객 매물 문의 접수</option>
              <option value="tour_booking">현장 임장·미팅 예약</option>
              <option value="broker_manual">기존 상담 고객 1:1 안내</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="edit-client-building"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              관심 매물명
            </label>
            <input
              id="edit-client-building"
              list="inbox-inventory-buildings"
              type="text"
              value={values.buildingTitle}
              onChange={(e) => onChange({ buildingTitle: e.target.value })}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-client-budget"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                희망 예산
              </label>
              <input
                id="edit-client-budget"
                data-testid="edit-client-budget-input"
                type="text"
                value={values.budget}
                onChange={(e) => onChange({ budget: e.target.value })}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="edit-client-region"
                className="mb-1 block text-sm font-bold text-slate-800"
              >
                선호 권역
              </label>
              <input
                id="edit-client-region"
                data-testid="edit-client-region-input"
                type="text"
                value={values.region}
                onChange={(e) => onChange({ region: e.target.value })}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-client-free-memo"
              className="mb-1 block text-sm font-bold text-slate-800"
            >
              상담 메모
            </label>
            <textarea
              id="edit-client-free-memo"
              data-testid="edit-client-free-memo-input"
              rows={2}
              value={values.freeMemo}
              onChange={(e) => onChange({ freeMemo: e.target.value })}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              data-testid="submit-edit-client-btn"
              disabled={Boolean(busyAction)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
