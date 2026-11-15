"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  Copy,
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
import type { NewsletterStepKey } from "./magazine-workspace-types";

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
  onJumpToStep: (step: NewsletterStepKey) => void;
  onNotifyEditorFocus: (unitId: string) => void;
  onBulkSubscribersImported: (result: BulkImportApiResult) => void;
  onKakaoShare: () => void;
  onCopyLink: () => void;
  onBackToContent: () => void;
  onSendSelected: () => void;
}

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
  onJumpToStep,
  onNotifyEditorFocus,
  onBulkSubscribersImported,
  onKakaoShare,
  onCopyLink,
  onBackToContent,
  onSendSelected,
}: NewsletterSendStepPanelProps) {
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  return (
    <div
      id="newsletter-panel-send"
      role="tabpanel"
      aria-labelledby="newsletter-tab-send"
      className="space-y-5"
    >
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

      <section
        aria-label="공유 및 링크 복사"
        className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
      >
        <div className="space-y-1">
          <h3 className="text-base font-extrabold text-slate-900">
            카카오톡 공유 · 링크 복사
          </h3>
          <p className="text-sm font-medium text-slate-600">
            아래 <strong>[구독자에게 보내기]</strong> 버튼을 누르면 발행과 발송을 한 번에 진행하며, 링크만 먼저 복사하거나 카카오톡으로 공유할 수도 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="kakao-share-btn"
            onClick={onKakaoShare}
            className="min-h-[48px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-extrabold text-amber-950 hover:bg-amber-100 flex items-center justify-center gap-2"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            <span>카카오톡으로 공유</span>
          </button>

          <button
            type="button"
            data-testid="copy-link-btn"
            onClick={onCopyLink}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-extrabold text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-2"
          >
            <Copy className="h-5 w-5" aria-hidden="true" />
            <span>링크 복사</span>
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToContent}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span>이전: ② 내용 수정하기</span>
        </button>

        <button
          type="button"
          data-testid="newsletter-step3-send-btn"
          onClick={onSendSelected}
          disabled={sending}
          aria-busy={sending}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-base font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
        >
          {sending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>보내는 중…</span>
            </>
          ) : (
            <>
              <Send className="h-5 w-5" aria-hidden="true" />
              <span>구독자에게 보내기</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
