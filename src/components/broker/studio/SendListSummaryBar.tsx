"use client";

import React from "react";
import { Check, Users } from "lucide-react";

export type NewsletterTargetSegment = "all" | "buyer" | "seller";

export interface SendListSummaryBarProps {
  targetSegment: NewsletterTargetSegment;
  onChangeTargetSegment: (segment: NewsletterTargetSegment) => void;
  totalSubscriberCount?: number;
  highInterestCount?: number;
  sendDayLabel?: string;
}

const TARGET_OPTIONS: readonly {
  id: NewsletterTargetSegment;
  label: string;
  description: string;
}[] = [
  {
    id: "all",
    label: "전체 구독자",
    description: "매수·매도 고객 모두에게 균형 잡힌 구성으로 보냅니다",
  },
  {
    id: "buyer",
    label: "매수 관심 고객",
    description: "추천 매물과 수익률 계산기를 앞쪽에 배치해 보냅니다",
  },
  {
    id: "seller",
    label: "매도 관심 고객",
    description: "주변 실거래 흐름과 세무 코너를 앞쪽에 배치해 보냅니다",
  },
] as const;

export function SendListSummaryBar({
  targetSegment,
  onChangeTargetSegment,
  totalSubscriberCount = 0,
  highInterestCount = 0,
  sendDayLabel,
}: SendListSummaryBarProps) {
  return (
    <section
      data-testid="send-list-summary-bar"
      aria-label="받을 고객 확인 및 발송 대상 선택"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-slate-900">
            누구에게 보낼까요?
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-800">
            구독 고객 {totalSubscriberCount}명
          </span>
          {highInterestCount > 0 && (
            <span
              data-testid="high-interest-badge"
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-900"
            >
              관심 높음 {highInterestCount}명
            </span>
          )}
          {sendDayLabel && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-bold text-blue-900">
              정기 발송 요일: {sendDayLabel}
            </span>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label="뉴스레터 받을 고객 그룹 선택"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {TARGET_OPTIONS.map((opt) => {
          const isSelected = targetSegment === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSelected}
              data-testid={`send-target-${opt.id}`}
              onClick={() => onChangeTargetSegment(opt.id)}
              className={`min-h-[48px] rounded-xl border p-4 text-left transition-all flex flex-col justify-between gap-2 ${
                isSelected
                  ? "border-blue-600 bg-blue-50/70 text-blue-950 shadow-2xs"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-extrabold text-slate-900">
                  {opt.label}
                </span>
                {isSelected && (
                  <Check className="h-5 w-5 text-blue-700 shrink-0" aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-medium text-slate-600">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
