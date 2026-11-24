"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  useEditorPreviewSync, PreviewCausalityBar,
  type PreviewLifecycleState, type EditorUnitTarget,
} from "@/components/workspace/preview-sync";
import { EditorHeaderActionButton } from "@/components/workspace/list/WorkspaceList";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import {
  getLastActiveBrokerUserId, purgeWorkspaceClientStorage, readScopedWorkspaceJson,
  removeScopedWorkspaceKey, resolveBrowserBrokerUserId, syncActiveBrokerSessionStorage, writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import type { AutoIssueMetadata } from "@/components/magazine-editor/IssueMetadataForm";
import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import { getNextPublishHint } from "@/components/magazine-editor/MagazinePublishChecklist";
import type { MagazineDraftSnapshot } from "@/components/broker/studio/MagazineQuickDraftCard";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import type { BulkImportApiResult } from "@/components/workspace/inbox/ContactBulkImportModal";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  mapPreferredRegionsToMonthlyKey,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import { normalizeReadableBriefingText } from "@/lib/magazine/simple-format";
import {
  clusterArticlesIntoFiveIssues,
  formatSingleLineTitle,
  normalizeMarketBriefingPlain,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import {
  DEFAULT_PREFERRED_REGIONS,
  DEFAULT_PREFERRED_CHANNELS,
  normalizeBrokerPreferences,
} from "@/domain/magazine/broker-preferences";
import {
  CURATED_CHANNEL_POOL,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { copyText, copyTextFromPromise, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { EditorOutreachTab } from "@/components/magazine-editor/EditorOutreachTab";
import { EditorAnalyticsTab } from "@/components/magazine-editor/EditorAnalyticsTab";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";
import { buildNewsletterKakaoGreeting } from "@/lib/magazine/kakao-greeting";
import { shareKakaoFeed, getSiteOrigin } from "@/lib/kakao/share";
import { kstParts, toKstDate, todayKst } from "@/lib/magazine/kst";
import { buildOgImageUrl, resolvePublicBaseUrl } from "@/lib/magazine/share-urls";
import {
  NEWSLETTER_CADENCE_META,
  deriveCadenceIssueMeta,
  normalizeNewsletterCadence,
  parseCadenceAnchor,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import type { HonestSaveState } from "@/lib/ux/lexicon";
import {
  LEGACY_DRAFT_STORAGE_KEY, SLOT_DRAFT_PREFIX, appendTargetSegmentToUrl, buildApiErrorStatusBanner,
  buildDefaultEditorSections, buildSafePublicUrl, clearLastActiveSlotKey, isBrokerMismatch,
  isUuidLike, isValidIsoDate, makeSlotStorageKey, mapBuildingRowsToAssignableDeals,
  mapServerEditionRowToSummary, normalizeEditorSections, normalizeMonthlyPairId,
  normalizeMonthlyRegion, normalizeSavedMonthlyCharts, normalizeTargetSegment, readLastActiveSlotKey,
  resolveMagazineQueryAction, resolveNewsletterScopeUid, writeLastActiveSlotKey,
  type LocalNewsletterDraft, type NewsletterStepKey, type SavedEditionSummary, type StatusBannerState,
} from "./_components/magazine-workspace-types";
import { EditionDeleteModal } from "./_components/EditionDeleteModal";
import {
  EditionListSidebar,
  editionDisplayTitle,
} from "./_components/EditionListSidebar";
import { NewsletterTitleStepPanel } from "./_components/NewsletterTitleStepPanel";
import { NewsletterContentStepPanel } from "./_components/NewsletterContentStepPanel";
import { NewsletterSendStepPanel } from "./_components/NewsletterSendStepPanel";
import {
  formatDistributeOutcomeBanner,
  type DistributeOutcomeCardData,
} from "./_components/distribute-result-helper";
import {
  MagazineStatusBanner,
  NewsletterPreviewBody,
  NewsletterPrimaryActionButton,
} from "./_components/NewsletterPreviewSlot";
import { useNewsletterServerDraftSync } from "./_hooks/useNewsletterServerDraftSync";
import {
  buildIssueRequestBody,
  buildLocalDraftStorageRecord,
  buildPublishPatchBody,
  buildSelectedDealSnapshots,
  parseServerSaveSuccess,
  resolveFallbackIssueIsoDate,
  resolvePopulatedMonthlyCharts,
  resolvePublishPatchSuccessUrl,
  saveDraftRecordToSlots,
  upsertSavedEditionSummary,
  upsertBootstrappedDraftSummary,
  applyServerDraftSyncedUpdate,
} from "./_lib/edition-payload";
import {
  applyMonthlyChartFieldPatch,
  buildClonedEditionState,
  buildNewsletterEditorSyncUnits,
  dispatchEditionDistribution,
  executeRemoteEditionDelete,
  executeRemoteEditionRestore,
  requestAiNewsClusterIssues,
  resolveSendCompletionBanner,
} from "./_lib/edition-helpers";
import {
  findScopedInitialDraftRecord,
  markSlotSyncedOnServer,
  mergeIncomingNewsPool,
  parseHydratedDraftData,
  purgeMismatchedLegacyDraftKeys,
  resolveAppliedEditionFields,
  writeExplicitNewSlotMarker,
} from "./_lib/edition-bootstrap";

export {
  getPrimaryTabsForCadence,
  type EditorPrimaryTabKey,
  type EditorPrimaryTabDef,
  type NewsletterStepKey,
} from "./_components/magazine-workspace-types";

const STEP_TABS: readonly {
  key: NewsletterStepKey;
  label: string;
  shortDesc: string;
}[] = [
  { key: "title", label: "1. 제목", shortDesc: "연·월 선택 및 표지 제목" },
  { key: "content", label: "2. 내용", shortDesc: "시장 브리핑과 추천 매물" },
  { key: "send", label: "3. 보내기", shortDesc: "받을 고객 확인 및 발송" },
  { key: "history", label: "4. 발송·수신확인", shortDesc: "발송 내역 · 열람(수신) 확인 · 구독자" },
] as const;

interface HistoryReceiptItem {
  id: string;
  recipientLabel: string;
  editionLabel: string;
  channel?: string | null;
  sentAt: string | null;
  openedAt: string | null;
  status: "opened" | "sent" | "failed";
}

interface HistoryDistributionItem {
  createdAt: string | null;
  date: string | null;
  issueDate: string | null;
  sentCount: number;
  failedCount: number;
  recordedCount: number;
  totalCount: number;
  dryRun: boolean;
}

function formatReceiptTimeKo(iso: string | null | undefined): string {
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

function MagazineEditorWorkspace() {
  const router = useRouter();
  const pathname = usePathname() || "/broker/magazine-editor";
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();
  const isNewParam =
    searchParams?.get?.("new") === "1" || searchParams?.get?.("new") === "true";

  // ── 1. 단계 및 기본 메타 상태 ──
  const [activeStep, setActiveStep] = useState<NewsletterStepKey>(
    () => resolveMagazineQueryAction(searchParams).step ?? "title",
  );
  const [cadence, setCadence] = useState<NewsletterCadence>("monthly");
  const [issueDateStr, setIssueDateStr] = useState<string>(() => todayKst());
  const [editionCadenceFilter, setEditionCadenceFilter] = useState<
    NewsletterCadence | "special" | "all"
  >("all");
  const [editionStatusFilter, setEditionStatusFilter] = useState<
    "all" | "draft" | "published"
  >("all");
  const [editionSearchQuery, setEditionSearchQuery] = useState<string>("");
  const [listViewMode, setListViewMode] = useListViewMode();
  const [issueYear, setIssueYear] = useState<number>(() => kstParts().year);
  const [issueMonth, setIssueMonth] = useState<number>(() => kstParts().month);
  const [draftSlotSlugOverride, setDraftSlotSlugOverride] = useState<string | null>(null);

  const autoMeta = useMemo(
    () =>
      deriveCadenceIssueMeta(cadence, {
        year: issueYear,
        month: issueMonth,
        dateStr: issueDateStr,
      }),
    [cadence, issueYear, issueMonth, issueDateStr],
  );
  const effectiveSlotSlug = draftSlotSlugOverride || autoMeta.slug;

  // ── 2. 뉴스레터 통합 초안 상태 ──
  const [editionId, setEditionId] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string>("");
  const [brokerSlug, setBrokerSlug] = useState<string>("");
  const [brokerName, setBrokerName] = useState<string>("");
  const [brokerOffice, setBrokerOffice] = useState<string>("");
  const [brokerPhone, setBrokerPhone] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [briefingTitle, setBriefingTitle] = useState<string>("");
  const [briefingBody, setBriefingBody] = useState<string>("");
  const [regionFocus, setRegionFocus] = useState<string>("");
  const [monthlyRegion, setMonthlyRegion] = useState<MonthlyRegionKey>("gbd");
  const [monthlyPairId, setMonthlyPairId] = useState<MonthlyChartPairId>("molit_bok");
  const [monthlyCharts, setMonthlyCharts] = useState<MonthlyRegionalChart[]>(() =>
    buildDefaultMonthlyGraphicPair("gbd", "molit_bok"),
  );
  const [monthlyLiveDbAvailable, setMonthlyLiveDbAvailable] = useState<boolean>(false);
  const [statTuneOpen, setStatTuneOpen] = useState<boolean>(false);
  const [marketTemp, setMarketTemp] = useState<MarketTemperature | null>(null);

  // ── 3. 매물·코너·발송 대상·중개사 개인 설정 상태 ──
  const [preferredRegions, setPreferredRegions] = useState<string[]>(() => [
    ...DEFAULT_PREFERRED_REGIONS,
  ]);
  const [preferredChannels, setPreferredChannels] = useState<SpecificNewsChannelId[]>(() => [
    ...DEFAULT_PREFERRED_CHANNELS,
  ]);
  const [newsPool, setNewsPool] = useState<NewsPoolItem[]>(() => [...CURATED_CHANNEL_POOL]);
  const [unitIssues, setUnitIssues] = useState<AxiosUnitIssue[]>(() =>
    clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "monthly",
      preferredRegions: DEFAULT_PREFERRED_REGIONS,
      preferredChannels: DEFAULT_PREFERRED_CHANNELS,
    }),
  );
  const [previousIssuesSnapshot, setPreviousIssuesSnapshot] = useState<AxiosUnitIssue[] | null>(
    null,
  );
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [isAiClustering, setIsAiClustering] = useState<boolean>(false);
  const [deals, setDeals] = useState<AssignableDealItem[]>([]);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [dealComments, setDealComments] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<{ id: string; enabled: boolean }[]>(() =>
    buildDefaultEditorSections("monthly"),
  );
  const [targetSegment, setTargetSegment] = useState<NewsletterTargetSegment>("all");
  const [editions, setEditions] = useState<SavedEditionSummary[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [highInterestCount, setHighInterestCount] = useState<number>(0);

  // ── 4. 정직한 저장·발행·발송·삭제확인 상태 ──
  const [saveState, setSaveState] = useState<HonestSaveState>("idle");
  const [localStorageMode, setLocalStorageMode] = useState<"none" | "local_only">("none");
  const [lastSavedAt, setLastSavedAt] = useState<Date | string | null>(null);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [isPrefsOpen, setIsPrefsOpen] = useState<boolean>(false);
  const [insightsTab, setInsightsTab] = useState<"subscribers" | "analytics">("subscribers");
  const [historyReceipts, setHistoryReceipts] = useState<HistoryReceiptItem[]>([]);
  const [historyDistributions, setHistoryDistributions] = useState<HistoryDistributionItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendDisabled, setSendDisabled] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<StatusBannerState | null>(null);
  const [distributeOutcome, setDistributeOutcome] = useState<DistributeOutcomeCardData | null>(null);
  const [pendingDeleteEdition, setPendingDeleteEdition] = useState<SavedEditionSummary | null>(
    null,
  );
  const [isWorkspaceHydrated, setIsWorkspaceHydrated] = useState<boolean>(false);
  const [hasUserEditedDraft, setHasUserEditedDraft] = useState<boolean>(false);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const manualSyncBusyRef = useRef<boolean>(false);
  const lastAutoSyncPullAtRef = useRef<number>(0);

  const hydratedRef = useRef(false);
  const restoredLocalIssuesRef = useRef(false);
  const savingLockRef = useRef(false);
  const lastSyncedEditionQueryRef = useRef<string | null>(null);
  const hydratedSlotKeyRef = useRef<string | null>(null);
  const scopeUidRef = useRef<string | null>(getLastActiveBrokerUserId());
  const userEditedSinceMountRef = useRef<boolean>(false);
  const appliedInitialParamsRef = useRef<boolean>(false);
  const initialNewParamRef = useRef<boolean>(isNewParam);
  const hasHandledNewQueryRef = useRef<boolean>(isNewParam);

  const syncUrlParams = useCallback(
    (
      nextEditionId: string | null,
      nextCadence: NewsletterCadence | "special",
      opts?: { openMobileEditor?: boolean; nextStep?: NewsletterStepKey },
    ) => {
      try {
        const baseSearch =
          typeof window !== "undefined" && window.location.search
            ? window.location.search
            : searchParams?.toString?.() ?? "";
        const params = new URLSearchParams(baseSearch);
        params.delete("new");
        if (nextEditionId) {
          params.set("editionId", nextEditionId);
          lastSyncedEditionQueryRef.current = nextEditionId;
          if (opts?.openMobileEditor && (!params.has("tab") || params.get("tab") === "list")) {
            params.set("tab", "editor");
          }
        } else {
          params.delete("editionId");
          params.delete("buildingId");
          lastSyncedEditionQueryRef.current = "";
          if (opts?.openMobileEditor) {
            params.set("tab", "editor");
          }
        }
        if (opts?.nextStep) {
          params.set("step", opts.nextStep);
        }
        params.set("cadence", nextCadence === "special" ? "weekly" : nextCadence);
        const qs = params.toString();
        router?.replace?.(qs ? `${pathname}?${qs}` : pathname);
      } catch {
        // ignore router mock edge cases
      }
    },
    [pathname, router, searchParams],
  );

  const hydrateFromParsedDraft = useCallback(
    (parsed: Record<string, unknown>, slotKey?: string) => {
      if (slotKey) {
        hydratedSlotKeyRef.current = slotKey;
      }
      const data = parseHydratedDraftData(parsed);
      if (data.isExplicitNewSlot) {
        setCadence(data.cadence);
        if (typeof data.issueYear === "number") setIssueYear(data.issueYear);
        if (typeof data.issueMonth === "number") setIssueMonth(data.issueMonth);
        if (data.issueDateStr) setIssueDateStr(data.issueDateStr);
        setDraftSlotSlugOverride(data.slotSlug);
        setEditionId(null);
        setHeadline("");
        setSummary("");
        setBriefingTitle("");
        setBriefingBody("");
        setRegionFocus("");
        setMarketTemp(null);
        setSelectedDealIds([]);
        setDealComments({});
        setSections(data.sections);
        setMonthlyPairId(data.monthlyPairId);
        setMonthlyCharts(data.monthlyCharts);
        if (data.unitIssuesUpdate) setUnitIssues(data.unitIssuesUpdate.issues);
        setIsPublished(false);
        setPublishedUrl(null);
        setLocalStorageMode("none");
        setSaveState("idle");
        setLastSavedAt(null);
        setHasUserEditedDraft(false);
        return;
      }

      if (typeof data.headline === "string") setHeadline(data.headline);
      if (typeof data.summary === "string") setSummary(data.summary);
      if (typeof data.briefingTitle === "string") setBriefingTitle(data.briefingTitle);
      if (typeof data.briefingBody === "string") setBriefingBody(data.briefingBody);
      if (typeof data.issueYear === "number") setIssueYear(data.issueYear);
      if (typeof data.issueMonth === "number") setIssueMonth(data.issueMonth);
      if (typeof parsed.cadence === "string") setCadence(data.cadence);
      if (data.issueDateStr) setIssueDateStr(data.issueDateStr);
      setDraftSlotSlugOverride(data.slotSlug);
      if (data.hasMarketTemp) setMarketTemp(data.marketTemp);
      setMonthlyRegion(data.monthlyRegion);
      setMonthlyPairId(data.monthlyPairId);
      setMonthlyCharts(data.monthlyCharts);
      setSections(data.sections);
      if (data.targetSegment) setTargetSegment(data.targetSegment);
      if (data.selectedDealIds) setSelectedDealIds(data.selectedDealIds);
      if (data.dealComments) setDealComments(data.dealComments);
      if (data.preferredPrefs) {
        setPreferredRegions(data.preferredPrefs.preferredRegions);
        setPreferredChannels(data.preferredPrefs.preferredChannels);
      }
      if (data.unitIssuesUpdate) {
        setUnitIssues(data.unitIssuesUpdate.issues);
        if (data.unitIssuesUpdate.markRestored) restoredLocalIssuesRef.current = true;
      }
      if (data.editionIdUpdate?.hasValue) setEditionId(data.editionIdUpdate.value);

      if (data.syncStatus === "published") {
        if (data.publishedUrl) setPublishedUrl(data.publishedUrl);
        setIsPublished(true);
        setLocalStorageMode("none");
        setSaveState("saved");
        if (data.savedAt) setLastSavedAt(data.savedAt);
      } else if (data.syncStatus === "server_draft") {
        setPublishedUrl(null);
        setIsPublished(false);
        setLocalStorageMode("none");
        setSaveState("saved");
        if (data.savedAt) setLastSavedAt(data.savedAt);
      } else {
        setLocalStorageMode("local_only");
        setSaveState("dirty");
      }
    },
    [],
  );

  // ── 슬롯별 로컬 초안 자동저장 ──
  const persistLocalDraft = useCallback(
    (
      nextPatch?: Partial<{
        editionId: string | null;
        slotSlug: string | null;
        headline: string;
        summary: string;
        briefingTitle: string;
        briefingBody: string;
        issueYear: number;
        issueMonth: number;
        marketTemp: MarketTemperature | null;
        monthlyRegion: MonthlyRegionKey;
        monthlyPairId: MonthlyChartPairId;
        monthlyCharts: MonthlyRegionalChart[];
        selectedDealIds: string[];
        dealComments: Record<string, string>;
        preferredRegions: string[];
        preferredChannels: SpecificNewsChannelId[];
        unitIssues: AxiosUnitIssue[];
        sections: { id: string; enabled: boolean }[];
        targetSegment: NewsletterTargetSegment;
        cadence: NewsletterCadence;
        issueDateStr: string;
      }>,
    ) => {
      const targetEditionId =
        nextPatch && "editionId" in nextPatch ? (nextPatch.editionId ?? null) : editionId;
      const targetCadence = nextPatch?.cadence ?? cadence;
      const targetYear = nextPatch?.issueYear ?? issueYear;
      const targetMonth = nextPatch?.issueMonth ?? issueMonth;
      const targetDateStr = nextPatch?.issueDateStr ?? issueDateStr;
      const derivedSlug = deriveCadenceIssueMeta(targetCadence, {
        year: targetYear,
        month: targetMonth,
        dateStr: targetDateStr,
      }).slug;
      const targetSlotSlug =
        nextPatch && "slotSlug" in nextPatch
          ? nextPatch.slotSlug || derivedSlug
          : draftSlotSlugOverride || derivedSlug;
      const slotKey = makeSlotStorageKey(targetEditionId, targetCadence, targetSlotSlug);

      try {
        if (typeof window !== "undefined") {
          const { payload, activeScopeUid } = buildLocalDraftStorageRecord(
            {
              brokerId,
              brokerSlug,
              editionId: targetEditionId,
              slotSlug: targetSlotSlug,
              headline: nextPatch?.headline ?? headline,
              summary: nextPatch?.summary ?? summary,
              briefingTitle: nextPatch?.briefingTitle ?? briefingTitle,
              briefingBody: nextPatch?.briefingBody ?? briefingBody,
              issueYear: targetYear,
              issueMonth: targetMonth,
              cadence: targetCadence,
              issueDateStr: targetDateStr,
              marketTemp:
                nextPatch && "marketTemp" in nextPatch
                  ? (nextPatch.marketTemp ?? null)
                  : marketTemp,
              monthlyRegion: nextPatch?.monthlyRegion ?? monthlyRegion,
              monthlyPairId: nextPatch?.monthlyPairId ?? monthlyPairId,
              monthlyCharts: nextPatch?.monthlyCharts ?? monthlyCharts,
              selectedDealIds: nextPatch?.selectedDealIds ?? selectedDealIds,
              dealComments: nextPatch?.dealComments ?? dealComments,
              preferredRegions: nextPatch?.preferredRegions ?? preferredRegions,
              preferredChannels: nextPatch?.preferredChannels ?? preferredChannels,
              unitIssues: nextPatch?.unitIssues ?? unitIssues,
              sections: nextPatch?.sections ?? sections,
              targetSegment: nextPatch?.targetSegment ?? targetSegment,
              publishedUrl: isPublished ? publishedUrl : null,
              serverPublished: false,
              serverSavedDraft: false,
            },
            scopeUidRef.current,
          );
          saveDraftRecordToSlots({ slotKey, activeScopeUid, payload });
          hydratedSlotKeyRef.current = slotKey;
          userEditedSinceMountRef.current = true;
        }
      } catch {
        // ignore storage quota errors
      }
      setHasUserEditedDraft(true);
      setLocalStorageMode("local_only");
      setSaveState("dirty");
    },
    [
      brokerId,
      brokerSlug,
      editionId,
      draftSlotSlugOverride,
      headline,
      summary,
      briefingTitle,
      briefingBody,
      issueYear,
      issueMonth,
      marketTemp,
      monthlyRegion,
      monthlyPairId,
      monthlyCharts,
      selectedDealIds,
      dealComments,
      preferredRegions,
      preferredChannels,
      unitIssues,
      sections,
      targetSegment,
      cadence,
      issueDateStr,
      isPublished,
      publishedUrl,
    ],
  );

  const persistCurrentSlotIfDirty = useCallback(() => {
    if (saveState !== "dirty" && saveState !== "conflict" && localStorageMode !== "local_only") return;
    try {
      if (typeof window === "undefined") return;
      const currentSlotKey = makeSlotStorageKey(editionId, cadence, effectiveSlotSlug);
      const { payload, activeScopeUid } = buildLocalDraftStorageRecord(
        {
          brokerId,
          brokerSlug,
          editionId,
          slotSlug: effectiveSlotSlug,
          headline,
          summary,
          briefingTitle,
          briefingBody,
          issueYear,
          issueMonth,
          cadence,
          issueDateStr,
          marketTemp,
          monthlyRegion,
          monthlyPairId,
          monthlyCharts,
          selectedDealIds,
          dealComments,
          preferredRegions,
          preferredChannels,
          unitIssues,
          sections,
          targetSegment,
          publishedUrl: isPublished ? publishedUrl : null,
          serverPublished: false,
          serverSavedDraft: false,
        },
        scopeUidRef.current,
      );
      saveDraftRecordToSlots({
        slotKey: currentSlotKey,
        activeScopeUid,
        payload,
        updateLastActive: false,
      });
    } catch {
      // ignore storage errors
    }
  }, [
    saveState,
    localStorageMode,
    editionId,
    cadence,
    effectiveSlotSlug,
    brokerId,
    brokerSlug,
    headline,
    summary,
    briefingTitle,
    briefingBody,
    issueYear,
    issueMonth,
    marketTemp,
    monthlyRegion,
    monthlyPairId,
    monthlyCharts,
    selectedDealIds,
    dealComments,
    preferredRegions,
    preferredChannels,
    unitIssues,
    sections,
    targetSegment,
    issueDateStr,
    isPublished,
    publishedUrl,
  ]);

  const applyEditionToEditorState = useCallback(
    (
      ed: SavedEditionSummary,
      opts?: { syncUrl?: boolean; openMobileEditor?: boolean; effectiveSlugOverride?: string },
    ) => {
      const targetSlotKey = makeSlotStorageKey(
        ed.id,
        ed.cadence ?? "monthly",
        ed.slug,
      );
      setPreviousIssuesSnapshot(null);

      const activeScopeUid = resolveNewsletterScopeUid(
        brokerId,
        opts?.effectiveSlugOverride ?? brokerSlug,
        scopeUidRef.current,
      );
      if (typeof window !== "undefined") {
        try {
          const parsedSlot = readScopedWorkspaceJson<Record<string, unknown> | null>(
            targetSlotKey,
            activeScopeUid,
            null,
          );
          if (parsedSlot) {
            const mismatch = isBrokerMismatch(
              parsedSlot,
              brokerId,
              opts?.effectiveSlugOverride ?? brokerSlug,
              activeScopeUid,
            );
            const isDirtySlot =
              !mismatch &&
              parsedSlot.serverPublished !== true &&
              parsedSlot.serverSavedDraft !== true &&
              parsedSlot.isExplicitNewSlot !== true;
            if (isDirtySlot) {
              writeLastActiveSlotKey(activeScopeUid, targetSlotKey);
              removeScopedWorkspaceKey(LEGACY_DRAFT_STORAGE_KEY, activeScopeUid);
              hydrateFromParsedDraft(
                { ...parsedSlot, editionId: ed.id },
                targetSlotKey,
              );
              if (opts?.syncUrl !== false) {
                syncUrlParams(ed.id, ed.cadence ?? "monthly", {
                  openMobileEditor: opts?.openMobileEditor,
                });
              }
              return;
            }
          }
        } catch {
          // ignore storage errors
        }
      }

      const f = resolveAppliedEditionFields(ed, (opts?.effectiveSlugOverride ?? brokerSlug).trim());
      setEditionId(ed.id);
      setDraftSlotSlugOverride(null);
      setCadence(f.anchor.cadence);
      setIssueYear(f.anchor.year);
      setIssueMonth(f.anchor.month);
      setIssueDateStr(f.issueDateStr);
      setHeadline(f.headline);
      setSummary(f.summary);
      setBriefingTitle(f.briefingTitle);
      setBriefingBody(f.briefingBody);
      setMarketTemp(f.marketTemp);
      setMonthlyRegion(f.nextRegion);
      setMonthlyPairId(f.nextPair);
      setMonthlyCharts(f.monthlyCharts);
      setSelectedDealIds(f.selectedDealIds);
      setDealComments(f.dealComments);
      setUnitIssues(f.unitIssues);
      setSections(f.sections);
      setTargetSegment(f.resolvedSeg);
      setIsPublished(f.publishedFlag);
      setPublishedUrl(f.publishedFlag ? f.resolvedPubUrl : null);
      setLocalStorageMode("none");
      setSaveState("saved");
      setLastSavedAt(f.lastSavedAt);
      setHasUserEditedDraft(false);
      setStatusBanner(null);

      try {
        if (typeof window !== "undefined") {
          writeLastActiveSlotKey(activeScopeUid, targetSlotKey);
          const parsedLegacy = readScopedWorkspaceJson<Record<string, unknown> | null>(
            LEGACY_DRAFT_STORAGE_KEY,
            activeScopeUid,
            null,
          );
          if (parsedLegacy && parsedLegacy.editionId !== ed.id) {
            removeScopedWorkspaceKey(LEGACY_DRAFT_STORAGE_KEY, activeScopeUid);
          }
          hydratedSlotKeyRef.current = targetSlotKey;
        }
      } catch {
        // ignore storage errors
      }

      if (opts?.syncUrl !== false) {
        syncUrlParams(ed.id, ed.cadence ?? f.anchor.cadence, {
          openMobileEditor: opts?.openMobileEditor,
        });
      }
    },
    [brokerId, brokerSlug, hydrateFromParsedDraft, syncUrlParams],
  );

  // ── 기기 간 서버 초안 자동저장 연동 (useEditionAutosave + 신규 초안 자동 부트스트랩) ──
  const currentServerEditionUpdatedAt = useMemo(
    () => (editionId ? editions.find((e) => e.id === editionId)?.updatedAt ?? null : null),
    [editionId, editions],
  );

  const handleServerDraftBootstrapped = useCallback(
    (bootstrapped: {
      editionId: string;
      editionLabel: string;
      updatedAt: string | null;
    }) => {
      const nowIso = bootstrapped.updatedAt ?? new Date().toISOString();
      setEditionId(bootstrapped.editionId);
      setDraftSlotSlugOverride(null);
      setEditions((prev) =>
        upsertBootstrappedDraftSummary(prev, {
          editionId: bootstrapped.editionId,
          editionLabel: bootstrapped.editionLabel,
          nowIso,
          headline,
          yearMonthLabel: autoMeta.yearMonthLabel,
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
          issueDateStr,
          cadence,
        }),
      );
      syncUrlParams(bootstrapped.editionId, cadence);
    },
    [
      headline,
      autoMeta.yearMonthLabel,
      selectedDealIds,
      briefingBody,
      summary,
      briefingTitle,
      marketTemp,
      monthlyRegion,
      monthlyPairId,
      monthlyCharts,
      dealComments,
      unitIssues,
      sections,
      targetSegment,
      issueDateStr,
      cadence,
      syncUrlParams,
    ],
  );

  const handleServerDraftSynced = useCallback(
    (syncedAt: Date | string) => {
      const isoStr =
        typeof syncedAt === "string" ? syncedAt : syncedAt.toISOString();
      setLocalStorageMode("none");
      setSaveState("saved");
      setLastSavedAt(syncedAt);
      if (editionId) {
        setEditions((prev) =>
          applyServerDraftSyncedUpdate(prev, {
            editionId,
            isoStr,
            headline,
            summary,
            briefingTitle,
            briefingBody,
            marketTemp,
            selectedDealIds,
            dealComments,
            unitIssues,
            sections,
            targetSegment,
          }),
        );
      }
      try {
        markSlotSyncedOnServer({
          brokerId,
          brokerSlug,
          scopeUidHint: scopeUidRef.current,
          editionId,
          cadence,
          effectiveSlotSlug,
          isoStr,
        });
      } catch {
        // ignore storage errors
      }
    },
    [
      editionId,
      headline,
      selectedDealIds,
      briefingBody,
      summary,
      briefingTitle,
      marketTemp,
      dealComments,
      unitIssues,
      sections,
      targetSegment,
      brokerId,
      brokerSlug,
      cadence,
      effectiveSlotSlug,
    ],
  );

  const autosave = useNewsletterServerDraftSync({
    hydrated: isWorkspaceHydrated,
    hasUserEdited: hasUserEditedDraft,
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
    initialUpdatedAt: currentServerEditionUpdatedAt,
    onDraftBootstrapped: handleServerDraftBootstrapped,
    onServerSynced: handleServerDraftSynced,
    onSavingStatus: setSaveState,
  });

  // ── 5. 초기 데이터 및 슬롯별 로컬·서버 초안 복원 ──
  useEffect(() => {
    let mounted = true;
    const initialUrlEditionId =
      searchParams?.get?.("editionId") || searchParams?.get?.("buildingId") || null;
    const initialUrlCadence = searchParams?.get?.("cadence") || null;
    const initialScopeUid = scopeUidRef.current;
    const skipDraftResumeOnMount = initialNewParamRef.current;

    let initialDraft: Record<string, unknown> | null = null;
    let initialDraftKey: string | null = null;

    try {
      if (typeof window !== "undefined") {
        if (!skipDraftResumeOnMount) {
          const found = findScopedInitialDraftRecord({
            initialUrlEditionId,
            initialUrlCadence,
            targetScopeUid: initialScopeUid,
          });
          initialDraft = found.draft;
          initialDraftKey = found.key;
        }

        if (initialDraft) {
          hydrateFromParsedDraft(initialDraft, initialDraftKey ?? undefined);
        } else if (
          !initialUrlEditionId &&
          (initialUrlCadence === "daily" ||
            initialUrlCadence === "weekly" ||
            initialUrlCadence === "monthly")
        ) {
          setCadence(initialUrlCadence);
          setSections(buildDefaultEditorSections(initialUrlCadence));
        }
      }
    } catch {
      // localStorage 사용 불가 환경 무시
    }

    async function loadInitialWorkspace() {
      if (typeof fetch === "undefined") return;
      const resetEditorFieldsToBlank = () => {
        restoredLocalIssuesRef.current = false;
        hydratedSlotKeyRef.current = null;
        initialDraft = null;
        initialDraftKey = null;
        setDraftSlotSlugOverride(null);
        setHeadline("");
        setSummary("");
        setBriefingTitle("");
        setBriefingBody("");
        setRegionFocus("");
        setMarketTemp(null);
        setMonthlyRegion("gbd");
        setMonthlyPairId("molit_bok");
        setMonthlyCharts(buildDefaultMonthlyGraphicPair("gbd", "molit_bok"));
        setSelectedDealIds([]);
        setDealComments({});
        setSections(buildDefaultEditorSections("monthly"));
        setTargetSegment("all");
        setEditionId(null);
        setPublishedUrl(null);
        setIsPublished(false);
        setLocalStorageMode("none");
        setSaveState("idle");
        setLastSavedAt(null);
        setHasUserEditedDraft(false);
      };

      try {
        const buildingsPromise = fetch("/api/broker/buildings").then(
          (r) => r,
          () => null,
        );
        const [authUid, editionsRes] = await Promise.all([
          resolveBrowserBrokerUserId(),
          fetch("/api/magazine/editions?broker_id=me&type=all&limit=50", {
            cache: "no-store",
          }).then(
            (r) => r,
            () => null,
          ),
        ]);

        if (!mounted) return;

        if (
          editionsRes &&
          (editionsRes.status === 401 || editionsRes.status === 403)
        ) {
          purgeWorkspaceClientStorage();
          scopeUidRef.current = null;
          resetEditorFieldsToBlank();
          return;
        }

        if (editionsRes && editionsRes.ok) {
          const edJson = (await editionsRes.json().then(
            (v) => v,
            () => null,
          )) as Record<string, unknown> | null;
          if (edJson) {
            const currentBrokerId =
              (typeof edJson.brokerId === "string" && edJson.brokerId.trim()) ||
              authUid ||
              "";
            const rawSlug =
              typeof edJson.brokerSlug === "string" ? edJson.brokerSlug.trim() : "";
            const currentBrokerSlug = isUuidLike(rawSlug) ? "" : rawSlug;
            const verifiedScopeUid = resolveNewsletterScopeUid(
              currentBrokerId,
              currentBrokerSlug,
              authUid,
            );

            let switchedScope = false;
            if (verifiedScopeUid) {
              const syncRes = syncActiveBrokerSessionStorage(verifiedScopeUid);
              switchedScope =
                syncRes.switched ||
                Boolean(initialScopeUid && initialScopeUid !== verifiedScopeUid);
              scopeUidRef.current = verifiedScopeUid;
              if (switchedScope) {
                userEditedSinceMountRef.current = false;
              }
            }

            if (currentBrokerId) setBrokerId(currentBrokerId);
            setBrokerSlug(currentBrokerSlug);
            if (typeof edJson.brokerName === "string") setBrokerName(edJson.brokerName);
            if (typeof edJson.brokerOffice === "string") setBrokerOffice(edJson.brokerOffice);
            if (typeof edJson.brokerPhone === "string") setBrokerPhone(edJson.brokerPhone);
            if (typeof edJson.subscriberCount === "number") {
              setSubscriberCount(edJson.subscriberCount);
            }
            if (typeof edJson.highInterestCount === "number") {
              setHighInterestCount(edJson.highInterestCount);
            }
            const bootstrapMeta = edJson.meta as { sendEnabled?: unknown } | undefined;
            const bootstrapSendEnabled =
              typeof bootstrapMeta?.sendEnabled === "boolean"
                ? bootstrapMeta.sendEnabled
                : typeof edJson.sendEnabled === "boolean"
                ? edJson.sendEnabled
                : undefined;
            if (typeof bootstrapSendEnabled === "boolean") {
              setSendDisabled(!bootstrapSendEnabled);
            }

            let purgedActiveDraft = switchedScope;
            if (
              !purgedActiveDraft &&
              initialDraft &&
              isBrokerMismatch(
                initialDraft,
                currentBrokerId,
                currentBrokerSlug,
                verifiedScopeUid,
              )
            ) {
              purgedActiveDraft = true;
            }
            try {
              const legacyPurged = purgeMismatchedLegacyDraftKeys({
                initialDraftKey,
                currentBrokerId,
                currentBrokerSlug,
                verifiedScopeUid,
              });
              if (legacyPurged) purgedActiveDraft = true;
              if (purgedActiveDraft) {
                clearLastActiveSlotKey(initialScopeUid);
                resetEditorFieldsToBlank();
                if (verifiedScopeUid && !skipDraftResumeOnMount) {
                  const ownScoped = findScopedInitialDraftRecord({
                    initialUrlEditionId,
                    initialUrlCadence,
                    targetScopeUid: verifiedScopeUid,
                  });
                  if (
                    ownScoped.draft &&
                    !isBrokerMismatch(
                      ownScoped.draft,
                      currentBrokerId,
                      currentBrokerSlug,
                      verifiedScopeUid,
                    )
                  ) {
                    initialDraft = ownScoped.draft;
                    initialDraftKey = ownScoped.key;
                    hydrateFromParsedDraft(ownScoped.draft, ownScoped.key ?? undefined);
                  }
                }
              } else if (!initialScopeUid && verifiedScopeUid && !skipDraftResumeOnMount) {
                if (!initialDraft && !userEditedSinceMountRef.current) {
                  const ownScoped = findScopedInitialDraftRecord({
                    initialUrlEditionId,
                    initialUrlCadence,
                    targetScopeUid: verifiedScopeUid,
                  });
                  if (
                    ownScoped.draft &&
                    !isBrokerMismatch(
                      ownScoped.draft,
                      currentBrokerId,
                      currentBrokerSlug,
                      verifiedScopeUid,
                    )
                  ) {
                    initialDraft = ownScoped.draft;
                    initialDraftKey = ownScoped.key;
                    hydrateFromParsedDraft(ownScoped.draft, ownScoped.key ?? undefined);
                  }
                } else if (initialDraft && initialDraftKey) {
                  writeScopedWorkspaceJson(initialDraftKey, verifiedScopeUid, {
                    ...initialDraft,
                    ownerUserId: verifiedScopeUid,
                    brokerId: currentBrokerId || initialDraft.brokerId,
                  });
                  writeLastActiveSlotKey(verifiedScopeUid, initialDraftKey);
                }
              }
            } catch {
              // ignore storage errors
            }

            if (edJson.brokerPreferences && typeof edJson.brokerPreferences === "object") {
              const normPrefs = normalizeBrokerPreferences(edJson.brokerPreferences);
              setPreferredRegions(normPrefs.preferredRegions);
              setPreferredChannels(normPrefs.preferredChannels);
              if (!initialDraft) {
                const prefMonthlyRegion = mapPreferredRegionsToMonthlyKey(
                  normPrefs.preferredRegions,
                );
                setMonthlyRegion(prefMonthlyRegion);
                setMonthlyCharts(
                  buildDefaultMonthlyGraphicPair(prefMonthlyRegion, "molit_bok"),
                );
              }
              if (!restoredLocalIssuesRef.current) {
                setUnitIssues((prev) =>
                  prev.length > 0
                    ? clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
                        cadence: "monthly",
                        preferredRegions: normPrefs.preferredRegions,
                        preferredChannels: normPrefs.preferredChannels,
                      })
                    : prev,
                );
              }
            }

            if (Array.isArray(edJson.editions)) {
              const mapped: SavedEditionSummary[] = edJson.editions
                .filter(
                  (row): row is Record<string, unknown> => !!row && typeof row === "object",
                )
                .map((row) =>
                  mapServerEditionRowToSummary(
                    row,
                    currentBrokerSlug,
                    buildSafePublicUrl,
                  ),
                );
              setEditions(mapped);

              if (skipDraftResumeOnMount) {
                clearLastActiveSlotKey(verifiedScopeUid);
                const initCadence: NewsletterCadence =
                  initialUrlCadence === "daily" ||
                  initialUrlCadence === "weekly" ||
                  initialUrlCadence === "monthly"
                    ? initialUrlCadence
                    : "monthly";
                const initBaseSlug = deriveCadenceIssueMeta(initCadence, {
                  year: kstParts().year,
                  month: kstParts().month,
                  dateStr: todayKst(),
                }).slug;
                const hasCollision = mapped.some(
                  (e) =>
                    e.status === "published" &&
                    (e.cadence ?? "monthly") === initCadence &&
                    e.slug === initBaseSlug,
                );
                if (hasCollision) {
                  for (let suffix = 2; suffix <= 9; suffix++) {
                    const candidate = `${initBaseSlug}-${suffix}`;
                    const taken = mapped.some(
                      (e) =>
                        (e.cadence ?? "monthly") === initCadence &&
                        e.slug === candidate,
                    );
                    if (!taken) {
                      setDraftSlotSlugOverride(candidate);
                      break;
                    }
                  }
                }
              } else {
                const sessionKey = readLastActiveSlotKey(verifiedScopeUid);
                const sessionEditionId =
                  sessionKey &&
                  sessionKey.startsWith(SLOT_DRAFT_PREFIX) &&
                  !sessionKey.slice(SLOT_DRAFT_PREFIX.length).includes(":")
                    ? sessionKey.slice(SLOT_DRAFT_PREFIX.length)
                    : null;
                const explicitUrlCadenceForServer =
                  !initialUrlEditionId &&
                  (initialUrlCadence === "daily" ||
                    initialUrlCadence === "weekly" ||
                    initialUrlCadence === "monthly")
                    ? initialUrlCadence
                    : null;
                const allowedSessionEditionId =
                  sessionEditionId &&
                  (!explicitUrlCadenceForServer ||
                    mapped.some(
                      (e) => e.id === sessionEditionId && e.cadence === explicitUrlCadenceForServer,
                    ))
                    ? sessionEditionId
                    : null;
                const desiredEditionId =
                  initialUrlEditionId ||
                  allowedSessionEditionId ||
                  (initialDraft && typeof initialDraft.editionId === "string"
                    ? initialDraft.editionId
                    : null);

                if (desiredEditionId) {
                  const matchedServerEd = mapped.find((e) => e.id === desiredEditionId);
                  if (matchedServerEd) {
                    lastSyncedEditionQueryRef.current = matchedServerEd.id;
                    const draftBelongsToDesired =
                      initialDraft && initialDraft.editionId === matchedServerEd.id;
                    const draftIsDirty =
                      draftBelongsToDesired &&
                      initialDraft?.serverPublished !== true &&
                      initialDraft?.serverSavedDraft !== true;
                    const draftSavedAt =
                      draftBelongsToDesired && typeof initialDraft?.savedAt === "string"
                        ? initialDraft.savedAt
                        : "";
                    const serverUpdatedAt = matchedServerEd.updatedAt ?? "";
                    const draftIsNewerOrSame =
                      Boolean(draftBelongsToDesired) &&
                      Boolean(draftSavedAt) &&
                      (!serverUpdatedAt || draftSavedAt >= serverUpdatedAt);

                    if (!draftIsDirty && !draftIsNewerOrSame) {
                      applyEditionToEditorState(matchedServerEd, {
                        syncUrl: false,
                        effectiveSlugOverride: currentBrokerSlug,
                      });
                    } else {
                      restoredLocalIssuesRef.current = true;
                    }
                  }
                } else if (!initialDraft && !userEditedSinceMountRef.current) {
                  // 기기 간 초안 이어쓰기: PC에서 저장된 작성 중 초안을 스마트폰 진입 시 자동 복원
                  const resumableServerDraft = mapped.find(
                    (e) =>
                      e.status === "draft" &&
                      (!explicitUrlCadenceForServer ||
                        (e.cadence ?? "monthly") === explicitUrlCadenceForServer) &&
                      Boolean(
                        e.title.trim() ||
                          e.briefingBody?.trim() ||
                          e.summary?.trim() ||
                          (e.selectedDealIds && e.selectedDealIds.length > 0),
                      ),
                  );
                  if (resumableServerDraft) {
                    applyEditionToEditorState(resumableServerDraft, {
                      syncUrl: false,
                      effectiveSlugOverride: currentBrokerSlug,
                    });
                  }
                }
              }
            }
          }
        } else if (authUid) {
          const syncRes = syncActiveBrokerSessionStorage(authUid);
          const switchedScope =
            syncRes.switched || Boolean(initialScopeUid && initialScopeUid !== authUid);
          scopeUidRef.current = authUid;
          setBrokerId(authUid);
          if (
            switchedScope ||
            (initialDraft && isBrokerMismatch(initialDraft, authUid, "", authUid))
          ) {
            clearLastActiveSlotKey(initialScopeUid);
            resetEditorFieldsToBlank();
            if (!skipDraftResumeOnMount) {
              const ownScoped = findScopedInitialDraftRecord({
                initialUrlEditionId,
                initialUrlCadence,
                targetScopeUid: authUid,
              });
              if (ownScoped.draft && !isBrokerMismatch(ownScoped.draft, authUid, "", authUid)) {
                initialDraft = ownScoped.draft;
                initialDraftKey = ownScoped.key;
                hydrateFromParsedDraft(ownScoped.draft, ownScoped.key ?? undefined);
              }
            }
          } else if (
            !skipDraftResumeOnMount &&
            !initialScopeUid &&
            !initialDraft &&
            !userEditedSinceMountRef.current
          ) {
            const ownScoped = findScopedInitialDraftRecord({
              initialUrlEditionId,
              initialUrlCadence,
              targetScopeUid: authUid,
            });
            if (ownScoped.draft && !isBrokerMismatch(ownScoped.draft, authUid, "", authUid)) {
              initialDraft = ownScoped.draft;
              initialDraftKey = ownScoped.key;
              hydrateFromParsedDraft(ownScoped.draft, ownScoped.key ?? undefined);
            }
          }
        }

        const buildingsRes = await buildingsPromise;
        if (!mounted) return;
        if (buildingsRes && buildingsRes.ok) {
          const bJson = (await buildingsRes.json().then(
            (v) => v,
            () => null,
          )) as Record<string, unknown> | null;
          const list = Array.isArray(bJson?.buildings)
            ? bJson.buildings
            : Array.isArray(bJson?.items)
              ? bJson.items
              : [];
          setDeals(mapBuildingRowsToAssignableDeals(list));
        }
      } catch {
        // 초기 로드 실패 시에도 로컬 작성은 가능하도록 유지
      } finally {
        if (mounted) {
          hydratedRef.current = true;
          setIsWorkspaceHydrated(true);
        }
      }
    }

    void loadInitialWorkspace();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 URL 쿼리(?editionId= / ?cadence=) 변경 동기화
  const urlEditionId = searchParams?.get?.("editionId") ?? null;
  const urlCadence = searchParams?.get?.("cadence") ?? null;
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (
        urlCadence &&
        (urlCadence === "daily" || urlCadence === "weekly" || urlCadence === "monthly") &&
        !urlEditionId &&
        lastSyncedEditionQueryRef.current === null
      ) {
        setCadence(urlCadence);
      }
      if (!urlEditionId) return;
      if (lastSyncedEditionQueryRef.current === urlEditionId) return;
      const matched = editions.find((e) => e.id === urlEditionId);
      if (matched) {
        lastSyncedEditionQueryRef.current = urlEditionId;
        applyEditionToEditorState(matched, { syncUrl: false });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEditionId, urlCadence, editions]);

  useEffect(() => {
    if (!isWorkspaceHydrated || appliedInitialParamsRef.current) return;
    appliedInitialParamsRef.current = true;
    const action = resolveMagazineQueryAction(searchParams);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (action.dealIds.length > 0) {
        setSelectedDealIds((prev) => Array.from(new Set([...action.dealIds, ...prev])));
      }
      if (action.insightsTab) {
        setInsightsTab(action.insightsTab);
        setActiveStep("history");
      }
      if (action.step) setActiveStep(action.step);
    });
    return () => {
      cancelled = true;
    };
  }, [isWorkspaceHydrated, searchParams]);

  useEffect(() => {
    if (!isNewParam) {
      hasHandledNewQueryRef.current = false;
      return;
    }
    if (!isWorkspaceHydrated || hasHandledNewQueryRef.current) return;
    hasHandledNewQueryRef.current = true;
    handleStartNewThisMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewParam, isWorkspaceHydrated]);

  const fetchHistoryAnalytics = useCallback(async () => {
    if (typeof fetch === "undefined") return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/broker/magazine/analytics?tier=warm", {
        cache: "no-store",
      });
      if (!res.ok) {
        setHistoryError("발송·수신확인 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        deliveryReceipts?: unknown;
        recentDistributions?: unknown;
      } | null;
      setHistoryReceipts(
        Array.isArray(json?.deliveryReceipts)
          ? (json.deliveryReceipts as HistoryReceiptItem[])
          : [],
      );
      setHistoryDistributions(
        Array.isArray(json?.recentDistributions)
          ? (json.recentDistributions as HistoryDistributionItem[])
          : [],
      );
    } catch {
      setHistoryError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeStep !== "history") return;
    void fetchHistoryAnalytics();
  }, [activeStep, fetchHistoryAnalytics]);

  // 월간 상단 통계 그래픽 2선 — 공공 DB 적재 행 자동 승격
  useEffect(() => {
    if (cadence !== "monthly") return;
    if (typeof fetch === "undefined") return;
    let active = true;
    const ym = `${issueYear}-${String(issueMonth).padStart(2, "0")}`;
    const qs = new URLSearchParams({
      region: monthlyRegion,
      pair: monthlyPairId,
      yearMonth: ym,
    });
    fetch(`/api/broker/magazine/monthly-stats?${qs.toString()}`)
      .then((res) => (res && res.ok ? res.json() : null), () => null)
      .then((raw) => {
        if (!active || !raw || typeof raw !== "object") return;
        const json = raw as {
          ok?: boolean;
          regionKey?: string;
          liveDbAvailable?: boolean;
          charts?: unknown[];
        };
        if (!json.ok || json.regionKey !== monthlyRegion) return;
        setMonthlyLiveDbAvailable(Boolean(json.liveDbAvailable));
        if (json.liveDbAvailable === true) {
          const valid = normalizeSavedMonthlyCharts(json.charts);
          if (valid && valid.length > 0) {
            setMonthlyCharts((prev) =>
              prev.some((c) => c.sourceMode === "broker_custom") ? prev : valid,
            );
          }
        }
      });
    return () => {
      active = false;
    };
  }, [cadence, monthlyRegion, monthlyPairId, issueYear, issueMonth]);

  // ── 7. 서버 저장 핸들러 ──
  const handleServerSave = useCallback(
    async (opts?: {
      saveAsDraft?: boolean;
      refreshPublishDate?: boolean;
    }): Promise<{
      ok: boolean;
      publicUrl: string | null;
      savedEditionId: string | null;
      savedIssueDate: string;
      errorBanner?: StatusBannerState;
    }> => {
      const fallbackIsoDate = resolveFallbackIssueIsoDate(issueDateStr, autoMeta.dateStr);

      if (savingLockRef.current) {
        return {
          ok: false,
          publicUrl: publishedUrl,
          savedEditionId: editionId,
          savedIssueDate: fallbackIsoDate,
        };
      }
      savingLockRef.current = true;
      const shouldSaveAsDraft = Boolean(opts?.saveAsDraft) && !isPublished;
      setSaveState("saving");

      const issueSlug = effectiveSlotSlug;
      const hasPublishedCollision =
        !editionId &&
        editions.some(
          (e) =>
            e.status === "published" &&
            (e.cadence ?? "monthly") === cadence &&
            e.slug === issueSlug,
        );

      try {
        const selectedDealSnapshots = buildSelectedDealSnapshots(selectedDealIds, deals, dealComments);
        const populatedMonthlyCharts = resolvePopulatedMonthlyCharts(
          cadence,
          sections,
          monthlyCharts,
          monthlyRegion,
          monthlyPairId,
        );
        const requestBody = {
          ...buildIssueRequestBody({
            editionId,
            cadence,
            autoMeta,
            fallbackIsoDate,
            issueSlug,
            shouldSaveAsDraft,
            createDistinctIfPublished: Boolean(draftSlotSlugOverride) || hasPublishedCollision,
            headline,
            summary,
            briefingTitle,
            briefingBody,
            marketTemp,
            monthlyRegion,
            monthlyPairId,
            populatedMonthlyCharts,
            selectedDealIds,
            selectedDealSnapshots,
            dealComments,
            unitIssues,
            preferredRegions,
            preferredChannels,
            sections,
            targetSegment,
          }),
          ...(opts?.refreshPublishDate ? { refreshPublishDate: true } : {}),
        };

        const res = await fetch("/api/magazine/issues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          const json = (await res.json().then((v) => v, () => null)) as Record<string, unknown> | null;
          const parsed = parseServerSaveSuccess({
            json,
            brokerId,
            brokerSlug,
            scopeUidHint: scopeUidRef.current,
            editionId,
            issueSlug,
            fallbackIsoDate,
            shouldSaveAsDraft,
            cadence,
            autoMeta,
            headline,
            summary,
            briefingTitle,
            briefingBody,
            marketTemp,
            monthlyRegion,
            monthlyPairId,
            populatedMonthlyCharts,
            selectedDealIds,
            dealComments,
            preferredRegions,
            preferredChannels,
            unitIssues,
            sections,
            targetSegment,
          });
          if (parsed.returnedSlug) setBrokerSlug(parsed.returnedSlug);
          if (parsed.nextId) {
            setEditionId(parsed.nextId);
            setDraftSlotSlugOverride(null);
          }
          setEditions((prev) => upsertSavedEditionSummary(prev, parsed.nextEntry));
          autosave.syncUpdatedAt(parsed.nowIso);
          autosave.markClean();
          setPublishedUrl(parsed.resolvedUrl);
          setIsPublished(!shouldSaveAsDraft);
          if (!shouldSaveAsDraft && isValidIsoDate(parsed.savedIssueDate)) {
            setIssueDateStr(parsed.savedIssueDate);
          }
          setLocalStorageMode("none");
          setSaveState("saved");
          setLastSavedAt(new Date());
          try {
            saveDraftRecordToSlots({
              slotKey: parsed.finalSlotKey,
              removeSlotKey: parsed.prevTempSlotKey,
              writeLegacyKey: true,
              activeScopeUid: parsed.activeScopeUid,
              payload: parsed.savedDraftPayload,
            });
            hydratedSlotKeyRef.current = parsed.finalSlotKey;
          } catch {
            // ignore storage quota errors
          }
          syncUrlParams(parsed.effectiveId, cadence);
          return {
            ok: true,
            publicUrl: parsed.resolvedUrl,
            savedEditionId: parsed.nextId ?? null,
            savedIssueDate: parsed.savedIssueDate,
          };
        }

        let errorStatus = res.status;
        let errorJson = await res.json().then((v) => v, () => null);

        if (!shouldSaveAsDraft && res.status === 404 && editionId) {
          const patchRes = await fetch(`/api/magazine/editions/${encodeURIComponent(editionId)}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildPublishPatchBody({
                isPublished,
                fallbackIsoDate,
                headline,
                summary,
                briefingTitle,
                briefingBody,
                marketTemp,
                monthlyRegion,
                monthlyPairId,
                populatedMonthlyCharts,
                selectedDealIds,
                dealComments,
                unitIssues,
                sections,
                targetSegment,
              }),
            ),
          });
          if (patchRes.ok) {
            const patchJson = (await patchRes.json().then((v) => v, () => null)) as Record<string, unknown> | null;
            const fallbackUrl = resolvePublishPatchSuccessUrl({
              patchJson,
              brokerSlug,
              fallbackIsoDate,
              fallbackAnchorDate: autoMeta.dateStr,
              editionId,
              targetSegment,
            });
            setPublishedUrl(fallbackUrl);
            setIsPublished(true);
            setLocalStorageMode("none");
            setSaveState("saved");
            setLastSavedAt(new Date());
            return {
              ok: true,
              publicUrl: fallbackUrl,
              savedEditionId: editionId,
              savedIssueDate: fallbackIsoDate,
            };
          }
          errorStatus = patchRes.status;
          errorJson = await patchRes.json().then((v) => v, () => null);
        }

        const errorBanner = buildApiErrorStatusBanner(
          errorStatus,
          errorJson,
          "뉴스레터 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        setSaveState("error");
        setStatusBanner(errorBanner);
        return {
          ok: false,
          publicUrl: null,
          savedEditionId: null,
          savedIssueDate: fallbackIsoDate,
          errorBanner,
        };
      } catch {
        setSaveState("error");
        return {
          ok: false,
          publicUrl: null,
          savedEditionId: null,
          savedIssueDate: fallbackIsoDate,
        };
      } finally {
        savingLockRef.current = false;
      }
    },
    [
      autoMeta,
      cadence,
      issueDateStr,
      editionId,
      effectiveSlotSlug,
      draftSlotSlugOverride,
      editions,
      isPublished,
      headline,
      summary,
      briefingTitle,
      briefingBody,
      marketTemp,
      monthlyRegion,
      monthlyPairId,
      monthlyCharts,
      selectedDealIds,
      deals,
      dealComments,
      unitIssues,
      preferredRegions,
      preferredChannels,
      sections,
      targetSegment,
      brokerId,
      brokerSlug,
      publishedUrl,
      autosave,
      syncUrlParams,
    ],
  );

  const handleDraftSaveClick = useCallback(async () => {
    const savingAsDraft = !isPublished;
    const result = await handleServerSave({ saveAsDraft: savingAsDraft });
    if (result.ok) {
      setStatusBanner({
        tone: "success",
        message: savingAsDraft
          ? "초안을 서버에 임시저장했어요. 언제든 이어서 작성할 수 있습니다."
          : "발행된 뉴스레터의 수정 내용을 서버에 반영했어요.",
      });
    } else {
      setStatusBanner(
        result.errorBanner ?? {
          tone: "error",
          message: "임시저장에 실패했어요. 네트워크 상태를 확인한 뒤 다시 눌러 주세요.",
        },
      );
    }
  }, [handleServerSave, isPublished]);

  const handleSelectStep = useCallback(
    (nextStep: NewsletterStepKey) => {
      setActiveStep(nextStep);
      setStatusBanner(null);
      syncUrlParams(editionId, cadence, { nextStep });
    },
    [cadence, editionId, syncUrlParams],
  );

  // ── 8. 주기 전환 / 새로 쓰기 / 복제 / 2단계 확인 삭제 ──
  const findEditionFor = useCallback(
    (nextCadence: NewsletterCadence, slug: string) =>
      editions.find((e) => e.slug === slug && (e.cadence ?? "monthly") === nextCadence),
    [editions],
  );

  const computeDistinctSlotSlug = useCallback(
    (nextCadence: NewsletterCadence, baseSlug: string): string | null => {
      const matchingPublished = editions.some(
        (e) =>
          e.status === "published" &&
          (e.cadence ?? "monthly") === nextCadence &&
          e.slug === baseSlug,
      );
      if (!matchingPublished) return null;
      for (let suffix = 2; suffix <= 9; suffix++) {
        const candidate = `${baseSlug}-${suffix}`;
        const taken = editions.some(
          (e) => (e.cadence ?? "monthly") === nextCadence && e.slug === candidate,
        );
        if (!taken) return candidate;
      }
      return `${baseSlug}-${Date.now().toString(36).slice(-3)}`;
    },
    [editions],
  );

  const handleStartNewThisMonth = (overrideCadence?: NewsletterCadence) => {
    persistCurrentSlotIfDirty();
    const nextCadence = overrideCadence ?? cadence;
    const nowKst = kstParts();
    const today = todayKst();
    const baseMeta = deriveCadenceIssueMeta(nextCadence, {
      year: nowKst.year,
      month: nowKst.month,
      dateStr: today,
    });
    const distinctSlug = computeDistinctSlotSlug(nextCadence, baseMeta.slug);
    const targetSlotSlug = distinctSlug ?? baseMeta.slug;

    setPreviousIssuesSnapshot(null);
    setCadence(nextCadence);
    setEditionId(null);
    setDraftSlotSlugOverride(distinctSlug);
    setIssueYear(nowKst.year);
    setIssueMonth(nowKst.month);
    setIssueDateStr(today);
    setHeadline("");
    setSummary("");
    setBriefingTitle("");
    setBriefingBody("");
    setRegionFocus("");
    const mappedRegion = mapPreferredRegionsToMonthlyKey(preferredRegions);
    setMarketTemp(null);
    setMonthlyRegion(mappedRegion);
    setMonthlyPairId("molit_bok");
    setMonthlyCharts(buildDefaultMonthlyGraphicPair(mappedRegion, "molit_bok"));
    setSelectedDealIds([]);
    setDealComments({});
    setSections(buildDefaultEditorSections(nextCadence));
    setTargetSegment("all");
    setUnitIssues(
      clusterArticlesIntoFiveIssues(newsPool, {
        cadence: nextCadence,
        preferredRegions,
        preferredChannels,
      }),
    );
    setIsPublished(false);
    setPublishedUrl(null);
    setActiveStep("title");
    setLocalStorageMode("none");
    setSaveState("idle");
    setLastSavedAt(null);
    setHasUserEditedDraft(false);

    try {
      const markerKey = writeExplicitNewSlotMarker({
        brokerId,
        brokerSlug,
        scopeUidHint: scopeUidRef.current,
        nextCadence,
        targetSlotSlug,
        year: nowKst.year,
        month: nowKst.month,
        dateStr: today,
      });
      if (markerKey) hydratedSlotKeyRef.current = markerKey;
    } catch {
      // ignore storage errors
    }

    syncUrlParams(null, nextCadence, { openMobileEditor: true });

    const meta = NEWSLETTER_CADENCE_META[nextCadence];
    setStatusBanner({
      tone: "info",
      message: distinctSlug
        ? `이미 발행된 ${baseMeta.yearMonthLabel} 뉴스레터를 덮어쓰지 않도록 새 추가 호(${distinctSlug}) 양식을 열었습니다.`
        : `${meta.periodWord} 새 ${meta.label} 뉴스레터 양식을 열었습니다. 표지 제목부터 작성해 보세요.`,
    });
  };

  const handleChangeCadence = (nextCadence: NewsletterCadence) => {
    if (nextCadence === cadence) return;
    const leavingSavedEdition = editionId !== null;
    persistCurrentSlotIfDirty();
    setDraftSlotSlugOverride(null);
    let nextYear = issueYear;
    let nextMonth = issueMonth;
    let nextDateStr = issueDateStr;
    let nextMeta = deriveCadenceIssueMeta(nextCadence, {
      year: nextYear,
      month: nextMonth,
      dateStr: nextDateStr,
    });
    let match = findEditionFor(nextCadence, nextMeta.slug);
    if (!match && leavingSavedEdition) {
      const nowKst = kstParts();
      const today = todayKst();
      nextYear = nowKst.year;
      nextMonth = nowKst.month;
      nextDateStr = today;
      setIssueYear(nextYear);
      setIssueMonth(nextMonth);
      setIssueDateStr(nextDateStr);
      nextMeta = deriveCadenceIssueMeta(nextCadence, {
        year: nextYear,
        month: nextMonth,
        dateStr: nextDateStr,
      });
      match = findEditionFor(nextCadence, nextMeta.slug);
    }
    setCadence(nextCadence);
    if (match) {
      applyEditionToEditorState(match);
    } else {
      setEditionId(null);
      setIsPublished(false);
      setPublishedUrl(null);
      const targetSlotKey = makeSlotStorageKey(null, nextCadence, nextMeta.slug);
      let loadedSlotDraft = false;
      try {
        if (typeof window !== "undefined") {
          const activeScopeUid = resolveNewsletterScopeUid(
            brokerId,
            brokerSlug,
            scopeUidRef.current,
          );
          const parsedSlot = readScopedWorkspaceJson<Record<string, unknown> | null>(
            targetSlotKey,
            activeScopeUid,
            null,
          );
          if (
            parsedSlot &&
            !isBrokerMismatch(parsedSlot, brokerId, brokerSlug, activeScopeUid)
          ) {
            hydrateFromParsedDraft(parsedSlot, targetSlotKey);
            writeLastActiveSlotKey(activeScopeUid, targetSlotKey);
            loadedSlotDraft = true;
          }
        }
      } catch {
        // ignore storage errors
      }
      if (!loadedSlotDraft) {
        const baseSections = buildDefaultEditorSections(nextCadence);
        const nextSections =
          nextCadence === "daily" && briefingBody.trim().length > 0
            ? baseSections.map((s) =>
                s.id === "field_note" ? { ...s, enabled: true } : s,
              )
            : baseSections;
        setSections(nextSections);
        const nextIssues =
          unitIssues.length > 0
            ? unitIssues
            : clusterArticlesIntoFiveIssues(newsPool, {
                cadence: nextCadence,
                preferredRegions,
                preferredChannels,
                dealKeywords: deals.map((d) => `${d.title} ${d.address}`),
              });
        if (unitIssues.length === 0) setUnitIssues(nextIssues);
        persistLocalDraft({
          editionId: null,
          slotSlug: null,
          cadence: nextCadence,
          issueYear: nextYear,
          issueMonth: nextMonth,
          issueDateStr: nextDateStr,
          sections: nextSections,
          unitIssues: nextIssues,
        });
      }
      syncUrlParams(null, nextCadence);
    }
    setStatusBanner({
      tone: "info",
      message: `${NEWSLETTER_CADENCE_META[nextCadence].label} 뉴스레터(${nextMeta.yearMonthLabel})로 전환했어요.`,
    });
  };

  const handleChangeIssueDate = (nextDate: string) => {
    if (!isValidIsoDate(nextDate)) return;
    persistCurrentSlotIfDirty();
    setDraftSlotSlugOverride(null);
    setIssueDateStr(nextDate);
    const nextMeta = deriveCadenceIssueMeta(cadence, { dateStr: nextDate });
    const match = findEditionFor(cadence, nextMeta.slug);
    if (match) {
      applyEditionToEditorState(match);
      return;
    }
    setEditionId(null);
    setIsPublished(false);
    setPublishedUrl(null);
    persistLocalDraft({ editionId: null, slotSlug: null, issueDateStr: nextDate });
    syncUrlParams(null, cadence);
  };

  const handleSelectExistingEdition = (ed: SavedEditionSummary) => {
    persistCurrentSlotIfDirty();
    applyEditionToEditorState(ed, { syncUrl: true, openMobileEditor: true });
  };

  const handleDuplicateEdition = (
    ed: SavedEditionSummary,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    persistCurrentSlotIfDirty();
    const c = buildClonedEditionState(ed, computeDistinctSlotSlug);

    setPreviousIssuesSnapshot(null);
    setEditionId(null);
    setDraftSlotSlugOverride(c.distinctSlug);
    setCadence(c.anchor.cadence);
    setIssueYear(c.anchor.year);
    setIssueMonth(c.anchor.month);
    setIssueDateStr(c.clonedIssueDateStr);
    setHeadline(c.clonedHeadline);
    setSummary(ed.summary ?? "");
    setBriefingTitle(ed.briefingTitle ?? "");
    setBriefingBody(ed.briefingBody ?? "");
    setMarketTemp(ed.marketTemp ?? null);
    setMonthlyRegion(c.clonedRegion);
    setMonthlyPairId(c.clonedPair);
    setMonthlyCharts(c.clonedCharts);
    setSelectedDealIds(c.clonedSelectedDealIds);
    setDealComments(c.clonedDealComments);
    setUnitIssues(c.clonedUnitIssues);
    setSections(c.clonedSections);
    setTargetSegment(c.clonedSegment);
    setIsPublished(false);
    setPublishedUrl(null);
    setActiveStep("title");

    persistLocalDraft({
      editionId: null,
      slotSlug: c.distinctSlug,
      cadence: c.anchor.cadence,
      issueYear: c.anchor.year,
      issueMonth: c.anchor.month,
      issueDateStr: c.clonedIssueDateStr,
      headline: c.clonedHeadline,
      summary: ed.summary ?? "",
      briefingTitle: ed.briefingTitle ?? "",
      briefingBody: ed.briefingBody ?? "",
      marketTemp: ed.marketTemp ?? null,
      monthlyRegion: c.clonedRegion,
      monthlyPairId: c.clonedPair,
      monthlyCharts: c.clonedCharts,
      selectedDealIds: c.clonedSelectedDealIds,
      dealComments: c.clonedDealComments,
      unitIssues: c.clonedUnitIssues,
      sections: c.clonedSections,
      targetSegment: c.clonedSegment,
    });
    syncUrlParams(null, c.anchor.cadence, { openMobileEditor: true });
    setStatusBanner({
      tone: "info",
      message: "선택한 뉴스레터를 새 초안으로 복제했어요. 제목과 내용을 다듬어 보세요.",
    });
  };

  const handleRequestDeleteEdition = (
    ed: SavedEditionSummary,
    e?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e?.stopPropagation();
    setPendingDeleteEdition(ed);
  };

  const handleConfirmDeleteEdition = async () => {
    const ed = pendingDeleteEdition;
    if (!ed) return;
    setPendingDeleteEdition(null);

    const snapshot = { ...ed };
    setEditions((prev) => prev.filter((item) => item.id !== ed.id));

    try {
      if (typeof window !== "undefined") {
        const activeScopeUid = resolveNewsletterScopeUid(
          brokerId,
          brokerSlug,
          scopeUidRef.current,
        );
        removeScopedWorkspaceKey(
          makeSlotStorageKey(ed.id, ed.cadence ?? "monthly", ed.slug),
          activeScopeUid,
        );
      }
    } catch {
      // ignore storage errors
    }

    if (editionId === ed.id) {
      setEditionId(null);
      setIsPublished(false);
      setPublishedUrl(null);
      setHeadline("");
      setSummary("");
      setBriefingTitle("");
      setBriefingBody("");
      setMarketTemp(null);
      setSelectedDealIds([]);
      setDealComments({});
      setLocalStorageMode("none");
      setSaveState("idle");
      setHasUserEditedDraft(false);
      syncUrlParams(null, cadence);
    }

    if (isUuidLike(ed.id)) {
      const delRes = await fetch(
        `/api/magazine/editions?id=${encodeURIComponent(ed.id)}`,
        { method: "DELETE" },
      ).then((r) => r, () => null);
      if (!delRes || (!delRes.ok && delRes.status !== 404)) {
        setEditions((prev) => [snapshot, ...prev]);
        setStatusBanner({
          tone: "error",
          message: !delRes ? "삭제에 실패했습니다. 네트워크 연결을 확인해 주세요." : "뉴스레터 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
    }

    showUndoToast({
      message: `"${snapshot.title || snapshot.slug}" 뉴스레터를 삭제했어요.`,
      variant: "destructive",
      undoLabel: "되돌리기",
      undoAction: async () => {
        const restoredId = await executeRemoteEditionRestore(snapshot);
        const restoredEntry: SavedEditionSummary = { ...snapshot, id: restoredId };
        setEditions((prev) =>
          prev.some((item) => item.id === restoredEntry.id)
            ? prev
            : [restoredEntry, ...prev],
        );
        applyEditionToEditorState(restoredEntry);
      },
    });
  };

  // ── 9. 매물, 코너 토글 및 월간 통계 편집 ──
  const handleChangeMonthlyRegion = (nextRegion: MonthlyRegionKey) => {
    const nextCharts = buildDefaultMonthlyGraphicPair(nextRegion, monthlyPairId);
    setMonthlyRegion(nextRegion);
    setMonthlyLiveDbAvailable(false);
    setMonthlyCharts(nextCharts);
    persistLocalDraft({
      monthlyRegion: nextRegion,
      monthlyPairId,
      monthlyCharts: nextCharts,
    });
  };

  const handleChangeMonthlyPair = (nextPair: MonthlyChartPairId) => {
    const nextCharts = buildDefaultMonthlyGraphicPair(monthlyRegion, nextPair);
    setMonthlyPairId(nextPair);
    setMonthlyCharts(nextCharts);
    persistLocalDraft({
      monthlyRegion,
      monthlyPairId: nextPair,
      monthlyCharts: nextCharts,
    });
  };

  const handleUpdateMonthlyChartField = (
    chartIndex: number,
    patch: { highlightValue?: string; buyerImplication?: string },
  ) => {
    setMonthlyCharts((prev) => {
      const next = applyMonthlyChartFieldPatch(
        prev,
        chartIndex,
        patch,
        monthlyRegion,
        monthlyPairId,
      );
      persistLocalDraft({ monthlyCharts: next });
      return next;
    });
  };

  const handleResetMonthlyCharts = () => {
    const resetCharts = buildDefaultMonthlyGraphicPair(monthlyRegion, monthlyPairId);
    setMonthlyCharts(resetCharts);
    persistLocalDraft({ monthlyCharts: resetCharts });
  };

  const handleToggleDeal = (dealId: string) => {
    setSelectedDealIds((prev) => {
      const next = prev.includes(dealId)
        ? prev.filter((id) => id !== dealId)
        : [...prev, dealId];
      persistLocalDraft({ selectedDealIds: next });
      return next;
    });
  };

  const handleChangeDealComment = (dealId: string, comment: string) => {
    setDealComments((prev) => {
      const next = { ...prev, [dealId]: comment };
      persistLocalDraft({ dealComments: next });
      return next;
    });
  };

  const handleToggleSection = (sectionId: string, nextEnabled?: boolean) => {
    setSections((prev) => {
      const existing = prev.find((s) => s.id === sectionId);
      const resolvedNext =
        typeof nextEnabled === "boolean" ? nextEnabled : !(existing?.enabled ?? true);
      const next = !existing
        ? [...prev, { id: sectionId, enabled: resolvedNext }]
        : prev.map((s) => (s.id === sectionId ? { ...s, enabled: resolvedNext } : s));
      persistLocalDraft({ sections: next });
      return next;
    });
  };

  // ── 10. 권역·관심 분야 설정 & AI 클러스터링 ──
  const handleUndoReclusterIssues = useCallback(() => {
    if (!previousIssuesSnapshot) return;
    setUnitIssues(previousIssuesSnapshot);
    persistLocalDraft({ unitIssues: previousIssuesSnapshot });
    setPreviousIssuesSnapshot(null);
    setStatusBanner({
      tone: "info",
      message: "이전에 편집하던 핵심 시장 이슈 구성으로 복원했어요.",
    });
  }, [previousIssuesSnapshot, persistLocalDraft]);

  const handleTogglePreferredRegion = (regionLabel: string) => {
    setPreferredRegions((prev) => {
      const exists = prev.includes(regionLabel);
      const next = exists
        ? prev.length > 1
          ? prev.filter((r) => r !== regionLabel)
          : prev
        : [...prev, regionLabel].slice(0, 5);
      setRegionFocus(next.join(", "));
      if (unitIssues.length > 0) setPreviousIssuesSnapshot(unitIssues);
      const reclustered = clusterArticlesIntoFiveIssues(newsPool, {
        cadence,
        preferredRegions: next,
        preferredChannels,
        dealKeywords: deals
          .filter((d) => selectedDealIds.includes(d.id))
          .map((d) => d.title),
      });
      setUnitIssues(reclustered);
      persistLocalDraft({ preferredRegions: next, unitIssues: reclustered });
      return next;
    });
  };

  const handleTogglePreferredChannel = (channelId: SpecificNewsChannelId) => {
    setPreferredChannels((prev) => {
      const exists = prev.includes(channelId);
      const next = exists
        ? prev.length > 1
          ? prev.filter((c) => c !== channelId)
          : prev
        : [...prev, channelId];
      if (unitIssues.length > 0) setPreviousIssuesSnapshot(unitIssues);
      const reclustered = clusterArticlesIntoFiveIssues(newsPool, {
        cadence,
        preferredRegions,
        preferredChannels: next,
        dealKeywords: deals
          .filter((d) => selectedDealIds.includes(d.id))
          .map((d) => d.title),
      });
      setUnitIssues(reclustered);
      persistLocalDraft({ preferredChannels: next, unitIssues: reclustered });
      return next;
    });
  };

  const handleAiClusterIssues = async (
    overrideRegions?: readonly string[],
    overrideChannels?: readonly SpecificNewsChannelId[],
  ) => {
    if (isAiClustering) return;
    setIsAiClustering(true);
    const activeRegions = overrideRegions ?? preferredRegions;
    const activeChannels = overrideChannels ?? preferredChannels;
    const activeDealTitles = deals
      .filter((d) => selectedDealIds.includes(d.id))
      .map((d) => `${d.title} ${d.address}`);

    if (unitIssues.length > 0) setPreviousIssuesSnapshot(unitIssues);

    try {
      const { unitIssues: nextIssues, isAi } = await requestAiNewsClusterIssues({
        cadence,
        preferredRegions: activeRegions,
        preferredChannels: activeChannels,
        dealTitles: activeDealTitles,
        newsPool,
      });
      setUnitIssues(nextIssues);
      persistLocalDraft({ unitIssues: nextIssues });
      setStatusBanner({
        tone: "success",
        message: isAi
          ? "내 주력 권역과 관심 분야에 맞춰 핵심 이슈 포스트잇 5선을 새로 구성했어요."
          : "내 주력 권역과 관심 분야 기반으로 핵심 이슈 5선을 구성했어요.",
      });
    } finally {
      setIsAiClustering(false);
    }
  };

  const handleSavePreferencesAndCluster = async () => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    try {
      const prefRes = await fetch("/api/broker/magazine/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredRegions,
          preferredChannels,
        }),
      }).then(
        (r) => r,
        () => null,
      );
      if (prefRes && !prefRes.ok) {
        setStatusBanner({
          tone: "error",
          message:
            "권역·관심 분야 설정을 서버에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      await handleAiClusterIssues(preferredRegions, preferredChannels);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRefreshLiveChannel = async (channel: NewsChannelId) => {
    try {
      const qs = new URLSearchParams({
        channel,
        live: "1",
        regions: preferredRegions.join(","),
        channels: preferredChannels.join(","),
      });
      const res = await fetch(`/api/broker/magazine/news-channels?${qs.toString()}`);
      if (!res.ok) return;
      const json = (await res.json().then(
        (v) => v,
        () => null,
      )) as { ok: true; items?: NewsPoolItem[] } | null;
      if (json?.ok && Array.isArray(json.items) && json.items.length > 0) {
        setNewsPool((prev) => mergeIncomingNewsPool(prev, json.items ?? [], channel));
      }
    } catch {
      // ignore network error
    }
  };

  // Step 3 구독자 일괄 등록 완료 시 subscriberCount 즉시 갱신 + 서버 최신 집계 반영
  const handleBulkSubscribersImported = useCallback((result: BulkImportApiResult) => {
    const added =
      typeof result.subscriberAddedCount === "number" && result.subscriberAddedCount > 0
        ? result.subscriberAddedCount
        : typeof result.importedCount === "number" && result.importedCount > 0
          ? result.importedCount
          : 0;
    if (added > 0) {
      setSubscriberCount((prev) => prev + added);
    }
    setStatusBanner({
      tone: "success",
      message:
        added > 0
          ? `구독 고객 ${added}명을 등록했습니다. 이제 바로 뉴스레터를 보낼 수 있어요.`
          : "고객 명단 등록을 완료했습니다.",
    });

    if (typeof fetch !== "undefined") {
      void fetch("/api/magazine/editions?broker_id=me&type=all&limit=50")
        .then((res) => (res && res.ok ? res.json() : null), () => null)
        .then((raw) => {
          if (!raw || typeof raw !== "object") return;
          const edJson = raw as Record<string, unknown>;
          if (typeof edJson.subscriberCount === "number") {
            const srvCount = edJson.subscriberCount;
            setSubscriberCount((prev) => Math.max(prev, srvCount));
          }
          if (typeof edJson.highInterestCount === "number") {
            setHighInterestCount(edJson.highInterestCount);
          }
        });
    }
  }, []);

  // ── 파생 데이터 및 양방향 미리보기 동기화 ──
  const selectedDeals = useMemo(
    () => deals.filter((d) => selectedDealIds.includes(d.id)),
    [deals, selectedDealIds],
  );
  const isSectionEnabled = useCallback(
    (id: string) => {
      const found = sections.find((s) => s.id === id);
      return found ? found.enabled : true;
    },
    [sections],
  );
  const formattedPreviewBriefing = useMemo(
    () => normalizeMarketBriefingPlain(normalizeReadableBriefingText(briefingBody), 500, 5),
    [briefingBody],
  );

  const hasBrokerAuthoredContent = Boolean(
    headline.trim() ||
      briefingBody.trim() ||
      selectedDealIds.length > 0 ||
      marketTemp !== null ||
      monthlyCharts.some((c) => c.sourceMode === "broker_custom") ||
      editionId !== null,
  );

  const previewLifecycle: PreviewLifecycleState = isPublished
    ? saveState === "dirty" || saveState === "error" || saveState === "conflict" || localStorageMode === "local_only"
      ? "published_dirty"
      : "published_clean"
    : !hasBrokerAuthoredContent
      ? "pre_generation"
      : "live_draft";

  const editorSyncUnits = useMemo<Record<string, EditorUnitTarget<NewsletterStepKey>>>(
    () =>
      buildNewsletterEditorSyncUnits({
        deals,
        selectedDealIds,
        isSectionEnabled,
        onEnableSection: (id) => handleToggleSection(id, true),
        onOpenStatTune: () => setStatTuneOpen(true),
        onShowBrokerProfileNotice: () =>
          setStatusBanner({
            tone: "info",
            message:
              "담당 중개사 이름·사무소·연락처는 상단 [내 정보] 프로필 설정(/broker/profile)에서 수정할 수 있습니다.",
          }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cadence, deals, selectedDealIds, isSectionEnabled],
  );

  const selectStepFromSync = useCallback((nextTab: NewsletterStepKey) => {
    setActiveStep(nextTab);
    setStatusBanner(null);
  }, []);

  const sync = useEditorPreviewSync<NewsletterStepKey>({
    units: editorSyncUnits,
    onSelectTab: selectStepFromSync,
  });

  // ── 11. 정직한 링크 복사 · 카카오톡 공유 · 통합 발송 ──
  const handleCopyLink = async () => {
    const existingUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);
    const needsServerSave =
      !existingUrl ||
      !isPublished ||
      saveState === "dirty" ||
      saveState === "error" ||
      saveState === "conflict";

    if (needsServerSave && !headline.trim()) {
      setActiveStep("title");
      setStatusBanner({
        tone: "error",
        message: "표지 제목을 입력하면 바로 보낼 수 있어요",
      });
      return;
    }

    if (!needsServerSave && existingUrl) {
      const copied = await copyText(existingUrl);
      if (copied) {
        setStatusBanner({ tone: "success", message: "링크를 복사했어요" });
      } else {
        setStatusBanner({
          tone: "error",
          message: COPY_FAILED_MESSAGE,
          fallbackUrl: existingUrl,
        });
      }
      return;
    }

    let saveErrorBanner: StatusBannerState | null = null;
    const { ok, text: resolvedCopiedUrl } = await copyTextFromPromise(async () => {
      const saved = await handleServerSave({ saveAsDraft: false });
      if (!saved.ok || !saved.publicUrl) {
        saveErrorBanner = saved.errorBanner ?? {
          tone: "error",
          message: "아직 뉴스레터 주소를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        };
        return null;
      }
      return appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
    });

    if (saveErrorBanner) {
      setStatusBanner(saveErrorBanner);
      return;
    }

    if (ok) {
      setStatusBanner({ tone: "success", message: "링크를 복사했어요" });
    } else {
      setStatusBanner({
        tone: "error",
        message: COPY_FAILED_MESSAGE,
        fallbackUrl: resolvedCopiedUrl ?? undefined,
      });
    }
  };

  const handleCopyKakaoGreeting = async () => {
    if (!headline.trim()) {
      setActiveStep("title");
      setStatusBanner({
        tone: "error",
        message: "표지 제목을 입력하면 바로 보낼 수 있어요",
      });
      return;
    }

    const existingUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);
    const needsServerSave =
      !existingUrl ||
      !isPublished ||
      saveState === "dirty" ||
      saveState === "error" ||
      saveState === "conflict";

    if (!needsServerSave && existingUrl) {
      const greetingText = buildNewsletterKakaoGreeting({
        headline: headline.trim(),
        briefingBody,
        publicUrl: existingUrl,
        brokerName,
        brokerOffice,
        brokerPhone,
      });
      const copied = await copyText(greetingText);
      if (copied) {
        setStatusBanner({ tone: "success", message: "카카오톡 인사말을 복사했어요" });
      } else {
        setStatusBanner({
          tone: "error",
          message: COPY_FAILED_MESSAGE,
          fallbackUrl: existingUrl,
        });
      }
      return;
    }

    let saveErrorBanner: StatusBannerState | null = null;
    let resolvedTargetUrl: string | undefined;
    const { ok } = await copyTextFromPromise(async () => {
      const saved = await handleServerSave({ saveAsDraft: false });
      if (!saved.ok || !saved.publicUrl) {
        saveErrorBanner = saved.errorBanner ?? {
          tone: "error",
          message: "아직 뉴스레터 주소를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        };
        return null;
      }
      const nextUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
      if (!nextUrl) return null;
      resolvedTargetUrl = nextUrl;
      return buildNewsletterKakaoGreeting({
        headline: headline.trim(),
        briefingBody,
        publicUrl: nextUrl,
        brokerName,
        brokerOffice,
        brokerPhone,
      });
    });

    if (saveErrorBanner) {
      setStatusBanner(saveErrorBanner);
      return;
    }

    if (ok) {
      setStatusBanner({ tone: "success", message: "카카오톡 인사말을 복사했어요" });
    } else {
      setStatusBanner({
        tone: "error",
        message: COPY_FAILED_MESSAGE,
        fallbackUrl: resolvedTargetUrl,
      });
    }
  };

  const handleKakaoShare = async () => {
    if (!headline.trim()) {
      setActiveStep("title");
      setStatusBanner({
        tone: "error",
        message: "표지 제목을 입력하면 바로 보낼 수 있어요",
      });
      return;
    }

    let targetUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);
    let shareIssueDate = issueDateStr;
    const needsServerSave =
      !targetUrl || !isPublished || saveState === "dirty" || saveState === "error" || saveState === "conflict";
    if (needsServerSave) {
      const saved = await handleServerSave({ saveAsDraft: false });
      if (!saved.ok || !saved.publicUrl) {
        setStatusBanner(
          saved.errorBanner ?? {
            tone: "error",
            message: "뉴스레터 저장에 실패해 공유 창을 열지 못했어요. 잠시 후 다시 눌러 주세요.",
          },
        );
        return;
      }
      targetUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
      shareIssueDate = saved.savedIssueDate || issueDateStr;
    }

    const briefingSnippet = briefingBody.trim().replace(/\s+/g, " ").slice(0, 80);
    const pubBase = resolvePublicBaseUrl() ?? getSiteOrigin();
    const ogSlug = decodeURIComponent(
      brokerSlug.trim() || targetUrl?.match(/\/magazine\/([^/?#]+)/)?.[1] || "magazine",
    );
    const shareOutcome = await shareKakaoFeed({
      title: headline.trim(),
      description: briefingSnippet || `${autoMeta.yearMonthLabel} 뉴스레터`,
      imageUrl: buildOgImageUrl({ baseUrl: pubBase, slug: ogSlug, date: shareIssueDate }),
      url: targetUrl!,
      buttonTitle: "뉴스레터 열기",
    });

    if (shareOutcome === "kakao") {
      setStatusBanner({ tone: "success", message: "카카오톡 공유 창을 열었어요" });
    } else if (shareOutcome === "copied") {
      setStatusBanner({ tone: "success", message: "링크를 복사했어요" });
    } else {
      setStatusBanner({
        tone: "error",
        message: COPY_FAILED_MESSAGE,
        fallbackUrl: targetUrl ?? undefined,
      });
    }
  };

  const handlePublishWebOnly = async (opts?: { scheduleMorning?: boolean }) => {
    if (sending) return;
    const briefingOn = isSectionEnabled("field_note");
    const dealsOn = isSectionEnabled("featured_deals");
    const newsOn = isSectionEnabled("news_curation");

    const hint = getNextPublishHint({
      headline,
      briefingBody,
      dealCount: selectedDealIds.length,
      newsCount: newsOn ? unitIssues.length : 0,
      briefingEnabled: briefingOn,
      dealsEnabled: dealsOn,
      newsEnabled: newsOn,
    });

    if (hint) {
      setActiveStep(hint.targetStep);
      setStatusBanner({ tone: "error", message: hint.message });
      return;
    }

    setSending(true);
    setStatusBanner(null);

    try {
      const today = todayKst();
      const prevPublishedKst = selectedSavedEdition?.publishedAt
        ? toKstDate(new Date(selectedSavedEdition.publishedAt))
        : null;
      const shouldRefreshDate =
        !isPublished ||
        issueDateStr < today ||
        (prevPublishedKst !== null && prevPublishedKst < today);
      const saved = await handleServerSave({
        saveAsDraft: false,
        refreshPublishDate: shouldRefreshDate,
      });
      const nextUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
      if (!saved.ok || !nextUrl) {
        setStatusBanner(
          saved.errorBanner ?? {
            tone: "error",
            message: "뉴스레터 웹 발행에 실패했어요. 잠시 후 다시 시도해 주세요.",
          },
        );
        return;
      }
      setStatusBanner({
        tone: "success",
        message: opts?.scheduleMorning
          ? "웹 발행을 완료했습니다. 오전 08:30 정규 발송 기준에 맞춰 안전하게 전달할 수 있어요."
          : "웹 링크 발행을 완료했어요. 아래 복사 버튼으로 카카오톡·문자에 바로 전달하세요.",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendSelected = async () => {
    if (sending) return;

    const briefingOn = isSectionEnabled("field_note");
    const dealsOn = isSectionEnabled("featured_deals");
    const newsOn = isSectionEnabled("news_curation");

    const hint = getNextPublishHint({
      headline,
      briefingBody,
      dealCount: selectedDealIds.length,
      newsCount: newsOn ? unitIssues.length : 0,
      briefingEnabled: briefingOn,
      dealsEnabled: dealsOn,
      newsEnabled: newsOn,
    });

    if (hint) {
      setActiveStep(hint.targetStep);
      setStatusBanner({ tone: "error", message: hint.message });
      return;
    }

    setSending(true);
    setStatusBanner(null);

    try {
      const today = todayKst();
      const prevPublishedKst = selectedSavedEdition?.publishedAt
        ? toKstDate(new Date(selectedSavedEdition.publishedAt))
        : null;
      const shouldRefreshDate =
        !isPublished ||
        issueDateStr < today ||
        (prevPublishedKst !== null && prevPublishedKst < today);
      const saved = await handleServerSave({
        saveAsDraft: false,
        refreshPublishDate: shouldRefreshDate,
      });
      const publicUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
      if (!saved.ok || !publicUrl) {
        setStatusBanner(
          saved.errorBanner ?? {
            tone: "error",
            message: "뉴스레터를 발행하지 못했어요. 잠시 후 다시 시도해 주세요.",
          },
        );
        return;
      }

      const briefingSnippet = briefingBody.trim().replace(/\s+/g, " ").slice(0, 80);
      setDistributeOutcome(null);
      const { distAttempted, distStatus, distJson, outcome } =
        await dispatchEditionDistribution({
          savedEditionId: saved.savedEditionId,
          savedIssueDate: saved.savedIssueDate,
          cadence,
          headline,
          briefingSnippet,
          marketTemp,
          targetSegment,
          effectiveSlotSlug,
          publicUrl,
          isUuidLike,
        });
      if (outcome) {
        setDistributeOutcome(outcome);
      }

      const sentCount = outcome?.sent ?? 0;
      const queuedCount = outcome?.queued ?? 0;
      const shouldSkipAutoKakaoShare = distAttempted && sentCount === 0 && queuedCount === 0;
      const pubBase = resolvePublicBaseUrl() ?? getSiteOrigin();
      const ogSlug = decodeURIComponent(
        brokerSlug.trim() || publicUrl.match(/\/magazine\/([^/?#]+)/)?.[1] || "magazine",
      );
      const shareResult = shouldSkipAutoKakaoShare
        ? "skipped"
        : await shareKakaoFeed({
            title: headline.trim(),
            description: briefingSnippet || `${autoMeta.yearMonthLabel} 뉴스레터`,
            imageUrl: buildOgImageUrl({
              baseUrl: pubBase,
              slug: ogSlug,
              date: saved.savedIssueDate || issueDateStr,
            }),
            url: publicUrl,
            buttonTitle: "뉴스레터 열기",
          });

      setStatusBanner(
        resolveSendCompletionBanner({
          distStatus,
          distJson,
          outcome,
          shareResult,
          publicUrl,
        }),
      );
      setActiveStep("send");
    } finally {
      setSending(false);
    }
  };

  const selectedSavedEdition = editionId
    ? editions.find((e) => e.id === editionId) ?? null
    : null;

  // 1열: <EditionAirtableList /> 호환 슬롯 (EditionListSidebar 분리)
  const listSlot = (
    <EditionListSidebar
      editions={editions}
      editionId={editionId}
      cadence={cadence}
      yearMonthLabel={autoMeta.yearMonthLabel}
      editionCadenceFilter={editionCadenceFilter}
      onChangeEditionCadenceFilter={setEditionCadenceFilter}
      editionStatusFilter={editionStatusFilter}
      onChangeEditionStatusFilter={setEditionStatusFilter}
      editionSearchQuery={editionSearchQuery}
      onChangeEditionSearchQuery={setEditionSearchQuery}
      listViewMode={listViewMode}
      onChangeListViewMode={setListViewMode}
      onStartNewThisMonth={() => handleStartNewThisMonth()}
      onChangeCadence={handleChangeCadence}
      onSelectExistingEdition={handleSelectExistingEdition}
      onDuplicateEdition={handleDuplicateEdition}
      onRequestDeleteEdition={handleRequestDeleteEdition}
    />
  );

  const activeReaderPreviewUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);

  // 2열: 3단계 통합 편집 슬롯
  const editorSlot = (
    <div
      data-testid="magazine-editor-slot"
      className="p-4 sm:p-6 space-y-5 text-slate-900"
    >
      <div data-testid="magazine-three-column-layout" className="space-y-5">
        <div
          data-testid="editor-mode-bar"
          className="space-y-2"
        >
          <div
            role="tablist"
            aria-label="뉴스레터 작성 4단계"
            className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs"
          >
            {STEP_TABS.map((tab) => {
              const selected = activeStep === tab.key;
              const isDone =
                tab.key === "title"
                  ? headline.trim().length > 0
                  : tab.key === "content"
                    ? briefingBody.trim().length > 0 || selectedDealIds.length > 0
                    : tab.key === "send"
                      ? isPublished && saveState === "saved"
                      : false;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`newsletter-tab-${tab.key}`}
                  aria-selected={selected}
                  aria-controls={`newsletter-panel-${tab.key}`}
                  data-testid={`step-tab-${tab.key}`}
                  onClick={() => handleSelectStep(tab.key)}
                  className={`min-h-[48px] rounded-xl px-2.5 py-2 text-base font-extrabold transition flex flex-wrap items-center justify-center gap-1.5 overflow-hidden cursor-pointer ${
                    selected
                      ? "border-2 border-blue-500 bg-blue-50/90 text-blue-950 shadow-2xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="break-keep">{tab.label}</span>
                  {isDone && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-900 shrink-0">
                      완료
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 min-h-[48px]">

            <button
              type="button"
              data-testid="magazine-insights-open-btn"
              onClick={() => handleSelectStep("history")}
              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50 shrink-0 cursor-pointer"
            >
              <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>구독자·성과</span>
            </button>

            <button
              type="button"
              data-testid="newsletter-draft-save-btn"
              disabled={saveState === "saving"}
              onClick={() => void handleDraftSaveClick()}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-extrabold shadow-2xs transition disabled:opacity-60 ${
                isPublished && previewLifecycle === "published_dirty"
                  ? "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
                  : isPublished && previewLifecycle === "published_clean"
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/70"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {saveState === "saving"
                  ? "저장 중…"
                  : isPublished
                    ? previewLifecycle === "published_dirty"
                      ? "발행본에 수정 반영"
                      : "저장됨 ✓"
                    : "임시저장"}
              </span>
            </button>
          </div>
        </div>

        <MagazineStatusBanner
          statusBanner={statusBanner}
          suppressUrlInput={
            activeStep === "send" &&
            isPublished &&
            Boolean(activeReaderPreviewUrl)
          }
        />

        {isPublished && activeReaderPreviewUrl && activeStep !== "send" && (
          <div
            data-testid="newsletter-inline-live-bar"
            className="xl:hidden flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-bold text-slate-900">
                {previewLifecycle === "published_dirty"
                  ? "발행본에 아직 반영되지 않은 수정이 있습니다"
                  : "공개 독자 화면 링크"}
              </p>
              <p className="truncate font-mono text-sm text-slate-600">
                {activeReaderPreviewUrl}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {previewLifecycle === "published_dirty" && (
                <button
                  type="button"
                  data-testid="newsletter-inline-resync-btn"
                  disabled={sending || saveState === "saving"}
                  onClick={() => void handleServerSave({ saveAsDraft: false })}
                  className="min-h-[44px] rounded-xl bg-slate-900 px-3 py-2 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  발행본에 수정 반영
                </button>
              )}
              <a
                href={activeReaderPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="newsletter-inline-live-link"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100"
              >
                공개 화면 열기 ↗
              </a>
              <button
                type="button"
                data-testid="newsletter-inline-copy-btn"
                onClick={() => void handleCopyLink()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                복사
              </button>
            </div>
          </div>
        )}

        {activeStep === "title" && (
          <NewsletterTitleStepPanel
            issueYear={issueYear}
            issueMonth={issueMonth}
            cadence={cadence}
            issueDateStr={issueDateStr}
            yearMonthLabel={autoMeta.yearMonthLabel}
            brokerName={brokerName}
            headline={headline}
            summary={summary}
            briefingTitle={briefingTitle}
            briefingBody={briefingBody}
            marketTemp={marketTemp}
            regionFocus={regionFocus}
            onChangeRegionFocus={setRegionFocus}
            preferredRegions={preferredRegions}
            preferredChannels={preferredChannels}
            selectedDealTitles={selectedDeals.map((d) => d.title)}
            unitIssueTitles={unitIssues.map((u) => u.title)}
            isPrefsOpen={isPrefsOpen}
            onTogglePrefsOpen={() => setIsPrefsOpen((prev) => !prev)}
            canUndoRecluster={previousIssuesSnapshot !== null}
            onUndoRecluster={handleUndoReclusterIssues}
            savingPrefs={savingPrefs}
            isAiClustering={isAiClustering}
            onSavePreferencesAndCluster={() => void handleSavePreferencesAndCluster()}
            onTogglePreferredRegion={handleTogglePreferredRegion}
            onTogglePreferredChannel={handleTogglePreferredChannel}
            onChangeCadence={handleChangeCadence}
            onChangeIssueDate={handleChangeIssueDate}
            onChangeYearMonth={(meta: AutoIssueMetadata) => {
              persistCurrentSlotIfDirty();
              setDraftSlotSlugOverride(null);
              setIssueYear(meta.year);
              setIssueMonth(meta.month);
              const existingMatch = findEditionFor("monthly", meta.slug);
              if (existingMatch) {
                applyEditionToEditorState(existingMatch);
                return;
              }
              const freshIssueDate = todayKst();
              setEditionId(null);
              setIsPublished(false);
              setPublishedUrl(null);
              setIssueDateStr(freshIssueDate);
              persistLocalDraft({
                editionId: null,
                slotSlug: null,
                issueYear: meta.year,
                issueMonth: meta.month,
                issueDateStr: freshIssueDate,
              });
              syncUrlParams(null, cadence);
            }}
            onChangeHeadline={(val) => {
              setHeadline(val);
              persistLocalDraft({ headline: val });
            }}
            onChangeMarketTemp={(nextTemp) => {
              setMarketTemp(nextTemp);
              persistLocalDraft({ marketTemp: nextTemp });
            }}
            onApplyDraft={(next: MagazineDraftSnapshot) => {
              const nextHeadline = formatSingleLineTitle(next.headline, 50);
              const nextBriefing = normalizeMarketBriefingPlain(
                next.briefingBody,
                500,
                5,
              );
              setHeadline(nextHeadline);
              setSummary("");
              setBriefingTitle("");
              setBriefingBody(nextBriefing);
              persistLocalDraft({
                headline: nextHeadline,
                summary: "",
                briefingTitle: "",
                briefingBody: nextBriefing,
              });
            }}
            onNotifyEditorFocus={sync.notifyEditorFocus}
            onNextToContent={() => handleSelectStep("content")}
          />
        )}

        {activeStep === "content" && (
          <NewsletterContentStepPanel
            cadence={cadence}
            yearMonthLabel={autoMeta.yearMonthLabel}
            regionFocus={regionFocus}
            headline={headline}
            sections={sections}
            isSectionEnabled={isSectionEnabled}
            onToggleSection={handleToggleSection}
            monthlyRegion={monthlyRegion}
            monthlyPairId={monthlyPairId}
            monthlyCharts={monthlyCharts}
            monthlyLiveDbAvailable={monthlyLiveDbAvailable}
            onChangeMonthlyRegion={handleChangeMonthlyRegion}
            onChangeMonthlyPair={handleChangeMonthlyPair}
            onUpdateMonthlyChartField={handleUpdateMonthlyChartField}
            onResetMonthlyCharts={handleResetMonthlyCharts}
            statTuneOpen={statTuneOpen}
            onToggleStatTune={(next) => setStatTuneOpen((prev) => (next !== undefined ? next : !prev))}
            briefingBody={briefingBody}
            onChangeBriefingBody={(val) => {
              setBriefingBody(val);
              setBriefingTitle("");
              persistLocalDraft({
                summary: "",
                briefingTitle: "",
                briefingBody: val,
              });
            }}
            unitIssues={unitIssues}
            onChangeUnitIssues={(next) => {
              setUnitIssues(next);
              persistLocalDraft({ unitIssues: next });
            }}
            newsPool={newsPool}
            preferredRegions={preferredRegions}
            preferredChannels={preferredChannels}
            deals={deals}
            selectedDeals={selectedDeals}
            selectedDealIds={selectedDealIds}
            onToggleDeal={handleToggleDeal}
            dealComments={dealComments}
            onChangeDealComment={handleChangeDealComment}
            isAiClustering={isAiClustering}
            onAiClusterIssues={() => void handleAiClusterIssues()}
            onRefreshLiveChannel={handleRefreshLiveChannel}
            canUndoRecluster={previousIssuesSnapshot !== null}
            onUndoRecluster={handleUndoReclusterIssues}
            onOpenPreferences={() => {
              setIsPrefsOpen(true);
              setActiveStep("title");
            }}
            onNotifyEditorFocus={sync.notifyEditorFocus}
            onBackToTitle={() => handleSelectStep("title")}
            onNextToSend={() => handleSelectStep("send")}
          />
        )}

        {activeStep === "send" && (
          <NewsletterSendStepPanel
            headline={headline}
            briefingBody={briefingBody}
            selectedDealCount={selectedDealIds.length}
            enabledNewsCount={isSectionEnabled("news_curation") ? unitIssues.length : 0}
            briefingEnabled={isSectionEnabled("field_note")}
            dealsEnabled={isSectionEnabled("featured_deals")}
            newsEnabled={isSectionEnabled("news_curation")}
            targetSegment={targetSegment}
            onChangeTargetSegment={(nextSeg) => {
              setTargetSegment(nextSeg);
              persistLocalDraft({ targetSegment: nextSeg });
            }}
            subscriberCount={subscriberCount}
            highInterestCount={highInterestCount}
            sending={sending}
            isPublished={isPublished}
            publicUrl={activeReaderPreviewUrl}
            distributeOutcome={distributeOutcome}
            onJumpToStep={(step) => handleSelectStep(step)}
            onNotifyEditorFocus={sync.notifyEditorFocus}
            onBulkSubscribersImported={handleBulkSubscribersImported}
            onKakaoShare={() => void handleKakaoShare()}
            onCopyLink={() => void handleCopyLink()}
            onCopyKakaoGreeting={() => void handleCopyKakaoGreeting()}
            onPublishWebOnly={(opts) => void handlePublishWebOnly(opts)}
            onBackToContent={() => handleSelectStep("content")}
            onSendSelected={() => void handleSendSelected()}
          />
        )}

        {activeStep === "history" && (
          <div
            id="newsletter-panel-history"
            role="tabpanel"
            aria-labelledby="newsletter-tab-history"
            className="space-y-5"
          >
            {/* 1. 이메일 수신확인형 발송·열람 내역 */}
            <section
              data-testid="newsletter-delivery-receipts-section"
              aria-label="발송 및 수신확인 내역"
              className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-700" aria-hidden="true" />
                    <h3 className="text-base font-extrabold text-slate-900">
                      발송 · 수신확인 내역
                    </h3>
                  </div>
                  <p className="text-sm font-medium text-slate-600">
                    구독자별 발송 시각과 개인 링크 열람(수신확인) 여부를 바로 확인합니다.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-800">
                    전체 {historyReceipts.length}건
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-900">
                    열람 {historyReceipts.filter((r) => r.status === "opened").length}건
                  </span>
                  <button
                    type="button"
                    data-testid="history-receipts-refresh-btn"
                    onClick={() => void fetchHistoryAnalytics()}
                    disabled={historyLoading}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${historyLoading ? "animate-spin text-blue-700" : ""}`}
                      aria-hidden="true"
                    />
                    <span>새로고침</span>
                  </button>
                </div>
              </div>

              {historyDistributions.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {historyDistributions.slice(0, 3).map((d, idx) => (
                    <span
                      key={`${d.createdAt ?? d.date ?? idx}-${idx}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-800"
                    >
                      <span>{d.issueDate || d.date || "최근 발송"}</span>
                      <span className="text-blue-800">발송 {d.sentCount}건</span>
                      {d.failedCount > 0 && (
                        <span className="text-rose-700">· 실패 {d.failedCount}건</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {historyError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
                >
                  {historyError}
                </div>
              ) : historyLoading && historyReceipts.length === 0 ? (
                <p className="py-4 text-sm font-medium text-slate-600">
                  발송 및 수신확인 기록을 불러오는 중입니다…
                </p>
              ) : historyReceipts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center space-y-2">
                  <p className="text-base font-bold text-slate-800">
                    아직 기록된 발송 · 수신확인 내역이 없습니다
                  </p>
                  <p className="text-sm font-medium text-slate-600">
                    3. 보내기 단계에서 구독자에게 발송하면 수신자별 발송 상태와 열람 시간이 이곳에 표시됩니다.
                  </p>
                </div>
              ) : (
                <ul
                  aria-label="수신자별 발송 및 열람 내역"
                  className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white"
                >
                  {historyReceipts.map((item) => {
                    const sentLabel = formatReceiptTimeKo(item.sentAt);
                    const openedLabel = formatReceiptTimeKo(item.openedAt);
                    return (
                      <li
                        key={item.id}
                        data-testid={`delivery-receipt-row-${item.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-base font-extrabold text-slate-900">
                            {item.recipientLabel}
                          </p>
                          <p className="truncate text-sm font-medium text-slate-600">
                            {item.editionLabel}
                            {sentLabel ? ` · 발송 ${sentLabel}` : ""}
                          </p>
                        </div>

                        {item.status === "opened" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-900 shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                            <span>
                              ✓ 열람 완료{openedLabel ? ` (${openedLabel})` : ""}
                            </span>
                          </span>
                        ) : item.status === "failed" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-extrabold text-rose-900 shrink-0">
                            <XCircle className="h-4 w-4 text-rose-700" aria-hidden="true" />
                            <span>발송 실패</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700 shrink-0">
                            <Clock className="h-4 w-4 text-slate-600" aria-hidden="true" />
                            <span>발송됨 (미열람)</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 2. 구독자 관리 · 발행 성과 요약 인라인 탭 */}
            <section
              aria-label="구독자 관리 및 발행 성과"
              className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
            >
              <div
                role="tablist"
                aria-label="구독자 및 발행 성과 보기 전환"
                className="flex gap-2 rounded-xl bg-slate-100 p-1"
              >
                {(
                  [
                    { key: "subscribers" as const, label: "구독자 관리" },
                    { key: "analytics" as const, label: "발행 성과 요약" },
                  ] as const
                ).map((sub) => (
                  <button
                    key={sub.key}
                    type="button"
                    role="tab"
                    data-testid={`history-subtab-${sub.key}`}
                    aria-selected={insightsTab === sub.key}
                    onClick={() => setInsightsTab(sub.key)}
                    className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-sm font-extrabold transition cursor-pointer ${
                      insightsTab === sub.key
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {insightsTab === "subscribers" ? (
                <EditorOutreachTab
                  brokerSlug={brokerSlug || "me"}
                  brokerName={brokerName || "공인중개사"}
                  baseUrl={resolvePublicBaseUrl() ?? getSiteOrigin()}
                  sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
                  sendDisabled={sendDisabled}
                  editionDate={issueDateStr}
                  shareTitle={headline}
                  deals={deals.map((d) => ({ id: d.id, title: d.title }))}
                />
              ) : (
                <EditorAnalyticsTab brokerDisplayName={brokerName || null} />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );

  // 3열: 실시간 뉴스레터 미리보기 슬롯
  const previewSlot = (
    <div
      data-testid="magazine-preview-slot"
      className="p-4 sm:p-5 space-y-4 text-slate-900"
    >
      <div
        className={
          previewLifecycle === "published_dirty"
            ? "sticky -top-4 z-20 -mx-4 -mt-4 bg-[#F5F5F7] px-4 pt-3 pb-2 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.18)]"
            : ""
        }
      >
        <PreviewCausalityBar
          lifecycle={previewLifecycle}
          onResyncPublished={() => void handleServerSave({ saveAsDraft: false })}
          isSyncing={sending || saveState === "saving"}
          liveUrl={isPublished ? activeReaderPreviewUrl : null}
          liveUrlLabel="공개 독자 화면 보기 ↗"
          liveLinkTestId="preview-live-reader-link"
          auxActionSlot={
            previewLifecycle === "published_dirty" && isPublished && activeReaderPreviewUrl ? (
              <a
                href={activeReaderPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="preview-live-reader-link"
                className="inline-flex min-h-[44px] items-center gap-1 px-2 text-sm font-extrabold text-blue-900 hover:underline whitespace-nowrap"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>공개 독자 화면</span>
              </a>
            ) : null
          }
        />
      </div>

      <NewsletterPreviewBody
        previewLifecycle={previewLifecycle}
        activeUnitId={sync.activeUnitId}
        onFocusEditorUnit={sync.focusEditorUnit}
        yearMonthLabel={autoMeta.yearMonthLabel}
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
        activeStep={activeStep}
        briefingBody={briefingBody}
        selectedDealCount={selectedDealIds.length}
        onJumpToStep={(step) => handleSelectStep(step)}
      />
    </div>
  );

  const primaryActionSlot = (
    <NewsletterPrimaryActionButton
      isPublished={isPublished}
      previewLifecycle={previewLifecycle}
      activeStep={activeStep}
      sending={sending}
      saveState={saveState}
      onDraftSaveClick={() => void handleDraftSaveClick()}
      onSelectSendStep={() => handleSelectStep("send")}
      onSendSelected={() => void handleSendSelected()}
    />
  );

  const handleManualSync = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (manualSyncBusyRef.current) return;
      manualSyncBusyRef.current = true;
      if (!opts?.silent) setIsManualSyncing(true);
      try {
        if (!isPublished && isUuidLike(editionId) && saveState !== "conflict") await autosave.saveNow();
        const res = await fetch("/api/magazine/editions?broker_id=me&type=all&limit=50", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const edJson = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!edJson) return;
        if (typeof edJson.subscriberCount === "number") {
          setSubscriberCount(edJson.subscriberCount);
        }
        if (typeof edJson.highInterestCount === "number") {
          setHighInterestCount(edJson.highInterestCount);
        }
        if (Array.isArray(edJson.editions)) {
          const currentSlug = brokerSlug || "";
          const mapped: SavedEditionSummary[] = edJson.editions
            .filter(
              (row): row is Record<string, unknown> => !!row && typeof row === "object"
            )
            .map((row) =>
              mapServerEditionRowToSummary(row, currentSlug, buildSafePublicUrl)
            );
          setEditions(mapped);
        }
      } catch {
        // ignore manual sync error
      } finally {
        manualSyncBusyRef.current = false;
        setIsManualSyncing(false);
      }
    },
    [autosave, brokerSlug, editionId, isPublished, saveState]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (/jsdom/i.test(navigator.userAgent || "")) return;
    const pullIfIdle = () => {
      if (document.visibilityState === "hidden") return;
      if (savingLockRef.current || saveState === "saving" || saveState === "conflict") return;
      const nowMs = Date.now();
      if (nowMs - lastAutoSyncPullAtRef.current < 2500) return;
      lastAutoSyncPullAtRef.current = nowMs;
      void handleManualSync({ silent: true });
    };
    document.addEventListener("visibilitychange", pullIfIdle);
    window.addEventListener("focus", pullIfIdle);
    return () => {
      document.removeEventListener("visibilitychange", pullIfIdle);
      window.removeEventListener("focus", pullIfIdle);
    };
  }, [handleManualSync, saveState]);

  return (
    <div data-local-draft-mode={localStorageMode}>
      <WorkspaceShell
        workspace="magazine"
        selectedBuildingId={editionId ?? `draft:${effectiveSlotSlug}`}
        selectedLabel={`${autoMeta.yearMonthLabel} 뉴스레터`}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        onRetrySave={() => {
          if (!isPublished && isUuidLike(editionId)) {
            void autosave.saveNow().then((ok) => {
              if (!ok) void handleServerSave({ saveAsDraft: true });
            });
            return;
          }
          void handleServerSave({ saveAsDraft: !isPublished });
        }}
        onResolveConflict={() => {
          if (!isPublished && isUuidLike(editionId)) {
            void autosave.overwriteNow().then((ok) => { if (!ok) void handleServerSave({ saveAsDraft: true }); });
            return;
          }
          void handleServerSave({ saveAsDraft: !isPublished });
        }}
        onManualSync={() => { void handleManualSync(); }}
        isSyncing={isManualSyncing}
        editorHeaderActions={
          selectedSavedEdition ? (
            <>
              <EditorHeaderActionButton
                testId="edition-header-duplicate-btn"
                label="복제"
                title={`${selectedSavedEdition.title || selectedSavedEdition.slug} 복제`}
                icon={<Copy className="h-4 w-4" aria-hidden="true" />}
                onClick={(e) => handleDuplicateEdition(selectedSavedEdition, e)}
              />
              <EditorHeaderActionButton
                testId="edition-header-delete-btn"
                label="삭제"
                title={`${selectedSavedEdition.title || selectedSavedEdition.slug} 삭제`}
                tone="danger"
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                onClick={(e) => handleRequestDeleteEdition(selectedSavedEdition, e)}
              />
            </>
          ) : null
        }
        primaryActionSlot={primaryActionSlot}
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
      />

      <EditionDeleteModal
        targetEdition={pendingDeleteEdition}
        onCancel={() => setPendingDeleteEdition(null)}
        onConfirm={() => void handleConfirmDeleteEdition()}
      />
    </div>
  );
}

export default function MagazineEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F5F7] text-base font-bold text-slate-700">
          뉴스레터 화면을 불러오는 중입니다…
        </div>
      }
    >
      <UndoToastProvider>
        <MagazineEditorWorkspace />
      </UndoToastProvider>
    </Suspense>
  );
}
