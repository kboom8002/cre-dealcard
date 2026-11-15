"use client";

import React from "react";
import Link from "next/link";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  type InboxEditorTabType,
  type InboxThreadItem,
  formatClientRoleLabel,
  formatPhoneKo,
} from "./inbox-types";
import { InboxDispatchTimeline } from "./InboxDispatchTimeline";

export interface InboxEditorColumnProps {
  activeThread: InboxThreadItem | null;
  activeEditorTab: InboxEditorTabType;
  inlineActionError: string | null;
  busyAction: string | null;
  kakaoHeadline: string;
  kakaoBrief: string;
  callNote: string;
  onSelectEditorTab: (tab: InboxEditorTabType) => void;
  onKakaoHeadlineChange: (next: string) => void;
  onKakaoBriefChange: (next: string) => void;
  onCallNoteChange: (next: string) => void;
  onSaveCallNote: () => void;
  onApproveAndSendIm: (thread: InboxThreadItem) => void;
  onRejectRequest: (thread: InboxThreadItem) => void;
  onSendMaterial: (kind: "im" | "dealcard" | "newsletter" | "magazine") => void;
  onArchiveThread: (thread: InboxThreadItem) => void;
}

export function InboxEditorColumn({
  activeThread,
  activeEditorTab,
  inlineActionError,
  busyAction,
  kakaoHeadline,
  kakaoBrief,
  callNote,
  onSelectEditorTab,
  onKakaoHeadlineChange,
  onKakaoBriefChange,
  onCallNoteChange,
  onSaveCallNote,
  onApproveAndSendIm,
  onRejectRequest,
  onSendMaterial,
  onArchiveThread,
}: InboxEditorColumnProps) {
  return (
    <div
      className="mx-auto max-w-3xl space-y-5 p-4 md:p-6"
      data-testid="inbox-editor-slot"
    >
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">
            선택된 고객이 없습니다
          </h2>
          <p className="mt-2 text-base text-slate-600">
            왼쪽 목록에서 고객을 선택하거나 상단의 [+ 고객 직접 등록] 버튼을 눌러 새 고객을 추가해 보세요.
          </p>
        </div>
      ) : (
        <>
          {inlineActionError && (
            <div
              role="alert"
              data-testid="inbox-action-error-banner"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
            >
              {inlineActionError}
            </div>
          )}

          {/* 선택된 고객 상단 헤더 + 딜카드/IM 편집 딥링크 (INBOX-04) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-bold ${
                      activeThread.status === "pending_gate"
                        ? "border border-amber-300 bg-amber-100 text-amber-900"
                        : activeThread.status === "revoked"
                        ? "border border-rose-200 bg-rose-100 text-rose-800"
                        : activeThread.gateStatus === "rejected"
                        ? "border border-slate-300 bg-slate-200 text-slate-700"
                        : activeThread.status === "high_interest" ||
                          activeThread.openCount >= 3
                        ? "border border-blue-200 bg-blue-100 text-blue-900"
                        : "border border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {activeThread.status === "pending_gate"
                      ? "IM 요청 대기"
                      : activeThread.status === "revoked"
                      ? "링크 잠김"
                      : activeThread.gateStatus === "rejected"
                      ? "요청 거절됨"
                      : activeThread.status === "high_interest" ||
                        activeThread.openCount >= 3
                      ? "관심 높음"
                      : activeThread.openCount > 0
                      ? "열람 고객"
                      : "등록 고객"}
                  </span>
                  {(activeThread.isVip === true || activeThread.clientGrade === "VIP") && (
                    <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-900">
                      ⭐ VIP
                    </span>
                  )}
                  {activeThread.clientRole && !activeThread.id.startsWith("view_") && (
                    <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
                      {formatClientRoleLabel(activeThread.clientRole)}
                    </span>
                  )}
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {activeThread.clientName}
                  </h2>
                  {activeThread.clientCompany && (
                    <span className="text-sm font-semibold text-slate-600">
                      · {activeThread.clientCompany}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-base font-semibold text-slate-800">
                  관심 매물: {activeThread.buildingTitle}
                </p>

                {activeThread.buildingId.trim().length > 0 &&
                  !activeThread.buildingTitle.includes("삭제된 매물") && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/broker/w/dealcards?buildingId=${encodeURIComponent(
                          activeThread.buildingId.trim()
                        )}`}
                        data-testid="inbox-open-dealcard-link"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
                      >
                        📄 딜카드 편집 →
                      </Link>
                      <Link
                        href={`/broker/w/im?buildingId=${encodeURIComponent(
                          activeThread.buildingId.trim()
                        )}`}
                        data-testid="inbox-open-im-link"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
                      >
                        📊 IM 편집 →
                      </Link>
                    </div>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!activeThread.id.startsWith("custom_") &&
                  !activeThread.id.startsWith("cli-") &&
                  !activeThread.id.startsWith("sub_") && (
                    <button
                      type="button"
                      data-testid="inbox-archive-thread-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => onArchiveThread(activeThread)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      보관(숨김)
                    </button>
                  )}
                {activeThread.clientPhone ? (
                  <a
                    href={`tel:${activeThread.clientPhone}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
                  >
                    전화 걸기 ({formatPhoneKo(activeThread.clientPhone)})
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[48px] cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
                  >
                    전화번호 없음
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2열 상단 탭 3개: 할 일 · 메시지 · 기록 (IB-13) */}
          <div
            role="tablist"
            aria-label="고객 상담 및 관리 탭"
            data-testid="inbox-editor-primary-tabs"
            className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-200/70 p-1.5"
          >
            {(
              [
                { id: "todo", label: "할 일" },
                { id: "message", label: "메시지" },
                { id: "history", label: "기록" },
              ] as const
            ).map((tab) => {
              const isSelected = activeEditorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`inbox-editor-tab-${tab.id}`}
                  onClick={() => onSelectEditorTab(tab.id)}
                  className={`min-h-[48px] rounded-lg px-2 py-2.5 text-base font-bold leading-snug break-keep transition cursor-pointer ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-700 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 탭 1: 할 일 (대기 요청 시 요청 사유 + [자료 보내기(승인)] / [거절] 첫 화면 노출 — IB-14) */}
          {activeEditorTab === "todo" && (
            <div className="space-y-4" data-testid="inbox-tab-panel-todo">
              {activeThread.status === "pending_gate" ? (
                <div
                  data-testid="inbox-pending-gate-card"
                  className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-amber-200 px-2.5 py-1 text-sm font-extrabold text-amber-950">
                      IM 열람 요청
                    </span>
                    <span className="text-sm font-semibold text-amber-900">
                      {formatListDate(activeThread.updatedAt)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-900">
                    요청 사유 및 메시지
                  </h3>
                  <p className="mt-1.5 rounded-xl border border-amber-200 bg-white p-3.5 text-base text-slate-800">
                    {activeThread.cleanMessage ||
                      activeThread.detail ||
                      "상세 투자설명서(IM) 열람을 요청했습니다."}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      data-testid="approve-gate-primary-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => onApproveAndSendIm(activeThread)}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      자료 보내기(승인)
                    </button>
                    <button
                      type="button"
                      data-testid="reject-gate-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => onRejectRequest(activeThread)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="text-base font-bold text-slate-900">
                    현재 열람 및 진행 상태
                  </h3>
                  <p className="mt-1.5 text-base text-slate-700">
                    {activeThread.gateStatus === "rejected"
                      ? "IM 열람 요청을 거절했습니다. 다시 자료를 보내시려면 아래 버튼을 눌러 주세요."
                      : activeThread.focusedSections &&
                        activeThread.focusedSections.length > 0
                      ? `집중 열람 항목: ${activeThread.focusedSections.join(" · ")}`
                      : activeThread.openCount > 0
                      ? `발송한 자료를 총 ${activeThread.openCount}회 열람했습니다.`
                      : "아직 자료를 열람하지 않았습니다. 아래 버튼으로 맞춤 매물 자료를 보내 보세요."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={activeThread.status === "revoked" || Boolean(busyAction)}
                      onClick={() => onSendMaterial("im")}
                      className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold ${
                        activeThread.status === "revoked"
                          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                          : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                      }`}
                    >
                      {activeThread.status === "revoked"
                        ? "IM 전용 링크 (잠김)"
                        : "IM 전용 링크 보내기"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => onSendMaterial("dealcard")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      딜카드 보내기
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => onSendMaterial("newsletter")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      뉴스레터 보내기
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 탭 2: 메시지 (카톡 안내 문구 편집 및 발송) */}
          {activeEditorTab === "message" && (
            <div
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              data-testid="inbox-tab-panel-message"
            >
              <h3 className="text-base font-bold text-slate-900">
                카카오톡 자료 발송 메시지
              </h3>
              <div>
                <label
                  htmlFor="inbox-kakao-headline-input"
                  className="mb-1 block text-sm font-bold text-slate-700"
                >
                  안내 제목
                </label>
                <input
                  id="inbox-kakao-headline-input"
                  data-testid="inbox-kakao-headline-input"
                  type="text"
                  value={kakaoHeadline}
                  onChange={(e) => onKakaoHeadlineChange(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="inbox-kakao-brief-input"
                  className="mb-1 block text-sm font-bold text-slate-700"
                >
                  안내 본문
                </label>
                <textarea
                  id="inbox-kakao-brief-input"
                  data-testid="inbox-kakao-brief-input"
                  rows={3}
                  value={kakaoBrief}
                  onChange={(e) => onKakaoBriefChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  data-testid="send-im-link-btn"
                  disabled={activeThread.status === "revoked" || Boolean(busyAction)}
                  onClick={() => onSendMaterial("im")}
                  className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 py-2.5 text-base font-bold ${
                    activeThread.status === "revoked"
                      ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                      : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  }`}
                >
                  {activeThread.status === "revoked"
                    ? "IM 전용 링크 (잠김)"
                    : "IM 전용 링크 보내기"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => onSendMaterial("dealcard")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  딜카드 보내기
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => onSendMaterial("newsletter")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  뉴스레터 보내기
                </button>
              </div>
            </div>
          )}

          {/* 탭 3: 기록 (통화 메모 + 발송 감사 타임라인 + 열람 타임라인) */}
          {activeEditorTab === "history" && (
            <InboxDispatchTimeline
              thread={activeThread}
              callNote={callNote}
              busyAction={busyAction}
              onCallNoteChange={onCallNoteChange}
              onSaveCallNote={onSaveCallNote}
            />
          )}
        </>
      )}
    </div>
  );
}
