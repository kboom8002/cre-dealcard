"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  History,
  Link2,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import { MagazinePublishChecklist } from "@/components/magazine-editor/MagazinePublishChecklist";
import {
  SendListSummaryBar,
  type NewsletterTargetSegment,
} from "@/components/broker/studio/SendListSummaryBar";
import {
  ContactBulkImportModal,
  type BulkImportApiResult,
} from "@/components/workspace/inbox/ContactBulkImportModal";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";
import { isQuietHoursKst } from "@/lib/magazine/kst";
import type { DistributeOutcomeCardData } from "./distribute-result-helper";
import type { NewsletterStepKey } from "./magazine-workspace-types";

export type SendDeliveryMode = "now" | "schedule_0830" | "web_only";

export interface NewsletterSendStepPanelProps {
  headline: string;
  briefingBody: string;
  selectedDealCount: number;
  enabledNewsCount: number;
  briefingEnabled: boolean;
  dealsEnabled: boolean;
  newsEnabled: boolean;
  targetSegment: NewsletterTargetSegment;
  onChangeTargetSegment: (nextSeg: NewsletterTargetSegment) => void;
  subscriberCount: number;
  highInterestCount: number;
  sending: boolean;
  isPublished?: boolean;
  publicUrl?: string | null;
  distributeOutcome?: DistributeOutcomeCardData | null;
  quietHoursNow?: boolean;
  onJumpToStep: (step: NewsletterStepKey) => void;
  onNotifyEditorFocus: (unitId: string) => void;
  onBulkSubscribersImported: (result: BulkImportApiResult) => void;
  onKakaoShare: () => void;
  onCopyLink: () => void;
  onCopyKakaoGreeting?: () => void;
  onPublishWebOnly?: (opts?: { scheduleMorning?: boolean }) => void;
  onBackToContent: () => void;
  onSendSelected: () => void;
}

const SEND_MODE_OPTIONS: readonly {
  id: SendDeliveryMode;
  label: string;
  description: string;
}[] = [
  {
    id: "now",
    label: "지금 바로 발송",
    description: "웹에 공개하고 수신 동의 구독자에게 즉시 발송",
  },
  {
    id: "schedule_0830",
    label: "오전 08:30 예약 발송",
    description: "웹 공개 후 오전 08:30 정규 발송 기준 적용",
  },
  {
    id: "web_only",
    label: "웹 링크만 먼저 발행·복사",
    description: "자동 발송 없이 공개 링크만 생성·공유",
  },
] as const;

export function NewsletterSendStepPanel({
  headline,
  briefingBody,
  selectedDealCount,
  enabledNewsCount,
  briefingEnabled,
  dealsEnabled,
  newsEnabled,
  targetSegment,
  onChangeTargetSegment,
  subscriberCount,
  highInterestCount,
  sending,
  isPublished = false,
  publicUrl = null,
  distributeOutcome = null,
  quietHoursNow,
  onJumpToStep,
  onNotifyEditorFocus,
  onBulkSubscribersImported,
  onKakaoShare,
  onCopyLink,
  onCopyKakaoGreeting,
  onPublishWebOnly,
  onBackToContent,
  onSendSelected,
}: NewsletterSendStepPanelProps) {
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [scheduleRecommendedToast, setScheduleRecommendedToast] = useState(false);
  const [sendMode, setSendMode] = useState<SendDeliveryMode>("now");
  const isQuietHours = quietHoursNow ?? isQuietHoursKst(new Date());

  const handlePrimaryStep3Execute = () => {
    if (sendMode === "web_only") {
      if (onPublishWebOnly) {
        onPublishWebOnly();
      } else {
        onCopyLink();
      }
      return;
    }
    if (sendMode === "schedule_0830" && !isQuietHours && onPublishWebOnly) {
      onPublishWebOnly({ scheduleMorning: true });
      return;
    }
    onSendSelected();
  };

  return (
    <div
      id="newsletter-panel-send"
      role="tabpanel"
      aria-labelledby="newsletter-tab-send"
      className="space-y-5"
    >
      {isQuietHours && (
        <section
          data-testid="quiet-hours-warning"
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-2"
        >
          <p className="text-base font-extrabold">
            야간 발송 제한 시간대입니다 (21:00 ~ 08:00 KST)
          </p>
          <p className="text-sm font-medium leading-relaxed text-amber-900">
            정보통신망법에 따라 야간 별도 동의가 없는 구독자에게는 광고성 이메일·알림톡이 발송 차단됩니다.
            지금 웹 발행만 완료하거나 <strong>예약 발송(익일 오전 08:30)</strong>으로 전달하는 것을 권장합니다.
          </p>
          <button
            type="button"
            data-testid="quiet-hours-schedule-btn"
            onClick={() => {
              setScheduleRecommendedToast(true);
              setSendMode("schedule_0830");
            }}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 cursor-pointer"
          >
            오전 08:30 예약 발송 기준 확인
          </button>
          {scheduleRecommendedToast && (
            <p className="text-sm font-semibold text-amber-900">
              야간 차단 건은 오전 08:00 이후 다시 발송하거나 주간 정기 발송 일정에 맞춰 안전하게 전달됩니다.
            </p>
          )}
        </section>
      )}

      {/* ① 누구에게 보낼까요? */}
      <div aria-label="① 누구에게 보낼까요?" className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
            ① 누구에게 보낼까요?
          </span>
        </div>

        <MagazinePublishChecklist
          headline={headline}
          briefingBody={briefingBody}
          dealCount={selectedDealCount}
          newsCount={enabledNewsCount}
          briefingEnabled={briefingEnabled}
          dealsEnabled={dealsEnabled}
          newsEnabled={newsEnabled}
          onJumpToStep={onJumpToStep}
        />

        <div onFocusCapture={() => onNotifyEditorFocus("nl-unit-send")}>
          <SendListSummaryBar
            targetSegment={targetSegment}
            onChangeTargetSegment={onChangeTargetSegment}
            totalSubscriberCount={subscriberCount}
            highInterestCount={highInterestCount}
            sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
          />
        </div>

        {subscriberCount === 0 && (
          <section
            data-testid="step3-empty-subscriber-card"
            aria-label="구독 고객 바로 등록"
            className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 text-slate-900 space-y-3"
          >
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                아직 등록된 구독 고객이 없습니다
              </h3>
              <p className="text-sm font-medium text-slate-700">
                화면을 이동하지 않고 바로 여기서 엑셀 파일이나 연락처 명단을 붙여넣어 구독 고객을 한 번에 등록할 수 있습니다.
              </p>
            </div>

            <button
              type="button"
              data-testid="step3-empty-subscriber-bulk-btn"
              onClick={() => setIsBulkImportOpen(true)}
              className="w-full sm:w-auto inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-blue-800 cursor-pointer"
            >
              <span>📋 엑셀·명단으로 구독자 바로 등록하기</span>
            </button>
          </section>
        )}

        <ContactBulkImportModal
          open={isBulkImportOpen}
          onOpenChange={setIsBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          defaultNewsletterSync={true}
          onImported={onBulkSubscribersImported}
        />
      </div>

      {/* ② 어떻게 보낼까요? */}
      <section
        aria-label="② 어떻게 보낼까요?"
        className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
              ② 어떻게 보낼까요?
            </span>
          </div>
          <p className="text-sm font-medium text-slate-600 pt-1">
            원하는 전달 방식을 고른 뒤 아래에서 바로 발송하거나 링크를 복사해 카카오톡·문자로 보내세요.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="발송 방식 선택"
          data-testid="send-mode-selector"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          {SEND_MODE_OPTIONS.map((opt) => {
            const selected = sendMode === opt.id;
            const Icon =
              opt.id === "now"
                ? Send
                : opt.id === "schedule_0830"
                  ? CalendarClock
                  : Link2;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`send-mode-${opt.id === "schedule_0830" ? "schedule" : opt.id === "web_only" ? "web-only" : "now"}`}
                onClick={() => setSendMode(opt.id)}
                className={`min-h-[48px] rounded-xl border p-3.5 text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                  selected
                    ? "border-blue-600 bg-blue-50/80 text-blue-950 shadow-2xs"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                    <Icon className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                    <span>{opt.label}</span>
                  </span>
                  {selected && (
                    <Check className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                  )}
                </div>
                <span className="text-sm font-medium text-slate-600 leading-snug">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>

        {sendMode === "schedule_0830" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-sm font-semibold text-amber-950">
            오전 08:30 예약 발송 선택됨: 웹에 먼저 공개해 두고, 야간 제한 시간(21:00~08:00 KST)을 피해 오전 08:30 정규 시간에 맞춰 안전하게 전달됩니다.
          </p>
        )}
        {sendMode === "web_only" && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800">
            웹 링크만 발행 선택됨: 구독자에게 자동 이메일·알림톡을 보내지 않고, 공개 독자 링크만 생성해 바로 복사·공유할 수 있습니다.
          </p>
        )}

        {isPublished && publicUrl && (
          <div
            data-testid="step3-published-url-banner"
            aria-label="발행된 공개 독자 링크"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950 space-y-2.5"
          >
            <p className="text-sm font-extrabold">
              공개 독자 링크 (발행 완료)
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2">
              <span
                data-testid="step3-published-url-text"
                className="min-w-0 flex-1 break-all font-mono text-sm font-semibold text-slate-800 select-all"
              >
                {publicUrl}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="step3-published-open-btn"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100 whitespace-nowrap"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  <span>공개 화면 열기 ↗</span>
                </a>
                <button
                  type="button"
                  data-testid="step3-published-copy-btn"
                  onClick={onCopyLink}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>복사</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={onCopyKakaoGreeting ? "grid grid-cols-1 sm:grid-cols-3 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
          <button
            type="button"
            data-testid="kakao-share-btn"
            onClick={onKakaoShare}
            className="min-h-[48px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-extrabold text-amber-950 hover:bg-amber-100 flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            <span>카카오톡으로 공유</span>
          </button>

          {onCopyKakaoGreeting && (
            <button
              type="button"
              data-testid="copy-kakao-greeting-btn"
              onClick={onCopyKakaoGreeting}
              className="min-h-[48px] rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base font-extrabold text-emerald-950 hover:bg-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Copy className="h-5 w-5" aria-hidden="true" />
              <span>카톡 인사말 복사</span>
            </button>
          )}

          <button
            type="button"
            data-testid="copy-link-btn"
            onClick={onCopyLink}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-extrabold text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Copy className="h-5 w-5" aria-hidden="true" />
            <span>링크 복사</span>
          </button>
        </div>
      </section>

      {/* ③ 발송 실행 */}
      <section aria-label="③ 발송 실행" className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
            ③ 발송 실행
          </span>
        </div>

        {distributeOutcome && (
          <section
            data-testid="distribute-outcome-card"
            aria-label="발송 처리 결과"
            className={`rounded-2xl border p-4 space-y-2 ${
              distributeOutcome.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : distributeOutcome.tone === "error"
                  ? "border-red-300 bg-red-50 text-red-950"
                  : distributeOutcome.tone === "info"
                    ? "border-blue-300 bg-blue-50 text-blue-950"
                    : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="text-base font-extrabold">{distributeOutcome.title}</p>
            <p className="text-sm font-medium">{distributeOutcome.message}</p>
            <div className="flex flex-wrap gap-2 text-sm font-bold">
              <span>발송 {distributeOutcome.sent}건</span>
              {distributeOutcome.queued > 0 && <span>· 대기열 {distributeOutcome.queued}건</span>}
              {distributeOutcome.dryRun && <span>· 드라이런 기록 {distributeOutcome.recorded}건</span>}
              <span>· 차단 {distributeOutcome.blockedTotal}건</span>
              <span>· 실패 {distributeOutcome.failed}건</span>
            </div>
            {distributeOutcome.blockedReasons.length > 0 && (
              <ul className="text-sm list-disc list-inside space-y-0.5">
                {distributeOutcome.blockedReasons.map((r) => (
                  <li key={r.code}>
                    {r.label} ({r.count}건)
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="newsletter-step3-back-btn"
              onClick={onBackToContent}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              <span>이전: 내용 수정하기</span>
            </button>

            <button
              type="button"
              data-testid="newsletter-step3-go-history-btn"
              onClick={() => onJumpToStep("history")}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <History className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>④ 발송·수신확인 내역 보기 →</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="newsletter-step3-send-btn"
            onClick={handlePrimaryStep3Execute}
            disabled={sending}
            aria-busy={sending}
            className="hidden xl:inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-base font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
          >
            {sending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span>보내는 중…</span>
              </>
            ) : sendMode === "web_only" ? (
              <>
                <Link2 className="h-5 w-5" aria-hidden="true" />
                <span>웹 링크만 발행하기</span>
              </>
            ) : sendMode === "schedule_0830" ? (
              <>
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
                <span>오전 08:30 예약 · 웹 발행하기</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" aria-hidden="true" />
                <span>구독자에게 보내기</span>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
