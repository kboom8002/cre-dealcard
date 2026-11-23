"use client";

import React from "react";
import Link from "next/link";
import { PreviewEditableUnit } from "@/components/workspace/preview-sync/PreviewEditableUnit";
import {
  ALIMTALK_EARLY_ACCESS_NOTICE,
  type InboxThreadItem,
  type InboxTransactionalBasis,
  type KakaoOutreachPresetKind,
  KAKAO_OUTREACH_PRESET_OPTIONS,
  computePriorityContactSignal,
  formatClientRoleLabel,
  formatPhoneKo,
  isValidCallPhone,
} from "./inbox-types";

export type InboxAlimtalkTemplateId =
  | "TPL_INBOX_IM_APPROVED"
  | "TPL_INBOX_INQUIRY_REPLY"
  | "TPL_INBOX_TOUR_CONFIRMED"
  | "TPL_INBOX_CORRECTION_NOTICE";

export interface InboxPreviewColumnProps {
  activeThread: InboxThreadItem | null;
  activeInboxUnitId: string | null;
  busyAction: string | null;
  showShareSheet?: boolean;
  outboundAssetKind?: "im" | "dealcard" | "magazine";
  subscriptionTier: "free" | "pro" | "premium";
  outboundEmail: string;
  outboundBasis: "" | InboxTransactionalBasis;
  marketingConsentConfirmed?: boolean;
  alimtalkTemplateId: InboxAlimtalkTemplateId;
  kakaoPresetKind?: KakaoOutreachPresetKind;
  copiedBundlePreview: string | null;
  showAlimtalkUpgradeSheet: boolean;
  confirmLockOpen: boolean;
  lockEntireBuilding: boolean;
  correctionNoticeOpen: boolean;
  correctionNoticeText: string;
  onFocusEditorUnit: (unitId: string) => void;
  onCopyActiveShareLink: () => void;
  onSendMaterial: (kind: "im" | "dealcard" | "newsletter" | "magazine") => void;
  onOutboundAssetKindChange?: (next: "im" | "dealcard" | "magazine") => void;
  onOutboundEmailChange: (next: string) => void;
  onOutboundBasisChange: (next: "" | InboxTransactionalBasis) => void;
  onMarketingConsentConfirmedChange?: (checked: boolean) => void;
  onAlimtalkTemplateChange: (next: InboxAlimtalkTemplateId) => void;
  onKakaoPresetChange?: (kind: KakaoOutreachPresetKind) => void;
  onPrepareCopyBundle: () => void;
  onSendInboxEmail: () => void;
  onSendInboxAlimtalk: () => void;
  onCloseAlimtalkUpgradeSheet: () => void;
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
}

export function InboxPreviewColumn({
  activeThread,
  activeInboxUnitId,
  busyAction,
  outboundAssetKind = "im",
  subscriptionTier,
  outboundEmail,
  outboundBasis,
  marketingConsentConfirmed = false,
  alimtalkTemplateId,
  kakaoPresetKind = "intro",
  copiedBundlePreview,
  showAlimtalkUpgradeSheet,
  confirmLockOpen,
  lockEntireBuilding,
  correctionNoticeOpen,
  correctionNoticeText,
  onFocusEditorUnit,
  onCopyActiveShareLink,
  onOutboundAssetKindChange,
  onOutboundEmailChange,
  onOutboundBasisChange,
  onMarketingConsentConfirmedChange,
  onAlimtalkTemplateChange,
  onKakaoPresetChange,
  onPrepareCopyBundle,
  onSendInboxEmail,
  onSendInboxAlimtalk,
  onCloseAlimtalkUpgradeSheet,
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
  const [localAssetKind, setLocalAssetKind] = React.useState<"im" | "dealcard" | "magazine">(outboundAssetKind);
  React.useEffect(() => {
    setLocalAssetKind(outboundAssetKind);
  }, [outboundAssetKind, activeThread?.id]);
  const effectiveAssetKind = onOutboundAssetKindChange ? outboundAssetKind : localAssetKind;
  const selectAssetKind = (next: "im" | "dealcard" | "magazine") => {
    setLocalAssetKind(next);
    onOutboundAssetKindChange?.(next);
  };
  const isUrgentSticky =
    activeThread?.status === "pending_gate" || activeThread?.status === "revoked";
  const hasBuildingAttached = Boolean(activeThread?.buildingId?.trim());
  const imNotGenerated =
    Boolean(activeThread?.buildingId?.trim()) && activeThread?.hasIm === false;

  return (
    <div className="space-y-4" data-testid="inbox-preview-slot">
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-base font-semibold text-slate-700">
            고객을 선택하거나 새로 등록하면 요약 정보와 링크 관리 메뉴가 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* Column 3 최상단 연동 요약 바 — 승인 대기/링크 잠금 시에만 불투명 상단 고정 */}
          <div
            className={
              isUrgentSticky
                ? "sticky top-0 z-20 -mx-4 -mt-4 bg-[#F5F5F7] px-4 pt-3 pb-2 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.18)]"
                : ""
            }
          >
            <div
              data-testid="inbox-causality-bar"
              className={`rounded-xl border px-3.5 py-2.5 shadow-2xs flex flex-col gap-2 ${
                activeThread.status === "pending_gate"
                  ? "border-amber-400 bg-amber-50"
                  : activeThread.status === "revoked"
                  ? "border-rose-300 bg-rose-50"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-slate-900 break-keep">
                {activeThread.status === "pending_gate"
                  ? "⏳ 열람 요청 대기 중"
                  : activeThread.status === "revoked"
                  ? "🔒 보낸 링크 잠김"
                  : activeThread.openCount >= 3 || activeThread.status === "high_interest"
                  ? `● 관심 고객 · 열람 ${activeThread.openCount}회`
                  : "● 실시간 고객 정보·링크 관리"}
              </span>
              <span className="text-sm font-semibold text-slate-600 shrink-0">
                눌러서 편집 이동
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeThread.status === "pending_gate" && (
                <button
                  type="button"
                  data-testid="inbox-causality-jump-todo"
                  onClick={() => onFocusEditorUnit("ib-unit-todo")}
                  className="min-h-[44px] flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 text-sm font-bold text-white cursor-pointer"
                >
                  할 일에서 승인/거절 ›
                </button>
              )}
              <button
                type="button"
                data-testid="inbox-causality-jump-history"
                onClick={() => onFocusEditorUnit("ib-unit-history")}
                className="min-h-[44px] flex-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 px-3 text-sm font-bold text-slate-800 cursor-pointer"
              >
                상담 기록 적기 ›
              </button>
              <button
                type="button"
                data-testid="inbox-causality-jump-message"
                onClick={() => onFocusEditorUnit("ib-unit-message")}
                className="min-h-[44px] flex-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 px-3 text-sm font-bold text-slate-800 cursor-pointer"
              >
                안내 메시지 ›
              </button>
            </div>
            </div>
          </div>

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

          {/* 전용 링크 즉시 복사 버튼 — 카톡 공유 옆 상시 노출 (INBOX-04) */}
          {Boolean(activeThread.shareUrl) && activeThread.status !== "revoked" && (
            <button
              type="button"
              data-testid="inbox-copy-share-link-btn"
              onClick={onCopyActiveShareLink}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-2xs transition hover:bg-slate-50 cursor-pointer"
            >
              🔗 링크 복사
            </button>
          )}

          {/* 단일 자료 발송 허브: 보낼 자료 선택 + 카톡·문자 복사 + 이메일 + 알림톡 */}
          <div
            data-testid="inbox-outbound-channel-bar"
            className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                자료 전달 방법
              </h3>
              <span
                className={`rounded-md px-2.5 py-1 text-sm font-bold ${
                  subscriptionTier === "free"
                    ? "border border-slate-200 bg-slate-100 text-slate-700"
                    : "border border-blue-200 bg-blue-50 text-blue-800"
                }`}
              >
                {subscriptionTier === "free" ? "무료 플랜 · 바로 이용" : "PRO 플랜"}
              </span>
            </div>

            {/* Step 1. 보낼 자료 선택 (IM · 딜카드 · 뉴스레터) */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700">
                1. 보낼 자료 고르기
              </p>
              <div
                role="tablist"
                aria-label="보낼 자료 선택"
                data-testid="inbox-outbound-asset-tabs"
                className="grid grid-cols-3 gap-1.5"
              >
                {(
                  [
                    { key: "im", label: "제안서(IM)" },
                    { key: "dealcard", label: "딜카드" },
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
                      className={`min-h-[44px] rounded-xl border px-2 py-1.5 text-sm font-bold transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/90 text-blue-950"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
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
            </div>

            <p className="text-sm leading-relaxed text-slate-600 break-keep">
              2. 상황에 맞는 인사말을 고른 뒤 복사하거나 이메일로 바로 보내세요.
            </p>

            {/* 상황별 3종 인사말 선택 (동심원 12px / 3px / 9px) */}
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

            {/* 1순위 무료 액션: 인사말 + 링크 복사 */}
            <button
              type="button"
              data-testid="inbox-copy-bundle-btn"
              disabled={Boolean(busyAction)}
              onClick={onPrepareCopyBundle}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-center text-sm font-extrabold text-slate-900 whitespace-normal transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              📋 인사말 + 전용 링크 복사 (카톡·문자 붙여넣기)
            </button>

            {/* 2순위 무료 액션: 이메일 바로 보내기 */}
            <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
              <div>
                <label
                  htmlFor="inbox-client-email-input"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  받을 이메일 주소 (이메일 보유 고객)
                </label>
                <input
                  id="inbox-client-email-input"
                  data-testid="inbox-client-email-input"
                  type="email"
                  value={outboundEmail}
                  onChange={(e) => onOutboundEmailChange(e.target.value)}
                  placeholder="예: buyer@company.co.kr (전화 접수 시 직접 입력)"
                  className="min-h-[48px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <label
                htmlFor="inbox-marketing-consent-checkbox"
                className="flex min-h-[44px] items-start gap-2.5 rounded-lg border border-blue-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-800 cursor-pointer"
              >
                <input
                  id="inbox-marketing-consent-checkbox"
                  data-testid="inbox-marketing-consent-checkbox"
                  type="checkbox"
                  checked={Boolean(marketingConsentConfirmed)}
                  onChange={(e) => onMarketingConsentConfirmedChange?.(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  광고성 이메일 수신 동의를 확인했습니다 (수신거부 링크 자동 포함)
                </span>
              </label>

              <button
                type="button"
                data-testid="inbox-send-email-btn"
                disabled={Boolean(busyAction)}
                onClick={onSendInboxEmail}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-center text-sm font-bold text-blue-900 whitespace-normal transition hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
              >
                ✉️ 이메일로 제안서 바로 보내기
              </button>
            </div>

            {/* 발송 근거 (이메일·알림톡 공통 1:1 안내 근거) */}
            <div>
              <label
                htmlFor="inbox-client-basis-select"
                className="mb-1 block text-sm font-bold text-slate-700"
              >
                발송 근거 (요청 답변 · 1:1 안내)
              </label>
              <select
                id="inbox-client-basis-select"
                data-testid="inbox-client-basis-select"
                value={outboundBasis}
                onChange={(e) =>
                  onOutboundBasisChange(
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

            {/* 카카오 알림톡 PRO (사후 오픈 예정) — 1줄 컴팩트 접힘 안내 */}
            <details
              data-testid="inbox-alimtalk-disclosure"
              className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2"
            >
              <summary className="flex min-h-[44px] items-center justify-between gap-2 text-sm font-bold text-amber-950 cursor-pointer list-none">
                <span>💬 카카오 알림톡 자동 발송 · PRO (오픈 예정)</span>
                <span className="text-sm font-semibold text-amber-800">자세히 ▾</span>
              </summary>
              <div className="mt-2.5 space-y-2.5 border-t border-amber-200/70 pt-2.5">
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
                      onAlimtalkTemplateChange(
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
                  onClick={onSendInboxAlimtalk}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-center text-sm font-extrabold text-amber-950 whitespace-normal transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  💬 카카오 알림톡 자동 발송 · PRO (사후 오픈 예정)
                </button>
              </div>
            </details>

            <p
              data-testid="inbox-alimtalk-early-access-hint"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700"
            >
              {ALIMTALK_EARLY_ACCESS_NOTICE}
            </p>

            {copiedBundlePreview && (
              <div
                data-testid="inbox-copied-bundle-preview"
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-slate-800 whitespace-pre-line break-words"
              >
                {copiedBundlePreview}
              </div>
            )}

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
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={onPrepareCopyBundle}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-white border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 cursor-pointer"
                  >
                    카톡 인사말·링크 1초 복사로 보내기
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={onSendInboxEmail}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    등록 이메일로 무료 발송하기
                  </button>
                  <button
                    type="button"
                    onClick={onCloseAlimtalkUpgradeSheet}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-amber-200 bg-transparent px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                  >
                    안내 닫기
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 고객 요약 카드 */}
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
                    {activeThread.clientEmail || "전화 접수 (이메일 직접 입력 가능)"}
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
                badgeText="기록 적기 ›"
                activeBadgeText="기록 탭"
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
                      관심 항목: {activeThread.focusedSections.join(" · ")}
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
                        : activeThread.id.startsWith("sub_") &&
                          (activeThread.cleanMessage || "").includes("수신 확인 대기")
                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {activeThread.newsletterSubscribed
                      ? "수신 동의"
                      : activeThread.id.startsWith("sub_") &&
                        (activeThread.cleanMessage || "").includes("수신 확인 대기")
                      ? "수신 확인 대기"
                      : "미구독"}
                  </button>
                </dd>
              </div>
            </dl>

            {/* 직접 등록 고객 수정 / 삭제 버튼 (ConfirmDeleteModal 연동) */}
            {activeThread.id.startsWith("custom_") && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  data-testid="edit-custom-client-btn"
                  disabled={Boolean(busyAction)}
                  onClick={onOpenEditCustomClient}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  정보 수정
                </button>
                <button
                  type="button"
                  data-testid="delete-custom-client-btn"
                  disabled={Boolean(busyAction)}
                  onClick={onRequestDeleteCustomClient}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                >
                  고객 삭제
                </button>
              </div>
            )}

            {/* 전화 걸기는 2열 헤더에 단일 배치하고 3열 요약 카드는 정보·수정/삭제에 집중 */}
          </div>

          {/* 하단: 보낸 링크 잠그기 (기본 scope: "thread", 선택 시 건물 전체 잠금) */}
          <div
            data-testid="inbox-link-governance-card"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-900">
                전용 링크 열람 권한
              </span>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${
                  activeThread.status === "revoked"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {activeThread.status === "revoked" ? "링크 잠김" : "열람 가능"}
              </span>
            </div>

            {activeThread.status === "revoked" ? (
              <div className="mt-3 space-y-2">
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
              <div className="mt-3">
                <button
                  type="button"
                  data-testid="lock-share-link-trigger-btn"
                  disabled={Boolean(busyAction)}
                  onClick={onOpenConfirmLock}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                >
                  보낸 링크 잠그기
                </button>
              </div>
            ) : (
              <div
                data-testid="lock-share-link-inline-confirm"
                className="mt-3 space-y-3 rounded-xl border border-rose-300 bg-rose-50/80 p-3.5"
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
                  disabled={Boolean(busyAction)}
                  onClick={onOpenCorrectionNotice}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  ⚠️ 수치 정정 안내 띄우기
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
        </>
      )}
    </div>
  );
}
