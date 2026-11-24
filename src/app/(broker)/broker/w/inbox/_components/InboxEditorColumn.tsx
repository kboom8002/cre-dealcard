"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { copyText } from "@/lib/ux/clipboard";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  type InboxEditorTabType,
  type InboxThreadItem,
  formatClientRoleLabel,
  formatDispatchChannelLabel,
  formatDispatchStatusBadge,
  formatPhoneKo,
  getInboxStatusBadge,
  isValidCallPhone,
} from "./inbox-types";
import { InboxDispatchTimeline } from "./InboxDispatchTimeline";

export interface InboxEditorColumnProps {
  activeThread: InboxThreadItem | null;
  activeEditorTab: InboxEditorTabType;
  inlineActionError: string | null;
  busyAction: string | null;
  lastIssuedUrl?: string;
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
  onSendMaterial?: (kind: "im" | "dealcard" | "newsletter" | "magazine") => void;
  onArchiveThread: (thread: InboxThreadItem) => void;
  onCopyActiveShareLink?: () => void;
  onPrepareCopyBundle?: () => void;
  onConfirmLockLink?: () => void;
  onUnlockLink?: () => void;
  onCopyClientEmail?: (email: string) => void;
  onGenerateAiReply?: (thread: InboxThreadItem) => Promise<void> | void;
  aiReplyLoading?: boolean;
  aiReplyCount?: number;
}

export function InboxEditorColumn({
  activeThread,
  activeEditorTab,
  inlineActionError,
  busyAction,
  lastIssuedUrl = "",
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
  onArchiveThread,
  onCopyActiveShareLink,
  onPrepareCopyBundle,
  onConfirmLockLink,
  onUnlockLink,
  onCopyClientEmail,
  onGenerateAiReply,
  aiReplyLoading = false,
  aiReplyCount = 0,
}: InboxEditorColumnProps) {
  const [clientOrigin, setClientOrigin] = React.useState("");
  const [todoLockConfirmOpen, setTodoLockConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location?.origin &&
      window.location.origin !== "null"
    ) {
      setClientOrigin(window.location.origin);
    }
  }, []);

  React.useEffect(() => {
    setTodoLockConfirmOpen(false);
  }, [activeThread?.id]);

  const statusBadge = activeThread ? getInboxStatusBadge(activeThread) : null;
  const effectiveSharePath = activeThread
    ? (activeThread.shareUrl || lastIssuedUrl || "").trim()
    : "";
  const fullShareUrl = effectiveSharePath
    ? effectiveSharePath.startsWith("/") && clientOrigin
      ? `${clientOrigin}${effectiveSharePath}`
      : effectiveSharePath
    : "";
  const dispatchHistory = Array.isArray(activeThread?.dispatchHistory)
    ? activeThread.dispatchHistory
    : [];
  const recentDispatches = dispatchHistory.slice(0, 2);
  const validCallPhone = activeThread ? isValidCallPhone(activeThread.clientPhone) : false;
  const cleanEmail = activeThread?.clientEmail?.trim() || "";

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
            고객 목록에서 대상을 선택하거나 [+ 고객 직접 등록] 버튼을 눌러 새 고객을 추가해 보세요.
          </p>
          <button
            type="button"
            data-testid="inbox-empty-open-list-btn"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("workspace:open-list"));
              }
              if (typeof document !== "undefined") {
                document
                  .querySelector<HTMLButtonElement>('[data-testid="workspace-mobile-back-to-list-btn"]')
                  ?.click();
              }
            }}
            className="mt-4 inline-flex lg:hidden min-h-[44px] items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 cursor-pointer"
          >
            고객 목록 보기
          </button>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge && (
                    <span
                      data-testid="inbox-editor-status-badge"
                      className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-bold ${statusBadge.cls}`}
                    >
                      {statusBadge.text}
                    </span>
                  )}
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
                    <span
                      data-testid="inbox-editor-client-company-badge"
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-sm font-extrabold text-indigo-950 shrink-0"
                    >
                      🏢 {activeThread.clientCompany}
                    </span>
                  )}
                </div>
                {(() => {
                  const UUID_LIKE_RE =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  const rawTitle = (activeThread.buildingTitle || "").trim();
                  const isRawUuidTitle = UUID_LIKE_RE.test(rawTitle);
                  const isNewsletterThread =
                    activeThread.latestEvent?.includes("뉴스레터") ||
                    rawTitle.startsWith("부동산뉴스");
                  const hasValidBuildingLink =
                    activeThread.buildingId.trim().length > 0 &&
                    !isRawUuidTitle &&
                    !isNewsletterThread &&
                    !rawTitle.includes("삭제된 매물");
                  const showNewsletterLink =
                    activeThread.newsletterSubscribed ||
                    activeThread.id.startsWith("sub_") ||
                    isNewsletterThread;
                  const displayTitle = isRawUuidTitle
                    ? isNewsletterThread
                      ? "부동산뉴스"
                      : ""
                    : rawTitle;

                  return (
                    <>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-800">
                        <span>{isNewsletterThread ? "열람 자료:" : "관심 매물:"}</span>
                        {!displayTitle || displayTitle === "관심 매물 미지정" ? (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-600">
                            관심 매물 연결 전
                          </span>
                        ) : (
                          <span>{displayTitle}</span>
                        )}
                      </div>

                      {cleanEmail && (
                        <div
                          data-testid="inbox-editor-email-chip"
                          className="mt-2.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1 text-sm font-semibold text-slate-900"
                        >
                          <span className="font-bold text-blue-900">✉️ 이메일:</span>
                          <a
                            href={`mailto:${cleanEmail}`}
                            data-testid="inbox-editor-email-mailto"
                            className="inline-flex min-h-[44px] items-center break-all font-bold text-blue-900 underline decoration-blue-300 underline-offset-2 hover:text-blue-700"
                          >
                            {cleanEmail}
                          </a>
                          <button
                            type="button"
                            data-testid="inbox-editor-copy-email-btn"
                            onClick={() => {
                              if (onCopyClientEmail) onCopyClientEmail(cleanEmail);
                              else void copyText(cleanEmail);
                            }}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-bold text-blue-900 transition hover:bg-blue-100 cursor-pointer"
                          >
                            복사
                          </button>
                        </div>
                      )}

                      {hasValidBuildingLink || showNewsletterLink ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {hasValidBuildingLink && (
                            <>
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
                                {activeThread.hasIm === false ? "📊 IM 먼저 만들기 →" : "📊 IM 편집 →"}
                              </Link>
                            </>
                          )}
                          {showNewsletterLink && (
                            <Link
                              href="/broker/magazine-editor"
                              data-testid="inbox-open-magazine-link"
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100"
                            >
                              📰 뉴스레터 편집·보내기 →
                            </Link>
                          )}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
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
                {validCallPhone ? (
                  <a
                    href={`tel:${activeThread.clientPhone.trim()}`}
                    data-testid="editor-call-link"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
                  >
                    전화 걸기 ({formatPhoneKo(activeThread.clientPhone)})
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    data-testid="preview-call-disabled"
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

          {/* 탭 1: 할 일 (승인/발급 링크 카드/잠금·거절 복구/최근 처리 기록 — IB-14, A3-01, A5-01) */}
          {activeEditorTab === "todo" && (
            <div className="space-y-4" data-testid="inbox-tab-panel-todo">
              {activeThread.status === "pending_gate" ? (
                <div
                  data-testid="inbox-pending-gate-card"
                  className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-amber-200 px-2.5 py-1 text-sm font-extrabold text-amber-950">
                        IM 열람 요청
                      </span>
                      {activeThread.clientCompany && (
                        <span
                          data-testid="inbox-pending-gate-company-badge"
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-sm font-extrabold text-indigo-950"
                        >
                          🏢 소속: {activeThread.clientCompany}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-amber-900">
                      {formatListDate(activeThread.lastActivityAt || activeThread.updatedAt)}
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
                      {busyAction === `approve:${activeThread.id}`
                        ? "승인 처리 중…"
                        : "자료 보내기(승인)"}
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
              ) : activeThread.status === "revoked" ? (
                <div
                  data-testid="inbox-revoked-card"
                  className="space-y-3 rounded-2xl border-2 border-rose-300 bg-rose-50/70 p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-rose-200 px-2.5 py-1 text-sm font-extrabold text-rose-950">
                      🔒 보낸 링크 잠김
                    </span>
                    <span className="text-sm font-semibold text-rose-900">
                      열람 차단 중
                    </span>
                  </div>
                  <p className="text-base text-slate-800">
                    이 고객에게 보낸 전용 링크는 현재 잠겨 있어 열람할 수 없습니다. 다시 자료를 보여주시려면 아래에서 잠금을 해제해 주세요.
                  </p>
                  <button
                    type="button"
                    data-testid="inbox-todo-unlock-link-btn"
                    disabled={Boolean(busyAction)}
                    onClick={() => onUnlockLink?.()}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-extrabold text-slate-900 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    🔓 링크 다시 열기
                  </button>
                </div>
              ) : activeThread.gateStatus === "rejected" ? (
                <div
                  data-testid="inbox-rejected-card"
                  className="space-y-3 rounded-2xl border border-slate-300 bg-slate-50 p-5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-200 px-2.5 py-1 text-sm font-extrabold text-slate-800">
                      요청 거절됨
                    </span>
                  </div>
                  <p className="text-base text-slate-800">
                    IM 열람 요청을 거절했습니다. 고객 상담 후 다시 자료를 열어주려면 아래 버튼으로 즉시 승인·발급할 수 있습니다.
                  </p>
                  {activeThread.cleanMessage && (
                    <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      원본 요청: {activeThread.cleanMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid="inbox-todo-reapprove-btn"
                    disabled={Boolean(busyAction)}
                    onClick={() => onApproveAndSendIm(activeThread)}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    {busyAction === `approve:${activeThread.id}`
                      ? "승인 처리 중…"
                      : "다시 승인·발급"}
                  </button>
                </div>
              ) : (
                <>
                  {(activeThread.gateStatus === "approved" || Boolean(effectiveSharePath)) && (
                    <div
                      data-testid="inbox-approved-link-card"
                      className="space-y-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-5 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center rounded-md bg-emerald-200/80 px-2.5 py-1 text-sm font-extrabold text-emerald-950">
                          {activeThread.gateStatus === "approved"
                            ? "✓ 승인 및 전용 링크 발급 완료"
                            : "✓ 발급된 전용 전달 링크"}
                        </span>
                        <span className="text-sm font-semibold text-emerald-900">
                          {activeThread.openCount > 0
                            ? `${activeThread.openCount}회 열람`
                            : "열람 대기 중"}
                        </span>
                      </div>

                      {fullShareUrl ? (
                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <p className="mb-1 text-sm font-bold text-slate-600">
                            고객 전용 열람 주소 (클릭해 전체 선택)
                          </p>
                          <div
                            data-testid="inbox-approved-share-url"
                            className="select-all break-all font-mono text-sm font-semibold text-slate-900"
                          >
                            {fullShareUrl}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm text-slate-700">
                          <span>전용 링크가 발급되었습니다. 자료 전달 영역에서도 채널별로 재발송할 수 있습니다.</span>
                          <button
                            type="button"
                            data-testid="inbox-open-preview-from-approved-btn"
                            onClick={() =>
                              window.dispatchEvent(new CustomEvent("workspace:open-preview"))
                            }
                            className="xl:hidden min-h-[44px] shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            자료 전달·관리 열기
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {fullShareUrl && (
                          <>
                            <button
                              type="button"
                              data-testid="inbox-todo-copy-link-btn"
                              disabled={Boolean(busyAction)}
                              onClick={() => {
                                if (onCopyActiveShareLink) onCopyActiveShareLink();
                                else void copyText(fullShareUrl);
                              }}
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-100/70 disabled:opacity-50 cursor-pointer"
                            >
                              🔗 전용 링크 복사
                            </button>
                            <a
                              href={fullShareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid="inbox-todo-open-link-btn"
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-900 transition hover:bg-slate-50"
                            >
                              새 창 열기 ↗
                            </a>
                          </>
                        )}
                        <button
                          type="button"
                          data-testid="inbox-todo-copy-bundle-btn"
                          disabled={Boolean(busyAction)}
                          onClick={() => onPrepareCopyBundle?.()}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                        >
                          💬 카톡 안내문+링크 복사
                        </button>
                        <button
                          type="button"
                          data-testid="inbox-todo-lock-link-btn"
                          disabled={Boolean(busyAction)}
                          onClick={() => setTodoLockConfirmOpen(true)}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-extrabold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                        >
                          🔒 보낸 링크 잠그기
                        </button>
                      </div>

                      {todoLockConfirmOpen && (
                        <div
                          data-testid="inbox-todo-lock-confirm"
                          className="space-y-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3.5"
                        >
                          <p className="text-sm font-bold text-rose-900">
                            이 고객의 전용 열람 링크를 잠글까요?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              data-testid="inbox-todo-confirm-lock-btn"
                              disabled={Boolean(busyAction)}
                              onClick={() => {
                                setTodoLockConfirmOpen(false);
                                onConfirmLockLink?.();
                              }}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                            >
                              잠그기
                            </button>
                            <button
                              type="button"
                              data-testid="inbox-todo-cancel-lock-btn"
                              onClick={() => setTodoLockConfirmOpen(false)}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">
                      현재 열람 및 진행 상태
                    </h3>
                    <p className="mt-1.5 text-base text-slate-700">
                      {activeThread.focusedSections &&
                      activeThread.focusedSections.length > 0
                        ? `집중 열람 항목: ${activeThread.focusedSections.join(" · ")}`
                        : activeThread.openCount > 0
                        ? `발송한 자료를 총 ${activeThread.openCount}회 열람했습니다.`
                        : activeThread.gateStatus === "approved"
                        ? "승인 및 전용 링크 발급이 완료되어 고객 열람을 기다리고 있습니다."
                        : effectiveSharePath
                        ? "전용 링크가 준비되어 있습니다. 위 버튼이나 [자료 전달·관리]에서 바로 보낼 수 있습니다."
                        : "아직 자료를 열람하지 않았습니다. [자료 전달·관리]에서 IM·딜카드·뉴스레터를 선택해 바로 보낼 수 있습니다."}
                    </p>
                    {activeThread.openCount === 0 && activeThread.gateStatus !== "approved" && (
                      <button
                        type="button"
                        data-testid="inbox-open-preview-from-dwell-btn"
                        onClick={() =>
                          window.dispatchEvent(new CustomEvent("workspace:open-preview"))
                        }
                        className="mt-2 inline-flex xl:hidden min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
                      >
                        자료 전달·관리 열기
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* 최근 발송·처리 기록 (최신 1~2건 요약 + 기록 탭 이동) */}
              <div
                data-testid="inbox-todo-recent-dispatch-preview"
                className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    최근 발송·처리 기록
                  </h3>
                  <button
                    type="button"
                    data-testid="inbox-todo-jump-history-btn"
                    onClick={() => onSelectEditorTab("history")}
                    className="inline-flex min-h-[44px] items-center rounded-lg px-2.5 py-1 text-sm font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                  >
                    전체 기록 보기 ({dispatchHistory.length}) ›
                  </button>
                </div>
                {recentDispatches.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    아직 발송·처리 기록이 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {recentDispatches.map((item) => {
                      const chLabel = formatDispatchChannelLabel(item.channel);
                      const stBadge = formatDispatchStatusBadge(item.status);
                      return (
                        <li
                          key={item.id}
                          data-testid={`inbox-todo-dispatch-item-${item.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-sm font-bold text-slate-800">
                              {chLabel}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${stBadge.cls}`}
                            >
                              {stBadge.label}
                            </span>
                            <span className="truncate font-semibold text-slate-900">
                              {item.title}
                            </span>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">
                            {formatListDate(item.createdAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* 탭 2: 메시지 (카톡 안내 문구 편집) */}
          {activeEditorTab === "message" && (
            <div
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              data-testid="inbox-tab-panel-message"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  카카오톡 자료 발송 메시지
                </h3>
                {onGenerateAiReply && (
                  <button
                    type="button"
                    data-testid="inbox-ai-reply-btn"
                    disabled={aiReplyLoading || busyAction !== null}
                    onClick={() => void onGenerateAiReply(activeThread)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-extrabold text-blue-900 transition hover:bg-blue-100 disabled:opacity-60 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>
                      {aiReplyLoading
                        ? "AI 문구 작성 중..."
                        : aiReplyCount > 0
                        ? "다른 표현으로 다시 쓰기"
                        : "AI 맞춤 답장 작성"}
                    </span>
                  </button>
                )}
              </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-600">
                <span>
                  자료 종류 선택 및 카톡 복사·이메일 발송은{" "}
                  <strong className="font-bold text-slate-800">[자료 전달·관리]</strong>에서 한 번에 진행할 수 있습니다.
                </span>
                <button
                  type="button"
                  data-testid="inbox-open-preview-from-tip-btn"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent("workspace:open-preview"))
                  }
                  className="xl:hidden min-h-[44px] shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
                >
                  자료 전달·관리 열기
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
