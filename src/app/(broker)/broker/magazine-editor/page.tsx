"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, BarChart3, CheckCircle2, ExternalLink, Loader2, Save, Send } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  useEditorPreviewSync, PreviewCausalityBar, PreviewPregenerationCard,
  type PreviewLifecycleState, type EditorUnitTarget,
} from "@/components/workspace/preview-sync";
import { SelectedItemActions } from "@/components/workspace/list/WorkspaceList";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import {
  getLastActiveBrokerUserId, purgeWorkspaceClientStorage, readScopedWorkspaceJson,
  removeScopedWorkspaceKey, resolveBrowserBrokerUserId, syncActiveBrokerSessionStorage, writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import type { AutoIssueMetadata } from "@/components/magazine-editor/IssueMetadataForm";
import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import {
  MagazinePublishChecklist,
  getNextPublishHint,
} from "@/components/magazine-editor/MagazinePublishChecklist";
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
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
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
import { NewsletterPreviewCard } from "./_components/NewsletterPreviewCard";
import { NewsletterInsightsModal } from "./_components/NewsletterInsightsModal";
import { useNewsletterServerDraftSync } from "./_hooks/useNewsletterServerDraftSync";

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
  { key: "title", label: "① 제목", shortDesc: "연·월 선택 및 표지 제목" },
  { key: "content", label: "② 내용", shortDesc: "시장 브리핑과 추천 매물" },
  { key: "send", label: "③ 보내기", shortDesc: "받을 고객 확인 및 발송" },
] as const;

function MagazineEditorWorkspace() {
  const router = useRouter();
  const pathname = usePathname() || "/broker/magazine-editor";
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  // ── 1. 단계 및 기본 메타 상태 ──
  const [activeStep, setActiveStep] = useState<NewsletterStepKey>("title");
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
  const [regionFocus, setRegionFocus] = useState<string>("강남·서초");
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
  const [isInsightsOpen, setIsInsightsOpen] = useState<boolean>(false);
  const [insightsTab, setInsightsTab] = useState<"subscribers" | "analytics">("subscribers");
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

  const syncUrlParams = useCallback(
    (
      nextEditionId: string | null,
      nextCadence: NewsletterCadence | "special",
      opts?: { openMobileEditor?: boolean },
    ) => {
      try {
        const baseSearch =
          typeof window !== "undefined" && window.location.search
            ? window.location.search
            : searchParams?.toString?.() ?? "";
        const params = new URLSearchParams(baseSearch);
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
      const nextCadence =
        typeof parsed.cadence === "string"
          ? normalizeNewsletterCadence(parsed.cadence)
          : "monthly";
      const parsedPrefs =
        Array.isArray(parsed.preferredRegions) && parsed.preferredRegions.length > 0
          ? normalizeBrokerPreferences({
              preferredRegions: parsed.preferredRegions,
              preferredChannels: parsed.preferredChannels,
            })
          : {
              preferredRegions: [...DEFAULT_PREFERRED_REGIONS],
              preferredChannels: [...DEFAULT_PREFERRED_CHANNELS],
            };
      if (parsed.isExplicitNewSlot === true) {
        setCadence(nextCadence);
        if (typeof parsed.issueYear === "number") setIssueYear(parsed.issueYear);
        if (typeof parsed.issueMonth === "number") setIssueMonth(parsed.issueMonth);
        if (isValidIsoDate(parsed.issueDateStr)) setIssueDateStr(parsed.issueDateStr);
        setDraftSlotSlugOverride(
          typeof parsed.slotSlug === "string" && parsed.slotSlug.trim()
            ? parsed.slotSlug.trim()
            : null,
        );
        setEditionId(null);
        setHeadline("");
        setSummary("");
        setBriefingTitle("");
        setBriefingBody("");
        setMarketTemp(null);
        setSelectedDealIds([]);
        setDealComments({});
        setSections(buildDefaultEditorSections(nextCadence));
        setMonthlyPairId("molit_bok");
        setMonthlyCharts(buildDefaultMonthlyGraphicPair("gbd", "molit_bok"));
        setUnitIssues(
          clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
            cadence: nextCadence,
            preferredRegions: parsedPrefs.preferredRegions,
            preferredChannels: parsedPrefs.preferredChannels,
          }),
        );
        setIsPublished(false);
        setPublishedUrl(null);
        setLocalStorageMode("none");
        setSaveState("idle");
        setLastSavedAt(null);
        setHasUserEditedDraft(false);
        return;
      }

      if (typeof parsed.headline === "string") setHeadline(parsed.headline);
      if (typeof parsed.summary === "string") setSummary(parsed.summary);
      if (typeof parsed.briefingTitle === "string") setBriefingTitle(parsed.briefingTitle);
      if (typeof parsed.briefingBody === "string") setBriefingBody(parsed.briefingBody);
      if (typeof parsed.issueYear === "number") setIssueYear(parsed.issueYear);
      if (typeof parsed.issueMonth === "number") setIssueMonth(parsed.issueMonth);
      if (typeof parsed.cadence === "string") setCadence(nextCadence);
      if (isValidIsoDate(parsed.issueDateStr)) setIssueDateStr(parsed.issueDateStr);
      if (typeof parsed.slotSlug === "string" && parsed.slotSlug.trim()) {
        setDraftSlotSlugOverride(parsed.slotSlug.trim());
      } else {
        setDraftSlotSlugOverride(null);
      }
      if (typeof parsed.marketTemp === "string" || parsed.marketTemp === null) {
        setMarketTemp((parsed.marketTemp as MarketTemperature | null) ?? null);
      }
      const normMonthly = normalizeMonthlyRegion(parsed.monthlyRegion) ?? "gbd";
      const normPair = normalizeMonthlyPairId(parsed.monthlyPairId);
      setMonthlyRegion(normMonthly);
      setMonthlyPairId(normPair);
      const restoredCharts = normalizeSavedMonthlyCharts(parsed.monthlyCharts);
      setMonthlyCharts(
        restoredCharts ?? buildDefaultMonthlyGraphicPair(normMonthly, normPair),
      );

      const normSections = normalizeEditorSections(parsed.sections, nextCadence);
      setSections(normSections ?? buildDefaultEditorSections(nextCadence));
      const normSegment = normalizeTargetSegment(parsed.targetSegment);
      if (normSegment) setTargetSegment(normSegment);

      if (Array.isArray(parsed.selectedDealIds)) {
        setSelectedDealIds(
          parsed.selectedDealIds.filter((v): v is string => typeof v === "string"),
        );
      }
      if (parsed.dealComments && typeof parsed.dealComments === "object") {
        const restoredComments: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.dealComments as Record<string, unknown>)) {
          if (typeof v === "string") restoredComments[k] = v;
        }
        setDealComments(restoredComments);
      }
      if (Array.isArray(parsed.preferredRegions) && parsed.preferredRegions.length > 0) {
        const normPrefs = normalizeBrokerPreferences({
          preferredRegions: parsed.preferredRegions,
          preferredChannels: parsed.preferredChannels,
        });
        setPreferredRegions(normPrefs.preferredRegions);
        setPreferredChannels(normPrefs.preferredChannels);
        setRegionFocus(normPrefs.preferredRegions.join(", "));
      }
      const effectiveSections = normSections ?? buildDefaultEditorSections(nextCadence);
      const newsEnabledInDraft = effectiveSections.some(
        (s) => s.id === "news_curation" && s.enabled,
      );
      const hasSavedServerEdition =
        typeof parsed.editionId === "string" && parsed.editionId.trim().length > 0;

      if (Array.isArray(parsed.unitIssues)) {
        if (parsed.unitIssues.length > 0) {
          const restoredIssues = resolveUnitIssuesFromData(
            { unitIssues: parsed.unitIssues },
            { fallbackFromTopNews: false },
          );
          if (restoredIssues.length > 0) {
            setUnitIssues(restoredIssues);
            restoredLocalIssuesRef.current = true;
          }
        } else if (!hasSavedServerEdition && newsEnabledInDraft) {
          setUnitIssues(
            clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
              cadence: nextCadence,
              preferredRegions: parsedPrefs.preferredRegions,
              preferredChannels: parsedPrefs.preferredChannels,
            }),
          );
          restoredLocalIssuesRef.current = true;
        } else {
          setUnitIssues([]);
          restoredLocalIssuesRef.current = true;
        }
      }

      if (typeof parsed.editionId === "string" && parsed.editionId) {
        setEditionId(parsed.editionId);
      } else if (parsed.editionId === null) {
        setEditionId(null);
      }

      if (parsed.serverPublished === true) {
        if (typeof parsed.publishedUrl === "string" && parsed.publishedUrl) {
          setPublishedUrl(parsed.publishedUrl);
        }
        setIsPublished(true);
        setLocalStorageMode("none");
        setSaveState("saved");
        if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt);
      } else if (parsed.serverSavedDraft === true) {
        setPublishedUrl(null);
        setIsPublished(false);
        setLocalStorageMode("none");
        setSaveState("saved");
        if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt);
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
          const activeScopeUid = resolveNewsletterScopeUid(
            brokerId,
            brokerSlug,
            scopeUidRef.current,
          );
          const payload: LocalNewsletterDraft = {
            ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
            brokerId: brokerId || activeScopeUid || undefined,
            brokerSlug: brokerSlug || undefined,
            editionId: targetEditionId,
            slotSlug: targetSlotSlug,
            headline: nextPatch?.headline ?? headline,
            summary: nextPatch?.summary ?? summary,
            briefingTitle: nextPatch?.briefingTitle ?? briefingTitle,
            briefingBody: nextPatch?.briefingBody ?? briefingBody,
            issueYear: targetYear,
            issueMonth: targetMonth,
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
            cadence: targetCadence,
            issueDateStr: targetDateStr,
            publishedUrl: isPublished ? publishedUrl : null,
            serverPublished: false,
            serverSavedDraft: false,
            isExplicitNewSlot: false,
            savedAt: new Date().toISOString(),
          };
          writeScopedWorkspaceJson(slotKey, activeScopeUid, payload);
          writeLastActiveSlotKey(activeScopeUid, slotKey);
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
      const activeScopeUid = resolveNewsletterScopeUid(
        brokerId,
        brokerSlug,
        scopeUidRef.current,
      );
      const currentSlotKey = makeSlotStorageKey(editionId, cadence, effectiveSlotSlug);
      const payload: LocalNewsletterDraft = {
        ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
        brokerId: brokerId || activeScopeUid || undefined,
        brokerSlug: brokerSlug || undefined,
        editionId,
        slotSlug: effectiveSlotSlug,
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
        publishedUrl: isPublished ? publishedUrl : null,
        serverPublished: false,
        serverSavedDraft: false,
        isExplicitNewSlot: false,
        savedAt: new Date().toISOString(),
      };
      writeScopedWorkspaceJson(currentSlotKey, activeScopeUid, payload);
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

      setEditionId(ed.id);
      setDraftSlotSlugOverride(null);
      const anchor = parseCadenceAnchor(
        ed.slug,
        ed.cadence === "special" ? "weekly" : ed.cadence,
      );
      setCadence(anchor.cadence);
      setIssueYear(anchor.year);
      setIssueMonth(anchor.month);
      setIssueDateStr(isValidIsoDate(ed.issueDate) ? ed.issueDate : anchor.dateStr);
      setHeadline(ed.title ?? "");
      setSummary(typeof ed.summary === "string" ? ed.summary : "");
      setBriefingTitle(typeof ed.briefingTitle === "string" ? ed.briefingTitle : "");
      setBriefingBody(typeof ed.briefingBody === "string" ? ed.briefingBody : "");
      setMarketTemp(ed.marketTemp ?? null);
      const nextRegion = ed.monthlyRegion ?? "gbd";
      const nextPair = ed.monthlyPairId ?? "molit_bok";
      setMonthlyRegion(nextRegion);
      setMonthlyPairId(nextPair);
      setMonthlyCharts(
        ed.monthlyCharts && ed.monthlyCharts.length > 0
          ? [...ed.monthlyCharts]
          : buildDefaultMonthlyGraphicPair(nextRegion, nextPair),
      );
      setSelectedDealIds(Array.isArray(ed.selectedDealIds) ? ed.selectedDealIds : []);
      setDealComments(
        ed.dealComments && typeof ed.dealComments === "object" ? ed.dealComments : {},
      );
      setUnitIssues(Array.isArray(ed.unitIssues) ? ed.unitIssues : []);
      setSections(
        ed.sections ? [...ed.sections] : buildDefaultEditorSections(anchor.cadence),
      );
      const resolvedSeg = ed.targetSegment ?? "all";
      setTargetSegment(resolvedSeg);

      const activeBrokerSlug = (opts?.effectiveSlugOverride ?? brokerSlug).trim();
      const resolvedPubUrl =
        appendTargetSegmentToUrl(ed.publicUrl, resolvedSeg) ||
        buildSafePublicUrl({
          brokerSlug: activeBrokerSlug,
          issueDate:
            ed.issueDate ||
            (ed.publishedAt && !Number.isNaN(new Date(ed.publishedAt).getTime())
              ? toKstDate(new Date(ed.publishedAt))
              : undefined),
          fallbackAnchorDate: anchor.dateStr,
          editionId: ed.id,
          targetSegment: resolvedSeg,
        });
      const publishedFlag = ed.status === "published";
      setIsPublished(publishedFlag);
      setPublishedUrl(publishedFlag ? resolvedPubUrl : null);
      setLocalStorageMode("none");
      setSaveState("saved");
      setLastSavedAt(ed.updatedAt ?? ed.publishedAt);
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
        syncUrlParams(ed.id, ed.cadence ?? anchor.cadence, {
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
      setEditions((prev) => {
        const nextEntry: SavedEditionSummary = {
          id: bootstrapped.editionId,
          slug: bootstrapped.editionLabel,
          title: headline.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
          status: "draft",
          updatedAt: nowIso,
          publishedAt: null,
          dealCount: selectedDealIds.length,
          hasBriefing: Boolean(briefingBody.trim() || summary.trim()),
          summary: summary.trim(),
          briefingTitle: briefingTitle.trim(),
          briefingBody: briefingBody.trim(),
          marketTemp,
          monthlyRegion,
          monthlyPairId,
          monthlyCharts: [...monthlyCharts],
          selectedDealIds: [...selectedDealIds],
          dealComments: { ...dealComments },
          unitIssues: [...unitIssues],
          sections: [...sections],
          targetSegment,
          issueDate: issueDateStr,
          cadence,
        };
        const exists = prev.some((e) => e.id === bootstrapped.editionId);
        return exists
          ? prev.map((e) => (e.id === bootstrapped.editionId ? nextEntry : e))
          : [nextEntry, ...prev];
      });
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
          prev.map((e) =>
            e.id === editionId
              ? {
                  ...e,
                  title: headline.trim() || e.title,
                  updatedAt: isoStr,
                  dealCount: selectedDealIds.length,
                  hasBriefing: Boolean(briefingBody.trim() || summary.trim()),
                  summary: summary.trim(),
                  briefingTitle: briefingTitle.trim(),
                  briefingBody: briefingBody.trim(),
                  marketTemp,
                  selectedDealIds: [...selectedDealIds],
                  dealComments: { ...dealComments },
                  unitIssues: [...unitIssues],
                  sections: [...sections],
                  targetSegment,
                }
              : e,
          ),
        );
      }
      try {
        if (typeof window !== "undefined") {
          const activeScopeUid = resolveNewsletterScopeUid(
            brokerId,
            brokerSlug,
            scopeUidRef.current,
          );
          const slotKey = makeSlotStorageKey(editionId, cadence, effectiveSlotSlug);
          const existing = readScopedWorkspaceJson<Record<string, unknown> | null>(
            slotKey,
            activeScopeUid,
            null,
          );
          if (existing) {
            writeScopedWorkspaceJson(slotKey, activeScopeUid, {
              ...existing,
              editionId,
              serverSavedDraft: true,
              savedAt: isoStr,
            });
          }
        }
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

    const findScopedInitialDraft = (
      targetScopeUid: string | null,
    ): { draft: Record<string, unknown> | null; key: string | null } => {
      let draft: Record<string, unknown> | null = null;
      let key: string | null = null;
      if (typeof window === "undefined") return { draft, key };

      if (initialUrlEditionId) {
        const urlSlotKey = `${SLOT_DRAFT_PREFIX}${initialUrlEditionId}`;
        const candUrl = readScopedWorkspaceJson<Record<string, unknown> | null>(
          urlSlotKey,
          targetScopeUid,
          null,
        );
        if (candUrl) {
          draft = candUrl;
          key = urlSlotKey;
        }
      }
      const explicitUrlCadence =
        !initialUrlEditionId &&
        (initialUrlCadence === "daily" ||
          initialUrlCadence === "weekly" ||
          initialUrlCadence === "monthly")
          ? initialUrlCadence
          : null;
      if (!draft) {
        const lastSessionKey = readLastActiveSlotKey(targetScopeUid);
        if (lastSessionKey) {
          const candidateDraft = readScopedWorkspaceJson<Record<string, unknown> | null>(
            lastSessionKey,
            targetScopeUid,
            null,
          );
          if (candidateDraft) {
            const candCadence =
              typeof candidateDraft.cadence === "string"
                ? normalizeNewsletterCadence(candidateDraft.cadence)
                : null;
            if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
              draft = candidateDraft;
              key = lastSessionKey;
            }
          }
        }
      }
      if (!draft && !initialUrlEditionId) {
        const candidateLegacy = readScopedWorkspaceJson<Record<string, unknown> | null>(
          LEGACY_DRAFT_STORAGE_KEY,
          targetScopeUid,
          null,
        );
        if (candidateLegacy) {
          const candCadence =
            typeof candidateLegacy.cadence === "string"
              ? normalizeNewsletterCadence(candidateLegacy.cadence)
              : null;
          if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
            draft = candidateLegacy;
            key = LEGACY_DRAFT_STORAGE_KEY;
          }
        }
      }
      if (!draft && !initialUrlEditionId) {
        const defaultCadence =
          initialUrlCadence === "daily" ||
          initialUrlCadence === "weekly" ||
          initialUrlCadence === "monthly"
            ? initialUrlCadence
            : "monthly";
        const defaultSlug = deriveCadenceIssueMeta(defaultCadence, {
          year: kstParts().year,
          month: kstParts().month,
          dateStr: todayKst(),
        }).slug;
        const defaultSlotKey = makeSlotStorageKey(null, defaultCadence, defaultSlug);
        const candidateDefault = readScopedWorkspaceJson<Record<string, unknown> | null>(
          defaultSlotKey,
          targetScopeUid,
          null,
        );
        if (candidateDefault) {
          draft = candidateDefault;
          key = defaultSlotKey;
        }
      }
      return { draft, key };
    };

    let initialDraft: Record<string, unknown> | null = null;
    let initialDraftKey: string | null = null;

    try {
      if (typeof window !== "undefined") {
        const found = findScopedInitialDraft(initialScopeUid);
        initialDraft = found.draft;
        initialDraftKey = found.key;

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
          fetch("/api/magazine/editions?broker_id=me&type=all&limit=50").then(
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
              if (typeof window !== "undefined") {
                const keysToDelete: string[] = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                  const k = window.localStorage.key(i);
                  if (
                    k &&
                    !k.includes(":u:") &&
                    (k === LEGACY_DRAFT_STORAGE_KEY || k.startsWith(SLOT_DRAFT_PREFIX))
                  ) {
                    const rawItem = window.localStorage.getItem(k);
                    if (rawItem) {
                      const parsedItem = JSON.parse(rawItem) as Record<string, unknown>;
                      if (
                        isBrokerMismatch(
                          parsedItem,
                          currentBrokerId,
                          currentBrokerSlug,
                          verifiedScopeUid,
                        )
                      ) {
                        keysToDelete.push(k);
                      }
                    }
                  }
                }
                for (const k of keysToDelete) {
                  window.localStorage.removeItem(k);
                  if (k === initialDraftKey) {
                    purgedActiveDraft = true;
                  }
                }
                if (purgedActiveDraft) {
                  clearLastActiveSlotKey(initialScopeUid);
                  resetEditorFieldsToBlank();
                  if (verifiedScopeUid) {
                    const ownScoped = findScopedInitialDraft(verifiedScopeUid);
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
                } else if (!initialScopeUid && verifiedScopeUid) {
                  if (!initialDraft && !userEditedSinceMountRef.current) {
                    const ownScoped = findScopedInitialDraft(verifiedScopeUid);
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
              }
            } catch {
              // ignore storage errors
            }

            if (edJson.brokerPreferences && typeof edJson.brokerPreferences === "object") {
              const normPrefs = normalizeBrokerPreferences(edJson.brokerPreferences);
              setPreferredRegions(normPrefs.preferredRegions);
              setPreferredChannels(normPrefs.preferredChannels);
              setRegionFocus(normPrefs.preferredRegions.join(", "));
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
            const ownScoped = findScopedInitialDraft(authUid);
            if (ownScoped.draft && !isBrokerMismatch(ownScoped.draft, authUid, "", authUid)) {
              initialDraft = ownScoped.draft;
              initialDraftKey = ownScoped.key;
              hydrateFromParsedDraft(ownScoped.draft, ownScoped.key ?? undefined);
            }
          } else if (!initialScopeUid && !initialDraft && !userEditedSinceMountRef.current) {
            const ownScoped = findScopedInitialDraft(authUid);
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
        setIsInsightsOpen(true);
      }
      if (action.step) setActiveStep(action.step);
    });
    return () => {
      cancelled = true;
    };
  }, [isWorkspaceHydrated, searchParams]);

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
    }): Promise<{
      ok: boolean;
      publicUrl: string | null;
      savedEditionId: string | null;
      savedIssueDate: string;
      errorBanner?: StatusBannerState;
    }> => {
      const fallbackIsoDate = isValidIsoDate(issueDateStr)
        ? issueDateStr
        : isValidIsoDate(autoMeta.dateStr)
          ? autoMeta.dateStr
          : todayKst();

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
        const selectedDealSnapshots = selectedDealIds.map((id) => {
          const d = deals.find((item) => item.id === id);
          const comment = dealComments[id]?.trim() || "";
          const yieldNum = d?.yield
            ? parseFloat(String(d.yield).replace(/[^0-9.]/g, ""))
            : NaN;
          return {
            id,
            title: d?.title || "추천 매물",
            assetType: d?.title || "상업용 빌딩",
            address: d?.address || "",
            price: d?.price || "가격 문의",
            yield: d?.yield || "-",
            grossYieldNetOfDeposit:
              Number.isFinite(yieldNum) && yieldNum > 0 ? yieldNum : undefined,
            investmentPoint: comment || undefined,
            point: comment || undefined,
            photoUrl: d?.photoUrl || null,
            imUrl: `/im-lite/${encodeURIComponent(id)}`,
          };
        });

        const marketDataEnabled =
          sections.find((s) => s.id === "market_data")?.enabled !== false;
        const candidateCharts =
          monthlyCharts.length > 0
            ? monthlyCharts
            : buildDefaultMonthlyGraphicPair(monthlyRegion, monthlyPairId);
        const populatedMonthlyCharts =
          cadence === "monthly" && marketDataEnabled
            ? candidateCharts.filter(
                (c) =>
                  c.isPlaceholder !== true &&
                  Array.isArray(c.series) &&
                  c.series.length > 0,
              )
            : [];

        const res = await fetch("/api/magazine/issues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editionId,
            editionType: cadence,
            issueAnchorDate: autoMeta.dateStr,
            issueDate: fallbackIsoDate,
            slug: issueSlug,
            issueNumber: autoMeta.issueNumber,
            year: autoMeta.year,
            month: autoMeta.month,
            saveAsDraft: shouldSaveAsDraft,
            status: shouldSaveAsDraft ? "draft" : "published",
            createDistinctIfPublished: Boolean(draftSlotSlugOverride) || hasPublishedCollision,
            headline: headline.trim(),
            summary: summary.trim(),
            briefingTitle: briefingTitle.trim(),
            briefingBody: briefingBody.trim(),
            marketTemp,
            monthlyRegion,
            monthlyPairId,
            monthlyCharts: populatedMonthlyCharts,
            featuredDealIds: selectedDealIds,
            featuredDeals: selectedDealSnapshots,
            dealComments,
            unitIssues,
            preferredRegions,
            preferredChannels,
            sections,
            targetSegment,
          }),
        });

        if (res.ok) {
          const json = (await res.json().then(
            (v) => v,
            () => null,
          )) as Record<string, unknown> | null;
          const returnedSlug =
            typeof json?.brokerSlug === "string" && !isUuidLike(json.brokerSlug)
              ? json.brokerSlug.trim()
              : "";
          const effectiveBrokerSlug = returnedSlug || brokerSlug;
          if (returnedSlug) setBrokerSlug(returnedSlug);

          const nextId =
            typeof json?.id === "string" && json.id
              ? json.id
              : typeof json?.editionId === "string" && json.editionId
                ? json.editionId
                : editionId;
          const savedEditionLabel =
            typeof json?.editionLabel === "string" && json.editionLabel.trim()
              ? json.editionLabel.trim()
              : issueSlug;
          const savedIssueDate = isValidIsoDate(json?.issueDate)
            ? json.issueDate
            : fallbackIsoDate;

          const effectiveId = nextId || `ed-${savedEditionLabel}`;
          if (nextId) {
            setEditionId(nextId);
            setDraftSlotSlugOverride(null);
          }

          const rawServerUrl =
            typeof json?.publicUrl === "string" && json.publicUrl.trim()
              ? json.publicUrl.trim()
              : typeof json?.url === "string" && json.url.trim()
                ? json.url.trim()
                : null;
          const resolvedUrl = shouldSaveAsDraft
            ? null
            : appendTargetSegmentToUrl(rawServerUrl, targetSegment) ||
              buildSafePublicUrl({
                brokerSlug: effectiveBrokerSlug,
                issueDate: savedIssueDate,
                fallbackAnchorDate: autoMeta.dateStr,
                editionId: effectiveId,
                targetSegment,
              });

          const nowIso = new Date().toISOString();
          const finalStatus = shouldSaveAsDraft ? "draft" : "published";

          setEditions((prev) => {
            const nextEntry: SavedEditionSummary = {
              id: effectiveId,
              slug: savedEditionLabel,
              title: headline.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
              status: finalStatus,
              updatedAt: nowIso,
              publishedAt: shouldSaveAsDraft ? null : nowIso,
              dealCount: selectedDealIds.length,
              hasBriefing: Boolean(briefingBody.trim() || summary.trim()),
              summary: summary.trim(),
              briefingTitle: briefingTitle.trim(),
              briefingBody: briefingBody.trim(),
              marketTemp,
              monthlyRegion,
              monthlyPairId,
              monthlyCharts: [...populatedMonthlyCharts],
              selectedDealIds: [...selectedDealIds],
              dealComments: { ...dealComments },
              unitIssues: [...unitIssues],
              sections: [...sections],
              targetSegment,
              issueDate: savedIssueDate,
              publicUrl: resolvedUrl ?? undefined,
              cadence,
            };
            const exists = prev.some(
              (e) =>
                e.id === effectiveId ||
                (e.slug === savedEditionLabel && (e.cadence ?? "monthly") === cadence),
            );
            if (exists) {
              return prev.map((e) =>
                e.id === effectiveId ||
                (e.slug === savedEditionLabel && (e.cadence ?? "monthly") === cadence)
                  ? nextEntry
                  : e,
              );
            }
            return [nextEntry, ...prev];
          });

          autosave.syncUpdatedAt(nowIso);
          autosave.markClean();
          setPublishedUrl(resolvedUrl);
          setIsPublished(!shouldSaveAsDraft);
          setLocalStorageMode("none");
          setSaveState("saved");
          setLastSavedAt(new Date());

          try {
            if (typeof window !== "undefined") {
              const activeScopeUid = resolveNewsletterScopeUid(
                brokerId,
                effectiveBrokerSlug,
                scopeUidRef.current,
              );
              const prevTempSlotKey = makeSlotStorageKey(null, cadence, issueSlug);
              const finalSlotKey = makeSlotStorageKey(effectiveId, cadence, savedEditionLabel);
              const savedDraftPayload: LocalNewsletterDraft = {
                ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
                brokerId: brokerId || activeScopeUid || undefined,
                brokerSlug: effectiveBrokerSlug || undefined,
                editionId: effectiveId,
                slotSlug: savedEditionLabel,
                headline: headline.trim(),
                summary: summary.trim(),
                briefingTitle: briefingTitle.trim(),
                briefingBody: briefingBody.trim(),
                issueYear: autoMeta.year,
                issueMonth: autoMeta.month,
                cadence,
                issueDateStr: savedIssueDate,
                marketTemp,
                monthlyRegion,
                monthlyPairId,
                monthlyCharts: populatedMonthlyCharts,
                selectedDealIds,
                dealComments,
                preferredRegions,
                preferredChannels,
                unitIssues,
                sections,
                targetSegment,
                publishedUrl: resolvedUrl,
                serverPublished: !shouldSaveAsDraft,
                serverSavedDraft: shouldSaveAsDraft,
                isExplicitNewSlot: false,
                savedAt: nowIso,
              };
              if (prevTempSlotKey !== finalSlotKey) {
                removeScopedWorkspaceKey(prevTempSlotKey, activeScopeUid);
              }
              writeScopedWorkspaceJson(finalSlotKey, activeScopeUid, savedDraftPayload);
              writeScopedWorkspaceJson(
                LEGACY_DRAFT_STORAGE_KEY,
                activeScopeUid,
                savedDraftPayload,
              );
              writeLastActiveSlotKey(activeScopeUid, finalSlotKey);
              hydratedSlotKeyRef.current = finalSlotKey;
            }
          } catch {
            // ignore storage quota errors
          }

          syncUrlParams(effectiveId, cadence);
          return {
            ok: true,
            publicUrl: resolvedUrl,
            savedEditionId: nextId ?? null,
            savedIssueDate,
          };
        }

        let errorStatus = res.status;
        let errorJson = await res.json().then((v) => v, () => null);

        if (!shouldSaveAsDraft && res.status === 404 && editionId) {
          const patchRes = await fetch(
            `/api/magazine/editions/${encodeURIComponent(editionId)}/publish`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                correction: isPublished,
                issueDate: fallbackIsoDate,
                payload: {
                  title: headline.trim(),
                  market_temp: marketTemp,
                  featured_deal_ids: selectedDealIds,
                  target_segments: [targetSegment],
                  theme_title: briefingTitle.trim() || null,
                  theme_body_md: briefingBody.trim() || null,
                  field_note: { comment: briefingBody.trim() },
                  content: {
                    headline: headline.trim(),
                    summary: summary.trim(),
                    briefing_title: briefingTitle.trim(),
                    briefing_body_md: briefingBody.trim(),
                    deal_comments: dealComments,
                    unitIssues,
                    monthlyRegion,
                    monthlyPairId,
                    monthlyCharts: populatedMonthlyCharts,
                    sections,
                    target_segment: targetSegment,
                  },
                },
              }),
            },
          );
          if (patchRes.ok) {
            const patchJson = (await patchRes.json().then(
              (v) => v,
              () => null,
            )) as Record<string, unknown> | null;
            const serverFallbackUrl =
              typeof patchJson?.publicUrl === "string" && patchJson.publicUrl.trim()
                ? patchJson.publicUrl.trim()
                : typeof patchJson?.url === "string" && patchJson.url.trim()
                  ? patchJson.url.trim()
                  : null;
            const fallbackUrl =
              appendTargetSegmentToUrl(serverFallbackUrl, targetSegment) ||
              buildSafePublicUrl({
                brokerSlug,
                issueDate: fallbackIsoDate,
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

  const handleSelectStep = useCallback((nextStep: NewsletterStepKey) => {
    setActiveStep(nextStep);
    setStatusBanner(null);
    if (nextStep === "send" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:open-preview"));
    }
  }, []);

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
      if (typeof window !== "undefined") {
        const activeScopeUid = resolveNewsletterScopeUid(
          brokerId,
          brokerSlug,
          scopeUidRef.current,
        );
        const newSlotKey = makeSlotStorageKey(null, nextCadence, targetSlotSlug);
        removeScopedWorkspaceKey(LEGACY_DRAFT_STORAGE_KEY, activeScopeUid);
        writeScopedWorkspaceJson(newSlotKey, activeScopeUid, {
          ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
          brokerId: brokerId || activeScopeUid || undefined,
          brokerSlug: brokerSlug || undefined,
          editionId: null,
          slotSlug: targetSlotSlug,
          cadence: nextCadence,
          issueYear: nowKst.year,
          issueMonth: nowKst.month,
          issueDateStr: today,
          isExplicitNewSlot: true,
          savedAt: new Date().toISOString(),
        });
        writeLastActiveSlotKey(activeScopeUid, newSlotKey);
        hydratedSlotKeyRef.current = newSlotKey;
      }
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

    const clonedRegion = ed.monthlyRegion ?? "gbd";
    const clonedPair = ed.monthlyPairId ?? "molit_bok";
    const clonedCharts =
      ed.monthlyCharts && ed.monthlyCharts.length > 0
        ? [...ed.monthlyCharts]
        : buildDefaultMonthlyGraphicPair(clonedRegion, clonedPair);

    setPreviousIssuesSnapshot(null);
    setEditionId(null);
    setDraftSlotSlugOverride(distinctSlug);
    setCadence(anchor.cadence);
    setIssueYear(anchor.year);
    setIssueMonth(anchor.month);
    setIssueDateStr(isValidIsoDate(ed.issueDate) ? ed.issueDate : anchor.dateStr);
    setHeadline(clonedHeadline);
    setSummary(ed.summary ?? "");
    setBriefingTitle(ed.briefingTitle ?? "");
    setBriefingBody(ed.briefingBody ?? "");
    setMarketTemp(ed.marketTemp ?? null);
    setMonthlyRegion(clonedRegion);
    setMonthlyPairId(clonedPair);
    setMonthlyCharts(clonedCharts);
    setSelectedDealIds(Array.isArray(ed.selectedDealIds) ? [...ed.selectedDealIds] : []);
    setDealComments(ed.dealComments ? { ...ed.dealComments } : {});
    setUnitIssues(Array.isArray(ed.unitIssues) ? [...ed.unitIssues] : []);
    const clonedSections = ed.sections
      ? [...ed.sections]
      : buildDefaultEditorSections(anchor.cadence);
    const clonedSegment = ed.targetSegment ?? "all";
    setSections(clonedSections);
    setTargetSegment(clonedSegment);
    setIsPublished(false);
    setPublishedUrl(null);
    setActiveStep("title");

    persistLocalDraft({
      editionId: null,
      slotSlug: distinctSlug,
      cadence: anchor.cadence,
      issueYear: anchor.year,
      issueMonth: anchor.month,
      issueDateStr: isValidIsoDate(ed.issueDate) ? ed.issueDate : anchor.dateStr,
      headline: clonedHeadline,
      summary: ed.summary ?? "",
      briefingTitle: ed.briefingTitle ?? "",
      briefingBody: ed.briefingBody ?? "",
      marketTemp: ed.marketTemp ?? null,
      monthlyRegion: clonedRegion,
      monthlyPairId: clonedPair,
      monthlyCharts: clonedCharts,
      selectedDealIds: Array.isArray(ed.selectedDealIds) ? [...ed.selectedDealIds] : [],
      dealComments: ed.dealComments ? { ...ed.dealComments } : {},
      unitIssues: Array.isArray(ed.unitIssues) ? [...ed.unitIssues] : [],
      sections: clonedSections,
      targetSegment: clonedSegment,
    });
    syncUrlParams(null, anchor.cadence, { openMobileEditor: true });
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
      const base =
        prev.length >= 2
          ? prev
          : buildDefaultMonthlyGraphicPair(monthlyRegion, monthlyPairId);
      const next = base.map((item, idx) => {
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
      const res = await fetch("/api/broker/studio/ai-news-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence,
          preferredRegions: [...activeRegions],
          preferredChannels: [...activeChannels],
          dealTitles: activeDealTitles,
          articles: newsPool.slice(0, 30),
        }),
      });
      const json = (await res.json().then(
        (v) => v,
        () => null,
      )) as { ok: true; unitIssues: AxiosUnitIssue[] } | null;
      if (res.ok && json?.ok && Array.isArray(json.unitIssues) && json.unitIssues.length > 0) {
        setUnitIssues(json.unitIssues);
        persistLocalDraft({ unitIssues: json.unitIssues });
        setStatusBanner({
          tone: "success",
          message: "내 주력 권역과 관심 분야에 맞춰 핵심 이슈 포스트잇 5선을 새로 구성했어요.",
        });
        return;
      }
    } catch {
      // 결정론적 폴백 진행
    } finally {
      setIsAiClustering(false);
    }

    const fallback = clusterArticlesIntoFiveIssues(newsPool, {
      cadence,
      preferredRegions: activeRegions,
      preferredChannels: activeChannels,
      dealKeywords: activeDealTitles,
    });
    setUnitIssues(fallback);
    persistLocalDraft({ unitIssues: fallback });
    setStatusBanner({
      tone: "success",
      message: "내 주력 권역과 관심 분야 기반으로 핵심 이슈 5선을 구성했어요.",
    });
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
        const incoming = json.items;
        setNewsPool((prev) => {
          const incomingKeys = new Set(
            incoming.map((item) => String(item.id ?? item.title ?? "").trim()),
          );
          if (channel === "all") {
            const retained = prev.filter(
              (item) => !incomingKeys.has(String(item.id ?? item.title ?? "").trim()),
            );
            return [...incoming, ...retained];
          }
          const retainedOtherChannels = prev.filter((item) => {
            const key = String(item.id ?? item.title ?? "").trim();
            if (incomingKeys.has(key)) return false;
            return resolveNewsChannel(item) !== channel;
          });
          return [...incoming, ...retainedOtherChannels];
        });
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

  const editorSyncUnits = useMemo<Record<string, EditorUnitTarget<NewsletterStepKey>>>(() => {
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
          if (!isSectionEnabled("market_data")) handleToggleSection("market_data", true);
          setStatTuneOpen(true);
        },
        editorSelector: '[data-testid="monthly-stats-authoring-card"]',
        focusSelector: "#monthly-stat-val-0",
      },
      "nl-unit-stats-1": {
        unitId: "nl-unit-stats-1",
        label: "주요 통계 그래픽 2번",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("market_data")) handleToggleSection("market_data", true);
          setStatTuneOpen(true);
        },
        editorSelector: '[data-testid="monthly-stats-authoring-card"]',
        focusSelector: "#monthly-stat-val-1",
      },
      "nl-unit-briefing": {
        unitId: "nl-unit-briefing",
        label: "시장 브리핑 글",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("field_note")) handleToggleSection("field_note", true);
        },
        editorSelector: '[data-testid="market-briefing-editor"]',
        focusSelector: "#newsletter-briefing-body",
      },
      "nl-unit-deals": {
        unitId: "nl-unit-deals",
        label: "추천 매물 고르기",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("featured_deals")) handleToggleSection("featured_deals", true);
        },
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
        onCustomActivate: () => {
          setStatusBanner({
            tone: "info",
            message:
              "담당 중개사 이름·사무소·연락처는 상단 [내 정보] 프로필 설정(/broker/profile)에서 수정할 수 있습니다.",
          });
        },
      },
    };

    for (let idx = 0; idx < 5; idx++) {
      map[`nl-unit-issue-${idx}`] = {
        unitId: `nl-unit-issue-${idx}`,
        label: `핵심 이슈 ${idx + 1}번 카드`,
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("news_curation")) handleToggleSection("news_curation", true);
        },
        editorSelector: `[data-testid="axios-issue-card-editor-${idx}"]`,
        focusSelector: `#axios-issue-title-${idx}`,
      };
    }

    for (const deal of deals) {
      map[`nl-unit-deal-${deal.id}`] = {
        unitId: `nl-unit-deal-${deal.id}`,
        label: `${deal.title} 추천글`,
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("featured_deals")) handleToggleSection("featured_deals", true);
        },
        editorSelector: `[data-testid="deal-slot-item-${deal.id}"]`,
        focusSelector: selectedDealIds.includes(deal.id)
          ? `#deal-comment-input-${deal.id}`
          : `#deal-checkbox-${deal.id}`,
      };
    }

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadence, deals, selectedDealIds, isSectionEnabled]);

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
    let targetUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);
    const needsServerSave =
      !targetUrl || !isPublished || saveState === "dirty" || saveState === "error" || saveState === "conflict";
    if (needsServerSave) {
      if (!headline.trim()) {
        setActiveStep("title");
        setStatusBanner({
          tone: "error",
          message: "표지 제목을 입력하면 바로 보낼 수 있어요",
        });
        return;
      }
      const saved = await handleServerSave({ saveAsDraft: false });
      if (!saved.ok || !saved.publicUrl) {
        setStatusBanner(
          saved.errorBanner ?? {
            tone: "error",
            message: "아직 뉴스레터 주소를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
          },
        );
        return;
      }
      targetUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
    }

    const copied = await copyText(targetUrl!);
    if (copied) {
      setStatusBanner({ tone: "success", message: "링크를 복사했어요" });
    } else {
      setStatusBanner({
        tone: "error",
        message: COPY_FAILED_MESSAGE,
        fallbackUrl: targetUrl ?? undefined,
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

  const handleSendSelected = async () => {
    if (sending) return;

    const briefingOn = isSectionEnabled("field_note");
    const dealsOn = isSectionEnabled("featured_deals");
    const newsOn = isSectionEnabled("news_curation");
    const enabledNewsCount = newsOn ? unitIssues.length : 0;

    const hint = getNextPublishHint({
      headline,
      briefingBody,
      dealCount: selectedDealIds.length,
      newsCount: enabledNewsCount,
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
      const saved = await handleServerSave({ saveAsDraft: false });
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
      let distAttempted = false;
      let distStatus = 0;
      let distJson: Record<string, unknown> | null = null;
      if (saved.savedEditionId && isUuidLike(saved.savedEditionId)) {
        distAttempted = true;
        try {
          const distRes = await fetch("/api/broker/magazine/distribute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              editionId: saved.savedEditionId,
              editionType: cadence,
              title: headline.trim(),
              headline: briefingSnippet || headline.trim(),
              market_temp: marketTemp ?? undefined,
              date: saved.savedIssueDate,
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
      if (outcome) {
        setDistributeOutcome(outcome);
      }

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

      if (distStatus === 422) {
        setStatusBanner(
          buildApiErrorStatusBanner(distStatus, distJson, outcome?.message || "발송 요건을 충족하지 못했습니다."),
        );
      } else if (outcome) {
        setStatusBanner({
          tone: outcome.tone,
          message: outcome.message,
          ...(sentCount === 0 && queuedCount === 0 ? { fallbackUrl: publicUrl } : {}),
        });
      } else if (shareResult === "kakao") {
        setStatusBanner({
          tone: "success",
          message:
            "뉴스레터 웹 발행 완료 · 카카오톡 공유 창에서 구독자를 선택해 전달해 주세요.",
        });
      } else if (shareResult === "copied") {
        setStatusBanner({
          tone: "success",
          message:
            "뉴스레터 웹 발행 완료 · 공유 링크가 복사되었습니다. 카톡·문자에 붙여넣어 전달해 주세요.",
        });
      } else {
        setStatusBanner({
          tone: "warning",
          message:
            "뉴스레터 웹 발행은 완료되었으나 자동 복사에 실패했습니다. 아래 공개 링크를 직접 복사해 전달해 주세요.",
          fallbackUrl: publicUrl,
        });
      }
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
            aria-label="뉴스레터 작성 3단계"
            className="grid w-full grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs"
          >
            {STEP_TABS.map((tab) => {
              const selected = activeStep === tab.key;
              const isDone =
                tab.key === "title"
                  ? headline.trim().length > 0
                  : tab.key === "content"
                    ? briefingBody.trim().length > 0 || selectedDealIds.length > 0
                    : isPublished && saveState === "saved";
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
                  className={`min-h-[48px] rounded-xl px-2.5 py-2 text-base font-extrabold transition flex flex-wrap items-center justify-center gap-1.5 overflow-hidden ${
                    selected
                      ? "bg-blue-700 text-white shadow-xs"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="break-keep">{tab.label}</span>
                  {isDone && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-sm font-bold shrink-0 ${
                        selected
                          ? "bg-white/20 text-white"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      완료
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 min-h-[48px]">
            {listViewMode === "simple" && selectedSavedEdition ? (
              <SelectedItemActions
                itemLabel={editionDisplayTitle(selectedSavedEdition)}
                onDuplicate={(e) => handleDuplicateEdition(selectedSavedEdition, e)}
                onDelete={(e) => handleRequestDeleteEdition(selectedSavedEdition, e)}
              />
            ) : null}

            <button
              type="button"
              data-testid="magazine-insights-open-btn"
              onClick={() => setIsInsightsOpen(true)}
              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50 shrink-0"
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

        {statusBanner && (
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
            {statusBanner.fallbackUrl && (
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
              setEditionId(null);
              setIsPublished(false);
              setPublishedUrl(null);
              persistLocalDraft({
                editionId: null,
                slotSlug: null,
                issueYear: meta.year,
                issueMonth: meta.month,
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
            distributeOutcome={distributeOutcome}
            onJumpToStep={(step) => setActiveStep(step)}
            onNotifyEditorFocus={sync.notifyEditorFocus}
            onBulkSubscribersImported={handleBulkSubscribersImported}
            onKakaoShare={() => void handleKakaoShare()}
            onCopyLink={() => void handleCopyLink()}
            onBackToContent={() => handleSelectStep("content")}
            onSendSelected={() => void handleSendSelected()}
          />
        )}
      </div>
    </div>
  );

  // 3열: 실시간 뉴스레터 미리보기 슬롯
  const activeReaderPreviewUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);

  const previewSlot = (
    <div
      data-testid="magazine-preview-slot"
      className="p-4 sm:p-5 space-y-4 text-slate-900"
    >
      <div className="sticky top-0 z-20 bg-[#F5F5F7]/95 backdrop-blur-md py-1 -my-1">
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

      <NewsletterPreviewCard
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
      />

      {activeStep !== "send" && previewLifecycle !== "pre_generation" && (
        <MagazinePublishChecklist
          headline={headline}
          briefingBody={briefingBody}
          dealCount={selectedDealIds.length}
          newsCount={isSectionEnabled("news_curation") ? unitIssues.length : 0}
          briefingEnabled={isSectionEnabled("field_note")}
          dealsEnabled={isSectionEnabled("featured_deals")}
          newsEnabled={isSectionEnabled("news_curation")}
          onJumpToStep={(step) => setActiveStep(step)}
        />
      )}

      {previewLifecycle === "pre_generation" && (
        <PreviewPregenerationCard
          testId="newsletter-preview-pregeneration-card"
          title="첫 제목을 입력하면 내 뉴스레터가 완성됩니다"
          description="왼쪽 편집창에서 표지 제목을 적거나 [AI로 초안 쓰기]를 눌러 보세요. 아래 화면은 이해를 돕기 위한 기본 예시 구성입니다."
          primaryActionLabel="① 표지 제목 입력하기"
          onPrimaryAction={() => sync.focusEditorUnit("nl-unit-cover")}
          secondaryActionLabel="✨ AI로 초안 채우기"
          onSecondaryAction={() => sync.focusEditorUnit("nl-unit-ai-draft")}
        />
      )}
    </div>
  );

  const primaryActionSlot = (
    <button
      type="button"
      data-testid="newsletter-primary-send-btn"
      onClick={
        isPublished && previewLifecycle === "published_dirty"
          ? () => void handleDraftSaveClick()
          : isPublished && previewLifecycle === "published_clean" && activeStep !== "send"
            ? () => handleSelectStep("send")
            : () => void handleSendSelected()
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
      {sending || (isPublished && previewLifecycle === "published_dirty" && saveState === "saving") ? (
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
            {activeStep === "send" ? "발행 완료 · 다시 보내기" : "발행 완료 · 공유 / 다시 보내기"}
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
      <NewsletterInsightsModal
        open={isInsightsOpen}
        onOpenChange={setIsInsightsOpen}
        insightsTab={insightsTab}
        onTabChange={setInsightsTab}
        sendDisabled={sendDisabled}
        onSendDisabledChange={setSendDisabled}
        brokerSlug={brokerSlug || "me"}
        brokerName={brokerName || "공인중개사"}
        baseUrl={resolvePublicBaseUrl() ?? getSiteOrigin()}
        editionDate={issueDateStr}
        shareTitle={headline}
        deals={deals.map((d) => ({ id: d.id, title: d.title }))}
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
