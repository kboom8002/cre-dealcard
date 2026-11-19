"use client";

import React from "react";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  type InboxThreadItem,
  formatDispatchChannelLabel,
  formatDispatchStatusBadge,
} from "./inbox-types";

export interface InboxDispatchTimelineProps {
  thread: InboxThreadItem;
  callNote: string;
  busyAction: string | null;
  onCallNoteChange: (next: string) => void;
  onSaveCallNote: () => void;
}

export function InboxDispatchTimeline({
  thread,
  callNote,
  busyAction,
  onCallNoteChange,
  onSaveCallNote,
}: InboxDispatchTimelineProps) {
  const dispatchHistory = Array.isArray(thread.dispatchHistory)
    ? thread.dispatchHistory
    : [];
  const isBounced = thread.emailDeliveryStatus === "bounced";
  const isComplained = thread.emailDeliveryStatus === "complained";

  return (
    <div
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      data-testid="inbox-tab-panel-history"
    >
      {(isBounced || isComplained) && (
        <div
          role="alert"
          data-testid="inbox-email-bounce-warning"
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            isBounced
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          {isBounced ? (
            <span>
              ⚠️ 이메일 반송됨 — 고객 이메일 주소를 다시 확인하시거나 카톡 복사로 자료를 보내 주세요.
            </span>
          ) : (
            <span>
              수신차단 — 고객 측에서 이메일 수신을 차단했습니다. 카톡 복사 또는 전화 상담을 이용해 주세요.
            </span>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor="inbox-call-note-input"
          className="mb-1.5 block text-sm font-bold text-slate-800"
        >
          통화 및 상담 메모 남기기
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="inbox-call-note-input"
            data-testid="inbox-call-note-input"
            type="text"
            value={callNote}
            onChange={(e) => onCallNoteChange(e.target.value)}
            placeholder="예: 금주 금요일 오후 현장 답사 희망"
            className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="button"
            data-testid="save-call-note-btn"
            disabled={Boolean(busyAction)}
            onClick={onSaveCallNote}
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            메모 저장
          </button>
        </div>
      </div>

      {/* 발송 감사 타임라인 (이메일 · 카톡 복사 · 뉴스레터 · 반송/수신차단 상태) */}
      <div
        className="border-t border-slate-200 pt-4"
        data-testid="inbox-dispatch-audit-timeline"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">
            자료 발송 내역
          </h3>
          {(isBounced || isComplained) && (
            <span
              data-testid="inbox-history-delivery-status-badge"
              className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-bold ${
                isBounced
                  ? "border border-rose-300 bg-rose-100 text-rose-900"
                  : "border border-amber-300 bg-amber-100 text-amber-950"
              }`}
            >
              {isBounced ? "⚠️ 이메일 반송됨" : "수신차단"}
            </span>
          )}
        </div>

        {dispatchHistory.length === 0 ? (
          <p className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
            아직 발송·복사 내역이 없습니다. 이메일 발송이나 카톡 문구·링크 복사 시 이곳에 기록됩니다.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5" data-testid="inbox-dispatch-history-list">
            {dispatchHistory.map((item) => {
              const channelLabel = formatDispatchChannelLabel(item.channel);
              const statusBadge = formatDispatchStatusBadge(item.status);
              const channelCls =
                item.channel === "email"
                  ? "border border-blue-200 bg-blue-50 text-blue-900"
                  : item.channel === "newsletter"
                  ? "border border-purple-200 bg-purple-50 text-purple-900"
                  : item.channel === "import"
                  ? "border border-teal-200 bg-teal-50 text-teal-900"
                  : "border border-slate-300 bg-white text-slate-800";

              return (
                <li
                  key={item.id}
                  data-testid={`inbox-dispatch-item-${item.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        data-testid={`dispatch-channel-badge-${item.id}`}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${channelCls}`}
                      >
                        {channelLabel}
                      </span>
                      <span
                        data-testid={`dispatch-status-badge-${item.id}`}
                        data-dispatch-status={item.status}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-slate-900 break-words">
                      {item.title}
                    </p>
                    {item.bounceReason && (
                      <p className="text-sm font-medium text-rose-700">
                        사유: {item.bounceReason}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm text-slate-500 whitespace-nowrap">
                    {formatListDate(item.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 열람 및 상담 기록 */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-base font-bold text-slate-900">
          열람 및 상담 기록
        </h3>
        <ul className="mt-3 space-y-2.5">
          {thread.events.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
              상세 자료를 열람했습니다
            </li>
          ) : (
            thread.events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
              >
                <div className="space-y-0.5">
                  <p className="text-base font-medium text-slate-900">
                    {ev.description}
                  </p>
                  {ev.sectionName && (
                    <p className="text-sm text-slate-600">
                      열람 섹션: {ev.sectionName}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm text-slate-500">
                  {ev.timestamp}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
