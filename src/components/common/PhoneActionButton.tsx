"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { formatKrPhoneInput } from "@/lib/format/phone";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";

const MIN_PHONE_DIGITS = 8;

/**
 * Raw 전화번호에서 숫자만 추출(+82 국가코드가 포함된 경우 국내 010/지역번호로 정규화).
 */
export function sanitizePhoneDigits(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11 && digits.length <= 13) {
    digits = "0" + digits.slice(digits.startsWith("820") ? 3 : 2);
  }
  return digits;
}

/**
 * 한국 유선(15xx/16xx/18xx 8자리, 02 9~10자리)·휴대전화(10~11자리) 최소 8자리 검증.
 */
export function isValidKrPhone(raw: unknown): boolean {
  return sanitizePhoneDigits(raw).length >= MIN_PHONE_DIGITS;
}

/**
 * 하이픈이 적용된 표시용 한국 전화번호 반환. 8자리 미만이면 빈 문자열 반환.
 */
export function formatKrPhoneForDisplay(raw: unknown): string {
  const digits = sanitizePhoneDigits(raw);
  if (digits.length < MIN_PHONE_DIGITS) return "";
  return formatKrPhoneInput(digits) || String(raw ?? "").trim();
}

export interface PhoneActionButtonProps {
  phone?: unknown;
  variant?: "card" | "inline" | "compact";
  titleLabel?: string;
  callLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
  callAriaLabel?: string;
  copyAriaLabel?: string;
  fallbackLabel?: React.ReactNode;
  fallbackHref?: string;
  fallbackClassName?: string;
  onFallbackClick?: () => void;
  onCallClick?: () => void;
  onCopySuccess?: (formattedPhone: string) => void;
  showFormattedNumber?: boolean;
  desktopCopyOnly?: boolean;
  showCopyButton?: boolean;
  toastOnCopy?: boolean;
  className?: string;
  callClassName?: string;
  copyClassName?: string;
  cardTestId?: string;
  callTestId?: string;
  copyTestId?: string;
  renderCallContent?: React.ReactNode;
}

/**
 * 공통 전화 연결(`tel:`) + 데스크톱 친화 원클릭 번호 복사 버튼.
 * - 숫자 8자리 미만이면 링크를 렌더하지 않음(fallbackLabel이 있을 때만 비링크/대체 링크 표시).
 * - 모바일/일반 환경에서는 즉시 `tel:<digits>` 연결, 데스크톱에서는 번호 표시 + `[번호 복사]` 제공.
 */
export function PhoneActionButton({
  phone,
  variant = "inline",
  titleLabel,
  callLabel = "📞 전화 연결",
  copyLabel = "번호 복사",
  copiedLabel = "✓ 복사됨",
  callAriaLabel,
  copyAriaLabel,
  fallbackLabel,
  fallbackHref,
  fallbackClassName,
  onFallbackClick,
  onCallClick,
  onCopySuccess,
  showFormattedNumber = true,
  desktopCopyOnly = true,
  showCopyButton = true,
  toastOnCopy = true,
  className,
  callClassName,
  copyClassName,
  cardTestId,
  callTestId,
  copyTestId,
  renderCallContent,
}: PhoneActionButtonProps) {
  const [copied, setCopied] = useState(false);
  const digits = sanitizePhoneDigits(phone);

  if (digits.length < MIN_PHONE_DIGITS) {
    if (!fallbackLabel) return null;
    if (fallbackHref) {
      return (
        <a
          href={fallbackHref}
          onClick={onFallbackClick}
          className={
            fallbackClassName ??
            "inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap"
          }
        >
          {fallbackLabel}
        </a>
      );
    }
    return (
      <span
        className={
          fallbackClassName ??
          "inline-flex min-h-[44px] items-center justify-center text-sm font-semibold text-slate-600"
        }
      >
        {fallbackLabel}
      </span>
    );
  }

  const formattedPhone = formatKrPhoneForDisplay(digits);
  const telHref = `tel:${digits}`;

  const handleCopy = async () => {
    const ok = await copyText(formattedPhone);
    if (ok) {
      setCopied(true);
      if (toastOnCopy) {
        toast.success(`전화번호(${formattedPhone})를 복사했습니다.`);
      }
      onCopySuccess?.(formattedPhone);
      setTimeout(() => setCopied(false), 2000);
    } else if (toastOnCopy) {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  if (variant === "card") {
    return (
      <div
        data-testid={cardTestId}
        className={
          className ??
          "rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5"
        }
      >
        {titleLabel && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-700">
              {titleLabel}
            </span>
            <span className="text-base font-extrabold text-slate-950 tabular-nums">
              {formattedPhone}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {showCopyButton && (
            <button
              type="button"
              data-testid={copyTestId}
              aria-label={copyAriaLabel ?? `${formattedPhone} 번호 복사`}
              onClick={handleCopy}
              className={
                copyClassName ??
                "min-h-[48px] py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              }
            >
              {copied ? copiedLabel : copyLabel}
            </button>
          )}
          <a
            href={telHref}
            data-testid={callTestId}
            aria-label={callAriaLabel ?? `${formattedPhone} 전화 연결`}
            onClick={onCallClick}
            className={
              callClassName ??
              "min-h-[48px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            }
          >
            {renderCallContent ?? callLabel}
          </a>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        data-testid={cardTestId}
        className={className ?? "inline-flex items-center gap-1.5 min-w-0"}
      >
        <a
          href={telHref}
          data-testid={callTestId}
          aria-label={callAriaLabel ?? `${formattedPhone} 전화 연결`}
          title={formattedPhone}
          onClick={onCallClick}
          className={
            callClassName ??
            "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1E293B] whitespace-nowrap"
          }
        >
          {renderCallContent ?? callLabel}
        </a>
        {showCopyButton && (
          <button
            type="button"
            data-testid={copyTestId}
            aria-label={copyAriaLabel ?? `${formattedPhone} 번호 복사`}
            title={`전화번호 복사 (${formattedPhone})`}
            data-phone={formattedPhone}
            onClick={handleCopy}
            className={
              copyClassName ??
              `${
                desktopCopyOnly ? "hidden sm:inline-flex" : "inline-flex"
              } min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100 cursor-pointer whitespace-nowrap`
            }
          >
            {copied ? (
              <span>{copiedLabel}</span>
            ) : (
              <>
                {showFormattedNumber && (
                  <span className="hidden md:inline tabular-nums">
                    {formattedPhone}
                  </span>
                )}
                <span>{copyLabel}</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={cardTestId}
      className={
        className ??
        "flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full"
      }
    >
      <a
        href={telHref}
        data-testid={callTestId}
        aria-label={callAriaLabel ?? `${formattedPhone} 전화 연결`}
        onClick={onCallClick}
        className={
          callClassName ??
          "flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
        }
      >
        {renderCallContent ?? (
          <>
            <span>{callLabel}</span>
            {showFormattedNumber && (
              <span className="tabular-nums font-bold">({formattedPhone})</span>
            )}
          </>
        )}
      </a>
      {showCopyButton && (
        <button
          type="button"
          data-testid={copyTestId}
          aria-label={copyAriaLabel ?? `${formattedPhone} 번호 복사`}
          title={`전화번호 복사 (${formattedPhone})`}
          onClick={handleCopy}
          className={
            copyClassName ??
            "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          }
        >
          {copied ? copiedLabel : `📋 ${copyLabel}`}
        </button>
      )}
    </div>
  );
}
