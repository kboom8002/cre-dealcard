"use client";

import React, { useEffect, useRef } from "react";
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
  onEnsureCanonicalId?: () => Promise<string | null>;
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
  onEnsureCanonicalId,
}: DealCardPreviewColumnProps) {
  const attemptedPromoIdsRef = useRef<Set<string>>(new Set());
  const onEnsureCanonicalIdRef = useRef(onEnsureCanonicalId);
  onEnsureCanonicalIdRef.current = onEnsureCanonicalId;

  useEffect(() => {
    if (!liveUrl || isPreGeneration || !dealId || !dealId.startsWith("bld-")) return;
    if (attemptedPromoIdsRef.current.has(dealId)) return;
    const ensureFn = onEnsureCanonicalIdRef.current;
    if (!ensureFn) return;
    attemptedPromoIdsRef.current.add(dealId);
    void ensureFn().catch(() => {});
  }, [liveUrl, isPreGeneration, dealId]);

  const handleLivePreviewClickCapture = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const liveAnchor = target?.closest?.('[data-testid="dealcard-live-link"]') as HTMLAnchorElement | null;
    if (!liveAnchor || !dealId.startsWith("bld-") || !onEnsureCanonicalId) return;
    e.preventDefault();
    const promotedId = (await onEnsureCanonicalId().catch(() => null)) || dealId;
    const nextUrl = `/dc/${encodeURIComponent(promotedId)}`;
    if (typeof window !== "undefined") {
      window.open(nextUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="space-y-4" data-testid="dealcard-preview-slot">
      <div
        onClickCapture={(e) => {
          void handleLivePreviewClickCapture(e);
        }}
        className={
          lifecycle === "published_dirty"
            ? "sticky -top-4 z-20 -mx-4 -mt-4 bg-[#F5F5F7] px-4 pt-3 pb-2 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.18)]"
            : ""
        }
      >
        <PreviewCausalityBar
          lifecycle={lifecycle}
          onStartInput={onStartInput}
          startButtonLabel="매물 메모 입력하기"
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
          title="입력하시면 고객용 카톡 카드가 여기에 표시됩니다"
          description="메모로 생성하거나 직접 4칸을 채우면 블라인드 처리된 미리보기가 바로 나타납니다."
          checklist={[
            {
              label: "권역·동명 및 매물 용도",
              done: Boolean(effectiveCard4.region?.trim() && effectiveCard4.use?.trim()),
              onClick: onSkipMemoManual,
            },
            {
              label: "희망 가격대 및 핵심 장점",
              done: Boolean(
                effectiveCard4.priceBand?.trim() &&
                  effectiveCard4.points.some((p) => Boolean(p?.trim()))
              ),
              onClick: onSkipMemoManual,
            },
          ]}
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
    </div>
  );
}
