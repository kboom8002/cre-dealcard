"use client";

import React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  formatReceiptTimeKo,
  type HistoryDistributionItem,
  type HistoryReceiptItem,
} from "../_lib/edition-dispatch";

export interface DeliveryReceiptRowItem extends Omit<HistoryReceiptItem, "status"> {
  status: "opened" | "sent" | "queued" | "scheduled" | "failed";
  scheduledFor?: string | null;
  editionId?: string | null;
}

export interface DistributionSummaryRowItem extends HistoryDistributionItem {
  queuedCount?: number;
  scheduledCount?: number;
  scheduledForIso?: string | null;
}

export interface NewsletterDeliveryReceiptsPanelProps {
  receipts: DeliveryReceiptRowItem[];
  distributions: DistributionSummaryRowItem[];
  loading: boolean;
  error: string | null;
  cancellingSchedule?: boolean;
  queuedBadgeLabel?: string;
  onRefresh: () => void;
  onCancelSchedule?: () => void;
}

export function NewsletterDeliveryReceiptsPanel({
  receipts,
  distributions,
  loading,
  error,
  cancellingSchedule = false,
  queuedBadgeLabel = "⏳ 발송 대기",
  onRefresh,
  onCancelSchedule,
}: NewsletterDeliveryReceiptsPanelProps) {
  const scheduledReceiptCount = receipts.filter((r) => r.status === "scheduled").length;
  const hasScheduled =
    scheduledReceiptCount > 0 ||
    distributions.some((d) => (d.scheduledCount ?? 0) > 0);

  return (
    <section
      data-testid="newsletter-delivery-receipts-section"
      aria-label="발송 및 수신확인 내역"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-700" aria-hidden="true" />
            <h3 className="text-base font-extrabold text-slate-900">
              발송 · 수신확인 내역
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600">
            구독자별 발송 시각과 개인 링크 열람(수신확인) 여부를 바로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-800">
            전체 {receipts.length}건
          </span>
          {scheduledReceiptCount > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-900">
              예약 {scheduledReceiptCount}건
            </span>
          )}
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-900">
            열람 {receipts.filter((r) => r.status === "opened").length}건
          </span>
          {hasScheduled && onCancelSchedule && (
            <button
              type="button"
              data-testid="history-cancel-schedule-btn"
              onClick={onCancelSchedule}
              disabled={cancellingSchedule}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-sm font-extrabold text-rose-900 hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
            >
              <span>{cancellingSchedule ? "취소 중…" : "예약 취소"}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="history-receipts-refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin text-blue-700" : ""}`}
              aria-hidden="true"
            />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {distributions.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {distributions.slice(0, 3).map((d, idx) => {
            const scheduledCnt = d.scheduledCount ?? 0;
            const queuedCnt = d.queuedCount ?? 0;
            const scheduledTime = formatReceiptTimeKo(d.scheduledForIso);
            return (
              <span
                key={`${d.createdAt ?? d.date ?? idx}-${idx}`}
                className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-800"
              >
                <span>{d.issueDate || d.date || "최근 발송"}</span>
                {scheduledCnt > 0 && (
                  <span className="text-amber-800">
                    예약 {scheduledCnt}건{scheduledTime ? ` (${scheduledTime})` : ""}
                  </span>
                )}
                {queuedCnt > 0 && (
                  <span className="text-amber-800">대기 {queuedCnt}건</span>
                )}
                {(d.sentCount > 0 || (scheduledCnt === 0 && queuedCnt === 0)) && (
                  <span className="text-blue-800">발송 {d.sentCount}건</span>
                )}
                {d.failedCount > 0 && (
                  <span className="text-rose-700">· 실패 {d.failedCount}건</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          {error}
        </div>
      ) : loading && receipts.length === 0 ? (
        <p className="py-4 text-sm font-medium text-slate-600">
          발송 및 수신확인 기록을 불러오는 중입니다…
        </p>
      ) : receipts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center space-y-2">
          <p className="text-base font-bold text-slate-800">
            아직 기록된 발송 · 수신확인 내역이 없습니다
          </p>
          <p className="text-sm font-medium text-slate-600">
            3. 보내기 단계에서 구독자에게 발송하면 수신자별 발송 상태와 열람 시간이 이곳에 표시됩니다.
          </p>
        </div>
      ) : (
        <ul
          aria-label="수신자별 발송 및 열람 내역"
          className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white"
        >
          {receipts.map((item) => {
            const sentLabel = formatReceiptTimeKo(item.sentAt);
            const openedLabel = formatReceiptTimeKo(item.openedAt);
            const scheduledLabel = formatReceiptTimeKo(item.scheduledFor);
            return (
              <li
                key={item.id}
                data-testid={`delivery-receipt-row-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-base font-extrabold text-slate-900">
                    {item.recipientLabel}
                  </p>
                  <p className="truncate text-sm font-medium text-slate-600">
                    {item.editionLabel}
                    {item.status === "scheduled"
                      ? scheduledLabel
                        ? ` · ${scheduledLabel} 발송 예정`
                        : sentLabel
                          ? ` · 예약 등록 ${sentLabel}`
                          : ""
                      : sentLabel
                        ? ` · ${item.status === "queued" ? "대기 등록" : "발송"} ${sentLabel}`
                        : ""}
                  </p>
                </div>

                {item.status === "opened" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-900 shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    <span>
                      ✓ 열람 완료{openedLabel ? ` (${openedLabel})` : ""}
                    </span>
                  </span>
                ) : item.status === "failed" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-extrabold text-rose-900 shrink-0">
                    <XCircle className="h-4 w-4 text-rose-700" aria-hidden="true" />
                    <span>발송 실패</span>
                  </span>
                ) : item.status === "scheduled" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-900 shrink-0">
                    <CalendarClock className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    <span>🕒 오전 08:30 예약됨</span>
                  </span>
                ) : item.status === "queued" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-900 shrink-0">
                    <Clock className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    <span>{queuedBadgeLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700 shrink-0">
                    <Clock className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    <span>발송됨 (미열람)</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
