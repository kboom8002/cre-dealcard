"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Save, Send } from "lucide-react";
import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import { MagazinePublishChecklist } from "@/components/magazine-editor/MagazinePublishChecklist";
import {
  PreviewPregenerationCard,
  type PreviewLifecycleState,
} from "@/components/workspace/preview-sync";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";
import type { HonestSaveState } from "@/lib/ux/lexicon";
import type {
  NewsletterStepKey,
  StatusBannerState,
} from "./magazine-workspace-types";
import { NewsletterPreviewCard } from "./NewsletterPreviewCard";

export interface NewsletterPreviewBodyProps {
  previewLifecycle: PreviewLifecycleState;
  activeUnitId: string | null;
  onFocusEditorUnit: (unitId: string) => void;
  yearMonthLabel: string;
  marketTemp: MarketTemperature | null;
  headline: string;
  brokerName: string;
  brokerOffice: string;
  brokerPhone: string;
  cadence: NewsletterCadence;
  monthlyRegion: MonthlyRegionKey;
  monthlyCharts: MonthlyRegionalChart[];
  formattedPreviewBriefing: string;
  unitIssues: AxiosUnitIssue[];
  selectedDeals: AssignableDealItem[];
  dealComments: Record<string, string>;
  isSectionEnabled: (id: string) => boolean;
  activeStep: NewsletterStepKey;
  briefingBody: string;
  selectedDealCount: number;
  onJumpToStep: (step: NewsletterStepKey) => void;
}

/**
 * 3열 실시간 뉴스레터 미리보기 카드 · 발행 점검 체크리스트 · 사전 예시 안내 카드 묶음.
 */
export function NewsletterPreviewBody({
  previewLifecycle,
  activeUnitId,
  onFocusEditorUnit,
  yearMonthLabel,
  marketTemp,
  headline,
  brokerName,
  brokerOffice,
  brokerPhone,
  cadence,
  monthlyRegion,
  monthlyCharts,
  formattedPreviewBriefing,
  unitIssues,
  selectedDeals,
  dealComments,
  isSectionEnabled,
  activeStep,
  briefingBody,
  selectedDealCount,
  onJumpToStep,
}: NewsletterPreviewBodyProps) {
  return (
    <>
      <NewsletterPreviewCard
        previewLifecycle={previewLifecycle}
        activeUnitId={activeUnitId}
        onFocusEditorUnit={onFocusEditorUnit}
        yearMonthLabel={yearMonthLabel}
        marketTemp={marketTemp}
        headline={headline}
        brokerName={brokerName}
        brokerOffice={brokerOffice}
        brokerPhone={brokerPhone}
        cadence={cadence}
        monthlyRegion={monthlyRegion}
        monthlyCharts={monthlyCharts}
        formattedPreviewBriefing={formattedPreviewBriefing}
        unitIssues={unitIssues}
        selectedDeals={selectedDeals}
        dealComments={dealComments}
        isSectionEnabled={isSectionEnabled}
      />

      {activeStep !== "send" && activeStep !== "history" && previewLifecycle !== "pre_generation" && (
        <MagazinePublishChecklist
          headline={headline}
          briefingBody={briefingBody}
          dealCount={selectedDealCount}
          newsCount={isSectionEnabled("news_curation") ? unitIssues.length : 0}
          briefingEnabled={isSectionEnabled("field_note")}
          dealsEnabled={isSectionEnabled("featured_deals")}
          newsEnabled={isSectionEnabled("news_curation")}
          onJumpToStep={onJumpToStep}
        />
      )}

      {previewLifecycle === "pre_generation" && (
        <PreviewPregenerationCard
          testId="newsletter-preview-pregeneration-card"
          title="첫 제목을 입력하면 내 뉴스레터가 완성됩니다"
          description="편집 화면에서 표지 제목을 적거나 [AI로 초안 쓰기]를 눌러 보세요. 아래 화면은 이해를 돕기 위한 기본 예시 구성입니다."
          primaryActionLabel="표지 제목 입력하기"
          onPrimaryAction={() => onFocusEditorUnit("nl-unit-cover")}
          secondaryActionLabel="✨ AI로 초안 채우기"
          onSecondaryAction={() => onFocusEditorUnit("nl-unit-ai-draft")}
        />
      )}
    </>
  );
}

/**
 * 에디터 상단 상태/오류 안내 배너.
 */
export function MagazineStatusBanner({
  statusBanner,
  suppressUrlInput = false,
}: {
  statusBanner: StatusBannerState | null;
  suppressUrlInput?: boolean;
}) {
  if (!statusBanner) return null;
  return (
    <div
      role={
        statusBanner.tone === "error" || statusBanner.tone === "warning"
          ? "alert"
          : "status"
      }
      data-testid="newsletter-status-banner"
      className={`rounded-xl border px-4 py-3 text-sm font-bold space-y-2 ${
        statusBanner.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : statusBanner.tone === "warning"
            ? "border-amber-300 bg-amber-50 text-amber-950"
            : statusBanner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {statusBanner.tone === "success" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-[200px]">{statusBanner.message}</span>
        {statusBanner.profileCtaHref && (
          <Link
            href={statusBanner.profileCtaHref}
            data-testid="statutory-profile-link"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-bold text-rose-800 hover:bg-rose-50 shrink-0"
          >
            <span>사무소 프로필 설정</span>
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </div>
      {statusBanner.fallbackUrl && !suppressUrlInput && (
        <input
          type="text"
          readOnly
          value={statusBanner.fallbackUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="직접 복사용 뉴스레터 공개 링크"
          data-testid="newsletter-fallback-url-input"
          className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900"
        />
      )}
    </div>
  );
}

export interface NewsletterPrimaryActionButtonProps {
  isPublished: boolean;
  previewLifecycle: PreviewLifecycleState;
  activeStep: NewsletterStepKey;
  sending: boolean;
  saveState: HonestSaveState;
  onDraftSaveClick: () => void;
  onSelectSendStep: () => void;
  onSendSelected: () => void;
}

/**
 * 상단/하단 주 액션 CTA 버튼 (임시저장 반영 · 발행 완료 · 구독자에게 보내기).
 */
export function NewsletterPrimaryActionButton({
  isPublished,
  previewLifecycle,
  activeStep,
  sending,
  saveState,
  onDraftSaveClick,
  onSelectSendStep,
  onSendSelected,
}: NewsletterPrimaryActionButtonProps) {
  return (
    <button
      type="button"
      data-testid="newsletter-primary-send-btn"
      onClick={
        isPublished && previewLifecycle === "published_dirty"
          ? onDraftSaveClick
          : isPublished && previewLifecycle === "published_clean" && activeStep !== "send"
            ? onSelectSendStep
            : onSendSelected
      }
      disabled={sending || saveState === "saving"}
      aria-busy={sending || saveState === "saving"}
      className={`w-full inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base font-extrabold text-white shadow-sm transition disabled:opacity-60 cursor-pointer ${
        isPublished && previewLifecycle === "published_dirty"
          ? "bg-amber-600 hover:bg-amber-700"
          : isPublished && previewLifecycle === "published_clean"
            ? "bg-emerald-700 hover:bg-emerald-800"
            : "bg-blue-700 hover:bg-blue-800"
      }`}
    >
      {sending ||
      (isPublished && previewLifecycle === "published_dirty" && saveState === "saving") ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>{sending ? "보내는 중…" : "반영 중…"}</span>
        </>
      ) : isPublished && previewLifecycle === "published_dirty" ? (
        <>
          <Save className="h-5 w-5" aria-hidden="true" />
          <span>변경사항 발행본에 반영하기</span>
        </>
      ) : isPublished && previewLifecycle === "published_clean" ? (
        <>
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span>
            {activeStep === "send"
              ? "발행 완료 · 다시 보내기"
              : "발행 완료 · 공유 / 다시 보내기"}
          </span>
        </>
      ) : (
        <>
          <Send className="h-5 w-5" aria-hidden="true" />
          <span>구독자에게 보내기</span>
        </>
      )}
    </button>
  );
}
