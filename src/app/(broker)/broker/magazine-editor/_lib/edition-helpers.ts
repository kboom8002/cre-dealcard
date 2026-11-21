import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import type { EditorUnitTarget } from "@/components/workspace/preview-sync/useEditorPreviewSync";
import {
  clusterArticlesIntoFiveIssues,
  formatSingleLineTitle,
} from "@/domain/magazine/issue-clustering";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import type {
  NewsPoolItem,
  SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { todayKst } from "@/lib/magazine/kst";
import {
  deriveCadenceIssueMeta,
  parseCadenceAnchor,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import {
  formatDistributeOutcomeBanner,
  type DistributeOutcomeCardData,
} from "../_components/distribute-result-helper";
import {
  buildApiErrorStatusBanner,
  buildDefaultEditorSections,
  isValidIsoDate,
  type NewsletterStepKey,
  type SavedEditionSummary,
  type StatusBannerState,
} from "../_components/magazine-workspace-types";

/**
 * 미리보기-에디터 양방향 포커스 동기화 대상 단위 맵을 생성한다.
 */
export function buildNewsletterEditorSyncUnits(params: {
  deals: readonly AssignableDealItem[];
  selectedDealIds: readonly string[];
  isSectionEnabled: (sectionId: string) => boolean;
  onEnableSection: (sectionId: string) => void;
  onOpenStatTune: () => void;
  onShowBrokerProfileNotice: () => void;
}): Record<string, EditorUnitTarget<NewsletterStepKey>> {
  const {
    deals,
    selectedDealIds,
    isSectionEnabled,
    onEnableSection,
    onOpenStatTune,
    onShowBrokerProfileNotice,
  } = params;

  const ensureSection = (id: string) => {
    if (!isSectionEnabled(id)) onEnableSection(id);
  };

  const map: Record<string, EditorUnitTarget<NewsletterStepKey>> = {
    "nl-unit-ai-draft": {
      unitId: "nl-unit-ai-draft",
      label: "AI 초안 도우미",
      tab: "title",
      editorSelector: '[data-testid="magazine-quick-draft-card"]',
      focusSelector: '[data-testid="ai-draft-btn"]',
    },
    "nl-unit-issue-meta": {
      unitId: "nl-unit-issue-meta",
      label: "발행 호수 및 주기",
      tab: "title",
      editorSelector: '[data-testid="issue-metadata-form"]',
      focusSelector: "#newsletter-issue-schedule-toggle",
    },
    "nl-unit-cover": {
      unitId: "nl-unit-cover",
      label: "표지 제목",
      tab: "title",
      editorSelector: '[data-testid="issue-metadata-form"]',
      focusSelector: "#newsletter-headline-input",
    },
    "nl-unit-stats-0": {
      unitId: "nl-unit-stats-0",
      label: "주요 통계 그래픽 1번",
      tab: "content",
      onBeforeFocus: () => {
        ensureSection("market_data");
        onOpenStatTune();
      },
      editorSelector: '[data-testid="monthly-stats-authoring-card"]',
      focusSelector: "#monthly-stat-val-0",
    },
    "nl-unit-stats-1": {
      unitId: "nl-unit-stats-1",
      label: "주요 통계 그래픽 2번",
      tab: "content",
      onBeforeFocus: () => {
        ensureSection("market_data");
        onOpenStatTune();
      },
      editorSelector: '[data-testid="monthly-stats-authoring-card"]',
      focusSelector: "#monthly-stat-val-1",
    },
    "nl-unit-briefing": {
      unitId: "nl-unit-briefing",
      label: "시장 브리핑 글",
      tab: "content",
      onBeforeFocus: () => ensureSection("field_note"),
      editorSelector: '[data-testid="market-briefing-editor"]',
      focusSelector: "#newsletter-briefing-body",
    },
    "nl-unit-deals": {
      unitId: "nl-unit-deals",
      label: "추천 매물 고르기",
      tab: "content",
      onBeforeFocus: () => ensureSection("featured_deals"),
      editorSelector: '[data-testid="deal-slot-assigner"]',
      focusSelector: deals[0] ? `#deal-checkbox-${deals[0].id}` : undefined,
    },
    "nl-unit-send": {
      unitId: "nl-unit-send",
      label: "발송 대상 확인",
      tab: "send",
      editorSelector: '[data-testid="send-list-summary-bar"]',
    },
    "nl-unit-broker": {
      unitId: "nl-unit-broker",
      label: "담당 중개사 정보",
      editorSelector: '[data-testid="newsletter-status-banner"]',
      onCustomActivate: onShowBrokerProfileNotice,
    },
  };

  for (let idx = 0; idx < 5; idx++) {
    map[`nl-unit-issue-${idx}`] = {
      unitId: `nl-unit-issue-${idx}`,
      label: `핵심 이슈 ${idx + 1}번 카드`,
      tab: "content",
      onBeforeFocus: () => ensureSection("news_curation"),
      editorSelector: `[data-testid="axios-issue-card-editor-${idx}"]`,
      focusSelector: `#axios-issue-title-${idx}`,
    };
  }

  for (const deal of deals) {
    map[`nl-unit-deal-${deal.id}`] = {
      unitId: `nl-unit-deal-${deal.id}`,
      label: `${deal.title} 추천글`,
      tab: "content",
      onBeforeFocus: () => ensureSection("featured_deals"),
      editorSelector: `[data-testid="deal-slot-item-${deal.id}"]`,
      focusSelector: selectedDealIds.includes(deal.id)
        ? `#deal-comment-input-${deal.id}`
        : `#deal-checkbox-${deal.id}`,
    };
  }

  return map;
}

export interface ClonedEditionState {
  anchor: { cadence: NewsletterCadence; year: number; month: number; dateStr: string };
  distinctSlug: string;
  clonedHeadline: string;
  clonedRegion: MonthlyRegionKey;
  clonedPair: MonthlyChartPairId;
  clonedCharts: MonthlyRegionalChart[];
  clonedIssueDateStr: string;
  clonedSelectedDealIds: string[];
  clonedDealComments: Record<string, string>;
  clonedUnitIssues: AxiosUnitIssue[];
  clonedSections: { id: string; enabled: boolean }[];
  clonedSegment: NewsletterTargetSegment;
}

/**
 * 기존 회차를 새 초안으로 복제할 때 사용할 초기 상태 묶음을 계산한다.
 */
export function buildClonedEditionState(
  ed: SavedEditionSummary,
  computeDistinctSlotSlug: (cadence: NewsletterCadence, baseSlug: string) => string | null,
): ClonedEditionState {
  const anchor = parseCadenceAnchor(
    ed.slug,
    ed.cadence === "special" ? "weekly" : ed.cadence,
  );
  const baseCloneSlug =
    ed.slug || deriveCadenceIssueMeta(anchor.cadence, anchor).slug;
  const distinctSlug =
    computeDistinctSlotSlug(anchor.cadence, baseCloneSlug) || `${baseCloneSlug}-copy`;
  const clonedHeadline = formatSingleLineTitle(
    `${ed.title || `${ed.slug} 뉴스레터`} 복사본`,
    80,
  );
  const clonedRegion: MonthlyRegionKey = ed.monthlyRegion ?? "gbd";
  const clonedPair: MonthlyChartPairId = ed.monthlyPairId ?? "molit_bok";
  const clonedCharts =
    ed.monthlyCharts && ed.monthlyCharts.length > 0
      ? [...ed.monthlyCharts]
      : buildDefaultMonthlyGraphicPair(clonedRegion, clonedPair);

  return {
    anchor,
    distinctSlug,
    clonedHeadline,
    clonedRegion,
    clonedPair,
    clonedCharts,
    clonedIssueDateStr: isValidIsoDate(ed.issueDate) ? ed.issueDate : anchor.dateStr,
    clonedSelectedDealIds: Array.isArray(ed.selectedDealIds) ? [...ed.selectedDealIds] : [],
    clonedDealComments: ed.dealComments ? { ...ed.dealComments } : {},
    clonedUnitIssues: Array.isArray(ed.unitIssues) ? [...ed.unitIssues] : [],
    clonedSections: ed.sections
      ? [...ed.sections]
      : buildDefaultEditorSections(anchor.cadence),
    clonedSegment: ed.targetSegment ?? "all",
  };
}

/**
 * 서버에서 뉴스레터 회차를 삭제한다.
 */
export async function executeRemoteEditionDelete(
  editionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const delRes = await fetch(
    `/api/magazine/editions?id=${encodeURIComponent(editionId)}`,
    { method: "DELETE" },
  ).then((r) => r, () => null);
  if (!delRes) {
    return { ok: false, message: "삭제에 실패했습니다. 네트워크 연결을 확인해 주세요." };
  }
  if (!delRes.ok && delRes.status !== 404) {
    return { ok: false, message: "뉴스레터 삭제에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}

/**
 * 삭제 되돌리기 시 서버에 호수를 복원한다.
 */
export async function executeRemoteEditionRestore(
  snapshot: SavedEditionSummary,
): Promise<string> {
  let restoredId = snapshot.id;
  try {
    const restoreCadence =
      snapshot.cadence === "special"
        ? "weekly"
        : (snapshot.cadence ?? "monthly");
    const restoreRes = await fetch("/api/magazine/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editionType: snapshot.cadence ?? "monthly",
        issueAnchorDate: snapshot.issueDate || todayKst(),
        issueDate: snapshot.issueDate,
        slug: snapshot.slug,
        saveAsDraft: snapshot.status !== "published",
        status: snapshot.status === "published" ? "published" : "draft",
        headline: snapshot.title || `${snapshot.slug} 뉴스레터`,
        summary: snapshot.summary ?? "",
        briefingTitle: snapshot.briefingTitle ?? "",
        briefingBody: snapshot.briefingBody ?? "",
        marketTemp: snapshot.marketTemp ?? null,
        monthlyRegion: snapshot.monthlyRegion,
        monthlyPairId: snapshot.monthlyPairId,
        monthlyCharts: snapshot.monthlyCharts,
        featuredDealIds: snapshot.selectedDealIds ?? [],
        dealComments: snapshot.dealComments ?? {},
        unitIssues: snapshot.unitIssues ?? [],
        sections:
          snapshot.sections ?? buildDefaultEditorSections(restoreCadence),
        targetSegment: snapshot.targetSegment ?? "all",
      }),
    }).then(
      (r) => r,
      () => null,
    );
    if (restoreRes && restoreRes.ok) {
      const rJson = (await restoreRes.json().then(
        (v) => v,
        () => null,
      )) as Record<string, unknown> | null;
      if (typeof rJson?.id === "string" && rJson.id) {
        restoredId = rJson.id;
      }
    }
  } catch {
    // 네트워크 복원 실패 시에도 화면 목록은 즉시 되살린다
  }
  return restoredId;
}

/**
 * 이메일 구독자 일괄 발송 API 호출 및 결과 배너 파생을 수행한다.
 */
export async function dispatchEditionDistribution(params: {
  savedEditionId: string | null;
  savedIssueDate: string;
  cadence: NewsletterCadence;
  headline: string;
  briefingSnippet: string;
  marketTemp: MarketTemperature | null;
  targetSegment: NewsletterTargetSegment;
  effectiveSlotSlug: string;
  publicUrl: string;
  isUuidLike: (val: string | null | undefined) => boolean;
}): Promise<{
  distAttempted: boolean;
  distStatus: number;
  distJson: Record<string, unknown> | null;
  outcome: DistributeOutcomeCardData | null;
}> {
  const {
    savedEditionId,
    savedIssueDate,
    cadence,
    headline,
    briefingSnippet,
    marketTemp,
    targetSegment,
    effectiveSlotSlug,
    publicUrl,
    isUuidLike,
  } = params;

  let distAttempted = false;
  let distStatus = 0;
  let distJson: Record<string, unknown> | null = null;
  if (savedEditionId && isUuidLike(savedEditionId)) {
    distAttempted = true;
    try {
      const distRes = await fetch("/api/broker/magazine/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId: savedEditionId,
          editionType: cadence,
          title: headline.trim(),
          headline: briefingSnippet || headline.trim(),
          market_temp: marketTemp ?? undefined,
          date: savedIssueDate,
          target: targetSegment,
        }),
      });
      distStatus = distRes.status;
      distJson = (await distRes.json().then(
        (v) => v,
        () => null,
      )) as Record<string, unknown> | null;
    } catch {
      distStatus = 500;
      distJson = { error: "발송 서버와의 연결에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }
  }

  const outcome = distAttempted
    ? formatDistributeOutcomeBanner(distJson, distStatus || 500, publicUrl)
    : null;

  const sentCount = outcome?.sent ?? 0;
  const queuedCount = outcome?.queued ?? 0;
  const liveDispatchSucceeded =
    distAttempted &&
    distStatus >= 200 &&
    distStatus < 300 &&
    distJson?.success !== false &&
    distJson?.blocked !== "SEND_DISABLED" &&
    !outcome?.dryRun &&
    (sentCount > 0 || queuedCount > 0);

  if (liveDispatchSucceeded) {
    try {
      await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_magazine",
          slug: effectiveSlotSlug,
          publicUrl,
          targetSegment,
          headline: headline.trim(),
        }),
      });
    } catch {
      // 활동 로그 실패 무시
    }
  }

  return { distAttempted, distStatus, distJson, outcome };
}

/**
 * 발송 API + 카카오톡/링크 복사 결과를 종합해 최종 상태 배너를 산출한다.
 */
export function resolveSendCompletionBanner(params: {
  distStatus: number;
  distJson: Record<string, unknown> | null;
  outcome: DistributeOutcomeCardData | null;
  shareResult: "kakao" | "copied" | "failed" | "skipped";
  publicUrl: string;
}): StatusBannerState {
  const { distStatus, distJson, outcome, shareResult, publicUrl } = params;
  const sentCount = outcome?.sent ?? 0;
  const queuedCount = outcome?.queued ?? 0;

  if (distStatus === 422) {
    return buildApiErrorStatusBanner(
      distStatus,
      distJson,
      outcome?.message || "발송 요건을 충족하지 못했습니다.",
    );
  }
  if (outcome) {
    return {
      tone: outcome.tone,
      message: outcome.message,
      ...(sentCount === 0 && queuedCount === 0 ? { fallbackUrl: publicUrl } : {}),
    };
  }
  if (shareResult === "kakao") {
    return {
      tone: "success",
      message:
        "뉴스레터 웹 발행 완료 · 카카오톡 공유 창에서 구독자를 선택해 전달해 주세요.",
    };
  }
  if (shareResult === "copied") {
    return {
      tone: "success",
      message:
        "뉴스레터 웹 발행 완료 · 공유 링크가 복사되었습니다. 카톡·문자에 붙여넣어 전달해 주세요.",
    };
  }
  return {
    tone: "warning",
    message:
      "뉴스레터 웹 발행은 완료되었으나 자동 복사에 실패했습니다. 아래 공개 링크를 직접 복사해 전달해 주세요.",
    fallbackUrl: publicUrl,
  };
}

/**
 * AI 핵심 이슈 5선 재구성 API를 호출하고 실패 시 결정론적 클러스터링으로 폴백한다.
 */
export async function requestAiNewsClusterIssues(params: {
  cadence: NewsletterCadence;
  preferredRegions: readonly string[];
  preferredChannels: readonly SpecificNewsChannelId[];
  dealTitles: string[];
  newsPool: readonly NewsPoolItem[];
}): Promise<{ unitIssues: AxiosUnitIssue[]; isAi: boolean }> {
  try {
    const res = await fetch("/api/broker/studio/ai-news-cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cadence: params.cadence,
        preferredRegions: [...params.preferredRegions],
        preferredChannels: [...params.preferredChannels],
        dealTitles: params.dealTitles,
        articles: params.newsPool.slice(0, 30),
      }),
    });
    const json = (await res.json().then(
      (v) => v,
      () => null,
    )) as { ok: true; unitIssues: AxiosUnitIssue[] } | null;
    if (res.ok && json?.ok && Array.isArray(json.unitIssues) && json.unitIssues.length > 0) {
      return { unitIssues: json.unitIssues, isAi: true };
    }
  } catch {
    // 결정론적 폴백 진행
  }

  const fallback = clusterArticlesIntoFiveIssues(params.newsPool, {
    cadence: params.cadence,
    preferredRegions: params.preferredRegions,
    preferredChannels: params.preferredChannels,
    dealKeywords: params.dealTitles,
  });
  return { unitIssues: fallback, isAi: false };
}

/**
 * 월간 통계 차트 2종 중 특정 카드의 수치/해설 필드를 중개인 직접 편집 상태로 갱신한다.
 */
export function applyMonthlyChartFieldPatch(
  prev: readonly MonthlyRegionalChart[],
  chartIndex: number,
  patch: { highlightValue?: string; buyerImplication?: string },
  monthlyRegion: MonthlyRegionKey,
  monthlyPairId: MonthlyChartPairId,
): MonthlyRegionalChart[] {
  const base =
    prev.length >= 2
      ? prev
      : buildDefaultMonthlyGraphicPair(monthlyRegion, monthlyPairId);
  return base.map((item, idx) => {
    if (idx !== chartIndex) return item;
    return {
      ...item,
      sourceMode: "broker_custom" as const,
      isPlaceholder: false,
      highlightMetric:
        patch.highlightValue !== undefined
          ? {
              label: item.highlightMetric?.label ?? "핵심 지표",
              value: patch.highlightValue,
              deltaText: item.highlightMetric?.deltaText ?? "",
              tone: item.highlightMetric?.tone ?? "neutral",
            }
          : item.highlightMetric,
      buyerImplication:
        patch.buyerImplication !== undefined
          ? patch.buyerImplication
          : item.buyerImplication,
    };
  });
}

