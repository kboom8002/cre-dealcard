import {
  buildOgImageUrl,
  resolvePublicBaseUrl,
} from "@/lib/magazine/share-urls";
import { getSiteOrigin, shareKakaoFeed } from "@/lib/kakao/share";
import { toKstDate, todayKst } from "@/lib/magazine/kst";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import type { MarketTemperature } from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";
import type { DistributeOutcomeCardData } from "../_components/distribute-result-helper";
import {
  appendTargetSegmentToUrl,
  isUuidLike,
  type SavedEditionSummary,
  type StatusBannerState,
} from "../_components/magazine-workspace-types";
import {
  dispatchEditionDistribution,
  resolveSendCompletionBanner,
} from "./edition-helpers";

export interface HistoryReceiptItem {
  id: string;
  recipientLabel: string;
  editionLabel: string;
  channel?: string | null;
  sentAt: string | null;
  openedAt: string | null;
  status: "opened" | "sent" | "queued" | "failed";
}

export interface HistoryDistributionItem {
  createdAt: string | null;
  date: string | null;
  issueDate: string | null;
  sentCount: number;
  failedCount: number;
  recordedCount: number;
  totalCount: number;
  dryRun: boolean;
}

export function formatReceiptTimeKo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function syncServerRegionFocusMap(
  rows: unknown[],
  targetMap: Map<string, string>,
): void {
  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const rec = rawRow as Record<string, unknown>;
    const recId = typeof rec.id === "string" ? rec.id : null;
    if (!recId) continue;
    const recContent =
      rec.content && typeof rec.content === "object"
        ? (rec.content as Record<string, unknown>)
        : null;
    const srvRf =
      recContent && typeof recContent.regionFocus === "string"
        ? recContent.regionFocus.trim()
        : recContent && typeof recContent.region_focus === "string"
          ? recContent.region_focus.trim()
          : "";
    targetMap.set(recId, srvRf);
  }
}

export function scheduleRegionFocusPatch(
  delayMs: number,
  task: () => Promise<void>,
): () => void {
  const timer = setTimeout(() => {
    void task();
  }, delayMs);
  return () => clearTimeout(timer);
}

export async function patchEditionRegionFocusRequest(
  editionId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; updatedAt: string | null }> {
  const patchRes = await fetch("/api/magazine/editions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edition_id: editionId, ...payload }),
  });
  if (!patchRes.ok) return { ok: false, updatedAt: null };
  const patchJson = (await patchRes.json().then((v) => v, () => null)) as {
    edition?: { updated_at?: string | null };
  } | null;
  return { ok: true, updatedAt: patchJson?.edition?.updated_at ?? null };
}

export async function executeSendSelectedEdition(params: {
  selectedSavedEdition: SavedEditionSummary | null;
  isPublished: boolean;
  issueDateStr: string;
  republishAsToday?: boolean;
  targetSegment: NewsletterTargetSegment;
  headline: string;
  briefingBody: string;
  marketTemp: MarketTemperature | null;
  cadence: NewsletterCadence;
  effectiveSlotSlug: string;
  brokerSlug: string;
  yearMonthLabel: string;
  scheduleMorning?: boolean;
  handleServerSave: (opts?: {
    saveAsDraft?: boolean;
    refreshPublishDate?: boolean;
  }) => Promise<{
    ok: boolean;
    publicUrl: string | null;
    savedEditionId: string | null;
    savedIssueDate: string;
    errorBanner?: StatusBannerState;
  }>;
  onOutcome: (outcome: DistributeOutcomeCardData | null) => void;
}): Promise<{
  ok: boolean;
  savedEditionId: string | null;
  banner: StatusBannerState;
}> {
  const today = todayKst();
  const prevPublishedKst = params.selectedSavedEdition?.publishedAt
    ? toKstDate(new Date(params.selectedSavedEdition.publishedAt))
    : null;
  const isPastPublished =
    params.isPublished &&
    (params.issueDateStr < today ||
      (prevPublishedKst !== null && prevPublishedKst < today));
  const shouldRefreshDate = !params.isPublished
    ? true
    : isPastPublished
      ? params.republishAsToday === true
      : false;

  const saved = await params.handleServerSave({
    saveAsDraft: false,
    refreshPublishDate: shouldRefreshDate,
  });
  const publicUrl = appendTargetSegmentToUrl(saved.publicUrl, params.targetSegment);
  if (!saved.ok || !publicUrl) {
    return {
      ok: false,
      savedEditionId: null,
      banner: saved.errorBanner ?? {
        tone: "error",
        message: "뉴스레터를 발행하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
    };
  }

  const fullBriefing = params.briefingBody.trim();
  const shortKakaoSnippet = fullBriefing
    .split("\n")
    .map((line) => line.replace(/^\s*[•·▪▸\-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  params.onOutcome(null);

  const { distAttempted, distStatus, distJson, outcome } =
    await dispatchEditionDistribution({
      savedEditionId: saved.savedEditionId,
      savedIssueDate: saved.savedIssueDate,
      cadence: params.cadence,
      headline: params.headline,
      briefingSnippet: fullBriefing,
      marketTemp: params.marketTemp,
      targetSegment: params.targetSegment,
      effectiveSlotSlug: params.effectiveSlotSlug,
      publicUrl,
      scheduleMorning: params.scheduleMorning,
      isUuidLike,
    });
  if (outcome) {
    params.onOutcome(outcome);
  }

  const sentCount = outcome?.sent ?? 0;
  const queuedCount = outcome?.queued ?? 0;
  const shouldSkipAutoKakaoShare =
    Boolean(params.scheduleMorning && distJson?.asyncQueued === true) ||
    (distAttempted && sentCount === 0 && queuedCount === 0);
  const pubBase = resolvePublicBaseUrl() ?? getSiteOrigin();
  const ogSlug = decodeURIComponent(
    params.brokerSlug.trim() ||
      publicUrl.match(/\/magazine\/([^/?#]+)/)?.[1] ||
      "magazine",
  );
  const shareResult = shouldSkipAutoKakaoShare
    ? "skipped"
    : await shareKakaoFeed({
        title: params.headline.trim(),
        description: shortKakaoSnippet || `${params.yearMonthLabel} 뉴스레터`,
        imageUrl: buildOgImageUrl({
          baseUrl: pubBase,
          slug: ogSlug,
          date: saved.savedIssueDate || params.issueDateStr,
        }),
        url: publicUrl,
        buttonTitle: "뉴스레터 열기",
      });

  return {
    ok: true,
    savedEditionId: saved.savedEditionId,
    banner: resolveSendCompletionBanner({
      distStatus,
      distJson,
      outcome,
      shareResult,
      publicUrl,
    }),
  };
}
