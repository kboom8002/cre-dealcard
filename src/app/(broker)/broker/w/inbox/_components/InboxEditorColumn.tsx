"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { copyText } from "@/lib/ux/clipboard";
import { formatListDate } from "@/lib/workspace/list-date";
import {
  ALIMTALK_EARLY_ACCESS_NOTICE,
  type InboxAlimtalkTemplateId,
  type InboxEditorTabType,
  type InboxThreadItem,
  type InboxTransactionalBasis,
  type KakaoOutreachPresetKind,
  KAKAO_OUTREACH_PRESET_OPTIONS,
  formatClientRoleLabel,
  formatPhoneKo,
  getInboxStatusBadge,
  getInboxThreadDisplayTitle,
  isAnonymousViewerThread,
  isValidCallPhone,
} from "./inbox-types";

export type { InboxAlimtalkTemplateId };

export interface InboxEditorColumnProps {
  activeThread: InboxThreadItem | null;
  activeEditorTab?: InboxEditorTabType;
  inlineActionError: string | null;
  busyAction: string | null;
  lastIssuedUrl?: string;
  kakaoHeadline: string;
  kakaoBrief: string;
  callNote?: string;
  outboundAssetKind?: "im" | "dealcard" | "magazine";
  subscriptionTier?: "free" | "pro" | "premium";
  outboundEmail?: string;
  outboundBasis?: "" | InboxTransactionalBasis;
  marketingConsentConfirmed?: boolean;
  alimtalkTemplateId?: InboxAlimtalkTemplateId;
  kakaoPresetKind?: KakaoOutreachPresetKind;
  copiedBundlePreview?: string | null;
  showAlimtalkUpgradeSheet?: boolean;
  onSelectEditorTab?: (tab: InboxEditorTabType) => void;
  onKakaoHeadlineChange: (next: string) => void;
  onKakaoBriefChange: (next: string) => void;
  onCallNoteChange?: (next: string) => void;
  onSaveCallNote?: () => void;
  onApproveAndSendIm: (thread: InboxThreadItem) => void;
  onRejectRequest: (thread: InboxThreadItem) => void;
  onSendMaterial?: (kind: "im" | "dealcard" | "newsletter" | "magazine") => void;
  onArchiveThread: (thread: InboxThreadItem) => void;
  onCopyActiveShareLink?: () => void;
  onPrepareCopyBundle?: () => void;
  onOutboundAssetKindChange?: (next: "im" | "dealcard" | "magazine") => void;
  onOutboundEmailChange?: (next: string) => void;
  onOutboundBasisChange?: (next: "" | InboxTransactionalBasis) => void;
  onMarketingConsentConfirmedChange?: (checked: boolean) => void;
  onAlimtalkTemplateChange?: (next: InboxAlimtalkTemplateId) => void;
  onKakaoPresetChange?: (kind: KakaoOutreachPresetKind) => void;
  onSendInboxEmail?: () => void;
  onSendInboxAlimtalk?: () => void;
  onCloseAlimtalkUpgradeSheet?: () => void;
  onConfirmLockLink?: () => void;
  onUnlockLink?: () => void;
  onCopyClientEmail?: (email: string) => void;
  onGenerateAiReply?: (thread: InboxThreadItem) => Promise<void> | void;
  onConvertAnonToClient?: (thread: InboxThreadItem) => void;
  aiReplyLoading?: boolean;
  aiReplyCount?: number;
}

export function InboxEditorColumn({
  activeThread,
  inlineActionError,
  busyAction,
  lastIssuedUrl = "",
  kakaoHeadline,
  kakaoBrief,
  outboundAssetKind = "im",
  subscriptionTier = "free",
  outboundEmail = "",
  outboundBasis = "",
  marketingConsentConfirmed = false,
  alimtalkTemplateId = "TPL_INBOX_IM_APPROVED",
  kakaoPresetKind = "intro",
  copiedBundlePreview = null,
  showAlimtalkUpgradeSheet = false,
  onKakaoHeadlineChange,
  onKakaoBriefChange,
  onApproveAndSendIm,
  onRejectRequest,
  onArchiveThread,
  onCopyActiveShareLink,
  onPrepareCopyBundle,
  onOutboundAssetKindChange,
  onOutboundEmailChange,
  onOutboundBasisChange,
  onMarketingConsentConfirmedChange,
  onAlimtalkTemplateChange,
  onKakaoPresetChange,
  onSendInboxEmail,
  onSendInboxAlimtalk,
  onCloseAlimtalkUpgradeSheet,
  onUnlockLink,
  onCopyClientEmail,
  onGenerateAiReply,
  onConvertAnonToClient,
  aiReplyLoading = false,
  aiReplyCount = 0,
}: InboxEditorColumnProps) {
  const [clientOrigin, setClientOrigin] = React.useState("");
  const [localAssetKind, setLocalAssetKind] = React.useState<"im" | "dealcard" | "magazine">(
    outboundAssetKind
  );

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
    setLocalAssetKind(outboundAssetKind);
  }, [outboundAssetKind, activeThread?.id]);

  const effectiveAssetKind = onOutboundAssetKindChange ? outboundAssetKind : localAssetKind;
  const selectAssetKind = (next: "im" | "dealcard" | "magazine") => {
    setLocalAssetKind(next);
    onOutboundAssetKindChange?.(next);
  };

  const statusBadge = activeThread ? getInboxStatusBadge(activeThread) : null;
  const isAnon = isAnonymousViewerThread(activeThread);
  const displayTitle = activeThread ? getInboxThreadDisplayTitle(activeThread) : "";
  const effectiveSharePath = activeThread
    ? (activeThread.shareUrl || lastIssuedUrl || "").trim()
    : "";
  const fullShareUrl = effectiveSharePath
    ? effectiveSharePath.startsWith("/") && clientOrigin
      ? `${clientOrigin}${effectiveSharePath}`
      : effectiveSharePath
    : "";
  const validCallPhone = activeThread ? isValidCallPhone(activeThread.clientPhone) : false;
  const cleanEmail = activeThread?.clientEmail?.trim() || "";
  const hasBuildingAttached = Boolean(activeThread?.buildingId?.trim());
  const imNotGenerated =
    Boolean(activeThread?.buildingId?.trim()) && activeThread?.hasIm === false;

  return (
    <div
      className="mx-auto max-w-3xl space-y-4 p-4 md:p-6"
      data-testid="inbox-editor-slot"
    >
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">
            선택된 고객이 없습니다
          </h2>
          <p className="mt-2 text-base text-slate-600">
            고객 목록에서 대상을 선택하거나 [+ 고객 등록] 버튼을 눌러 새 고객을 추가해 보세요.
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

          {/* 익명 열람자 전환 안내 배너 */}
          {isAnon && (
            <div
              data-testid="inbox-anon-convert-card"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-extrabold text-amber-950">
                  연락처가 아직 없는 익명 열람자입니다 (총 {activeThread.openCount}회 열람)
                </p>
                <p className="text-sm text-amber-900 break-keep">
                  누구인지 파악되셨다면 정식 고객으로 등록해 전화·카톡 상담 이력을 이어갈 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                data-testid="inbox-convert-anon-btn"
                onClick={() => onConvertAnonToClient?.(activeThread)}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-2xs transition hover:bg-blue-700 cursor-pointer whitespace-nowrap"
              >
                + 정식 고객으로 등록
              </button>
            </div>
          )}

          {/* 선택된 고객 상단 컨텍스트 바 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-[#1D1D1F]">
                    {displayTitle}
                  </h2>
                  {statusBadge && (
                    <span
                      data-testid="inbox-editor-status-badge"
                      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-bold ${statusBadge.cls}`}
                    >
                      {statusBadge.text}
                    </span>
                  )}
                  {(activeThread.isVip === true || activeThread.clientGrade === "VIP") && (
                    <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-sm font-bold text-[#1D1D1F]">
                      VIP
                    </span>
                  )}
                  {activeThread.clientRole && !activeThread.id.startsWith("view_") && (
                    <span className="text-sm font-semibold text-[#515154]">
                      · {formatClientRoleLabel(activeThread.clientRole)}
                    </span>
                  )}
                  {!isAnon && activeThread.clientCompany && (
                    <span
                      data-testid="inbox-editor-client-company-badge"
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm font-semibold text-[#515154] shrink-0"
                    >
                      {activeThread.clientCompany}
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
                  const buildingDisplay = isRawUuidTitle
                    ? isNewsletterThread
                      ? "부동산뉴스"
                      : ""
                    : rawTitle;

                  return (
                    <>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-semibold text-[#1D1D1F]">
                        <span className="text-sm font-semibold text-[#6E6E73]">
                          {isNewsletterThread ? "열람 자료:" : "관심 매물:"}
                        </span>
                        {!buildingDisplay || buildingDisplay === "관심 매물 미지정" ? (
                          <span className="text-sm font-semibold text-[#6E6E73]">
                            미지정
                          </span>
                        ) : (
                          <span>{buildingDisplay}</span>
                        )}
                      </div>

                      {cleanEmail && (
                        <div
                          data-testid="inbox-editor-email-chip"
                          className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-1 text-sm font-semibold text-[#1D1D1F]"
                        >
                          <span className="font-semibold text-[#515154]">이메일:</span>
                          <a
                            href={`mailto:${cleanEmail}`}
                            data-testid="inbox-editor-email-mailto"
                            className="inline-flex min-h-[44px] items-center break-all font-bold text-[#1D4ED8] underline underline-offset-2"
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
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50 cursor-pointer"
                          >
                            복사
                          </button>
                        </div>
                      )}

                      {hasValidBuildingLink || showNewsletterLink ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {hasValidBuildingLink && (
                            <>
                              <Link
                                href={`/broker/w/dealcards?buildingId=${encodeURIComponent(
                                  activeThread.buildingId.trim()
                                )}`}
                                data-testid="inbox-open-dealcard-link"
                                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50"
                              >
                                딜카드 편집 →
                              </Link>
                              <Link
                                href={`/broker/w/im?buildingId=${encodeURIComponent(
                                  activeThread.buildingId.trim()
                                )}`}
                                data-testid="inbox-open-im-link"
                                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50"
                              >
                                {activeThread.hasIm === false ? "IM 만들기 →" : "IM 편집 →"}
                              </Link>
                            </>
                          )}
                          {showNewsletterLink && (
                            <Link
                              href="/broker/magazine-editor"
                              data-testid="inbox-open-magazine-link"
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50"
                            >
                              뉴스레터 →
                            </Link>
                          )}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {validCallPhone ? (
                  <a
                    href={`tel:${activeThread.clientPhone.trim()}`}
                    data-testid="editor-call-link"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#1D1D1F] hover:bg-slate-50"
                  >
                    전화 걸기 ({formatPhoneKo(activeThread.clientPhone)})
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    data-testid="preview-call-disabled"
                    className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-400"
                  >
                    전화번호 없음
                  </button>
                )}
                {!activeThread.id.startsWith("custom_") &&
                  !activeThread.id.startsWith("cli-") &&
                  !activeThread.id.startsWith("sub_") && (
                    <button
                      type="button"
                      data-testid="inbox-archive-thread-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => onArchiveThread(activeThread)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#515154] transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      숨김
                    </button>
                  )}
              </div>
            </div>
          </div>

          {/* 조건부 긴급 액션 카드 (승인 대기 / 링크 잠김 / 요청 거절됨) */}
          {(activeThread.status === "pending_gate" ||
            activeThread.status === "revoked" ||
            activeThread.gateStatus === "rejected") && (
            <div data-testid="inbox-tab-panel-todo" className="space-y-3">
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
              ) : (
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
              )}
            </div>
          )}

          {/* 원스톱 자료 선택 · 메시지 작성 · 바로 발송 워크스테이션 */}
          <div
            data-testid="inbox-outbound-channel-bar"
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            {/* STEP 1. 보낼 자료 고르기 & 전용 링크 확인 */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#1D1D1F]">
                  1. 보낼 자료 선택
                </h3>
              </div>

              <div
                role="tablist"
                aria-label="보낼 자료 선택"
                data-testid="inbox-outbound-asset-tabs"
                className="grid grid-cols-3 gap-2"
              >
                {(
                  [
                    { key: "dealcard", label: "딜카드" },
                    { key: "im", label: "제안서(IM)" },
                    { key: "magazine", label: "부동산뉴스" },
                  ] as const
                ).map((opt) => {
                  const isSelected = effectiveAssetKind === opt.key;
                  const disabledNoBuilding = !hasBuildingAttached && opt.key !== "magazine";
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      disabled={disabledNoBuilding}
                      data-testid={`inbox-asset-tab-${opt.key}`}
                      onClick={() => selectAssetKind(opt.key)}
                      className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-[#1D4ED8] bg-white text-[#1D4ED8] ring-1 ring-[#1D4ED8]/25 shadow-2xs"
                          : "border-slate-300 bg-white text-[#1D1D1F] hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {effectiveAssetKind === "im" && imNotGenerated && (
                <div
                  data-testid="inbox-im-not-generated-notice"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950"
                >
                  <span className="font-bold">
                    IM 미생성 · 먼저 작성하기 (딜카드 바로 보내기 가능)
                  </span>
                  <Link
                    href={`/broker/w/im?buildingId=${encodeURIComponent(activeThread.buildingId)}`}
                    className="inline-flex min-h-[44px] items-center font-extrabold text-amber-900 underline"
                  >
                    IM 만들기 →
                  </Link>
                </div>
              )}

              {(activeThread.gateStatus === "approved" || Boolean(fullShareUrl)) &&
                activeThread.status !== "revoked" && (
                  <div
                    data-testid="inbox-approved-link-card"
                    className="space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-md bg-emerald-200/80 px-2.5 py-0.5 text-sm font-extrabold text-emerald-950">
                        {activeThread.gateStatus === "approved"
                          ? "✓ 승인 및 전용 링크 발급 완료"
                          : "✓ 발급된 전용 열람 링크"}
                      </span>
                      <span className="text-sm font-bold text-emerald-900">
                        {activeThread.openCount > 0
                          ? `● ${activeThread.openCount}회 열람`
                          : "● 열람 대기 중"}
                      </span>
                    </div>

                    {fullShareUrl && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2">
                        <div
                          data-testid="inbox-approved-share-url"
                          className="min-w-0 flex-1 select-all break-all font-mono text-sm font-semibold text-emerald-950"
                        >
                          {fullShareUrl}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="inbox-copy-share-link-btn"
                            disabled={Boolean(busyAction)}
                            onClick={() => {
                              if (onCopyActiveShareLink) onCopyActiveShareLink();
                              else void copyText(fullShareUrl);
                            }}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          >
                            🔗 링크만 복사
                          </button>
                          <a
                            href={fullShareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="inbox-todo-open-link-btn"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 transition hover:bg-slate-50 whitespace-nowrap"
                          >
                            새 창 열기 ↗
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* STEP 2. 안내 문구 작성 (상황별 프리셋 + AI 맞춤 답장) */}
            <div
              className="space-y-3 border-t border-slate-200 pt-4"
              data-testid="inbox-tab-panel-message"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#1D1D1F]">
                  2. 안내 메시지 작성
                </h3>
                {onGenerateAiReply && (
                  <button
                    type="button"
                    data-testid="inbox-ai-reply-btn"
                    disabled={aiReplyLoading || busyAction !== null}
                    onClick={() => void onGenerateAiReply(activeThread)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                    <span>
                      {aiReplyLoading
                        ? "AI 작성 중…"
                        : aiReplyCount > 0
                        ? "AI 다시 쓰기"
                        : "AI 답장 쓰기"}
                    </span>
                  </button>
                )}
              </div>

              {/* 상황별 3종 인사말 선택 (무토큰 즉시 전환) */}
              <div
                role="tablist"
                aria-label="카톡 인사말 상황 선택"
                data-testid="inbox-kakao-preset-tabs"
                className="ios-segmented-track grid grid-cols-3 gap-1 rounded-[12px] border border-white/60 bg-[#767680]/[0.11] p-[3px] overflow-hidden"
              >
                {KAKAO_OUTREACH_PRESET_OPTIONS.map((opt) => {
                  const isSelected = kakaoPresetKind === opt.kind;
                  return (
                    <button
                      key={opt.kind}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      data-testid={`inbox-kakao-preset-${opt.kind}`}
                      onClick={() => onKakaoPresetChange?.(opt.kind)}
                      className={`min-h-[44px] rounded-[9px] px-2 py-1.5 text-sm font-semibold leading-snug break-keep text-center transition-all cursor-pointer ${
                        isSelected
                          ? "ios-segmented-pill bg-white text-[#007AFF]"
                          : "bg-transparent text-[#3A3A3C] hover:text-[#1D1D1F]"
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
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
                  안내 메시지
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
            </div>

            {/* STEP 3. 발송 바 (카톡 브랜드 옐로우 + 이메일 아웃라인 위계 분리) */}
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="inbox-copy-bundle-btn"
                  disabled={Boolean(busyAction)}
                  onClick={() => onPrepareCopyBundle?.()}
                  className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#FEE500] border border-[#F5DC00] px-4 py-3 text-center text-base font-extrabold text-[#191919] shadow-2xs transition hover:bg-[#F7DE00] disabled:opacity-50 cursor-pointer"
                >
                  카톡 문구·링크 복사
                </button>
                <button
                  type="button"
                  data-testid="inbox-send-email-btn"
                  disabled={Boolean(busyAction)}
                  onClick={() => onSendInboxEmail?.()}
                  className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border-2 border-[#1D4ED8] bg-white px-4 py-3 text-center text-base font-extrabold text-[#1D4ED8] transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  이메일로 보내기
                </button>
              </div>

              {copiedBundlePreview && (
                <div
                  data-testid="inbox-copied-bundle-preview"
                  className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 text-sm text-[#1D1D1F] whitespace-pre-line break-words"
                >
                  {copiedBundlePreview}
                </div>
              )}

              {/* 이메일 발송 조건 (순백/라이트슬레이트 폼) */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="inbox-client-email-input"
                      className="mb-1 block text-sm font-bold text-slate-800"
                    >
                      받을 이메일 주소
                    </label>
                    <input
                      id="inbox-client-email-input"
                      data-testid="inbox-client-email-input"
                      type="email"
                      value={outboundEmail}
                      onChange={(e) => onOutboundEmailChange?.(e.target.value)}
                      placeholder="예: buyer@company.co.kr"
                      className="min-h-[48px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="inbox-client-basis-select"
                      className="mb-1 block text-sm font-bold text-slate-800"
                    >
                      발송 근거
                    </label>
                    <select
                      id="inbox-client-basis-select"
                      data-testid="inbox-client-basis-select"
                      value={outboundBasis}
                      onChange={(e) =>
                        onOutboundBasisChange?.(
                          e.target.value as "" | InboxTransactionalBasis
                        )
                      }
                      className="min-h-[48px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="">고객 요청·상담 근거 선택</option>
                      <option value="im_request">고객 IM 열람 요청</option>
                      <option value="property_inquiry">고객 매물 문의 접수</option>
                      <option value="tour_booking">현장 임장·미팅 예약</option>
                      <option value="broker_manual">기존 상담 고객 1:1 안내</option>
                    </select>
                  </div>
                </div>

                <label
                  htmlFor="inbox-marketing-consent-checkbox"
                  className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 cursor-pointer"
                >
                  <input
                    id="inbox-marketing-consent-checkbox"
                    data-testid="inbox-marketing-consent-checkbox"
                    type="checkbox"
                    checked={Boolean(marketingConsentConfirmed)}
                    onChange={(e) => onMarketingConsentConfirmedChange?.(e.target.checked)}
                    className="h-5 w-5 shrink-0 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                  />
                  <span>
                    광고성 이메일 수신 동의를 확인했습니다 (수신거부 링크 자동 포함)
                  </span>
                </label>
              </div>

              {/* 카카오 알림톡 PRO (사후 오픈 예정) — 1줄 접힘 안에 안내 단일화 */}
              <details
                data-testid="inbox-alimtalk-disclosure"
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2"
              >
                <summary className="flex min-h-[44px] items-center justify-between gap-2 text-sm font-bold text-[#515154] cursor-pointer list-none">
                  <span>카카오 알림톡 자동 발송 (오픈 예정)</span>
                  <span className="text-sm font-semibold text-[#6E6E73]">자세히 ▾</span>
                </summary>
                <div className="mt-2.5 space-y-2.5 border-t border-slate-200 pt-2.5">
                  <p
                    data-testid="inbox-alimtalk-early-access-hint"
                    className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-sm leading-relaxed text-[#515154]"
                  >
                    {ALIMTALK_EARLY_ACCESS_NOTICE}
                  </p>
                  <div>
                    <label
                      htmlFor="inbox-alimtalk-template-select"
                      className="mb-1 block text-sm font-bold text-slate-700"
                    >
                      알림톡 양식 선택
                    </label>
                    <select
                      id="inbox-alimtalk-template-select"
                      data-testid="inbox-alimtalk-template-select"
                      value={alimtalkTemplateId}
                      onChange={(e) =>
                        onAlimtalkTemplateChange?.(
                          e.target.value as InboxAlimtalkTemplateId
                        )
                      }
                      className="min-h-[48px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="TPL_INBOX_IM_APPROVED">IM 열람 승인 안내</option>
                      <option value="TPL_INBOX_INQUIRY_REPLY">매물 문의 답변 안내</option>
                      <option value="TPL_INBOX_TOUR_CONFIRMED">임장·미팅 일정 안내</option>
                      <option value="TPL_INBOX_CORRECTION_NOTICE">수정 정정 안내</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    data-testid="inbox-send-alimtalk-btn"
                    disabled={Boolean(busyAction)}
                    onClick={() => onSendInboxAlimtalk?.()}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-center text-sm font-bold text-[#1D1D1F] whitespace-normal transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    카카오 알림톡 발송 (오픈 예정)
                  </button>
                </div>
              </details>

              {showAlimtalkUpgradeSheet && (
                <div
                  data-testid="inbox-alimtalk-upgrade-sheet"
                  className="space-y-2.5 rounded-xl border-2 border-amber-300 bg-amber-50/80 p-3.5"
                >
                  <p className="text-sm font-extrabold text-amber-950">
                    카카오 알림톡 발송은 Pro 플랜 기능입니다
                  </p>
                  <p className="text-sm leading-relaxed text-amber-900">
                    {ALIMTALK_EARLY_ACCESS_NOTICE}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => onPrepareCopyBundle?.()}
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 cursor-pointer"
                    >
                      카톡 인사말·링크 1초 복사로 보내기
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => onSendInboxEmail?.()}
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 cursor-pointer"
                    >
                      등록 이메일로 무료 발송하기
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCloseAlimtalkUpgradeSheet?.()}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-amber-200 bg-transparent px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                  >
                    안내 닫기
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
