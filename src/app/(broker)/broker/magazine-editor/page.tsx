"use client";

import React, {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  FilePlus2,
  Loader2,
  MessageCircle,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  useEditorPreviewSync,
  PreviewCausalityBar,
  PreviewPregenerationCard,
  PreviewEditableUnit,
  type PreviewLifecycleState,
  type EditorUnitTarget,
} from "@/components/workspace/preview-sync";
import {
  DateGroupedList,
  ListThumbnail,
  ListToolbar,
  SelectedItemActions,
  SimpleListRow,
  WorkspaceListPanel,
  type ActiveFilterChip,
} from "@/components/workspace/list/WorkspaceList";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import {
  UndoToastProvider,
  useUndoToast,
} from "@/components/workspace/UndoConfirmToast";
import {
  IssueMetadataForm,
  type AutoIssueMetadata,
} from "@/components/magazine-editor/IssueMetadataForm";
import {
  BlockSelectionGrid,
  DEFAULT_NEWSLETTER_BLOCKS,
} from "@/components/magazine-editor/BlockSelectionGrid";
import {
  DealSlotAssigner,
  type AssignableDealItem,
} from "@/components/magazine-editor/DealSlotAssigner";
import {
  MagazinePublishChecklist,
  getNextPublishHint,
} from "@/components/magazine-editor/MagazinePublishChecklist";
import {
  MagazineQuickDraftCard,
  type MagazineDraftSnapshot,
} from "@/components/broker/studio/MagazineQuickDraftCard";
import {
  SendListSummaryBar,
  type NewsletterTargetSegment,
} from "@/components/broker/studio/SendListSummaryBar";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";
import {
  MONTHLY_REGION_PRESETS,
  MONTHLY_STATS_PLACEHOLDER_MESSAGE,
  MONTHLY_STATS_PREPARING_LABEL,
  getMonthlyChartsForRegion,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import {
  MONTHLY_GRAPHIC_PAIR_PRESETS,
  buildDefaultMonthlyGraphicPair,
  mapPreferredRegionsToMonthlyKey,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import {
  SIMPLE_FORMAT_ACTIONS,
  applySimpleTextFormat,
  normalizeReadableBriefingText,
  type SimpleFormatActionId,
} from "@/lib/magazine/simple-format";
import {
  clusterArticlesIntoFiveIssues,
  formatSingleLineTitle,
  normalizeAxiosIssueCopy,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import {
  BROKER_REGION_PRESETS,
  DEFAULT_PREFERRED_REGIONS,
  DEFAULT_PREFERRED_CHANNELS,
  normalizeBrokerPreferences,
} from "@/domain/magazine/broker-preferences";
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNEL_MAP,
  SPECIFIC_NEWS_CHANNELS,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import type {
  AxiosUnitIssue,
  EditionType,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { shareKakaoFeed, getSiteOrigin } from "@/lib/kakao/share";
import { kstParts, todayKst } from "@/lib/magazine/kst";
import {
  NEWSLETTER_CADENCES,
  NEWSLETTER_CADENCE_META,
  deriveCadenceIssueMeta,
  getDefaultSectionsForCadence,
  normalizeNewsletterCadence,
  parseCadenceAnchor,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import { AxiosGlassIssueCard } from "@/components/magazine/AxiosGlassIssueCard";
import { MonthlyGlassStatCard } from "@/components/magazine/MonthlyGlassStatCard";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";
import { formatPriceKo, sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import type { HonestSaveState } from "@/lib/ux/lexicon";

export type EditorPrimaryTabKey =
  | "cover"
  | "field_note"
  | "monthly_stats"
  | "news"
  | "theme_deals";

export interface EditorPrimaryTabDef {
  key: EditorPrimaryTabKey;
  label: string;
}

/**
 * 하위 호환용: 기존 테스트(newsletter-v2-advancement)에서 import 하는 주기별 탭 헬퍼 유지
 */
export function getPrimaryTabsForCadence(cadence: EditionType): EditorPrimaryTabDef[] {
  if (cadence === "daily") {
    return [
      { key: "cover", label: "① 제목" },
      { key: "news", label: "② 내용" },
      { key: "theme_deals", label: "③ 보내기" },
    ];
  }
  if (cadence === "monthly") {
    return [
      { key: "cover", label: "① 제목" },
      { key: "monthly_stats", label: "② 통계" },
      { key: "news", label: "③ 내용" },
      { key: "theme_deals", label: "④ 보내기" },
    ];
  }
  return [
    { key: "cover", label: "① 제목" },
    { key: "field_note", label: "② 브리핑" },
    { key: "news", label: "③ 내용" },
    { key: "theme_deals", label: "④ 보내기" },
  ];
}

export type NewsletterStepKey = "title" | "content" | "send";

const STEP_TABS: readonly {
  key: NewsletterStepKey;
  label: string;
  shortDesc: string;
}[] = [
  { key: "title", label: "① 제목", shortDesc: "연·월 선택 및 표지 제목" },
  { key: "content", label: "② 내용", shortDesc: "시장 브리핑과 추천 매물" },
  { key: "send", label: "③ 보내기", shortDesc: "받을 고객 확인 및 발송" },
] as const;

interface SavedEditionSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string | null;
  publishedAt: string | null;
  dealCount: number;
  hasBriefing: boolean;
  summary?: string;
  briefingTitle?: string;
  briefingBody?: string;
  marketTemp?: MarketTemperature | null;
  monthlyRegion?: MonthlyRegionKey;
  monthlyPairId?: MonthlyChartPairId;
  monthlyCharts?: MonthlyRegionalChart[];
  selectedDealIds?: string[];
  dealComments?: Record<string, string>;
  unitIssues?: AxiosUnitIssue[];
  sections?: { id: string; enabled: boolean }[];
  targetSegment?: NewsletterTargetSegment;
  issueDate?: string;
  publicUrl?: string;
  /** 발행 주기 (magazine_editions.edition_type) */
  cadence?: NewsletterCadence | "special";
}

interface LocalNewsletterDraft {
  brokerId?: string;
  brokerSlug?: string;
  editionId?: string | null;
  slotSlug?: string;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  issueYear: number;
  issueMonth: number;
  cadence: NewsletterCadence;
  issueDateStr: string;
  marketTemp: MarketTemperature | null;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId?: MonthlyChartPairId;
  monthlyCharts?: MonthlyRegionalChart[];
  selectedDealIds: string[];
  dealComments: Record<string, string>;
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  unitIssues: AxiosUnitIssue[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
  publishedUrl?: string | null;
  serverPublished?: boolean;
  serverSavedDraft?: boolean;
  isExplicitNewSlot?: boolean;
  savedAt: string;
}

const LEGACY_DRAFT_STORAGE_KEY = "cre-newsletter-local-draft-v2";
const SLOT_DRAFT_PREFIX = "cre-newsletter-draft-v3:";
const LAST_ACTIVE_SLOT_SESSION_KEY = "cre-newsletter-last-slot-v3";

function isValidIsoDate(val: unknown): val is string {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

function isUuidLike(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

function buildDefaultEditorSections(
  cadenceVal: NewsletterCadence = "monthly",
): { id: string; enabled: boolean }[] {
  const cadenceDefaults = getDefaultSectionsForCadence(cadenceVal);
  const defaultMap = new Map(cadenceDefaults.map((item) => [item.id, item.enabled]));
  return DEFAULT_NEWSLETTER_BLOCKS.map((b) => ({
    id: b.id,
    enabled: defaultMap.has(b.id) ? Boolean(defaultMap.get(b.id)) : b.id !== "market_data",
  }));
}

function normalizeEditorSections(
  rawSections: unknown,
  cadenceVal: NewsletterCadence = "monthly",
): { id: string; enabled: boolean }[] | undefined {
  if (!Array.isArray(rawSections) || rawSections.length === 0) return undefined;
  const map = new Map<string, boolean>();
  for (const item of rawSections) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.id === "string" && typeof rec.enabled === "boolean") {
        map.set(rec.id, rec.enabled);
      }
    }
  }
  if (map.size === 0) return undefined;
  const fallbackMap = new Map(
    buildDefaultEditorSections(cadenceVal).map((item) => [item.id, item.enabled]),
  );
  return DEFAULT_NEWSLETTER_BLOCKS.map((b) => ({
    id: b.id,
    enabled: map.has(b.id) ? Boolean(map.get(b.id)) : Boolean(fallbackMap.get(b.id)),
  }));
}

function normalizeTargetSegment(raw: unknown): NewsletterTargetSegment | undefined {
  if (raw === "all" || raw === "buyer" || raw === "seller") return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first === "all" || first === "buyer" || first === "seller") return first;
  }
  return undefined;
}

function normalizeMonthlyRegion(raw: unknown): MonthlyRegionKey | undefined {
  if (typeof raw !== "string") return undefined;
  const found = MONTHLY_REGION_PRESETS.find((p) => p.key === raw.trim());
  return found ? found.key : undefined;
}

function normalizeMonthlyPairId(raw: unknown): MonthlyChartPairId {
  if (raw === "reb_molit" || raw === "molit_kosis" || raw === "reb_kosis") {
    return raw;
  }
  return "reb_molit";
}

function normalizeSavedMonthlyCharts(
  raw: unknown,
): MonthlyRegionalChart[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const valid = raw.filter(
    (c): c is MonthlyRegionalChart =>
      Boolean(c) &&
      typeof c === "object" &&
      typeof (c as MonthlyRegionalChart).title === "string" &&
      Array.isArray((c as MonthlyRegionalChart).series) &&
      (c as MonthlyRegionalChart).series.length > 0 &&
      (c as MonthlyRegionalChart).isPlaceholder !== true,
  );
  return valid.length > 0 ? valid.slice(0, 2) : undefined;
}

function makeSlotStorageKey(
  editionIdVal: string | null | undefined,
  cadenceVal: NewsletterCadence | "special",
  slotSlug: string,
): string {
  if (editionIdVal && editionIdVal.trim()) {
    return `${SLOT_DRAFT_PREFIX}${editionIdVal.trim()}`;
  }
  return `${SLOT_DRAFT_PREFIX}${cadenceVal}:${slotSlug}`;
}

function appendTargetSegmentToUrl(
  rawUrl: string | null | undefined,
  segment: NewsletterTargetSegment,
): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  try {
    const isAbsolute = /^https?:\/\//i.test(trimmed);
    const parsed = new URL(trimmed, isAbsolute ? undefined : getSiteOrigin());
    if (segment !== "all") {
      parsed.searchParams.set("target", segment);
    } else if (parsed.searchParams.get("target") === "all") {
      parsed.searchParams.delete("target");
    }
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    if (segment === "all") return trimmed;
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}target=${encodeURIComponent(segment)}`;
  }
}

function buildSafePublicUrl(params: {
  brokerSlug: string;
  issueDate?: string | null;
  fallbackAnchorDate?: string | null;
  editionId?: string | null;
  targetSegment?: NewsletterTargetSegment;
}): string | null {
  const cleanSlug = params.brokerSlug.trim();
  if (!cleanSlug || cleanSlug === "me" || isUuidLike(cleanSlug)) {
    return null;
  }
  const isoDate = isValidIsoDate(params.issueDate)
    ? params.issueDate.trim()
    : isValidIsoDate(params.fallbackAnchorDate)
      ? params.fallbackAnchorDate.trim()
      : todayKst();
  const qs = new URLSearchParams();
  if (params.editionId && params.editionId.trim()) {
    qs.set("edition", params.editionId.trim());
  }
  if (params.targetSegment && params.targetSegment !== "all") {
    qs.set("target", params.targetSegment);
  }
  const query = qs.toString();
  return `${getSiteOrigin()}/magazine/${encodeURIComponent(cleanSlug)}/${encodeURIComponent(isoDate)}${query ? `?${query}` : ""}`;
}

function formatDealPriceLabel(rawWon: unknown, priceBand?: unknown): string {
  if (typeof priceBand === "string" && priceBand.includes("~") && priceBand.trim()) {
    return priceBand.trim();
  }
  const n = typeof rawWon === "number" ? rawWon : Number(rawWon);
  if (Number.isFinite(n) && n > 0) return formatPriceKo(n);
  if (typeof priceBand === "string" && priceBand.trim()) return priceBand.trim();
  return "-";
}

function isBrokerMismatch(
  draft: Record<string, unknown>,
  currentBrokerId: string,
  currentBrokerSlug: string,
): boolean {
  const draftBrokerId = typeof draft.brokerId === "string" ? draft.brokerId.trim() : "";
  const draftBrokerSlug = typeof draft.brokerSlug === "string" ? draft.brokerSlug.trim() : "";
  const idMismatch =
    Boolean(draftBrokerId && currentBrokerId) &&
    draftBrokerId !== currentBrokerId &&
    draftBrokerId !== currentBrokerSlug;
  const slugMismatch =
    Boolean(!draftBrokerId && draftBrokerSlug && currentBrokerSlug) &&
    draftBrokerSlug !== currentBrokerSlug &&
    draftBrokerSlug !== currentBrokerId;
  return idMismatch || slugMismatch;
}

function MagazineEditorWorkspace() {
  const router = useRouter();
  const pathname = usePathname() || "/broker/magazine-editor";
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  // ── 1. 단계 및 기본 메타 상태 (KST 현재 연·월 SSOT) ──
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
  // 좌측 목록 보기 방식 (간단히 | 자세히) — 4개 작업공간 공통 설정
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
  const cadenceMeta = NEWSLETTER_CADENCE_META[cadence];

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
  const [monthlyPairId, setMonthlyPairId] = useState<MonthlyChartPairId>("reb_molit");
  const [monthlyCharts, setMonthlyCharts] = useState<MonthlyRegionalChart[]>(() =>
    buildDefaultMonthlyGraphicPair("gbd", "reb_molit"),
  );
  const [monthlyLiveDbAvailable, setMonthlyLiveDbAvailable] = useState<boolean>(false);
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

  // ── 4. 정직한 저장·발행·발송 상태 ──
  const [saveState, setSaveState] = useState<HonestSaveState>("idle");
  const [localStorageMode, setLocalStorageMode] = useState<"none" | "local_only">("none");
  const [lastSavedAt, setLastSavedAt] = useState<Date | string | null>(null);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [isPrefsOpen, setIsPrefsOpen] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: "success" | "error" | "info" | "warning";
    message: string;
    fallbackUrl?: string;
  } | null>(null);

  const briefingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);
  const restoredLocalIssuesRef = useRef(false);
  const savingLockRef = useRef(false);
  const lastSyncedEditionQueryRef = useRef<string | null>(null);
  const hydratedSlotKeyRef = useRef<string | null>(null);

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
        setMonthlyPairId("reb_molit");
        setMonthlyCharts(buildDefaultMonthlyGraphicPair("gbd", "reb_molit"));
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
        return;
      }

      if (typeof parsed.headline === "string") setHeadline(parsed.headline);
      if (typeof parsed.summary === "string") setSummary(parsed.summary);
      if (typeof parsed.briefingTitle === "string") setBriefingTitle(parsed.briefingTitle);
      if (typeof parsed.briefingBody === "string") setBriefingBody(parsed.briefingBody);
      if (typeof parsed.issueYear === "number") setIssueYear(parsed.issueYear);
      if (typeof parsed.issueMonth === "number") setIssueMonth(parsed.issueMonth);
      if (typeof parsed.cadence === "string") {
        setCadence(nextCadence);
      }
      if (isValidIsoDate(parsed.issueDateStr)) {
        setIssueDateStr(parsed.issueDateStr);
      }
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
      if (normSections) {
        setSections(normSections);
      } else {
        setSections(buildDefaultEditorSections(nextCadence));
      }
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
          // 미저장 신규 슬롯이 빈 배열로 오염되어 있던 경우 즉시 핵심 이슈 5선을 자동 복원한다
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

  // ── 6. 슬롯별 로컬 초안 자동저장 (NL-01, NL-09) ──
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
          const payload: LocalNewsletterDraft = {
            brokerId: brokerId || undefined,
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
          window.localStorage.setItem(slotKey, JSON.stringify(payload));
          window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, slotKey);
          hydratedSlotKeyRef.current = slotKey;
        }
      } catch {
        // ignore storage quota errors
      }
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

  /** 다른 호로 전환하기 직전 현재 슬롯이 수정 상태(dirty)라면 해당 슬롯 키에만 안전히 백업한다 */
  const persistCurrentSlotIfDirty = useCallback(() => {
    if (saveState !== "dirty" && localStorageMode !== "local_only") return;
    try {
      if (typeof window === "undefined") return;
      const currentSlotKey = makeSlotStorageKey(editionId, cadence, effectiveSlotSlug);
      const payload: LocalNewsletterDraft = {
        brokerId: brokerId || undefined,
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
      window.localStorage.setItem(currentSlotKey, JSON.stringify(payload));
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

  /** 저장된 에디션 1건의 모든 필드를 에디터 상태에 일관되게 반영한다 (NL-01, NL-03, NL-09) */
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

      // 동일 에디션 전용 미저장 로컬 초안이 존재하면 우선 복원
      if (typeof window !== "undefined") {
        try {
          const rawSlot = window.localStorage.getItem(targetSlotKey);
          if (rawSlot) {
            const parsedSlot = JSON.parse(rawSlot) as Record<string, unknown>;
            const mismatch = isBrokerMismatch(
              parsedSlot,
              brokerId,
              opts?.effectiveSlugOverride ?? brokerSlug,
            );
            const isDirtySlot =
              !mismatch &&
              parsedSlot.serverPublished !== true &&
              parsedSlot.serverSavedDraft !== true &&
              parsedSlot.isExplicitNewSlot !== true;
            if (isDirtySlot) {
              window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, targetSlotKey);
              window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
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
      const nextPair = ed.monthlyPairId ?? "reb_molit";
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
          issueDate: ed.issueDate || ed.publishedAt?.slice(0, 10),
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
      setStatusBanner(null);

      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, targetSlotKey);
          // 이전 호를 명시적으로 선택했을 때 레거시 단일 키가 F5에서 덮어쓰지 못하도록 정리
          const rawLegacy = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
          if (rawLegacy) {
            const parsedLegacy = JSON.parse(rawLegacy) as Record<string, unknown>;
            if (parsedLegacy.editionId !== ed.id) {
              window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
            }
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

  // ── 5. 초기 데이터 및 슬롯별 로컬 초안 복원 ──
  useEffect(() => {
    let mounted = true;
    const initialUrlEditionId =
      searchParams?.get?.("editionId") || searchParams?.get?.("buildingId") || null;
    const initialUrlCadence = searchParams?.get?.("cadence") || null;

    let initialDraft: Record<string, unknown> | null = null;
    let initialDraftKey: string | null = null;

    try {
      if (typeof window !== "undefined") {
        if (initialUrlEditionId) {
          const urlSlotKey = `${SLOT_DRAFT_PREFIX}${initialUrlEditionId}`;
          const rawUrlSlot = window.localStorage.getItem(urlSlotKey);
          if (rawUrlSlot) {
            initialDraft = JSON.parse(rawUrlSlot) as Record<string, unknown>;
            initialDraftKey = urlSlotKey;
          }
        }
        const explicitUrlCadence =
          !initialUrlEditionId &&
          (initialUrlCadence === "daily" ||
            initialUrlCadence === "weekly" ||
            initialUrlCadence === "monthly")
            ? initialUrlCadence
            : null;
        if (!initialDraft) {
          const lastSessionKey = window.sessionStorage.getItem(LAST_ACTIVE_SLOT_SESSION_KEY);
          if (lastSessionKey) {
            const rawSessionSlot = window.localStorage.getItem(lastSessionKey);
            if (rawSessionSlot) {
              const candidateDraft = JSON.parse(rawSessionSlot) as Record<string, unknown>;
              const candCadence =
                typeof candidateDraft.cadence === "string"
                  ? normalizeNewsletterCadence(candidateDraft.cadence)
                  : null;
              if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
                initialDraft = candidateDraft;
                initialDraftKey = lastSessionKey;
              }
            }
          }
        }
        if (!initialDraft && !initialUrlEditionId) {
          const savedLegacy = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
          if (savedLegacy) {
            const candidateLegacy = JSON.parse(savedLegacy) as Record<string, unknown>;
            const candCadence =
              typeof candidateLegacy.cadence === "string"
                ? normalizeNewsletterCadence(candidateLegacy.cadence)
                : null;
            if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
              initialDraft = candidateLegacy;
              initialDraftKey = LEGACY_DRAFT_STORAGE_KEY;
            }
          }
        }
        if (!initialDraft && !initialUrlEditionId) {
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
          const rawDefaultSlot = window.localStorage.getItem(defaultSlotKey);
          if (rawDefaultSlot) {
            initialDraft = JSON.parse(rawDefaultSlot) as Record<string, unknown>;
            initialDraftKey = defaultSlotKey;
          } else if (initialUrlCadence) {
            setCadence(defaultCadence);
            setSections(buildDefaultEditorSections(defaultCadence));
          }
        }

        if (initialDraft) {
          hydrateFromParsedDraft(initialDraft, initialDraftKey ?? undefined);
        }
      }
    } catch {
      // localStorage 사용 불가 환경 무시
    }

    async function loadInitialWorkspace() {
      if (typeof fetch === "undefined") return;
      try {
        const [editionsRes, buildingsRes] = await Promise.all([
          fetch("/api/magazine/editions?broker_id=me&type=all&limit=50").catch(() => null),
          fetch("/api/broker/buildings").catch(() => null),
        ]);

        if (!mounted) return;

        if (editionsRes && editionsRes.ok) {
          const edJson = (await editionsRes.json().catch(() => null)) as Record<
            string,
            unknown
          > | null;
          if (edJson) {
            const currentBrokerId =
              typeof edJson.brokerId === "string" ? edJson.brokerId.trim() : "";
            const rawSlug =
              typeof edJson.brokerSlug === "string" ? edJson.brokerSlug.trim() : "";
            const currentBrokerSlug = isUuidLike(rawSlug) ? "" : rawSlug;

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

            // S1-11 (T4-01): 공용 PC 다중 중개사 교차 오염 방지 — 다른 중개사의 모든 로컬 초안 즉시 폐기
            let purgedActiveDraft = false;
            try {
              if (typeof window !== "undefined") {
                const keysToDelete: string[] = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                  const k = window.localStorage.key(i);
                  if (
                    k &&
                    (k === LEGACY_DRAFT_STORAGE_KEY || k.startsWith(SLOT_DRAFT_PREFIX))
                  ) {
                    const rawItem = window.localStorage.getItem(k);
                    if (rawItem) {
                      const parsedItem = JSON.parse(rawItem) as Record<string, unknown>;
                      if (isBrokerMismatch(parsedItem, currentBrokerId, currentBrokerSlug)) {
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
                  window.sessionStorage.removeItem(LAST_ACTIVE_SLOT_SESSION_KEY);
                  restoredLocalIssuesRef.current = false;
                  initialDraft = null;
                  initialDraftKey = null;
                  setDraftSlotSlugOverride(null);
                  setHeadline("");
                  setSummary("");
                  setBriefingTitle("");
                  setBriefingBody("");
                  setMarketTemp(null);
                  setMonthlyRegion("gbd");
                  setMonthlyPairId("reb_molit");
                  setMonthlyCharts(buildDefaultMonthlyGraphicPair("gbd", "reb_molit"));
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
                  buildDefaultMonthlyGraphicPair(prefMonthlyRegion, "reb_molit"),
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
                .map((row) => {
                  const content =
                    row.content && typeof row.content === "object"
                      ? (row.content as Record<string, unknown>)
                      : {};
                  const fieldNote =
                    row.field_note && typeof row.field_note === "object"
                      ? (row.field_note as Record<string, unknown>)
                      : {};
                  const rawDealIds = Array.isArray(row.featured_deal_ids)
                    ? row.featured_deal_ids
                    : Array.isArray(content.featured_deal_ids)
                      ? content.featured_deal_ids
                      : [];
                  const dealIds = rawDealIds
                    .map((d) => String(d ?? "").trim())
                    .filter(Boolean);
                  const rawComments =
                    content.deal_comments && typeof content.deal_comments === "object"
                      ? (content.deal_comments as Record<string, unknown>)
                      : {};
                  const dealCommentsMap: Record<string, string> = {};
                  for (const [k, v] of Object.entries(rawComments)) {
                    if (typeof v === "string") dealCommentsMap[k] = v;
                  }
                  const rawIssueDate = isValidIsoDate(content.issueDate)
                    ? content.issueDate
                    : isValidIsoDate(content.issue_date)
                      ? content.issue_date
                      : typeof row.published_at === "string" &&
                          isValidIsoDate(row.published_at.slice(0, 10))
                        ? row.published_at.slice(0, 10)
                        : typeof row.created_at === "string" &&
                            isValidIsoDate(row.created_at.slice(0, 10))
                          ? row.created_at.slice(0, 10)
                          : "";
                  const rowId = String(row.id ?? "");
                  const rowSlug = String(row.edition_label ?? "");
                  const parsedCadence =
                    row.edition_type === "special"
                      ? "special"
                      : parseCadenceAnchor(
                          rowSlug,
                          typeof row.edition_type === "string" ? row.edition_type : null,
                        ).cadence;
                  const extractedTargetSegment =
                    normalizeTargetSegment(
                      row.target_segments ?? content.target_segment ?? content.targetSegment,
                    ) ?? "all";
                  const extractedSections = normalizeEditorSections(
                    content.sections,
                    parsedCadence === "special" ? "weekly" : parsedCadence,
                  );
                  const extractedMonthlyRegion = normalizeMonthlyRegion(
                    content.monthlyRegion ?? content.monthly_region,
                  );
                  const extractedMonthlyPairId = normalizeMonthlyPairId(
                    content.monthlyPairId ?? content.monthly_pair_id,
                  );
                  const extractedMonthlyCharts = normalizeSavedMonthlyCharts(
                    content.monthlyCharts ?? content.monthly_charts,
                  );
                  const computedPublicUrl =
                    buildSafePublicUrl({
                      brokerSlug: currentBrokerSlug,
                      issueDate: rawIssueDate,
                      editionId: rowId,
                      targetSegment: extractedTargetSegment,
                    }) ?? undefined;

                  const extractedBriefing = String(
                    content.briefing_body_md ??
                      row.theme_body_md ??
                      fieldNote.comment ??
                      content.theme_body_md ??
                      content.briefing ??
                      "",
                  ).trim();
                  const rawSummaryCandidate = String(
                    content.summary ?? content.briefing ?? content.ai_briefing ?? "",
                  ).trim();
                  const extractedSummary =
                    rawSummaryCandidate && rawSummaryCandidate !== extractedBriefing
                      ? rawSummaryCandidate
                      : "";
                  const extractedThemeTitle = String(
                    row.theme_title ?? content.briefing_title ?? content.theme_title ?? "",
                  ).trim();
                  // NL-01 / NL-09: 레거시 topNews/news_curation 호환 복원
                  const extractedUnitIssues = resolveUnitIssuesFromData(content, {
                    fallbackFromTopNews: true,
                  });
                  return {
                    id: rowId,
                    slug: rowSlug,
                    title: String(row.title ?? content.headline ?? "").trim(),
                    status: String(row.status ?? "draft"),
                    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
                    publishedAt:
                      typeof row.published_at === "string" ? row.published_at : null,
                    dealCount: dealIds.length,
                    hasBriefing: Boolean(extractedBriefing || extractedSummary),
                    summary: extractedSummary,
                    briefingTitle: extractedThemeTitle,
                    briefingBody: extractedBriefing,
                    marketTemp:
                      typeof row.market_temp === "string"
                        ? (row.market_temp as MarketTemperature)
                        : typeof content.market_temp === "string"
                          ? (content.market_temp as MarketTemperature)
                          : null,
                    monthlyRegion: extractedMonthlyRegion,
                    monthlyPairId: extractedMonthlyPairId,
                    monthlyCharts: extractedMonthlyCharts,
                    selectedDealIds: dealIds,
                    dealComments: dealCommentsMap,
                    unitIssues: extractedUnitIssues,
                    sections: extractedSections,
                    targetSegment: extractedTargetSegment,
                    issueDate: rawIssueDate || undefined,
                    publicUrl: computedPublicUrl,
                    cadence: parsedCadence,
                  };
                });
              setEditions(mapped);

              // URL ?editionId= 또는 이전 세션의 에디션 선택 상태를 서버 데이터와 안전히 정합화 (NL-01)
              const sessionKey =
                typeof window !== "undefined"
                  ? window.sessionStorage.getItem(LAST_ACTIVE_SLOT_SESSION_KEY)
                  : null;
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
              }
            }
          }
        }

        if (buildingsRes && buildingsRes.ok) {
          const bJson = (await buildingsRes.json().catch(() => null)) as Record<
            string,
            unknown
          > | null;
          const list = Array.isArray(bJson?.buildings)
            ? bJson.buildings
            : Array.isArray(bJson?.items)
              ? bJson.items
              : [];
          const mappedDeals: AssignableDealItem[] = list
            .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
            .map((b, idx) => {
              const address = sanitizeDealAddress(String(b.address ?? b.dong ?? ""));
              const rawName = String(
                b.building_name ?? b.buildingName ?? b.name ?? b.title ?? "",
              ).trim();
              const title = rawName || address || `등록 매물 ${idx + 1}`;
              const yieldNum =
                typeof b.cap_rate === "number"
                  ? b.cap_rate
                  : typeof b.capRatePct === "number"
                    ? b.capRatePct
                    : typeof b.yield === "number"
                      ? b.yield
                      : null;
              return {
                id: String(b.id ?? `deal-${idx}`),
                title,
                address: address || "주소 미입력",
                price: formatDealPriceLabel(
                  b.sale_price ?? b.askingPriceWon ?? b.price,
                  b.price_band,
                ),
                yield: yieldNum && yieldNum > 0 ? `${yieldNum.toFixed(1)}%` : "-",
                photoUrl:
                  typeof b.photo_url === "string" && b.photo_url.trim()
                    ? b.photo_url
                    : null,
              };
            });
          setDeals(mappedDeals);
        }
      } catch {
        // 초기 로드 실패 시에도 로컬 작성은 가능하도록 유지
      } finally {
        if (mounted) hydratedRef.current = true;
      }
    }

    void loadInitialWorkspace();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 URL 쿼리(?editionId= / ?cadence=) 변경 동기화 — editionId를 의존성에 넣지 않아 좌측 클릭 역전 현상 원천 차단 (NL-11)
  const urlEditionId = searchParams?.get?.("editionId") ?? null;
  const urlCadence = searchParams?.get?.("cadence") ?? null;
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEditionId, urlCadence, editions]);

  // 월간 상단 통계 그래픽 2선 — 공공 DB(external_transactions / rental_trend_data / commercial_district) 실시간 적재 행이 있으면 자동 승격
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
      .then((res) => (res && res.ok ? res.json() : null))
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
      })
      .catch(() => {
        // 오프라인/모킹 환경에서는 결정론적 기준 참고치(buildDefaultMonthlyGraphicPair) 유지
      });
    return () => {
      active = false;
    };
  }, [cadence, monthlyRegion, monthlyPairId, issueYear, issueMonth]);

  // ── 7. 서버 저장 핸들러 (NL-02 임시저장/발행 분리, NL-06 YYYY-MM-DD 공개 주소 & 정정 발행 폴백, NL-07 월간 통계 저장) ──
  const handleServerSave = useCallback(
    async (opts?: {
      saveAsDraft?: boolean;
    }): Promise<{
      ok: boolean;
      publicUrl: string | null;
      savedEditionId: string | null;
      savedIssueDate: string;
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
          const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          const returnedSlug =
            typeof json?.brokerSlug === "string" && !isUuidLike(json.brokerSlug)
              ? json.brokerSlug.trim()
              : "";
          const effectiveBrokerSlug = returnedSlug || brokerSlug;
          if (returnedSlug) {
            setBrokerSlug(returnedSlug);
          }

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

          setPublishedUrl(resolvedUrl);
          setIsPublished(!shouldSaveAsDraft);
          setLocalStorageMode("none");
          setSaveState("saved");
          setLastSavedAt(new Date());

          try {
            if (typeof window !== "undefined") {
              const prevTempSlotKey = makeSlotStorageKey(null, cadence, issueSlug);
              const finalSlotKey = makeSlotStorageKey(effectiveId, cadence, savedEditionLabel);
              const savedDraftPayload: LocalNewsletterDraft = {
                brokerId: brokerId || undefined,
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
              const serialized = JSON.stringify(savedDraftPayload);
              if (prevTempSlotKey !== finalSlotKey) {
                window.localStorage.removeItem(prevTempSlotKey);
              }
              window.localStorage.setItem(finalSlotKey, serialized);
              window.localStorage.setItem(LEGACY_DRAFT_STORAGE_KEY, serialized);
              window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, finalSlotKey);
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

        // 기존 /api/magazine/editions/[id]/publish 엔드포인트 폴백 지원 (NL-06: BodySchema 정합화)
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
                  field_note: {
                    comment: briefingBody.trim(),
                  },
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
            const patchJson = (await patchRes.json().catch(() => null)) as Record<
              string,
              unknown
            > | null;
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
        }

        setSaveState("error");
        return {
          ok: false,
          publicUrl: null,
          savedEditionId: null,
          savedIssueDate: fallbackIsoDate,
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
      setStatusBanner({
        tone: "error",
        message: "임시저장에 실패했어요. 네트워크 상태를 확인한 뒤 다시 눌러 주세요.",
      });
    }
  }, [handleServerSave, isPublished]);

  const handleSelectStep = useCallback((nextStep: NewsletterStepKey) => {
    setActiveStep(nextStep);
    setStatusBanner(null);
    if (nextStep === "send" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:open-preview"));
    }
  }, []);

  // ── 8. 빠른 시작: 주기별(일간·주간·월간) 새로 쓰기 / 이전 호 불러오기 / 복제 / 삭제 ──
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
    const freshMonthlyCharts = buildDefaultMonthlyGraphicPair(mappedRegion, "reb_molit");
    setMarketTemp(null);
    setMonthlyRegion(mappedRegion);
    setMonthlyPairId("reb_molit");
    setMonthlyCharts(freshMonthlyCharts);
    setSelectedDealIds([]);
    setDealComments({});
    setSections(buildDefaultEditorSections(nextCadence));
    setTargetSegment("all");
    const freshIssues = clusterArticlesIntoFiveIssues(newsPool, {
      cadence: nextCadence,
      preferredRegions,
      preferredChannels,
    });
    setUnitIssues(freshIssues);
    setIsPublished(false);
    setPublishedUrl(null);
    setActiveStep("title");
    setLocalStorageMode("none");
    setSaveState("idle");
    setLastSavedAt(null);

    try {
      if (typeof window !== "undefined") {
        const newSlotKey = makeSlotStorageKey(null, nextCadence, targetSlotSlug);
        window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
        window.localStorage.setItem(
          newSlotKey,
          JSON.stringify({
            brokerId: brokerId || undefined,
            brokerSlug: brokerSlug || undefined,
            editionId: null,
            slotSlug: targetSlotSlug,
            cadence: nextCadence,
            issueYear: nowKst.year,
            issueMonth: nowKst.month,
            issueDateStr: today,
            isExplicitNewSlot: true,
            savedAt: new Date().toISOString(),
          }),
        );
        window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, newSlotKey);
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

  /** 발행 주기 전환: 이전 슬롯을 먼저 보존하고, 대상 주기에 저장본이 있으면 전체 필드를 불러온다 (NL-03) */
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
          const rawSlot = window.localStorage.getItem(targetSlotKey);
          if (rawSlot) {
            const parsedSlot = JSON.parse(rawSlot) as Record<string, unknown>;
            if (!isBrokerMismatch(parsedSlot, brokerId, brokerSlug)) {
              hydrateFromParsedDraft(parsedSlot, targetSlotKey);
              window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, targetSlotKey);
              loadedSlotDraft = true;
            }
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
        if (unitIssues.length === 0) {
          setUnitIssues(nextIssues);
        }
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

  /** 일간·주간 발행 기준 날짜 변경 (NL-03: 기존 호 매칭 시 전체 필드 일괄 로드) */
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
    const clonedPair = ed.monthlyPairId ?? "reb_molit";
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

  const handleDeleteEdition = async (
    ed: SavedEditionSummary,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    const snapshot = { ...ed };
    setEditions((prev) => prev.filter((item) => item.id !== ed.id));

    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(
          makeSlotStorageKey(ed.id, ed.cadence ?? "monthly", ed.slug),
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
      syncUrlParams(null, cadence);
    }

    if (isUuidLike(ed.id)) {
      const delRes = await fetch(
        `/api/magazine/editions?id=${encodeURIComponent(ed.id)}`,
        { method: "DELETE" },
      ).catch(() => null);
      if (delRes && !delRes.ok && delRes.status !== 404) {
        setEditions((prev) => [snapshot, ...prev]);
        setStatusBanner({
          tone: "error",
          message: "뉴스레터 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
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
          }).catch(() => null);
          if (restoreRes && restoreRes.ok) {
            const rJson = (await restoreRes.json().catch(() => null)) as Record<
              string,
              unknown
            > | null;
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

  // ── 9. 서식 막대 (소제목 / 강조 / 구분선) ──
  const handleFormatAction = (action: SimpleFormatActionId) => {
    const el = briefingTextareaRef.current;
    const selection = el
      ? {
          start: el.selectionStart ?? briefingBody.length,
          end: el.selectionEnd ?? briefingBody.length,
        }
      : undefined;
    const { text: nextText, selectionStart, selectionEnd } = applySimpleTextFormat(
      briefingBody,
      action,
      selection,
    );
    setBriefingBody(nextText);
    persistLocalDraft({ briefingBody: nextText });

    if (el) {
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          // ignore selection error in headless test env
        }
      });
    }
  };

  // ── 10. 매물, 코너 토글 및 월간 상단 주요 통계 그래픽 2선 편집 ──
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
                  deltaText: item.highlightMetric?.deltaText,
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

  // ── 10-B. 중개인 개인 설정(주력 권역 · 관심 뉴스 큐레이션 분야), AI 클러스터링 & 이전 이슈 복원 (NL-10) ──
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
      if (unitIssues.length > 0) {
        setPreviousIssuesSnapshot(unitIssues);
      }
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
      if (unitIssues.length > 0) {
        setPreviousIssuesSnapshot(unitIssues);
      }
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

    if (unitIssues.length > 0) {
      setPreviousIssuesSnapshot(unitIssues);
    }

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
      const json = (await res.json().catch(() => null)) as
        | { ok: true; unitIssues: AxiosUnitIssue[] }
        | null;
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
      }).catch(() => null);
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

  // NL-10: 단일 채널 새로고침 시 나머지 4개 채널 기사 풀을 지우지 않고 병합한다
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
      const json = (await res.json().catch(() => null)) as
        | { ok: true; items?: NewsPoolItem[] }
        | null;
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

  // ── 파생 데이터 ──
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
    () => normalizeReadableBriefingText(briefingBody),
    [briefingBody],
  );

  // ── 생애주기(4단계) 및 양방향 에디터 ↔ 미리보기 동기화 ──
  const hasBrokerAuthoredContent = Boolean(
    headline.trim() ||
      summary.trim() ||
      briefingTitle.trim() ||
      briefingBody.trim() ||
      selectedDealIds.length > 0 ||
      marketTemp !== null ||
      monthlyCharts.some((c) => c.sourceMode === "broker_custom") ||
      editionId !== null,
  );

  const previewLifecycle: PreviewLifecycleState = isPublished
    ? saveState === "dirty" || saveState === "error" || localStorageMode === "local_only"
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
      "nl-unit-summary": {
        unitId: "nl-unit-summary",
        label: "한 줄 소개",
        tab: "title",
        editorSelector: '[data-testid="issue-metadata-form"]',
        focusSelector: "#newsletter-summary-input",
      },
      "nl-unit-stats-0": {
        unitId: "nl-unit-stats-0",
        label: "주요 통계 그래픽 1번",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("market_data")) {
            handleToggleSection("market_data", true);
          }
        },
        editorSelector: '[data-testid="monthly-stats-authoring-card"]',
        focusSelector: "#monthly-stat-val-0",
      },
      "nl-unit-stats-1": {
        unitId: "nl-unit-stats-1",
        label: "주요 통계 그래픽 2번",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("market_data")) {
            handleToggleSection("market_data", true);
          }
        },
        editorSelector: '[data-testid="monthly-stats-authoring-card"]',
        focusSelector: "#monthly-stat-val-1",
      },
      "nl-unit-briefing": {
        unitId: "nl-unit-briefing",
        label: "시장 브리핑 글",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("field_note")) {
            handleToggleSection("field_note", true);
          }
        },
        editorSelector: '[data-testid="market-briefing-editor"]',
        focusSelector: "#newsletter-briefing-body",
      },
      "nl-unit-deals": {
        unitId: "nl-unit-deals",
        label: "추천 매물 고르기",
        tab: "content",
        onBeforeFocus: () => {
          if (!isSectionEnabled("featured_deals")) {
            handleToggleSection("featured_deals", true);
          }
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
          if (!isSectionEnabled("news_curation")) {
            handleToggleSection("news_curation", true);
          }
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
          if (!isSectionEnabled("featured_deals")) {
            handleToggleSection("featured_deals", true);
          }
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

  // ── 11. 정직한 링크 복사 (NL-06, NL-08: 유효 YYYY-MM-DD 주소 & ?target= 반영) ──
  const handleCopyLink = async () => {
    let targetUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);
    const needsServerSave =
      !targetUrl || !isPublished || saveState === "dirty" || saveState === "error";
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
        setStatusBanner({
          tone: "error",
          message: "아직 뉴스레터 주소를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
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

  // ── 12. 정직한 카카오톡 공유 (NL-06, NL-08) ──
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
    const needsServerSave =
      !targetUrl || !isPublished || saveState === "dirty" || saveState === "error";
    if (needsServerSave) {
      const saved = await handleServerSave({ saveAsDraft: false });
      if (!saved.ok || !saved.publicUrl) {
        setStatusBanner({
          tone: "error",
          message: "뉴스레터 저장에 실패해 공유 창을 열지 못했어요. 잠시 후 다시 눌러 주세요.",
        });
        return;
      }
      targetUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
    }

    const shareOutcome = await shareKakaoFeed({
      title: headline.trim(),
      description: summary.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
      imageUrl: `${getSiteOrigin()}/og-default.png`,
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

  // ── 13. 정직한 통합 발송 핸들러 (`[구독자에게 보내기]`, NL-05, NL-14) ──
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
      // 1단계: 실제 웹 발행 요청으로 공개 URL 확보
      const saved = await handleServerSave({ saveAsDraft: false });
      const publicUrl = appendTargetSegmentToUrl(saved.publicUrl, targetSegment);
      if (!saved.ok || !publicUrl) {
        setStatusBanner({
          tone: "error",
          message: "뉴스레터를 발행하지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      // 2단계: 구독자 실제 발송 엔진(/api/broker/magazine/distribute) + 활동 기록(/api/broker/inbox/actions)
      let sentCount = 0;
      if (saved.savedEditionId && isUuidLike(saved.savedEditionId)) {
        try {
          const distRes = await fetch("/api/broker/magazine/distribute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              editionId: saved.savedEditionId,
              editionType: cadence,
              title: headline.trim(),
              headline: summary.trim() || headline.trim(),
              market_temp: marketTemp ?? undefined,
              date: saved.savedIssueDate,
              target: targetSegment,
            }),
          });
          if (distRes.ok) {
            const distJson = (await distRes.json().catch(() => null)) as Record<
              string,
              unknown
            > | null;
            if (typeof distJson?.sent === "number" && distJson.sent > 0) {
              sentCount = distJson.sent;
            } else if (typeof distJson?.sentCount === "number" && distJson.sentCount > 0) {
              sentCount = distJson.sentCount;
            }
          }
        } catch {
          // 발송 게이트 비활성/네트워크 예외 시 수동 공유 결과로 정직하게 안내
        }
      }

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
        // 활동 로그 기록 실패 시에도 공유 흐름은 계속 진행
      }

      const shareResult = await shareKakaoFeed({
        title: headline.trim(),
        description: summary.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
        imageUrl: `${getSiteOrigin()}/og-default.png`,
        url: publicUrl,
        buttonTitle: "뉴스레터 열기",
      });

      if (sentCount > 0) {
        setStatusBanner({
          tone: "success",
          message: `구독자 ${sentCount}명에게 뉴스레터를 발송했습니다.`,
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

  // ── 중개인 개인 설정 카드 (주력 권역 & 뉴스 큐레이션 분야 — 1줄 요약 접기 · 내부 DOM 항상 유지) ──
  const preferredRegionsSummary =
    preferredRegions.length === 0
      ? "미선택"
      : preferredRegions.length <= 2
        ? preferredRegions.join(" · ")
        : `${preferredRegions.slice(0, 2).join(" · ")} 외 ${preferredRegions.length - 2}곳`;

  const brokerPreferencesCard = (
    <section
      data-testid="broker-newsletter-preferences-card"
      aria-label="내 주력 권역 및 뉴스 큐레이션 분야 설정"
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 shadow-2xs space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-slate-900 break-keep">
          맞춤 상권·분야: {preferredRegionsSummary} · {preferredChannels.length}개 분야
        </p>
        <button
          type="button"
          data-testid="toggle-broker-prefs-btn"
          aria-expanded={isPrefsOpen}
          onClick={() => setIsPrefsOpen((prev) => !prev)}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-100 transition cursor-pointer shrink-0"
        >
          {isPrefsOpen ? "접기 ▴" : "설정 바꾸기 ▾"}
        </button>
      </div>

      <div className={isPrefsOpen ? "space-y-4 pt-3 border-t border-slate-200" : "hidden"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">
            선택한 권역과 관심 분야를 바탕으로 맞춤형 핵심 이슈 5선과 초안을 구성합니다.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {previousIssuesSnapshot && (
              <button
                type="button"
                data-testid="prefs-undo-recluster-btn"
                onClick={handleUndoReclusterIssues}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-100"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>이전 이슈 복원</span>
              </button>
            )}
            <button
              type="button"
              data-testid="save-broker-prefs-btn"
              disabled={savingPrefs || isAiClustering}
              onClick={() => void handleSavePreferencesAndCluster()}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>
                {savingPrefs || isAiClustering
                  ? "맞춤 설정 반영 중…"
                  : "내 설정 저장 · 맞춤 이슈 갱신"}
              </span>
            </button>
          </div>
        </div>

        {/* 1. 주력 권역 칩 선택 */}
        <div className="space-y-2">
          <p className="text-sm font-extrabold text-slate-800">
            ① 주력 상권 · 권역 선택 (복수 선택 가능)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="주력 권역 선택">
            {BROKER_REGION_PRESETS.map((preset) => {
              const active = preferredRegions.includes(preset.label);
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`pref-region-chip-${preset.id}`}
                  data-active-pill={active ? "true" : undefined}
                  aria-pressed={active}
                  onClick={() => handleTogglePreferredRegion(preset.label)}
                  style={{
                    backgroundColor: active ? "#1D4ED8" : "#F8FAFC",
                    borderColor: active ? "#1E40AF" : "#CBD5E1",
                    color: active ? "#FFFFFF" : "#1E293B",
                  }}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
                    active
                      ? "border-blue-700 bg-blue-700 text-white shadow-xs"
                      : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span style={{ color: active ? "#FFFFFF" : "#1E293B" }}>
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 뉴스 큐레이션 5대 분야 선택 */}
        <div className="space-y-2">
          <p className="text-sm font-extrabold text-slate-800">
            ② 뉴스 큐레이션 관심 분야 (복수 선택 가능)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="뉴스 큐레이션 분야 선택">
            {SPECIFIC_NEWS_CHANNELS.map((ch) => {
              const active = preferredChannels.includes(ch.id);
              return (
                <button
                  key={ch.id}
                  type="button"
                  data-testid={`pref-channel-chip-${ch.id}`}
                  data-active-pill={active ? "true" : undefined}
                  aria-pressed={active}
                  onClick={() => handleTogglePreferredChannel(ch.id)}
                  style={{
                    backgroundColor: active ? "#1D4ED8" : "#F8FAFC",
                    borderColor: active ? "#1E40AF" : "#CBD5E1",
                    color: active ? "#FFFFFF" : "#1E293B",
                  }}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition flex items-center gap-1.5 ${
                    active
                      ? "border-blue-700 bg-blue-700 text-white shadow-xs"
                      : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden="true">{ch.emoji}</span>
                  <span style={{ color: active ? "#FFFFFF" : "#1E293B" }}>
                    {ch.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );

  // ════════════════════════════════════════════════════════════════════
  //  1열 (listSlot): 발행 주기 + 빠른 시작 + 검색·상태·호외 필터 + 복제·삭제
  // ════════════════════════════════════════════════════════════════════
  const cadenceCounts = NEWSLETTER_CADENCES.reduce<Record<NewsletterCadence, number>>(
    (acc, key) => {
      acc[key] = editions.filter((e) => (e.cadence ?? "monthly") === key).length;
      return acc;
    },
    { daily: 0, weekly: 0, monthly: 0 },
  );
  const specialCount = editions.filter((e) => e.cadence === "special").length;

  const visibleEditions = useMemo(() => {
    const trimmedSearch = editionSearchQuery.trim().toLowerCase();
    return editions.filter((e) => {
      if (editionCadenceFilter !== "all" && (e.cadence ?? "monthly") !== editionCadenceFilter) {
        return false;
      }
      if (editionStatusFilter === "published" && e.status !== "published") {
        return false;
      }
      if (editionStatusFilter === "draft" && e.status === "published") {
        return false;
      }
      if (trimmedSearch) {
        const haystack = `${e.title} ${e.slug} ${e.issueDate ?? ""}`.toLowerCase();
        if (!haystack.includes(trimmedSearch)) return false;
      }
      return true;
    });
  }, [editions, editionCadenceFilter, editionStatusFilter, editionSearchQuery]);

  const cadenceSelector = (testIdPrefix: string) => (
    <div
      role="radiogroup"
      aria-label="뉴스레터 발행 주기 선택"
      data-testid={`${testIdPrefix}-cadence-selector`}
      className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5"
    >
      {NEWSLETTER_CADENCES.map((key) => {
        const meta = NEWSLETTER_CADENCE_META[key];
        const selected = cadence === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`${testIdPrefix}-cadence-${key}`}
            onClick={() => handleChangeCadence(key)}
            className={`min-h-[44px] rounded-lg px-2 py-1.5 text-sm font-extrabold whitespace-nowrap transition ${
              selected
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-transparent text-slate-700 hover:bg-white"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );

  const filterTabs: Array<{ key: NewsletterCadence | "special" | "all"; label: string }> = [
    { key: "all", label: `전체 (${editions.length})` },
    ...NEWSLETTER_CADENCES.map((key) => ({
      key,
      label: `${NEWSLETTER_CADENCE_META[key].label} (${cadenceCounts[key]})`,
    })),
    ...(specialCount > 0 ? [{ key: "special" as const, label: `호외 (${specialCount})` }] : []),
  ];

  const editionCadenceLabelOf = (ed: SavedEditionSummary) =>
    ed.cadence === "special"
      ? "호외"
      : NEWSLETTER_CADENCE_META[ed.cadence ?? "monthly"].label;
  const editionDisplayTitle = (ed: SavedEditionSummary) =>
    ed.title || `${ed.slug} 뉴스레터`;
  /** 목록 날짜: 발행일(issueDate) → 발행 시각(publishedAt) → 수정 시각(updatedAt) */
  const editionListDate = (ed: SavedEditionSummary) =>
    ed.issueDate || ed.publishedAt || ed.updatedAt || null;

  const editionActiveFilters: ActiveFilterChip[] = [];
  if (editionStatusFilter !== "all") {
    editionActiveFilters.push({
      key: "status",
      label: `상태: ${editionStatusFilter === "published" ? "발행됨" : "작성 중"}`,
      onClear: () => setEditionStatusFilter("all"),
    });
  }
  if (editionCadenceFilter !== "all") {
    editionActiveFilters.push({
      key: "cadence",
      label: `주기: ${
        editionCadenceFilter === "special"
          ? "호외"
          : NEWSLETTER_CADENCE_META[editionCadenceFilter].label
      }`,
      onClear: () => setEditionCadenceFilter("all"),
    });
  }

  const selectedSavedEdition = editionId
    ? editions.find((e) => e.id === editionId) ?? null
    : null;

  const editionEmptyState =
    visibleEditions.length === 0 ? (
      <p className="text-sm font-medium text-slate-600 py-2 px-1">
        {editions.length === 0
          ? `아직 발행한 이전 호가 없습니다. ${cadenceMeta.periodWord} 첫 ${cadenceMeta.label} 뉴스레터를 시작해 보세요.`
          : "검색 조건에 맞는 뉴스레터가 없습니다."}
      </p>
    ) : null;

  const listSlot = (
    <WorkspaceListPanel
      testId="magazine-list-slot"
      className="text-slate-900"
      bodyLabel={<>지난 뉴스레터 {visibleEditions.length}건</>}
      controls={
        <>
          {/* <EditionAirtableList /> 호환 슬롯 — 주기별 탭(일간·주간·월간·호외) 및 검색·복제·삭제 */}
          <button
            type="button"
            data-testid="new-newsletter-btn"
            onClick={() => handleStartNewThisMonth()}
            className="w-full min-h-[48px] rounded-xl bg-blue-700 px-4 py-2.5 text-base font-extrabold text-white shadow-xs transition hover:bg-blue-800 flex items-center justify-center gap-2"
          >
            <FilePlus2 className="h-5 w-5" aria-hidden="true" />
            <span>{cadenceMeta.newButtonLabel}</span>
          </button>
          <h2
            data-testid="current-issue-label"
            className="truncate px-1 text-sm font-bold text-slate-600"
          >
            {autoMeta.yearMonthLabel} 뉴스레터
          </h2>

          {/* 발행 주기 (새로 쓰기 버튼의 기본 주기) */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-bold text-slate-700">
              발행 주기
            </span>
            {cadenceSelector("quickstart")}
          </div>

          {/* 제목·날짜 검색 입력 */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={editionSearchQuery}
              onChange={(e) => setEditionSearchQuery(e.target.value)}
              placeholder="제목 또는 날짜 검색..."
              aria-label="이전 호 제목 또는 날짜 검색"
              data-testid="edition-search-input"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <ListToolbar
            viewMode={listViewMode}
            onViewModeChange={setListViewMode}
            activeFilters={editionActiveFilters}
            filterPanel={
              <>
                {/* 상태별 필터 (전체 / 작성 중 / 발행됨) */}
                <div className="space-y-1">
                  <p className="px-0.5 text-sm font-bold text-slate-600">상태</p>
                  <div
                    role="group"
                    aria-label="발행 상태별 보기"
                    className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
                  >
                    {(
                      [
                        { key: "all", label: "전체" },
                        { key: "draft", label: "작성 중" },
                        { key: "published", label: "발행됨" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        data-testid={`edition-status-filter-${st.key}`}
                        aria-pressed={editionStatusFilter === st.key}
                        onClick={() => setEditionStatusFilter(st.key)}
                        className={`min-h-[40px] rounded-lg px-2 py-1 text-sm font-bold transition ${
                          editionStatusFilter === st.key
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 주기별 탭 (전체 / 일간 / 주간 / 월간 / 호외) */}
                <div className="space-y-1">
                  <p className="px-0.5 text-sm font-bold text-slate-600">주기</p>
                  <div
                    role="tablist"
                    aria-label="이전 호 주기별 보기"
                    className="flex flex-wrap gap-1.5"
                  >
                    {filterTabs.map((tab) => {
                      const activeFilter = editionCadenceFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={activeFilter}
                          data-testid={`edition-filter-${tab.key}`}
                          data-active-pill={activeFilter ? "true" : undefined}
                          onClick={() => setEditionCadenceFilter(tab.key)}
                          style={
                            activeFilter
                              ? { backgroundColor: "#1D4ED8", color: "#FFFFFF" }
                              : { backgroundColor: "#F1F5F9", color: "#334155" }
                          }
                          className={`min-h-[40px] rounded-lg px-2.5 py-1 text-sm font-bold transition ${
                            activeFilter
                              ? "bg-blue-700 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            }
          />
        </>
      }
    >
      {editionEmptyState ??
        (listViewMode === "simple" ? (
          <DateGroupedList
            items={visibleEditions}
            getDate={editionListDate}
            getKey={(ed) => ed.id}
            ariaLabel="지난 뉴스레터"
            renderRow={(ed) => (
              <SimpleListRow
                testId={`magazine-edition-item-${ed.id}`}
                title={editionDisplayTitle(ed)}
                date={editionListDate(ed)}
                status={
                  ed.status === "published"
                    ? { label: "발행됨", tone: "sent" }
                    : { label: "작성 중", tone: "draft" }
                }
                meta={
                  <span data-testid={`edition-cadence-badge-${ed.id}`}>
                    {editionCadenceLabelOf(ed)}
                  </span>
                }
                selected={editionId === ed.id}
                onSelect={() => handleSelectExistingEdition(ed)}
              />
            )}
          />
        ) : (
          <ul className="space-y-2" role="list">
            {visibleEditions.map((ed) => {
              const isCurrent = editionId === ed.id;
              const edCadenceLabel = editionCadenceLabelOf(ed);
              return (
                <li key={ed.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid={`magazine-edition-item-${ed.id}`}
                    data-selected={isCurrent ? "true" : "false"}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => handleSelectExistingEdition(ed)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectExistingEdition(ed);
                      }
                    }}
                    className={`w-full min-h-[48px] rounded-xl border p-3 text-left transition flex items-start gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isCurrent
                        ? "border-blue-600 bg-blue-50/70 text-slate-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <ListThumbnail
                      fallbackText={edCadenceLabel}
                      alt={`${editionDisplayTitle(ed)} 표지`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900 truncate">
                          {editionDisplayTitle(ed)}
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                          {ed.status === "published" ? "발행됨" : "작성 중"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-600 truncate">
                          <span
                            data-testid={`edition-cadence-badge-${ed.id}`}
                            className="mr-1 rounded bg-blue-50 px-1.5 py-0.5 text-sm font-extrabold text-blue-800"
                          >
                            {edCadenceLabel}
                          </span>
                          {ed.slug} · 추천 매물 {ed.dealCount}건
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-testid={`edition-duplicate-btn-${ed.id}`}
                            aria-label={`${ed.title || ed.slug} 복제`}
                            onClick={(e) => handleDuplicateEdition(ed, e)}
                            className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-bold text-slate-700 hover:bg-slate-100"
                          >
                            복제
                          </button>
                          <button
                            type="button"
                            data-testid={`edition-delete-btn-${ed.id}`}
                            aria-label={`${ed.title || ed.slug} 삭제`}
                            onClick={(e) => void handleDeleteEdition(ed, e)}
                            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2.5 py-1 text-sm font-bold text-rose-800 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>삭제</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
    </WorkspaceListPanel>
  );

  // ════════════════════════════════════════════════════════════════════
  //  2열 (editorSlot): 3단계 통합 편집 (① 제목 · ② 내용 · ③ 보내기) + 임시저장
  // ════════════════════════════════════════════════════════════════════
  const editorSlot = (
    <div
      data-testid="magazine-editor-slot"
      className="p-4 sm:p-6 space-y-5 text-slate-900"
    >
      <div data-testid="magazine-three-column-layout" className="space-y-5">
        {/* 상단 3단계 탭 막대 + 선택 호 복제·삭제 + 서버 임시저장 버튼 (NL-02) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="뉴스레터 작성 3단계"
            className="grid flex-1 min-w-[260px] grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs"
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

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {listViewMode === "simple" && selectedSavedEdition ? (
              <SelectedItemActions
                itemLabel={editionDisplayTitle(selectedSavedEdition)}
                onDuplicate={(e) => handleDuplicateEdition(selectedSavedEdition, e)}
                onDelete={(e) => void handleDeleteEdition(selectedSavedEdition, e)}
              />
            ) : null}

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

        {/* 상태 알림 배너 */}
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
            <div className="flex items-center gap-2.5">
              {statusBanner.tone === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <span>{statusBanner.message}</span>
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

        {/* ━━━ STEP 1: ① 제목 (표지 제목 입력 최상단 배치 → AI 초안 → 맞춤 지역·분야) ━━━ */}
        {activeStep === "title" && (
          <div
            id="newsletter-panel-title"
            role="tabpanel"
            aria-labelledby="newsletter-tab-title"
            className="space-y-4"
          >
            <div
              onFocusCapture={(e) => {
                const target = e.target as HTMLElement | null;
                if (target?.id === "newsletter-headline-input") {
                  sync.notifyEditorFocus("nl-unit-cover");
                } else if (target?.id === "newsletter-summary-input") {
                  sync.notifyEditorFocus("nl-unit-summary");
                } else {
                  sync.notifyEditorFocus("nl-unit-issue-meta");
                }
              }}
            >
              <IssueMetadataForm
                year={issueYear}
                month={issueMonth}
                cadence={cadence}
                onChangeCadence={handleChangeCadence}
                issueDate={issueDateStr}
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
                headline={headline}
                onChangeHeadline={(val) => {
                  setHeadline(val);
                  persistLocalDraft({ headline: val });
                }}
                summary={summary}
                onChangeSummary={(val) => {
                  setSummary(val);
                  persistLocalDraft({ summary: val });
                }}
                marketTemp={marketTemp}
                onChangeMarketTemp={(nextTemp) => {
                  setMarketTemp(nextTemp);
                  persistLocalDraft({ marketTemp: nextTemp });
                }}
              />
            </div>

            <div onFocusCapture={() => sync.notifyEditorFocus("nl-unit-ai-draft")}>
              <MagazineQuickDraftCard
                monthLabel={autoMeta.yearMonthLabel}
                cadence={cadence}
                regionFocus={regionFocus}
                onChangeRegionFocus={setRegionFocus}
                preferredRegions={preferredRegions}
                preferredChannels={preferredChannels}
                dealTitles={selectedDeals.map((d) => d.title)}
                newsTitles={unitIssues.map((u) => u.title)}
                currentDraft={{
                  headline,
                  summary,
                  briefingTitle,
                  briefingBody,
                }}
                onApplyDraft={(next: MagazineDraftSnapshot) => {
                  const nextHeadline = formatSingleLineTitle(next.headline, 80);
                  setHeadline(nextHeadline);
                  setSummary(next.summary);
                  setBriefingTitle(next.briefingTitle);
                  setBriefingBody(next.briefingBody);
                  persistLocalDraft({
                    headline: nextHeadline,
                    summary: next.summary,
                    briefingTitle: next.briefingTitle,
                    briefingBody: next.briefingBody,
                  });
                }}
              />
            </div>

            {brokerPreferencesCard}

            <div className="flex justify-end">
              <button
                type="button"
                data-testid="next-to-content-btn"
                onClick={() => handleSelectStep("content")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1D1D1F] px-5 py-3 text-base font-extrabold text-white transition hover:bg-[#2C2C2E]"
              >
                <span>다음: ② 내용 작성하기</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ━━━ STEP 2: ② 내용 ━━━ */}
        {activeStep === "content" && (
          <div
            id="newsletter-panel-content"
            role="tabpanel"
            aria-labelledby="newsletter-tab-content"
            className="space-y-5"
          >
            {/* 포함할 코너 켜기/끄기 (최상단 배치: 활성 코너부터 먼저 선택) */}
            <BlockSelectionGrid
              sections={sections}
              onToggleSection={handleToggleSection}
              cadence={cadence}
            />

            {/* 월간 전용: 상단 주요 통계 그래픽 2선 설정 카드 */}
            {cadence === "monthly" && isSectionEnabled("market_data") && (
              <section
                data-testid="monthly-stats-authoring-card"
                aria-label="월간 상단 주요 통계 그래픽 2선 설정"
                className="rounded-2xl border border-blue-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">
                      월간 상단 주요 통계 그래픽 2선
                    </h3>
                    <p className="text-sm font-medium text-slate-600">
                      월간 뉴스레터 맨 위에 카드뉴스형 막대 그래픽 2개가 표시됩니다. 권역과 지표 구성을 고르거나 수치를 직접 다듬을 수 있습니다.
                    </p>
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
                    {monthlyCharts.some((c) => c.sourceMode === "broker_custom")
                      ? "중개사 직접 입력"
                      : monthlyLiveDbAvailable ||
                          monthlyCharts.some((c) => c.sourceMode === "public_db")
                        ? "공공 DB 실측 집계"
                        : "시장 기준 참고치"}
                  </span>
                </div>

                {/* 1. 권역 선택 */}
                <div
                  className="space-y-2"
                  onFocusCapture={() => sync.notifyEditorFocus("nl-unit-stats-0")}
                >
                  <p className="text-sm font-extrabold text-slate-800">
                    ① 기준 권역 선택
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="월간 통계 권역 선택">
                    {MONTHLY_REGION_PRESETS.map((preset) => {
                      const selected = monthlyRegion === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          data-testid={`monthly-stat-region-${preset.key}`}
                          aria-pressed={selected}
                          onClick={() => handleChangeMonthlyRegion(preset.key)}
                          className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
                            selected
                              ? "border-blue-600 bg-blue-700 text-white shadow-2xs"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {preset.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. 상단 2개 그래픽 조합 선택 */}
                <div
                  className="space-y-2"
                  onFocusCapture={() => sync.notifyEditorFocus("nl-unit-stats-0")}
                >
                  <p className="text-sm font-extrabold text-slate-800">
                    ② 상단 그래픽 2선 조합 선택
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="통계 그래픽 2선 조합">
                    {MONTHLY_GRAPHIC_PAIR_PRESETS.map((pairPreset) => {
                      const selected = monthlyPairId === pairPreset.id;
                      return (
                        <button
                          key={pairPreset.id}
                          type="button"
                          data-testid={`monthly-stat-pair-${pairPreset.id}`}
                          aria-pressed={selected}
                          onClick={() => handleChangeMonthlyPair(pairPreset.id)}
                          className={`min-h-[48px] rounded-xl border p-3 text-left transition space-y-1 ${
                            selected
                              ? "border-blue-600 bg-blue-50 text-blue-950"
                              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm font-extrabold">{pairPreset.shortLabel}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                              {pairPreset.badge}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. 그래픽별 대표 수치 & 매수자 체크포인트 직접 다듬기 */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-slate-800">
                      ③ 대표 수치 · 매수자 체크포인트 다듬기 (선택)
                    </p>
                    {monthlyCharts.some((c) => c.sourceMode === "broker_custom") && (
                      <button
                        type="button"
                        data-testid="monthly-stat-reset-btn"
                        onClick={handleResetMonthlyCharts}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>기준치 복원</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {monthlyCharts.slice(0, 2).map((chart, idx) => (
                      <div
                        key={chart.id || idx}
                        onFocusCapture={() => sync.notifyEditorFocus(`nl-unit-stats-${idx}`)}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
                      >
                        <p className="text-sm font-extrabold text-slate-900">
                          그래픽 0{idx + 1} · {chart.title}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <label
                              htmlFor={`monthly-stat-val-${idx}`}
                              className="block text-sm font-bold text-slate-700"
                            >
                              대표 수치 강조
                            </label>
                            <input
                              id={`monthly-stat-val-${idx}`}
                              data-testid={`monthly-stat-highlight-input-${idx}`}
                              type="text"
                              value={chart.highlightMetric?.value ?? ""}
                              onChange={(e) =>
                                handleUpdateMonthlyChartField(idx, {
                                  highlightValue: e.target.value,
                                })
                              }
                              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1">
                            <label
                              htmlFor={`monthly-stat-imp-${idx}`}
                              className="block text-sm font-bold text-slate-700"
                            >
                              매수자 체크포인트 한 줄 해설
                            </label>
                            <input
                              id={`monthly-stat-imp-${idx}`}
                              data-testid={`monthly-stat-implication-input-${idx}`}
                              type="text"
                              value={chart.buyerImplication ?? ""}
                              onChange={(e) =>
                                handleUpdateMonthlyChartField(idx, {
                                  buyerImplication: e.target.value,
                                })
                              }
                              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* 시장 브리핑 코너 OFF 안내 배너 (NL-14) */}
            {!isSectionEnabled("field_note") && (
              <div
                data-testid="briefing-section-disabled-notice"
                role="status"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  현재 &apos;시장 브리핑&apos; 코너가 꺼져 있어 발행본에 표시되지 않습니다.
                </span>
                <button
                  type="button"
                  data-testid="enable-briefing-section-btn"
                  onClick={() => handleToggleSection("field_note", true)}
                  className="min-h-[44px] rounded-xl border border-amber-400 bg-white px-3.5 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-100"
                >
                  코너 켜기
                </button>
              </div>
            )}

            {/* 시장 브리핑 글 + 3버튼 서식 막대 (코너 OFF 시 입력 영역을 hidden으로 보호하되 DOM은 유지) */}
            <section
              data-testid="market-briefing-editor"
              aria-label="시장 브리핑 글 작성"
              onFocusCapture={() => sync.notifyEditorFocus("nl-unit-briefing")}
              className={`rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4 ${
                !isSectionEnabled("field_note") ? "opacity-75" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-700" aria-hidden="true" />
                    <h3 className="text-base font-extrabold text-slate-900">
                      시장 브리핑 글
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    {isSectionEnabled("field_note")
                      ? "①단계 표지 제목·한줄소개와 별도로 본문 상단에 실리는 칼럼입니다. 아래 버튼으로 표지 내용을 바로 가져와 다듬을 수 있습니다."
                      : "코너가 꺼져 있어 입력칸을 접어 두었습니다. 위 [코너 켜기]를 누르면 바로 작성할 수 있습니다."}
                  </p>
                </div>
                <div
                  className={
                    isSectionEnabled("field_note")
                      ? "flex flex-wrap items-center gap-2"
                      : "hidden"
                  }
                >
                  {(headline.trim() || summary.trim()) && (
                    <button
                      type="button"
                      data-testid="copy-cover-to-briefing-btn"
                      onClick={() => {
                        const nextTitle = headline.trim() || briefingTitle;
                        const nextBody = summary.trim() || briefingBody;
                        setBriefingTitle(nextTitle);
                        setBriefingBody(nextBody);
                        persistLocalDraft({
                          briefingTitle: nextTitle,
                          briefingBody: nextBody,
                        });
                        setStatusBanner({
                          tone: "info",
                          message: "①단계 표지 제목·한줄소개를 시장 브리핑 초안으로 가져왔습니다.",
                        });
                      }}
                      className="min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-extrabold text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      ① 표지 제목·소개 가져오기
                    </button>
                  )}
                  <AiCommentRecommendButton
                    currentValue={briefingBody}
                    fallbackContext={
                      [autoMeta.yearMonthLabel, regionFocus, headline, summary]
                        .filter(Boolean)
                        .join(" · ") || "이번 달 상업용 빌딩 시장 분위기"
                    }
                    onChangeValue={(next) => {
                      setBriefingBody(next);
                      persistLocalDraft({ briefingBody: next });
                    }}
                    label="AI로 추천글 쓰기"
                  />
                </div>
              </div>

              <div
                data-testid="market-briefing-editor-body"
                className={isSectionEnabled("field_note") ? "space-y-4" : "hidden"}
              >
                <div className="space-y-2">
                  <label
                    htmlFor="newsletter-briefing-title"
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    브리핑 소제목
                  </label>
                  <input
                    id="newsletter-briefing-title"
                    type="text"
                    value={briefingTitle}
                    onChange={(e) => {
                      setBriefingTitle(e.target.value);
                      persistLocalDraft({ briefingTitle: e.target.value });
                    }}
                    placeholder="예: 이달의 강남·서초 빌딩 매수 분위기"
                    className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* 3버튼 서식 막대: [소제목] [강조] [구분선] */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="newsletter-briefing-body"
                      className="block text-sm font-extrabold text-slate-800"
                    >
                      브리핑 본문
                    </label>
                    <div
                      role="toolbar"
                      aria-label="본문 서식 도구"
                      className="flex flex-wrap items-center gap-2"
                    >
                      {SIMPLE_FORMAT_ACTIONS.map((fmtAction) => (
                        <button
                          key={fmtAction.id}
                          type="button"
                          data-testid={`format-btn-${fmtAction.id}`}
                          onClick={() => handleFormatAction(fmtAction.id)}
                          title={fmtAction.description}
                          className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-100"
                        >
                          {fmtAction.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={briefingTextareaRef}
                    id="newsletter-briefing-body"
                    rows={5}
                    value={briefingBody}
                    onChange={(e) => {
                      setBriefingBody(e.target.value);
                      persistLocalDraft({ briefingBody: e.target.value });
                    }}
                    placeholder="현장에서 느끼신 매수·매도 분위기나 독자에게 전하고 싶은 이야기를 편하게 적어 주세요."
                    className="w-full rounded-xl border border-slate-300 bg-white p-4 text-base font-medium leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none resize-y"
                  />
                </div>
              </div>
            </section>

            {/* 추천 매물 고르기 */}
            <div
              onFocusCapture={(e) => {
                const target = e.target as HTMLElement | null;
                const itemEl = target?.closest("[data-testid^='deal-slot-item-']");
                const testId = itemEl?.getAttribute("data-testid") ?? "";
                const dealId = testId.replace("deal-slot-item-", "");
                if (dealId) {
                  sync.notifyEditorFocus(`nl-unit-deal-${dealId}`);
                } else {
                  sync.notifyEditorFocus("nl-unit-deals");
                }
              }}
            >
              <DealSlotAssigner
                deals={deals}
                selectedDealIds={selectedDealIds}
                onToggleDeal={handleToggleDeal}
                dealComments={dealComments}
                onChangeDealComment={handleChangeDealComment}
              />
            </div>

            {/* 핵심 이슈 포스트잇 5선 (중복 brokerPreferencesCard 제거, 1열 이동 콜백 연결) */}
            {isSectionEnabled("news_curation") && (
              <div
                onFocusCapture={(e) => {
                  const target = e.target as HTMLElement | null;
                  const cardEl = target?.closest("[data-testid^='axios-issue-card-editor-']");
                  const testId = cardEl?.getAttribute("data-testid") ?? "";
                  const idxStr = testId.replace("axios-issue-card-editor-", "");
                  if (idxStr !== "") {
                    sync.notifyEditorFocus(`nl-unit-issue-${idxStr}`);
                  }
                }}
              >
                <AxiosIssuesEditorPanel
                  unitIssues={unitIssues}
                  onChangeUnitIssues={(next) => {
                    setUnitIssues(next);
                    persistLocalDraft({ unitIssues: next });
                  }}
                  newsPool={newsPool}
                  cadenceLabel={autoMeta.yearMonthLabel}
                  preferredRegions={preferredRegions}
                  preferredChannels={preferredChannels}
                  dealTitles={selectedDeals.map((d) => `${d.title} ${d.address}`)}
                  onAiClusterIssues={() => handleAiClusterIssues()}
                  isAiClustering={isAiClustering}
                  onRefreshLiveChannel={handleRefreshLiveChannel}
                  canUndoRecluster={previousIssuesSnapshot !== null}
                  onUndoRecluster={handleUndoReclusterIssues}
                  onOpenPreferences={() => {
                    setIsPrefsOpen(true);
                    setActiveStep("title");
                  }}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleSelectStep("title")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>이전: ① 제목</span>
              </button>
              <button
                type="button"
                data-testid="next-to-send-btn"
                onClick={() => handleSelectStep("send")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1D1D1F] px-5 py-3 text-base font-extrabold text-white transition hover:bg-[#2C2C2E]"
              >
                <span>다음: ③ 보내기</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ━━━ STEP 3: ③ 보내기 ━━━ */}
        {activeStep === "send" && (
          <div
            id="newsletter-panel-send"
            role="tabpanel"
            aria-labelledby="newsletter-tab-send"
            className="space-y-5"
          >
            {/* 미완료 항목이 있을 때만 1줄 안내 (활성 코너 연동 — NL-14) */}
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

            {/* 받을 고객 확인 */}
            <div onFocusCapture={() => sync.notifyEditorFocus("nl-unit-send")}>
              <SendListSummaryBar
                targetSegment={targetSegment}
                onChangeTargetSegment={(nextSeg) => {
                  setTargetSegment(nextSeg);
                  persistLocalDraft({ targetSegment: nextSeg });
                }}
                totalSubscriberCount={subscriberCount}
                highInterestCount={highInterestCount}
                sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
              />
            </div>

            {/* 카카오톡 공유 및 링크 복사 보조 도구 */}
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
                  onClick={handleKakaoShare}
                  className="min-h-[48px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-extrabold text-amber-950 hover:bg-amber-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  <span>카카오톡으로 공유</span>
                </button>

                <button
                  type="button"
                  data-testid="copy-link-btn"
                  onClick={handleCopyLink}
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
                onClick={() => handleSelectStep("content")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>이전: ② 내용 수정하기</span>
              </button>

              <button
                type="button"
                data-testid="newsletter-step3-send-btn"
                onClick={handleSendSelected}
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
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  3열 (previewSlot): 실시간 뉴스레터 미리보기 (SIMPLE_SECTION_ORDER와 1:1 정렬 — NL-13)
  // ════════════════════════════════════════════════════════════════════
  const activeReaderPreviewUrl = appendTargetSegmentToUrl(publishedUrl, targetSegment);

  const previewSlot = (
    <div
      data-testid="magazine-preview-slot"
      className="p-4 sm:p-5 space-y-4 text-slate-900"
    >
      {/* 4단계 생애주기 인과 상태 표시줄 (상단 고정) */}
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

      {/* 미완료 항목이 있을 때만 1줄 안내 (생성 전 중복 차단 + ③ 보내기 탭과 좌우 중복 방지) */}
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

      {/* 생성 전(pre_generation) 정직한 입력 안내 카드 */}
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

      {/* 실시간 뉴스레터 미리보기 카드 */}
      <article
        aria-label="실시간 뉴스레터 미리보기"
        className={`rounded-2xl bg-white p-5 shadow-2xs space-y-5 transition-opacity ${
          previewLifecycle === "pre_generation"
            ? "border-2 border-dashed border-slate-300 opacity-80"
            : "border border-slate-200"
        }`}
      >
        {previewLifecycle === "pre_generation" && (
          <div
            data-testid="preview-sample-framing-banner"
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-700"
          >
            기본 예시 구성 · 제목을 입력하면 내 뉴스레터로 전환됩니다
          </div>
        )}

        <header className="border-b border-slate-200 pb-4 space-y-3">
          <PreviewEditableUnit
            unitId="nl-unit-issue-meta"
            label="발행 호수 및 주기"
            isActive={sync.activeUnitId === "nl-unit-issue-meta"}
            onActivate={sync.focusEditorUnit}
            className="rounded-xl px-2.5 pt-3.5 pb-2 -mx-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
                {autoMeta.yearMonthLabel} 뉴스레터
              </span>
              {marketTemp && (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">
                  시장 분위기: {marketTemp}
                </span>
              )}
            </div>
          </PreviewEditableUnit>

          <PreviewEditableUnit
            unitId="nl-unit-cover"
            label="미리보기 대표 헤드라인"
            isActive={sync.activeUnitId === "nl-unit-cover"}
            onActivate={sync.focusEditorUnit}
            className="rounded-xl px-2.5 pt-3.5 pb-2 -mx-2.5"
          >
            <h2
              data-single-line-title="true"
              className="break-keep leading-snug text-xl font-extrabold text-slate-900"
            >
              {headline.trim() || "표지 제목을 입력하면 이곳에 바로 표시됩니다"}
            </h2>
          </PreviewEditableUnit>

          {summary.trim() && (
            <PreviewEditableUnit
              unitId="nl-unit-summary"
              label="미리보기 요약 문장"
              isActive={sync.activeUnitId === "nl-unit-summary"}
              onActivate={sync.focusEditorUnit}
              className="rounded-xl px-2.5 pt-3.5 pb-2 -mx-2.5"
            >
              <p className="text-base font-medium text-slate-700 leading-relaxed">
                {summary}
              </p>
            </PreviewEditableUnit>
          )}
          {brokerName && (
            <p className="text-sm font-bold text-slate-600">
              발행인: {brokerName}
            </p>
          )}
        </header>

        {/* 1) 월간 전용: 첫 머리 주요 통계 그래픽 2선 (market_data — 헤더 직후 최상단 배치) */}
        {cadence === "monthly" && isSectionEnabled("market_data") && (
          <section
            data-testid="preview-monthly-stats-section"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                이달의 주요 시장 통계 2선
              </h3>
              <span className="text-sm font-bold text-slate-600">
                {MONTHLY_REGION_PRESETS.find((p) => p.key === monthlyRegion)?.shortLabel ?? "강남·서초"} 기준
              </span>
            </div>
            <div className="pt-2 space-y-4">
              {monthlyCharts.slice(0, 2).map((chart, idx) => (
                <PreviewEditableUnit
                  key={chart.id || idx}
                  unitId={`nl-unit-stats-${idx}`}
                  label={`주요 통계 그래픽 ${idx + 1}번`}
                  isActive={sync.activeUnitId === `nl-unit-stats-${idx}`}
                  onActivate={sync.focusEditorUnit}
                  className="rounded-2xl"
                >
                  <MonthlyGlassStatCard
                    index={idx}
                    chart={chart}
                    size="preview"
                    cardTestId={`preview-monthly-chart-card-${idx}`}
                  />
                </PreviewEditableUnit>
              ))}
            </div>
          </section>
        )}

        {/* 주간 전용: 작성된 주간 시장 브리핑이 있으면 이슈 5선 앞에 배치 */}
        {cadence === "weekly" &&
          isSectionEnabled("field_note") &&
          formattedPreviewBriefing.trim().length > 0 && (
            <PreviewEditableUnit
              as="section"
              testId="preview-market-briefing-section"
              unitId="nl-unit-briefing"
              label="미리보기 브리핑 칼럼"
              isActive={sync.activeUnitId === "nl-unit-briefing"}
              onActivate={sync.focusEditorUnit}
              className="rounded-xl space-y-2 px-2.5 pt-3.5 pb-2 -mx-2.5"
            >
              <h3 className="text-base font-extrabold text-slate-900">
                {briefingTitle.trim() || cadenceMeta.briefingFallbackTitle}
              </h3>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800 whitespace-pre-line leading-relaxed">
                {formattedPreviewBriefing.trim()}
              </div>
            </PreviewEditableUnit>
          )}

        {/* 2) 핵심 이슈 5선 브리핑 미리보기 (news_curation — 월간은 통계 2선 직후 배치) */}
        {isSectionEnabled("news_curation") && unitIssues.length > 0 && (
          <section
            data-testid="preview-axios-postit-section"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {cadenceMeta.label} 핵심 시장 이슈 5선
              </h3>
              <span className="text-sm font-bold text-slate-600">
                {preferredRegions.slice(0, 2).join(" · ")} 맞춤
              </span>
            </div>
            <div className="pt-2 space-y-4" role="list">
              {unitIssues.slice(0, 5).map((issue, idx) => {
                const chMeta =
                  issue.channel && NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                    ? NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                    : NEWS_CHANNEL_MAP.real_estate;
                const copy = normalizeAxiosIssueCopy({
                  title: issue.title,
                  brief: issue.brief,
                  channel: chMeta.id === "all" ? "real_estate" : chMeta.id,
                });
                return (
                  <PreviewEditableUnit
                    key={issue.id || idx}
                    unitId={`nl-unit-issue-${idx}`}
                    label={`핵심 이슈 ${idx + 1}번 카드`}
                    isActive={sync.activeUnitId === `nl-unit-issue-${idx}`}
                    onActivate={sync.focusEditorUnit}
                    className="rounded-2xl"
                  >
                    <ul className="list-none m-0 p-0">
                      <AxiosGlassIssueCard
                        index={idx}
                        tone={issue.memoTone}
                        title={copy.title || issue.title}
                        brief={copy.brief}
                        size="preview"
                        channelEmoji={chMeta.emoji}
                        channelLabel={chMeta.shortLabel}
                        cardTestId={`preview-postit-card-${idx}`}
                        titleTestId={`preview-postit-title-${idx}`}
                        briefTestId={`preview-postit-brief-${idx}`}
                        titleAs="h4"
                      />
                    </ul>
                  </PreviewEditableUnit>
                );
              })}
            </div>
          </section>
        )}

        {/* 3) 시장 브리핑 칼럼 (월간·일간·호외 — 실제 작성된 글이 있을 때만 표시, 빈 안내 박스 미노출) */}
        {cadence !== "weekly" &&
          isSectionEnabled("field_note") &&
          formattedPreviewBriefing.trim().length > 0 && (
            <PreviewEditableUnit
              as="section"
              testId="preview-market-briefing-section"
              unitId="nl-unit-briefing"
              label="미리보기 브리핑 칼럼"
              isActive={sync.activeUnitId === "nl-unit-briefing"}
              onActivate={sync.focusEditorUnit}
              className="rounded-xl space-y-2 px-2.5 pt-3.5 pb-2 -mx-2.5"
            >
              <h3 className="text-base font-extrabold text-slate-900">
                {briefingTitle.trim() || cadenceMeta.briefingFallbackTitle}
              </h3>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800 whitespace-pre-line leading-relaxed">
                {formattedPreviewBriefing.trim()}
              </div>
            </PreviewEditableUnit>
          )}

        {/* 4) 추천 매물 미리보기 (featured_deals) */}
        {isSectionEnabled("featured_deals") && (
          <PreviewEditableUnit
            as="section"
            testId="preview-featured-deals-section"
            unitId="nl-unit-deals"
            label="추천 매물 고르기"
            isActive={sync.activeUnitId === "nl-unit-deals"}
            onActivate={sync.focusEditorUnit}
            className="rounded-xl space-y-3 px-2.5 pt-3.5 pb-2 -mx-2.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                추천 매물 소개
              </h3>
              <span className="text-sm font-bold text-slate-600">
                {selectedDeals.length}건
              </span>
            </div>

            {selectedDeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-600">
                선택된 추천 매물이 아직 없습니다.
              </div>
            ) : (
              <ul className="space-y-2.5" role="list">
                {selectedDeals.map((deal) => (
                  <li key={deal.id}>
                    <PreviewEditableUnit
                      unitId={`nl-unit-deal-${deal.id}`}
                      label={`${deal.title} 추천글`}
                      isActive={sync.activeUnitId === `nl-unit-deal-${deal.id}`}
                      onActivate={sync.focusEditorUnit}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {deal.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={deal.photoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Building2 className="h-6 w-6 text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-base font-extrabold text-slate-900 truncate">
                          {deal.title}
                        </p>
                        <p className="text-sm font-medium text-slate-600">
                          {deal.address} · 매매가 {deal.price}
                        </p>
                        {dealComments[deal.id]?.trim() && (
                          <p className="text-sm font-bold text-blue-900 bg-blue-50 rounded-lg px-2.5 py-1.5">
                            {dealComments[deal.id]}
                          </p>
                        )}
                      </div>
                    </PreviewEditableUnit>
                  </li>
                ))}
              </ul>
            )}
          </PreviewEditableUnit>
        )}

        {/* 5) 중개사 문의 · 연락처 카드 (broker_profile — 고객 화면 하단 문의 영역과 1:1 정렬) */}
        <PreviewEditableUnit
          as="section"
          testId="preview-broker-contact-section"
          unitId="nl-unit-broker"
          label="담당 중개사 정보"
          isActive={sync.activeUnitId === "nl-unit-broker"}
          onActivate={sync.focusEditorUnit}
          className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  {brokerName.trim() || "담당 공인중개사"}
                </h3>
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-sm font-bold text-blue-900">
                  문의 · 상담
                </span>
              </div>
              {brokerOffice.trim() && (
                <p className="text-sm font-bold text-slate-700">
                  {brokerOffice.trim()}
                </p>
              )}
            </div>
            {brokerPhone.trim() && (
              <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-900">
                전화 {brokerPhone.trim()}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            추천 매물 상세 자료(IM) 열람이나 매수·임대·자산관리 상담이 필요하시면 언제든 편하게 문의해 주세요.
          </p>
        </PreviewEditableUnit>
      </article>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  단 하나의 주 행동 버튼 (생애주기 정직 반영 + 전체 너비 정렬)
  // ════════════════════════════════════════════════════════════════════
  const primaryActionSlot = (
    <button
      type="button"
      data-testid="newsletter-primary-send-btn"
      onClick={
        isPublished && previewLifecycle === "published_dirty"
          ? () => void handleDraftSaveClick()
          : isPublished && previewLifecycle === "published_clean" && activeStep !== "send"
            ? () => handleSelectStep("send")
            : handleSendSelected
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

  return (
    <div data-local-draft-mode={localStorageMode}>
      <WorkspaceShell
        workspace="magazine"
        selectedBuildingId={editionId ?? `draft:${effectiveSlotSlug}`}
        selectedLabel={`${autoMeta.yearMonthLabel} 뉴스레터`}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        onRetrySave={() => {
          void handleServerSave({ saveAsDraft: !isPublished });
        }}
        primaryActionSlot={primaryActionSlot}
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
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
