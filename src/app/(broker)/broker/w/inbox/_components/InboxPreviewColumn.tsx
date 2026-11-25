"use client";

import React from "react";
import { PreviewEditableUnit } from "@/components/workspace/preview-sync/PreviewEditableUnit";
import {
  type InboxAlimtalkTemplateId,
  type InboxThreadItem,
  type InboxTransactionalBasis,
  type KakaoOutreachPresetKind,
  computePriorityContactSignal,
  formatClientRoleLabel,
  formatPhoneKo,
  isValidCallPhone,
} from "./inbox-types";
import { InboxDispatchTimeline } from "./InboxDispatchTimeline";

export type { InboxAlimtalkTemplateId };

export interface InboxPreviewColumnProps {
  activeThread: InboxThreadItem | null;
  activeInboxUnitId: string | null;
  busyAction: string | null;
  callNote?: string;
  onCallNoteChange?: (next: string) => void;
  onSaveCallNote?: () => void;
  confirmLockOpen: boolean;
  lockEntireBuilding: boolean;
  correctionNoticeOpen: boolean;
  correctionNoticeText: string;
  onFocusEditorUnit: (unitId: string) => void;
  onToggleNewsletter: () => void;
  onOpenEditCustomClient: () => void;
  onRequestDeleteCustomClient: () => void;
  onOpenConfirmLock: () => void;
  onCancelConfirmLock: () => void;
  onLockEntireBuildingChange: (checked: boolean) => void;
  onConfirmLockLink: () => void;
  onUnlockLink: () => void;
  onOpenCorrectionNotice: () => void;
  onCancelCorrectionNotice: () => void;
  onCorrectionNoticeTextChange: (next: string) => void;
  onPublishCorrectionNotice: () => void;
  onClearCorrectionNotice: () => void;
  // Backward-compatible optional props
  showShareSheet?: boolean;
  outboundAssetKind?: "im" | "dealcard" | "magazine";
  subscriptionTier?: "free" | "pro" | "premium";
  outboundEmail?: string;
  outboundBasis?: "" | InboxTransactionalBasis;
  marketingConsentConfirmed?: boolean;
  alimtalkTemplateId?: InboxAlimtalkTemplateId;
  kakaoPresetKind?: KakaoOutreachPresetKind;
  copiedBundlePreview?: string | null;
  showAlimtalkUpgradeSheet?: boolean;
  onCopyActiveShareLink?: () => void;
  onSendMaterial?: (kind: "im" | "dealcard" | "newsletter" | "magazine") => void;
  onOutboundAssetKindChange?: (next: "im" | "dealcard" | "magazine") => void;
  onOutboundEmailChange?: (next: string) => void;
  onOutboundBasisChange?: (next: "" | InboxTransactionalBasis) => void;
  onMarketingConsentConfirmedChange?: (checked: boolean) => void;
  onAlimtalkTemplateChange?: (next: InboxAlimtalkTemplateId) => void;
  onKakaoPresetChange?: (kind: KakaoOutreachPresetKind) => void;
  onPrepareCopyBundle?: () => void;
  onSendInboxEmail?: () => void;
  onSendInboxAlimtalk?: () => void;
  onCloseAlimtalkUpgradeSheet?: () => void;
}

export function InboxPreviewColumn({
  activeThread,
  activeInboxUnitId,
  busyAction,
  callNote = "",
  onCallNoteChange = () => {},
  onSaveCallNote = () => {},
  confirmLockOpen,
  lockEntireBuilding,
  correctionNoticeOpen,
  correctionNoticeText,
  onFocusEditorUnit,
  onToggleNewsletter,
  onOpenEditCustomClient,
  onRequestDeleteCustomClient,
  onOpenConfirmLock,
  onCancelConfirmLock,
  onLockEntireBuildingChange,
  onConfirmLockLink,
  onUnlockLink,
  onOpenCorrectionNotice,
  onCancelCorrectionNotice,
  onCorrectionNoticeTextChange,
  onPublishCorrectionNotice,
  onClearCorrectionNotice,
}: InboxPreviewColumnProps) {
  const prioritySignal = computePriorityContactSignal(activeThread);
  const [govOpen, setGovOpen] = React.useState(false);

  React.useEffect(() => {
    setGovOpen(false);
  }, [activeThread?.id]);

  const hasLinkTarget = Boolean(
    activeThread?.buildingId?.trim() || activeThread?.shareToken?.trim()
  );

  const effectiveGovOpen =
    govOpen ||
    activeThread?.status === "revoked" ||
    Boolean(activeThread?.hasCorrectionNotice) ||
    confirmLockOpen ||
    correctionNoticeOpen;

  return (
    <div className="space-y-4" data-testid="inbox-preview-slot">
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-base font-semibold text-slate-700">
            고객을 선택하거나 새로 등록하면 요약 정보와 상담 기록이 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* 집중 열람 먼저 연락 배너 */}
          {prioritySignal?.isPriority && activeThread.gateStatus !== "pending" && (
            <div
              data-testid="inbox-priority-contact-banner"
              className="rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-2.5 space-y-0.5"
            >
              <p className="text-sm font-extrabold text-amber-950">
                {prioritySignal.badgeLabel}
              </p>
              <p className="text-sm text-amber-900 break-keep">
                {prioritySignal.detailLabel}
              </p>
            </div>
          )}

          {/* 1. 고객 CRM 요약 카드 */}
          <div
            data-testid="inbox-client-summary-card"
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                고객 요약
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeThread.clientRole && !activeThread.id.startsWith("view_") && (
                  <span className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                    {formatClientRoleLabel(activeThread.clientRole)}
                  </span>
                )}
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
                  {activeThread.clientGrade}
                </span>
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">고객명</dt>
                <dd className="font-bold text-slate-900">
                  {activeThread.clientName}
                </dd>
              </div>
              {activeThread.clientCompany && (
                <div
                  data-testid="inbox-summary-client-company"
                  className="flex items-center justify-between gap-2"
                >
                  <dt className="font-semibold text-slate-500">소속·회사</dt>
                  <dd className="truncate font-bold text-slate-900">
                    {activeThread.clientCompany}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">연락처</dt>
                <dd className="font-bold text-slate-900">
                  {isValidCallPhone(activeThread.clientPhone) ? (
                    <a
                      href={`tel:${activeThread.clientPhone.trim()}`}
                      data-testid="preview-call-link"
                      className="text-blue-700 hover:underline font-bold"
                    >
                      {formatPhoneKo(activeThread.clientPhone)}
                    </a>
                  ) : (
                    "전화번호 없음"
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="shrink-0 font-semibold text-slate-500">이메일</dt>
                <dd className="min-w-0 text-right font-bold text-slate-900">
                  <span className="break-all">
                    {activeThread.clientEmail || "미등록 (발송 시 직접 입력)"}
                  </span>
                  {activeThread.emailDeliveryStatus === "bounced" && (
                    <span
                      data-testid="inbox-summary-email-bounced-badge"
                      className="mt-1 inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-sm font-bold text-rose-900"
                    >
                      ⚠️ 이메일 반송됨
                    </span>
                  )}
                  {activeThread.emailDeliveryStatus === "complained" && (
                    <span
                      data-testid="inbox-summary-email-complained-badge"
                      className="mt-1 inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-950"
                    >
                      수신차단
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">관심 매물</dt>
                <dd className="truncate font-bold text-slate-900">
                  {activeThread.buildingTitle}
                </dd>
              </div>
              {activeThread.budget && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-semibold text-slate-500">희망 예산</dt>
                  <dd className="truncate font-bold text-slate-900">
                    {activeThread.budget}
                  </dd>
                </div>
              )}
              {(activeThread.preferredRegion ||
                (activeThread.preferredRegions &&
                  activeThread.preferredRegions.length > 0)) && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-semibold text-slate-500">선호 권역</dt>
                  <dd className="truncate font-bold text-slate-900">
                    {activeThread.preferredRegion ||
                      (activeThread.preferredRegions || []).join(", ")}
                  </dd>
                </div>
              )}
              {activeThread.cleanMessage?.trim() &&
                activeThread.cleanMessage.trim() !== (activeThread.freeMemo || "").trim() && (
                  <div
                    data-testid="inbox-summary-clean-message"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <dt className="font-semibold text-slate-500">요청·문의 내용</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 whitespace-pre-line break-words">
                      {activeThread.cleanMessage.trim()}
                    </dd>
                  </div>
                )}
              {activeThread.freeMemo && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <dt className="font-semibold text-slate-500">상담 메모</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 whitespace-pre-line break-words">
                    {activeThread.freeMemo}
                  </dd>
                </div>
              )}
              <PreviewEditableUnit
                unitId="ib-unit-history"
                label="열람 횟수 및 상담 기록"
                testId="preview-unit-inbox-history"
                badgePosition="inside"
                badgeText="메모 남기기 ›"
                activeBadgeText="상담 메모"
                isActive={activeInboxUnitId === "ib-unit-history"}
                onActivate={onFocusEditorUnit}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="font-semibold text-slate-600">고객 반응</dt>
                  <dd
                    data-testid="inbox-client-reaction-badge"
                    className={`font-bold ${
                      activeThread.openCount > 0 ? "text-blue-700" : "text-slate-700"
                    }`}
                  >
                    {activeThread.openCount > 0
                      ? `열람 ${activeThread.openCount}회${
                          activeThread.dwellSeconds && activeThread.dwellSeconds > 0
                            ? ` · 체류 ${activeThread.dwellSeconds}초`
                            : ""
                        }`
                      : "미열람"}
                  </dd>
                </div>
                {activeThread.focusedSections &&
                  activeThread.focusedSections.length > 0 && (
                    <p className="mt-1 text-sm text-slate-600">
                      집중 열람 항목: {activeThread.focusedSections.join(" · ")}
                    </p>
                  )}
              </PreviewEditableUnit>
              <div className="flex items-center justify-between gap-2 pt-1">
                <dt className="font-semibold text-slate-500">뉴스레터</dt>
                <dd>
                  <button
                    type="button"
                    data-testid="toggle-newsletter-btn"
                    disabled={Boolean(busyAction)}
                    onClick={onToggleNewsletter}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-bold transition disabled:opacity-50 cursor-pointer ${
                      activeThread.newsletterSubscribed
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : activeThread.newsletterStatus === "pending" ||
                          (activeThread.id.startsWith("sub_") &&
                            (activeThread.cleanMessage || "").includes("수신 확인 대기"))
                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {activeThread.newsletterSubscribed
                      ? "수신 동의"
                      : activeThread.newsletterStatus === "pending" ||
                        (activeThread.id.startsWith("sub_") &&
                          (activeThread.cleanMessage || "").includes("수신 확인 대기"))
                      ? "인증 대기"
                      : "미구독"}
                  </button>
                </dd>
              </div>
            </dl>

            {/* 고객 정보 수정 / 직접 등록 고객 삭제 버튼 */}
            {!activeThread.id.startsWith("view_") && (
              <div
                className={`grid gap-2 border-t border-slate-200 pt-3 ${
                  activeThread.id.startsWith("custom_")
                    ? "grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                <button
                  type="button"
                  data-testid="edit-custom-client-btn"
                  disabled={Boolean(busyAction)}
                  onClick={onOpenEditCustomClient}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  정보 수정
                </button>
                {activeThread.id.startsWith("custom_") && (
                  <button
                    type="button"
                    data-testid="delete-custom-client-btn"
                    disabled={Boolean(busyAction)}
                    onClick={onRequestDeleteCustomClient}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                  >
                    고객 삭제
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. 상시 노출 통화·상담 메모 + 통합 활동 타임라인 (답장 작성 중 바로 참조) */}
          <InboxDispatchTimeline
            thread={activeThread}
            callNote={callNote}
            busyAction={busyAction}
            onCallNoteChange={onCallNoteChange}
            onSaveCallNote={onSaveCallNote}
          />

          {/* 3. 접이식 전용 링크 잠금 · 수치 정정 관리 (기본 닫힘, 실제 작동 기능만 제공) */}
          <details
            data-testid="inbox-link-governance-disclosure"
            open={effectiveGovOpen}
            onToggle={(e) => setGovOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-xs"
          >
            <summary className="flex min-h-[44px] items-center justify-between gap-2 text-sm font-extrabold text-[#1D1D1F] cursor-pointer list-none">
              <span>전용 링크 잠금 · 수치 정정</span>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${
                  activeThread.status === "revoked"
                    ? "bg-rose-100 text-rose-800"
                    : activeThread.hasCorrectionNotice
                    ? "bg-amber-100 text-amber-900"
                    : !hasLinkTarget
                    ? "bg-slate-100 text-slate-500"
                    : "bg-slate-100 text-[#059669]"
                }`}
              >
                {activeThread.status === "revoked"
                  ? "링크 잠김"
                  : activeThread.hasCorrectionNotice
                  ? "정정 게시 중"
                  : !hasLinkTarget
                  ? "매물 미연결 ▾"
                  : "열람 가능 ▾"}
              </span>
            </summary>

            <div data-testid="inbox-link-governance-card" className="pb-2 pt-3 border-t border-slate-100 mt-1">
              {!hasLinkTarget && (
                <p
                  data-testid="inbox-link-governance-disabled-hint"
                  className="mb-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
                >
                  연결된 매물이 없어 링크 관리가 비활성화됩니다
                </p>
              )}
              {activeThread.status === "revoked" ? (
                <div className="space-y-2">
                  <p className="text-sm text-rose-700">
                    이 고객에게 보낸 전용 링크는 현재 잠겨 있어 열람이 차단됩니다.
                  </p>
                  <button
                    type="button"
                    data-testid="unlock-share-link-btn"
                    disabled={Boolean(busyAction)}
                    onClick={onUnlockLink}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    링크 다시 열기
                  </button>
                </div>
              ) : !confirmLockOpen ? (
                <div>
                  <button
                    type="button"
                    data-testid="lock-share-link-trigger-btn"
                    disabled={Boolean(busyAction) || !hasLinkTarget}
                    onClick={onOpenConfirmLock}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1D1D1F] transition hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    보낸 링크 잠그기
                  </button>
                </div>
              ) : (
                <div
                  data-testid="lock-share-link-inline-confirm"
                  className="space-y-3 rounded-xl border border-rose-300 bg-rose-50/80 p-3.5"
                >
                  <p className="text-sm font-bold text-rose-900">
                    이 고객의 열람 링크를 잠글까요?
                  </p>
                  {Boolean(activeThread.buildingId.trim()) && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2.5">
                      <input
                        id="lock-entire-building-checkbox"
                        data-testid="lock-entire-building-checkbox"
                        type="checkbox"
                        checked={lockEntireBuilding}
                        onChange={(e) => onLockEntireBuildingChange(e.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                      />
                      <label
                        htmlFor="lock-entire-building-checkbox"
                        className="text-sm font-semibold text-slate-800 cursor-pointer"
                      >
                        이 건물 전체 열람 잠금 (모든 수신자 차단)
                      </label>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="confirm-lock-link-btn"
                      disabled={Boolean(busyAction)}
                      onClick={onConfirmLockLink}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                      잠그기
                    </button>
                    <button
                      type="button"
                      data-testid="cancel-lock-link-btn"
                      onClick={onCancelConfirmLock}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {/* 수치 정정 안내 제어 */}
              <div
                data-testid="inbox-correction-notice-section"
                className="mt-4 border-t border-slate-200 pt-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    수치 정정 안내 배너
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${
                      activeThread.hasCorrectionNotice
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {activeThread.hasCorrectionNotice ? "표시 중" : "꺼짐"}
                  </span>
                </div>

                {activeThread.hasCorrectionNotice ? (
                  <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900 leading-snug">
                      ⚠️{" "}
                      {activeThread.correctionMessage ||
                        "매물 제원이 최신 기준으로 정정되었습니다."}
                    </p>
                    <button
                      type="button"
                      data-testid="clear-correction-notice-btn"
                      disabled={Boolean(busyAction)}
                      onClick={onClearCorrectionNotice}
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                    >
                      정정 안내 내리기
                    </button>
                  </div>
                ) : !correctionNoticeOpen ? (
                  <button
                    type="button"
                    data-testid="open-correction-notice-btn"
                    disabled={Boolean(busyAction) || !hasLinkTarget}
                    onClick={onOpenCorrectionNotice}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#1D1D1F] transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    수치 정정 안내 띄우기
                  </button>
                ) : (
                  <div
                    data-testid="correction-notice-inline-box"
                    className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5"
                  >
                    <label
                      htmlFor="correction-notice-input"
                      className="block text-sm font-bold text-amber-950"
                    >
                      수신자 화면 상단에 띄울 정정 문구
                    </label>
                    <input
                      id="correction-notice-input"
                      data-testid="correction-notice-input"
                      type="text"
                      value={correctionNoticeText}
                      onChange={(e) => onCorrectionNoticeTextChange(e.target.value)}
                      placeholder="예: 3층 임대료 조건이 정정되었습니다."
                      className="w-full min-h-[48px] rounded-lg border border-amber-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid="submit-correction-notice-btn"
                        disabled={Boolean(busyAction)}
                        onClick={onPublishCorrectionNotice}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-extrabold text-slate-950 hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                      >
                        정정 안내 게시
                      </button>
                      <button
                        type="button"
                        data-testid="cancel-correction-notice-btn"
                        onClick={onCancelCorrectionNotice}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
