"use client";

import React from "react";
import Link from "next/link";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { PreviewCausalityBar } from "@/components/workspace/preview-sync/PreviewCausalityBar";
import { PreviewPregenerationCard } from "@/components/workspace/preview-sync/PreviewPregenerationCard";
import type { PreviewLifecycleState } from "@/components/workspace/preview-sync/useEditorPreviewSync";
import { sanitizeBrokerPhone } from "@/lib/deal-card/blind-guard";
import type { Card4Data } from "@/lib/deal-card/card4-schema";
import type { UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import type { BrokerProfileSummary } from "./dealcards-types";

export interface DealCardPreviewColumnProps {
  lifecycle: PreviewLifecycleState;
  liveUrl: string | null;
  isPreGeneration: boolean;
  effectiveCard4: Card4Data;
  dealId: string;
  brokerProfile: BrokerProfileSummary | null;
  activeUnitId: string | null;
  selectedMemoOnly: UnconvertedMemoItem | null;
  publishError?: { message: string; code?: string } | null;
  onStartInput: () => void;
  onResyncPublished: () => void;
  onSkipMemoManual: () => void;
  onFillSample: () => void;
  onActivateUnit: (unitId: string) => void;
}

export function DealCardPreviewColumn({
  lifecycle,
  liveUrl,
  isPreGeneration,
  effectiveCard4,
  dealId,
  brokerProfile,
  activeUnitId,
  selectedMemoOnly,
  publishError,
  onStartInput,
  onResyncPublished,
  onSkipMemoManual,
  onFillSample,
  onActivateUnit,
}: DealCardPreviewColumnProps) {
  return (
    <div className="space-y-4" data-testid="dealcard-preview-slot">
      <div className="sticky top-0 z-10">
        <PreviewCausalityBar
          lifecycle={lifecycle}
          onStartInput={onStartInput}
          startButtonLabel="왼쪽 메모칸 입력하기"
          onResyncPublished={onResyncPublished}
          resyncButtonLabel="수정한 내용 고객 화면에 반영하기"
          liveUrl={liveUrl}
          liveUrlLabel="고객 화면 열기 ↗"
          liveLinkTestId="dealcard-live-link"
        />
      </div>

      {publishError && (
        <div
          role="alert"
          data-testid="dealcard-publish-error-banner"
          className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900 space-y-2.5"
        >
          <p className="text-sm font-bold leading-relaxed">
            ⚠ {publishError.message}
          </p>
          {publishError.code === "STATUTORY_DISCLOSURE_INCOMPLETE" && (
            <Link
              href="/broker/profile"
              data-testid="dealcard-publish-error-profile-link"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-red-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-800"
            >
              중개사 프로필 완성하기 →
            </Link>
          )}
        </div>
      )}

      {isPreGeneration ? (
        <PreviewPregenerationCard
          testId="dealcard-pregeneration-card"
          title="메모나 매물 정보를 입력하면 미리보기가 만들어집니다"
          description="왼쪽 메모창에 매물을 붙여넣고 생성하거나 직접 항목을 입력하면 고객에게 보일 카톡 말풍선과 받는 화면이 즉시 만들어집니다."
          checklist={[
            {
              label: "1. 권역·동명 및 매물 용도",
              done: Boolean(effectiveCard4.region?.trim() && effectiveCard4.use?.trim()),
              onClick: onSkipMemoManual,
            },
            {
              label: "2. 희망 가격대 및 핵심 장점",
              done: Boolean(
                effectiveCard4.priceBand?.trim() &&
                  effectiveCard4.points.some((p) => Boolean(p?.trim()))
              ),
              onClick: onSkipMemoManual,
            },
          ]}
          primaryActionLabel="✍️ 메모 없이 직접 입력하기"
          onPrimaryAction={onSkipMemoManual}
          secondaryActionLabel={!selectedMemoOnly ? "💡 예시로 채워보기" : undefined}
          onSecondaryAction={!selectedMemoOnly ? onFillSample : undefined}
        />
      ) : (
        <KakaoBubblePreview
          card4={effectiveCard4}
          dealId={dealId}
          brokerName={brokerProfile?.displayName}
          brokerSpecialty={brokerProfile?.company}
          brokerPhone={sanitizeBrokerPhone(brokerProfile?.phone)}
          activeUnitId={activeUnitId}
          onActivateUnit={onActivateUnit}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
        <Link
          href="/broker/profile"
          data-testid="dealcard-broker-profile-link"
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
        >
          내 중개사 명함·프로필 수정 →
        </Link>
      </div>
    </div>
  );
}
