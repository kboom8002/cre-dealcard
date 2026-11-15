"use client";

import React, { useEffect } from "react";
import { toast } from "sonner";

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimatedSavingsMoney: number;
  currentCount: number;
  maxLimit: number;
  featureNameKo?: string;
}

const SUPPORT_EMAIL = "support@credeal.kr";

export function UpgradeModal({
  isOpen,
  onClose,
  estimatedSavingsMoney,
  currentCount,
  maxLimit,
  featureNameKo = "매매 딜카드 생성",
}: UpgradeModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasVerifiedSavings = Number.isFinite(estimatedSavingsMoney) && estimatedSavingsMoney > 0;
  const formattedSavings = hasVerifiedSavings
    ? new Intl.NumberFormat("ko-KR", {
        style: "currency",
        currency: "KRW",
      }).format(estimatedSavingsMoney)
    : null;

  const handleCopySupportEmail = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SUPPORT_EMAIL);
      }
      toast.success(
        `담당팀 이메일(${SUPPORT_EMAIL})이 복사되었습니다. 중개사무소명과 함께 보내주시면 무료로 한도를 증설해 드립니다.`
      );
    } catch {
      toast.success(
        `담당팀 이메일은 ${SUPPORT_EMAIL} 입니다. 메일로 요청해 주시면 무료로 한도를 증설해 드립니다.`
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        aria-describedby="upgrade-modal-desc"
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl text-slate-900 dark:text-slate-100 p-6 sm:p-7 space-y-5"
      >
        {/* 닫기 버튼 (44x44 이상 터치 영역) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-4 right-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors text-lg font-bold"
        >
          ✕
        </button>

        {/* 헤더 */}
        <div className="space-y-2 pr-10">
          <p className="text-base font-semibold text-indigo-700 dark:text-indigo-300">
            얼리액세스 이용 한도 안내
          </p>
          <h2
            id="upgrade-modal-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white"
          >
            Pro 얼리액세스 한도 증설 안내
          </h2>
        </div>

        {/* 현재 이용량 요약 */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-base">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {featureNameKo} 이용 현황
            </span>
            <span className="font-bold text-indigo-700 dark:text-indigo-300">
              {currentCount} / {maxLimit}건
            </span>
          </div>
          {hasVerifiedSavings && formattedSavings ? (
            <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed pt-1">
              이번 달 자동화 기능으로 약{" "}
              <strong className="font-bold text-slate-900 dark:text-white">
                {formattedSavings}
              </strong>{" "}
              상당의 문서 작성 시간을 절감하셨습니다.
            </p>
          ) : null}
        </div>

        {/* PG 정식 출시 안내 본문 */}
        <div
          id="upgrade-modal-desc"
          className="space-y-2.5 text-base text-slate-700 dark:text-slate-200 leading-relaxed"
        >
          <p>
            현재 제공해 드린 무료 이용 한도({currentCount} / {maxLimit}건)를 모두 사용하셨습니다.
          </p>
          <p>
            정기 구독 PG 결제 시스템은 <strong>Pro 정식 출시 시점</strong>에 오픈될 예정입니다.
            얼리액세스 기간에는 담당팀에 요청해 주시면 추가 비용 없이 무료로 이용 한도를 증설해 드립니다.
          </p>
          <p className="font-semibold text-slate-900 dark:text-white">
            문의 이메일: {SUPPORT_EMAIL}
          </p>
        </div>

        {/* 액션 버튼 */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={handleCopySupportEmail}
            className="w-full min-h-12 px-4 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold rounded-xl shadow-sm transition-colors"
          >
            담당팀에 무료 한도 증설 요청 (이메일 복사)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-12 px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-base font-semibold rounded-xl transition-colors"
          >
            확인 (닫기)
          </button>
        </div>
      </div>
    </div>
  );
}
