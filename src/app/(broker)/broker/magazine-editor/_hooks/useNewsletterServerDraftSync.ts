"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEditionAutosave } from "@/components/magazine-editor/useEditionAutosave";
import type { EditionPatchPayload } from "@/lib/magazine/edition-save";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import type { MonthlyChartPairId } from "@/domain/magazine/monthly-stats-hydration";
import type { SpecificNewsChannelId } from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";
import type { HonestSaveState } from "@/lib/ux/lexicon";
import { isUuidLike } from "../_components/magazine-workspace-types";

const NEW_DRAFT_BOOTSTRAP_DEBOUNCE_MS = 1_500;

export interface UseNewsletterServerDraftSyncOptions {
  hydrated: boolean;
  hasUserEdited: boolean;
  editionId: string | null;
  brokerId: string;
  isPublished: boolean;
  cadence: NewsletterCadence;
  effectiveSlotSlug: string;
  issueDateStr: string;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  marketTemp: MarketTemperature | null;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  monthlyCharts: MonthlyRegionalChart[];
  selectedDealIds: string[];
  dealComments: Record<string, string>;
  unitIssues: AxiosUnitIssue[];
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
  initialUpdatedAt: string | null;
  onDraftBootstrapped: (result: {
    editionId: string;
    editionLabel: string;
    updatedAt: string | null;
  }) => void;
  onServerSynced: (updatedAt: Date | string) => void;
  onSavingStatus?: (status: HonestSaveState) => void;
}

export function useNewsletterServerDraftSync(
  opts: UseNewsletterServerDraftSyncOptions,
) {
  const {
    hydrated,
    hasUserEdited,
    editionId,
    brokerId,
    isPublished,
    cadence,
    effectiveSlotSlug,
    issueDateStr,
    headline,
    summary,
    briefingTitle,
    briefingBody,
    marketTemp,
    monthlyRegion,
    monthlyPairId,
    monthlyCharts,
    selectedDealIds,
    dealComments,
    unitIssues,
    preferredRegions,
    preferredChannels,
    sections,
    targetSegment,
    initialUpdatedAt,
    onDraftBootstrapped,
    onServerSynced,
    onSavingStatus,
  } = opts;

  const buildPatchPayload = useCallback((): EditionPatchPayload => {
    const validUnitIssues = unitIssues.filter(
      (u) =>
        Boolean(u) &&
        typeof u.id === "string" &&
        u.id.trim().length > 0 &&
        typeof u.title === "string" &&
        u.title.trim().length > 0 &&
        typeof u.brief === "string" &&
        u.brief.trim().length > 0,
    );

    const marketDataEnabled =
      sections.find((s) => s.id === "market_data")?.enabled !== false;
    const validMonthlyCharts =
      cadence === "monthly" && marketDataEnabled
        ? monthlyCharts
            .filter(
              (c) =>
                c.isPlaceholder !== true &&
                Array.isArray(c.series) &&
                c.series.length > 0,
            )
            .slice(0, 2)
            .map((c) => ({
              ...c,
              highlightMetric: {
                label: c.highlightMetric?.label ?? "핵심 지표",
                value: c.highlightMetric?.value ?? "",
                deltaText: c.highlightMetric?.deltaText ?? "",
                tone: c.highlightMetric?.tone ?? ("neutral" as const),
              },
            }))
        : [];

    const content: Record<string, unknown> = {
      headline: headline.trim(),
      summary: summary.trim(),
      briefing: briefingBody.trim(),
      ai_briefing: briefingBody.trim(),
      briefing_title: briefingTitle.trim(),
      briefing_body_md: briefingBody.trim(),
      market_temp: marketTemp,
      featured_deal_ids: [...selectedDealIds],
      deal_comments: { ...dealComments },
      monthlyRegion,
      monthlyPairId,
      preferredRegions: [...preferredRegions],
      preferredChannels: [...preferredChannels],
      sections: [...sections],
      target_segment: targetSegment,
      issueDate: issueDateStr,
    };

    if (validUnitIssues.length > 0) {
      content.unitIssues = validUnitIssues;
    }
    if (validMonthlyCharts.length > 0) {
      content.monthlyCharts = validMonthlyCharts;
    }

    return {
      title: headline.trim(),
      market_temp: marketTemp,
      cover_keywords: [],
      cover_image_url: null,
      field_note: {
        question: "",
        buyerReaction: "",
        sellerReaction: "",
        marketJudgment: "",
        comment: briefingBody.trim(),
      },
      theme_title: briefingTitle.trim(),
      theme_body_md: briefingBody.trim(),
      featured_deal_ids: [...selectedDealIds],
      theme_color: "#6366f1",
      target_segments: [targetSegment],
      content,
    };
  }, [
    cadence,
    issueDateStr,
    headline,
    summary,
    briefingTitle,
    briefingBody,
    marketTemp,
    monthlyRegion,
    monthlyPairId,
    monthlyCharts,
    selectedDealIds,
    dealComments,
    unitIssues,
    preferredRegions,
    preferredChannels,
    sections,
    targetSegment,
  ]);

  const signature = useMemo(
    () =>
      JSON.stringify([
        cadence,
        issueDateStr,
        headline,
        summary,
        briefingTitle,
        briefingBody,
        marketTemp,
        monthlyRegion,
        monthlyPairId,
        monthlyCharts,
        selectedDealIds,
        dealComments,
        unitIssues,
        sections,
        targetSegment,
      ]),
    [
      cadence,
      issueDateStr,
      headline,
      summary,
      briefingTitle,
      briefingBody,
      marketTemp,
      monthlyRegion,
      monthlyPairId,
      monthlyCharts,
      selectedDealIds,
      dealComments,
      unitIssues,
      sections,
      targetSegment,
    ],
  );

  const activeUuidEditionId = isUuidLike(editionId) ? editionId : null;

  // 1) Active UUID draft edition -> wire shared useEditionAutosave (PATCH /api/magazine/editions)
  const autosave = useEditionAutosave({
    editionId: activeUuidEditionId,
    ready: hydrated,
    enabled: !isPublished && Boolean(activeUuidEditionId),
    signature,
    getPayload: buildPatchPayload,
    initialUpdatedAt,
  });

  const prevAutosaveStatusRef = useRef(autosave.status);
  useEffect(() => {
    const prev = prevAutosaveStatusRef.current;
    prevAutosaveStatusRef.current = autosave.status;
    if (prev === autosave.status) return;

    if (autosave.status === "saving") {
      onSavingStatus?.("saving");
      return;
    }
    if (autosave.status === "saved") {
      onServerSynced(autosave.lastSavedAt ?? new Date());
      return;
    }
    if (autosave.status === "conflict") {
      onSavingStatus?.("conflict");
    }
    // 401/404/network errors gracefully preserve local_only draft without blocking the broker
  }, [autosave.status, autosave.lastSavedAt, onSavingStatus, onServerSynced]);

  // 2) Brand-new unsaved draft on an authenticated broker session -> bootstrap draft row & PATCH
  const latestBuildPayloadRef = useRef(buildPatchPayload);
  const latestCallbacksRef = useRef({ onDraftBootstrapped, onServerSynced });
  const bootstrapInFlightRef = useRef(false);

  useEffect(() => {
    latestBuildPayloadRef.current = buildPatchPayload;
    latestCallbacksRef.current = { onDraftBootstrapped, onServerSynced };
  });

  const hasAuthoredMeaningfulDraft = Boolean(
    headline.trim() ||
      summary.trim() ||
      briefingBody.trim() ||
      selectedDealIds.length > 0,
  );

  useEffect(() => {
    if (
      !hydrated ||
      isPublished ||
      Boolean(editionId) ||
      !hasUserEdited ||
      !brokerId.trim() ||
      !hasAuthoredMeaningfulDraft
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || bootstrapInFlightRef.current) return;
      bootstrapInFlightRef.current = true;

      void (async () => {
        try {
          if (typeof fetch === "undefined") return;
          const draftRes = await fetch("/api/magazine/editions/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              edition_type: cadence,
              edition_label: effectiveSlotSlug,
              format: "full",
            }),
          }).catch(() => null);

          if (cancelled || !draftRes || !draftRes.ok) return;
          const draftJson = (await draftRes.json().catch(() => null)) as {
            edition?: {
              id?: string;
              edition_label?: string;
              status?: string;
              updated_at?: string | null;
            };
          } | null;

          const newId = draftJson?.edition?.id?.trim() ?? "";
          const draftStatus = draftJson?.edition?.status ?? "draft";
          if (!isUuidLike(newId) || draftStatus === "published") {
            return;
          }

          const payload = latestBuildPayloadRef.current();
          const patchRes = await fetch("/api/magazine/editions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: newId,
              ...payload,
            }),
          }).catch(() => null);

          if (cancelled || !patchRes || !patchRes.ok) return;
          const patchJson = (await patchRes.json().catch(() => null)) as {
            edition?: { updated_at?: string | null };
          } | null;
          const nextUpdatedAt =
            patchJson?.edition?.updated_at ?? draftJson?.edition?.updated_at ?? null;
          const resolvedLabel =
            draftJson?.edition?.edition_label?.trim() || effectiveSlotSlug;

          autosave.syncUpdatedAt(nextUpdatedAt);
          autosave.markClean();
          latestCallbacksRef.current.onDraftBootstrapped({
            editionId: newId,
            editionLabel: resolvedLabel,
            updatedAt: nextUpdatedAt,
          });
          latestCallbacksRef.current.onServerSynced(nextUpdatedAt ?? new Date());
        } catch {
          // Gracefully preserve local_only draft on offline / 401 / 404 unit test mocks
        } finally {
          bootstrapInFlightRef.current = false;
        }
      })();
    }, NEW_DRAFT_BOOTSTRAP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    hydrated,
    isPublished,
    editionId,
    hasUserEdited,
    brokerId,
    hasAuthoredMeaningfulDraft,
    cadence,
    effectiveSlotSlug,
    signature,
    autosave,
  ]);

  return useMemo(
    () => ({
      ...autosave,
      overwriteNow: autosave.overwrite,
    }),
    [autosave],
  );
}
